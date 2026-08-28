import type { FinanceiroOS } from "./financeiro";

export type StatusItemProducao =
  | "Fila"
  | "Imprimindo"
  | "Acabamento"
  | "Pronto"
  | "Instalação"
  | "Entregue"
  | "Problema";

export type StatusOSProducao =
  | "Fila"
  | "Em Produção"
  | "Acabamento"
  | "Pronta"
  | "Instalação"
  | "Finalizada"
  | "Problema";

export type PrioridadeProducao = "Normal" | "Alta" | "Urgente";
export type CronometroStatusProducao =
  | "parado"
  | "rodando"
  | "pausado"
  | "finalizado";

export type MaquinaProducao =
  | "UV"
  | "Solvente"
  | "Eco"
  | "Recorte"
  | "Laser"
  | "Router"
  | "Sublimação"
  | "DTF"
  | "Outro";

export type DataFirestoreLike =
  | Date
  | string
  | number
  | {
      seconds?: number;
      toDate?: () => Date;
    }
  | null;

export interface ChecklistItemProducao {
  conferido: boolean;
  impressaoOk: boolean;
  acabamentoOk: boolean;
  prontoParaEntrega: boolean;
}

export interface ItemProducao {
  id: string;
  materialId?: string;
  material: string;
  servico?: string;
  largura: string;
  altura: string;
  medida: string;
  area: number;
  areaM2?: number;
  quantidade: number;
  cor?: string;
  acabamento: string;
  status: StatusItemProducao;
  operador: string;
  maquina: MaquinaProducao | "";
  impressoraId?: string;
  impressoraNome?: string;
  velocidadeM2Hora?: number;
  larguraMaximaM?: number;
  tempoSetupMin?: number;
  tempoEstimadoMin?: number;
  impressoraSelecionadaEm?: DataFirestoreLike;
  observacoes: string;
  iniciadoEm: DataFirestoreLike;
  finalizadoEm: DataFirestoreLike;
  statusAtualizadoEm: DataFirestoreLike;
  statusUpdatedAt?: DataFirestoreLike;
  conferido: boolean;
  checklist: ChecklistItemProducao;
}

export interface HistoricoProducao {
  tipo: "os" | "item" | "estoque" | "instalacao" | "sistema";
  itemId?: string;
  itemMaterial?: string;
  statusAnterior?: string;
  statusNovo?: string;
  acao: string;
  operador?: string;
  maquina?: string;
  observacao?: string;
  usuarioId?: string;
  data: DataFirestoreLike;
  createdAt?: DataFirestoreLike;
}

export interface ProducaoIndustrial {
  id: string;
  tenantId?: string;
  numeroOS: string;
  clienteId?: string;
  cliente: string;
  servico: string;
  material: string;
  materialPrincipal?: string;
  medida: string;
  area: number;
  metragemTotal?: number;
  prioridade: PrioridadeProducao;
  status: StatusOSProducao;
  etapa?: StatusOSProducao;
  prazo?: string;
  observacoes: string;
  responsavel?: string;
  operador?: string;
  maquina?: string;
  impressoraId?: string;
  impressoraNome?: string;
  velocidadeM2Hora?: number;
  larguraMaximaM?: number;
  tempoSetupMin?: number;
  tempoEstimadoMin?: number;
  impressoraSelecionadaEm?: DataFirestoreLike;
  cronometroStatus?: CronometroStatusProducao;
  iniciadoEm?: DataFirestoreLike;
  pausadoEm?: DataFirestoreLike;
  tempoAcumuladoSegundos?: number;
  tempoRealSegundos?: number;
  itens: ItemProducao[];
  arquivos?: Array<{
    nome?: string;
    url?: string;
    tamanho?: number;
    tipo?: string;
  }>;
  mockups?: ProducaoIndustrial["arquivos"];
  historico: HistoricoProducao[];
  financeiro?: FinanceiroOS | null;
  margemPrevista?: number;
  origem?: string;
  arteId?: string;
  orcamentoId?: string;
  estoqueBaixado?: boolean;
  estoqueBaixadoEm?: DataFirestoreLike;
  instalacaoCriada?: boolean;
  precisaInstalacao?: boolean;
  enderecoInstalacao?: string;
  finalizado?: boolean;
  criadoEm?: DataFirestoreLike;
  atualizadoEm?: DataFirestoreLike;
  statusAtualizadoEm?: DataFirestoreLike;
  createdAt?: DataFirestoreLike;
  updatedAt?: DataFirestoreLike;
  statusUpdatedAt?: DataFirestoreLike;
  finalizadoEm?: DataFirestoreLike;
}

export const STATUS_ITENS_PRODUCAO: StatusItemProducao[] = [
  "Fila",
  "Imprimindo",
  "Acabamento",
  "Pronto",
  "Instalação",
  "Entregue",
  "Problema",
];

export const STATUS_OS_PRODUCAO: StatusOSProducao[] = [
  "Fila",
  "Em Produção",
  "Acabamento",
  "Pronta",
  "Instalação",
  "Finalizada",
  "Problema",
];

export const PRIORIDADES_PRODUCAO: PrioridadeProducao[] = [
  "Normal",
  "Alta",
  "Urgente",
];

export const MAQUINAS_PRODUCAO: MaquinaProducao[] = [
  "UV",
  "Solvente",
  "Eco",
  "Recorte",
  "Laser",
  "Router",
  "Sublimação",
  "DTF",
  "Outro",
];
