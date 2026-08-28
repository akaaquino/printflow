import type { NextRequest } from "next/server";

/**
 * Extrai o token Bearer do header Authorization de uma requisição.
 * Retorna string vazia se o header estiver ausente ou mal formatado.
 */
export function obterBearer(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return authorization.slice("bearer ".length).trim();
}
