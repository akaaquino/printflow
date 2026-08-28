import type { PayloadNFe, RetornoNFe } from "../types";

export async function emitirNFeNFEio(payload: PayloadNFe): Promise<RetornoNFe> {
  const token = process.env.NFE_API_TOKEN;
  const baseUrl = process.env.NFE_API_BASE_URL;

  if (!token || !baseUrl) {
    return {
      status: "processando",
      mensagemErro:
        "Adapter NFE.io preparado. Configure NFE_API_TOKEN e NFE_API_BASE_URL para envio real.",
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
        dados?.message || dados?.erro || "A NFE.io recusou a emissão.",
      respostaOriginal: dados,
    };
  }

  return {
    status: dados?.status === "authorized" ? "autorizada" : "processando",
    chaveAcesso: dados?.accessKey || dados?.chaveAcesso,
    numeroNFe: dados?.number || dados?.numeroNFe,
    serie: dados?.series || dados?.serie,
    protocolo: dados?.protocol || dados?.protocolo,
    xmlUrl: dados?.xmlUrl,
    danfeUrl: dados?.danfeUrl,
    respostaOriginal: dados,
  };
}
