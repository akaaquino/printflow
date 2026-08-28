import type { PayloadNFe, RetornoNFe } from "../types";

export async function emitirNFeWebmania(payload: PayloadNFe): Promise<RetornoNFe> {
  const token = process.env.NFE_API_TOKEN;
  const baseUrl = process.env.NFE_API_BASE_URL;

  if (!token || !baseUrl) {
    return {
      status: "processando",
      mensagemErro:
        "Adapter Webmania preparado. Configure NFE_API_TOKEN e NFE_API_BASE_URL para envio real.",
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
        dados?.error || dados?.mensagem || "A Webmania recusou a emissão.",
      respostaOriginal: dados,
    };
  }

  return {
    status: dados?.status === "aprovado" ? "autorizada" : "processando",
    chaveAcesso: dados?.chave || dados?.chaveAcesso,
    numeroNFe: dados?.nfe || dados?.numeroNFe,
    serie: dados?.serie,
    protocolo: dados?.protocolo,
    xmlUrl: dados?.xml,
    danfeUrl: dados?.danfe,
    respostaOriginal: dados,
  };
}
