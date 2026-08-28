function obterVariavelObrigatoria(nome: string, ...valores: Array<string | undefined>) {
  const valor = valores.find((item) => !!item);

  if (!valor) {
    throw new Error(
      `Configuração do Firebase incompleta no backend: defina ${nome}. ` +
        "Veja .env.example."
    );
  }

  return valor;
}

const PROJECT_ID = obterVariavelObrigatoria(
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID ou FIREBASE_PROJECT_ID",
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  process.env.FIREBASE_PROJECT_ID
);

const FIREBASE_API_KEY = obterVariavelObrigatoria(
  "NEXT_PUBLIC_FIREBASE_API_KEY ou FIREBASE_API_KEY",
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  process.env.FIREBASE_API_KEY
);

const DATABASE = "(default)";
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents`;

function campoParaValor(valor: any): any {
  if (valor === undefined) return undefined;
  if (valor === null) return { nullValue: null };
  if (valor instanceof Date) return { timestampValue: valor.toISOString() };
  if (typeof valor === "boolean") return { booleanValue: valor };
  if (typeof valor === "number") {
    return Number.isInteger(valor)
      ? { integerValue: String(valor) }
      : { doubleValue: valor };
  }
  if (Array.isArray(valor)) {
    return {
      arrayValue: {
        values: valor.map(campoParaValor).filter(Boolean),
      },
    };
  }
  if (typeof valor === "object") {
    return {
      mapValue: {
        fields: objetoParaCampos(valor),
      },
    };
  }

  return { stringValue: String(valor) };
}

function objetoParaCampos(objeto: Record<string, any>) {
  return Object.entries(objeto).reduce<Record<string, any>>((campos, [chave, valor]) => {
    const campo = campoParaValor(valor);

    if (campo !== undefined) {
      campos[chave] = campo;
    }

    return campos;
  }, {});
}

function valorParaCampo(valor: any): any {
  if (!valor) return undefined;
  if ("nullValue" in valor) return null;
  if ("stringValue" in valor) return valor.stringValue;
  if ("booleanValue" in valor) return valor.booleanValue;
  if ("integerValue" in valor) return Number(valor.integerValue);
  if ("doubleValue" in valor) return Number(valor.doubleValue);
  if ("timestampValue" in valor) return valor.timestampValue;
  if ("arrayValue" in valor) {
    return (valor.arrayValue.values || []).map(valorParaCampo);
  }
  if ("mapValue" in valor) {
    return camposParaObjeto(valor.mapValue.fields || {});
  }

  return undefined;
}

function camposParaObjeto(campos: Record<string, any>) {
  return Object.entries(campos || {}).reduce<Record<string, any>>(
    (objeto, [chave, valor]) => {
      objeto[chave] = valorParaCampo(valor);
      return objeto;
    },
    {}
  );
}

function headers(idToken: string) {
  return {
    Authorization: `Bearer ${idToken}`,
    "Content-Type": "application/json",
  };
}

function nomeDocumentoParaId(nome: string) {
  return nome.split("/").pop() || "";
}

export function documentoRestParaObjeto(documento: any) {
  if (!documento?.fields) return null;

  return {
    id: nomeDocumentoParaId(documento.name || ""),
    ...camposParaObjeto(documento.fields),
  };
}

export async function validarIdToken(idToken: string) {
  const resposta = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );

  const dados = await resposta.json().catch(() => ({}));

  if (!resposta.ok || !dados?.users?.[0]) {
    throw new Error("Usuário não autenticado ou sessão expirada.");
  }

  const usuario = dados.users[0];
  let claims: Record<string, any> = {};

  try {
    claims = usuario.customAttributes ? JSON.parse(usuario.customAttributes) : {};
  } catch {
    claims = {};
  }

  return {
    uid: usuario.localId as string,
    email: usuario.email as string | undefined,
    claims,
  };
}

export function validarPermissaoFinanceira(usuario: {
  claims: Record<string, any>;
}) {
  const claims = usuario.claims || {};
  const roles = [
    claims.role,
    claims.perfil,
    claims.cargo,
    ...(Array.isArray(claims.roles) ? claims.roles : []),
    ...(Array.isArray(claims.permissoes) ? claims.permissoes : []),
  ]
    .filter(Boolean)
    .map((role) => String(role).toLowerCase());

  const autorizado =
    claims.admin === true ||
    claims.financeiro === true ||
    roles.some((role) =>
      ["admin", "financeiro", "financial", "owner", "proprietario"].includes(role)
    );

  if (autorizado) {
    return;
  }

  // Fail-closed: por padrão, TODA emissão de NF-e exige papel financeiro/admin.
  // A verificação só pode ser desativada explicitamente via
  // NFE_SKIP_ROLE_CHECK=true, e mesmo assim nunca em produção — evita que uma
  // variável de ambiente ausente ou mal configurada libere emissão fiscal
  // para qualquer usuário autenticado.
  const skipCheck =
    process.env.NFE_SKIP_ROLE_CHECK === "true" &&
    process.env.NODE_ENV !== "production";

  if (skipCheck) {
    return;
  }

  throw new Error("Usuário sem permissão financeira/admin para emitir NF-e.");
}

export async function buscarDocumento(
  colecao: string,
  id: string,
  idToken: string
) {
  const resposta = await fetch(
    `${BASE_URL}/${encodeURIComponent(colecao)}/${encodeURIComponent(id)}`,
    { headers: headers(idToken) }
  );

  if (resposta.status === 404) return null;

  const dados = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    throw new Error(dados?.error?.message || "Erro ao buscar dados no Firestore.");
  }

  return documentoRestParaObjeto(dados);
}

export async function salvarDocumento(
  colecao: string,
  id: string,
  dados: Record<string, any>,
  idToken: string
) {
  const resposta = await fetch(
    `${BASE_URL}/${encodeURIComponent(colecao)}/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: headers(idToken),
      body: JSON.stringify({
        fields: objetoParaCampos(dados),
      }),
    }
  );

  const retorno = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    throw new Error(retorno?.error?.message || "Erro ao salvar dados no Firestore.");
  }

  return documentoRestParaObjeto(retorno);
}

