export type StatusFinanceiro =
  | "Aguardando pagamento"
  | "Entrada paga"
  | "Parcialmente pago"
  | "Pago"
  | "Em atraso"
  | "Cancelado";

export interface FinanceiroOS {
  valorVenda: number;
  custoPrevisto: number;
  custoReal: number;
  lucroPrevisto: number;
  lucroReal: number;
  margemPrevista: number;
  margemReal: number;
  entrada: number;
  saldo: number;
  comissao: number;
  frete: number;
  instalacao: number;
  desperdicio: number;
  statusFinanceiro: StatusFinanceiro;
}