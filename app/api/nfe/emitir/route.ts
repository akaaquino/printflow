import { NextRequest, NextResponse } from "next/server";
import {
  emitirNFe,
  montarPayloadFiscal,
  validarPayloadFiscal,
} from "@/lib/nfe";
import {
  atualizarDocumento,
  buscarDocumento,
  buscarNotasPorVenda,
  salvarDocumento,
  validarIdToken,
  validarPermissaoFinanceira,
} from "@/lib/nfe/firestore-rest";
import type { NotaFiscalDocumento, NFeStatus, RetornoNFe } from "@/lib/nfe";

export const runtime = "nodejs";

function respostaErro(mensagem: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    {
      ok: false,
      erro: mensagem,
      ...extra,
    },
    { status }
  );
}

function obterBearer(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return authorization.slice("bearer ".length).trim();
}

function montarNotaDocumento({
  payload,
  retorno,
  status,
  erros = [],
  usuarioId,
  tentativasAnteriores,
}: {
  payload: ReturnType<typeof montarPayloadFiscal>;
  retorno?: RetornoNFe;
  status: NFeStatus;
  erros?: string[];
  usuarioId: string;
  tentativasAnteriores?: NotaFiscalDocumento["tentativas"];
}): NotaFiscalDocumento {
  const agora = new Date();
  const tentativaAtual = {
    status,
    mensagem: retorno?.mensagemErro || erros.join(" "),
    criadoEm: agora,
  };

  return {
    vendaId: payload.vendaId,
    orcamentoId: payload.orcamentoId,
    numeroOS: payload.numeroOS,
    clienteId: payload.clienteId,
    cliente: payload.cliente.nomeRazaoSocial,
    tipo: "NFe",
    status,
    chaveAcesso: retorno?.chaveAcesso || "",
    numeroNFe: retorno?.numeroNFe || "",
    serie: retorno?.serie || "",
    protocolo: retorno?.protocolo || "",
    xmlUrl: retorno?.xmlUrl || "",
    danfeUrl: retorno?.danfeUrl || "",
    valorTotal: payload.valorTotal,
    itens: payload.itens,
    erros,
    tenantId: usuarioId,
    criadoEm: agora,
    atualizadoEm: agora,
    emitidaEm: status === "autorizada" ? agora : null,
    mensagemErro: retorno?.mensagemErro || erros.join(" "),
    respostaOriginal: retorno?.respostaOriginal || null,
    tentativas: [...(tentativasAnteriores || []), tentativaAtual],
  };
}

export async function POST(request: NextRequest) {
  try {
    const idToken = obterBearer(request);

    if (!idToken) {
      return respostaErro("Faça login para emitir NF-e.", 401);
    }

    const usuario = await validarIdToken(idToken);
    validarPermissaoFinanceira(usuario);

    const corpo = await request.json().catch(() => ({}));
    const vendaId = String(corpo.vendaId || corpo.orcamentoId || "").trim();

    if (!vendaId) {
      return respostaErro("Venda/orçamento não informado.", 400);
    }

    const venda = (await buscarDocumento("orcamentos", vendaId, idToken)) as any;

    if (!venda) {
      return respostaErro("Venda/orçamento não encontrado.", 404);
    }

    const notasExistentes = (await buscarNotasPorVenda(
      vendaId,
      idToken,
      usuario.uid
    )) as any[];
    const notaAnterior = notasExistentes[0] as NotaFiscalDocumento | undefined;
    const notaBloqueante = notasExistentes.find((nota: any) =>
      ["autorizada", "processando"].includes(String(nota.status))
    );

    if (notaBloqueante) {
      return respostaErro(
        notaBloqueante.status === "autorizada"
          ? "Esta venda já possui NF-e autorizada."
          : "Esta venda já possui NF-e em processamento.",
        409,
        { nota: notaBloqueante }
      );
    }

    const cliente = venda.clienteId
      ? await buscarDocumento("clientes", String(venda.clienteId), idToken)
      : null;

    const payload = montarPayloadFiscal(venda, cliente || {}, corpo.dadosFiscais);

    if (payload.ambiente === "producao" && corpo.confirmarProducao !== true) {
      return respostaErro(
        "Emissão em produção exige confirmação explícita. Use homologação até a validação fiscal final.",
        403
      );
    }

    const erros = validarPayloadFiscal(payload);
    const notaId = vendaId;

    if (erros.length > 0) {
      const nota = montarNotaDocumento({
        payload,
        status: "rejeitada",
        erros,
        usuarioId: usuario.uid,
        tentativasAnteriores: notaAnterior?.tentativas,
      });

      await salvarDocumento("notasFiscais", notaId, nota, idToken);
      await atualizarDocumento(
        "orcamentos",
        vendaId,
        {
          nfeStatus: "rejeitada",
          nfeId: notaId,
          nfeEmitida: false,
          atualizadoEm: new Date(),
        },
        idToken
      );

      return respostaErro("Revise os dados fiscais obrigatórios.", 422, {
        nota,
        erros,
      });
    }

    const notaProcessando = montarNotaDocumento({
      payload,
      status: "processando",
      usuarioId: usuario.uid,
      tentativasAnteriores: notaAnterior?.tentativas,
    });

    await salvarDocumento("notasFiscais", notaId, notaProcessando, idToken);

    const retorno = await emitirNFe(payload);
    const statusFinal = retorno.status || "processando";
    const notaFinal = montarNotaDocumento({
      payload,
      retorno,
      status: statusFinal,
      erros: statusFinal === "rejeitada" ? [retorno.mensagemErro || "NF-e rejeitada."] : [],
      usuarioId: usuario.uid,
      tentativasAnteriores: notaProcessando.tentativas,
    });

    await salvarDocumento("notasFiscais", notaId, notaFinal, idToken);
    await atualizarDocumento(
      "orcamentos",
      vendaId,
      {
        nfeStatus: statusFinal,
        nfeId: notaId,
        nfeEmitida: statusFinal === "autorizada",
        atualizadoEm: new Date(),
      },
      idToken
    );

    return NextResponse.json({
      ok: true,
      nota: notaFinal,
      mensagem:
        statusFinal === "autorizada"
          ? "NF-e autorizada com sucesso."
          : "NF-e enviada para processamento fiscal.",
    });
  } catch (erro) {
    console.error("Erro ao emitir NF-e:", erro);

    return respostaErro(
      erro instanceof Error
        ? erro.message
        : "Não foi possível emitir a NF-e. Tente novamente.",
      500
    );
  }
}
