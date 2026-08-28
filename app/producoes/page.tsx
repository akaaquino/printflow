"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  updateDoc,
} from "firebase/firestore";

import { auth, db } from "@/app/lib/firebase";
import {
  MAQUINAS_PRODUCAO,
  PRIORIDADES_PRODUCAO,
  STATUS_ITENS_PRODUCAO,
  STATUS_OS_PRODUCAO,
} from "@/app/types/producao";
import type {
  ChecklistItemProducao,
  CronometroStatusProducao,
  DataFirestoreLike,
  HistoricoProducao,
  ItemProducao,
  MaquinaProducao,
  PrioridadeProducao,
  ProducaoIndustrial,
  StatusItemProducao,
  StatusOSProducao,
} from "@/app/types/producao";

type Documento = Record<string, unknown>;

type MaterialEstoque = {
  id: string;
  nome: string;
  quantidade: number;
};

type ImpressoraProducao = {
  id: string;
  nome: string;
  tipo: string;
  larguraMaximaM: number;
  velocidadeM2Hora: number;
  tempoSetupMin: number;
  ativo: boolean;
  observacoes?: string;
};

type OrcamentoRelacionado = {
  id: string;
  numeroOS?: string;
  servico?: string;
  itens?: unknown[];
  financeiro?: unknown;
  precisaInstalacao?: boolean;
  enderecoInstalacao?: string;
};

const CHECKLIST_PADRAO: ChecklistItemProducao = {
  conferido: false,
  impressaoOk: false,
  acabamentoOk: false,
  prontoParaEntrega: false,
};

const STATUS_KANBAN_PRODUCAO = STATUS_OS_PRODUCAO.filter(
  (status) => status !== "Finalizada"
);

function criarIdItem() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function numero(valor: unknown) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;

  const convertido = Number(String(valor || "").replace(",", "."));

  return Number.isFinite(convertido) ? convertido : 0;
}

function parseNumero(valor: unknown) {
  return numero(valor);
}

function texto(valor: unknown) {
  return String(valor || "");
}

function booleano(valor: unknown) {
  return valor === true;
}

function obterTimestamp(data: DataFirestoreLike | unknown) {
  if (!data) return 0;
  if (typeof data === "number") return data;
  if (typeof data === "string") {
    const convertido = new Date(data).getTime();
    return Number.isNaN(convertido) ? 0 : convertido;
  }
  if (data instanceof Date) return data.getTime();

  const objeto = data as { seconds?: number; toDate?: () => Date };

  if (objeto.seconds) return objeto.seconds * 1000;
  if (objeto.toDate) return objeto.toDate().getTime();

  return 0;
}

function formatarData(data: DataFirestoreLike | unknown) {
  const timestamp = obterTimestamp(data);

  if (!timestamp) return "Não informado";

  return new Date(timestamp).toLocaleString("pt-BR");
}

function formatarDuracao(ms: number) {
  if (!ms || ms < 0) return "0 min";

  const minutos = Math.floor(ms / 1000 / 60);

  if (minutos < 60) return `${minutos} min`;

  const horas = Math.floor(minutos / 60);
  const minutosRestantes = minutos % 60;

  if (horas < 24) return `${horas}h ${minutosRestantes}min`;

  const dias = Math.floor(horas / 24);
  const horasRestantes = horas % 24;

  return `${dias}d ${horasRestantes}h`;
}

function formatarTempoMinutos(minutos: unknown) {
  const totalMinutos = Math.max(Math.round(numero(minutos)), 0);

  if (totalMinutos < 60) return `${totalMinutos} min`;

  const horas = Math.floor(totalMinutos / 60);
  const minutosRestantes = totalMinutos % 60;

  return minutosRestantes > 0
    ? `${horas}h ${minutosRestantes}min`
    : `${horas}h`;
}

function formatarCronometro(segundos: unknown) {
  const totalSegundos = Math.max(Math.floor(numero(segundos)), 0);
  const horas = Math.floor(totalSegundos / 3600);
  const minutos = Math.floor((totalSegundos % 3600) / 60);
  const segundosRestantes = totalSegundos % 60;

  return [horas, minutos, segundosRestantes]
    .map((valor) => String(valor).padStart(2, "0"))
    .join(":");
}

function formatarMoeda(valor: unknown) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function calcularArea(largura: unknown, altura: unknown, quantidade: unknown) {
  const area = numero(largura) * numero(altura) * Math.max(numero(quantidade), 1);

  return Number.isFinite(area) ? Number(area.toFixed(2)) : 0;
}

function calcularAreaItem(item: ItemProducao) {
  const areaM2 = parseNumero((item as ItemProducao & { areaM2?: unknown }).areaM2);
  if (areaM2 > 0) return Number(areaM2.toFixed(2));

  const area = parseNumero(item.area);
  if (area > 0) return Number(area.toFixed(2));

  return calcularArea(item.largura, item.altura, item.quantidade);
}

