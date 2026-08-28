"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import { auth, db } from "@/app/lib/firebase";

type StatusInstalacao =
  | "Aguardando Agendamento"
  | "Agendado"
  | "Em Deslocamento"
  | "Instalando"
  | "Finalizado"
  | "Cancelado";

type FiltroHistorico = "Todos" | "Finalizado" | "Cancelado";
type Documento = Record<string, unknown>;
type DataLike =
  | Date
  | string
  | number
  | { seconds?: number; toDate?: () => Date }
  | null
  | undefined;

type FotoInstalacao = {
  nome: string;
  url: string;
};

type HistoricoInstalacao = {
  acao: string;
  statusAnterior?: string;
  statusNovo?: string;
  usuarioId?: string;
  observacao?: string;
  data: DataLike;
};

type Instalacao = {
  id: string;
  tenantId: string;
  numeroOS: string;
  cliente: string;
  telefone: string;
  telefoneSecundario: string;
  servico: string;
  endereco: string;
  data: string;
  horario: string;
  responsavel: string;
  ajudante: string;
  observacoes: string;
  materiais: string[];
  fotos: FotoInstalacao[];
  status: StatusInstalacao;
  finalizado: boolean;
  cancelado: boolean;
  origem: string;
  criadoEm: DataLike;
  atualizadoEm: DataLike;
  finalizadoEm: DataLike;
  canceladoEm: DataLike;
  statusAtualizadoEm: DataLike;
  historico: HistoricoInstalacao[];
};

const STATUS_KANBAN: StatusInstalacao[] = [
  "Aguardando Agendamento",
  "Agendado",
  "Em Deslocamento",
  "Instalando",
];

const STATUS_HISTORICO: StatusInstalacao[] = ["Finalizado", "Cancelado"];
const TODOS_STATUS: StatusInstalacao[] = [...STATUS_KANBAN, ...STATUS_HISTORICO];
const ITENS_POR_PAGINA = 8;

const PROXIMA_ETAPA: Record<string, StatusInstalacao> = {
  "Aguardando Agendamento": "Agendado",
  Agendado: "Em Deslocamento",
  "Em Deslocamento": "Instalando",
  Instalando: "Finalizado",
};

const ROTULO_ACAO: Record<string, string> = {
  "Aguardando Agendamento": "Agendar",
  Agendado: "Saiu para instalação",
  "Em Deslocamento": "Iniciar instalação",
  Instalando: "Finalizar instalação",
};

function texto(valor: unknown) {
  return String(valor || "").trim();
}

function booleano(valor: unknown) {
  return valor === true;
}

function obterTimestamp(data: DataLike) {
  if (!data) return 0;
  if (typeof data === "number") return data;
  if (typeof data === "string") {
    const convertido = new Date(data).getTime();
    return Number.isNaN(convertido) ? 0 : convertido;
  }
  if (data instanceof Date) return data.getTime();

  if (data.seconds) return data.seconds * 1000;
  if (data.toDate) return data.toDate().getTime();

  return 0;
}

function dataValida(data: string) {
  if (!data) return true;
  const timestamp = new Date(`${data}T00:00:00`).getTime();
  return !Number.isNaN(timestamp);
}

function horarioValido(horario: string) {
  if (!horario) return true;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(horario);
}

function normalizarStatus(status: unknown, finalizado?: unknown): StatusInstalacao {
  if (booleano(finalizado)) return "Finalizado";

  const valor = texto(status)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (valor.includes("cancel")) return "Cancelado";
  if (valor.includes("final")) return "Finalizado";
  if (valor.includes("instalando")) return "Instalando";
  if (valor.includes("desloc")) return "Em Deslocamento";
  if (valor === "agendado") return "Agendado";

  return "Aguardando Agendamento";
}

