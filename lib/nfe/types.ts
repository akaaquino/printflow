export type NFeProvider = "mock" | "focusnfe" | "nfeio" | "webmania" | "tecnospeed";

export type NFeStatus =
  | "rascunho"
  | "processando"
  | "autorizada"
  | "rejeitada"
  | "cancelada";

export interface EnderecoFiscal {
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
}

export interface ClienteFiscal {
  nomeRazaoSocial: string;
  cpfCnpj: string;
  inscricaoEstadual?: string;
  email?: string;
  telefone?: string;
  endereco: EnderecoFiscal;
}

export interface ImpostosFiscais {
  cst?: string;
  csosn?: string;
  aliquotaICMS?: number;
  aliquotaIPI?: number;
  aliquotaPIS?: number;
  aliquotaCOFINS?: number;
}

export interface ItemFiscal {
  id?: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  impostos?: ImpostosFiscais;
}

export interface PayloadNFe {
  referencia: string;
  ambiente: "homologacao" | "producao";
  vendaId: string;
  orcamentoId: string;
  numeroOS: string;
  clienteId?: string;
  cliente: ClienteFiscal;
  itens: ItemFiscal[];
  valorTotal: number;
  observacoes?: string;
}

export interface RetornoNFe {
  status: NFeStatus;
  chaveAcesso?: string;
  numeroNFe?: string;
  serie?: string;
  protocolo?: string;
  xmlUrl?: string;
  danfeUrl?: string;
  mensagemErro?: string;
  respostaOriginal?: unknown;
}

export interface NotaFiscalDocumento extends RetornoNFe {
  vendaId: string;
  orcamentoId: string;
  numeroOS: string;
  clienteId?: string;
  cliente: string;
  tipo: "NFe";
  valorTotal: number;
  itens: ItemFiscal[];
  erros: string[];
  tenantId?: string;
  criadoEm: Date;
  atualizadoEm: Date;
  emitidaEm?: Date | null;
  tentativas?: Array<{
    status: NFeStatus;
    mensagem?: string;
    criadoEm: Date;
  }>;
}
