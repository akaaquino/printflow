import { emitirNFeFocus } from "./providers/focus";
import { emitirNFeMock } from "./providers/mock";
import { emitirNFeNFEio } from "./providers/nfeio";
import { emitirNFeTecnoSpeed } from "./providers/tecnospeed";
import { emitirNFeWebmania } from "./providers/webmania";
import type { NFeProvider, PayloadNFe, RetornoNFe } from "./types";

export {
  montarClienteFiscal,
  montarItensFiscais,
  montarPayloadFiscal,
  parseNumero,
  validarPayloadFiscal,
} from "./normalizar";

export type {
  ClienteFiscal,
  EnderecoFiscal,
  ImpostosFiscais,
  ItemFiscal,
  NFeProvider,
  NFeStatus,
  NotaFiscalDocumento,
  PayloadNFe,
  RetornoNFe,
} from "./types";

function getProvider(): NFeProvider {
  const provider = String(process.env.NFE_PROVIDER || "mock").toLowerCase();

  if (provider === "focus" || provider === "focusnfe") return "focusnfe";
  if (provider === "nfeio" || provider === "nfe.io") return "nfeio";
  if (provider === "webmania") return "webmania";
  if (provider === "tecnospeed") return "tecnospeed";

  return "mock";
}

export async function emitirNFe(payload: PayloadNFe): Promise<RetornoNFe> {
  const provider = getProvider();

  if (!process.env.NFE_API_TOKEN || provider === "mock") {
    return emitirNFeMock(payload);
  }

  if (provider === "focusnfe") return emitirNFeFocus(payload);
  if (provider === "nfeio") return emitirNFeNFEio(payload);
  if (provider === "webmania") return emitirNFeWebmania(payload);
  if (provider === "tecnospeed") return emitirNFeTecnoSpeed(payload);

  return emitirNFeMock(payload);
}
