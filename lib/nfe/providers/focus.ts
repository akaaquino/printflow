import type { PayloadNFe, RetornoNFe } from "../types";

function montarPayloadFocus(payload: PayloadNFe) {
  return {
    natureza_operacao: "Venda de mercadoria/serviço",
    data_emissao: new Date().toISOString(),
    tipo_documento: 1,
    local_destino: 1,
    finalidade_emissao: 1,
    consumidor_final: 1,
    presenca_comprador: 1,
    cliente: {
      nome: payload.cliente.nomeRazaoSocial,
      cpf_cnpj: payload.cliente.cpfCnpj,
      inscricao_estadual: payload.cliente.inscricaoEstadual,
      email: payload.cliente.email,
      telefone: payload.cliente.telefone,
      endereco: payload.cliente.endereco.logradouro,
      numero: payload.cliente.endereco.numero,
      complemento: payload.cliente.endereco.complemento,
      bairro: payload.cliente.endereco.bairro,
      municipio: payload.cliente.endereco.cidade,
      uf: payload.cliente.endereco.uf,
      cep: payload.cliente.endereco.cep,
    },
    itens: payload.itens.map((item, index) => ({
      numero_item: index + 1,
      codigo_produto: item.id || `item-${index + 1}`,
      descricao: item.descricao,
      cfop: item.cfop,
      unidade_comercial: item.unidade,
      quantidade_comercial: item.quantidade,
      valor_unitario_comercial: item.valorUnitario,
      valor_total_bruto: item.valorTotal,
      unidade_tributavel: item.unidade,
      quantidade_tributavel: item.quantidade,
      valor_unitario_tributavel: item.valorUnitario,
      ncm: item.ncm,
      icms_situacao_tributaria: item.impostos?.cst || item.impostos?.csosn,
      icms_aliquota: item.impostos?.aliquotaICMS,
    })),
    valor_total: payload.valorTotal,
    informacoes_adicionais_contribuinte: payload.observacoes,
  };
}

export async function emitirNFeFocus(payload: PayloadNFe): Promise<RetornoNFe> {
  const token = process.env.NFE_API_TOKEN;
  const baseUrl = process.env.NFE_API_BASE_URL || "https://api.focusnfe.com.br";

  if (!token) {
    return {
      status: "processando",
      mensagemErro: "Token Focus NFe não configurado. Emissão real não enviada.",
    };
  }

  const resposta = await fetch(
    `${baseUrl.replace(/\/$/, "")}/v2/nfe?ref=${encodeURIComponent(payload.referencia)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(montarPayloadFocus(payload)),
    }
  );

  const dados = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    return {
      status: "rejeitada",
      mensagemErro:
        dados?.mensagem ||
        dados?.erro ||
        "A API fiscal recusou a emissão da NF-e.",
      respostaOriginal: dados,
    };
  }

  return {
    status:
      dados?.status === "autorizado" || dados?.status === "autorizada"
        ? "autorizada"
        : "processando",
    chaveAcesso: dados?.chave_nfe || dados?.chaveAcesso,
    numeroNFe: dados?.numero || dados?.numeroNFe,
    serie: dados?.serie,
    protocolo: dados?.protocolo,
    xmlUrl: dados?.caminho_xml_nota_fiscal || dados?.xmlUrl,
    danfeUrl: dados?.caminho_danfe || dados?.danfeUrl,
    respostaOriginal: dados,
  };
}
