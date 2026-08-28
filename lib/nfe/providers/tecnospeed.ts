import type { PayloadNFe, RetornoNFe } from "../types";

export async function emitirNFeTecnoSpeed(payload: PayloadNFe): Promise<RetornoNFe> {
  const token = process.env.NFE_API_TOKEN;
  const baseUrl = process.env.NFE_API_BASE_URL;

  if (!token || !baseUrl) {
    return {
      status: "processando",
      mensagemErro:
        "Adapter TecnoSpeed preparado. Configure NFE_API_TOKEN e NFE_API_BASE_URL para envio real.",
    };
  }

  const resposta = await fetch(`${baseUrl.replace(/\/$/, "")}/nfe`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const dados = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    return {
      status: "rejeitada",
      mensagemErro:
        dados?.mensagem || dados?.erro || "A TecnoSpeed recusou a emissão.",
      respostaOriginal: dados,
    };
  }

  return {
    status: dados?.status === "AUTORIZADA" ? "autorizada" : "processando",
    chaveAcesso: dados?.chaveAcesso || dados?.chave,
    numeroNFe: dados?.numero || dados?.numeroNFe,
    serie: dados?.serie,
    protocolo: dados?.protocolo,
    xmlUrl: dados?.xmlUrl,
    danfeUrl: dados?.danfeUrl,
    respostaOriginal: dados,
  };
}
