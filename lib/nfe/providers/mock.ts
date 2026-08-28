import type { PayloadNFe, RetornoNFe } from "../types";

export async function emitirNFeMock(payload: PayloadNFe): Promise<RetornoNFe> {
  await new Promise((resolve) => setTimeout(resolve, 350));

  return {
    status: "processando",
    serie: "HML",
    protocolo: `mock-${Date.now()}`,
    mensagemErro:
      "Emissão em modo estruturado/homologação. Configure NFE_API_TOKEN e o provedor fiscal para emissão real.",
    respostaOriginal: {
      provider: "mock",
      ambiente: payload.ambiente,
      referencia: payload.referencia,
    },
  };
}
