"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import jsPDF from "jspdf";

import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";
import BotaoAprovar from "./components/BotaoAprovar";
import ConferenciaItens from "./components/ConferenciaItens";
import UploadArquivos from "./components/UploadArquivos";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import { auth, db } from "@/app/lib/firebase";

const CLOUD_NAME = "dgpkbynbz";
const UPLOAD_PRESET = "printflow_upload";
const TAMANHO_MAXIMO_UPLOAD_MB = 10;
const EXTENSOES_PERMITIDAS = [
  "pdf",
  "cdr",
  "png",
  "svg",
  "ai",
  "eps",
  "jpg",
  "jpeg",
  "webp",
];
const EXTENSOES_RAW = ["pdf", "cdr", "ai", "eps"];

type StatusItemConferencia = "Pendente" | "Conferido" | "Ajuste" | "Aprovado";

type ItemConferencia = {
  id: string;
  materialId: string;
  material: string;
  largura: string;
  altura: string;
  medida: string;
  area: number;
  quantidade: number;
  cor: string;
  acabamento: string;
  observacoes: string;
  status: StatusItemConferencia;
  conferido?: boolean;
  arquivoPreviewNome: string;
  arquivoPreviewUrl: string;
};

type StatusDisponibilidadeMaterial =
  | "ok"
  | "baixo"
  | "insuficiente"
  | "nao_encontrado"
  | "area_invalida";

type ConsumoMaterialArte = {
  chave: string;
  materialId: string;
  materialNome: string;
  necessarioM2: number;
  erro?: string;
};

type ResultadoMaterialEstoque = {
  chave: string;
  materialNome: string;
  necessarioM2: number;
  disponivelM2: number;
  estoqueMinimoM2: number;
  saldoPrevistoM2: number;
  status: StatusDisponibilidadeMaterial;
  mensagem: string;
};

type ResultadoValidacaoEstoque = {
  consumo: ConsumoMaterialArte[];
  itens: ResultadoMaterialEstoque[];
  bloqueado: boolean;
  temEstoqueBaixo: boolean;
  mensagensBloqueio: string[];
  mensagensAviso: string[];
};

const STATUS_ITENS: StatusItemConferencia[] = [
  "Pendente",
  "Conferido",
  "Ajuste",
  "Aprovado",
];

const PRIORIDADES = ["Normal", "Alta", "Urgente"];

function criarIdItem() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function criarItemVazio(): ItemConferencia {
  return {
    id: criarIdItem(),
    materialId: "",
    material: "",
    largura: "",
    altura: "",
    medida: "",
    area: 0,
    quantidade: 1,
    cor: "",
    acabamento: "",
    observacoes: "",
    status: "Pendente",
    arquivoPreviewNome: "",
    arquivoPreviewUrl: "",
  };
}

function numero(valor: any) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;

  const convertido = Number(String(valor || "").replace(",", "."));

  return Number.isFinite(convertido) ? convertido : 0;
}

function parseNumero(valor: any) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;

  const normalizado = String(valor || "0")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(,|$))/g, "")
    .replace(",", ".");

  const convertido = Number(normalizado);

  return Number.isFinite(convertido) ? convertido : 0;
}

function calcularAreaItem(itemOuLargura: any, altura?: any, quantidade?: any) {
  if (
    typeof itemOuLargura === "object" &&
    itemOuLargura !== null &&
    arguments.length === 1
  ) {
    const areaInformada = parseNumero(itemOuLargura.areaM2 ?? itemOuLargura.area);

    if (areaInformada > 0) return Number(areaInformada.toFixed(2));

    const areaItem =
      parseNumero(itemOuLargura.largura) *
      parseNumero(itemOuLargura.altura) *
      Math.max(parseNumero(itemOuLargura.quantidade), 1);

    return Number.isFinite(areaItem) ? Number(areaItem.toFixed(2)) : 0;
  }

  const area =
    parseNumero(itemOuLargura) *
    parseNumero(altura) *
    Math.max(parseNumero(quantidade), 1);

  return Number(area.toFixed(2));
}

function montarMedida(largura: any, altura: any) {
  if (!String(largura || "").trim() || !String(altura || "").trim()) return "";

  return `${largura} x ${altura} m`;
}

function statusItemValido(status: any): StatusItemConferencia {
  const statusNormalizado = String(status || "").trim().toLowerCase();
  const statusEncontrado = STATUS_ITENS.find(
    (item) => item.toLowerCase() === statusNormalizado
  );

  return statusEncontrado || "Pendente";
}

function normalizarItemConferencia(item: any, index: number): ItemConferencia {
  const largura = String(item?.largura || "");
  const altura = String(item?.altura || "");
  const quantidade = Math.max(numero(item?.quantidade || 1), 1);
  const medida = String(item?.medida || montarMedida(largura, altura));
  const areaInformada = numero(item?.areaM2 ?? item?.area);
  const areaCalculada = calcularAreaItem(largura, altura, quantidade);
  const statusInformado = item?.conferido ? "Conferido" : item?.status;

  return {
    id: String(item?.id || `item-${index + 1}`),
    materialId: String(item?.materialId || ""),
    material: String(item?.material || item?.servico || ""),
    largura,
    altura,
    medida,
    area: areaInformada > 0 ? areaInformada : areaCalculada,
    quantidade,
    cor: String(item?.cor || ""),
    acabamento: String(item?.acabamento || ""),
    observacoes: String(item?.observacoes || item?.comentario || ""),
    status: statusItemValido(statusInformado),
    conferido: Boolean(item?.conferido || statusInformado === "Conferido" || statusInformado === "Aprovado"),
    arquivoPreviewNome: String(item?.arquivoPreviewNome || ""),
    arquivoPreviewUrl: String(item?.arquivoPreviewUrl || ""),
  };
}

function normalizarItensConferencia(itens: any[] = []) {
  return itens.map((item, index) => normalizarItemConferencia(item, index));
}

function itemEstaConferido(item: ItemConferencia) {
  const status = String(item.status || "").trim().toLowerCase();

  return Boolean(
    item.conferido === true ||
      status === "conferido" ||
      status === "aprovado"
  );
}

function itensDaArte(arte: any) {
  return normalizarItensConferencia(arte?.itensConferencia || arte?.itens || []);
}

function arteEstaAprovada(status: string) {
  return (
    status === "Aprovado" ||
    status === "Aprovada" ||
    status === "Enviado para produção" ||
    status === "Enviado para producao"
  );
}

function todosItensConferidos(itens: any[] = []) {
  const itensNormalizados = normalizarItensConferencia(itens);

  return (
    itensNormalizados.length > 0 &&
    itensNormalizados.every((item) => {
      const status = String(item.status || "").trim().toLowerCase();

      return (
        item.conferido === true ||
        status === "conferido" ||
        status === "aprovado"
      );
    })
  );
}

function temArquivoOuMockup(arte: any) {
  return (
    (Array.isArray(arte?.arquivos) && arte.arquivos.length > 0) ||
    (Array.isArray(arte?.mockups) && arte.mockups.length > 0) ||
    (Array.isArray(arte?.arquivosAprovados) && arte.arquivosAprovados.length > 0)
  );
}

function arteJaAprovada(arte: any) {
  return Boolean(arte?.aprovadoPeloCliente === true || arteEstaAprovada(arte?.status));
}

function motivoBloqueioAprovacao(arte: any, itens: any[], carregando = false) {
  if (carregando) return "Aguarde o processamento.";
  if (!todosItensConferidos(itens)) return "Confira todos os itens";
  if (!temArquivoOuMockup(arte)) return "Adicione arquivo ou mockup";
  if (arteJaAprovada(arte)) return "Arte já aprovada";

  return "";
}

function podeAprovarArte(arte: any, itens: any[], carregando = false) {
  return !motivoBloqueioAprovacao(arte, itens, carregando);
}

function areaTotalItens(itens: ItemConferencia[]) {
  return itens.reduce((total, item) => total + numero(item.area), 0);
}

function resumoMateriais(itens: ItemConferencia[]) {
  const materiais = itens
    .map((item) => item.material.trim())
    .filter(Boolean);

  return Array.from(new Set(materiais)).join(" + ");
}

function resumoMedidas(itens: ItemConferencia[]) {
  const medidas = itens.map((item) => item.medida.trim()).filter(Boolean);

  return medidas.join(" + ");
}

function formatarArea(area: any) {
  const valor = numero(area);

  return valor > 0 ? `${valor.toFixed(2)} m²` : "0,00 m²";
}

function formatarM2(valor: any) {
  return `${parseNumero(valor).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m²`;
}

