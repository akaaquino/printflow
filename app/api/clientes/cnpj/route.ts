import { NextRequest, NextResponse } from "next/server";
import {
  limparCEP,
  limparDocumento,
  validarCNPJ,
} from "@/lib/validadores/documentos";
import { obterBearer } from "@/lib/api/auth-token";
import { validarIdToken } from "@/lib/nfe/firestore-rest";
import { verificarRateLimit } from "@/lib/api/rate-limit";

const LIMITE_REQUISICOES = 20;
const JANELA_MS = 60_000;

type DadosCnpjNormalizados = {
  nome: string;
  razaoSocial: string;
  nomeFantasia: string;
  cpfCnpj: string;
  cnpj: string;
  situacaoCadastral: string;
  situacao: string;
  dataAbertura: string;
  cnaePrincipal: string;
  telefone: string;
  email: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  origemConsulta: string;
};

type BrasilApiCnpj = {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  data_inicio_atividade?: string;
  cnae_fiscal?: number | string;
  cnae_fiscal_descricao?: string;
  ddd_telefone_1?: string;
  ddd_telefone_2?: string;
  email?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
};

type OpenCnpj = {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  situacao_cadastral?: string;
  data_inicio_atividade?: string;
  cnae_principal?: string;
  cnae_fiscal_descricao?: string;
  tipo_logradouro?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
  uf?: string;
  municipio?: string;
  email?: string;
  telefones?: Array<{
    ddd?: string;
    numero?: string;
    is_fax?: boolean;
  }>;
};