function normalizarLista(valor: unknown): string[] {
  if (Array.isArray(valor)) {
    return valor
      .map((item) => {
        if (typeof item === "string") return item.trim();
        const dados = (item || {}) as Documento;
        return texto(dados.nome || dados.material || dados.servico);
      })
      .filter(Boolean);
  }

  return texto(valor)
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizarFotos(valor: unknown): FotoInstalacao[] {
  if (!Array.isArray(valor)) return [];

  return valor
    .map((item, index) => {
      if (typeof item === "string") {
        return { nome: `Foto ${index + 1}`, url: item };
      }

      const dados = (item || {}) as Documento;
      const url = texto(dados.url);

      if (!url) return null;

      return {
        nome: texto(dados.nome) || `Foto ${index + 1}`,
        url,
      };
    })
    .filter(Boolean) as FotoInstalacao[];
}

function formatarDataHora(data: string, horario: string) {
  const hora = horario || "Sem hora";

  if (!data || !dataValida(data)) return `Sem data • ${hora}`;

  const dataInstalacao = new Date(`${data}T00:00:00`);
  const hoje = new Date();
  const amanha = new Date();
  amanha.setDate(hoje.getDate() + 1);

  const mesmoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (mesmoDia(dataInstalacao, hoje)) return `Hoje • ${hora}`;
  if (mesmoDia(dataInstalacao, amanha)) return `Amanhã • ${hora}`;

  return `${dataInstalacao.toLocaleDateString("pt-BR")} • ${hora}`;
}

function formatarDataCompleta(data: string, horario: string) {
  if (!data || !dataValida(data)) return horario || "Não informada";
  return `${new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")} ${
    horario || ""
  }`.trim();
}

function formatarDataHistorico(data: DataLike) {
  const timestamp = obterTimestamp(data);
  if (!timestamp) return "Não informado";

  return new Date(timestamp).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function enderecoResumo(endereco: string) {
  if (!endereco) return "Endereço pendente";
  return endereco.split(",")[0]?.trim() || endereco;
}

function classeStatus(status: StatusInstalacao) {
  const classes: Record<StatusInstalacao, string> = {
    "Aguardando Agendamento": "bg-zinc-800 text-zinc-300 border-zinc-700",
    Agendado: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    "Em Deslocamento": "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    Instalando: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
    Finalizado: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    Cancelado: "bg-red-500/15 text-red-300 border-red-500/30",
  };

  return classes[status];
}

function usuarioAtualObrigatorio() {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Usuário não autenticado.");
  return usuario;
}

function normalizarInstalacao(id: string, dados: Documento): Instalacao {
  const status = normalizarStatus(dados.status, dados.finalizado);
  const finalizado = status === "Finalizado" || booleano(dados.finalizado);
  const cancelado = status === "Cancelado" || booleano(dados.cancelado);

  return {
    id,
    tenantId: texto(dados.tenantId),
    numeroOS: texto(dados.numeroOS) || "Sem OS",
    cliente: texto(dados.cliente),
    telefone: texto(dados.telefone),
    telefoneSecundario: texto(dados.telefoneSecundario),
    servico: texto(dados.servico),
    endereco: texto(dados.endereco),
    data: texto(dados.data),
    horario: texto(dados.horario),
    responsavel: texto(dados.responsavel),
    ajudante: texto(dados.ajudante),
    observacoes: texto(dados.observacoes),
    materiais: normalizarLista(dados.materiais || dados.material),
    fotos: normalizarFotos(dados.fotos || dados.arquivos || dados.mockups),
    status,
    finalizado,
    cancelado,
    origem: texto(dados.origem),
    criadoEm: (dados.criadoEm || dados.createdAt || null) as DataLike,
    atualizadoEm: (dados.atualizadoEm || dados.updatedAt || null) as DataLike,
    finalizadoEm: (dados.finalizadoEm || null) as DataLike,
    canceladoEm: (dados.canceladoEm || null) as DataLike,
    statusAtualizadoEm: (dados.statusAtualizadoEm || null) as DataLike,
    historico: Array.isArray(dados.historico)
      ? (dados.historico as HistoricoInstalacao[])
      : [],
  };
}

function criarHistorico(
  acao: string,
  statusAnterior?: string,
  statusNovo?: string,
  observacao?: string
): HistoricoInstalacao {
  return {
    acao,
    statusAnterior,
    statusNovo,
    observacao,
    usuarioId: auth.currentUser?.uid || "",
    data: new Date(),
  };
}

function ordenarInstalacoes(a: Instalacao, b: Instalacao) {
  const statusA = STATUS_KANBAN.indexOf(a.status);
  const statusB = STATUS_KANBAN.indexOf(b.status);

  if (statusA !== statusB) return statusA - statusB;

  const dataA = a.data ? new Date(`${a.data}T${a.horario || "00:00"}`).getTime() : 0;
  const dataB = b.data ? new Date(`${b.data}T${b.horario || "00:00"}`).getTime() : 0;

  return dataA - dataB;
}

function correspondeBusca(instalacao: Instalacao, busca: string) {
  const termo = busca.toLowerCase().trim();
  if (!termo) return true;

  return [
    instalacao.numeroOS,
    instalacao.cliente,
    instalacao.servico,
    instalacao.endereco,
    instalacao.responsavel,
    instalacao.telefone,
    instalacao.telefoneSecundario,
    instalacao.materiais.join(" "),
  ]
    .join(" ")
    .toLowerCase()
    .includes(termo);
}

export default function InstalacoesPage() {
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [instalacoes, setInstalacoes] = useState<Instalacao[]>([]);
  const [instalacaoDetalhe, setInstalacaoDetalhe] = useState<Instalacao | null>(
    null
  );
  const [modoEdicao, setModoEdicao] = useState(false);
  const [instalacaoEditandoId, setInstalacaoEditandoId] = useState("");

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [acaoEmProgresso, setAcaoEmProgresso] = useState("");
  const [toast, setToast] = useState("");
  const [erro, setErro] = useState("");

  const [buscaGlobal, setBuscaGlobal] = useState("");
  const [buscaHistorico, setBuscaHistorico] = useState("");
  const [filtroHistorico, setFiltroHistorico] =
    useState<FiltroHistorico>("Todos");
  const [paginaHistorico, setPaginaHistorico] = useState(1);

  const [numeroOS, setNumeroOS] = useState("");
  const [cliente, setCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [telefoneSecundario, setTelefoneSecundario] = useState("");
  const [servico, setServico] = useState("");
  const [endereco, setEndereco] = useState("");
  const [data, setData] = useState("");
  const [horario, setHorario] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [ajudante, setAjudante] = useState("");
  const [materiaisTexto, setMateriaisTexto] = useState("");
  const [fotosTexto, setFotosTexto] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [status, setStatus] =
    useState<StatusInstalacao>("Aguardando Agendamento");

  function mostrarToast(mensagem: string) {
    setToast(mensagem);
    window.setTimeout(() => setToast(""), 3500);
  }

  const carregarInstalacoes = useCallback(async () => {
    try {
      setCarregando(true);
      setErro("");

      const usuario = usuarioAtualObrigatorio();

      const snapshot = await getDocs(
        query(
          collection(db, "instalacoes"),
          where("tenantId", "==", usuario.uid),
          limit(200)
        )
      );

      const lista = snapshot.docs
        .map((documento) => normalizarInstalacao(documento.id, documento.data()))
        .sort(ordenarInstalacoes);

      setInstalacoes(lista);
    } catch (erroCarregamento) {
      console.error(erroCarregamento);
      setErro("Não foi possível carregar as instalações.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      carregarInstalacoes();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [carregarInstalacoes]);

  const instalacoesAtivas = useMemo(() => {
    return instalacoes
      .filter(
        (instalacao) =>
          STATUS_KANBAN.includes(instalacao.status) &&
          !instalacao.finalizado &&
          !instalacao.cancelado
      )
      .filter((instalacao) => correspondeBusca(instalacao, buscaGlobal));
  }, [instalacoes, buscaGlobal]);

  const colunasKanban = useMemo(() => {
    return STATUS_KANBAN.map((statusColuna) => ({
      status: statusColuna,
      itens: instalacoesAtivas.filter(
        (instalacao) => instalacao.status === statusColuna
      ),
    }));
  }, [instalacoesAtivas]);

  const historicoFiltrado = useMemo(() => {
    return instalacoes
      .filter(
        (instalacao) =>
          STATUS_HISTORICO.includes(instalacao.status) ||
          instalacao.finalizado ||
          instalacao.cancelado
      )
      .filter((instalacao) => correspondeBusca(instalacao, buscaGlobal))
      .filter((instalacao) => correspondeBusca(instalacao, buscaHistorico))
      .filter(
        (instalacao) =>
          filtroHistorico === "Todos" || instalacao.status === filtroHistorico
      )
      .sort((a, b) => {
        const dataA =
          obterTimestamp(a.finalizadoEm) ||
          obterTimestamp(a.canceladoEm) ||
          obterTimestamp(a.atualizadoEm);
        const dataB =
          obterTimestamp(b.finalizadoEm) ||
          obterTimestamp(b.canceladoEm) ||
          obterTimestamp(b.atualizadoEm);

        return dataB - dataA;
      });
  }, [instalacoes, buscaGlobal, buscaHistorico, filtroHistorico]);

  const totalPaginasHistorico = Math.max(
    1,
    Math.ceil(historicoFiltrado.length / ITENS_POR_PAGINA)
  );
  const paginaHistoricoAtual = Math.min(
    paginaHistorico,
    totalPaginasHistorico
  );

  const historicoPaginado = historicoFiltrado.slice(
    (paginaHistoricoAtual - 1) * ITENS_POR_PAGINA,
    paginaHistoricoAtual * ITENS_POR_PAGINA
  );

  const totalAtivas = instalacoesAtivas.length;
  const totalFinalizadas = instalacoes.filter(
    (instalacao) => instalacao.status === "Finalizado" || instalacao.finalizado
  ).length;

  function limparFormulario() {
    setNumeroOS("");
    setCliente("");
    setTelefone("");
    setTelefoneSecundario("");
    setServico("");
    setEndereco("");
    setData("");
    setHorario("");
    setResponsavel("");
    setAjudante("");
    setMateriaisTexto("");
    setFotosTexto("");
    setObservacoes("");
    setStatus("Aguardando Agendamento");
    setInstalacaoEditandoId("");
    setModoEdicao(false);
  }

  function preencherFormulario(instalacao: Instalacao) {
    setNumeroOS(instalacao.numeroOS === "Sem OS" ? "" : instalacao.numeroOS);
    setCliente(instalacao.cliente);
    setTelefone(instalacao.telefone);
    setTelefoneSecundario(instalacao.telefoneSecundario);
    setServico(instalacao.servico);
    setEndereco(instalacao.endereco);
    setData(instalacao.data);
    setHorario(instalacao.horario);
    setResponsavel(instalacao.responsavel);
    setAjudante(instalacao.ajudante);
    setMateriaisTexto(instalacao.materiais.join("\n"));
    setFotosTexto(instalacao.fotos.map((foto) => foto.url).join("\n"));
    setObservacoes(instalacao.observacoes);
    setStatus(instalacao.status);
    setInstalacaoEditandoId(instalacao.id);
  }

  function validarFormulario() {
    if (!numeroOS.trim()) return "Informe o número da OS.";
    if (!cliente.trim()) return "Informe o cliente.";
    if (!servico.trim()) return "Informe o serviço.";
    if (!endereco.trim()) return "Informe o endereço da instalação.";
    if (!dataValida(data)) return "Informe uma data válida.";
    if (!horarioValido(horario)) return "Informe um horário válido.";
    if (!TODOS_STATUS.includes(status)) return "Status inválido.";

    return "";
  }

  async function salvarInstalacao() {
    const mensagemErro = validarFormulario();

    if (mensagemErro) {
      mostrarToast(mensagemErro);
      return;
    }

    if (salvando) return;

    try {
      setSalvando(true);
      const usuario = usuarioAtualObrigatorio();
      const agora = new Date();
      const materiais = normalizarLista(materiaisTexto);
      const fotos = normalizarLista(fotosTexto).map((url, index) => ({
        nome: `Foto ${index + 1}`,
        url,
      }));

      const dados = {
        tenantId: usuario.uid,
        numeroOS: numeroOS.trim(),
        cliente: cliente.trim(),
        telefone: telefone.trim(),
        telefoneSecundario: telefoneSecundario.trim(),
        servico: servico.trim(),
        endereco: endereco.trim(),
        data,
        horario,
        responsavel: responsavel.trim(),
        ajudante: ajudante.trim(),
        materiais,
        fotos,
        observacoes: observacoes.trim(),
        status,
        finalizado: status === "Finalizado",
        cancelado: status === "Cancelado",
        atualizadoEm: agora,
        updatedAt: agora,
      };

      if (instalacaoEditandoId) {
        const instalacaoAnterior = instalacoes.find(
          (instalacao) => instalacao.id === instalacaoEditandoId
        );

        if (!instalacaoAnterior) throw new Error("Instalação não encontrada.");

        await updateDoc(doc(db, "instalacoes", instalacaoEditandoId), {
          ...dados,
          historico: [
            ...instalacaoAnterior.historico,
            criarHistorico("Instalação editada", status, status),
          ],
        });

        console.info("Instalação editada", {
          id: instalacaoEditandoId,
          numeroOS,
        });
        mostrarToast("Instalação atualizada com segurança.");
      } else {
        await addDoc(collection(db, "instalacoes"), {
          ...dados,
          criadoEm: agora,
          createdAt: agora,
          finalizadoEm: null,
          canceladoEm: null,
          statusAtualizadoEm: agora,
          historico: [criarHistorico("Instalação criada", "", status)],
        });

        console.info("Instalação criada", { numeroOS });
        mostrarToast("Instalação criada.");
      }

      await carregarInstalacoes();
      limparFormulario();
      setMostrarFormulario(false);
      setInstalacaoDetalhe(null);
    } catch (erroSalvamento) {
      console.error(erroSalvamento);
      mostrarToast("Erro ao salvar. Verifique conexão, login e permissões.");
    } finally {
      setSalvando(false);
    }
  }

  async function avancarEtapa(instalacao: Instalacao) {
    const proximoStatus = PROXIMA_ETAPA[instalacao.status];

    if (!proximoStatus || acaoEmProgresso) return;

    if (!instalacao.id) {
      mostrarToast("Instalação inválida.");
      return;
    }

    if (instalacao.status === "Aguardando Agendamento") {
      if (!instalacao.data || !instalacao.horario) {
        preencherFormulario(instalacao);
        setInstalacaoDetalhe(instalacao);
        setModoEdicao(true);
        mostrarToast("Informe data e horário antes de agendar.");
        return;
      }
    }

    if (proximoStatus === "Finalizado") {
      const confirmar = confirm(
        `Finalizar a instalação ${instalacao.numeroOS}? Ela sairá do Kanban e irá para o histórico.`
      );

      if (!confirmar) return;
    }

    try {
      setAcaoEmProgresso(`${instalacao.id}:${proximoStatus}`);
      const usuario = usuarioAtualObrigatorio();
      const agora = new Date();
      const historico = [
        ...instalacao.historico,
        criarHistorico(
          proximoStatus === "Finalizado"
            ? "Instalação finalizada"
            : "Status alterado",
          instalacao.status,
          proximoStatus
        ),
      ];

      await updateDoc(doc(db, "instalacoes", instalacao.id), {
        tenantId: instalacao.tenantId || usuario.uid,
        status: proximoStatus,
        finalizado: proximoStatus === "Finalizado",
        finalizadoEm: proximoStatus === "Finalizado" ? agora : null,
        cancelado: false,
        atualizadoEm: agora,
        updatedAt: agora,
        statusAtualizadoEm: agora,
        historico,
      });

      console.info(
        proximoStatus === "Finalizado"
          ? "Instalação finalizada"
          : "Status de instalação alterado",
        {
          id: instalacao.id,
          numeroOS: instalacao.numeroOS,
          statusAnterior: instalacao.status,
          statusNovo: proximoStatus,
        }
      );

      setInstalacoes((lista) =>
        lista.map((item) =>
          item.id === instalacao.id
            ? {
                ...item,
                status: proximoStatus,
                finalizado: proximoStatus === "Finalizado",
                finalizadoEm: proximoStatus === "Finalizado" ? agora : null,
                statusAtualizadoEm: agora,
                historico,
              }
            : item
        )
      );

      if (instalacaoDetalhe?.id === instalacao.id) {
        setInstalacaoDetalhe(
          proximoStatus === "Finalizado"
            ? null
            : {
                ...instalacaoDetalhe,
                status: proximoStatus,
                finalizado: false,
                statusAtualizadoEm: agora,
                historico,
              }
        );
      }

      mostrarToast(
        proximoStatus === "Finalizado"
          ? "Instalação finalizada e enviada ao histórico."
          : `Status alterado para ${proximoStatus}.`
      );
      await carregarInstalacoes();
    } catch (erroStatus) {
      console.error(erroStatus);
      mostrarToast("Erro ao alterar status. A ação não foi concluída.");
      await carregarInstalacoes();
    } finally {
      setAcaoEmProgresso("");
    }
  }

  async function cancelarInstalacao(instalacao: Instalacao) {
    const confirmar = confirm(
      `Cancelar a instalação ${instalacao.numeroOS}? Ela sairá do Kanban e ficará no histórico.`
    );

    if (!confirmar || acaoEmProgresso) return;

    try {
      setAcaoEmProgresso(`${instalacao.id}:cancelar`);
      const usuario = usuarioAtualObrigatorio();
      const agora = new Date();
      const historico = [
        ...instalacao.historico,
        criarHistorico("Instalação cancelada", instalacao.status, "Cancelado"),
      ];

      await updateDoc(doc(db, "instalacoes", instalacao.id), {
        tenantId: instalacao.tenantId || usuario.uid,
        status: "Cancelado",
        cancelado: true,
        canceladoEm: agora,
        finalizado: false,
        atualizadoEm: agora,
        updatedAt: agora,
        statusAtualizadoEm: agora,
        historico,
      });

      console.info("Instalação cancelada", {
        id: instalacao.id,
        numeroOS: instalacao.numeroOS,
      });
      mostrarToast("Instalação cancelada e movida para o histórico.");
      setInstalacaoDetalhe(null);
      await carregarInstalacoes();
    } catch (erroCancelamento) {
      console.error(erroCancelamento);
      mostrarToast("Erro ao cancelar instalação.");
    } finally {
      setAcaoEmProgresso("");
    }
  }

  async function excluirInstalacao(instalacao: Instalacao) {
    const confirmar = confirm(
      `Excluir definitivamente a instalação ${instalacao.numeroOS}? Esta ação não pode ser desfeita.`
    );

    if (!confirmar || acaoEmProgresso) return;

    try {
      setAcaoEmProgresso(`${instalacao.id}:excluir`);
      usuarioAtualObrigatorio();
      await deleteDoc(doc(db, "instalacoes", instalacao.id));

      console.info("Instalação excluída", {
        id: instalacao.id,
        numeroOS: instalacao.numeroOS,
      });
      mostrarToast("Instalação excluída.");
      setInstalacaoDetalhe(null);
      setInstalacoes((lista) =>
        lista.filter((item) => item.id !== instalacao.id)
      );
    } catch (erroExclusao) {
      console.error(erroExclusao);
      mostrarToast("Erro ao excluir. Verifique suas permissões.");
    } finally {
      setAcaoEmProgresso("");
    }
  }

  function abrirNovaInstalacao() {
    limparFormulario();
    setMostrarFormulario(true);
  }

  function abrirEdicao(instalacao: Instalacao) {
    preencherFormulario(instalacao);
    setModoEdicao(true);
  }

  function fecharFormulario() {
    limparFormulario();
    setMostrarFormulario(false);
  }

  return (
    <AuthGuard>
      <main className="flex min-h-screen bg-zinc-950 text-white">
        <Sidebar />

        <section className="flex-1 p-4 md:p-8 lg:p-10">
          {toast && (
            <div className="fixed right-4 top-4 z-50 max-w-sm rounded-2xl border border-green-500/30 bg-green-500 px-4 py-3 text-sm font-bold text-black shadow-2xl">
              {toast}
            </div>
          )}

          <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="mb-2 text-sm font-semibold text-green-400">
                Campo e instalação
              </p>
              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                Instalações
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-zinc-400">
                Painel operacional para acompanhar equipes, rotas e conclusão
                sem ruído visual.
              </p>
            </div>

            <button
              onClick={abrirNovaInstalacao}
              className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:bg-green-400"
            >
              Nova instalação
            </button>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px_180px]">
            <input
              placeholder="Busca global por OS, cliente, serviço, endereço ou responsável"
              value={buscaGlobal}
              onChange={(e) => {
                setBuscaGlobal(e.target.value);
                setPaginaHistorico(1);
              }}
              className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm outline-none transition placeholder:text-zinc-600 focus:border-green-500"
            />
            <MiniIndicador titulo="Ativas" valor={String(totalAtivas)} />
            <MiniIndicador titulo="No histórico" valor={String(totalFinalizadas)} />
          </div>

          {mostrarFormulario && (
            <FormularioInstalacao
              titulo="Nova instalação"
              numeroOS={numeroOS}
              setNumeroOS={setNumeroOS}
              cliente={cliente}
              setCliente={setCliente}
              telefone={telefone}
              setTelefone={setTelefone}
              telefoneSecundario={telefoneSecundario}
              setTelefoneSecundario={setTelefoneSecundario}
              servico={servico}
              setServico={setServico}
              endereco={endereco}
              setEndereco={setEndereco}
              data={data}
              setData={setData}
              horario={horario}
              setHorario={setHorario}
              responsavel={responsavel}
              setResponsavel={setResponsavel}
              ajudante={ajudante}
              setAjudante={setAjudante}
              materiaisTexto={materiaisTexto}
              setMateriaisTexto={setMateriaisTexto}
              fotosTexto={fotosTexto}
              setFotosTexto={setFotosTexto}
              observacoes={observacoes}
              setObservacoes={setObservacoes}
              onCancelar={fecharFormulario}
              onSalvar={salvarInstalacao}
              salvando={salvando}
              textoBotao="Salvar instalação"
            />
          )}

          <section className="mb-10">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black">Instalações ativas</h2>
                <p className="text-xs text-zinc-500">
                  Finalizadas e canceladas saem automaticamente do Kanban.
                </p>
              </div>
              <button
                onClick={carregarInstalacoes}
                disabled={carregando}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
              >
                Atualizar
              </button>
            </div>

            {erro && (
              <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                {erro}
              </div>
            )}

            {carregando ? (
              <SkeletonKanban />
            ) : (
              <div className="overflow-x-auto pb-3">
                <div className="grid min-w-[940px] grid-cols-4 gap-3">
                  {colunasKanban.map(({ status: statusColuna, itens }) => (
                    <div
                      key={statusColuna}
                      className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3"
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h3 className="min-w-0 truncate text-sm font-black">
                          {statusColuna}
                        </h3>
                        <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-xs font-bold text-zinc-300">
                          {itens.length}
                        </span>
                      </div>

                      <div className="flex flex-col gap-2">
                        {itens.map((instalacao) => (
                          <CardInstalacao
                            key={instalacao.id}
                            instalacao={instalacao}
                            onAvancar={() => avancarEtapa(instalacao)}
                            onDetalhes={() => {
                              setInstalacaoDetalhe(instalacao);
                              setModoEdicao(false);
                            }}
                            carregando={acaoEmProgresso.startsWith(
                              `${instalacao.id}:`
                            )}
                          />
                        ))}

                        {itens.length === 0 && (
                          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 p-4 text-center text-xs text-zinc-500">
                            Nada neste estágio.
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 md:p-5">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-black">Histórico de instalações</h2>
                <p className="text-xs text-zinc-500">
                  Instalações finalizadas e canceladas continuam salvas.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:w-[520px]">
                <input
                  placeholder="Buscar no histórico"
                  value={buscaHistorico}
                  onChange={(e) => {
                    setBuscaHistorico(e.target.value);
                    setPaginaHistorico(1);
                  }}
                  className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none transition placeholder:text-zinc-600 focus:border-green-500"
                />
                <select
                  value={filtroHistorico}
                  onChange={(e) => {
                    setFiltroHistorico(e.target.value as FiltroHistorico);
                    setPaginaHistorico(1);
                  }}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none transition focus:border-green-500"
                >
                  <option value="Todos">Todos</option>
                  <option value="Finalizado">Finalizadas</option>
                  <option value="Cancelado">Canceladas</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs uppercase text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="py-3 pr-3">OS</th>
                    <th className="py-3 pr-3">Cliente</th>
                    <th className="py-3 pr-3">Serviço</th>
                    <th className="py-3 pr-3">Finalização</th>
                    <th className="py-3 pr-3">Responsável</th>
                    <th className="py-3 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {historicoPaginado.map((instalacao) => (
                    <tr
                      key={instalacao.id}
                      className="border-b border-zinc-800/70 transition hover:bg-zinc-950"
                    >
                      <td className="py-3 pr-3 font-black text-green-400">
                        {instalacao.numeroOS}
                      </td>
                      <td className="max-w-[180px] py-3 pr-3">
                        <button
                          onClick={() => {
                            setInstalacaoDetalhe(instalacao);
                            setModoEdicao(false);
                          }}
                          className="max-w-full truncate text-left font-bold text-zinc-100 hover:text-green-300"
                        >
                          {instalacao.cliente || "Cliente não informado"}
                        </button>
                      </td>
                      <td className="max-w-[220px] truncate py-3 pr-3 text-zinc-300">
                        {instalacao.servico || "-"}
                      </td>
                      <td className="py-3 pr-3 text-xs text-zinc-400">
                        {formatarDataHistorico(
                          instalacao.finalizadoEm || instalacao.canceladoEm
                        )}
                      </td>
                      <td className="max-w-[160px] truncate py-3 pr-3 text-zinc-300">
                        {instalacao.responsavel || "Sem responsável"}
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={`rounded-full border px-2 py-1 text-xs font-bold ${classeStatus(
                            instalacao.status
                          )}`}
                        >
                          {instalacao.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {historicoFiltrado.length === 0 && (
              <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 p-6 text-center text-sm text-zinc-500">
                Nenhuma instalação no histórico ainda.
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-3 text-xs text-zinc-500">
              <span>
                Página {paginaHistoricoAtual} de {totalPaginasHistorico}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setPaginaHistorico((pagina) => Math.max(1, pagina - 1))
                  }
                  disabled={paginaHistoricoAtual === 1}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 font-bold text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  onClick={() =>
                    setPaginaHistorico((pagina) =>
                      Math.min(totalPaginasHistorico, pagina + 1)
                    )
                  }
                  disabled={paginaHistoricoAtual >= totalPaginasHistorico}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 font-bold text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-40"
                >
                  Próxima
                </button>
              </div>
            </div>
          </section>

          {instalacaoDetalhe && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
              <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl">
                <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-green-400">
                      {instalacaoDetalhe.numeroOS}
                    </p>
                    <h2 className="mt-1 truncate text-2xl font-black">
                      {instalacaoDetalhe.cliente || "Cliente não informado"}
                    </h2>
                    <p className="mt-1 text-sm text-zinc-400">
                      {instalacaoDetalhe.servico || "Serviço não informado"}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setInstalacaoDetalhe(null);
                      setModoEdicao(false);
                      limparFormulario();
                    }}
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-bold text-zinc-300 transition hover:bg-zinc-800"
                  >
                    Fechar
                  </button>
                </div>

                {modoEdicao ? (
                  <FormularioInstalacao
                    titulo="Editar instalação"
                    numeroOS={numeroOS}
                    setNumeroOS={setNumeroOS}
                    cliente={cliente}
                    setCliente={setCliente}
                    telefone={telefone}
                    setTelefone={setTelefone}
                    telefoneSecundario={telefoneSecundario}
                    setTelefoneSecundario={setTelefoneSecundario}
                    servico={servico}
                    setServico={setServico}
                    endereco={endereco}
                    setEndereco={setEndereco}
                    data={data}
                    setData={setData}
                    horario={horario}
                    setHorario={setHorario}
                    responsavel={responsavel}
                    setResponsavel={setResponsavel}
                    ajudante={ajudante}
                    setAjudante={setAjudante}
                    materiaisTexto={materiaisTexto}
                    setMateriaisTexto={setMateriaisTexto}
                    fotosTexto={fotosTexto}
                    setFotosTexto={setFotosTexto}
                    observacoes={observacoes}
                    setObservacoes={setObservacoes}
                    onCancelar={() => {
                      setModoEdicao(false);
                      limparFormulario();
                    }}
                    onSalvar={salvarInstalacao}
                    salvando={salvando}
                    textoBotao="Salvar alterações"
                  />
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <ResumoDetalhe titulo="Telefones" valor={[instalacaoDetalhe.telefone, instalacaoDetalhe.telefoneSecundario].filter(Boolean).join(" / ") || "-"} />
                      <ResumoDetalhe titulo="Responsável" valor={instalacaoDetalhe.responsavel || "-"} />
                      <ResumoDetalhe titulo="Data" valor={formatarDataCompleta(instalacaoDetalhe.data, instalacaoDetalhe.horario)} />
                      <ResumoDetalhe titulo="Status" valor={instalacaoDetalhe.status} destaque={classeStatus(instalacaoDetalhe.status)} />
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <BlocoDetalhe titulo="Endereço completo">
                        {instalacaoDetalhe.endereco || "Endereço não informado."}
                      </BlocoDetalhe>
                      <BlocoDetalhe titulo="Materiais">
                        {instalacaoDetalhe.materiais.length > 0
                          ? instalacaoDetalhe.materiais.join(", ")
                          : "Nenhum material vinculado."}
                      </BlocoDetalhe>
                      <BlocoDetalhe titulo="Observações">
                        {instalacaoDetalhe.observacoes || "Sem observações."}
                      </BlocoDetalhe>
                      <BlocoDetalhe titulo="Equipe">
                        Responsável: {instalacaoDetalhe.responsavel || "-"}
                        <br />
                        Ajudante: {instalacaoDetalhe.ajudante || "-"}
                      </BlocoDetalhe>
                    </div>

                    <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                      <h3 className="mb-3 text-sm font-black">Fotos</h3>
                      {instalacaoDetalhe.fotos.length > 0 ? (
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                          {instalacaoDetalhe.fotos.map((foto, index) => (
                            <a
                              key={`${foto.url}-${index}`}
                              href={foto.url}
                              target="_blank"
                              rel="noreferrer"
                              className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 transition hover:border-green-500/50"
                            >
                              <div
                                aria-label={foto.nome}
                                className="h-28 w-full bg-cover bg-center"
                                style={{ backgroundImage: `url(${foto.url})` }}
                              />
                              <p className="truncate px-3 py-2 text-xs text-zinc-400">
                                {foto.nome}
                              </p>
                            </a>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-zinc-500">
                          Nenhuma foto vinculada.
                        </p>
                      )}
                    </div>

                    <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                      <h3 className="mb-3 text-sm font-black">
                        Histórico de status
                      </h3>
                      <div className="flex max-h-60 flex-col gap-2 overflow-y-auto pr-1">
                        {instalacaoDetalhe.historico.length > 0 ? (
                          [...instalacaoDetalhe.historico]
                            .reverse()
                            .map((item, index) => (
                              <div
                                key={`${item.acao}-${index}`}
                                className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3"
                              >
                                <p className="text-sm font-bold text-zinc-200">
                                  {item.acao}
                                </p>
                                <p className="mt-1 text-xs text-zinc-500">
                                  {item.statusAnterior || "-"} →{" "}
                                  {item.statusNovo || "-"} •{" "}
                                  {formatarDataHistorico(item.data)}
                                </p>
                              </div>
                            ))
                        ) : (
                          <p className="text-sm text-zinc-500">
                            Nenhum registro de histórico.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-2 md:flex-row md:justify-end">
                      {STATUS_KANBAN.includes(instalacaoDetalhe.status) && (
                        <button
                          onClick={() => avancarEtapa(instalacaoDetalhe)}
                          disabled={Boolean(acaoEmProgresso)}
                          className="rounded-xl bg-green-500 px-4 py-2 text-sm font-bold text-black transition hover:bg-green-400 disabled:opacity-50"
                        >
                          {ROTULO_ACAO[instalacaoDetalhe.status]}
                        </button>
                      )}
                      <button
                        onClick={() => abrirEdicao(instalacaoDetalhe)}
                        className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-bold text-zinc-200 transition hover:bg-zinc-800"
                      >
                        Editar instalação
                      </button>
                      {STATUS_KANBAN.includes(instalacaoDetalhe.status) && (
                        <button
                          onClick={() => cancelarInstalacao(instalacaoDetalhe)}
                          disabled={Boolean(acaoEmProgresso)}
                          className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm font-bold text-yellow-300 transition hover:bg-yellow-500/20 disabled:opacity-50"
                        >
                          Cancelar instalação
                        </button>
                      )}
                      <button
                        onClick={() => excluirInstalacao(instalacaoDetalhe)}
                        disabled={Boolean(acaoEmProgresso)}
                        className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                      >
                        Excluir instalação
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </AuthGuard>
  );
}

function CardInstalacao({
  instalacao,
  onAvancar,
  onDetalhes,
  carregando,
}: {
  instalacao: Instalacao;
  onAvancar: () => void;
  onDetalhes: () => void;
  carregando: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 transition hover:border-green-500/50">
      <p className="truncate text-sm font-black text-green-400">
        {instalacao.numeroOS}
      </p>
      <p className="mt-1 truncate text-sm font-bold text-zinc-100">
        {instalacao.cliente || "Cliente não informado"}
      </p>
      <p className="truncate text-xs text-zinc-400">
        {instalacao.servico || "Serviço não informado"}
      </p>

      <div className="my-3 space-y-1 text-xs text-zinc-400">
        <p className="truncate font-bold text-zinc-300">
          {formatarDataHora(instalacao.data, instalacao.horario)}
        </p>
        <p className="truncate">{enderecoResumo(instalacao.endereco)}</p>
      </div>

      <p className="truncate text-xs text-zinc-400">
        <span className="text-zinc-500">Responsável:</span>{" "}
        {instalacao.responsavel || "Definir"}
      </p>

      <div className="mt-3 flex flex-col gap-2">
        <button
          onClick={onAvancar}
          disabled={carregando}
          className="rounded-xl bg-green-500 px-3 py-2 text-xs font-black text-black transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {carregando ? "Processando..." : ROTULO_ACAO[instalacao.status]}
        </button>
        <button
          onClick={onDetalhes}
          className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-200 transition hover:bg-zinc-800"
        >
          Ver detalhes
        </button>
      </div>
    </div>
  );
}

function FormularioInstalacao({
  titulo,
  numeroOS,
  setNumeroOS,
  cliente,
  setCliente,
  telefone,
  setTelefone,
  telefoneSecundario,
  setTelefoneSecundario,
  servico,
  setServico,
  endereco,
  setEndereco,
  data,
  setData,
  horario,
  setHorario,
  responsavel,
  setResponsavel,
  ajudante,
  setAjudante,
  materiaisTexto,
  setMateriaisTexto,
  fotosTexto,
  setFotosTexto,
  observacoes,
  setObservacoes,
  onCancelar,
  onSalvar,
  salvando,
  textoBotao,
}: {
  titulo: string;
  numeroOS: string;
  setNumeroOS: (valor: string) => void;
  cliente: string;
  setCliente: (valor: string) => void;
  telefone: string;
  setTelefone: (valor: string) => void;
  telefoneSecundario: string;
  setTelefoneSecundario: (valor: string) => void;
  servico: string;
  setServico: (valor: string) => void;
  endereco: string;
  setEndereco: (valor: string) => void;
  data: string;
  setData: (valor: string) => void;
  horario: string;
  setHorario: (valor: string) => void;
  responsavel: string;
  setResponsavel: (valor: string) => void;
  ajudante: string;
  setAjudante: (valor: string) => void;
  materiaisTexto: string;
  setMateriaisTexto: (valor: string) => void;
  fotosTexto: string;
  setFotosTexto: (valor: string) => void;
  observacoes: string;
  setObservacoes: (valor: string) => void;
  onCancelar: () => void;
  onSalvar: () => void;
  salvando: boolean;
  textoBotao: string;
}) {
  const inputClass =
    "min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm outline-none transition placeholder:text-zinc-600 focus:border-green-500";

  return (
    <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-black">{titulo}</h2>
        <button
          onClick={onCancelar}
          className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-bold text-zinc-300 transition hover:bg-zinc-800"
        >
          Cancelar
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input
          placeholder="Número da OS"
          value={numeroOS}
          onChange={(e) => setNumeroOS(e.target.value)}
          className={inputClass}
        />
        <input
          placeholder="Cliente"
          value={cliente}
          onChange={(e) => setCliente(e.target.value)}
          className={inputClass}
        />
        <input
          placeholder="Telefone principal"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          className={inputClass}
        />
        <input
          placeholder="Telefone secundário"
          value={telefoneSecundario}
          onChange={(e) => setTelefoneSecundario(e.target.value)}
          className={inputClass}
        />
        <input
          placeholder="Serviço"
          value={servico}
          onChange={(e) => setServico(e.target.value)}
          className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm outline-none transition placeholder:text-zinc-600 focus:border-green-500 xl:col-span-2"
        />
        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className={inputClass}
        />
        <input
          type="time"
          value={horario}
          onChange={(e) => setHorario(e.target.value)}
          className={inputClass}
        />
        <input
          placeholder="Endereço completo"
          value={endereco}
          onChange={(e) => setEndereco(e.target.value)}
          className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm outline-none transition placeholder:text-zinc-600 focus:border-green-500 md:col-span-2"
        />
        <input
          placeholder="Responsável"
          value={responsavel}
          onChange={(e) => setResponsavel(e.target.value)}
          className={inputClass}
        />
        <input
          placeholder="Ajudante"
          value={ajudante}
          onChange={(e) => setAjudante(e.target.value)}
          className={inputClass}
        />
        <textarea
          placeholder="Materiais, um por linha"
          value={materiaisTexto}
          onChange={(e) => setMateriaisTexto(e.target.value)}
          className="min-h-24 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm outline-none transition placeholder:text-zinc-600 focus:border-green-500 md:col-span-2"
        />
        <textarea
          placeholder="URLs das fotos, uma por linha"
          value={fotosTexto}
          onChange={(e) => setFotosTexto(e.target.value)}
          className="min-h-24 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm outline-none transition placeholder:text-zinc-600 focus:border-green-500 md:col-span-2"
        />
        <textarea
          placeholder="Observações, acesso ao local, riscos, ferramentas necessárias..."
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          className="min-h-24 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm outline-none transition placeholder:text-zinc-600 focus:border-green-500 md:col-span-2 xl:col-span-4"
        />
      </div>

      <button
        onClick={onSalvar}
        disabled={salvando}
        className="mt-4 rounded-xl bg-green-500 px-5 py-3 text-sm font-black text-black transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {salvando ? "Salvando..." : textoBotao}
      </button>
    </div>
  );
}

function MiniIndicador({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3">
      <p className="text-xs text-zinc-500">{titulo}</p>
      <p className="text-xl font-black text-zinc-100">{valor}</p>
    </div>
  );
}

function ResumoDetalhe({
  titulo,
  valor,
  destaque = "",
}: {
  titulo: string;
  valor: string;
  destaque?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-xs text-zinc-500">{titulo}</p>
      {destaque ? (
        <span
          className={`mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-bold ${destaque}`}
        >
          {valor}
        </span>
      ) : (
        <p className="mt-1 truncate text-sm font-bold text-zinc-200">{valor}</p>
      )}
    </div>
  );
}

function BlocoDetalhe({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <h3 className="mb-2 text-sm font-black">{titulo}</h3>
      <p className="text-sm leading-relaxed text-zinc-300">{children}</p>
    </div>
  );
}

function SkeletonKanban() {
  return (
    <div className="overflow-x-auto pb-3">
      <div className="grid min-w-[940px] grid-cols-4 gap-3">
        {STATUS_KANBAN.map((status) => (
          <div
            key={status}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3"
          >
            <div className="mb-3 h-5 w-2/3 rounded bg-zinc-800" />
            <div className="space-y-2">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-40 animate-pulse rounded-2xl bg-zinc-950"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