function normalizarMaterialNome(nome: any) {
  return String(nome || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function nomeMaterialEstoque(material: any) {
  return String(material?.nome || material?.materialNome || material?.material || "").trim();
}

function estoqueAtualMaterial(material: any) {
  return parseNumero(
    material?.estoqueM2 ??
      material?.metragemAtual ??
      material?.quantidadeM2 ??
      material?.saldoM2 ??
      material?.quantidade
  );
}

function estoqueMinimoMaterial(material: any) {
  return parseNumero(
    material?.estoqueMinimo ??
      material?.estoqueMinimoM2 ??
      material?.minimoM2 ??
      material?.saldoMinimo ??
      material?.minimo
  );
}

function encontrarMaterialEstoque(item: Partial<ItemConferencia> | ConsumoMaterialArte, materiais: any[]) {
  const materialId = String(item.materialId || "").trim();
  const materialNome = String(
    "materialNome" in item ? item.materialNome : item.material || ""
  ).trim();

  if (materialId) {
    const porId = materiais.find((material) => material.id === materialId);
    if (porId) return porId;
  }

  const nomeItem = normalizarMaterialNome(materialNome);

  if (!nomeItem) return null;

  const porNomeExato = materiais.find((material) => nomeMaterialEstoque(material) === materialNome);
  if (porNomeExato) return porNomeExato;

  const porNomeNormalizado = materiais.find(
    (material) => normalizarMaterialNome(nomeMaterialEstoque(material)) === nomeItem
  );
  if (porNomeNormalizado) return porNomeNormalizado;

  return (
    materiais.find((material) => {
      const nomeMaterial = normalizarMaterialNome(nomeMaterialEstoque(material));

      return (
        Boolean(nomeMaterial) &&
        (nomeMaterial.includes(nomeItem) || nomeItem.includes(nomeMaterial))
      );
    }) || null
  );
}

function agruparConsumoPorMaterial(itens: ItemConferencia[]) {
  const consumoPorMaterial = new Map<string, ConsumoMaterialArte>();

  itens.forEach((item, index) => {
    const materialNome = String(item.material || item.materialId || "").trim();
    const necessarioM2 = calcularAreaItem(item);
    const chave =
      item.materialId ||
      normalizarMaterialNome(materialNome) ||
      `item-sem-material-${index + 1}`;
    const consumoAtual = consumoPorMaterial.get(chave);
    const erro = !materialNome
      ? `Item ${index + 1} sem material informado.`
      : necessarioM2 <= 0
        ? `Área inválida para ${materialNome}. Confira largura, altura e quantidade.`
        : consumoAtual?.erro;

    consumoPorMaterial.set(chave, {
      chave,
      materialId: item.materialId || consumoAtual?.materialId || "",
      materialNome: materialNome || consumoAtual?.materialNome || `Item ${index + 1}`,
      necessarioM2: Number(
        ((consumoAtual?.necessarioM2 || 0) + Math.max(necessarioM2, 0)).toFixed(2)
      ),
      erro,
    });
  });

  return Array.from(consumoPorMaterial.values());
}

function validarDisponibilidadeEstoque(
  itens: ItemConferencia[],
  materiaisEstoque: any[]
): ResultadoValidacaoEstoque {
  const materiaisAtivos = materiaisEstoque.filter((material) => material.ativo !== false);
  const consumo = agruparConsumoPorMaterial(itens);
  const resultados = consumo.map((itemConsumo) => {
    if (itemConsumo.erro) {
      return {
        chave: itemConsumo.chave,
        materialNome: itemConsumo.materialNome,
        necessarioM2: itemConsumo.necessarioM2,
        disponivelM2: 0,
        estoqueMinimoM2: 0,
        saldoPrevistoM2: 0,
        status: "area_invalida" as StatusDisponibilidadeMaterial,
        mensagem: itemConsumo.erro,
      };
    }

    const materialEncontrado = encontrarMaterialEstoque(itemConsumo, materiaisAtivos);

    if (!materialEncontrado) {
      return {
        chave: itemConsumo.chave,
        materialNome: itemConsumo.materialNome,
        necessarioM2: itemConsumo.necessarioM2,
        disponivelM2: 0,
        estoqueMinimoM2: 0,
        saldoPrevistoM2: 0,
        status: "nao_encontrado" as StatusDisponibilidadeMaterial,
        mensagem: `Material ${itemConsumo.materialNome} não encontrado no estoque. Cadastre ou vincule esse material antes de enviar para produção.`,
      };
    }

    const disponivelM2 = estoqueAtualMaterial(materialEncontrado);
    const estoqueMinimoM2 = estoqueMinimoMaterial(materialEncontrado);
    const saldoPrevistoM2 = Number((disponivelM2 - itemConsumo.necessarioM2).toFixed(2));

    if (disponivelM2 < itemConsumo.necessarioM2) {
      return {
        chave: itemConsumo.chave,
        materialNome: nomeMaterialEstoque(materialEncontrado) || itemConsumo.materialNome,
        necessarioM2: itemConsumo.necessarioM2,
        disponivelM2,
        estoqueMinimoM2,
        saldoPrevistoM2,
        status: "insuficiente" as StatusDisponibilidadeMaterial,
        mensagem: `Estoque insuficiente para ${itemConsumo.materialNome}. Disponível: ${formatarM2(disponivelM2)}. Necessário: ${formatarM2(itemConsumo.necessarioM2)}.`,
      };
    }

    if (saldoPrevistoM2 < estoqueMinimoM2) {
      return {
        chave: itemConsumo.chave,
        materialNome: nomeMaterialEstoque(materialEncontrado) || itemConsumo.materialNome,
        necessarioM2: itemConsumo.necessarioM2,
        disponivelM2,
        estoqueMinimoM2,
        saldoPrevistoM2,
        status: "baixo" as StatusDisponibilidadeMaterial,
        mensagem: `Atenção: após esta produção, o material ${itemConsumo.materialNome} ficará com estoque baixo. Saldo previsto: ${formatarM2(saldoPrevistoM2)}.`,
      };
    }

    return {
      chave: itemConsumo.chave,
      materialNome: nomeMaterialEstoque(materialEncontrado) || itemConsumo.materialNome,
      necessarioM2: itemConsumo.necessarioM2,
      disponivelM2,
      estoqueMinimoM2,
      saldoPrevistoM2,
      status: "ok" as StatusDisponibilidadeMaterial,
      mensagem: "OK",
    };
  });

  const mensagensBloqueio = resultados
    .filter((item) =>
      ["insuficiente", "nao_encontrado", "area_invalida"].includes(item.status)
    )
    .map((item) => item.mensagem);
  const mensagensAviso = resultados
    .filter((item) => item.status === "baixo")
    .map((item) => item.mensagem);

  return {
    consumo,
    itens: resultados,
    bloqueado: mensagensBloqueio.length > 0,
    temEstoqueBaixo: mensagensAviso.length > 0,
    mensagensBloqueio,
    mensagensAviso,
  };
}

function motivoBloqueioEstoque(resultado: ResultadoValidacaoEstoque) {
  return resultado.mensagensBloqueio[0] || "";
}

function limitarTexto(texto: string, limite = 80) {
  if (!texto || texto.length <= limite) return texto || "-";

  return `${texto.slice(0, limite - 3)}...`;
}

function classeStatusArte(status: string) {
  if (arteEstaAprovada(status)) return "bg-green-500/20 text-green-300 border-green-500/30";
  if (status === "Ajuste") return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
  if (status === "Reprovada") return "bg-red-500/20 text-red-300 border-red-500/30";
  if (status === "Aguardando aprovação do cliente") {
    return "bg-blue-500/20 text-blue-300 border-blue-500/30";
  }

  return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
}

function classeStatusItem(status: string) {
  if (status === "Aprovado" || status === "Conferido") {
    return "bg-green-500/20 text-green-300 border-green-500/30";
  }

  if (status === "Ajuste") {
    return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
  }

  return "bg-zinc-800 text-zinc-300 border-zinc-700";
}

function classePrioridade(prioridade: string) {
  if (prioridade === "Urgente") return "bg-red-500/20 text-red-300 border-red-500/30";
  if (prioridade === "Alta") return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";

  return "bg-zinc-800 text-zinc-300 border-zinc-700";
}

function ehImagem(arquivo: any) {
  const tipo = String(arquivo?.tipo || "");
  const url = String(arquivo?.url || "").toLowerCase();

  return (
    tipo.startsWith("image/") ||
    url.endsWith(".png") ||
    url.endsWith(".jpg") ||
    url.endsWith(".jpeg") ||
    url.endsWith(".webp") ||
    url.endsWith(".svg")
  );
}

function deduplicarArquivos(arquivos: any[] = []) {
  const vistos = new Set<string>();

  return arquivos.filter((arquivo) => {
    const chaves = [
      arquivo?.url,
      arquivo?.secure_url,
      arquivo?.nome,
      arquivo?.filename,
      arquivo?.publicId,
      arquivo?.public_id,
    ]
      .map((valor) => String(valor || "").trim().toLowerCase())
      .filter(Boolean);

    if (chaves.length === 0) return true;

    const jaExiste = chaves.some((chave) => vistos.has(chave));

    chaves.forEach((chave) => vistos.add(chave));

    return !jaExiste;
  });
}

function deduplicarMockups(mockups: any[] = []) {
  const vistos = new Set<string>();

  return mockups.filter((mockup) => {
    const chaves = [
      mockup?.url,
      mockup?.secure_url,
      mockup?.nome,
      mockup?.filename,
      mockup?.name,
      mockup?.nome || mockup?.filename || mockup?.name
        ? `${mockup?.nome || mockup?.filename || mockup?.name}:${mockup?.size || ""}`
        : "",
    ]
      .map((valor) => String(valor || "").trim().toLowerCase())
      .filter(Boolean);

    if (chaves.length === 0) return true;

    const jaExiste = chaves.some((chave) => vistos.has(chave));

    chaves.forEach((chave) => vistos.add(chave));

    return !jaExiste;
  });
}

function obterTimestamp(data: any) {
  if (!data) return 0;
  if (data.seconds) return data.seconds * 1000;
  if (data.toDate) return data.toDate().getTime();
  if (data instanceof Date) return data.getTime();

  const convertido = new Date(data).getTime();

  return Number.isNaN(convertido) ? 0 : convertido;
}

function obterTimestampAprovacaoArte(arte: any) {
  return obterTimestamp(
    arte?.aprovadoEm ||
      arte?.enviadoParaProducaoEm ||
      arte?.atualizadoEm ||
      arte?.criadoEm
  );
}

function formatarDataAprovacaoArte(arte: any) {
  const timestamp = obterTimestampAprovacaoArte(arte);

  if (!timestamp) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function logDebugProducao(...args: unknown[]) {
  if (process.env.NODE_ENV === "development") {
    console.log("[PrintFlow Aprovação -> Produção]", ...args);
  }
}

export default function AprovacaoPage() {
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [arteEditandoId, setArteEditandoId] = useState("");
  const [arteDetalhe, setArteDetalhe] = useState<any>(null);
  const [artes, setArtes] = useState<any[]>([]);
  const [materiais, setMateriais] = useState<any[]>([]);
  const [uploadando, setUploadando] = useState(false);
  const [processandoArteId, setProcessandoArteId] = useState("");
  const [verificandoEstoqueId, setVerificandoEstoqueId] = useState("");
  const [verificandoEstoqueConferencia, setVerificandoEstoqueConferencia] =
    useState(false);
  const [resultadoEstoqueConferencia, setResultadoEstoqueConferencia] =
    useState<ResultadoValidacaoEstoque | null>(null);
  const [erroEstoqueConferencia, setErroEstoqueConferencia] = useState("");
  const [alertaEstoqueBaixo, setAlertaEstoqueBaixo] = useState<{
    arte: any;
    acao: "aprovar" | "gerar";
    resultado: ResultadoValidacaoEstoque;
  } | null>(null);
  const [toast, setToast] = useState("");
  const [busca, setBusca] = useState("");

  const [cliente, setCliente] = useState("");
  const [nomeArte, setNomeArte] = useState("");
  const [comentario, setComentario] = useState("");
  const [prioridade, setPrioridade] = useState("Normal");

  const [arquivos, setArquivos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [arquivosExistentes, setArquivosExistentes] = useState<any[]>([]);
  const [mockupPasteAtivo, setMockupPasteAtivo] = useState(false);

  const [itensConferencia, setItensConferencia] = useState<ItemConferencia[]>([
    criarItemVazio(),
  ]);

  const [naoEFachada, setNaoEFachada] = useState(false);
  const [fotoFachada, setFotoFachada] = useState<File | null>(null);
  const [logoCliente, setLogoCliente] = useState<File | null>(null);
  const [descricaoServico, setDescricaoServico] = useState("");
  const [previewIA, setPreviewIA] = useState("");

  const arquivosFormulario = useMemo(() => {
    const existentes = arquivosExistentes.map((arquivo) => ({
      nome: arquivo.nome,
      url: arquivo.url || "",
    }));

    const novos = arquivos.map((arquivo) => ({
      nome: arquivo.name,
      url: "",
    }));

    return [...existentes, ...novos].filter((arquivo) => arquivo.nome);
  }, [arquivos, arquivosExistentes]);

  function mostrarToast(mensagem: string) {
    setToast(mensagem);
    window.setTimeout(() => setToast(""), 3500);
  }

  const artesFiltradas = useMemo(() => {
    const termo = busca.toLowerCase().trim();

    return artes.filter((arte) => {
      const itens = itensDaArte(arte);
      const materiaisResumo = resumoMateriais(itens);

      if (!termo) return true;

      return (
        String(arte.numeroOS || "").toLowerCase().includes(termo) ||
        String(arte.cliente || "").toLowerCase().includes(termo) ||
        String(arte.nomeArte || "").toLowerCase().includes(termo) ||
        String(arte.status || "").toLowerCase().includes(termo) ||
        materiaisResumo.toLowerCase().includes(termo)
      );
    });
  }, [artes, busca]);

  const artesPendentes = artesFiltradas.filter(
    (arte) => !arteEstaAprovada(arte.status)
  );

  const artesAprovadas = artesFiltradas
    .filter((arte) => arteEstaAprovada(arte.status))
    .sort(
      (a, b) => obterTimestampAprovacaoArte(b) - obterTimestampAprovacaoArte(a)
    );

  const totalUrgentes = artesFiltradas.filter(
    (arte) => arte.prioridade === "Urgente"
  ).length;

  const totalAjustes = artesFiltradas.filter((arte) => {
    const itens = itensDaArte(arte);

    return (
      arte.status === "Ajuste" ||
      itens.some((item) => item.status === "Ajuste")
    );
  }).length;

  async function carregarArtes() {
    const querySnapshot = await getDocs(collection(db, "artes"));
    const lista: any[] = [];

    querySnapshot.forEach((documento) => {
      lista.push({
        id: documento.id,
        ...documento.data(),
      });
    });

    lista.sort((a, b) => obterTimestamp(b.criadoEm) - obterTimestamp(a.criadoEm));

    setArtes(lista);
  }

  async function carregarMateriaisEstoqueAtual() {
    const querySnapshot = await getDocs(collection(db, "materiais"));
    const lista: any[] = [];

    querySnapshot.forEach((documento) => {
      const dados = documento.data();

      if (dados.ativo !== false) {
        lista.push({
          id: documento.id,
          ...dados,
        });
      }
    });

    lista.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));

    setMateriais(lista);

    return lista;
  }

  async function carregarMateriais() {
    try {
      await carregarMateriaisEstoqueAtual();
    } catch (erro) {
      console.error(erro);
      mostrarToast("Não foi possível carregar os materiais do estoque.");
    }
  }

  useEffect(() => {
    carregarArtes();
    carregarMateriais();
  }, []);

  useEffect(() => {
    return () => {
      previews.forEach((preview) => {
        if (preview) URL.revokeObjectURL(preview);
      });
    };
  }, [previews]);

  async function gerarPDFOS(producao: any) {
    try {
      const pdf = new jsPDF("p", "mm", "a4");
      const larguraPagina = 210;
      const margem = 12;
      const larguraUtil = larguraPagina - margem * 2;
      const dataGeracao = new Date();

      const numeroOS = producao.numeroOS || "Sem OS";
      const clienteNome = producao.cliente || "Cliente não informado";
      const servico = producao.servico || producao.nomeArte || "Serviço não informado";
      const prioridadeAtual = producao.prioridade || "Normal";
      const status = producao.status || "Fila";
      const prazo = producao.prazo || "Sem prazo";
      const telefone =
        producao.telefone ||
        producao.whatsapp ||
        producao.clienteTelefone ||
        "Não informado";
      const responsavel =
        producao.vendedor ||
        producao.responsavel ||
        producao.responsavelComercial ||
        "Não informado";
      const observacoes = producao.observacoes || "Sem observações.";
      const observacoesProducao =
        producao.observacoesProducao ||
        producao.comentario ||
        producao.observacoes ||
        "Sem observações de produção.";
      const observacoesAcabamento =
        producao.observacoesAcabamento ||
        producao.acabamento ||
        "Sem observações de acabamento.";
      const observacoesInstalacao =
        producao.observacoesInstalacao ||
        producao.enderecoInstalacao ||
        "Sem observações de entrega/instalação.";
      const sentidoImpressao = producao.sentidoImpressao || "Não informado";
      const itens = normalizarItensConferencia(
        producao.itensConferencia || producao.itens || []
      );
      const arquivosAprovados = deduplicarArquivos([
        ...(producao.arquivos || []),
        ...(producao.mockups || []),
        ...(producao.arquivosAprovados || []),
      ]);
      const linkConsulta =
        typeof window !== "undefined"
          ? `${window.location.origin}/producoes`
          : "http://localhost:3000/producoes";
      const qrCode = await QRCode.toDataURL(linkConsulta);

      let y = 14;

      const texto = (
        conteudo: string,
        x: number,
        yAtual: number,
        opcoes: {
          tamanho?: number;
          peso?: "normal" | "bold";
          cor?: [number, number, number];
          larguraMaxima?: number;
          alinhar?: "left" | "center" | "right";
        } = {}
      ) => {
        pdf.setFont("helvetica", opcoes.peso || "normal");
        pdf.setFontSize(opcoes.tamanho || 10);
        pdf.setTextColor(...(opcoes.cor || [32, 32, 32]));

        if (opcoes.larguraMaxima) {
          pdf.text(
            pdf.splitTextToSize(String(conteudo || ""), opcoes.larguraMaxima),
            x,
            yAtual,
            { align: opcoes.alinhar || "left" }
          );
          return;
        }

        pdf.text(String(conteudo || ""), x, yAtual, {
          align: opcoes.alinhar || "left",
        });
      };

      const novaPaginaSePreciso = (alturaNecessaria = 18) => {
        if (y + alturaNecessaria <= 276) return;
        pdf.addPage();
        y = 14;
      };

      const blocoTitulo = (titulo: string) => {
        novaPaginaSePreciso(18);
        pdf.setFillColor(244, 244, 245);
        pdf.setDrawColor(212, 212, 216);
        pdf.roundedRect(margem, y, larguraUtil, 10, 2, 2, "FD");
        texto(titulo.toUpperCase(), margem + 4, y + 6.6, {
          tamanho: 9,
          peso: "bold",
          cor: [24, 24, 27],
        });
        y += 14;
      };

      const linhaCampo = (
        rotulo: string,
        valor: any,
        x: number,
        largura: number,
        yAtual: number
      ) => {
        texto(rotulo.toUpperCase(), x, yAtual, {
          tamanho: 7,
          peso: "bold",
          cor: [113, 113, 122],
        });
        texto(String(valor || "Não informado"), x, yAtual + 5, {
          tamanho: 9,
          peso: "bold",
          cor: [24, 24, 27],
          larguraMaxima: largura,
        });
      };

      const desenharCampoGrande = (rotulo: string, valor: string) => {
        novaPaginaSePreciso(24);
        const linhas = pdf.splitTextToSize(valor || "Não informado", larguraUtil - 8);
        const altura = Math.max(18, linhas.length * 5 + 12);
        pdf.setDrawColor(228, 228, 231);
        pdf.roundedRect(margem, y, larguraUtil, altura, 2, 2);
        texto(rotulo.toUpperCase(), margem + 4, y + 6, {
          tamanho: 7,
          peso: "bold",
          cor: [113, 113, 122],
        });
        pdf.text(linhas, margem + 4, y + 12);
        y += altura + 5;
      };

      const formatarMetro = (valor: any) => {
        const numeroMetro = parseNumero(valor);
        return numeroMetro > 0
          ? `${numeroMetro.toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}m`
          : "Não informado";
      };

      const nomeArquivo = (arquivo: any) =>
        String(
          arquivo?.nome ||
            arquivo?.filename ||
            arquivo?.publicId ||
            arquivo?.public_id ||
            arquivo?.url ||
            arquivo?.secure_url ||
            "Arquivo aprovado"
        );

      const tipoArquivo = (arquivo: any) => {
        const nome = nomeArquivo(arquivo).toLowerCase();
        const url = String(arquivo?.url || arquivo?.secure_url || "").toLowerCase();
        const base = `${nome} ${url}`;

        if (base.includes(".pdf")) return "PDF";
        if (base.includes(".cdr")) return "CDR";
        if (base.includes(".ai")) return "AI";
        if (base.includes(".eps")) return "EPS";
        if (base.includes(".svg")) return "SVG";
        if (ehImagem(arquivo)) return "Imagem";

        return String(arquivo?.tipo || "Arquivo").split("/").pop()?.toUpperCase() || "Arquivo";
      };

      const tipoImagemPDF = (arquivo: any) => {
        const referencia = String(
          arquivo?.url || arquivo?.secure_url || arquivo?.nome || arquivo?.filename || ""
        ).toLowerCase();

        if (referencia.includes(".png")) return "PNG";
        if (referencia.includes(".webp")) return "WEBP";

        return "JPEG";
      };

      const arquivoVinculadoItem = (item: any, index: number) => {
        const porPreview = item.arquivoPreviewNome || item.arquivoPreviewUrl;
        if (porPreview) return item.arquivoPreviewNome || item.arquivoPreviewUrl;

        return arquivosAprovados[index] ? nomeArquivo(arquivosAprovados[index]) : "Não informado";
      };

      pdf.setFillColor(24, 24, 27);
      pdf.rect(0, 0, larguraPagina, 36, "F");
      texto("PRINTFLOW", margem, 14, {
        tamanho: 19,
        peso: "bold",
        cor: [255, 255, 255],
      });
      texto("Ordem de Serviço para Produção", margem, 23, {
        tamanho: 10,
        cor: [228, 228, 231],
      });
      texto(numeroOS, 150, 16, {
        tamanho: 15,
        peso: "bold",
        cor: [255, 255, 255],
      });
      texto(`Prioridade: ${prioridadeAtual}`, 150, 25, {
        tamanho: 9,
        peso: "bold",
        cor: prioridadeAtual === "Urgente" ? [252, 165, 165] : [187, 247, 208],
      });
      pdf.addImage(qrCode, "PNG", 178, 39, 20, 20);
      texto("Abrir OS", 188, 63, {
        tamanho: 7,
        peso: "bold",
        cor: [82, 82, 91],
        alinhar: "center",
      });

      y = 46;
      texto(`Gerada em ${dataGeracao.toLocaleString("pt-BR")}`, margem, y, {
        tamanho: 8,
        cor: [82, 82, 91],
      });
      y += 8;

      blocoTitulo("Dados principais");
      pdf.setDrawColor(228, 228, 231);
      pdf.roundedRect(margem, y, larguraUtil, 34, 2, 2);
      linhaCampo("Número da OS", numeroOS, margem + 4, 42, y + 7);
      linhaCampo("Cliente", clienteNome, margem + 50, 60, y + 7);
      linhaCampo("Telefone/WhatsApp", telefone, margem + 116, 36, y + 7);
      linhaCampo("Prazo", prazo, margem + 156, 32, y + 7);
      linhaCampo("Serviço", servico, margem + 4, 54, y + 22);
      linhaCampo("Status", status, margem + 64, 38, y + 22);
      linhaCampo("Prioridade", prioridadeAtual, margem + 106, 34, y + 22);
      linhaCampo("Responsável", responsavel, margem + 144, 44, y + 22);
      y += 42;

      blocoTitulo("Ficha técnica de produção");
      if (itens.length > 0) {
        itens.forEach((item, index) => {
          const linhasObservacao = pdf.splitTextToSize(
            item.observacoes || "Não informado",
            larguraUtil - 8
          );
          const alturaItem = Math.max(50, 45 + linhasObservacao.length * 4);

          novaPaginaSePreciso(alturaItem + 4);
          pdf.setDrawColor(212, 212, 216);
          pdf.roundedRect(margem, y, larguraUtil, alturaItem, 2, 2, "S");
          pdf.setFillColor(39, 39, 42);
          pdf.roundedRect(margem, y, 28, 9, 2, 2, "F");
          texto(`ITEM ${String(index + 1).padStart(2, "0")}`, margem + 4, y + 6.2, {
            tamanho: 8,
            peso: "bold",
            cor: [255, 255, 255],
          });

          const medida =
            item.largura && item.altura
              ? `${formatarMetro(item.largura)} x ${formatarMetro(item.altura)}`
              : item.medida || "Medida não informada";

          linhaCampo("Material", item.material || "Material não informado", margem + 4, 62, y + 16);
          linhaCampo("Medida final", medida, margem + 72, 44, y + 16);
          linhaCampo("Área", formatarArea(item.area), margem + 122, 28, y + 16);
          linhaCampo("Qtd", item.quantidade || 1, margem + 154, 18, y + 16);
          linhaCampo("Cor", item.cor || "Não informado", margem + 176, 18, y + 16);
          linhaCampo("Acabamento", item.acabamento || "Não informado", margem + 4, 70, y + 31);
          linhaCampo("Arquivo aprovado", arquivoVinculadoItem(item, index), margem + 80, 72, y + 31);
          linhaCampo("Status", item.status || "Pendente", margem + 158, 32, y + 31);

          texto("OBSERVAÇÕES DO ITEM", margem + 4, y + 46, {
            tamanho: 7,
            peso: "bold",
            cor: [113, 113, 122],
          });
          pdf.text(linhasObservacao, margem + 4, y + 51);
          y += alturaItem + 5;
        });
      } else {
        texto("Nenhum item técnico vinculado à OS.", margem, y, {
          tamanho: 10,
          cor: [82, 82, 91],
        });
        y += 10;
      }

      blocoTitulo("Informações importantes para produção");
      const conferencias = [
        ["Medida final conferida", "Sim"],
        ["Material conferido", "Sim"],
        ["Arte aprovada", producao.aprovadoPeloCliente || status === "Aprovado" ? "Sim" : "Conferir"],
        ["Cores conferidas", "Conferir na produção"],
        ["Acabamento conferido", "Conferir na produção"],
        ["Sentido de impressão", sentidoImpressao],
      ];
      pdf.setDrawColor(228, 228, 231);
      pdf.roundedRect(margem, y, larguraUtil, 34, 2, 2);
      conferencias.forEach(([rotulo, valor], index) => {
        const coluna = index % 3;
        const linha = Math.floor(index / 3);
        linhaCampo(rotulo, valor, margem + 4 + coluna * 62, 56, y + 7 + linha * 15);
      });
      y += 42;

      blocoTitulo("Observações");
      desenharCampoGrande("Observações gerais", observacoes);
      desenharCampoGrande("Observações de produção", observacoesProducao);
      desenharCampoGrande("Observações de acabamento", observacoesAcabamento);
      desenharCampoGrande("Observações de entrega/instalação", observacoesInstalacao);

      blocoTitulo("Mockups / arquivos aprovados");
      if (arquivosAprovados.length === 0) {
        texto("Nenhum mockup anexado.", margem, y, {
          tamanho: 10,
          cor: [82, 82, 91],
        });
        y += 10;
      } else {
        let imagensNaPagina = 0;

        for (let index = 0; index < arquivosAprovados.length; index++) {
          const arquivo = arquivosAprovados[index];
          const nome = nomeArquivo(arquivo);

          if (ehImagem(arquivo)) {
            if (imagensNaPagina >= 2 || y > 204) {
              pdf.addPage();
              y = 16;
              imagensNaPagina = 0;
            }

            try {
              const urlArquivo = arquivo.url || arquivo.secure_url;
              if (!urlArquivo) throw new Error("Arquivo sem URL.");

              const response = await fetch(urlArquivo);
              const blob = await response.blob();
              const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();

                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error("Falha ao ler imagem."));
                reader.readAsDataURL(blob);
              });

              pdf.setDrawColor(212, 212, 216);
              pdf.roundedRect(margem, y, larguraUtil, 86, 2, 2);
              texto(`Mockup ${index + 1}`, margem + 4, y + 7, {
                tamanho: 8,
                peso: "bold",
                cor: [39, 39, 42],
              });
              pdf.addImage(base64, tipoImagemPDF(arquivo), margem + 4, y + 11, 108, 62);
              pdf.setDrawColor(180, 180, 180);
              pdf.rect(margem + 4, y + 11, 108, 62);
              texto(nome, margem + 118, y + 18, {
                tamanho: 9,
                peso: "bold",
                cor: [39, 39, 42],
                larguraMaxima: 70,
              });
              texto(`Tipo: ${tipoArquivo(arquivo)}`, margem + 118, y + 34, {
                tamanho: 8,
                cor: [82, 82, 91],
              });
              y += 92;
              imagensNaPagina += 1;
            } catch (erro) {
              console.error("Erro ao carregar imagem da OS:", erro);
              pdf.setDrawColor(228, 228, 231);
              pdf.roundedRect(margem, y, larguraUtil, 18, 2, 2);
              texto(`Imagem não carregada: ${nome}`, margem + 4, y + 11, {
                tamanho: 9,
                cor: [82, 82, 91],
                larguraMaxima: larguraUtil - 8,
              });
              y += 23;
            }
          } else {
            novaPaginaSePreciso(18);
            pdf.setDrawColor(228, 228, 231);
            pdf.roundedRect(margem, y, larguraUtil, 15, 2, 2);
            texto(`${index + 1}. ${nome}`, margem + 4, y + 9, {
              tamanho: 9,
              peso: "bold",
              cor: [39, 39, 42],
              larguraMaxima: 136,
            });
            texto(tipoArquivo(arquivo), margem + 162, y + 9, {
              tamanho: 8,
              peso: "bold",
              cor: [82, 82, 91],
            });
            y += 19;
          }
        }
      }

      blocoTitulo("Checklist de produção");
      const checklist = [
        "Conferir OS",
        "Conferir medida final",
        "Conferir material",
        "Conferir arquivo aprovado",
        "Conferir cor / escala / orientação",
        "Conferir acabamento",
        "Produzir",
        "Revisar qualidade",
        "Embalar",
        "Liberar para entrega/instalação",
      ];
      const alturaChecklist = Math.ceil(checklist.length / 2) * 9 + 8;
      novaPaginaSePreciso(alturaChecklist + 12);
      pdf.setDrawColor(228, 228, 231);
      pdf.roundedRect(margem, y, larguraUtil, alturaChecklist, 2, 2);
      checklist.forEach((item, index) => {
        const coluna = index % 2;
        const linha = Math.floor(index / 2);
        const x = margem + 6 + coluna * 94;
        const yLinha = y + 10 + linha * 9;
        pdf.rect(x, yLinha - 4, 4, 4);
        texto(item, x + 7, yLinha, {
          tamanho: 8.5,
          cor: [39, 39, 42],
        });
      });
      y += alturaChecklist + 10;

      blocoTitulo("Assinaturas");
      novaPaginaSePreciso(44);
      const assinaturas: Array<[string, number]> = [
        ["Responsável pela produção", margem],
        ["Conferência / Qualidade", margem + 98],
        ["Entrega / Instalação", margem],
        ["Data: ____/____/____", margem + 98],
      ];
      assinaturas.forEach(([rotulo, x], index) => {
        const yAssinatura = y + (index > 1 ? 22 : 0);
        pdf.line(x, yAssinatura, x + 82, yAssinatura);
        texto(rotulo, x, yAssinatura + 5, {
          tamanho: 8,
          cor: [82, 82, 91],
        });
      });

      const totalPaginas = pdf.getNumberOfPages();
      for (let pagina = 1; pagina <= totalPaginas; pagina++) {
        pdf.setPage(pagina);
        pdf.setDrawColor(228, 228, 231);
        pdf.line(margem, 284, larguraPagina - margem, 284);
        texto(`PRINTFLOW • ${numeroOS}`, margem, 290, {
          tamanho: 8,
          peso: "bold",
          cor: [82, 82, 91],
        });
        texto(`Página ${pagina}/${totalPaginas}`, larguraPagina - margem, 290, {
          tamanho: 8,
          cor: [82, 82, 91],
          alinhar: "right",
        });
      }

      const nomeArquivoPDF = `${numeroOS}-${clienteNome}`
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");

      pdf.save(`${nomeArquivoPDF || "ordem-de-servico"}.pdf`);
    } catch (erro) {
      console.error("Erro ao gerar OS em PDF:", erro);
      mostrarToast("Não foi possível gerar a OS em PDF. Tente novamente.");
    }
  }

  async function gerarPDFOSLegado(producao: any) {
    const pdf = new jsPDF();

    const numeroOS = producao.numeroOS || "Sem OS";
    const clienteNome = producao.cliente || "-";
    const servico = producao.servico || "-";
    const material = producao.material || "-";
    const medida = producao.medida || "-";
    const prioridadeAtual = producao.prioridade || "Normal";
    const status = producao.status || "-";
    const observacoes = producao.observacoes || "Sem observações.";
    const itens = normalizarItensConferencia(
      producao.itensConferencia || producao.itens || []
    );

    const linkConsulta = "http://localhost:3000/producoes";
    const qrCode = await QRCode.toDataURL(linkConsulta);

    pdf.setFillColor(10, 10, 10);
    pdf.rect(0, 0, 210, 35, "F");

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(24);
    pdf.setFont("helvetica", "bold");
    pdf.text("PRINTFLOW", 14, 16);

    pdf.setFontSize(11);
    pdf.setFont("helvetica", "normal");
    pdf.text("Ordem de Serviço para Produção", 14, 25);

    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.text(numeroOS, 160, 20);

    pdf.addImage(qrCode, "PNG", 165, 38, 30, 30);

    pdf.setTextColor(0, 0, 0);

    let y = 50;

    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.text("Dados da OS", 14, y);

    y += 10;

    const dados = [
      ["Número da OS", numeroOS],
      ["Cliente", clienteNome],
      ["Serviço", servico],
      ["Materiais", material],
      ["Medidas", medida],
      ["Área total", formatarArea(producao.area)],
      ["Prioridade", prioridadeAtual],
      ["Status", status],
    ];

    pdf.setFontSize(11);

    dados.forEach(([titulo, valor]) => {
      pdf.setFont("helvetica", "bold");
      pdf.text(`${titulo}:`, 14, y);

      pdf.setFont("helvetica", "normal");
      pdf.text(pdf.splitTextToSize(String(valor), 138), 60, y);

      y += 8;
    });

    y += 6;

    pdf.setFont("helvetica", "bold");
    pdf.text("Itens de conferência:", 14, y);

    y += 8;

    if (itens.length > 0) {
      itens.forEach((item, index) => {
        if (y > 260) {
          pdf.addPage();
          y = 20;
        }

        pdf.setFont("helvetica", "bold");
        pdf.text(`${index + 1}. ${item.material || "Material não informado"}`, 18, y);

        y += 6;

        pdf.setFont("helvetica", "normal");
        const textoItem = [
          `Medida: ${item.medida || "-"}`,
          `Área: ${formatarArea(item.area)}`,
          `Qtd: ${item.quantidade}`,
          `Acabamento: ${item.acabamento || "-"}`,
          `Status: ${item.status}`,
        ].join(" | ");

        pdf.text(pdf.splitTextToSize(textoItem, 174), 22, y);
        y += 8;

        if (item.observacoes) {
          pdf.text(pdf.splitTextToSize(`Obs: ${item.observacoes}`, 174), 22, y);
          y += 8;
        }
      });
    } else {
      pdf.setFont("helvetica", "normal");
      pdf.text("Nenhum item de conferência vinculado.", 18, y);
      y += 8;
    }

    y += 6;

    if (y > 245) {
      pdf.addPage();
      y = 20;
    }

    pdf.setFont("helvetica", "bold");
    pdf.text("Observações:", 14, y);

    y += 7;

    pdf.setFont("helvetica", "normal");

    const observacoesQuebradas = pdf.splitTextToSize(observacoes, 180);
    pdf.text(observacoesQuebradas, 14, y);

    y += observacoesQuebradas.length * 7 + 10;

    pdf.setFont("helvetica", "bold");
    pdf.text("Mockups / Arquivos aprovados:", 14, y);

    y += 8;

    if (producao.arquivos?.length > 0) {
      for (let index = 0; index < producao.arquivos.length; index++) {
        const arquivo = producao.arquivos[index];

        if (y > 230) {
          pdf.addPage();
          y = 20;
        }

        if (ehImagem(arquivo)) {
          try {
            pdf.setFont("helvetica", "bold");
            pdf.text(`Mockup ${index + 1}: ${arquivo.nome}`, 18, y);

            y += 6;

            const response = await fetch(arquivo.url);
            const blob = await response.blob();

            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();

              reader.onloadend = () => {
                resolve(reader.result as string);
              };

              reader.readAsDataURL(blob);
            });

            pdf.addImage(base64, "JPEG", 18, y, 95, 70);

            pdf.setDrawColor(80);
            pdf.rect(18, y, 95, 70);

            y += 80;
          } catch (erro) {
            console.error("Erro ao carregar imagem:", erro);

            pdf.setFont("helvetica", "normal");
            pdf.text(`Erro ao carregar imagem: ${arquivo.nome}`, 18, y);

            y += 8;
          }
        } else {
          pdf.setFont("helvetica", "normal");
          pdf.text(`${index + 1}. ${arquivo.nome}`, 18, y);

          y += 7;
        }
      }
    } else {
      pdf.setFont("helvetica", "normal");
      pdf.text("Nenhum arquivo vinculado.", 18, y);
      y += 8;
    }

    if (y > 210) {
      pdf.addPage();
      y = 20;
    }

    y += 8;

    pdf.setFont("helvetica", "bold");
    pdf.text("Checklist de Produção", 14, y);

    y += 8;

    const checklist = [
      "Conferir medida final",
      "Conferir material",
      "Conferir arte aprovada",
      "Conferir cores e acabamento",
      "Produzir",
      "Revisar qualidade",
      "Liberar para instalação/entrega",
    ];

    checklist.forEach((item) => {
      pdf.rect(14, y - 4, 4, 4);
      pdf.setFont("helvetica", "normal");
      pdf.text(item, 22, y);
      y += 8;
    });

    y += 12;

    pdf.setFont("helvetica", "bold");
    pdf.text("Assinaturas", 14, y);

    y += 18;

    pdf.line(14, y, 85, y);
    pdf.line(115, y, 190, y);

    y += 6;

    pdf.setFont("helvetica", "normal");
    pdf.text("Responsável pela produção", 20, y);
    pdf.text("Conferência / Qualidade", 128, y);

    pdf.setFontSize(9);
    pdf.setTextColor(120, 120, 120);
    pdf.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 285);

    pdf.save(`${numeroOS}-${clienteNome}.pdf`);
  }

  void gerarPDFOSLegado;

  function limparFormulario() {
    setArteEditandoId("");
    setCliente("");
    setNomeArte("");
    setComentario("");
    setPrioridade("Normal");
    setArquivos([]);
    setPreviews([]);
    setArquivosExistentes([]);
    setItensConferencia([criarItemVazio()]);
    setNaoEFachada(false);
    setFotoFachada(null);
    setLogoCliente(null);
    setDescricaoServico("");
    setPreviewIA("");
    setResultadoEstoqueConferencia(null);
    setErroEstoqueConferencia("");
    setVerificandoEstoqueConferencia(false);
  }

  function abrirNovaArte() {
    limparFormulario();
    setMostrarFormulario(true);
  }

  async function verificarEstoqueDaArte(arte: any, itens: ItemConferencia[]) {
    if (verificandoEstoqueConferencia) return;

    try {
      setVerificandoEstoqueConferencia(true);
      setErroEstoqueConferencia("");

      console.log("Conferindo arte:", arte);
      console.log("Itens para verificar estoque:", itens);

      const materiaisEstoque = await carregarMateriaisEstoqueAtual();
      const consumo = agruparConsumoPorMaterial(itens);
      const resultado = validarDisponibilidadeEstoque(itens, materiaisEstoque);

      console.log("Materiais do estoque:", materiaisEstoque);
      console.log("Consumo calculado:", consumo);
      console.log("Resultado da verificação:", resultado);

      setResultadoEstoqueConferencia(resultado);
    } catch (erro) {
      console.error(erro);
      setResultadoEstoqueConferencia(null);
      setErroEstoqueConferencia("Não foi possível verificar o estoque agora.");
    } finally {
      setVerificandoEstoqueConferencia(false);
    }
  }

  function abrirAjustes(arte: any) {
    const itens = itensDaArte(arte);

    setResultadoEstoqueConferencia(null);
    setErroEstoqueConferencia("");
    setArteEditandoId(arte.id);
    setCliente(arte.cliente || "");
    setNomeArte(arte.nomeArte || "");
    setComentario(arte.comentario || "");
    setPrioridade(arte.prioridade || "Normal");
    setArquivosExistentes(
      deduplicarMockups([
        ...(arte.arquivos || []),
        ...(arte.mockups || []),
        ...(arte.arquivosAprovados || []),
      ])
    );
    setItensConferencia(itens.length > 0 ? itens : [criarItemVazio()]);
    setNaoEFachada(arte.naoEFachada || false);
    setDescricaoServico(arte.descricaoServico || "");
    setPreviewIA(arte.previewIA || "");
    setArquivos([]);
    setPreviews([]);
    setMostrarFormulario(true);
    void verificarEstoqueDaArte(arte, itens.length > 0 ? itens : [criarItemVazio()]);
  }

  function gerarPreviewsArquivos(listaArquivos: File[]) {
    return listaArquivos.map((file) => {
      if (file.type.startsWith("image/")) {
        return URL.createObjectURL(file);
      }

      return "";
    });
  }

  function arquivoPendenteDuplicado(arquivo: File, listaAtual: File[]) {
    return listaAtual.some((item) => {
      return (
        item.name === arquivo.name &&
        item.size === arquivo.size &&
        item.lastModified === arquivo.lastModified
      );
    });
  }

  function atualizarArquivosPendentes(proximaLista: File[]) {
    setPreviews((previewsAtuais) => {
      previewsAtuais.forEach((preview) => {
        if (preview) URL.revokeObjectURL(preview);
      });

      return gerarPreviewsArquivos(proximaLista);
    });

    setArquivos(proximaLista);
  }

  function adicionarArquivosPendentes(novosArquivos: File[]) {
    if (novosArquivos.length === 0) return;

    setArquivos((listaAtual) => {
      const arquivosValidos: File[] = [];

      novosArquivos.forEach((arquivo) => {
        if (arquivo.size > TAMANHO_MAXIMO_UPLOAD_MB * 1024 * 1024) {
          mostrarToast(
            `O arquivo "${arquivo.name}" tem mais de ${TAMANHO_MAXIMO_UPLOAD_MB} MB.`
          );
          return;
        }

        if (arquivoPendenteDuplicado(arquivo, listaAtual) || arquivoPendenteDuplicado(arquivo, arquivosValidos)) {
          mostrarToast(`O arquivo "${arquivo.name}" já está na lista.`);
          return;
        }

        arquivosValidos.push(arquivo);
      });

      const proximaLista = [...listaAtual, ...arquivosValidos];

      setPreviews((previewsAtuais) => {
        previewsAtuais.forEach((preview) => {
          if (preview) URL.revokeObjectURL(preview);
        });

        return gerarPreviewsArquivos(proximaLista);
      });

      return proximaLista;
    });
  }

  function selecionarArquivos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);

    adicionarArquivosPendentes(files);

    e.target.value = "";
  }

  function nomeArquivoMockupColado(tipo: string) {
    const numeroOS =
      artes.find((arte) => arte.id === arteEditandoId)?.numeroOS ||
      arteEditandoId ||
      "sem-os";
    const extensao = tipo.includes("jpeg")
      ? "jpg"
      : tipo.includes("webp")
      ? "webp"
      : "png";
    const agora = new Date();
    const data = agora.toISOString().slice(0, 10);
    const hora = `${String(agora.getHours()).padStart(2, "0")}${String(
      agora.getMinutes()
    ).padStart(2, "0")}`;

    return `mockup-colado-${numeroOS}-${data}-${hora}-${Date.now()}.${extensao}`.replace(
      /[^\w.\-]/g,
      "-"
    );
  }

  function handlePasteMockup(event: React.ClipboardEvent<HTMLDivElement>) {
    try {
      const items = Array.from(event.clipboardData?.items || []);
      const imagens = items.filter((item) => item.type.startsWith("image/"));

      if (imagens.length === 0) {
        mostrarToast("Nenhuma imagem encontrada na área de transferência.");
        return;
      }

      event.preventDefault();

      const arquivosColados = imagens
        .map((item) => {
          const file = item.getAsFile();

          if (!file) return null;

          if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
            mostrarToast("Formato de imagem não permitido. Use PNG, JPG ou WEBP.");
            return null;
          }

          return new File([file], nomeArquivoMockupColado(file.type), {
            type: file.type,
            lastModified: Date.now(),
          });
        })
        .filter(Boolean) as File[];

      adicionarArquivosPendentes(arquivosColados);

      if (arquivosColados.length > 0) {
        mostrarToast("Print colado como mockup.");
      }
    } catch (erro) {
      console.error("Erro ao colar mockup:", erro);
      mostrarToast("Não foi possível colar o print. Tente novamente.");
    }
  }

  function handleDropMockup(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setMockupPasteAtivo(false);
    adicionarArquivosPendentes(Array.from(event.dataTransfer.files || []));
  }

  function removerArquivoNovo(indexParaRemover: number) {
    const proximaLista = arquivos.filter((_, index) => index !== indexParaRemover);

    atualizarArquivosPendentes(proximaLista);
  }

  function removerArquivoExistente(indexParaRemover: number) {
    setArquivosExistentes((listaAtual) =>
      listaAtual.filter((_, index) => index !== indexParaRemover)
    );
  }

  function adicionarItemConferencia() {
    setItensConferencia((listaAtual) => [...listaAtual, criarItemVazio()]);
  }

  function selecionarMaterialItem(indexItem: number, materialId: string) {
    const materialSelecionado = materiais.find(
      (material) => material.id === materialId
    );

    setItensConferencia((listaAtual) =>
      listaAtual.map((item, index) => {
        if (index !== indexItem) return item;

        return {
          ...item,
          materialId,
          material: materialSelecionado?.nome || item.material,
        };
      })
    );
  }

  function atualizarItemConferencia(
    indexItem: number,
    campo: keyof ItemConferencia,
    valor: string
  ) {
    setItensConferencia((listaAtual) =>
      listaAtual.map((item, index) => {
        if (index !== indexItem) return item;

        const itemAtualizado: ItemConferencia = {
          ...item,
          [campo]: campo === "quantidade" ? Math.max(numero(valor), 1) : valor,
        };

        const largura =
          campo === "largura" ? valor : String(itemAtualizado.largura || "");
        const altura =
          campo === "altura" ? valor : String(itemAtualizado.altura || "");
        const quantidade =
          campo === "quantidade" ? Math.max(numero(valor), 1) : itemAtualizado.quantidade;

        if (campo === "largura" || campo === "altura" || campo === "quantidade") {
          itemAtualizado.area = calcularAreaItem(largura, altura, quantidade);
          itemAtualizado.medida = montarMedida(largura, altura);
        }

        return itemAtualizado;
      })
    );
  }

  function selecionarArquivoPreviewItem(indexItem: number, nomeArquivo: string) {
    const arquivoSelecionado = arquivosFormulario.find(
      (arquivo) => arquivo.nome === nomeArquivo
    );

    setItensConferencia((listaAtual) =>
      listaAtual.map((item, index) => {
        if (index !== indexItem) return item;

        return {
          ...item,
          arquivoPreviewNome: nomeArquivo,
          arquivoPreviewUrl: arquivoSelecionado?.url || "",
        };
      })
    );
  }

  function removerItemConferencia(indexParaRemover: number) {
    setItensConferencia((listaAtual) =>
      listaAtual.filter((_, index) => index !== indexParaRemover)
    );
  }

  function prepararItensParaSalvar(arquivosFinais: any[]) {
    return itensConferencia
      .map((item, index) => {
        const itemNormalizado = normalizarItemConferencia(
          {
            ...item,
            area: calcularAreaItem(item.largura, item.altura, item.quantidade),
            medida: item.medida || montarMedida(item.largura, item.altura),
          },
          index
        );

        const arquivoRelacionado = arquivosFinais.find(
          (arquivo) =>
            arquivo.nome === itemNormalizado.arquivoPreviewNome ||
            arquivo.url === itemNormalizado.arquivoPreviewUrl
        );

        return {
          id: itemNormalizado.id || criarIdItem(),
          materialId: itemNormalizado.materialId,
          material: itemNormalizado.material.trim(),
          largura: itemNormalizado.largura,
          altura: itemNormalizado.altura,
          medida: itemNormalizado.medida,
          area: itemNormalizado.area,
          areaM2: itemNormalizado.area,
          quantidade: itemNormalizado.quantidade,
          cor: itemNormalizado.cor.trim(),
          acabamento: itemNormalizado.acabamento.trim(),
          observacoes: itemNormalizado.observacoes.trim(),
          conferido: itemEstaConferido(itemNormalizado),
          status: itemNormalizado.status,
          arquivoPreviewNome:
            arquivoRelacionado?.nome || itemNormalizado.arquivoPreviewNome,
          arquivoPreviewUrl:
            arquivoRelacionado?.url || itemNormalizado.arquivoPreviewUrl,
        };
      })
      .filter((item) => {
        return (
          item.material ||
          item.largura ||
          item.altura ||
          item.medida ||
          item.cor ||
          item.acabamento ||
          item.observacoes
        );
      });
  }

  async function enviarArquivoCloudinary(arquivo: File) {
    const extensao = arquivo.name.split(".").pop()?.toLowerCase();

    if (!extensao || !EXTENSOES_PERMITIDAS.includes(extensao)) {
      throw new Error(
        `O arquivo "${arquivo.name}" não é permitido. Envie PDF, CDR, AI, EPS, PNG, JPG, SVG ou WEBP.`
      );
    }

    const partesNome = arquivo.name.toLowerCase().split(".");
    const extensoesPerigosas = [
      "exe",
      "bat",
      "cmd",
      "sh",
      "js",
      "mjs",
      "msi",
      "ps1",
      "scr",
      "vbs",
    ];

    if (
      arquivo.name.includes("\0") ||
      !/^[\w\s.\-()]+$/i.test(arquivo.name) ||
      partesNome
        .slice(0, -1)
        .some((parte) => extensoesPerigosas.includes(parte))
    ) {
      throw new Error(`O arquivo "${arquivo.name}" possui um nome inválido.`);
    }

    if (arquivo.size > TAMANHO_MAXIMO_UPLOAD_MB * 1024 * 1024) {
      throw new Error(
        `O arquivo "${arquivo.name}" tem mais de ${TAMANHO_MAXIMO_UPLOAD_MB} MB. Reduza o tamanho ou envie um arquivo menor.`
      );
    }

    const formData = new FormData();

    formData.append("file", arquivo);
    formData.append("upload_preset", UPLOAD_PRESET);

    const resourceType = EXTENSOES_RAW.includes(extensao || "") ? "raw" : "image";

    const resposta = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!resposta.ok) {
      const erroCloudinary = await resposta.json();

      console.error("Erro Cloudinary:", erroCloudinary);

      throw new Error(
        erroCloudinary?.error?.message ||
          "Erro ao enviar arquivo para o Cloudinary."
      );
    }

    const dados = await resposta.json();

    return {
      nome: arquivo.name,
      tipo: arquivo.type,
      tamanho: arquivo.size,
      url: dados.secure_url,
      publicId: dados.public_id,
      formato: dados.format || "",
      resourceType: dados.resource_type || "",
    };
  }

  async function salvarArte() {
    if (!cliente.trim() || !nomeArte.trim()) {
      alert("Informe o cliente e o nome da arte antes de salvar.");
      return;
    }

    const itensAntesDoUpload = prepararItensParaSalvar(arquivosExistentes);
    const itemInvalido = itensAntesDoUpload.some((item) => {
      return !item.material || !numero(item.largura) || !numero(item.altura);
    });

    if (itensAntesDoUpload.length === 0 || itemInvalido) {
      alert("Adicione pelo menos um item com material, largura e altura.");
      return;
    }

    try {
      setUploadando(true);

      const arquivosNovosEnviados = await Promise.all(
        arquivos.map((arquivo) => enviarArquivoCloudinary(arquivo))
      );

      const arquivosFinais = deduplicarMockups([
        ...arquivosExistentes,
        ...arquivosNovosEnviados,
      ]);
      const itensFinais = prepararItensParaSalvar(arquivosFinais);
      const statusAtual = arteEditandoId
        ? artes.find((arte) => arte.id === arteEditandoId)?.status
        : "";
      const prontoParaCliente =
        todosItensConferidos(normalizarItensConferencia(itensFinais)) &&
        arquivosFinais.length > 0;
      const novoStatus = arteEstaAprovada(statusAtual)
        ? statusAtual
        : prontoParaCliente
        ? "Aguardando aprovação do cliente"
        : "Aguardando conferência";

      const dadosArte = {
        cliente: cliente.trim(),
        nomeArte: nomeArte.trim(),
        comentario: comentario.trim(),
        arquivos: arquivosFinais,
        mockups: arquivosFinais.filter(ehImagem),
        itens: itensFinais,
        itensConferencia: itensFinais,
        prioridade,
        naoEFachada,
        descricaoServico: descricaoServico.trim(),
        previewIA,
        status: novoStatus,
        aprovadoPeloCliente: arteEstaAprovada(novoStatus),
        atualizadoEm: new Date(),
      };

      if (arteEditandoId) {
        await updateDoc(doc(db, "artes", arteEditandoId), dadosArte);
      } else {
        await addDoc(collection(db, "artes"), {
          ...dadosArte,
          criadoEm: new Date(),
        });
      }

      await carregarArtes();
      limparFormulario();
      setMostrarFormulario(false);
      mostrarToast(
        prontoParaCliente
          ? "Arte salva e pronta para aprovação do cliente."
          : "Arte salva para conferência."
      );
    } catch (erro) {
      mostrarToast("Erro ao salvar arte. Verifique os arquivos e tente novamente.");
      console.error(erro);
    } finally {
      setUploadando(false);
    }
  }

  async function montarDadosProducao(arteAtual: any) {
    let dadosOrcamento: any = null;

    if (arteAtual.orcamentoId) {
      const orcamentoRef = doc(db, "orcamentos", arteAtual.orcamentoId);
      const orcamentoSnap = await getDoc(orcamentoRef);

      if (orcamentoSnap.exists()) {
        dadosOrcamento = orcamentoSnap.data();
      }
    }

    const itens = itensDaArte(arteAtual);
    const arquivosAprovados = [...(arteAtual.arquivos || []), ...(arteAtual.mockups || [])];
    const itensProducao = itens.map((item) => ({
      id: item.id,
      materialId: item.materialId,
      material: item.material,
      servico: item.material,
      largura: item.largura,
      altura: item.altura,
      medida: item.medida,
      area: item.area,
      areaM2: item.area,
      quantidade: item.quantidade,
      cor: item.cor,
      acabamento: item.acabamento,
      observacoes: item.observacoes,
      status: "Fila",
      operador: "",
      maquina: "",
      iniciadoEm: null,
      finalizadoEm: null,
      statusAtualizadoEm: new Date(),
      statusUpdatedAt: new Date(),
      conferido: itemEstaConferido(item),
      checklist: {
        conferido: itemEstaConferido(item),
        impressaoOk: false,
        acabamentoOk: false,
        prontoParaEntrega: false,
      },
      arquivoPreviewNome: item.arquivoPreviewNome,
      arquivoPreviewUrl: item.arquivoPreviewUrl,
    }));

    const materialResumo =
      resumoMateriais(itens) ||
      dadosOrcamento?.servico ||
      arteAtual.nomeArte ||
      "Material não informado";

    const medidaResumo =
      resumoMedidas(itens) ||
      dadosOrcamento?.itens?.map((item: any) => item.medida).join(" + ") ||
      dadosOrcamento?.medida ||
      "Medida não informada";

    const areaTotal =
      areaTotalItens(itens) ||
      dadosOrcamento?.itens?.reduce((total: number, item: any) => {
        return total + numero(item.area);
      }, 0) ||
      numero(dadosOrcamento?.area);
    const metragemTotal = Number(
      (Number.isFinite(areaTotal) ? areaTotal : numero(areaTotal)).toFixed(2)
    );

    return {
      numeroOS:
        dadosOrcamento?.numeroOS ||
        arteAtual.numeroOS ||
        `OS-${arteAtual.id || "sem-numero"}`,

      cliente: arteAtual.cliente || dadosOrcamento?.cliente || "",
      clienteId: arteAtual.clienteId || dadosOrcamento?.clienteId || "",

      servico:
        dadosOrcamento?.servico ||
        arteAtual.nomeArte ||
        "Serviço sem descrição",

      material: materialResumo,
      materialPrincipal: materialResumo,
      medida: medidaResumo,
      area: metragemTotal,
      metragemTotal,

      itens: itensProducao,
      itensConferencia: itensProducao,

      arquivos: arquivosAprovados,
      mockups: arteAtual.mockups || arteAtual.arquivos || [],

      responsavel: dadosOrcamento?.responsavelInstalacao || "",

      prioridade: arteAtual.prioridade || "Normal",
      prazo: arteAtual.prazo || dadosOrcamento?.prazo || "",

      observacoes: arteAtual.comentario || "Sem observações.",

      status: "Fila",
      etapa: "Fila",

      finalizado: false,
      instalacaoCriada: false,
      precisaInstalacao: dadosOrcamento?.precisaInstalacao || false,
      enderecoInstalacao: dadosOrcamento?.enderecoInstalacao || "",
      iniciado: false,
      iniciadoEm: null,
      statusAtualizadoEm: new Date(),
      statusUpdatedAt: new Date(),

      origem: "aprovacao_arte",
      tenantId: arteAtual.tenantId || dadosOrcamento?.tenantId || auth.currentUser?.uid || "",
      arteId: arteAtual.id,
      orcamentoId: arteAtual.orcamentoId || "",
      financeiro: arteAtual.financeiro || dadosOrcamento?.financeiro || null,
      margemPrevista:
        arteAtual.margemPrevista ||
        dadosOrcamento?.financeiro?.margemPrevista ||
        0,
      criadoEm: new Date(),
      createdAt: new Date(),
      atualizadoEm: new Date(),
      updatedAt: new Date(),
      historico: [
        {
          tipo: "sistema",
          status: "Fila",
          statusNovo: "Fila",
          acao: "Produção criada pela aprovação de arte",
          data: new Date(),
          createdAt: new Date(),
        },
      ],
    };
  }

  async function buscarProducaoExistente(arte: any, numeroOS?: string) {
    const consultas = [
      getDocs(query(collection(db, "producoes"), where("arteId", "==", arte.id), limit(1))),
    ];
    const numeroBusca = numeroOS || arte.numeroOS;

    if (numeroBusca) {
      consultas.push(
        getDocs(
          query(collection(db, "producoes"), where("numeroOS", "==", numeroBusca), limit(1))
        )
      );
    }

    const resultados = await Promise.all(consultas);
    const documentoEncontrado = resultados.flatMap((snapshot) => snapshot.docs)[0];

    return documentoEncontrado
      ? {
          id: documentoEncontrado.id,
          ref: documentoEncontrado.ref,
          dados: documentoEncontrado.data(),
        }
      : null;
  }

  async function gravarProducaoDaArte(arte: any) {
    const dadosProducao = await montarDadosProducao(arte);
    const producaoExistente = await buscarProducaoExistente(
      arte,
      dadosProducao.numeroOS
    );

    logDebugProducao("collection usada", "producoes");
    logDebugProducao("dados preparados", dadosProducao);

    if (producaoExistente) {
      const agora = new Date();
      const historicoAtual = Array.isArray((producaoExistente.dados as any)?.historico)
        ? ((producaoExistente.dados as any).historico as any[])
        : [];
      const dadosAtualizados = {
        ...dadosProducao,
        criadoEm: (producaoExistente.dados as any)?.criadoEm || dadosProducao.criadoEm,
        createdAt:
          (producaoExistente.dados as any)?.createdAt || dadosProducao.createdAt,
        atualizadoEm: agora,
        updatedAt: agora,
        statusAtualizadoEm: agora,
        statusUpdatedAt: agora,
        historico: [
          ...historicoAtual,
          {
            tipo: "sistema",
            status: "Fila",
            statusNovo: "Fila",
            acao: "Produção atualizada pela aprovação de arte",
            data: agora,
            createdAt: agora,
          },
        ],
      };

      await updateDoc(producaoExistente.ref, dadosAtualizados);
      logDebugProducao("produção existente atualizada", {
        producaoId: producaoExistente.id,
        dados: dadosAtualizados,
      });

      return {
        producaoId: producaoExistente.id,
        dadosProducao: dadosAtualizados,
        criada: false,
      };
    }

    const producaoRef = await addDoc(collection(db, "producoes"), dadosProducao);
    logDebugProducao("produção criada", {
      producaoId: producaoRef.id,
      dados: dadosProducao,
    });

    return {
      producaoId: producaoRef.id,
      dadosProducao,
      criada: true,
    };
  }

  async function criarProducaoDaArte(arte: any, exigirAprovacao = true) {
    const itens = itensDaArte(arte);

    if (!todosItensConferidos(itens)) {
      throw new Error("Todos os itens precisam estar conferidos.");
    }

    if (!temArquivoOuMockup(arte)) {
      throw new Error("Envie pelo menos um arquivo ou mockup antes de criar a produção.");
    }

    if (exigirAprovacao && !arteEstaAprovada(arte.status)) {
      throw new Error("A arte precisa estar aprovada pelo cliente.");
    }

    const { producaoId, dadosProducao, criada } = await gravarProducaoDaArte({
      ...arte,
      itens,
      itensConferencia: itens,
    });

    await updateDoc(doc(db, "artes", arte.id), {
      producaoCriada: true,
      enviadoParaProducao: true,
      producaoId,
      status: "Enviado para produção",
      numeroOS: dadosProducao.numeroOS,
      enviadoParaProducaoEm: new Date(),
      atualizadoEm: new Date(),
      historico: [
        ...(Array.isArray(arte.historico) ? arte.historico : []),
        {
          tipo: "sistema",
          acao: criada
            ? "Produção criada a partir da aprovação de arte"
            : "Produção existente atualizada a partir da aprovação de arte",
          statusNovo: "Enviado para produção",
          data: new Date(),
        },
      ],
    });

    return dadosProducao;
  }

  async function validarEstoqueAntesDeEnviar(
    arte: any,
    acao: "aprovar" | "gerar",
    continuarComEstoqueBaixo = false
  ) {
    try {
      setVerificandoEstoqueId(arte.id);

      const itens = itensDaArte(arte);
      const materiaisEstoque = await carregarMateriaisEstoqueAtual();
      const consumo = agruparConsumoPorMaterial(itens);
      const resultado = validarDisponibilidadeEstoque(itens, materiaisEstoque);

      console.log("Itens da arte:", itens);
      console.log("Materiais estoque:", materiaisEstoque);
      console.log("Consumo calculado:", consumo);
      console.log("Resultado validação estoque:", resultado);

      if (resultado.bloqueado) {
        throw new Error(resultado.mensagensBloqueio[0]);
      }

      if (resultado.temEstoqueBaixo && !continuarComEstoqueBaixo) {
        setAlertaEstoqueBaixo({
          arte,
          acao,
          resultado,
        });
        return false;
      }

      return true;
    } catch (erro) {
      if (erro instanceof Error) {
        throw erro;
      }

      throw new Error("Não foi possível verificar o estoque dos materiais.");
    } finally {
      setVerificandoEstoqueId("");
    }
  }

  async function gerarOSDaArte(
    arte: any,
    continuarComEstoqueBaixo = false,
    pularConfirmacao = false
  ) {
    const itens = itensDaArte(arte);

    if (!todosItensConferidos(itens)) {
      mostrarToast("Todos os itens precisam estar conferidos antes de gerar produção.");
      return;
    }

    if (!temArquivoOuMockup(arte)) {
      mostrarToast("Envie pelo menos um arquivo ou mockup antes de criar a produção.");
      return;
    }

    const confirmar = pularConfirmacao || confirm(
      `Gerar produção para ${arte.numeroOS || "esta arte"}?`
    );

    if (!confirmar || processandoArteId) return;

    try {
      setProcessandoArteId(arte.id);
      const estoqueLiberado = await validarEstoqueAntesDeEnviar(
        arte,
        "gerar",
        continuarComEstoqueBaixo
      );

      if (!estoqueLiberado) return;

      const dadosProducao = await criarProducaoDaArte(arte, true);
      await gerarPDFOS(dadosProducao);
      mostrarToast("Produção criada com os dados conferidos.");
      await carregarArtes();
    } catch (erro) {
      console.error(erro);
      mostrarToast(erro instanceof Error ? erro.message : "Erro ao gerar produção.");
    } finally {
      setProcessandoArteId("");
    }
  }

  async function aprovarViaWhatsApp(
    arte: any,
    _continuarComEstoqueBaixo = false,
    pularConfirmacao = false
  ) {
    void _continuarComEstoqueBaixo;

    const itens = itensDaArte(arte);
    const carregando = processandoArteId === arte.id;
    const podeAprovar = podeAprovarArte(arte, itens, carregando);

    console.log("Itens:", arte.itens || arte.itensConferencia || itens);
    console.log("Todos conferidos:", todosItensConferidos(itens));
    console.log("Tem arquivo/mockup:", temArquivoOuMockup(arte));
    console.log("Pode aprovar:", podeAprovar);

    if (!podeAprovar) {
      mostrarToast(motivoBloqueioAprovacao(arte, itens, carregando));
      return;
    }

    const confirmar = pularConfirmacao || confirm(
      `Confirmar aprovação da arte ${arte.numeroOS || ""}?`
    );

    if (!confirmar || processandoArteId) return;

    try {
      setProcessandoArteId(arte.id);
      const agora = new Date();

      await updateDoc(doc(db, "artes", arte.id), {
        status: "Aprovado",
        aprovadoPeloCliente: true,
        aprovadoEm: agora,
        aprovadoClienteEm: agora,
        atualizadoEm: agora,
        historico: [
          ...(Array.isArray(arte.historico) ? arte.historico : []),
          {
            tipo: "sistema",
            acao: "Arte aprovada pelo cliente",
            statusNovo: "Aprovado",
            data: agora,
          },
        ],
      });

      await carregarArtes();
      setArteDetalhe((arteAtual: any) =>
        arteAtual?.id === arte.id
          ? {
              ...arteAtual,
              status: "Aprovado",
              aprovadoPeloCliente: true,
              aprovadoEm: agora,
              aprovadoClienteEm: agora,
            }
          : arteAtual
      );
      mostrarToast("Arte aprovada com sucesso.");
    } catch (erro) {
      console.error(erro);
      mostrarToast("Erro ao aprovar a arte.");
    } finally {
      setProcessandoArteId("");
    }
  }

  async function marcarItemComoConferido(arteId: string, itemId: string) {
    try {
      const arteAtual = artes.find((arte) => arte.id === arteId) || arteDetalhe;
      const itens = itensDaArte(arteAtual);

      const itensAtualizados = itens.map((item) => {
        if (item.id !== itemId) return item;

        return {
          ...item,
          status: "Conferido" as StatusItemConferencia,
          conferido: true,
        };
      });

      await updateDoc(doc(db, "artes", arteId), {
        itensConferencia: itensAtualizados,
        itens: itensAtualizados,
        atualizadoEm: new Date(),
      });

      setArteDetalhe((detalheAtual: any) =>
        detalheAtual?.id === arteId
          ? {
              ...detalheAtual,
              itensConferencia: itensAtualizados,
              itens: itensAtualizados,
            }
          : detalheAtual
      );

      mostrarToast("Item marcado como conferido.");
      await carregarArtes();
    } catch (erro) {
      console.error(erro);
      mostrarToast("Erro ao marcar item como conferido.");
    }
  }

  async function excluirArte(id: string) {
    const confirmar = confirm("Deseja realmente excluir esta arte?");

    if (!confirmar) return;

    try {
      await deleteDoc(doc(db, "artes", id));

      if (arteDetalhe?.id === id) {
        setArteDetalhe(null);
      }

      mostrarToast("Arte excluída.");
      await carregarArtes();
    } catch (erro) {
      console.error(erro);
      mostrarToast("Erro ao excluir arte.");
    }
  }

  function renderResumoItens(arte: any) {
    const itens = itensDaArte(arte);
    const conferidos = itens.filter(itemEstaConferido).length;
    const todosConferidos = todosItensConferidos(itens);
    const materiais = resumoMateriais(itens);

    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniResumo titulo="Itens" valor={String(itens.length)} />
        <MiniResumo titulo="Materiais" valor={limitarTexto(materiais, 44)} />
        <MiniResumo titulo="Área total" valor={formatarArea(areaTotalItens(itens))} />
        <MiniResumo
          titulo="Conferência"
          valor={itens.length > 0 ? `${conferidos}/${itens.length}` : "0/0"}
          destaque={
            todosConferidos
              ? "text-green-300"
              : conferidos > 0
              ? "text-yellow-300"
              : "text-red-300"
          }
        />
      </div>
    );
  }

  return (
    <AuthGuard>
      <main className="flex min-h-screen bg-zinc-950 text-white">
        <Sidebar />

        <section className="flex-1 p-6 lg:p-10">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between mb-8">
            <div>
              <p className="text-green-400 font-semibold mb-2">
                Conferência operacional
              </p>

              <h1 className="text-4xl lg:text-5xl font-black">
                Aprovação de Arte
              </h1>

              <p className="text-zinc-400 mt-2">
                Separe peças, confira medidas e libere a produção com rastreio por OS.
              </p>
            </div>

            <button
              onClick={abrirNovaArte}
              className="bg-white text-black px-5 py-3 rounded-xl font-semibold hover:bg-green-400 transition"
            >
              Nova arte
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <CardIndicador titulo="Pendentes/Ajustes" valor={artesPendentes.length} cor="text-yellow-300" />
            <CardIndicador titulo="Aprovadas" valor={artesAprovadas.length} cor="text-green-300" />
            <CardIndicador titulo="Urgentes" valor={totalUrgentes} cor="text-red-300" />
            <CardIndicador titulo="Total de artes" valor={artesFiltradas.length} cor="text-white" />
          </div>

          {totalAjustes > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-3xl p-5 mb-8">
              <p className="text-yellow-300 font-bold">
                {totalAjustes} arte(s) com ajuste aberto.
              </p>
            </div>
          )}

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 mb-8">
            <input
              placeholder="Pesquisar por OS, cliente, arte, status ou material"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
            />
          </div>

          {toast && (
            <div className="fixed right-4 top-4 z-[60] max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 shadow-2xl">
              {toast}
            </div>
          )}

          {mostrarFormulario && (
            <div className="fixed inset-4 z-50 overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl">
              <div className="flex items-center justify-between gap-4 mb-6">
                <h2 className="text-2xl font-black">
                  {arteEditandoId
                    ? "Ajustar arte existente"
                    : "Nova arte para conferência"}
                </h2>

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

              {verificandoEstoqueConferencia && (
                <div className="mb-6 rounded-3xl border border-blue-500/30 bg-blue-500/10 p-5 text-sm font-bold text-blue-200">
                  Verificando estoque...
                </div>
              )}

              {erroEstoqueConferencia && (
                <div className="mb-6 rounded-3xl border border-yellow-500/30 bg-yellow-500/10 p-5 text-sm font-bold text-yellow-200">
                  {erroEstoqueConferencia}
                </div>
              )}

              {resultadoEstoqueConferencia && (
                <div className="mb-6">
                  {resultadoEstoqueConferencia.bloqueado && (
                    <div className="mb-4 rounded-3xl border border-red-500/40 bg-red-500/10 p-5">
                      <h3 className="text-lg font-black text-red-300">
                        ATENÇÃO: material insuficiente
                      </h3>
                      <p className="mt-2 text-sm font-bold text-red-100">
                        Cadastre mais material no estoque antes de enviar para produção.
                      </p>
                    </div>
                  )}

                  {!resultadoEstoqueConferencia.bloqueado &&
                    resultadoEstoqueConferencia.temEstoqueBaixo && (
                      <div className="mb-4 rounded-3xl border border-yellow-500/40 bg-yellow-500/10 p-5">
                        <h3 className="text-lg font-black text-yellow-300">
                          ATENÇÃO: estoque baixo
                        </h3>
                        <p className="mt-2 text-sm font-bold text-yellow-100">
                          O material é suficiente, mas ficará abaixo do estoque mínimo após esta produção.
                        </p>
                      </div>
                    )}

                  <DisponibilidadeMaterial resultado={resultadoEstoqueConferencia} />
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div>
                  <p className="text-zinc-400 text-sm mb-2">Cliente</p>

                  <input
                    placeholder="Nome do cliente"
                    value={cliente}
                    onChange={(e) => setCliente(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                  />
                </div>

                <div>
                  <p className="text-zinc-400 text-sm mb-2">Arte</p>

                  <input
                    placeholder="Nome da arte"
                    value={nomeArte}
                    onChange={(e) => setNomeArte(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                  />
                </div>

                <div>
                  <p className="text-zinc-400 text-sm mb-2">Prioridade</p>

                  <select
                    value={prioridade}
                    onChange={(e) => setPrioridade(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 outline-none focus:border-green-500"
                  >
                    {PRIORIDADES.map((opcao) => (
                      <option key={opcao} value={opcao}>
                        {opcao}
                      </option>
                    ))}
                  </select>
                </div>

                <ConferenciaItens
                  itens={itensConferencia}
                  materiais={materiais}
                  onAdicionar={adicionarItemConferencia}
                  onAlterar={(index, campo, valor) => {
                    if (campo === "materialId") {
                      selecionarMaterialItem(index, valor);
                      return;
                    }

                    atualizarItemConferencia(index, campo as keyof ItemConferencia, valor);
                  }}
                  onRemover={(id) => {
                    const index = itensConferencia.findIndex((item) => item.id === id);
                    if (index >= 0) removerItemConferencia(index);
                  }}
                  arquivosFormulario={arquivosFormulario}
                  onSelecionarArquivoPreview={selecionarArquivoPreviewItem}
                />

                <div className="lg:col-span-3 bg-zinc-950 border border-zinc-800 rounded-3xl p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-5">
                    <div>
                      <h3 className="text-xl font-black">
                        Prévia com IA para fachada
                      </h3>
                    </div>

                    <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={naoEFachada}
                        onChange={(e) => setNaoEFachada(e.target.checked)}
                      />
                      Não é fachada
                    </label>
                  </div>

                  {!naoEFachada && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          setFotoFachada(e.target.files?.[0] || null)
                        }
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-3"
                      />

                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          setLogoCliente(e.target.files?.[0] || null)
                        }
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-3"
                      />

                      <textarea
                        placeholder="Descrição do serviço"
                        value={descricaoServico}
                        onChange={(e) => setDescricaoServico(e.target.value)}
                        className="lg:col-span-2 bg-zinc-900 border border-zinc-700 rounded-xl p-3 min-h-24 outline-none focus:border-green-500"
                      />

                      <button
                        type="button"
                        onClick={() => {
                          if (!fotoFachada || !logoCliente || !descricaoServico) {
                            alert(
                              "Adicione a fachada, a logo e a descrição do serviço."
                            );
                            return;
                          }

                          setPreviewIA(
                            "Prévia conceitual preparada. Em breve conectaremos isso à API de IA para gerar a imagem real."
                          );
                        }}
                        className="lg:col-span-2 bg-blue-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-blue-500 transition"
                      >
                        Gerar prévia com IA
                      </button>
                    </div>
                  )}

                  {naoEFachada && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-zinc-400">
                      Prévia com IA desativada para este tipo de serviço.
                    </div>
                  )}

                  {previewIA && (
                    <div className="mt-4 bg-zinc-900 border border-blue-500/30 rounded-2xl p-5">
                      <p className="text-blue-300 font-semibold">
                        {previewIA}
                      </p>
                    </div>
                  )}
                </div>

                <UploadArquivos
                  arquivos={arquivos}
                  previews={previews}
                  arquivosExistentes={arquivosExistentes}
                  uploadando={uploadando}
                  mockupPasteAtivo={mockupPasteAtivo}
                  onSelecionarArquivos={selecionarArquivos}
                  onRemoverArquivo={removerArquivoNovo}
                  onRemoverExistente={removerArquivoExistente}
                  onPaste={handlePasteMockup}
                  onDrop={handleDropMockup}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setMockupPasteAtivo(true);
                  }}
                  onFocusPaste={() => setMockupPasteAtivo(true)}
                  onBlurPaste={() => setMockupPasteAtivo(false)}
                />

                <div className="lg:col-span-3">
                  <p className="text-zinc-400 text-sm mb-2">Observações</p>

                  <textarea
                    placeholder="Observações gerais da arte"
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 min-h-28 outline-none focus:border-green-500"
                  />
                </div>
              </div>

              <button
                onClick={salvarArte}
                disabled={uploadando}
                className="mt-6 bg-green-500 text-black px-5 py-3 rounded-xl font-bold disabled:opacity-50 hover:bg-green-400 transition"
              >
                  {uploadando
                    ? "Salvando..."
                    : arteEditandoId
                    ? todosItensConferidos(itensConferencia) && arquivosFormulario.length > 0
                      ? "Enviar para aprovação do cliente"
                      : "Salvar conferência"
                    : "Salvar arte"}
              </button>
            </div>
          )}

          <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-black">Pendentes e ajustes</h2>

              <span className="text-zinc-400 text-sm">
                {artesPendentes.length} registro(s)
              </span>
            </div>

            <div className="grid grid-cols-1 gap-5">
              {artesPendentes.map((arte) => {
                const itens = itensDaArte(arte);
                const todosConferidos = todosItensConferidos(itens);
                const totalArquivos =
                  (arte.arquivos?.length || 0) +
                  (arte.mockups?.length || 0) +
                  (arte.arquivosAprovados?.length || 0);
                const resultadoEstoque = validarDisponibilidadeEstoque(itens, materiais);
                const bloqueioEstoque = motivoBloqueioEstoque(resultadoEstoque);
                const estaVerificandoEstoque = verificandoEstoqueId === arte.id;
                const processandoAprovacao = processandoArteId === arte.id;
                const podeAprovar = podeAprovarArte(
                  arte,
                  itens,
                  Boolean(processandoArteId)
                );

                console.log("Itens:", arte.itens || arte.itensConferencia || itens);
                console.log("Todos conferidos:", todosItensConferidos(itens));
                console.log("Tem arquivo/mockup:", temArquivoOuMockup(arte));
                console.log("Pode aprovar:", podeAprovar);

                return (
                  <div
                    key={arte.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 overflow-hidden hover:border-zinc-700 transition"
                  >
                    <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-3 mb-4">
                          <span className="text-green-400 text-sm font-black truncate">
                            {arte.numeroOS || "OS automática"}
                          </span>

                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold border ${classeStatusArte(
                              arte.status || "Pendente"
                            )}`}
                          >
                            {arte.status || "Pendente"}
                          </span>

                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold border ${classePrioridade(
                              arte.prioridade || "Normal"
                            )}`}
                          >
                            {arte.prioridade || "Normal"}
                          </span>
                        </div>

                        <h3 className="text-sm font-bold mb-1 truncate">
                          {arte.cliente || "Cliente não informado"}
                        </h3>

                        <p className="text-zinc-300 mb-4 text-sm truncate">
                          {arte.nomeArte || "Arte sem nome"}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-zinc-400">
                          <span>{itens.length} item(s)</span>
                          <span>{totalArquivos} arquivo(s)</span>
                          <span className={todosConferidos ? "text-green-300" : "text-yellow-300"}>
                            {todosConferidos ? "Conferido" : "Conferir itens"}
                          </span>
                        </div>
                      </div>

                      <div className="xl:w-56 flex flex-col gap-2">
                        <BotaoAprovar
                          arte={arte}
                          itens={itens}
                          carregando={processandoAprovacao}
                          onAprovar={() => aprovarViaWhatsApp(arte)}
                        />

                        <button
                          onClick={() => {
                            abrirAjustes(arte);
                          }}
                          className="bg-green-500 text-black font-bold px-3 py-2 rounded-xl text-xs hover:bg-green-400 transition"
                        >
                          Conferir arte
                        </button>

                        <button
                          onClick={() => gerarOSDaArte(arte)}
                          disabled={
                            resultadoEstoque.bloqueado ||
                            !!processandoArteId ||
                            estaVerificandoEstoque
                          }
                          title={bloqueioEstoque}
                          className="bg-zinc-800 text-zinc-200 px-3 py-2 rounded-xl text-xs font-bold hover:bg-zinc-700 disabled:opacity-50 transition"
                        >
                          {estaVerificandoEstoque ? "Verificando estoque..." : "Gerar produção"}
                        </button>

                        <button
                          onClick={() => setArteDetalhe(arte)}
                          className="bg-zinc-800 text-zinc-200 px-3 py-2 rounded-xl text-xs font-bold hover:bg-zinc-700 transition"
                        >
                          Ver detalhes
                        </button>

                        <button
                          onClick={() => excluirArte(arte.id)}
                          className="bg-red-500/20 text-red-300 px-3 py-2 rounded-xl text-xs hover:bg-red-500/30 transition"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {artesPendentes.length === 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 text-zinc-400">
                  Nenhuma arte pendente.
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-black">Aprovadas</h2>

              <span className="text-zinc-400 text-sm">
                {artesAprovadas.length} registro(s)
              </span>
            </div>

            {artesAprovadas.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 text-zinc-400">
                Nenhuma arte aprovada.
              </div>
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 md:block">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-left text-sm">
                      <thead className="bg-zinc-800 text-xs uppercase tracking-wide text-zinc-400">
                        <tr>
                          <th className="px-4 py-3">Data</th>
                          <th className="px-4 py-3">OS</th>
                          <th className="px-4 py-3">Cliente</th>
                          <th className="px-4 py-3">Itens</th>
                          <th className="px-4 py-3">Material principal</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Ações</th>
                        </tr>
                      </thead>

                      <tbody>
                        {artesAprovadas.map((arte) => {
                          const itens = itensDaArte(arte);
                          const materialPrincipal =
                            itens[0]?.material || resumoMateriais(itens) || "-";

                          return (
                            <tr
                              key={arte.id}
                              onClick={() => setArteDetalhe(arte)}
                              className="cursor-pointer border-t border-zinc-800 text-zinc-300 transition hover:bg-zinc-800/50"
                            >
                              <td className="px-4 py-4 align-top text-xs text-zinc-400 whitespace-nowrap">
                                {formatarDataAprovacaoArte(arte)}
                              </td>
                              <td className="px-4 py-4 align-top font-black text-green-400 whitespace-nowrap">
                                {arte.numeroOS || "Sem OS"}
                              </td>
                              <td className="px-4 py-4 align-top">
                                <div className="max-w-[220px] truncate font-bold text-zinc-100">
                                  {arte.cliente || "Cliente não informado"}
                                </div>
                              </td>
                              <td className="px-4 py-4 align-top text-zinc-300 whitespace-nowrap">
                                {itens.length} item(s)
                              </td>
                              <td className="px-4 py-4 align-top">
                                <div className="max-w-[240px] truncate text-zinc-300">
                                  {materialPrincipal}
                                </div>
                              </td>
                              <td className="px-4 py-4 align-top">
                                <span
                                  className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-bold whitespace-nowrap ${classeStatusArte(
                                    arte.status || "Aprovado"
                                  )}`}
                                >
                                  {arte.status || "Aprovado"}
                                </span>
                              </td>
                              <td className="px-4 py-4 align-top">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setArteDetalhe(arte);
                                  }}
                                  className="inline-flex w-fit items-center rounded-full bg-zinc-800 px-3 py-1 text-xs font-bold text-zinc-200 transition hover:bg-zinc-700 whitespace-nowrap"
                                >
                                  Detalhes
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:hidden">
                  {artesAprovadas.map((arte) => {
                    const itens = itensDaArte(arte);
                    const materialPrincipal =
                      itens[0]?.material || resumoMateriais(itens) || "-";

                    return (
                      <button
                        key={arte.id}
                        type="button"
                        onClick={() => setArteDetalhe(arte)}
                        className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-left transition hover:border-green-500/40"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-green-400">
                              {arte.numeroOS || "Sem OS"}
                            </p>
                            <p className="mt-1 truncate text-sm font-bold text-zinc-100">
                              {arte.cliente || "Cliente não informado"}
                            </p>
                          </div>

                          <span
                            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${classeStatusArte(
                              arte.status || "Aprovado"
                            )}`}
                          >
                            {arte.status || "Aprovado"}
                          </span>
                        </div>

                        <p className="mt-3 truncate text-xs text-zinc-400">
                          {formatarDataAprovacaoArte(arte)}
                        </p>
                        <p className="mt-2 truncate text-sm text-zinc-300">
                          {materialPrincipal}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-400">
                          <span>{itens.length} item(s)</span>
                          <span>Detalhes</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {arteDetalhe && (
            <ModalDetalheArte
              arte={arteDetalhe}
              onFechar={() => setArteDetalhe(null)}
              onAprovar={() => aprovarViaWhatsApp(arteDetalhe)}
              onAjustar={() => {
                abrirAjustes(arteDetalhe);
                setArteDetalhe(null);
              }}
              onGerarOS={() => gerarOSDaArte(arteDetalhe)}
              onExcluir={() => excluirArte(arteDetalhe.id)}
              onMarcarConferido={(itemId) =>
                marcarItemComoConferido(arteDetalhe.id, itemId)
              }
              materiaisEstoque={materiais}
              verificandoEstoque={verificandoEstoqueId === arteDetalhe.id}
              processandoAprovacao={processandoArteId === arteDetalhe.id}
            />
          )}

          {alertaEstoqueBaixo && (
            <ModalAlertaEstoqueBaixo
              resultado={alertaEstoqueBaixo.resultado}
              onCancelar={() => setAlertaEstoqueBaixo(null)}
              onContinuar={() => {
                const alerta = alertaEstoqueBaixo;
                setAlertaEstoqueBaixo(null);

                if (alerta.acao === "aprovar") {
                  aprovarViaWhatsApp(alerta.arte, true, true);
                } else {
                  gerarOSDaArte(alerta.arte, true, true);
                }
              }}
            />
          )}
        </section>
      </main>
    </AuthGuard>
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

function MiniResumo({
  titulo,
  valor,
  destaque = "text-zinc-200",
}: {
  titulo: string;
  valor: string;
  destaque?: string;
}) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3">
      <p className="text-zinc-500 text-xs">{titulo}</p>
      <p className={`font-bold mt-1 line-clamp-2 ${destaque}`}>{valor}</p>
    </div>
  );
}

function ChecklistItem({ texto, ativo }: { texto: string; ativo: boolean }) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
      <p className={ativo ? "text-green-300 text-sm" : "text-zinc-400 text-sm"}>
        {ativo ? "OK" : "--"} {texto}
      </p>
    </div>
  );
}

function classeDisponibilidadeMaterial(status: StatusDisponibilidadeMaterial) {
  if (status === "ok") {
    return "border-green-500/30 bg-green-500/10 text-green-300";
  }

  if (status === "baixo") {
    return "border-yellow-500/30 bg-yellow-500/10 text-yellow-300";
  }

  return "border-red-500/30 bg-red-500/10 text-red-300";
}

function labelDisponibilidadeMaterial(status: StatusDisponibilidadeMaterial) {
  if (status === "ok") return "OK";
  if (status === "baixo") return "Estoque baixo";
  if (status === "nao_encontrado") return "Não encontrado";
  if (status === "area_invalida") return "Área inválida";

  return "Insuficiente";
}

function DisponibilidadeMaterial({
  resultado,
}: {
  resultado: ResultadoValidacaoEstoque;
}) {
  const statusGeral = resultado.bloqueado
    ? "Bloqueado"
    : resultado.temEstoqueBaixo
      ? "Atenção"
      : "OK";
  const classeStatusGeral = resultado.bloqueado
    ? "bg-red-500/20 text-red-300"
    : resultado.temEstoqueBaixo
      ? "bg-yellow-500/20 text-yellow-300"
      : "bg-green-500/20 text-green-300";

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-5 mb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h3 className="text-xl font-black">Disponibilidade de material</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Conferencia automatica do estoque para a arte.
          </p>
        </div>

        <span
          className={`w-fit px-3 py-1 rounded-full text-xs font-bold ${classeStatusGeral}`}
        >
          {statusGeral}
        </span>
      </div>

      {resultado.itens.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {resultado.itens.map((item) => (
            <div
              key={item.chave}
              className={`rounded-2xl border p-4 ${classeDisponibilidadeMaterial(
                item.status
              )}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-black">
                  {item.materialNome}
                </p>

                <span className="shrink-0 rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap">
                  {labelDisponibilidadeMaterial(item.status)}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-1 text-xs">
                <p>
                  Necessário: <strong>{formatarM2(item.necessarioM2)}</strong>
                </p>
                <p>
                  Disponível: <strong>{formatarM2(item.disponivelM2)}</strong>
                </p>
                {item.status === "insuficiente" && (
                  <p>
                    Faltam:{" "}
                    <strong>
                      {formatarM2(Math.max(item.necessarioM2 - item.disponivelM2, 0))}
                    </strong>
                  </p>
                )}
                <p>
                  Saldo após produção:{" "}
                  <strong>{formatarM2(item.saldoPrevistoM2)}</strong>
                </p>
                {item.estoqueMinimoM2 > 0 && (
                  <p>
                    Estoque mínimo:{" "}
                    <strong>{formatarM2(item.estoqueMinimoM2)}</strong>
                  </p>
                )}
              </div>

              {item.status !== "ok" && (
                <p className="mt-3 text-xs font-bold leading-relaxed">
                  {item.mensagem}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
          Nenhum item com material para validar.
        </div>
      )}
    </div>
  );
}

function ModalAlertaEstoqueBaixo({
  resultado,
  onCancelar,
  onContinuar,
}: {
  resultado: ResultadoValidacaoEstoque;
  onCancelar: () => void;
  onContinuar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-6">
      <div className="w-full max-w-2xl rounded-3xl border border-yellow-500/30 bg-zinc-900 p-6 shadow-2xl">
        <p className="text-sm font-semibold text-yellow-300">
          Atenção ao estoque
        </p>

        <h2 className="mt-2 text-3xl font-black">
          Material ficará abaixo do mínimo
        </h2>

        <div className="mt-5 flex flex-col gap-3">
          {resultado.mensagensAviso.map((mensagem, index) => (
            <div
              key={`${mensagem}-${index}`}
              className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm font-bold leading-relaxed text-yellow-200"
            >
              {mensagem}
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            onClick={onCancelar}
            className="rounded-xl bg-zinc-800 px-5 py-3 text-sm font-bold text-zinc-300 hover:bg-zinc-700 transition"
          >
            Cancelar
          </button>

          <button
            onClick={onContinuar}
            className="rounded-xl bg-yellow-500 px-5 py-3 text-sm font-black text-black hover:bg-yellow-400 transition"
          >
            Continuar mesmo assim
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalDetalheArte({
  arte,
  onFechar,
  onAprovar,
  onAjustar,
  onGerarOS,
  onExcluir,
  onMarcarConferido,
  materiaisEstoque,
  verificandoEstoque,
  processandoAprovacao,
}: {
  arte: any;
  onFechar: () => void;
  onAprovar: () => void;
  onAjustar: () => void;
  onGerarOS: () => void;
  onExcluir: () => void;
  onMarcarConferido: (itemId: string) => void;
  materiaisEstoque: any[];
  verificandoEstoque: boolean;
  processandoAprovacao: boolean;
}) {
  const itens = itensDaArte(arte);
  const todosConferidos = todosItensConferidos(itens);
  const resultadoEstoque = validarDisponibilidadeEstoque(itens, materiaisEstoque);
  const bloqueioEstoque = motivoBloqueioEstoque(resultadoEstoque);
  const podeAprovar = podeAprovarArte(arte, itens, processandoAprovacao);

  console.log("Itens:", arte.itens || arte.itensConferencia || itens);
  console.log("Todos conferidos:", todosItensConferidos(itens));
  console.log("Tem arquivo/mockup:", temArquivoOuMockup(arte));
  console.log("Pode aprovar:", podeAprovar);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-6">
          <div>
            <p className="text-green-400 font-semibold">Detalhes da arte</p>

            <h2 className="text-3xl font-black mt-1">
              {arte.nomeArte || "Arte sem nome"}
            </h2>

            <p className="text-zinc-400 mt-1">
              {arte.numeroOS || "OS automática"} • {arte.cliente || "Cliente não informado"}
            </p>
          </div>

          <button
            onClick={onFechar}
            className="bg-zinc-800 text-zinc-300 px-4 py-2 rounded-xl hover:bg-zinc-700"
          >
            Fechar
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <MiniResumo titulo="Status" valor={arte.status || "Pendente"} />
          <MiniResumo titulo="Prioridade" valor={arte.prioridade || "Normal"} />
          <MiniResumo titulo="Itens" valor={String(itens.length)} />
          <MiniResumo titulo="Materiais" valor={limitarTexto(resumoMateriais(itens), 44)} />
          <MiniResumo
            titulo="Área total"
            valor={formatarArea(areaTotalItens(itens))}
            destaque="text-green-300"
          />
        </div>

        <DisponibilidadeMaterial resultado={resultadoEstoque} />

        <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-5 mb-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h3 className="text-xl font-black">Itens de conferência</h3>

            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                todosConferidos
                  ? "bg-green-500/20 text-green-300"
                  : "bg-yellow-500/20 text-yellow-300"
              }`}
            >
              {todosConferidos ? "Tudo conferido" : "Conferência pendente"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-separate border-spacing-y-2">
              <thead className="text-zinc-500 text-sm">
                <tr>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2">Medida</th>
                  <th className="px-3 py-2">Área</th>
                  <th className="px-3 py-2">Qtd</th>
                  <th className="px-3 py-2">Cor</th>
                  <th className="px-3 py-2">Acabamento</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Observações</th>
                  <th className="px-3 py-2">Ação</th>
                </tr>
              </thead>

              <tbody>
                {itens.map((item) => (
                  <tr key={item.id} className="bg-zinc-900">
                    <td className="px-3 py-3 rounded-l-xl font-semibold">
                      {item.material || "-"}
                    </td>
                    <td className="px-3 py-3 text-zinc-300">
                      {item.medida || "-"}
                    </td>
                    <td className="px-3 py-3 text-zinc-300">
                      {formatarArea(item.area)}
                    </td>
                    <td className="px-3 py-3 text-zinc-300">
                      {item.quantidade}
                    </td>
                    <td className="px-3 py-3 text-zinc-300">
                      {item.cor || "-"}
                    </td>
                    <td className="px-3 py-3 text-zinc-300">
                      {item.acabamento || "-"}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold border ${classeStatusItem(
                          item.status
                        )}`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-zinc-300 max-w-xs">
                      {item.observacoes || "-"}
                    </td>
                    <td className="px-3 py-3 rounded-r-xl">
                      <button
                        onClick={() => onMarcarConferido(item.id)}
                        disabled={itemEstaConferido(item)}
                        className="bg-green-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-black px-3 py-2 rounded-xl text-xs font-bold hover:bg-green-400 transition"
                      >
                        Marcar item como conferido
                      </button>
                    </td>
                  </tr>
                ))}

                {itens.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-zinc-400"
                    >
                      Nenhum item cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-5">
            <h3 className="text-xl font-black mb-4">Arquivos</h3>

            <div className="flex flex-col gap-3">
              {arte.arquivos?.length > 0 ? (
                arte.arquivos.map((arquivo: any, index: number) => (
                  <a
                    key={index}
                    href={arquivo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-blue-500 transition"
                  >
                    <p className="font-semibold text-zinc-200 break-all">
                      {arquivo.nome}
                    </p>

                    <p className="text-zinc-500 text-sm mt-1">
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

            <p className="text-zinc-300 min-h-20">
              {arte.comentario || "Sem observações."}
            </p>

            <div className="grid grid-cols-2 gap-3 mt-6">
              {!arteJaAprovada(arte) && (
                <BotaoAprovar
                  arte={arte}
                  itens={itens}
                  carregando={processandoAprovacao}
                  onAprovar={onAprovar}
                />
              )}

              <button
                onClick={onAjustar}
                className="bg-yellow-500 text-black font-bold px-4 py-3 rounded-xl text-sm hover:bg-yellow-400 transition"
              >
                Conferir arte
              </button>

              <button
                onClick={onGerarOS}
                disabled={resultadoEstoque.bloqueado || verificandoEstoque}
                title={bloqueioEstoque}
                className="bg-blue-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-blue-500 transition"
              >
                {verificandoEstoque ? "Verificando estoque..." : "Gerar produção"}
              </button>

              <button
                onClick={onExcluir}
                className="bg-red-500/20 text-red-300 px-4 py-3 rounded-xl text-sm hover:bg-red-500/30 transition"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