type Cnpja = {
  taxId?: string;
  alias?: string;
  founded?: string;
  company?: {
    name?: string;
  };
  status?: {
    text?: string;
  };
  address?: {
    street?: string;
    number?: string;
    details?: string;
    district?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  mainActivity?: {
    id?: number | string;
    text?: string;
  };
  phones?: Array<{
    area?: string;
    number?: string;
  }>;
  emails?: Array<{
    address?: string;
  }>;
};

type ProvedorCnpj = {
  nome: string;
  url: (cnpj: string) => string;
  normalizar: (dados: unknown, cnpj: string) => DadosCnpjNormalizados | null;
};

function texto(valor: unknown) {
  return String(valor || "").trim();
}

function situacaoNormalizada(valor: unknown) {
  return texto(valor).toUpperCase();
}

function juntarTelefone(ddd?: unknown, numero?: unknown) {
  const partes = [texto(ddd), texto(numero)].filter(Boolean);

  return partes.join(" ");
}

function temDadosMinimos(dados: DadosCnpjNormalizados | null) {
  return Boolean(dados?.razaoSocial || dados?.nome || dados?.nomeFantasia);
}

function normalizarBrasilApi(
  dadosBrutos: unknown,
  cnpj: string
): DadosCnpjNormalizados | null {
  const dados = dadosBrutos as BrasilApiCnpj;
  const razaoSocial = texto(dados.razao_social);
  const cnaePrincipal =
    texto(dados.cnae_fiscal_descricao) || texto(dados.cnae_fiscal);

  return {
    nome: razaoSocial,
    razaoSocial,
    nomeFantasia: texto(dados.nome_fantasia),
    cpfCnpj: cnpj,
    cnpj: limparDocumento(dados.cnpj || cnpj),
    situacaoCadastral: situacaoNormalizada(dados.descricao_situacao_cadastral),
    situacao: situacaoNormalizada(dados.descricao_situacao_cadastral),
    dataAbertura: texto(dados.data_inicio_atividade),
    cnaePrincipal,
    telefone: texto(dados.ddd_telefone_1 || dados.ddd_telefone_2),
    email: texto(dados.email),
    cep: limparCEP(dados.cep),
    endereco: texto(dados.logradouro),
    numero: texto(dados.numero),
    complemento: texto(dados.complemento),
    bairro: texto(dados.bairro),
    cidade: texto(dados.municipio),
    uf: texto(dados.uf).toUpperCase(),
    origemConsulta: "BrasilAPI",
  };
}

function normalizarOpenCnpj(
  dadosBrutos: unknown,
  cnpj: string
): DadosCnpjNormalizados | null {
  const dados = dadosBrutos as OpenCnpj;
  const razaoSocial = texto(dados.razao_social);
  const telefone = dados.telefones?.find((item) => !item.is_fax);
  const logradouro = [texto(dados.tipo_logradouro), texto(dados.logradouro)]
    .filter(Boolean)
    .join(" ");

  return {
    nome: razaoSocial,
    razaoSocial,
    nomeFantasia: texto(dados.nome_fantasia),
    cpfCnpj: cnpj,
    cnpj: limparDocumento(dados.cnpj || cnpj),
    situacaoCadastral: situacaoNormalizada(dados.situacao_cadastral),
    situacao: situacaoNormalizada(dados.situacao_cadastral),
    dataAbertura: texto(dados.data_inicio_atividade),
    cnaePrincipal: texto(dados.cnae_fiscal_descricao) || texto(dados.cnae_principal),
    telefone: juntarTelefone(telefone?.ddd, telefone?.numero),
    email: texto(dados.email),
    cep: limparCEP(dados.cep),
    endereco: logradouro,
    numero: texto(dados.numero),
    complemento: texto(dados.complemento),
    bairro: texto(dados.bairro),
    cidade: texto(dados.municipio),
    uf: texto(dados.uf).toUpperCase(),
    origemConsulta: "OpenCNPJ",
  };
}

function normalizarCnpja(
  dadosBrutos: unknown,
  cnpj: string
): DadosCnpjNormalizados | null {
  const dados = dadosBrutos as Cnpja;
  const razaoSocial = texto(dados.company?.name);
  const telefone = dados.phones?.[0];
  const email = dados.emails?.[0];

  return {
    nome: razaoSocial,
    razaoSocial,
    nomeFantasia: texto(dados.alias),
    cpfCnpj: cnpj,
    cnpj: limparDocumento(dados.taxId || cnpj),
    situacaoCadastral: situacaoNormalizada(dados.status?.text),
    situacao: situacaoNormalizada(dados.status?.text),
    dataAbertura: texto(dados.founded),
    cnaePrincipal:
      texto(dados.mainActivity?.text) || texto(dados.mainActivity?.id),
    telefone: juntarTelefone(telefone?.area, telefone?.number),
    email: texto(email?.address),
    cep: limparCEP(dados.address?.zip),
    endereco: texto(dados.address?.street),
    numero: texto(dados.address?.number),
    complemento: texto(dados.address?.details),
    bairro: texto(dados.address?.district),
    cidade: texto(dados.address?.city),
    uf: texto(dados.address?.state).toUpperCase(),
    origemConsulta: "CNPJá pública",
  };
}

const PROVEDORES_CNPJ: ProvedorCnpj[] = [
  {
    nome: "BrasilAPI",
    url: (cnpj) => `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
    normalizar: normalizarBrasilApi,
  },
  {
    nome: "OpenCNPJ",
    url: (cnpj) => `https://api.opencnpj.org/${cnpj}`,
    normalizar: normalizarOpenCnpj,
  },
  {
    nome: "CNPJá pública",
    url: (cnpj) => `https://open.cnpja.com/office/${cnpj}`,
    normalizar: normalizarCnpja,
  },
];

async function consultarProvedor(provedor: ProvedorCnpj, cnpj: string) {
  try {
    const resposta = await fetch(provedor.url(cnpj), {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!resposta.ok) {
      return null;
    }

    const dadosBrutos = await resposta.json();
    const dadosNormalizados = provedor.normalizar(dadosBrutos, cnpj);

    if (!temDadosMinimos(dadosNormalizados)) {
      return null;
    }

    return {
      provedor: provedor.nome,
      dadosBrutos,
      dadosNormalizados,
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const idToken = obterBearer(request);

  if (!idToken) {
    return NextResponse.json(
      { ok: false, erro: "Faça login para consultar dados de CNPJ." },
      { status: 401 }
    );
  }

  let usuario: { uid: string };

  try {
    usuario = await validarIdToken(idToken);
  } catch {
    return NextResponse.json(
      { ok: false, erro: "Sessão expirada. Faça login novamente." },
      { status: 401 }
    );
  }

  const chaveLimite = `cnpj:${usuario.uid}`;
  const limite = verificarRateLimit(chaveLimite, LIMITE_REQUISICOES, JANELA_MS);

  if (!limite.permitido) {
    return NextResponse.json(
      { ok: false, erro: "Muitas consultas em pouco tempo. Tente novamente em breve." },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(request.url);
  const cnpjLimpo = limparDocumento(searchParams.get("cnpj"));

  if (cnpjLimpo.length !== 14 || !validarCNPJ(cnpjLimpo)) {
    return NextResponse.json({
      ok: false,
      erro: "Documento inválido.",
    });
  }

  for (const provedor of PROVEDORES_CNPJ) {
    const resultado = await consultarProvedor(provedor, cnpjLimpo);

    if (resultado) {
      return NextResponse.json({
        ok: true,
        origem: resultado.provedor,
        dados: resultado.dadosNormalizados,
        respostaOriginal: resultado.dadosBrutos,
      });
    }
  }

  return NextResponse.json({
    ok: false,
    erro: "Não foi possível consultar agora. Preencha manualmente.",
  });
}
