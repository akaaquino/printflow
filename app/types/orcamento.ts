import { FinanceiroOS } from "./financeiro";

export type StatusOrcamento =
  | "Em aprovação"
  | "Aprovado"
  | "Reprovado"
  | "Cancelado";

export interface ItemOrcamento {
  servico: string;
  largura: number;
  altura: number;
  area: number;
  medida: string;
  precoM2: number;
  subtotal: number;
}

export interface Orcamento {
  id?: string;
  numeroOS: string;
  clienteId?: string;
  cliente: string;
  itens: ItemOrcamento[];
  valorTotal: number;
  status: StatusOrcamento;
  precisaInstalacao: boolean;
  responsavelInstalacao?: string;
  endereco?: string;
  data?: string;
  horario?: string;
  observacoes?: string;
  financeiro?: FinanceiroOS;
  criadoEm?: any;
  atualizadoEm?: any;
}