function normalizarMaterialNome(nome: unknown) {
  return texto(nome)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function montarMedida(largura: unknown, altura: unknown) {
  if (!texto(largura).trim() || !texto(altura).trim()) return "";

  return `${texto(largura)} x ${texto(altura)} m`;
}

function formatarArea(area: unknown) {
  const valor = numero(area);

  return valor > 0 ? `${valor.toFixed(2)} m²` : "0,00 m²";
}

function formatarAreaCompacta(area: unknown) {
  const valor = numero(area);

  return `${valor.toFixed(2).replace(".", ",")}m\u00b2`;
}

function formatarNumeroBR(valor: unknown) {
  return numero(valor).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatarMedidaItem(item: ItemProducao) {
  const largura = numero(item.largura);
  const altura = numero(item.altura);

  if (largura <= 0 || altura <= 0) return "Medida não informada";

  return `${formatarNumeroBR(largura)}m × ${formatarNumeroBR(altura)}m`;
}

function formatarAreaItemProducao(item: ItemProducao) {
  return `${formatarNumeroBR(calcularAreaItem(item))} m²`;
}

function normalizarStatusItem(status: unknown, statusPadrao?: unknown): StatusItemProducao {
  const bruto = texto(status || statusPadrao).trim();

  if (STATUS_ITENS_PRODUCAO.includes(bruto as StatusItemProducao)) {
    return bruto as StatusItemProducao;
  }

  const statusLower = bruto.toLowerCase();

  if (
    statusLower.includes("impress") ||
    statusLower.includes("produção") ||
    statusLower.includes("producao")
  ) {
    return statusLower.includes("aguardando") ? "Fila" : "Imprimindo";
  }

  if (statusLower.includes("corte") || statusLower.includes("acabamento")) {
    return "Acabamento";
  }

  if (statusLower.includes("pronto")) return "Pronto";
  if (statusLower.includes("finalizado") || statusLower.includes("entregue")) {
    return "Entregue";
  }
  if (statusLower.includes("problema") || statusLower.includes("ajuste")) {
    return "Problema";
  }

  return "Fila";
}

function normalizarPrioridade(prioridade: unknown): PrioridadeProducao {
  const valor = texto(prioridade);

  if (PRIORIDADES_PRODUCAO.includes(valor as PrioridadeProducao)) {
    return valor as PrioridadeProducao;
  }

  return "Normal";
}

function normalizarMaquina(maquina: unknown): MaquinaProducao | "" {
  const valor = texto(maquina);

  if (MAQUINAS_PRODUCAO.includes(valor as MaquinaProducao)) {
    return valor as MaquinaProducao;
  }

  return "";
}

function normalizarChecklist(item: Documento): ChecklistItemProducao {
  const checklist = (item.checklist || {}) as Partial<ChecklistItemProducao>;

  return {
    conferido: booleano(checklist.conferido ?? item.conferido),
    impressaoOk: booleano(checklist.impressaoOk ?? item.impressaoOk),
    acabamentoOk: booleano(checklist.acabamentoOk ?? item.acabamentoOk),
    prontoParaEntrega: booleano(
      checklist.prontoParaEntrega ?? item.prontoParaEntrega
    ),
  };
}

function normalizarItemProducao(
  item: unknown,
  index: number,
  statusPadrao?: unknown
): ItemProducao {
  const dados = (item || {}) as Documento;
  const largura = texto(dados.largura);
  const altura = texto(dados.altura);
  const quantidade = Math.max(numero(dados.quantidade || 1), 1);
  const areaSalva = numero(dados.areaM2 || dados.area);
  const areaCalculada = calcularArea(largura, altura, quantidade);
  const checklist = normalizarChecklist(dados);

  return {
    id: texto(dados.id) || `item-${index + 1}`,
    materialId: texto(dados.materialId),
    material: texto(dados.material || dados.servico || dados.nome),
    servico: texto(dados.servico || dados.material || dados.nome),
    largura,
    altura,
    medida: texto(dados.medida) || montarMedida(largura, altura),
    area: areaSalva > 0 ? areaSalva : areaCalculada,
    areaM2: areaSalva > 0 ? areaSalva : areaCalculada,
    quantidade,
    cor: texto(dados.cor),
    acabamento: texto(dados.acabamento),
    status: normalizarStatusItem(dados.status, statusPadrao),
    operador: texto(dados.operador || dados.responsavel),
    maquina: normalizarMaquina(dados.maquina),
    impressoraId: texto(dados.impressoraId),
    impressoraNome: texto(dados.impressoraNome),
    velocidadeM2Hora: numero(dados.velocidadeM2Hora),
    larguraMaximaM: numero(dados.larguraMaximaM),
    tempoSetupMin: numero(dados.tempoSetupMin),
    tempoEstimadoMin: numero(dados.tempoEstimadoMin),
    impressoraSelecionadaEm: (dados.impressoraSelecionadaEm ||
      null) as DataFirestoreLike,
    observacoes: texto(dados.observacoes),
    iniciadoEm: (dados.iniciadoEm || null) as DataFirestoreLike,
    finalizadoEm: (dados.finalizadoEm || null) as DataFirestoreLike,
    statusAtualizadoEm: (dados.statusAtualizadoEm ||
      dados.statusUpdatedAt ||
      null) as DataFirestoreLike,
    statusUpdatedAt: (dados.statusUpdatedAt ||
      dados.statusAtualizadoEm ||
      null) as DataFirestoreLike,
    conferido: checklist.conferido,
    checklist,
  };
}

function normalizarItensProducao(itens: unknown[], statusPadrao?: unknown) {
  return itens.map((item, index) => normalizarItemProducao(item, index, statusPadrao));
}

function criarItemFormulario(): ItemProducao {
  return {
    id: criarIdItem(),
    materialId: "",
    material: "",
    servico: "",
    largura: "",
    altura: "",
    medida: "",
    area: 0,
    quantidade: 1,
    cor: "",
    acabamento: "",
    status: "Fila",
    operador: "",
    maquina: "",
    impressoraId: "",
    impressoraNome: "",
    velocidadeM2Hora: 0,
    larguraMaximaM: 0,
    tempoSetupMin: 0,
    tempoEstimadoMin: 0,
    impressoraSelecionadaEm: null,
    observacoes: "",
    iniciadoEm: null,
    finalizadoEm: null,
    statusAtualizadoEm: null,
    statusUpdatedAt: null,
    conferido: false,
    checklist: { ...CHECKLIST_PADRAO },
  };
}

function calcularStatusOS(itens: ItemProducao[]): StatusOSProducao {
  if (itens.length === 0) return "Fila";
  if (itens.some((item) => item.status === "Problema")) return "Problema";
  if (itens.every((item) => item.status === "Entregue")) return "Pronta";
  if (itens.some((item) => item.status === "Imprimindo")) return "Em Produção";
  if (itens.some((item) => item.status === "Acabamento")) return "Acabamento";
  if (itens.some((item) => item.status === "Instalação")) return "Instalação";
  if (itens.every((item) => item.status === "Pronto" || item.status === "Entregue")) {
    return "Pronta";
  }

  return "Fila";
}

function normalizarEtapaProducao(
  producao: Partial<ProducaoIndustrial> | Documento | null | undefined
): StatusOSProducao {
  const etapa = texto(producao?.etapa).trim();
  const status = texto(producao?.status).trim();

  if (booleano(producao?.finalizado) || etapa === "Finalizada" || status === "Finalizada") {
    return "Finalizada";
  }

  const valor = etapa || status || "Fila";

  if (STATUS_OS_PRODUCAO.includes(valor as StatusOSProducao)) {
    return valor as StatusOSProducao;
  }

  const normalizado = valor.toLowerCase();

  if (normalizado.includes("problema")) return "Problema";
  if (normalizado.includes("acabamento")) return "Acabamento";
  if (normalizado.includes("instala")) return "Instalação";
  if (normalizado.includes("pront")) return "Pronta";
  if (normalizado.includes("finaliz") || normalizado.includes("entreg")) {
    return "Finalizada";
  }
  if (
    normalizado.includes("imprim") ||
    normalizado.includes("produção") ||
    normalizado.includes("producao")
  ) {
    return normalizado.includes("aguard") ? "Fila" : "Em Produção";
  }

  return "Fila";
}

function resumirMateriais(itens: ItemProducao[]) {
  const materiais = itens.map((item) => item.material.trim()).filter(Boolean);

  return Array.from(new Set(materiais)).join(" + ");
}

function resumirMedidas(itens: ItemProducao[]) {
  return itens
    .map((item) => item.medida.trim())
    .filter(Boolean)
    .join(" + ");
}

function areaTotal(itens: ItemProducao[]) {
  return Number(
    itens.reduce((total, item) => total + calcularAreaItem(item), 0).toFixed(2)
  );
}

function calcularAreaTotal(itens: ItemProducao[]) {
  return areaTotal(itens);
}

function calcularTempoImpressaoMin(
  areaTotalM2: unknown,
  velocidadeM2Hora: unknown,
  tempoSetupMin: unknown
) {
  const area = Math.max(numero(areaTotalM2), 0);
  const velocidade = numero(velocidadeM2Hora);
  const setup = Math.max(numero(tempoSetupMin), 0);

  if (velocidade <= 0) return 0;

  return Math.ceil(setup + (area / velocidade) * 60);
}

function calcularTempoRealSegundos(producao: ProducaoIndustrial, agora = new Date()) {
  const acumulado = Math.max(numero(producao.tempoAcumuladoSegundos), 0);

  if (producao.cronometroStatus !== "rodando") return acumulado;

  const iniciadoEm = obterTimestamp(producao.iniciadoEm);

  if (!iniciadoEm) return acumulado;

  return acumulado + Math.max(Math.floor((agora.getTime() - iniciadoEm) / 1000), 0);
}

function cronometroAcimaDoEstimado(producao: ProducaoIndustrial, agora = new Date()) {
  const estimadoSegundos = Math.max(numero(producao.tempoEstimadoMin), 0) * 60;

  return estimadoSegundos > 0 && calcularTempoRealSegundos(producao, agora) > estimadoSegundos;
}

function formatarDiferencaTempo(producao: ProducaoIndustrial) {
  const real = Math.max(numero(producao.tempoRealSegundos), 0);
  const estimado = Math.max(numero(producao.tempoEstimadoMin), 0) * 60;

  if (!real || !estimado) return "-";

  const diferencaMin = Math.round(Math.abs(real - estimado) / 60);
  const prefixo = real > estimado ? "+" : "-";

  return `${prefixo}${formatarTempoMinutos(diferencaMin)}`;
}

function validarCapacidadeImpressora(itens: ItemProducao[], impressora: ImpressoraProducao) {
  if (impressora.larguraMaximaM <= 0) return "";

  const itemIncompativel = itens.find(
    (item) => numero(item.largura) > impressora.larguraMaximaM
  );

  return itemIncompativel
    ? "Este item tem largura maior que a capacidade da impressora selecionada."
    : "";
}

type ConsumoMaterial = {
  chave: string;
  materialId: string;
  materialNome: string;
  quantidadeM2: number;
};

type MaterialEstoqueDocumento = {
  id: string;
  ref: ReturnType<typeof doc>;
  dados: Documento;
};

function obterCampoEstoque(dados: Documento) {
  const campos = ["estoqueM2", "metragemAtual", "quantidadeM2", "saldoM2", "quantidade"];

  return campos.find((campo) => dados[campo] !== undefined && dados[campo] !== null) || "quantidade";
}

function obterEstoqueMaterial(dados: Documento) {
  return parseNumero(dados[obterCampoEstoque(dados)]);
}

function camposEstoqueAtualizacao(dados: Documento, valor: number) {
  return {
    [obterCampoEstoque(dados)]: valor,
  };
}

function agruparConsumoPorMaterial(itens: ItemProducao[]) {
  if (itens.length === 0) {
    throw new Error("Não é permitido finalizar uma produção sem itens.");
  }

  const consumos = new Map<string, ConsumoMaterial>();

  itens.forEach((item) => {
    const materialNome = texto(item.material || item.servico).trim();

    if (!materialNome) {
      throw new Error("Não é permitido finalizar com item sem material.");
    }

    const quantidadeM2 = calcularAreaItem(item);

    if (quantidadeM2 <= 0) {
      throw new Error(`Área inválida para ${materialNome}. Confira largura, altura e quantidade.`);
    }

    const chave = item.materialId || normalizarMaterialNome(materialNome);
    const consumoAtual = consumos.get(chave);

    consumos.set(chave, {
      chave,
      materialId: item.materialId || consumoAtual?.materialId || "",
      materialNome: materialNome || consumoAtual?.materialNome || "",
      quantidadeM2: Number(((consumoAtual?.quantidadeM2 || 0) + quantidadeM2).toFixed(2)),
    });
  });

  return Array.from(consumos.values());
}

function encontrarMaterialEstoque(
  consumo: ConsumoMaterial,
  materiais: MaterialEstoqueDocumento[]
) {
  if (consumo.materialId) {
    const porId = materiais.find((material) => material.id === consumo.materialId);
    if (porId) return porId;
  }

  const nomeConsumo = normalizarMaterialNome(consumo.materialNome);

  return materiais.find((material) => {
    const nomeMaterial = normalizarMaterialNome(
      material.dados.nome || material.dados.materialNome || material.dados.material
    );

    if (!nomeMaterial) return false;

    return nomeMaterial === nomeConsumo || nomeMaterial.includes(nomeConsumo) || nomeConsumo.includes(nomeMaterial);
  });
}

function producaoEstaFinalizada(producao: ProducaoIndustrial) {
  return (
    producao.finalizado === true ||
    producao.status === "Finalizada" ||
    producao.etapa === "Finalizada" ||
    normalizarEtapaProducao(producao) === "Finalizada"
  );
}

function materiaisHistorico(itens: ItemProducao[], fallback: string) {
  const materiais = itens.map((item) => item.material.trim()).filter(Boolean);

  return Array.from(new Set(materiais)).join(", ") || fallback || "-";
}

function prazoAtrasado(producao: ProducaoIndustrial) {
  if (!producao.prazo || producaoEstaFinalizada(producao)) {
    return false;
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const prazo = new Date(producao.prazo);
  prazo.setHours(0, 0, 0, 0);

  return prazo.getTime() < hoje.getTime();
}

function tempoParadoItem(item: ItemProducao, producao: ProducaoIndustrial) {
  const base =
    item.statusAtualizadoEm ||
    item.iniciadoEm ||
    producao.statusAtualizadoEm ||
    producao.criadoEm ||
    producao.createdAt;

  const timestamp = obterTimestamp(base);

  return timestamp ? formatarDuracao(Date.now() - timestamp) : "Não informado";
}

function tempoProducaoItem(item: ItemProducao) {
  const inicio = obterTimestamp(item.iniciadoEm);

  if (!inicio) return "Não iniciado";

  const fim = obterTimestamp(item.finalizadoEm) || Date.now();

  return formatarDuracao(fim - inicio);
}

function classeStatusItem(status: StatusItemProducao) {
  const classes: Record<StatusItemProducao, string> = {
    Fila: "bg-zinc-800 text-zinc-300 border-zinc-700",
    Imprimindo: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    Acabamento: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    Pronto: "bg-green-500/20 text-green-300 border-green-500/30",
    Instalação: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    Entregue: "bg-emerald-800/50 text-emerald-200 border-emerald-700",
    Problema: "bg-red-500/20 text-red-300 border-red-500/30",
  };

  return classes[status];
}

function classeStatusOS(status: StatusOSProducao) {
  const classes: Record<StatusOSProducao, string> = {
    Fila: "bg-zinc-800 text-zinc-300 border-zinc-700",
    "Em Produção": "bg-blue-500/20 text-blue-300 border-blue-500/30",
    Acabamento: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    Pronta: "bg-green-500/20 text-green-300 border-green-500/30",
    Instalação: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    Finalizada: "bg-emerald-800/50 text-emerald-200 border-emerald-700",
    Problema: "bg-red-500/20 text-red-300 border-red-500/30",
  };

  return classes[status];
}

function classePrioridade(prioridade: PrioridadeProducao) {
  if (prioridade === "Urgente") {
    return "bg-red-500/20 text-red-300 border-red-500/30";
  }

  if (prioridade === "Alta") {
    return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
  }

  return "bg-zinc-800 text-zinc-300 border-zinc-700";
}

function validarItem(item: ItemProducao, exigirDimensoes: boolean) {
  if (!item.material.trim()) return "Material obrigatório.";
  if (!STATUS_ITENS_PRODUCAO.includes(item.status)) return "Status obrigatório.";
  if (numero(item.quantidade) < 1) return "Quantidade mínima deve ser 1.";
  if (numero(item.largura) < 0) return "Largura não pode ser negativa.";
  if (numero(item.altura) < 0) return "Altura não pode ser negativa.";
  if (exigirDimensoes && numero(item.largura) <= 0) return "Informe uma largura maior que zero.";
  if (exigirDimensoes && numero(item.altura) <= 0) return "Informe uma altura maior que zero.";
  if (!Number.isFinite(numero(item.area))) return "Área inválida.";

  return "";
}

function itemParaFirestore(item: ItemProducao): ItemProducao {
  const quantidade = Math.max(numero(item.quantidade), 1);
  const medida = item.medida || montarMedida(item.largura, item.altura);

  return {
    ...item,
    servico: item.servico || item.material,
    quantidade,
    medida,
    area: item.area > 0 ? item.area : calcularArea(item.largura, item.altura, quantidade),
    areaM2: item.area > 0 ? item.area : calcularArea(item.largura, item.altura, quantidade),
    conferido: item.checklist.conferido,
    maquina: normalizarMaquina(item.maquina),
    status: normalizarStatusItem(item.status),
    impressoraId: item.impressoraId || "",
    impressoraNome: item.impressoraNome || "",
    velocidadeM2Hora: numero(item.velocidadeM2Hora),
    larguraMaximaM: numero(item.larguraMaximaM),
    tempoSetupMin: numero(item.tempoSetupMin),
    tempoEstimadoMin: numero(item.tempoEstimadoMin),
    impressoraSelecionadaEm: item.impressoraSelecionadaEm || null,
  };
}

function obterTenantId() {
  return auth.currentUser?.uid || "";
}

function logDebugProducao(...args: unknown[]) {
  if (process.env.NODE_ENV === "development") {
    console.log("[PrintFlow Produção]", ...args);
  }
}

export default function ProducoesPage() {
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [producaoDetalhe, setProducaoDetalhe] =
    useState<ProducaoIndustrial | null>(null);
  const [producoes, setProducoes] = useState<ProducaoIndustrial[]>([]);
  const [materiais, setMateriais] = useState<MaterialEstoque[]>([]);
  const [impressoras, setImpressoras] = useState<ImpressoraProducao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState("");
  const [abaAtiva, setAbaAtiva] = useState<"ativa" | "historico">("ativa");
  const [buscaHistorico, setBuscaHistorico] = useState("");
  const [finalizandoId, setFinalizandoId] = useState("");
  const [acaoCronometroId, setAcaoCronometroId] = useState("");
  const [acaoImpressoraId, setAcaoImpressoraId] = useState("");
  const [agoraCronometro, setAgoraCronometro] = useState(() => new Date());

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<StatusOSProducao | "Todos">(
    "Todos"
  );
  const [filtroMaquina, setFiltroMaquina] = useState<MaquinaProducao | "Todas">(
    "Todas"
  );
  const [filtroPrioridade, setFiltroPrioridade] = useState<
    PrioridadeProducao | "Todas"
  >("Todas");

  const [numeroOS, setNumeroOS] = useState("");
  const [cliente, setCliente] = useState("");
  const [servico, setServico] = useState("");
  const [prioridade, setPrioridade] = useState<PrioridadeProducao>("Normal");
  const [prazo, setPrazo] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [itensFormulario, setItensFormulario] = useState<ItemProducao[]>([
    criarItemFormulario(),
  ]);

  useEffect(() => {
    carregarDados();
  }, []);

  useEffect(() => {
    const intervalo = window.setInterval(() => {
      setAgoraCronometro(new Date());
    }, 1000);

    return () => window.clearInterval(intervalo);
  }, []);

  function mostrarToast(mensagem: string) {
    setToast(mensagem);
    window.setTimeout(() => setToast(""), 3500);
  }

  async function buscarColecaoLimitada(nome: string) {
    try {
      return await getDocs(
        query(collection(db, nome), orderBy("criadoEm", "desc"), limit(120))
      );
    } catch {
      return getDocs(query(collection(db, nome), limit(120)));
    }
  }

  async function carregarDados() {
    try {
      setCarregando(true);

      const [
        producoesSnapshot,
        orcamentosSnapshot,
        materiaisSnapshot,
        impressorasSnapshot,
      ] =
        await Promise.all([
          getDocs(collection(db, "producoes")),
          buscarColecaoLimitada("orcamentos"),
          buscarColecaoLimitada("materiais"),
          buscarColecaoLimitada("impressoras"),
        ]);

      logDebugProducao("collection usada", "producoes");
      logDebugProducao("quantidade de produções carregadas", producoesSnapshot.size);

      const orcamentos: OrcamentoRelacionado[] = orcamentosSnapshot.docs.map(
        (documento) => {
          const dados = documento.data() as Documento;

          return {
            id: documento.id,
            numeroOS: texto(dados.numeroOS),
            servico: texto(dados.servico),
            itens: Array.isArray(dados.itens) ? dados.itens : [],
            financeiro: dados.financeiro,
            precisaInstalacao: booleano(dados.precisaInstalacao),
            enderecoInstalacao: texto(dados.enderecoInstalacao),
          };
        }
      );

      const materiaisLista: MaterialEstoque[] = materiaisSnapshot.docs.map(
        (documento) => {
          const dados = documento.data() as Documento;

          return {
            id: documento.id,
            nome: texto(dados.nome),
            quantidade: numero(dados.quantidade),
          };
        }
      );

      const impressorasLista: ImpressoraProducao[] = impressorasSnapshot.docs
        .map((documento) => {
          const dados = documento.data() as Documento;

          return {
            id: documento.id,
            nome: texto(dados.nome),
            tipo: texto(dados.tipo),
            larguraMaximaM: numero(dados.larguraMaximaM),
            velocidadeM2Hora: numero(dados.velocidadeM2Hora),
            tempoSetupMin: numero(dados.tempoSetupMin),
            ativo: dados.ativo !== false,
            observacoes: texto(dados.observacoes),
          };
        })
        .filter((impressora) => impressora.ativo && impressora.nome);

      const lista = producoesSnapshot.docs.map((documento) => {
        const dados = documento.data() as Documento;
        const orcamentoRelacionado = orcamentos.find((orcamento) => {
          return (
            orcamento.id === texto(dados.orcamentoId) ||
            orcamento.numeroOS === texto(dados.numeroOS)
          );
        });

        const itensOriginais =
          Array.isArray(dados.itens) && dados.itens.length > 0
            ? dados.itens
            : orcamentoRelacionado?.itens || [];

        const itens =
          itensOriginais.length > 0
            ? normalizarItensProducao(
                itensOriginais,
                dados.etapa || dados.status
              )
            : [
                normalizarItemProducao(
                  {
                    id: "item-1",
                    material: dados.material || dados.servico,
                    servico: dados.servico || dados.material,
                    medida: dados.medida,
                    area: dados.area,
                    status: dados.status,
                    operador: dados.operador || dados.responsavel,
                    maquina: dados.maquina,
                    observacoes: dados.observacoes,
                    iniciadoEm: dados.iniciadoEm,
                    finalizadoEm: dados.finalizadoEm,
                    statusAtualizadoEm: dados.statusAtualizadoEm,
                    conferido: dados.conferido,
                  },
                  0,
                  dados.etapa || dados.status
                ),
              ];

        const finalizadoSalvo =
          booleano(dados.finalizado) ||
          texto(dados.status) === "Finalizada" ||
          texto(dados.etapa) === "Finalizada";
        const etapaSalva = normalizarEtapaProducao({
          etapa: dados.etapa,
          status: dados.status,
          finalizado: dados.finalizado,
        });
        const statusItens = calcularStatusOS(itens);
        const etapaCalculada = finalizadoSalvo
          ? "Finalizada"
          : etapaSalva !== "Fila"
          ? etapaSalva
          : statusItens;
        const materialResumo =
          resumirMateriais(itens) ||
          texto(dados.materialPrincipal) ||
          texto(dados.material) ||
          texto(orcamentoRelacionado?.servico);
        const medidaResumo = resumirMedidas(itens) || texto(dados.medida);
        const areaResumo = areaTotal(itens) || numero(dados.metragemTotal) || numero(dados.area);

        return {
          id: documento.id,
          tenantId: texto(dados.tenantId),
          numeroOS: texto(dados.numeroOS) || "Sem OS",
          clienteId: texto(dados.clienteId),
          cliente: texto(dados.cliente),
          servico:
            texto(dados.servico) ||
            texto(orcamentoRelacionado?.servico) ||
            materialResumo,
          material: materialResumo,
          materialPrincipal: materialResumo,
          medida: medidaResumo,
          area: areaResumo,
          metragemTotal: areaResumo,
          prioridade: normalizarPrioridade(dados.prioridade),
          status: etapaCalculada,
          etapa: etapaCalculada,
          prazo: texto(dados.prazo),
          observacoes: texto(dados.observacoes),
          responsavel: texto(dados.responsavel),
          operador: texto(dados.operador),
          maquina: texto(dados.maquina),
          impressoraId: texto(dados.impressoraId),
          impressoraNome: texto(dados.impressoraNome),
          velocidadeM2Hora: numero(dados.velocidadeM2Hora),
          larguraMaximaM: numero(dados.larguraMaximaM),
          tempoSetupMin: numero(dados.tempoSetupMin),
          tempoEstimadoMin: numero(dados.tempoEstimadoMin),
          impressoraSelecionadaEm: (dados.impressoraSelecionadaEm ||
            null) as DataFirestoreLike,
          cronometroStatus:
            (["rodando", "pausado", "finalizado", "parado"].includes(
              texto(dados.cronometroStatus)
            )
              ? texto(dados.cronometroStatus)
              : finalizadoSalvo
              ? "finalizado"
              : "parado") as CronometroStatusProducao,
          iniciadoEm: (dados.iniciadoEm || null) as DataFirestoreLike,
          pausadoEm: (dados.pausadoEm || null) as DataFirestoreLike,
          tempoAcumuladoSegundos: numero(dados.tempoAcumuladoSegundos),
          tempoRealSegundos: numero(dados.tempoRealSegundos),
          itens,
          arquivos: Array.isArray(dados.arquivos) ? dados.arquivos : [],
          mockups: Array.isArray(dados.mockups) ? dados.mockups : [],
          historico: Array.isArray(dados.historico)
            ? (dados.historico as HistoricoProducao[])
            : [],
          financeiro:
            (dados.financeiro as ProducaoIndustrial["financeiro"]) ||
            (orcamentoRelacionado?.financeiro as ProducaoIndustrial["financeiro"]) ||
            null,
          margemPrevista: numero(
            dados.margemPrevista ||
              (orcamentoRelacionado?.financeiro as { margemPrevista?: number })
                ?.margemPrevista
          ),
          origem: texto(dados.origem),
          arteId: texto(dados.arteId),
          orcamentoId: texto(dados.orcamentoId),
          estoqueBaixado: booleano(dados.estoqueBaixado),
          estoqueBaixadoEm: (dados.estoqueBaixadoEm || null) as DataFirestoreLike,
          instalacaoCriada: booleano(dados.instalacaoCriada),
          precisaInstalacao:
            booleano(dados.precisaInstalacao) ||
            booleano(orcamentoRelacionado?.precisaInstalacao),
          enderecoInstalacao:
            texto(dados.enderecoInstalacao) ||
            texto(orcamentoRelacionado?.enderecoInstalacao),
          finalizado: finalizadoSalvo || etapaCalculada === "Finalizada",
          criadoEm: (dados.criadoEm || dados.createdAt || null) as DataFirestoreLike,
          atualizadoEm: (dados.atualizadoEm || dados.updatedAt || null) as DataFirestoreLike,
          statusAtualizadoEm: (dados.statusAtualizadoEm ||
            dados.statusUpdatedAt ||
            null) as DataFirestoreLike,
          createdAt: (dados.createdAt || dados.criadoEm || null) as DataFirestoreLike,
          updatedAt: (dados.updatedAt || dados.atualizadoEm || null) as DataFirestoreLike,
          statusUpdatedAt: (dados.statusUpdatedAt ||
            dados.statusAtualizadoEm ||
            null) as DataFirestoreLike,
          finalizadoEm: (dados.finalizadoEm || null) as DataFirestoreLike,
        } satisfies ProducaoIndustrial;
      });

      lista.sort((a, b) => {
        return (
          obterTimestamp(b.criadoEm || b.createdAt) -
          obterTimestamp(a.criadoEm || a.createdAt)
        );
      });

      setMateriais(materiaisLista);
      setImpressoras(impressorasLista);
      setProducoes(lista);
    } catch (erro) {
      console.error(erro);
      mostrarToast("Erro ao carregar produções.");
    } finally {
      setCarregando(false);
    }
  }

  const producoesAtivas = useMemo(() => {
    return producoes.filter((producao) => !producaoEstaFinalizada(producao));
  }, [producoes]);

  const producoesFinalizadas = useMemo(() => {
    return producoes
      .filter(producaoEstaFinalizada)
      .sort((a, b) => obterTimestamp(b.finalizadoEm) - obterTimestamp(a.finalizadoEm));
  }, [producoes]);

  const producoesFiltradas = useMemo(() => {
    const termo = busca.toLowerCase().trim();

    return producoesAtivas.filter((producao) => {
      const textoItens = producao.itens
        .map((item) => `${item.material} ${item.medida} ${item.operador} ${item.maquina}`)
        .join(" ")
        .toLowerCase();

      const correspondeBusca =
        !termo ||
        producao.numeroOS.toLowerCase().includes(termo) ||
        producao.cliente.toLowerCase().includes(termo) ||
        producao.servico.toLowerCase().includes(termo) ||
        producao.material.toLowerCase().includes(termo) ||
        (producao.impressoraNome || "").toLowerCase().includes(termo) ||
        textoItens.includes(termo);

      const correspondeStatus =
        filtroStatus === "Todos" || normalizarEtapaProducao(producao) === filtroStatus;

      const correspondeMaquina =
        filtroMaquina === "Todas" ||
        producao.itens.some((item) => item.maquina === filtroMaquina);

      const correspondePrioridade =
        filtroPrioridade === "Todas" || producao.prioridade === filtroPrioridade;

      return (
        correspondeBusca &&
        correspondeStatus &&
        correspondeMaquina &&
        correspondePrioridade
      );
    });
  }, [producoesAtivas, busca, filtroStatus, filtroMaquina, filtroPrioridade]);

  const historicoFiltrado = useMemo(() => {
    const termo = buscaHistorico.toLowerCase().trim();

    if (!termo) return producoesFinalizadas;

    return producoesFinalizadas.filter((producao) => {
      const materiais = materiaisHistorico(producao.itens, producao.material).toLowerCase();

      return (
        producao.numeroOS.toLowerCase().includes(termo) ||
        producao.cliente.toLowerCase().includes(termo) ||
        materiais.includes(termo) ||
        (producao.impressoraNome || "").toLowerCase().includes(termo)
      );
    });
  }, [producoesFinalizadas, buscaHistorico]);

  const totalItens = producoesFiltradas.reduce(
    (total, producao) => total + producao.itens.length,
    0
  );

  const itensImprimindo = producoesFiltradas.reduce((total, producao) => {
    return total + producao.itens.filter((item) => item.status === "Imprimindo").length;
  }, 0);

  const itensProblema = producoesFiltradas.reduce((total, producao) => {
    return total + producao.itens.filter((item) => item.status === "Problema").length;
  }, 0);

  const producoesAtrasadas = producoesFiltradas.filter(prazoAtrasado).length;

  const producoesPorStatus = STATUS_KANBAN_PRODUCAO.map((status) => ({
    status,
    itens: producoesFiltradas.filter(
      (producao) => normalizarEtapaProducao(producao) === status
    ),
  }));

  useEffect(() => {
    logDebugProducao("filtros aplicados", {
      abaAtiva,
      busca,
      filtroStatus,
      filtroMaquina,
      filtroPrioridade,
      totalProducoes: producoes.length,
      ativas: producoesAtivas.length,
      filtradas: producoesFiltradas.length,
    });
    logDebugProducao("itens ativos encontrados", totalItens);
  }, [
    abaAtiva,
    busca,
    filtroStatus,
    filtroMaquina,
    filtroPrioridade,
    producoes.length,
    producoesAtivas.length,
    producoesFiltradas.length,
    totalItens,
  ]);

  function limparFormulario() {
    setNumeroOS("");
    setCliente("");
    setServico("");
    setPrioridade("Normal");
    setPrazo("");
    setObservacoes("");
    setItensFormulario([criarItemFormulario()]);
  }

  function atualizarItemFormulario(
    indexItem: number,
    campo: keyof ItemProducao,
    valor: string | number | boolean | ChecklistItemProducao
  ) {
    setItensFormulario((listaAtual) =>
      listaAtual.map((item, index) => {
        if (index !== indexItem) return item;

        const atualizado = {
          ...item,
          [campo]: valor,
        };

        if (campo === "materialId") {
          const materialSelecionado = materiais.find(
            (material) => material.id === valor
          );

          atualizado.material = materialSelecionado?.nome || item.material;
          atualizado.servico = materialSelecionado?.nome || item.servico;
        }

        if (campo === "largura" || campo === "altura" || campo === "quantidade") {
          atualizado.quantidade = Math.max(numero(atualizado.quantidade), 1);
          atualizado.medida = montarMedida(atualizado.largura, atualizado.altura);
          atualizado.area = calcularArea(
            atualizado.largura,
            atualizado.altura,
            atualizado.quantidade
          );
        }

        if (campo === "material") {
          atualizado.servico = texto(valor);
        }

        return atualizado;
      })
    );
  }

  function adicionarItemFormulario() {
    setItensFormulario((listaAtual) => [...listaAtual, criarItemFormulario()]);
  }

  function removerItemFormulario(indexParaRemover: number) {
    setItensFormulario((listaAtual) => {
      const novaLista = listaAtual.filter((_, index) => index !== indexParaRemover);

      return novaLista.length > 0 ? novaLista : listaAtual;
    });
  }

  async function salvarProducao() {
    if (!cliente.trim()) {
      alert("Informe o cliente antes de salvar.");
      return;
    }

    const numeroFinal = numeroOS.trim() || `OS-${Date.now()}`;

    if (
      producoes.some(
        (producao) => producao.numeroOS.toLowerCase() === numeroFinal.toLowerCase()
      )
    ) {
      alert("Já existe uma produção com esta OS.");
      return;
    }

    const itens = itensFormulario.map(itemParaFirestore);

    for (const item of itens) {
      const erro = validarItem(item, true);

      if (erro) {
        alert(erro);
        return;
      }
    }

    const statusOS = calcularStatusOS(itens);
    const agora = new Date();
    const materialResumo = resumirMateriais(itens);
    const medidaResumo = resumirMedidas(itens);

    const novaProducao = {
      tenantId: obterTenantId(),
      numeroOS: numeroFinal,
      clienteId: "",
      cliente: cliente.trim(),
      servico: servico.trim() || materialResumo,
      material: materialResumo,
      materialPrincipal: materialResumo,
      medida: medidaResumo,
      area: areaTotal(itens),
      metragemTotal: areaTotal(itens),
      itens,
      prioridade,
      status: statusOS,
      etapa: statusOS,
      prazo,
      observacoes: observacoes.trim(),
      finalizado: statusOS === "Finalizada",
      estoqueBaixado: false,
      instalacaoCriada: false,
      impressoraId: "",
      impressoraNome: "",
      velocidadeM2Hora: 0,
      larguraMaximaM: 0,
      tempoSetupMin: 0,
      tempoEstimadoMin: 0,
      impressoraSelecionadaEm: null,
      cronometroStatus: "parado",
      iniciadoEm: null,
      pausadoEm: null,
      tempoAcumuladoSegundos: 0,
      tempoRealSegundos: 0,
      origem: "manual",
      historico: [
        {
          tipo: "os",
          acao: "Produção criada manualmente",
          statusNovo: statusOS,
          data: agora,
          createdAt: agora,
          usuarioId: auth.currentUser?.uid || "",
        },
      ],
      criadoEm: agora,
      atualizadoEm: agora,
      statusAtualizadoEm: agora,
      createdAt: agora,
      updatedAt: agora,
      statusUpdatedAt: agora,
    };

    try {
      setSalvando(true);
      await addDoc(collection(db, "producoes"), novaProducao);
      await carregarDados();
      limparFormulario();
      setMostrarFormulario(false);
      mostrarToast("Produção criada.");
    } catch (erro) {
      console.error(erro);
      alert("Erro ao salvar produção.");
    } finally {
      setSalvando(false);
    }
  }

  async function criarInstalacaoSeNecessaria(producao: ProducaoIndustrial) {
    if (
      producao.instalacaoCriada ||
      (!producao.precisaInstalacao && !producao.enderecoInstalacao)
    ) {
      return false;
    }

    await addDoc(collection(db, "instalacoes"), {
      tenantId: producao.tenantId || obterTenantId(),
      numeroOS: producao.numeroOS,
      cliente: producao.cliente,
      servico: producao.servico,
      endereco: producao.enderecoInstalacao || "",
      data: "",
      horario: "",
      responsavel: "",
      ajudante: "",
      observacoes: "Instalação criada automaticamente pela produção.",
      status: "Aguardando Agendamento",
      finalizado: false,
      origem: "producao",
      producaoId: producao.id,
      criadoEm: new Date(),
      createdAt: new Date(),
    });

    return true;
  }

  async function selecionarImpressoraProducao(
    producao: ProducaoIndustrial,
    impressoraId: string
  ) {
    if (!producao.id || acaoImpressoraId) return;

    const agora = new Date();
    const impressora = impressoras.find((item) => item.id === impressoraId);
    const areaTotalM2 = calcularAreaTotal(producao.itens);
    const tempoEstimadoMin = impressora
      ? calcularTempoImpressaoMin(
          areaTotalM2,
          impressora.velocidadeM2Hora,
          impressora.tempoSetupMin
        )
      : 0;
    const alertaCapacidade = impressora
      ? validarCapacidadeImpressora(producao.itens, impressora)
      : "";
    const itensAtualizados = producao.itens.map((item) =>
      itemParaFirestore({
        ...item,
        impressoraId: impressora?.id || "",
        impressoraNome: impressora?.nome || "",
        velocidadeM2Hora: impressora?.velocidadeM2Hora || 0,
        larguraMaximaM: impressora?.larguraMaximaM || 0,
        tempoSetupMin: impressora?.tempoSetupMin || 0,
        tempoEstimadoMin,
        impressoraSelecionadaEm: impressora ? agora : null,
      })
    );
    const historico: HistoricoProducao[] = [
      ...producao.historico,
      {
        tipo: "sistema",
        acao: impressora
          ? `Impressora selecionada: ${impressora.nome}`
          : "Impressora removida",
        usuarioId: auth.currentUser?.uid || "",
        data: agora,
        createdAt: agora,
      },
    ];
    const updates = {
      impressoraId: impressora?.id || "",
      impressoraNome: impressora?.nome || "",
      velocidadeM2Hora: impressora?.velocidadeM2Hora || 0,
      larguraMaximaM: impressora?.larguraMaximaM || 0,
      tempoSetupMin: impressora?.tempoSetupMin || 0,
      tempoEstimadoMin,
      impressoraSelecionadaEm: impressora ? agora : null,
      itens: itensAtualizados,
      historico,
      atualizadoEm: agora,
      updatedAt: agora,
    };

    console.log("Impressora selecionada:", impressora);
    console.log("Área total impressão:", areaTotalM2);
    console.log("Tempo estimado impressão:", tempoEstimadoMin);
    console.log("Alerta capacidade impressora:", alertaCapacidade);

    try {
      setAcaoImpressoraId(producao.id);
      await updateDoc(doc(db, "producoes", producao.id), updates);
      setProducoes((listaAtual) =>
        listaAtual.map((item) =>
          item.id === producao.id ? ({ ...item, ...updates } as ProducaoIndustrial) : item
        )
      );
      setProducaoDetalhe((detalheAtual) =>
        detalheAtual?.id === producao.id
          ? ({ ...detalheAtual, ...updates } as ProducaoIndustrial)
          : detalheAtual
      );
      mostrarToast(
        alertaCapacidade || (impressora ? "Impressora selecionada." : "Impressora removida.")
      );
    } catch (erro) {
      console.error(erro);
      mostrarToast("Erro ao salvar impressora da OS.");
    } finally {
      setAcaoImpressoraId("");
    }
  }

  async function alterarCronometroProducao(
    producao: ProducaoIndustrial,
    acao: "iniciar" | "pausar" | "retomar"
  ) {
    if (!producao.id || acaoCronometroId || producaoEstaFinalizada(producao)) return;

    const agora = new Date();
    const tempoReal = calcularTempoRealSegundos(producao, agora);
    const statusAtual = producao.cronometroStatus || "parado";
    const updates =
      acao === "pausar"
        ? {
            cronometroStatus: "pausado" as CronometroStatusProducao,
            pausadoEm: agora,
            iniciadoEm: null,
            tempoAcumuladoSegundos: tempoReal,
            tempoRealSegundos: tempoReal,
          }
        : {
            cronometroStatus: "rodando" as CronometroStatusProducao,
            iniciadoEm: agora,
            pausadoEm: null,
            tempoAcumuladoSegundos:
              acao === "iniciar" && statusAtual === "parado"
                ? 0
                : Math.max(numero(producao.tempoAcumuladoSegundos), 0),
          };
    const historico: HistoricoProducao[] = [
      ...producao.historico,
      {
        tipo: "os",
        acao:
          acao === "pausar"
            ? "Cronômetro pausado"
            : acao === "retomar"
              ? "Cronômetro retomado"
              : "Cronômetro iniciado",
        usuarioId: auth.currentUser?.uid || "",
        data: agora,
        createdAt: agora,
      },
    ];
    const payload = {
      ...updates,
      historico,
      atualizadoEm: agora,
      updatedAt: agora,
    };

    console.log("Cronômetro produção:", { producao, acao, payload });

    try {
      setAcaoCronometroId(producao.id);
      await updateDoc(doc(db, "producoes", producao.id), payload);
      setProducoes((listaAtual) =>
        listaAtual.map((item) =>
          item.id === producao.id ? ({ ...item, ...payload } as ProducaoIndustrial) : item
        )
      );
      setProducaoDetalhe((detalheAtual) =>
        detalheAtual?.id === producao.id
          ? ({ ...detalheAtual, ...payload } as ProducaoIndustrial)
          : detalheAtual
      );
      mostrarToast(
        acao === "pausar"
          ? "Cronômetro pausado."
          : acao === "retomar"
            ? "Cronômetro retomado."
            : "Cronômetro iniciado."
      );
    } catch (erro) {
      console.error(erro);
      mostrarToast("Erro ao atualizar cronômetro.");
    } finally {
      setAcaoCronometroId("");
    }
  }

  async function baixarEstoqueDaProducao(
    producao: ProducaoIndustrial,
    itensAtualizados: ItemProducao[],
    historico: HistoricoProducao[],
    agora: Date
  ) {
    const materiaisSnapshot = await getDocs(collection(db, "materiais"));
    const materiaisLista: MaterialEstoqueDocumento[] = materiaisSnapshot.docs.map((documento) => ({
      id: documento.id,
      ref: doc(db, "materiais", documento.id),
      dados: documento.data() as Documento,
    }));
    const consumos = agruparConsumoPorMaterial(itensAtualizados);
    const tempoRealFinal = calcularTempoRealSegundos(producao, agora);
    console.log("OS finalizada:", producao);
    console.log("Itens da OS:", itensAtualizados);
    console.log("Materiais carregados:", materiaisLista);
    console.log("Consumo calculado:", consumos);
    const materiaisConsumo = consumos.map((consumo) => {
      const material = encontrarMaterialEstoque(consumo, materiaisLista);
      console.log("Material encontrado:", material);

      if (!material) {
        throw new Error(
          `Material ${consumo.materialNome} não encontrado no estoque. Cadastre ou vincule esse material antes de finalizar.`
        );
      }

      const disponivel = obterEstoqueMaterial(material.dados);
      const campoEstoque = obterCampoEstoque(material.dados);
      const estoqueDepois = Number((disponivel - consumo.quantidadeM2).toFixed(2));
      console.log("Campo de estoque usado:", campoEstoque);
      console.log("Estoque antes:", disponivel);
      console.log("Estoque depois:", estoqueDepois);

      if (disponivel < consumo.quantidadeM2) {
        throw new Error(
          `Estoque insuficiente para ${consumo.materialNome}. Disponível: ${formatarArea(disponivel)}. Necessário: ${formatarArea(consumo.quantidadeM2)}.`
        );
      }

      return { consumo, material };
    });

    return runTransaction(db, async (transaction) => {
      const producaoRef = doc(db, "producoes", producao.id);
      const producaoSnapshot = await transaction.get(producaoRef);

      if (!producaoSnapshot.exists()) {
        throw new Error("OS não encontrada no Firestore.");
      }

      const producaoAtual = producaoSnapshot.data() as Documento;

      if (producaoAtual.estoqueBaixado === true) {
        transaction.update(producaoRef, {
          status: "Finalizada",
          etapa: "Finalizada",
          finalizado: true,
          finalizadoEm: producaoAtual.finalizadoEm || agora,
          estoqueBaixado: true,
          estoqueBaixadoEm: producaoAtual.estoqueBaixadoEm || agora,
          cronometroStatus: "finalizado",
          iniciadoEm: null,
          pausadoEm: null,
          tempoAcumuladoSegundos:
            numero(producaoAtual.tempoRealSegundos) || tempoRealFinal,
          tempoRealSegundos:
            numero(producaoAtual.tempoRealSegundos) || tempoRealFinal,
          atualizadoEm: agora,
          updatedAt: agora,
          statusAtualizadoEm: agora,
          statusUpdatedAt: agora,
        });

        return {
          estoqueBaixado: false,
          mensagem: "Estoque já foi baixado para esta OS.",
        };
      }

      const baixasEstoque = [];

      for (const { consumo, material } of materiaisConsumo) {
        const materialSnapshot = await transaction.get(material.ref);

        if (!materialSnapshot.exists()) {
          throw new Error(
            `Material ${consumo.materialNome} não encontrado no estoque. Cadastre ou vincule esse material antes de finalizar.`
          );
        }

        const dadosMaterial = materialSnapshot.data() as Documento;
        const disponivel = obterEstoqueMaterial(dadosMaterial);
        const campoEstoque = obterCampoEstoque(dadosMaterial);

        if (disponivel < consumo.quantidadeM2) {
          throw new Error(
            `Estoque insuficiente para ${consumo.materialNome}. Disponível: ${formatarArea(disponivel)}. Necessário: ${formatarArea(consumo.quantidadeM2)}.`
          );
        }

        const saldoAtualizado = Number((disponivel - consumo.quantidadeM2).toFixed(2));
        console.log("Campo de estoque usado:", campoEstoque);
        console.log("Estoque antes:", disponivel);
        console.log("Estoque depois:", saldoAtualizado);

        baixasEstoque.push({
          consumo,
          material,
          dadosMaterial,
          campoEstoque,
          estoqueAntes: disponivel,
          estoqueDepois: saldoAtualizado,
        });
      }

      for (const baixa of baixasEstoque) {
        transaction.update(baixa.material.ref, {
          ...camposEstoqueAtualizacao(baixa.dadosMaterial, baixa.estoqueDepois),
          atualizadoEm: agora,
          updatedAt: agora,
        });

        transaction.set(doc(collection(db, "movimentacoesEstoque")), {
          tenantId: producao.tenantId || obterTenantId(),
          tipo: "saida",
          origem: "producao",
          producaoId: producao.id,
          numeroOS: producao.numeroOS,
          materialId: baixa.material.id,
          materialNome:
            texto(baixa.dadosMaterial.nome || baixa.dadosMaterial.materialNome || baixa.dadosMaterial.material) ||
            baixa.consumo.materialNome,
          quantidadeM2: baixa.consumo.quantidadeM2,
          quantidade: baixa.consumo.quantidadeM2,
          quantidadeAnterior: baixa.estoqueAntes,
          quantidadeAtual: baixa.estoqueDepois,
          estoqueAntes: baixa.estoqueAntes,
          estoqueDepois: baixa.estoqueDepois,
          campoEstoque: baixa.campoEstoque,
          usuarioId: auth.currentUser?.uid || "",
          observacao: "Baixa automática ao finalizar produção",
          criadoEm: agora,
          createdAt: agora,
        });
      }

      transaction.update(producaoRef, {
        itens: itensAtualizados,
        status: "Finalizada",
        etapa: "Finalizada",
        material: resumirMateriais(itensAtualizados),
        materialPrincipal: resumirMateriais(itensAtualizados),
        medida: resumirMedidas(itensAtualizados),
        area: areaTotal(itensAtualizados),
        metragemTotal: areaTotal(itensAtualizados),
        finalizado: true,
        finalizadoEm: agora,
        estoqueBaixado: true,
        estoqueBaixadoEm: agora,
        cronometroStatus: "finalizado",
        iniciadoEm: null,
        pausadoEm: null,
        tempoAcumuladoSegundos: tempoRealFinal,
        tempoRealSegundos: tempoRealFinal,
        historico,
        atualizadoEm: agora,
        updatedAt: agora,
        statusAtualizadoEm: agora,
        statusUpdatedAt: agora,
      });

      return {
        estoqueBaixado: true,
        mensagem: "OS finalizada e estoque atualizado com sucesso.",
      };
    });
  }

  async function atualizarItemProducao(
    producao: ProducaoIndustrial,
    itemId: string,
    mudancas: Partial<ItemProducao>,
    acao = "Item atualizado"
  ) {
    const agora = new Date();
    const itemAnterior = producao.itens.find((item) => item.id === itemId);

    if (!itemAnterior) return;

    const itensAtualizados = producao.itens.map((item, index) => {
      if (item.id !== itemId) return item;

      const statusMudou = mudancas.status && mudancas.status !== item.status;
      const checklist =
        mudancas.checklist ||
        (mudancas.conferido !== undefined
          ? { ...item.checklist, conferido: mudancas.conferido }
          : item.checklist);

      const atualizado = normalizarItemProducao(
        {
          ...item,
          ...mudancas,
          checklist,
          conferido: checklist.conferido,
          area:
            mudancas.largura !== undefined ||
            mudancas.altura !== undefined ||
            mudancas.quantidade !== undefined
              ? calcularArea(
                  mudancas.largura ?? item.largura,
                  mudancas.altura ?? item.altura,
                  mudancas.quantidade ?? item.quantidade
                )
              : item.area,
          medida:
            mudancas.largura !== undefined || mudancas.altura !== undefined
              ? montarMedida(
                  mudancas.largura ?? item.largura,
                  mudancas.altura ?? item.altura
                )
              : mudancas.medida ?? item.medida,
          statusAtualizadoEm: statusMudou ? agora : item.statusAtualizadoEm,
          statusUpdatedAt: statusMudou ? agora : item.statusUpdatedAt,
          iniciadoEm:
            statusMudou &&
            (mudancas.status === "Imprimindo" || mudancas.status === "Acabamento") &&
            !item.iniciadoEm
              ? agora
              : item.iniciadoEm,
          finalizadoEm:
            statusMudou &&
            (mudancas.status === "Pronto" || mudancas.status === "Entregue") &&
            !item.finalizadoEm
              ? agora
              : item.finalizadoEm,
        },
        index,
        item.status
      );

      return itemParaFirestore(atualizado);
    });

    const itemAtualizado = itensAtualizados.find((item) => item.id === itemId);
    const erro = itemAtualizado ? validarItem(itemAtualizado, false) : "";

    if (erro) {
      alert(erro);
      return;
    }

    const statusOS = calcularStatusOS(itensAtualizados);
    const instalacaoCriadaAgora =
      statusOS === "Pronta" ? await criarInstalacaoSeNecessaria(producao) : false;

    const historico: HistoricoProducao[] = [
      ...producao.historico,
      {
        tipo: "item",
        itemId,
        itemMaterial: itemAnterior.material,
        statusAnterior: itemAnterior.status,
        statusNovo: itemAtualizado?.status,
        acao,
        operador: itemAtualizado?.operador || itemAnterior.operador,
        maquina: itemAtualizado?.maquina || itemAnterior.maquina,
        usuarioId: auth.currentUser?.uid || "",
        data: agora,
        createdAt: agora,
      },
    ];

    const materialResumo = resumirMateriais(itensAtualizados);
    const medidaResumo = resumirMedidas(itensAtualizados);
    const metragemTotal = areaTotal(itensAtualizados);

    const updates = {
      itens: itensAtualizados,
      status: statusOS,
      etapa: statusOS,
      material: materialResumo,
      materialPrincipal: materialResumo,
      medida: medidaResumo,
      area: metragemTotal,
      metragemTotal,
      finalizado: statusOS === "Finalizada",
      finalizadoEm: statusOS === "Finalizada" ? agora : producao.finalizadoEm || null,
      instalacaoCriada: producao.instalacaoCriada || instalacaoCriadaAgora,
      historico,
      atualizadoEm: agora,
      updatedAt: agora,
      statusAtualizadoEm: agora,
      statusUpdatedAt: agora,
    };

    try {
      await updateDoc(doc(db, "producoes", producao.id), updates);

      if (statusOS === "Finalizada" && !producao.estoqueBaixado) {
        await baixarEstoqueDaProducao(
          {
            ...producao,
            ...updates,
          },
          itensAtualizados,
          historico,
          agora
        );
      }

      await carregarDados();
      setProducaoDetalhe((detalheAtual) =>
        detalheAtual?.id === producao.id
          ? ({
              ...detalheAtual,
              ...updates,
              estoqueBaixado:
                statusOS === "Finalizada" ? true : detalheAtual.estoqueBaixado,
            } as ProducaoIndustrial)
          : detalheAtual
      );
      mostrarToast("Item atualizado.");
    } catch (erroAtualizacao) {
      console.error(erroAtualizacao);
      alert("Erro ao atualizar item.");
    }
  }

  async function finalizarProducao(producao: ProducaoIndustrial) {
    if (finalizandoId) return;

    if (!producao.id) {
      mostrarToast("OS inválida. Atualize a página e tente novamente.");
      return;
    }

    if (!producao.itens.every((item) => item.status === "Pronto" || item.status === "Entregue")) {
      alert("Todos os itens precisam estar prontos antes de finalizar a OS.");
      return;
    }

    const confirmar = confirm(
      "Tem certeza que deseja finalizar esta OS? Ela sairá da produção ativa e irá para o histórico."
    );

    if (!confirmar) return;

    const agora = new Date();
    const tempoRealFinal = calcularTempoRealSegundos(producao, agora);
    const itensFinalizados = producao.itens.map((item, index) =>
      normalizarItemProducao(
        {
          ...item,
          status: "Entregue",
          finalizadoEm: item.finalizadoEm || agora,
          statusAtualizadoEm: agora,
          statusUpdatedAt: agora,
        },
        index,
        "Entregue"
      )
    );

    const historico: HistoricoProducao[] = [
      ...producao.historico,
      {
        tipo: "os",
        acao: "OS finalizada",
        statusAnterior: producao.status,
        statusNovo: "Finalizada",
        usuarioId: auth.currentUser?.uid || "",
        data: agora,
        createdAt: agora,
      },
    ];

    try {
      setFinalizandoId(producao.id);

      const resultadoBaixa = await baixarEstoqueDaProducao(
        producao,
        itensFinalizados,
        historico,
        agora
      );

      setProducoes((listaAtual) =>
        listaAtual.map((item) =>
          item.id === producao.id
            ? {
                ...item,
                itens: itensFinalizados,
                status: "Finalizada",
                etapa: "Finalizada",
                material: resumirMateriais(itensFinalizados),
                materialPrincipal: resumirMateriais(itensFinalizados),
                medida: resumirMedidas(itensFinalizados),
                area: areaTotal(itensFinalizados),
                metragemTotal: areaTotal(itensFinalizados),
                finalizado: true,
                finalizadoEm: agora,
                estoqueBaixado: true,
                estoqueBaixadoEm: agora,
                cronometroStatus: "finalizado",
                iniciadoEm: null,
                pausadoEm: null,
                tempoAcumuladoSegundos: tempoRealFinal,
                tempoRealSegundos: tempoRealFinal,
                historico,
                atualizadoEm: agora,
                updatedAt: agora,
                statusAtualizadoEm: agora,
                statusUpdatedAt: agora,
              }
            : item
        )
      );

      setProducaoDetalhe(null);
      setAbaAtiva("historico");
      mostrarToast(resultadoBaixa.mensagem);
    } catch (erroFinalizacao) {
      console.error(erroFinalizacao);
      mostrarToast(
        erroFinalizacao instanceof Error
          ? erroFinalizacao.message
          : "Erro ao finalizar produção."
      );
    } finally {
      setFinalizandoId("");
    }
  }

  async function excluirProducao(producao: ProducaoIndustrial) {
    const confirmar = confirm(
      `Deseja realmente excluir a produção ${producao.numeroOS}?`
    );

    if (!confirmar) return;

    try {
      await deleteDoc(doc(db, "producoes", producao.id));
      await carregarDados();
      setProducaoDetalhe(null);
      mostrarToast("Produção excluída.");
    } catch (erroExclusao) {
      console.error(erroExclusao);
      alert("Erro ao excluir produção.");
    }
  }

  return (
    <AuthGuard>
      <main className="flex min-h-screen bg-zinc-950 text-white">
        <Sidebar />

        <section className="flex-1 p-6 lg:p-10">
          {toast && (
            <div className="fixed right-6 top-6 z-50 bg-green-500 text-black rounded-2xl px-5 py-3 font-bold shadow-2xl">
              {toast}
            </div>
          )}

          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between mb-8">
            <div>
              <p className="text-green-400 font-semibold mb-2">
                Chão de fábrica
              </p>

              <h1 className="text-4xl lg:text-5xl font-black">
                Produção por Item
              </h1>

              <p className="text-zinc-400 mt-2">
                Controle industrial por peça, máquina, operador e gargalo.
              </p>
            </div>

            <button
              onClick={() => setMostrarFormulario(true)}
              className="bg-white text-black px-5 py-3 rounded-xl font-semibold hover:bg-green-400 transition"
            >
              Nova produção
            </button>
          </div>

          <div className="mb-6 inline-flex rounded-2xl border border-zinc-800 bg-zinc-900 p-1">
            <button
              onClick={() => setAbaAtiva("ativa")}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                abaAtiva === "ativa"
                  ? "bg-green-500 text-black"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              }`}
            >
              Produção ativa
            </button>
            <button
              onClick={() => setAbaAtiva("historico")}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                abaAtiva === "historico"
                  ? "bg-green-500 text-black"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              }`}
            >
              Histórico
            </button>
          </div>

          {abaAtiva === "ativa" ? (
            <>
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
            <CardIndicador titulo="OS ativas" valor={producoesAtivas.length} cor="text-white" />
            <CardIndicador titulo="Itens" valor={totalItens} cor="text-zinc-200" />
            <CardIndicador titulo="Imprimindo" valor={itensImprimindo} cor="text-blue-300" />
            <CardIndicador titulo="Problemas" valor={itensProblema} cor="text-red-300" />
            <CardIndicador titulo="Atrasadas" valor={producoesAtrasadas} cor="text-yellow-300" />
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 mb-8">
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
              <input
                placeholder="Pesquisar OS, cliente, material, operador ou máquina"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="xl:col-span-2 bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
              />

              <select
                value={filtroStatus}
                onChange={(e) =>
                  setFiltroStatus(e.target.value as StatusOSProducao | "Todos")
                }
                className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
              >
                <option value="Todos">Todos os status</option>
                {STATUS_KANBAN_PRODUCAO.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>

              <select
                value={filtroMaquina}
                onChange={(e) =>
                  setFiltroMaquina(e.target.value as MaquinaProducao | "Todas")
                }
                className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
              >
                <option value="Todas">Todas as máquinas</option>
                {MAQUINAS_PRODUCAO.map((maquina) => (
                  <option key={maquina} value={maquina}>
                    {maquina}
                  </option>
                ))}
              </select>

              <select
                value={filtroPrioridade}
                onChange={(e) =>
                  setFiltroPrioridade(
                    e.target.value as PrioridadeProducao | "Todas"
                  )
                }
                className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
              >
                <option value="Todas">Todas as prioridades</option>
                {PRIORIDADES_PRODUCAO.map((opcao) => (
                  <option key={opcao} value={opcao}>
                    {opcao}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {mostrarFormulario && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 mb-8">
              <div className="flex items-center justify-between gap-4 mb-6">
                <h2 className="text-2xl font-black">Nova produção industrial</h2>

                <button
                  onClick={() => {
                    limparFormulario();
                    setMostrarFormulario(false);
                  }}
                  className="bg-zinc-800 text-zinc-300 px-4 py-2 rounded-xl hover:bg-zinc-700"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <input
                  placeholder="Número da OS"
                  value={numeroOS}
                  onChange={(e) => setNumeroOS(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                />

                <input
                  placeholder="Cliente"
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                />

                <input
                  placeholder="Serviço / resumo"
                  value={servico}
                  onChange={(e) => setServico(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                />

                <select
                  value={prioridade}
                  onChange={(e) => setPrioridade(e.target.value as PrioridadeProducao)}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                >
                  {PRIORIDADES_PRODUCAO.map((opcao) => (
                    <option key={opcao} value={opcao}>
                      {opcao}
                    </option>
                  ))}
                </select>

                <input
                  type="date"
                  value={prazo}
                  onChange={(e) => setPrazo(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                />

                <textarea
                  placeholder="Observações da OS"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  className="lg:col-span-3 bg-zinc-950 border border-zinc-700 rounded-xl p-3 min-h-20 outline-none focus:border-green-500"
                />

                <div className="lg:col-span-4 bg-zinc-950 border border-zinc-800 rounded-3xl p-5">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-xl font-black">Itens da OS</h3>

                    <button
                      type="button"
                      onClick={adicionarItemFormulario}
                      className="bg-green-500 text-black px-4 py-2 rounded-xl font-bold hover:bg-green-400 transition"
                    >
                      Adicionar item
                    </button>
                  </div>

                  <div className="flex flex-col gap-4">
                    {itensFormulario.map((item, index) => (
                      <div
                        key={item.id}
                        className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <p className="font-black">Item {index + 1}</p>

                          <button
                            type="button"
                            onClick={() => removerItemFormulario(index)}
                            className="bg-red-500/20 text-red-300 px-3 py-2 rounded-xl text-sm hover:bg-red-500/30"
                          >
                            Remover
                          </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-6 gap-3">
                          <select
                            value={item.materialId}
                            onChange={(e) =>
                              atualizarItemFormulario(index, "materialId", e.target.value)
                            }
                            className="lg:col-span-2 bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                          >
                            <option value="">Selecionar material</option>
                            {materiais.map((material) => (
                              <option key={material.id} value={material.id}>
                                {material.nome}
                              </option>
                            ))}
                          </select>

                          <input
                            placeholder="Ou digite o material"
                            value={item.material}
                            onChange={(e) =>
                              atualizarItemFormulario(index, "material", e.target.value)
                            }
                            className="lg:col-span-2 bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                          />

                          <select
                            value={item.status}
                            onChange={(e) =>
                              atualizarItemFormulario(index, "status", e.target.value)
                            }
                            className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                          >
                            {STATUS_ITENS_PRODUCAO.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>

                          <select
                            value={item.maquina}
                            onChange={(e) =>
                              atualizarItemFormulario(index, "maquina", e.target.value)
                            }
                            className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                          >
                            <option value="">Máquina</option>
                            {MAQUINAS_PRODUCAO.map((maquina) => (
                              <option key={maquina} value={maquina}>
                                {maquina}
                              </option>
                            ))}
                          </select>

                          <input
                            placeholder="Largura"
                            inputMode="decimal"
                            value={item.largura}
                            onChange={(e) =>
                              atualizarItemFormulario(index, "largura", e.target.value)
                            }
                            className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                          />

                          <input
                            placeholder="Altura"
                            inputMode="decimal"
                            value={item.altura}
                            onChange={(e) =>
                              atualizarItemFormulario(index, "altura", e.target.value)
                            }
                            className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                          />

                          <input
                            placeholder="Quantidade"
                            inputMode="numeric"
                            value={item.quantidade}
                            onChange={(e) =>
                              atualizarItemFormulario(index, "quantidade", e.target.value)
                            }
                            className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                          />

                          <input
                            placeholder="Operador"
                            value={item.operador}
                            onChange={(e) =>
                              atualizarItemFormulario(index, "operador", e.target.value)
                            }
                            className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                          />

                          <input
                            placeholder="Acabamento"
                            value={item.acabamento}
                            onChange={(e) =>
                              atualizarItemFormulario(index, "acabamento", e.target.value)
                            }
                            className="lg:col-span-2 bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                          />

                          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
                            <p className="text-zinc-500 text-xs">Área</p>
                            <p className="font-black text-green-300">
                              {formatarArea(item.area)}
                            </p>
                          </div>

                          <textarea
                            placeholder="Observações do item"
                            value={item.observacoes}
                            onChange={(e) =>
                              atualizarItemFormulario(index, "observacoes", e.target.value)
                            }
                            className="lg:col-span-3 bg-zinc-950 border border-zinc-700 rounded-xl p-3 min-h-20 outline-none focus:border-green-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={salvarProducao}
                disabled={salvando}
                className="mt-6 bg-green-500 text-black px-5 py-3 rounded-xl font-bold disabled:opacity-50 hover:bg-green-400 transition"
              >
                {salvando ? "Salvando..." : "Salvar produção"}
              </button>
            </div>
          )}

          {carregando ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-zinc-400">
              Carregando fila industrial...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-3">
              {producoesPorStatus.map(({ status, itens }) => (
                <div
                  key={status}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 min-h-96 overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h2 className="min-w-0 font-black text-sm truncate">
                      {status}
                    </h2>

                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${classeStatusOS(
                        status
                      )}`}
                    >
                      {itens.length}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {itens.map((producao) => (
                      <CardProducao
                        key={producao.id}
                        producao={producao}
                        agora={agoraCronometro}
                        acaoCronometroId={acaoCronometroId}
                        onCronometro={(acao) =>
                          alterarCronometroProducao(producao, acao)
                        }
                        onDetalhes={() => setProducaoDetalhe(producao)}
                      />
                    ))}

                    {itens.length === 0 && (
                      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3 text-zinc-500 text-sm">
                        Sem OS neste estágio.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
            </>
          ) : (
            <HistoricoProducoes
              busca={buscaHistorico}
              onBusca={setBuscaHistorico}
              producoes={historicoFiltrado}
            />
          )}

          {producaoDetalhe && (
            <ModalProducao
              producao={producaoDetalhe}
              impressoras={impressoras}
              agora={agoraCronometro}
              finalizando={finalizandoId === producaoDetalhe.id}
              selecionandoImpressora={acaoImpressoraId === producaoDetalhe.id}
              acionandoCronometro={acaoCronometroId === producaoDetalhe.id}
              onFechar={() => setProducaoDetalhe(null)}
              onExcluir={() => excluirProducao(producaoDetalhe)}
              onFinalizar={() => finalizarProducao(producaoDetalhe)}
              onSelecionarImpressora={(impressoraId) =>
                selecionarImpressoraProducao(producaoDetalhe, impressoraId)
              }
              onCronometro={(acao) =>
                alterarCronometroProducao(producaoDetalhe, acao)
              }
              onAtualizarItem={(itemId, mudancas, acao) =>
                atualizarItemProducao(producaoDetalhe, itemId, mudancas, acao)
              }
            />
          )}
        </section>
      </main>
    </AuthGuard>
  );
}

function HistoricoProducoes({
  busca,
  onBusca,
  producoes,
}: {
  busca: string;
  onBusca: (valor: string) => void;
  producoes: ProducaoIndustrial[];
}) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-black">Histórico de produção</h2>
          <p className="mt-1 text-sm text-zinc-400">
            OS finalizadas, ordenadas da mais recente para a mais antiga.
          </p>
        </div>

        <input
          placeholder="Buscar OS, cliente ou material"
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 outline-none focus:border-green-500 lg:max-w-sm"
        />
      </div>

      {producoes.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-400">
          Nenhuma OS finalizada ainda.
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="text-zinc-500">
                <tr className="border-b border-zinc-800">
                  <th className="px-4 py-3">OS</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Material</th>
                  <th className="px-4 py-3">Metragem</th>
                  <th className="px-4 py-3">Impressora</th>
                  <th className="px-4 py-3">Estimado</th>
                  <th className="px-4 py-3">Real</th>
                  <th className="px-4 py-3">Dif.</th>
                  <th className="px-4 py-3">Finalizada em</th>
                </tr>
              </thead>

              <tbody>
                {producoes.map((producao) => (
                  <tr
                    key={producao.id}
                    className="border-b border-zinc-800/80 text-zinc-300 hover:bg-zinc-800/40"
                  >
                    <td className="px-4 py-4 align-top font-bold text-green-400 whitespace-nowrap">
                      {producao.numeroOS}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="max-w-[240px] truncate">
                        {producao.cliente || "Cliente não informado"}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="max-w-[320px] truncate">
                        {materiaisHistorico(producao.itens, producao.material)}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-zinc-200 whitespace-nowrap">
                      {formatarArea(areaTotal(producao.itens))}
                    </td>
                    <td className="px-4 py-4 align-top text-zinc-300 whitespace-nowrap">
                      {producao.impressoraNome || "-"}
                    </td>
                    <td className="px-4 py-4 align-top text-zinc-300 whitespace-nowrap">
                      {producao.tempoEstimadoMin
                        ? formatarTempoMinutos(producao.tempoEstimadoMin)
                        : "-"}
                    </td>
                    <td className="px-4 py-4 align-top text-zinc-300 whitespace-nowrap">
                      {formatarCronometro(producao.tempoRealSegundos)}
                    </td>
                    <td
                      className={`px-4 py-4 align-top font-bold whitespace-nowrap ${
                        numero(producao.tempoRealSegundos) >
                        numero(producao.tempoEstimadoMin) * 60
                          ? "text-red-300"
                          : "text-emerald-300"
                      }`}
                    >
                      {formatarDiferencaTempo(producao)}
                    </td>
                    <td className="px-4 py-4 align-top text-zinc-400 whitespace-nowrap">
                      {formatarData(producao.finalizadoEm)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-3 md:hidden">
            {producoes.map((producao) => (
              <div
                key={producao.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-green-400">
                      {producao.numeroOS}
                    </p>
                    <p className="mt-1 truncate text-sm font-bold text-zinc-200">
                      {producao.cliente || "Cliente não informado"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300">
                    Finalizada
                  </span>
                </div>

                <p className="mt-3 line-clamp-2 text-sm text-zinc-300">
                  {materiaisHistorico(producao.itens, producao.material)}
                </p>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-400">
                  <span>{formatarArea(areaTotal(producao.itens))}</span>
                  <span>{formatarData(producao.finalizadoEm)}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-400">
                  <span>Impressora: {producao.impressoraNome || "-"}</span>
                  <span>
                    Estimado:{" "}
                    {producao.tempoEstimadoMin
                      ? formatarTempoMinutos(producao.tempoEstimadoMin)
                      : "-"}
                  </span>
                  <span>Real: {formatarCronometro(producao.tempoRealSegundos)}</span>
                  <span>Dif.: {formatarDiferencaTempo(producao)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CardIndicador({
  titulo,
  valor,
  cor,
}: {
  titulo: string;
  valor: number;
  cor: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
      <p className="text-zinc-400 text-sm">{titulo}</p>
      <p className={`text-3xl font-black mt-2 ${cor}`}>{valor}</p>
    </div>
  );
}

function CardProducao({
  producao,
  agora,
  acaoCronometroId,
  onCronometro,
  onDetalhes,
}: {
  producao: ProducaoIndustrial;
  agora: Date;
  acaoCronometroId: string;
  onCronometro: (acao: "iniciar" | "pausar" | "retomar") => void;
  onDetalhes: () => void;
}) {
  const itemPrincipal = producao.itens[0];
  const statusResumo = itemPrincipal?.status || producao.status;
  const tempoRealSegundos = calcularTempoRealSegundos(producao, agora);
  const acimaEstimado = cronometroAcimaDoEstimado(producao, agora);
  const statusCronometro = producao.cronometroStatus || "parado";
  const acaoCronometro =
    statusCronometro === "rodando"
      ? "pausar"
      : statusCronometro === "pausado"
        ? "retomar"
        : "iniciar";
  const labelCronometro =
    acaoCronometro === "pausar"
      ? "Pausar"
      : acaoCronometro === "retomar"
        ? "Retomar"
        : "Iniciar";
  const atrasada = prazoAtrasado(producao);
  const prazoResumo = producao.prazo
    ? atrasada
      ? "Atrasada"
      : producao.prazo
    : "Sem prazo";
  const statusClasse =
    statusResumo === "Problema"
      ? "text-red-300"
      : statusResumo === "Fila"
      ? "text-zinc-300"
      : statusResumo === "Imprimindo" || String(statusResumo) === "Em Produção"
      ? "text-blue-300"
      : statusResumo === "Acabamento"
      ? "text-yellow-300"
      : "text-emerald-300";

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3 overflow-hidden hover:border-green-500/50 transition">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-green-400 truncate">
              {producao.numeroOS}
            </p>

            <p className="mt-1 min-w-0 text-xs text-zinc-400 truncate">
              {producao.cliente || "Cliente não informado"}
            </p>
          </div>

          <span
            className={`shrink-0 max-w-[78px] overflow-hidden text-ellipsis rounded-full border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${classePrioridade(
              producao.prioridade
            )}`}
          >
            {producao.prioridade}
          </span>
        </div>

      <div className="mt-3 flex flex-col gap-2">
        {producao.itens.length > 0 ? (
          producao.itens.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2"
            >
              <p className="min-w-0 truncate text-xs font-black text-zinc-100">
                {item.material || "Material não informado"}
              </p>
              <p className="mt-0.5 min-w-0 truncate text-[11px] text-zinc-400">
                {formatarMedidaItem(item)}
              </p>
              <p className="mt-0.5 min-w-0 truncate text-[11px] font-bold text-zinc-300">
                {formatarAreaItemProducao(item)} • Qtd{" "}
                {numero(item.quantidade) || 1}
              </p>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2">
            <p className="min-w-0 truncate text-xs font-black text-zinc-100">
              {producao.material || producao.servico || "Material não informado"}
            </p>
            <p className="mt-0.5 min-w-0 truncate text-[11px] text-zinc-400">
              Medida não informada
            </p>
            <p className="mt-0.5 min-w-0 truncate text-[11px] font-bold text-zinc-300">
              {formatarAreaCompacta(producao.area)} • Qtd 1
            </p>
          </div>
        )}
      </div>

      <p className="mt-3 min-w-0 text-xs truncate">
        <span className={`font-bold ${statusClasse}`}>{statusResumo}</span>
        <span className="text-zinc-600"> • </span>
        <span className={atrasada ? "text-red-300" : "text-zinc-400"}>
          {prazoResumo}
        </span>
      </p>

      <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/80 p-2">
        <p className="truncate text-[11px] font-bold text-zinc-300">
          Impressora: {producao.impressoraNome || "Não selecionada"}
        </p>
        <div className="mt-1 grid grid-cols-2 gap-2 text-[11px]">
          <span className="text-zinc-500">
            Estimado:{" "}
            <strong className="text-zinc-300">
              {producao.tempoEstimadoMin
                ? formatarTempoMinutos(producao.tempoEstimadoMin)
                : "-"}
            </strong>
          </span>
          <span className={acimaEstimado ? "font-bold text-red-300" : "text-zinc-500"}>
            Rodando:{" "}
            <strong className={acimaEstimado ? "text-red-300" : "text-emerald-300"}>
              {formatarCronometro(tempoRealSegundos)}
            </strong>
          </span>
        </div>
        {acimaEstimado && (
          <p className="mt-1 text-[10px] font-bold text-yellow-300">
            Acima do estimado
          </p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={onCronometro.bind(null, acaoCronometro)}
          disabled={acaoCronometroId === producao.id || producaoEstaFinalizada(producao)}
          className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-black text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {acaoCronometroId === producao.id ? "..." : labelCronometro}
        </button>

        <button
          onClick={onDetalhes}
          className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-800"
        >
          Detalhes
        </button>
      </div>
    </div>
  );
}

function MiniInfo({
  titulo,
  valor,
  destaque = "text-zinc-300",
}: {
  titulo: string;
  valor: string;
  destaque?: string;
}) {
  return (
    <div className="min-w-0 overflow-hidden bg-zinc-900 border border-zinc-800 rounded-2xl px-2 py-1.5">
      <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide">
        {titulo}
      </p>
      <p className={`mt-0.5 text-xs font-bold truncate ${destaque}`}>{valor}</p>
    </div>
  );
}

function ModalProducao({
  producao,
  impressoras,
  agora,
  finalizando,
  selecionandoImpressora,
  acionandoCronometro,
  onFechar,
  onExcluir,
  onFinalizar,
  onSelecionarImpressora,
  onCronometro,
  onAtualizarItem,
}: {
  producao: ProducaoIndustrial;
  impressoras: ImpressoraProducao[];
  agora: Date;
  finalizando: boolean;
  selecionandoImpressora: boolean;
  acionandoCronometro: boolean;
  onFechar: () => void;
  onExcluir: () => void;
  onFinalizar: () => void;
  onSelecionarImpressora: (impressoraId: string) => void;
  onCronometro: (acao: "iniciar" | "pausar" | "retomar") => void;
  onAtualizarItem: (
    itemId: string,
    mudancas: Partial<ItemProducao>,
    acao: string
  ) => void;
}) {
  const impressoraSelecionada = impressoras.find(
    (impressora) => impressora.id === producao.impressoraId
  );
  const alertaCapacidade = impressoraSelecionada
    ? validarCapacidadeImpressora(producao.itens, impressoraSelecionada)
    : "";
  const tempoRealSegundos = calcularTempoRealSegundos(producao, agora);
  const statusCronometro = producao.cronometroStatus || "parado";
  const acaoCronometro =
    statusCronometro === "rodando"
      ? "pausar"
      : statusCronometro === "pausado"
        ? "retomar"
        : "iniciar";
  const labelCronometro =
    acaoCronometro === "pausar"
      ? "Pausar"
      : acaoCronometro === "retomar"
        ? "Retomar"
        : "Iniciar";

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-7xl max-h-[90vh] overflow-y-auto">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-6">
          <div>
            <p className="text-green-400 font-semibold">Detalhes da produção</p>

            <h2 className="text-3xl font-black mt-1">
              {producao.numeroOS} • {producao.cliente || "Cliente não informado"}
            </h2>

            <p className="text-zinc-400 mt-1">{producao.servico}</p>
          </div>

          <button
            onClick={onFechar}
            className="bg-zinc-800 text-zinc-300 px-4 py-2 rounded-xl hover:bg-zinc-700"
          >
            Fechar
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
          <MiniResumo
            titulo="Status"
            valor={normalizarEtapaProducao(producao)}
            destaque={classeStatusOS(normalizarEtapaProducao(producao))}
          />
          <MiniResumo titulo="Prioridade" valor={producao.prioridade} destaque={classePrioridade(producao.prioridade)} />
          <MiniResumo titulo="Itens" valor={String(producao.itens.length)} />
          <MiniResumo titulo="Área" valor={formatarArea(producao.area)} />
          <MiniResumo titulo="Prazo" valor={producao.prazo || "Sem prazo"} />
          <MiniResumo
            titulo="Estoque"
            valor={producao.estoqueBaixado ? "Baixado" : "Pendente"}
            destaque={producao.estoqueBaixado ? "text-green-300" : "text-yellow-300"}
          />
        </div>

        <div className="mb-6 rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-zinc-500">
                Impressora da OS
              </span>
              <select
                value={producao.impressoraId || ""}
                onChange={(e) => onSelecionarImpressora(e.target.value)}
                disabled={selecionandoImpressora}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm outline-none focus:border-green-500 disabled:opacity-60"
              >
                <option value="">Selecionar impressora</option>
                {impressoras.map((impressora) => (
                  <option key={impressora.id} value={impressora.id}>
                    {impressora.nome} • {impressora.tipo || "Tipo não informado"}
                  </option>
                ))}
              </select>
              {alertaCapacidade && (
                <p className="mt-2 text-xs font-bold text-red-300">
                  {alertaCapacidade}
                </p>
              )}
            </label>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-xs font-bold text-zinc-500">Estimativa</p>
              <p className="mt-1 text-lg font-black text-emerald-300">
                {producao.tempoEstimadoMin
                  ? formatarTempoMinutos(producao.tempoEstimadoMin)
                  : "Sem estimativa"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {producao.velocidadeM2Hora
                  ? `${formatarNumeroBR(producao.velocidadeM2Hora)} m²/h • setup ${formatarTempoMinutos(
                      producao.tempoSetupMin || 0
                    )}`
                  : "Selecione uma impressora"}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-zinc-500">Cronômetro</p>
                  <p
                    className={`mt-1 text-2xl font-black ${
                      cronometroAcimaDoEstimado(producao, agora)
                        ? "text-red-300"
                        : "text-emerald-300"
                    }`}
                  >
                    {formatarCronometro(tempoRealSegundos)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-zinc-500">
                    {statusCronometro}
                  </p>
                </div>

                <button
                  onClick={() => onCronometro(acaoCronometro)}
                  disabled={acionandoCronometro || producaoEstaFinalizada(producao)}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {acionandoCronometro ? "..." : labelCronometro}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-zinc-950 border border-zinc-800 rounded-3xl p-5">
            <div className="flex items-center justify-between gap-4 mb-5">
              <h3 className="text-xl font-black">Itens industriais</h3>

              <button
                onClick={onFinalizar}
                  disabled={
                  finalizando ||
                  !producao.itens.every(
                    (item) => item.status === "Pronto" || item.status === "Entregue"
                  ) || producaoEstaFinalizada(producao)
                }
                className="bg-green-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-black px-4 py-2 rounded-xl text-sm font-bold hover:bg-green-400"
              >
                {finalizando ? "Finalizando e baixando estoque..." : "Finalizar OS"}
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {producao.itens.map((item) => (
                <div
                  key={item.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-lg font-black">
                        {item.material || "Material não informado"}
                      </p>
                      <p className="text-zinc-400 text-sm">
                        {formatarMedidaItem(item)} •{" "}
                        {formatarAreaItemProducao(item)} • Qtd{" "}
                        {numero(item.quantidade) || 1}
                      </p>
                      <p className="text-zinc-500 text-xs mt-1">
                        Parado há {tempoParadoItem(item, producao)} • Produção{" "}
                        {tempoProducaoItem(item)}
                      </p>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold border ${classeStatusItem(
                        item.status
                      )}`}
                    >
                      {item.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 mt-4">
                    <select
                      value={item.status}
                      onChange={(e) =>
                        onAtualizarItem(
                          item.id,
                          { status: e.target.value as StatusItemProducao },
                          `Status alterado para ${e.target.value}`
                        )
                      }
                      className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                    >
                      {STATUS_ITENS_PRODUCAO.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>

                    <select
                      value={item.maquina}
                      onChange={(e) =>
                        onAtualizarItem(
                          item.id,
                          { maquina: e.target.value as MaquinaProducao | "" },
                          `Máquina alterada para ${e.target.value || "não informada"}`
                        )
                      }
                      className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                    >
                      <option value="">Máquina</option>
                      {MAQUINAS_PRODUCAO.map((maquina) => (
                        <option key={maquina} value={maquina}>
                          {maquina}
                        </option>
                      ))}
                    </select>

                    <select
                      value={item.impressoraId || producao.impressoraId || ""}
                      onChange={(e) => {
                        const impressora = impressoras.find(
                          (itemImpressora) => itemImpressora.id === e.target.value
                        );
                        const tempoEstimadoMin = impressora
                          ? calcularTempoImpressaoMin(
                              calcularAreaItem(item),
                              impressora.velocidadeM2Hora,
                              impressora.tempoSetupMin
                            )
                          : 0;

                        if (impressora) {
                          const alerta = validarCapacidadeImpressora(
                            [item],
                            impressora
                          );

                          if (alerta) alert(alerta);
                        }

                        onAtualizarItem(
                          item.id,
                          {
                            impressoraId: impressora?.id || "",
                            impressoraNome: impressora?.nome || "",
                            velocidadeM2Hora: impressora?.velocidadeM2Hora || 0,
                            larguraMaximaM: impressora?.larguraMaximaM || 0,
                            tempoSetupMin: impressora?.tempoSetupMin || 0,
                            tempoEstimadoMin,
                            impressoraSelecionadaEm: impressora ? new Date() : null,
                          },
                          impressora
                            ? `Impressora do item alterada para ${impressora.nome}`
                            : "Impressora do item removida"
                        );
                      }}
                      className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                    >
                      <option value="">Impressora</option>
                      {impressoras.map((impressora) => (
                        <option key={impressora.id} value={impressora.id}>
                          {impressora.nome}
                        </option>
                      ))}
                    </select>

                    <input
                      defaultValue={item.operador}
                      placeholder="Operador"
                      onBlur={(e) =>
                        onAtualizarItem(
                          item.id,
                          { operador: e.target.value },
                          `Operador alterado para ${e.target.value || "não informado"}`
                        )
                      }
                      className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                    />

                    <input
                      defaultValue={item.acabamento}
                      placeholder="Acabamento"
                      onBlur={(e) =>
                        onAtualizarItem(
                          item.id,
                          { acabamento: e.target.value },
                          "Acabamento atualizado"
                        )
                      }
                      className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                    />

                    <input
                      defaultValue={item.observacoes}
                      placeholder="Observação"
                      onBlur={(e) =>
                        onAtualizarItem(
                          item.id,
                          { observacoes: e.target.value },
                          "Observação do item atualizada"
                        )
                      }
                      className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                    <ChecklistToggle
                      titulo="Conferido"
                      ativo={item.checklist.conferido}
                      onChange={(valor) =>
                        onAtualizarItem(
                          item.id,
                          {
                            conferido: valor,
                            checklist: {
                              ...item.checklist,
                              conferido: valor,
                            },
                          },
                          "Checklist: conferido"
                        )
                      }
                    />
                    <ChecklistToggle
                      titulo="Impressão ok"
                      ativo={item.checklist.impressaoOk}
                      onChange={(valor) =>
                        onAtualizarItem(
                          item.id,
                          {
                            checklist: {
                              ...item.checklist,
                              impressaoOk: valor,
                            },
                          },
                          "Checklist: impressão ok"
                        )
                      }
                    />
                    <ChecklistToggle
                      titulo="Acabamento ok"
                      ativo={item.checklist.acabamentoOk}
                      onChange={(valor) =>
                        onAtualizarItem(
                          item.id,
                          {
                            checklist: {
                              ...item.checklist,
                              acabamentoOk: valor,
                            },
                          },
                          "Checklist: acabamento ok"
                        )
                      }
                    />
                    <ChecklistToggle
                      titulo="Pronto entrega"
                      ativo={item.checklist.prontoParaEntrega}
                      onChange={(valor) =>
                        onAtualizarItem(
                          item.id,
                          {
                            checklist: {
                              ...item.checklist,
                              prontoParaEntrega: valor,
                            },
                          },
                          "Checklist: pronto para entrega"
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-5">
              <h3 className="text-xl font-black mb-4">Financeiro</h3>

              <div className="grid grid-cols-2 gap-3">
                <MiniInfo
                  titulo="Venda"
                  valor={formatarMoeda(producao.financeiro?.valorVenda || 0)}
                />
                <MiniInfo
                  titulo="Custo prev."
                  valor={formatarMoeda(producao.financeiro?.custoPrevisto || 0)}
                />
                <MiniInfo
                  titulo="Lucro prev."
                  valor={formatarMoeda(producao.financeiro?.lucroPrevisto || 0)}
                />
                <MiniInfo
                  titulo="Margem"
                  valor={`${Number(
                    producao.financeiro?.margemPrevista ||
                      producao.margemPrevista ||
                      0
                  ).toFixed(1)}%`}
                />
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-5">
              <h3 className="text-xl font-black mb-4">Arquivos / mockups</h3>

              <div className="flex flex-col gap-2">
                {(producao.arquivos || []).length > 0 ? (
                  producao.arquivos?.map((arquivo, index) => (
                    <a
                      key={index}
                      href={arquivo.url}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 hover:border-blue-500 transition"
                    >
                      <p className="font-semibold text-zinc-200 break-all">
                        {arquivo.nome || "Arquivo"}
                      </p>
                      <p className="text-zinc-500 text-xs">
                        {arquivo.tamanho
                          ? `${(arquivo.tamanho / 1024 / 1024).toFixed(2)} MB`
                          : "Tamanho não informado"}
                      </p>
                    </a>
                  ))
                ) : (
                  <p className="text-zinc-500">Nenhum arquivo vinculado.</p>
                )}
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-5">
              <h3 className="text-xl font-black mb-4">Observações</h3>
              <p className="text-zinc-300 min-h-16">
                {producao.observacoes || "Sem observações."}
              </p>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-5">
              <h3 className="text-xl font-black mb-4">Histórico</h3>

              <div className="flex flex-col gap-3 max-h-80 overflow-y-auto pr-1">
                {producao.historico.length > 0 ? (
                  [...producao.historico].reverse().map((item, index) => (
                    <div
                      key={index}
                      className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3"
                    >
                      <p className="font-bold text-zinc-200">{item.acao}</p>
                      <p className="text-zinc-500 text-xs mt-1">
                        {item.itemMaterial ? `${item.itemMaterial} • ` : ""}
                        {item.statusAnterior || "-"} → {item.statusNovo || "-"}
                      </p>
                      <p className="text-zinc-500 text-xs mt-1">
                        {item.operador ? `${item.operador} • ` : ""}
                        {item.maquina ? `${item.maquina} • ` : ""}
                        {formatarData(item.data)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-zinc-500">Nenhum histórico registrado.</p>
                )}
              </div>
            </div>

            <button
              onClick={onExcluir}
              className="bg-red-500/20 text-red-300 px-4 py-3 rounded-xl text-sm hover:bg-red-500/30 transition"
            >
              Excluir produção
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniResumo({
  titulo,
  valor,
  destaque = "text-zinc-200",
}: {
  titulo: string;
  valor: string;
  destaque?: string;
}) {
  const classeDestaque = destaque.includes("bg-") ? destaque : "";
  const classeTexto = destaque.includes("bg-") ? "" : destaque;

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3">
      <p className="text-zinc-500 text-xs">{titulo}</p>
      {classeDestaque ? (
        <span
          className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold border ${classeDestaque}`}
        >
          {valor}
        </span>
      ) : (
        <p className={`font-black mt-1 ${classeTexto}`}>{valor}</p>
      )}
    </div>
  );
}

function ChecklistToggle({
  titulo,
  ativo,
  onChange,
}: {
  titulo: string;
  ativo: boolean;
  onChange: (valor: boolean) => void;
}) {
  return (
    <label className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex items-center gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={ativo}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={ativo ? "text-green-300 text-sm" : "text-zinc-400 text-sm"}>
        {titulo}
      </span>
    </label>
  );
}
