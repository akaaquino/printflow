/**
 * Rate limiter simples em memória (janela fixa por chave).
 *
 * Limitação conhecida: em ambientes serverless com múltiplas instâncias
 * (ex.: Vercel), cada instância mantém seu próprio contador em memória, então
 * o limite real efetivo pode ser N vezes o configurado, e o estado é perdido
 * a cada cold start. Isso ainda assim eleva consideravelmente o custo de
 * abuso comparado a nenhum limite, e é adequado para reduzir uso indevido
 * como proxy anônimo para APIs de terceiros. Para um limite rígido e
 * consistente entre instâncias, migrar para um armazenamento compartilhado
 * (ex.: Redis/Upstash) quando o volume justificar.
 */

type Registro = {
  contagem: number;
  inicioJanelaMs: number;
};

const registros = new Map<string, Registro>();

// Evita crescimento ilimitado do Map em processos de longa duração.
const MAX_CHAVES_RASTREADAS = 5000;

export type ResultadoRateLimit = {
  permitido: boolean;
  restante: number;
  resetEmMs: number;
};

export function verificarRateLimit(
  chave: string,
  limite: number,
  janelaMs: number
): ResultadoRateLimit {
  const agora = Date.now();
  const registroAtual = registros.get(chave);

  if (!registroAtual || agora - registroAtual.inicioJanelaMs >= janelaMs) {
    if (registros.size >= MAX_CHAVES_RASTREADAS) {
      registros.clear();
    }

    registros.set(chave, { contagem: 1, inicioJanelaMs: agora });

    return { permitido: true, restante: limite - 1, resetEmMs: agora + janelaMs };
  }

  if (registroAtual.contagem >= limite) {
    return {
      permitido: false,
      restante: 0,
      resetEmMs: registroAtual.inicioJanelaMs + janelaMs,
    };
  }

  registroAtual.contagem += 1;

  return {
    permitido: true,
    restante: limite - registroAtual.contagem,
    resetEmMs: registroAtual.inicioJanelaMs + janelaMs,
  };
}

export function obterIpRequisicao(request: Request) {
  const encaminhadoPor = request.headers.get("x-forwarded-for");

  if (encaminhadoPor) {
    return encaminhadoPor.split(",")[0].trim();
  }

  return request.headers.get("x-real-ip") || "desconhecido";
}
