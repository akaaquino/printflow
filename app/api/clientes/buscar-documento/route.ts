import { NextRequest, NextResponse } from "next/server";
import { buscarCNPJ } from "@/lib/api/brasilapi";
import {
  identificarTipoDocumento,
  limparDocumento,
  validarCPF,
} from "@/lib/validadores/documentos";
import { obterBearer } from "@/lib/api/auth-token";
import { validarIdToken } from "@/lib/nfe/firestore-rest";
import { verificarRateLimit } from "@/lib/api/rate-limit";

const LIMITE_REQUISICOES = 20;
const JANELA_MS = 60_000;

export async function POST(request: NextRequest) {
  try {
    const idToken = obterBearer(request);

    if (!idToken) {
      return NextResponse.json(
        { erro: "Faça login para consultar documentos." },
        { status: 401 }
      );
    }

    let usuario: { uid: string };

    try {
      usuario = await validarIdToken(idToken);
    } catch {
      return NextResponse.json(
        { erro: "Sessão expirada. Faça login novamente." },
        { status: 401 }
      );
    }

    const limite = verificarRateLimit(
      `buscar-documento:${usuario.uid}`,
      LIMITE_REQUISICOES,
      JANELA_MS
    );

    if (!limite.permitido) {
      return NextResponse.json(
        { erro: "Muitas consultas em pouco tempo. Tente novamente em breve." },
        { status: 429 }
      );
    }

    const corpo = await request.json().catch(() => ({}));
    const documento = limparDocumento(corpo?.documento);
    const tipoDocumento = identificarTipoDocumento(documento);

    if (!tipoDocumento) {
      return NextResponse.json(
        { erro: "Documento inválido." },
        { status: 400 }
      );
    }

    if (tipoDocumento === "CPF") {
      if (!validarCPF(documento)) {
        return NextResponse.json(
          { erro: "Documento inválido." },
          { status: 400 }
        );
      }

      return NextResponse.json({
        tipoDocumento,
        documento,
        mensagem: "CPF validado. Preencha os dados do cliente manualmente.",
      });
    }

    const dados = await buscarCNPJ(documento);

    return NextResponse.json({
      tipoDocumento,
      documento,
      dados,
    });
  } catch (erro) {
    const mensagem =
      erro instanceof Error
        ? erro.message
        : "Não foi possível consultar agora. Preencha manualmente.";
    const status = mensagem.includes("não encontrado") ? 404 : 400;

    return NextResponse.json({ erro: mensagem }, { status });
  }
}
