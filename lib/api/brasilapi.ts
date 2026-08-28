import { limparCEP, limparDocumento, validarCNPJ } from "@/lib/validadores/documentos";

export type DadosCnpjNormalizados = {
  nome: string;
  nomeFantasia: string;
  telefone: string;
  email: string;
  cep: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  situacao: string;
};

type RespostaBrasilApiCnpj = {
  razao_social?: string;
  nome_fantasia?: string;
  ddd_telefone_1?: string;
  email?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  descricao_situacao_cadastral?: string;
};

export async function buscarCNPJ(cnpjInformado: unknown): Promise<DadosCnpjNormalizados> {
  const cnpj = limparDocumento(cnpjInformado);

  if (!validarCNPJ(cnpj)) {
    throw new Error("Documento inválido.");
  }

  const resposta = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    cache: "no-store",
  });

  if (resposta.status === 404) {
    throw new Error("CNPJ não encontrado.");
  }

  if (!resposta.ok) {
    throw new Error("Não foi possível consultar agora. Preencha manualmente.");
  }

  const dados = (await resposta.json()) as RespostaBrasilApiCnpj;

  return {
    nome: dados.razao_social || "",
    nomeFantasia: dados.nome_fantasia || "",
    telefone: dados.ddd_telefone_1 || "",
    email: dados.email || "",
    cep: limparCEP(dados.cep),
    endereco: dados.logradouro || "",
    numero: dados.numero || "",
    bairro: dados.bairro || "",
    cidade: dados.municipio || "",
    uf: dados.uf || "",
    situacao: dados.descricao_situacao_cadastral || "",
  };
}