export async function atualizarDocumento(
  colecao: string,
  id: string,
  dados: Record<string, any>,
  idToken: string
) {
  const campos = Object.keys(dados);
  const updateMask = campos
    .map((campo) => `updateMask.fieldPaths=${encodeURIComponent(campo)}`)
    .join("&");

  const resposta = await fetch(
    `${BASE_URL}/${encodeURIComponent(colecao)}/${encodeURIComponent(id)}?${updateMask}`,
    {
      method: "PATCH",
      headers: headers(idToken),
      body: JSON.stringify({
        fields: objetoParaCampos(dados),
      }),
    }
  );

  const retorno = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    throw new Error(retorno?.error?.message || "Erro ao atualizar dados no Firestore.");
  }

  return documentoRestParaObjeto(retorno);
}

export async function buscarNotasPorVenda(
  vendaId: string,
  idToken: string,
  tenantId: string
) {
  const resposta = await fetch(`${BASE_URL}:runQuery`, {
    method: "POST",
    headers: headers(idToken),
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "notasFiscais" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: "tenantId" },
                  op: "EQUAL",
                  value: { stringValue: tenantId },
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath: "vendaId" },
                  op: "EQUAL",
                  value: { stringValue: vendaId },
                },
              },
            ],
          },
        },
        limit: 10,
      },
    }),
  });

  const dados = await resposta.json().catch(() => []);

  if (!resposta.ok) {
    throw new Error(dados?.error?.message || "Erro ao consultar notas fiscais.");
  }

  return (Array.isArray(dados) ? dados : [])
    .map((item) => documentoRestParaObjeto(item.document))
    .filter(Boolean);
}
