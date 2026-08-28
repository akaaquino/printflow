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
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import { auth, db } from "@/app/lib/firebase";

type PeriodoHistorico = "hoje" | "semana" | "mes" | "ano" | "periodo";
type AbaFinanceiro = "visao" | "historico" | "caixa";
type TipoMovimentacaoCaixa =
  | "despesa"
  | "sangria"
  | "suprimento"
  | "entrada";

const ABAS_FINANCEIRO: { id: AbaFinanceiro; label: string }[] = [
  { id: "visao", label: "Visão Geral" },
  { id: "historico", label: "Histórico de Vendas" },
  { id: "caixa", label: "Fechamento de Caixa" },
];

const OPCOES_PERIODO: { id: PeriodoHistorico; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
  { id: "ano", label: "Ano" },
  { id: "periodo", label: "Período" },
];

function dataParaInput(data: Date) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function parseValor(valor: any) {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;

  if (typeof valor === "string") {
    const normalizado = valor
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3}(,|$))/g, "")
      .replace(",", ".");

    return Number(normalizado) || 0;
  }

  return 0;
}

function formatarMoeda(valor: any) {
  return parseValor(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function converterData(valor: any) {
  if (!valor) return null;

  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor;
  }

  if (typeof valor?.toDate === "function") {
    const data = valor.toDate();
    return Number.isNaN(data.getTime()) ? null : data;
  }

  if (typeof valor?.seconds === "number") {
    const data = new Date(valor.seconds * 1000);
    return Number.isNaN(data.getTime()) ? null : data;
  }

  if (typeof valor === "string" || typeof valor === "number") {
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? null : data;
  }

  return null;
}

function inicioDoDia(data: Date) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate(), 0, 0, 0, 0);
}

function fimDoDia(data: Date) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate(), 23, 59, 59, 999);
}

function obterIntervaloPeriodo(
  periodo: PeriodoHistorico,
  personalizado: { inicio: string; fim: string }
) {
  const hoje = new Date();

  if (periodo === "hoje") {
    return {
      inicio: inicioDoDia(hoje),
      fim: fimDoDia(hoje),
    };
  }

  if (periodo === "semana") {
    const diaSemana = hoje.getDay();
    const diasDesdeSegunda = diaSemana === 0 ? 6 : diaSemana - 1;
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - diasDesdeSegunda);

    const fim = new Date(inicio);
    fim.setDate(inicio.getDate() + 6);

    return {
      inicio: inicioDoDia(inicio),
      fim: fimDoDia(fim),
    };
  }

  if (periodo === "mes") {
    return {
      inicio: new Date(hoje.getFullYear(), hoje.getMonth(), 1, 0, 0, 0, 0),
      fim: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }

  if (periodo === "ano") {
    return {
      inicio: new Date(hoje.getFullYear(), 0, 1, 0, 0, 0, 0),
      fim: new Date(hoje.getFullYear(), 11, 31, 23, 59, 59, 999),
    };
  }

  return {
    inicio: inicioDoDia(new Date(`${personalizado.inicio}T00:00:00`)),
    fim: fimDoDia(new Date(`${personalizado.fim}T00:00:00`)),
  };
}

function formatarDataVenda(data: Date | null) {
  if (!data) return "-";

  return data.toLocaleDateString("pt-BR");
}

function getValorVenda(item: any) {
  return parseValor(
    item.financeiro?.valorVenda ??
      item.valorTotal ??
      item.valor ??
      item.total ??
      item.totalGeral ??
      item.financeiro?.total
  );
}

function getEntradaVenda(item: any) {
  return parseValor(item.financeiro?.entrada);
}

function getSaldoVenda(item: any) {
  const saldoSalvo = item.financeiro?.saldo;

  if (saldoSalvo !== undefined && saldoSalvo !== null) {
    return parseValor(saldoSalvo);
  }

  return getValorVenda(item) - getEntradaVenda(item);
}

function getStatusPagamento(item: any) {
  const saldo = getSaldoVenda(item);
  const entrada = getEntradaVenda(item);
  const statusAtual = String(
    item.financeiro?.statusFinanceiro || item.statusFinanceiro || ""
  );

  if (statusAtual === "Pago" || saldo <= 0) {
    return {
      texto: "Pago",
      cor: "bg-emerald-500/15 text-emerald-300",
    };
  }

  if (statusAtual === "Em atraso" || statusAtual === "Atrasado") {
    return {
      texto: "Atrasado",
      cor: "bg-red-500/15 text-red-300",
    };
  }

  if (
    statusAtual === "Parcialmente pago" ||
    statusAtual === "Entrada paga" ||
    statusAtual === "Parcial" ||
    entrada > 0
  ) {
    return {
      texto: "Parcial",
      cor: "bg-yellow-500/15 text-yellow-300",
    };
  }

  return {
    texto: "Pendente",
    cor: "bg-yellow-500/15 text-yellow-300",
  };
}

function getMargem(item: any) {
  const margemSalva =
    item.financeiro?.margemPrevista ?? item.margemPrevista ?? item.margem;

  if (margemSalva !== undefined && margemSalva !== null) {
    return parseValor(margemSalva);
  }

  const valor = getValorVenda(item);
  const custo = parseValor(
    item.financeiro?.custoPrevisto ?? item.custoPrevisto ?? item.custo
  );

  return valor > 0 ? ((valor - custo) / valor) * 100 : 0;
}

function getDataVenda(item: any) {
  return (
    converterData(item.aprovadoEm) ||
    converterData(item.criadoEm) ||
    converterData(item.data) ||
    converterData(item.dataCriacao)
  );
}

function textoNormalizado(valor: any) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatarDataHora(valor: any) {
  const data = converterData(valor);

  if (!data) return "-";

  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function detectarStatusFinanceiro(item: any) {
  return getStatusPagamento(item).texto;
}

function detectarValorVenda(item: any) {
  return getValorVenda(item);
}

function detectarFormaPagamento(item: any) {
  const forma = textoNormalizado(
    item.financeiro?.formaPagamento ||
      item.financeiro?.meioPagamento ||
      item.financeiro?.tipoPagamento ||
      item.formaPagamento ||
      item.meioPagamento ||
      item.pagamento
  );

  if (forma.includes("pix")) return "pix";
  if (forma.includes("dinheiro") || forma.includes("cash")) return "dinheiro";
  if (forma.includes("debito") || forma.includes("débito")) return "cartaoDebito";
  if (forma.includes("credito") || forma.includes("crédito")) return "cartaoCredito";
  if (forma.includes("cartao") || forma.includes("cartão")) return "cartao";
  if (forma.includes("transfer")) return "transferencia";

  return "naoInformado";
}

function valorRecebidoVenda(item: any) {
  const status = detectarStatusFinanceiro(item);

  if (status === "Pago") return detectarValorVenda(item);
  if (status === "Parcial") return getEntradaVenda(item);

  return 0;
}

function dataEntre(data: Date | null, inicio: Date, fim: Date) {
  if (!data) return false;

  return data >= inicio && data <= fim;
}

function statusFechamentoCaixa(diferenca: number) {
  const absoluta = Math.abs(diferenca);

  if (absoluta < 0.01) {
    return {
      texto: "OK",
      cor: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    };
  }

  if (absoluta <= 10) {
    return {
      texto: "Divergência leve",
      cor: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
    };
  }

  return {
    texto: "Divergência crítica",
    cor: "bg-red-500/15 text-red-300 border-red-500/30",
  };
}

function sugestoesCaixa(resumo: any) {
  const sugestoes: string[] = [];

  if (Math.abs(resumo.diferenca) > 10) {
    sugestoes.push("Valor divergente acima da média. Revise vendas e sangrias.");
  }

  if (resumo.totalDinheiro <= 0 && resumo.vendasDinheiro > 0) {
    sugestoes.push("Possível venda em dinheiro sem conferência registrada.");
  }

  if (resumo.vendasSemFormaPagamento > 0) {
    sugestoes.push("Existem vendas sem forma de pagamento informada.");
  }

  if (resumo.totalPix > 0 && resumo.vendasPixSemOS > 0) {
    sugestoes.push("PIX recebido sem OS vinculada.");
  }

  return sugestoes.length > 0
    ? sugestoes
    : ["Nenhuma sugestão crítica encontrada para este fechamento."];
}

function ehVendaHistorico(item: any) {
  const statusOrcamento = textoNormalizado(
    item.status || item.statusOrcamento || item.etapa
  );
  const statusFinanceiro = textoNormalizado(
    item.financeiro?.statusFinanceiro || item.statusFinanceiro
  );

  const statusDeVenda =
    statusOrcamento.includes("aprov") ||
    statusOrcamento.includes("finaliz") ||
    Boolean(item.aprovadoEm);

  const statusFinanceiroDeVenda = [
    "pago",
    "pendente",
    "parcial",
    "entrada paga",
    "parcialmente pago",
    "em atraso",
    "atrasado",
  ].some((status) => statusFinanceiro.includes(status));

  return statusDeVenda || statusFinanceiroDeVenda;
}

function getServicoPrincipal(item: any) {
  const itens = Array.isArray(item.itens) ? item.itens : [];
  const primeiroItem = itens[0] || {};
  const servicos = Array.isArray(item.servicos)
    ? item.servicos
        .map((servico: any) => servico?.nome || servico?.servico || servico)
        .filter(Boolean)
        .join(", ")
    : item.servicos;

  return (
    item.servico ||
    servicos ||
    item.material ||
    primeiroItem.servico ||
    primeiroItem.material ||
    primeiroItem.nome ||
    "Serviço não informado"
  );
}

function filtrarPorPeriodo(
  vendas: any[],
  periodo: PeriodoHistorico,
  personalizado: { inicio: string; fim: string }
) {
  const intervalo = obterIntervaloPeriodo(periodo, personalizado);

  return vendas.filter((venda) => {
    const dataVenda = getDataVenda(venda);

    if (!dataVenda) return false;

    return dataVenda >= intervalo.inicio && dataVenda <= intervalo.fim;
  });
}

function calcularResumo(vendasFiltradas: any[]) {
  const totalVendido = vendasFiltradas.reduce(
    (total, venda) => total + getValorVenda(venda),
    0
  );
  const quantidadeVendas = vendasFiltradas.length;
  const ticketMedio = quantidadeVendas > 0 ? totalVendido / quantidadeVendas : 0;

  const totalPago = vendasFiltradas.reduce((total, venda) => {
    return getStatusPagamento(venda).texto === "Pago"
      ? total + getValorVenda(venda)
      : total;
  }, 0);

  const totalPendente = vendasFiltradas.reduce((total, venda) => {
    return getStatusPagamento(venda).texto !== "Pago"
      ? total + Math.max(getSaldoVenda(venda), 0)
      : total;
  }, 0);

  const margens = vendasFiltradas
    .map((venda) => getMargem(venda))
    .filter((margem) => Number.isFinite(margem));

  const margemMedia =
    margens.length > 0
      ? margens.reduce((total, margem) => total + margem, 0) / margens.length
      : 0;

  const lucroEstimado = vendasFiltradas.reduce((total, venda) => {
    const valor = getValorVenda(venda);
    const margem = getMargem(venda);

    return total + (valor * margem) / 100;
  }, 0);

  return {
    totalVendido,
    quantidadeVendas,
    ticketMedio,
    totalPago,
    totalPendente,
    margemMedia,
    lucroEstimado,
  };
}

function somenteDigitos(valor: any) {
  return String(valor || "").replace(/\D/g, "");
}

function valorTexto(...valores: any[]) {
  const encontrado = valores.find((valor) => String(valor || "").trim());
  return String(encontrado || "").trim();
}

function montarDadosFiscaisVenda(venda: any) {
  const cliente = venda.dadosCliente || {};
  const enderecoCliente = cliente.endereco || {};
  const itensOrigem = Array.isArray(venda.itens) ? venda.itens : [];
  const itens =
    itensOrigem.length > 0
      ? itensOrigem
      : [
          {
            descricao: getServicoPrincipal(venda),
            quantidade: 1,
            valorTotal: getValorVenda(venda),
          },
        ];

  return {
    cliente: {
      nomeRazaoSocial: valorTexto(
        cliente.razaoSocial,
        cliente.nome,
        venda.razaoSocial,
        venda.cliente
      ),
      cpfCnpj: somenteDigitos(
        valorTexto(
          cliente.cpfCnpj,
          cliente.cnpj,
          cliente.cpf,
          cliente.documento,
          venda.cpfCnpj,
          venda.cnpj,
          venda.cpf
        )
      ),
      inscricaoEstadual: valorTexto(
        cliente.inscricaoEstadual,
        cliente.ie,
        venda.inscricaoEstadual
      ),
      email: valorTexto(cliente.email, venda.email),
      telefone: valorTexto(cliente.telefone, venda.telefoneCliente, venda.telefone),
      endereco: {
        logradouro: valorTexto(
          enderecoCliente.logradouro,
          enderecoCliente.endereco,
          cliente.logradouro,
          cliente.endereco,
          venda.logradouro,
          venda.endereco
        ),
        numero: valorTexto(enderecoCliente.numero, cliente.numero, venda.numero),
        complemento: valorTexto(
          enderecoCliente.complemento,
          cliente.complemento,
          venda.complemento
        ),
        bairro: valorTexto(enderecoCliente.bairro, cliente.bairro, venda.bairro),
        cidade: valorTexto(enderecoCliente.cidade, cliente.cidade, venda.cidade),
        uf: valorTexto(enderecoCliente.uf, cliente.uf, cliente.estado, venda.uf, venda.estado).toUpperCase(),
        cep: somenteDigitos(valorTexto(enderecoCliente.cep, cliente.cep, venda.cep)),
      },
    },
    itens: itens.map((item: any, index: number) => {
      const quantidade = parseValor(item.quantidade) || 1;
      const valorTotal = parseValor(
        item.valorTotal ?? item.subtotal ?? item.total ?? item.valor
      );
      const valorUnitario =
        parseValor(item.valorUnitario ?? item.precoUnitario ?? item.precoMetro ?? item.precoM2) ||
        (quantidade > 0 ? valorTotal / quantidade : valorTotal);

      return {
        id: item.id || `item-${index + 1}`,
        descricao: valorTexto(item.descricao, item.servico, item.material, item.nome),
        ncm: somenteDigitos(valorTexto(item.ncm, item.NCM)),
        cfop: somenteDigitos(valorTexto(item.cfop, item.CFOP)),
        unidade: valorTexto(item.unidade, item.un, "UN") || "UN",
        quantidade,
        valorUnitario,
        valorTotal: valorTotal || quantidade * valorUnitario,
        impostos: item.impostos || {},
      };
    }),
  };
}

export default function FinanceiroPage() {
  const [abaFinanceiro, setAbaFinanceiro] = useState<AbaFinanceiro>("visao");
  const [movimentacoesEstoque, setMovimentacoesEstoque] = useState<any[]>([]);
  const [orcamentos, setOrcamentos] = useState<any[]>([]);
  const [notasFiscais, setNotasFiscais] = useState<any[]>([]);
  const [caixas, setCaixas] = useState<any[]>([]);
  const [movimentacoesCaixa, setMovimentacoesCaixa] = useState<any[]>([]);
  const [modalPago, setModalPago] = useState<any>(null);
  const [modalNFe, setModalNFe] = useState<any>(null);
  const [dadosNFe, setDadosNFe] = useState<any>(null);
  const [caixaDetalhe, setCaixaDetalhe] = useState<any>(null);
  const [modalZerarVendas, setModalZerarVendas] = useState(false);
  const [modalMargemBaixa, setModalMargemBaixa] = useState(false);
  const [carregandoFinanceiro, setCarregandoFinanceiro] = useState(true);
  const [acaoCaixa, setAcaoCaixa] = useState(false);
  const [emitindoNFeId, setEmitindoNFeId] = useState("");
  const [toast, setToast] = useState("");
  const [erroNFe, setErroNFe] = useState("");
  const [erroFinanceiro, setErroFinanceiro] = useState("");
  const [erroCaixa, setErroCaixa] = useState("");
  const [periodoHistorico, setPeriodoHistorico] = useState<PeriodoHistorico>("mes");
  const [dataInicial, setDataInicial] = useState(() => {
    const hoje = new Date();
    return dataParaInput(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  });
  const [dataFinal, setDataFinal] = useState(() => dataParaInput(new Date()));
  const [periodoPersonalizado, setPeriodoPersonalizado] = useState(() => ({
    inicio: dataParaInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    fim: dataParaInput(new Date()),
  }));
  const [erroPeriodo, setErroPeriodo] = useState("");
  const [responsavelCaixa, setResponsavelCaixa] = useState(
    () => auth.currentUser?.email || ""
  );
  const [saldoInicialCaixa, setSaldoInicialCaixa] = useState("0");
  const [observacoesAberturaCaixa, setObservacoesAberturaCaixa] = useState("");
  const [saldoInformadoCaixa, setSaldoInformadoCaixa] = useState("");
  const [passoConferenciaCaixa, setPassoConferenciaCaixa] = useState(1);
  const [formMovimentacaoCaixa, setFormMovimentacaoCaixa] = useState({
    tipo: "sangria" as TipoMovimentacaoCaixa,
    valor: "",
    observacao: "",
    responsavel: "",
  });

  async function carregarFinanceiro() {
    try {
      setCarregandoFinanceiro(true);
      setErroFinanceiro("");

      const orcamentosSnapshot = await getDocs(collection(db, "orcamentos"));
      const clientesSnapshot = await getDocs(collection(db, "clientes"));
      const movimentacoesSnapshot = await getDocs(
        collection(db, "movimentacoesEstoque")
      );
      const caixasSnapshot = await getDocs(collection(db, "caixas"));
      const movimentacoesCaixaSnapshot = await getDocs(
        collection(db, "movimentacoesCaixa")
      );
      const usuarioAtual = auth.currentUser;
      const notasConsulta = usuarioAtual
        ? query(
            collection(db, "notasFiscais"),
            where("tenantId", "==", usuarioAtual.uid)
          )
        : collection(db, "notasFiscais");
      const notasSnapshot = await getDocs(notasConsulta);

      const clientes: any[] = [];
      const movimentacoes: any[] = [];
      const listaCaixas: any[] = [];
      const listaMovimentacoesCaixa: any[] = [];
      const notas: any[] = [];

      clientesSnapshot.forEach((documento) => {
        clientes.push({
          id: documento.id,
          ...documento.data(),
        });
      });

      movimentacoesSnapshot.forEach((documento) => {
        movimentacoes.push({
          id: documento.id,
          ...documento.data(),
        });
      });

      caixasSnapshot.forEach((documento) => {
        listaCaixas.push({
          id: documento.id,
          ...documento.data(),
        });
      });

      movimentacoesCaixaSnapshot.forEach((documento) => {
        listaMovimentacoesCaixa.push({
          id: documento.id,
          ...documento.data(),
        });
      });

      notasSnapshot.forEach((documento) => {
        notas.push({
          id: documento.id,
          ...documento.data(),
        });
      });

      const lista: any[] = [];

      orcamentosSnapshot.forEach((documento) => {
        const dados: any = documento.data();

        const clienteEncontrado = clientes.find(
          (cliente) => cliente.id === dados.clienteId
        );

        lista.push({
          id: documento.id,
          ...dados,
          dadosCliente: clienteEncontrado || {},
          telefoneCliente: clienteEncontrado?.telefone || "",
        });
      });

      setMovimentacoesEstoque(movimentacoes);
      setCaixas(
        listaCaixas.sort((caixaA, caixaB) => {
          const dataA =
            converterData(caixaA.fechadoEm)?.getTime() ||
            converterData(caixaA.abertoEm)?.getTime() ||
            0;
          const dataB =
            converterData(caixaB.fechadoEm)?.getTime() ||
            converterData(caixaB.abertoEm)?.getTime() ||
            0;

          return dataB - dataA;
        })
      );
      setMovimentacoesCaixa(listaMovimentacoesCaixa);
      setNotasFiscais(notas);
      setOrcamentos(lista);
    } catch (erro) {
      console.error(erro);
      setErroFinanceiro("Não foi possível carregar os dados financeiros.");
    } finally {
      setCarregandoFinanceiro(false);
    }
  }

  useEffect(() => {
    // Dados financeiros vêm do Firestore no cliente autenticado.
    carregarFinanceiro();
  }, []);

  function vendaOS(item: any) {
    return getValorVenda(item);
  }

  function entradaOS(item: any) {
    return parseValor(item.financeiro?.entrada);
  }

  function custoOS(item: any) {
    return parseValor(item.financeiro?.custoPrevisto);
  }

  function saldoOS(item: any) {
    const saldoSalvo = item.financeiro?.saldo;

    if (saldoSalvo !== undefined && saldoSalvo !== null) {
      return parseValor(saldoSalvo);
    }

    return vendaOS(item) - entradaOS(item);
  }

  function lucroOS(item: any) {
    const lucroSalvo = item.financeiro?.lucroPrevisto;

    if (lucroSalvo !== undefined && lucroSalvo !== null) {
      return parseValor(lucroSalvo);
    }

    return vendaOS(item) - custoOS(item);
  }

  function margemOS(item: any) {
    const margemSalva = item.financeiro?.margemPrevista;

    if (margemSalva !== undefined && margemSalva !== null) {
      return parseValor(margemSalva);
    }

    const venda = vendaOS(item);
    const lucro = lucroOS(item);

    return venda > 0 ? (lucro / venda) * 100 : 0;
  }

  function custoRealOS(item: any) {
    const movimentacoesOS = movimentacoesEstoque.filter(
      (movimentacao) => movimentacao.numeroOS === item.numeroOS
    );

    const custoReal = movimentacoesOS.reduce((total, movimentacao) => {
      return (
        total +
        parseValor(movimentacao.quantidade) *
          parseValor(movimentacao.custoUnitario)
      );
    }, 0);

    if (custoReal <= 0) {
      return custoOS(item);
    }

    return custoReal;
  }

  function lucroRealOS(item: any) {
    return vendaOS(item) - custoRealOS(item);
  }

  function margemRealOS(item: any) {
    const venda = vendaOS(item);

    if (venda <= 0) return 0;

    return (lucroRealOS(item) / venda) * 100;
  }

  function diferencaLucroOS(item: any) {
    return lucroRealOS(item) - lucroOS(item);
  }

  function statusMargemFinanceira(item: any, margemMinima = 0) {
    const margem = margemRealOS(item);
    const lucro = lucroRealOS(item);

    if (lucro < 0 || margem < 0) {
      return {
        texto: "Prejuízo",
        cor: "bg-red-500/15 text-red-300",
      };
    }

    const limiteMargem = margemMinima > 0 ? margemMinima : 30;

    if (margem < limiteMargem) {
      return {
        texto: "Margem baixa",
        cor: "bg-yellow-500/15 text-yellow-300",
      };
    }

    return {
      texto: "Margem saudável",
      cor: "bg-emerald-500/15 text-emerald-300",
    };
  }

  function statusPagamento(item: any) {
    return getStatusPagamento(item);
  }

  function margemMinimaOS(item: any) {
    if (!item.itens || item.itens.length === 0) return 0;

    return Math.max(
      ...item.itens.map((produto: any) => Number(produto.margemMinima || 0))
    );
  }

  async function marcarComoPago(orcamento: any) {
    await updateDoc(doc(db, "orcamentos", orcamento.id), {
      financeiro: {
        ...orcamento.financeiro,
        valorVenda: vendaOS(orcamento),
        entrada: vendaOS(orcamento),
        saldo: 0,
        custoPrevisto: custoOS(orcamento),
        lucroPrevisto: lucroOS(orcamento),
        margemPrevista: margemOS(orcamento),
        statusFinanceiro: "Pago",
      },
      atualizadoEm: new Date(),
    });

    setModalPago(null);
    await carregarFinanceiro();
  }

  async function zerarTodasVendas() {
    const querySnapshot = await getDocs(collection(db, "orcamentos"));

    const promessas = querySnapshot.docs.map((documento) =>
      deleteDoc(doc(db, "orcamentos", documento.id))
    );

    await Promise.all(promessas);

    setModalZerarVendas(false);
    await carregarFinanceiro();
  }

  function limparTelefone(telefone: string) {
    return telefone.replace(/\D/g, "");
  }

  function enviarCobranca(orcamento: any) {
    const telefone = limparTelefone(orcamento.telefoneCliente || "");

    if (!telefone) {
      alert(
        "Este cliente não possui telefone cadastrado. Cadastre o telefone no módulo Clientes."
      );
      return;
    }

    const saldo = saldoOS(orcamento);

    if (saldo <= 0) {
      alert("Essa OS não possui valor em aberto.");
      return;
    }

    const telefoneBrasil = telefone.startsWith("55") ? telefone : `55${telefone}`;

    const mensagem = `Olá, ${orcamento.cliente}! Tudo bem?

Passando para lembrar sobre o valor em aberto da ${orcamento.numeroOS}.

Serviço: ${orcamento.servico || "Serviço não informado"}
Valor em aberto: R$ ${saldo.toFixed(2)}

Assim que puder, nos envie o comprovante para darmos baixa no sistema.

Obrigado!`;

    const url = `https://wa.me/${telefoneBrasil}?text=${encodeURIComponent(
      mensagem
    )}`;

    window.open(url, "_blank");
  }

  function mostrarToast(mensagem: string) {
    setToast(mensagem);
    window.setTimeout(() => setToast(""), 4000);
  }

  function vendasDoCaixa(caixa: any) {
    const inicio = converterData(caixa?.abertoEm) || inicioDoDia(new Date());
    const fim = converterData(caixa?.fechadoEm) || new Date();

    return orcamentos.filter((orcamento) => {
      return ehVendaHistorico(orcamento) && dataEntre(getDataVenda(orcamento), inicio, fim);
    });
  }

  function movimentacoesDoCaixa(caixa: any) {
    const inicio = converterData(caixa?.abertoEm) || inicioDoDia(new Date());
    const fim = converterData(caixa?.fechadoEm) || new Date();

    return movimentacoesCaixa.filter((movimentacao) => {
      if (movimentacao.caixaId === caixa?.id) return true;

      return dataEntre(converterData(movimentacao.criadoEm), inicio, fim);
    });
  }

  function calcularResumoCaixa(caixa: any, saldoInformadoEntrada = saldoInformadoCaixa) {
    const vendas = caixa ? vendasDoCaixa(caixa) : [];
    const movimentacoes = caixa ? movimentacoesDoCaixa(caixa) : [];
    const saldoInicial = parseValor(caixa?.saldoInicial);

    const resumoVendas = vendas.reduce(
      (resumo, venda) => {
        const valorVenda = detectarValorVenda(venda);
        const valorRecebido = valorRecebidoVenda(venda);
        const formaPagamento = detectarFormaPagamento(venda);

        resumo.totalVendido += valorVenda;
        resumo.totalRecebido += valorRecebido;

        if (valorRecebido > 0 && formaPagamento === "dinheiro") {
          resumo.totalDinheiro += valorRecebido;
          resumo.vendasDinheiro += 1;
        } else if (valorRecebido > 0 && formaPagamento === "pix") {
          resumo.totalPix += valorRecebido;
          resumo.vendasPix += 1;
          if (!venda.numeroOS) resumo.vendasPixSemOS += 1;
        } else if (
          valorRecebido > 0 &&
          ["cartao", "cartaoCredito", "cartaoDebito"].includes(formaPagamento)
        ) {
          resumo.totalCartao += valorRecebido;
        } else if (valorRecebido > 0 && formaPagamento === "transferencia") {
          resumo.totalTransferencia += valorRecebido;
        } else if (valorRecebido > 0) {
          resumo.totalOutros += valorRecebido;
          resumo.vendasSemFormaPagamento += 1;
        } else if (formaPagamento === "naoInformado") {
          resumo.vendasSemFormaPagamento += 1;
        }

        if (detectarStatusFinanceiro(venda) !== "Pago") {
          resumo.vendasPendentes += 1;
        }

        return resumo;
      },
      {
        totalVendido: 0,
        totalRecebido: 0,
        totalDinheiro: 0,
        totalPix: 0,
        totalCartao: 0,
        totalTransferencia: 0,
        totalOutros: 0,
        vendasDinheiro: 0,
        vendasPix: 0,
        vendasPixSemOS: 0,
        vendasPendentes: 0,
        vendasSemFormaPagamento: 0,
      }
    );

    const totalDespesas = movimentacoes
      .filter((movimentacao) => movimentacao.tipo === "despesa")
      .reduce((total, movimentacao) => total + parseValor(movimentacao.valor), 0);
    const totalSangrias = movimentacoes
      .filter((movimentacao) => movimentacao.tipo === "sangria")
      .reduce((total, movimentacao) => total + parseValor(movimentacao.valor), 0);
    const totalSuprimentos = movimentacoes
      .filter((movimentacao) => movimentacao.tipo === "suprimento")
      .reduce((total, movimentacao) => total + parseValor(movimentacao.valor), 0);
    const totalEntradas = movimentacoes
      .filter((movimentacao) => movimentacao.tipo === "entrada")
      .reduce((total, movimentacao) => total + parseValor(movimentacao.valor), 0);

    const saldoEsperado =
      saldoInicial +
      resumoVendas.totalDinheiro +
      resumoVendas.totalPix +
      resumoVendas.totalCartao +
      resumoVendas.totalTransferencia +
      resumoVendas.totalOutros +
      totalSuprimentos +
      totalEntradas -
      totalDespesas -
      totalSangrias;
    const saldoInformado = parseValor(saldoInformadoEntrada);
    const diferenca = String(saldoInformadoEntrada || "").trim()
      ? saldoInformado - saldoEsperado
      : 0;

    return {
      ...resumoVendas,
      saldoInicial,
      saldoEsperado,
      saldoInformado,
      diferenca,
      totalDespesas,
      totalSangrias,
      totalSuprimentos,
      totalEntradas,
      vendas,
      movimentacoes,
      status: statusFechamentoCaixa(diferenca),
      sugestoes: sugestoesCaixa({
        ...resumoVendas,
        diferenca,
      }),
    };
  }

  async function abrirCaixa() {
    if (acaoCaixa) return;

    const caixaAberto = caixas.find((caixa) => caixa.status === "aberto");

    if (caixaAberto) {
      setErroCaixa("Já existe um caixa aberto.");
      return;
    }

    if (!responsavelCaixa.trim()) {
      setErroCaixa("Informe o responsável pelo caixa.");
      return;
    }

    const saldoInicial = parseValor(saldoInicialCaixa);

    if (saldoInicial < 0) {
      setErroCaixa("Saldo inicial inválido.");
      return;
    }

    try {
      setAcaoCaixa(true);
      setErroCaixa("");

      await addDoc(collection(db, "caixas"), {
        status: "aberto",
        saldoInicial,
        responsavel: responsavelCaixa.trim(),
        observacoes: observacoesAberturaCaixa.trim(),
        abertoEm: new Date(),
        criadoEm: new Date(),
        atualizadoEm: new Date(),
        tenantId: auth.currentUser?.uid || "",
      });

      setSaldoInformadoCaixa("");
      setPassoConferenciaCaixa(1);
      mostrarToast("Caixa aberto com sucesso.");
      await carregarFinanceiro();
    } catch (erro) {
      console.error(erro);
      setErroCaixa("Não foi possível abrir o caixa.");
    } finally {
      setAcaoCaixa(false);
    }
  }

  async function registrarMovimentacaoCaixa(tipo: TipoMovimentacaoCaixa) {
    const caixaAberto = caixas.find((caixa) => caixa.status === "aberto");

    if (!caixaAberto || acaoCaixa) return;

    const valor = parseValor(formMovimentacaoCaixa.valor);

    if (valor <= 0) {
      setErroCaixa("Informe um valor maior que zero.");
      return;
    }

    try {
      setAcaoCaixa(true);
      setErroCaixa("");

      await addDoc(collection(db, "movimentacoesCaixa"), {
        caixaId: caixaAberto.id,
        tipo,
        valor,
        observacao: formMovimentacaoCaixa.observacao.trim(),
        responsavel:
          formMovimentacaoCaixa.responsavel.trim() ||
          responsavelCaixa ||
          caixaAberto.responsavel ||
          "",
        criadoEm: new Date(),
        tenantId: auth.currentUser?.uid || "",
      });

      setFormMovimentacaoCaixa((atual) => ({
        ...atual,
        valor: "",
        observacao: "",
      }));
      mostrarToast("Movimentação registrada.");
      await carregarFinanceiro();
    } catch (erro) {
      console.error(erro);
      setErroCaixa("Não foi possível registrar a movimentação.");
    } finally {
      setAcaoCaixa(false);
    }
  }

  async function finalizarCaixa(caixa: any) {
    if (!caixa || acaoCaixa) return;

    if (!String(saldoInformadoCaixa || "").trim()) {
      setErroCaixa("Informe o saldo conferido antes de fechar.");
      return;
    }

    if (
      !confirm(
        "Tem certeza que deseja fechar o caixa? Revise os valores antes de confirmar."
      )
    ) {
      return;
    }

    const resumo = calcularResumoCaixa(caixa);

    try {
      setAcaoCaixa(true);
      setErroCaixa("");

      await updateDoc(doc(db, "caixas", caixa.id), {
        status: "fechado",
        saldoEsperado: resumo.saldoEsperado,
        saldoInformado: resumo.saldoInformado,
        diferenca: resumo.diferenca,
        totalVendido: resumo.totalVendido,
        totalPix: resumo.totalPix,
        totalDinheiro: resumo.totalDinheiro,
        totalCartao: resumo.totalCartao,
        totalDespesas: resumo.totalDespesas,
        totalSangrias: resumo.totalSangrias,
        totalSuprimentos: resumo.totalSuprimentos,
        statusFechamento: resumo.status.texto,
        sugestoes: resumo.sugestoes,
        fechadoEm: new Date(),
        atualizadoEm: new Date(),
      });

      mostrarToast("Caixa fechado com sucesso.");
      setSaldoInformadoCaixa("");
      setPassoConferenciaCaixa(1);
      await carregarFinanceiro();
    } catch (erro) {
      console.error(erro);
      setErroCaixa("Não foi possível fechar o caixa.");
    } finally {
      setAcaoCaixa(false);
    }
  }

  async function reabrirCaixa(caixa: any) {
    if (!caixa || acaoCaixa) return;

    if (caixas.some((item) => item.status === "aberto")) {
      setErroCaixa("Já existe um caixa aberto.");
      return;
    }

    try {
      setAcaoCaixa(true);
      setErroCaixa("");

      await updateDoc(doc(db, "caixas", caixa.id), {
        status: "aberto",
        fechadoEm: null,
        atualizadoEm: new Date(),
      });

      mostrarToast("Caixa reaberto.");
      await carregarFinanceiro();
    } catch (erro) {
      console.error(erro);
      setErroCaixa("Não foi possível reabrir o caixa.");
    } finally {
      setAcaoCaixa(false);
    }
  }

  function gerarRelatorioCaixa(caixa: any) {
    const resumo = caixa.status === "aberto" ? calcularResumoCaixa(caixa) : caixa;
    const data = formatarDataVenda(converterData(caixa.fechadoEm || caixa.abertoEm));

    return `Fechamento de Caixa
${data}

Responsável: ${caixa.responsavel || "-"}
Total vendido: ${formatarMoeda(resumo.totalVendido)}
Despesas: ${formatarMoeda(resumo.totalDespesas)}
Sangrias: ${formatarMoeda(resumo.totalSangrias)}
Suprimentos: ${formatarMoeda(resumo.totalSuprimentos)}
Saldo esperado: ${formatarMoeda(resumo.saldoEsperado)}
Saldo informado: ${formatarMoeda(resumo.saldoInformado)}
Diferença: ${formatarMoeda(resumo.diferenca)}
Status: ${resumo.statusFechamento || resumo.status?.texto || "-"}`;
  }

  async function exportarRelatorioCaixa(caixa: any) {
    const relatorio = gerarRelatorioCaixa(caixa);

    try {
      await navigator.clipboard.writeText(relatorio);
      mostrarToast("Relatório copiado.");
    } catch {
      const blob = new Blob([relatorio], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `fechamento-caixa-${caixa.id}.txt`;
      link.click();
      URL.revokeObjectURL(url);
    }
  }

  function notaFiscalDaVenda(venda: any) {
    const candidatas = notasFiscais
      .filter((nota) => {
        return (
          nota.id === venda.nfeId ||
          nota.id === venda.id ||
          nota.vendaId === venda.id ||
          nota.orcamentoId === venda.id ||
          (nota.numeroOS && nota.numeroOS === venda.numeroOS)
        );
      })
      .sort((notaA, notaB) => {
        const dataA = converterData(notaA.atualizadoEm)?.getTime() || 0;
        const dataB = converterData(notaB.atualizadoEm)?.getTime() || 0;

        return dataB - dataA;
      });

    return candidatas[0] || null;
  }

  function abrirModalNFe(venda: any) {
    const nota = notaFiscalDaVenda(venda);

    if (nota?.status === "autorizada") {
      mostrarToast("Esta venda já possui NF-e autorizada.");
      return;
    }

    setModalNFe(venda);
    setDadosNFe(montarDadosFiscaisVenda(venda));
    setErroNFe("");
  }

  function atualizarClienteNFe(campo: string, valor: string) {
    setDadosNFe((dadosAtuais: any) => ({
      ...dadosAtuais,
      cliente: {
        ...dadosAtuais.cliente,
        [campo]: valor,
      },
    }));
  }

  function atualizarEnderecoNFe(campo: string, valor: string) {
    setDadosNFe((dadosAtuais: any) => ({
      ...dadosAtuais,
      cliente: {
        ...dadosAtuais.cliente,
        endereco: {
          ...dadosAtuais.cliente.endereco,
          [campo]: campo === "uf" ? valor.toUpperCase() : valor,
        },
      },
    }));
  }

  function atualizarItemNFe(index: number, campo: string, valor: string) {
    setDadosNFe((dadosAtuais: any) => {
      const itens = [...dadosAtuais.itens];
      const itemAtualizado = {
        ...itens[index],
        [campo]: campo === "ncm" || campo === "cfop" ? somenteDigitos(valor) : valor,
      };

      if (campo === "quantidade" || campo === "valorUnitario") {
        const quantidade = parseValor(
          campo === "quantidade" ? valor : itemAtualizado.quantidade
        );
        const valorUnitario = parseValor(
          campo === "valorUnitario" ? valor : itemAtualizado.valorUnitario
        );

        itemAtualizado.valorTotal = quantidade * valorUnitario;
      }

      itens[index] = itemAtualizado;

      return {
        ...dadosAtuais,
        itens,
      };
    });
  }

  async function copiarChaveAcesso(chave: string) {
    if (!chave) return;

    await navigator.clipboard.writeText(chave);
    mostrarToast("Chave de acesso copiada.");
  }

  async function confirmarEmissaoNFe() {
    if (!modalNFe || !dadosNFe || emitindoNFeId) return;

    try {
      setEmitindoNFeId(modalNFe.id);
      setErroNFe("");

      const usuario = auth.currentUser;

      if (!usuario) {
        throw new Error("Faça login novamente para emitir NF-e.");
      }

      const token = await usuario.getIdToken();
      const resposta = await fetch("/api/nfe/emitir", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vendaId: modalNFe.id,
          orcamentoId: modalNFe.id,
          dadosFiscais: dadosNFe,
        }),
      });

      const retorno = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        if (retorno?.nota) {
          await carregarFinanceiro();
        }

        throw new Error(
          retorno?.erros?.join(" ") ||
            retorno?.erro ||
            "Não foi possível emitir a NF-e."
        );
      }

      mostrarToast(retorno?.mensagem || "NF-e enviada com sucesso.");
      setModalNFe(null);
      setDadosNFe(null);
      await carregarFinanceiro();
    } catch (erro) {
      const mensagem =
        erro instanceof Error
          ? erro.message
          : "Não foi possível emitir a NF-e.";

      setErroNFe(mensagem);
      mostrarToast(mensagem);
    } finally {
      setEmitindoNFeId("");
    }
  }

  function renderAcoesNFe(venda: any) {
    const nota = notaFiscalDaVenda(venda);
    const statusNFe = nota?.status || venda.nfeStatus || "";
    const emitindo = emitindoNFeId === venda.id;

    if (statusNFe === "autorizada") {
      return (
        <>
          {nota?.danfeUrl && (
            <a
              href={nota.danfeUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300 whitespace-nowrap hover:bg-emerald-500/25 transition"
            >
              Ver DANFE
            </a>
          )}

          {nota?.xmlUrl && (
            <a
              href={nota.xmlUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-300 whitespace-nowrap hover:bg-blue-500/25 transition"
            >
              Baixar XML
            </a>
          )}

          {nota?.chaveAcesso && (
            <button
              onClick={() => copiarChaveAcesso(nota.chaveAcesso)}
              className="inline-flex w-fit items-center rounded-full bg-zinc-800 px-3 py-1 text-xs font-bold text-zinc-300 whitespace-nowrap hover:bg-zinc-700 transition"
            >
              Copiar chave
            </button>
          )}
        </>
      );
    }

    if (statusNFe === "processando") {
      return (
        <button
          disabled
          className="inline-flex w-fit cursor-not-allowed items-center rounded-full bg-zinc-800 px-3 py-1 text-xs font-bold text-zinc-500 whitespace-nowrap"
        >
          Processando...
        </button>
      );
    }

    if (statusNFe === "rejeitada") {
      return (
        <>
          <button
            onClick={() =>
              alert(
                nota?.mensagemErro ||
                  nota?.erros?.join("\n") ||
                  "NF-e rejeitada. Revise os dados fiscais."
              )
            }
            className="inline-flex w-fit items-center rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300 whitespace-nowrap hover:bg-red-500/25 transition"
          >
            Ver erro
          </button>

          <button
            onClick={() => abrirModalNFe(venda)}
            disabled={emitindo}
            className="inline-flex w-fit items-center rounded-full bg-yellow-500/15 px-3 py-1 text-xs font-bold text-yellow-300 whitespace-nowrap hover:bg-yellow-500/25 disabled:cursor-not-allowed disabled:opacity-60 transition"
          >
            Tentar novamente
          </button>
        </>
      );
    }

    return (
      <button
        onClick={() => abrirModalNFe(venda)}
        disabled={emitindo}
        className="inline-flex w-fit items-center rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-300 whitespace-nowrap hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-60 transition"
      >
        {emitindo ? "Emitindo..." : "Emitir NF-e"}
      </button>
    );
  }

  const totalVendido = orcamentos.reduce(
    (total, item) => total + vendaOS(item),
    0
  );

  const totalRecebido = orcamentos.reduce(
    (total, item) => total + entradaOS(item),
    0
  );

  const totalAReceber = orcamentos.reduce(
    (total, item) => total + saldoOS(item),
    0
  );

  const custoPrevisto = orcamentos.reduce(
    (total, item) => total + custoOS(item),
    0
  );

  const custoRealTotal = orcamentos.reduce(
    (total, item) => total + custoRealOS(item),
    0
  );

  const lucroPrevisto = orcamentos.reduce(
    (total, item) => total + lucroOS(item),
    0
  );

  const lucroRealTotal = orcamentos.reduce(
    (total, item) => total + lucroRealOS(item),
    0
  );

  const margemMediaPrevista =
    totalVendido > 0 ? (lucroPrevisto / totalVendido) * 100 : 0;

  const margemMediaReal =
    totalVendido > 0 ? (lucroRealTotal / totalVendido) * 100 : 0;

  const osAReceber = orcamentos.filter((item) => saldoOS(item) > 0);

  const osMargemBaixa = orcamentos.filter((item) => {
    const margemAtual = margemRealOS(item);
    const margemMinima = margemMinimaOS(item);

    return vendaOS(item) > 0 && margemMinima > 0 && margemAtual < margemMinima;
  });

  const vendasHistoricoBase = useMemo(() => {
    return orcamentos
      .filter(ehVendaHistorico)
      .sort((vendaA, vendaB) => {
        const dataA = getDataVenda(vendaA)?.getTime() || 0;
        const dataB = getDataVenda(vendaB)?.getTime() || 0;

        return dataB - dataA;
      });
  }, [orcamentos]);

  const vendasFiltradas = useMemo(() => {
    return filtrarPorPeriodo(
      vendasHistoricoBase,
      periodoHistorico,
      periodoPersonalizado
    );
  }, [periodoHistorico, periodoPersonalizado, vendasHistoricoBase]);

  const resumoHistorico = useMemo(() => {
    return calcularResumo(vendasFiltradas);
  }, [vendasFiltradas]);

  const intervaloHistorico = obterIntervaloPeriodo(
    periodoHistorico,
    periodoPersonalizado
  );
  const caixaAberto = useMemo(() => {
    return caixas.find((caixa) => caixa.status === "aberto") || null;
  }, [caixas]);
  const historicoCaixas = useMemo(() => {
    return caixas.filter((caixa) => caixa.status !== "aberto");
  }, [caixas]);
  const resumoCaixaAtual = useMemo(() => {
    return calcularResumoCaixa(caixaAberto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caixaAberto, movimentacoesCaixa, orcamentos, saldoInformadoCaixa]);

  function selecionarPeriodo(periodo: PeriodoHistorico) {
    setPeriodoHistorico(periodo);
    setErroPeriodo("");
  }

  function aplicarPeriodoPersonalizado() {
    if (!dataInicial || !dataFinal) {
      setErroPeriodo("Informe a data inicial e a data final para filtrar.");
      return;
    }

    const inicio = new Date(`${dataInicial}T00:00:00`);
    const fim = new Date(`${dataFinal}T00:00:00`);

    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
      setErroPeriodo("Informe datas válidas para aplicar o filtro.");
      return;
    }

    if (fim < inicio) {
      setErroPeriodo("A data final não pode ser menor que a data inicial.");
      return;
    }

    setPeriodoPersonalizado({
      inicio: dataInicial,
      fim: dataFinal,
    });
    setPeriodoHistorico("periodo");
    setErroPeriodo("");
  }

  return (
    <AuthGuard>
      <main className="flex min-h-screen bg-zinc-950 text-white">
        <Sidebar />

        <section className="flex-1 p-10">
          {toast && (
            <div className="fixed right-6 top-6 z-[60] rounded-2xl border border-emerald-500/30 bg-zinc-900 px-5 py-3 text-sm font-bold text-emerald-300 shadow-2xl">
              {toast}
            </div>
          )}

          <div className="mb-10 flex items-start justify-between gap-6">
            <div>
              <p className="text-green-400 font-semibold mb-2">
                Inteligência financeira
              </p>

              <h1 className="text-5xl font-black mb-3">Financeiro</h1>

              <p className="text-zinc-400 max-w-3xl">
                Acompanhe faturamento, entrada, saldo a receber, lucro previsto,
                lucro real, margem e alertas financeiros por OS.
              </p>
            </div>

            <button
              onClick={() => setModalZerarVendas(true)}
              className="bg-red-500/20 text-red-300 border border-red-500/30 px-5 py-3 rounded-xl font-bold hover:bg-red-500/30 transition"
            >
              Zerar vendas registradas
            </button>
          </div>

          <div className="mb-8 overflow-x-auto">
            <div className="flex min-w-max gap-2">
              {ABAS_FINANCEIRO.map((aba) => (
                <button
                  key={aba.id}
                  onClick={() => setAbaFinanceiro(aba.id)}
                  className={`rounded-2xl border px-5 py-3 text-sm font-black transition ${
                    abaFinanceiro === aba.id
                      ? "border-emerald-400 bg-emerald-500/15 text-emerald-300"
                      : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800"
                  }`}
                >
                  {aba.label}
                </button>
              ))}
            </div>
          </div>

          {abaFinanceiro === "caixa" ? (
            <div className="space-y-6">
              {erroCaixa && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-300">
                  {erroCaixa}
                </div>
              )}

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1.4fr]">
                <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
                  <p className="mb-2 text-sm font-semibold text-emerald-400">
                    Caixa atual
                  </p>
                  <h2 className="text-3xl font-black">
                    {caixaAberto ? "Caixa aberto" : "Abrir caixa"}
                  </h2>

                  {caixaAberto ? (
                    <div className="mt-5 space-y-4">
                      <MiniCard
                        titulo="Responsável"
                        valor={caixaAberto.responsavel || "-"}
                      />
                      <MiniCard
                        titulo="Aberto em"
                        valor={formatarDataHora(caixaAberto.abertoEm)}
                      />
                      <MiniCard
                        titulo="Saldo inicial"
                        valor={formatarMoeda(caixaAberto.saldoInicial)}
                      />
                      <p className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
                        {caixaAberto.observacoes || "Sem observações de abertura."}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 grid grid-cols-1 gap-4">
                      <label>
                        <span className="mb-2 block text-xs font-bold text-zinc-400">
                          Responsável
                        </span>
                        <input
                          value={responsavelCaixa}
                          onChange={(evento) => setResponsavelCaixa(evento.target.value)}
                          className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                        />
                      </label>
                      <label>
                        <span className="mb-2 block text-xs font-bold text-zinc-400">
                          Saldo inicial
                        </span>
                        <input
                          inputMode="decimal"
                          value={saldoInicialCaixa}
                          onChange={(evento) => setSaldoInicialCaixa(evento.target.value)}
                          className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                        />
                      </label>
                      <label>
                        <span className="mb-2 block text-xs font-bold text-zinc-400">
                          Observações
                        </span>
                        <textarea
                          value={observacoesAberturaCaixa}
                          onChange={(evento) =>
                            setObservacoesAberturaCaixa(evento.target.value)
                          }
                          className="min-h-24 w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                        />
                      </label>
                      <button
                        onClick={abrirCaixa}
                        disabled={acaoCaixa}
                        className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-black transition hover:bg-emerald-400 disabled:opacity-60"
                      >
                        {acaoCaixa ? "Abrindo..." : "Abrir caixa"}
                      </button>
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
                  <p className="mb-2 text-sm font-semibold text-emerald-400">
                    Resumo automático
                  </p>
                  <h2 className="text-3xl font-black">Movimento do caixa</h2>

                  <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <ResumoHistoricoCard titulo="Total vendido" valor={formatarMoeda(resumoCaixaAtual.totalVendido)} cor="text-emerald-300" />
                    <ResumoHistoricoCard titulo="Dinheiro" valor={formatarMoeda(resumoCaixaAtual.totalDinheiro)} cor="text-green-300" />
                    <ResumoHistoricoCard titulo="PIX" valor={formatarMoeda(resumoCaixaAtual.totalPix)} cor="text-blue-300" />
                    <ResumoHistoricoCard titulo="Cartão" valor={formatarMoeda(resumoCaixaAtual.totalCartao)} cor="text-purple-300" />
                    <ResumoHistoricoCard titulo="Despesas" valor={formatarMoeda(resumoCaixaAtual.totalDespesas)} cor="text-red-300" />
                    <ResumoHistoricoCard titulo="Sangrias" valor={formatarMoeda(resumoCaixaAtual.totalSangrias)} cor="text-yellow-300" />
                    <ResumoHistoricoCard titulo="Saldo esperado" valor={formatarMoeda(resumoCaixaAtual.saldoEsperado)} cor="text-white" />
                    <ResumoHistoricoCard titulo="Diferença" valor={formatarMoeda(resumoCaixaAtual.diferenca)} cor={Math.abs(resumoCaixaAtual.diferenca) > 10 ? "text-red-300" : "text-emerald-300"} />
                  </div>
                </div>
              </div>

              {caixaAberto && (
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
                    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-emerald-400">
                          Conferência guiada
                        </p>
                        <h2 className="text-2xl font-black">
                          Passo {passoConferenciaCaixa} de 4
                        </h2>
                      </div>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4].map((passo) => (
                          <button
                            key={passo}
                            onClick={() => setPassoConferenciaCaixa(passo)}
                            className={`h-9 w-9 rounded-full text-xs font-black ${
                              passoConferenciaCaixa === passo
                                ? "bg-emerald-500 text-black"
                                : "bg-zinc-800 text-zinc-400"
                            }`}
                          >
                            {passo}
                          </button>
                        ))}
                      </div>
                    </div>

                    {passoConferenciaCaixa === 1 && (
                      <div>
                        <p className="mb-3 text-sm text-zinc-400">
                          Quanto existe em dinheiro/caixa agora?
                        </p>
                        <input
                          inputMode="decimal"
                          value={saldoInformadoCaixa}
                          onChange={(evento) => setSaldoInformadoCaixa(evento.target.value)}
                          className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-lg font-black outline-none focus:border-emerald-400"
                        />
                      </div>
                    )}

                    {passoConferenciaCaixa === 2 && (
                      <MovimentoCaixaForm
                        titulo="Teve alguma despesa fora do sistema?"
                        tipo="despesa"
                        form={formMovimentacaoCaixa}
                        onForm={setFormMovimentacaoCaixa}
                        onRegistrar={registrarMovimentacaoCaixa}
                        desabilitado={acaoCaixa}
                      />
                    )}

                    {passoConferenciaCaixa === 3 && (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <MovimentoCaixaForm
                          titulo="Registrar sangria"
                          tipo="sangria"
                          form={formMovimentacaoCaixa}
                          onForm={setFormMovimentacaoCaixa}
                          onRegistrar={registrarMovimentacaoCaixa}
                          desabilitado={acaoCaixa}
                        />
                        <MovimentoCaixaForm
                          titulo="Registrar suprimento"
                          tipo="suprimento"
                          form={formMovimentacaoCaixa}
                          onForm={setFormMovimentacaoCaixa}
                          onRegistrar={registrarMovimentacaoCaixa}
                          desabilitado={acaoCaixa}
                        />
                      </div>
                    )}

                    {passoConferenciaCaixa === 4 && (
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
                          <p className="text-sm text-zinc-400">Status automático</p>
                          <span
                            className={`mt-3 inline-flex rounded-full border px-4 py-2 text-sm font-black ${resumoCaixaAtual.status.cor}`}
                          >
                            {resumoCaixaAtual.status.texto}
                          </span>
                        </div>
                        <button
                          onClick={() => finalizarCaixa(caixaAberto)}
                          disabled={acaoCaixa || !String(saldoInformadoCaixa || "").trim()}
                          className="w-full rounded-2xl bg-emerald-500 px-5 py-4 text-sm font-black text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {acaoCaixa ? "Fechando..." : "Finalizar fechamento"}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
                    <p className="mb-2 text-sm font-semibold text-emerald-400">
                      Divergências e inteligência
                    </p>
                    <h2 className="text-2xl font-black">Sugestões</h2>
                    <div className="mt-5 space-y-3">
                      {resumoCaixaAtual.sugestoes.map((sugestao: string) => (
                        <p
                          key={sugestao}
                          className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300"
                        >
                          {sugestao}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <HistoricoCaixas
                caixas={historicoCaixas}
                onDetalhes={setCaixaDetalhe}
                onReabrir={reabrirCaixa}
                onExportar={exportarRelatorioCaixa}
              />
            </div>
          ) : (
            <>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-5">
            <CardFinanceiro
              titulo="Total vendido"
              valor={`R$ ${totalVendido.toFixed(2)}`}
              cor="text-green-400"
            />

            <CardFinanceiro
              titulo="Recebido"
              valor={`R$ ${totalRecebido.toFixed(2)}`}
              cor="text-blue-400"
            />

            <CardFinanceiro
              titulo="A receber"
              valor={`R$ ${totalAReceber.toFixed(2)}`}
              cor="text-yellow-300"
            />

            <CardFinanceiro
              titulo="Total de OS"
              valor={orcamentos.length.toString()}
              cor="text-white"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-10">
            <CardFinanceiro
              titulo="Custo previsto"
              valor={`R$ ${custoPrevisto.toFixed(2)}`}
              cor="text-red-300"
            />

            <CardFinanceiro
              titulo="Custo real"
              valor={`R$ ${custoRealTotal.toFixed(2)}`}
              cor="text-red-300"
            />

            <CardFinanceiro
              titulo="Lucro previsto"
              valor={`R$ ${lucroPrevisto.toFixed(2)}`}
              cor="text-emerald-400"
            />

            <CardFinanceiro
              titulo="Lucro real"
              valor={`R$ ${lucroRealTotal.toFixed(2)}`}
              cor="text-green-400"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
            <CardFinanceiro
              titulo="Margem média prevista"
              valor={`${margemMediaPrevista.toFixed(1)}%`}
              cor="text-purple-300"
            />

            <CardFinanceiro
              titulo="Margem média real"
              valor={`${margemMediaReal.toFixed(1)}%`}
              cor="text-green-300"
            />

            <CardFinanceiro
              titulo="OS a receber / margem baixa"
              valor={`${osAReceber.length} / ${osMargemBaixa.length}`}
              cor="text-yellow-300"
            />
          </div>

          {osMargemBaixa.length > 0 && (
            <div className="mb-10 bg-red-500/10 border border-red-500/30 rounded-3xl p-6">
              <div className="flex items-center justify-between gap-6">
                <div>
                  <p className="text-red-300 font-black text-xl">
                    ⚠️ OS com margem abaixo do mínimo
                  </p>

                  <p className="text-zinc-400 mt-2">
                    Existem orçamentos com margem real menor do que a margem
                    mínima configurada nos materiais.
                  </p>
                </div>

                <button
                  onClick={() => setModalMargemBaixa(true)}
                  className="bg-red-500 text-white px-5 py-3 rounded-xl font-bold hover:bg-red-400 transition"
                >
                  Ver OS com problema
                </button>
              </div>
            </div>
          )}

          <div className="mb-10 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
            <div className="border-b border-zinc-800 p-5 md:p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <p className="mb-2 text-sm font-semibold text-emerald-400">
                    Histórico de Vendas
                  </p>

                  <h2 className="text-2xl font-black">Vendas por período</h2>

                  <p className="mt-1 max-w-2xl text-sm text-zinc-400">
                    Escolha um período para ver rapidamente faturamento, pagos,
                    pendências e vendas registradas.
                  </p>
                </div>

                <div className="overflow-x-auto pb-1">
                  <div className="flex min-w-max gap-2">
                    {OPCOES_PERIODO.map((opcao) => {
                      const selecionado = periodoHistorico === opcao.id;

                      return (
                        <button
                          key={opcao.id}
                          onClick={() => selecionarPeriodo(opcao.id)}
                          className={`rounded-2xl border px-4 py-2 text-sm font-bold transition ${
                            selecionado
                              ? "border-emerald-400 bg-emerald-500/15 text-emerald-300"
                              : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800"
                          }`}
                        >
                          {opcao.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {periodoHistorico === "periodo" && (
                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                  <label className="min-w-0">
                    <span className="mb-2 block text-xs font-bold text-zinc-400">
                      Data inicial
                    </span>

                    <input
                      type="date"
                      value={dataInicial}
                      onChange={(evento) => setDataInicial(evento.target.value)}
                      className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-200 outline-none transition focus:border-emerald-400"
                    />
                  </label>

                  <label className="min-w-0">
                    <span className="mb-2 block text-xs font-bold text-zinc-400">
                      Data final
                    </span>

                    <input
                      type="date"
                      value={dataFinal}
                      onChange={(evento) => setDataFinal(evento.target.value)}
                      className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-200 outline-none transition focus:border-emerald-400"
                    />
                  </label>

                  <button
                    onClick={aplicarPeriodoPersonalizado}
                    className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-black transition hover:bg-emerald-400"
                  >
                    Aplicar filtro
                  </button>
                </div>
              )}

              {erroPeriodo && (
                <p className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300">
                  {erroPeriodo}
                </p>
              )}
            </div>

            <div className="p-5 md:p-6">
              <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-zinc-400">
                  Período exibido:{" "}
                  <span className="font-bold text-zinc-200">
                    {formatarDataVenda(intervaloHistorico.inicio)} até{" "}
                    {formatarDataVenda(intervaloHistorico.fim)}
                  </span>
                </p>

                <p className="text-xs font-bold text-zinc-500">
                  {vendasFiltradas.length} venda
                  {vendasFiltradas.length === 1 ? "" : "s"} encontrada
                  {vendasFiltradas.length === 1 ? "" : "s"}
                </p>
              </div>

              {carregandoFinanceiro && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-24 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-950"
                    />
                  ))}
                </div>
              )}

              {!carregandoFinanceiro && erroFinanceiro && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm font-bold text-red-300">
                  {erroFinanceiro}
                </div>
              )}

              {!carregandoFinanceiro && !erroFinanceiro && (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <ResumoHistoricoCard
                      titulo="Total vendido"
                      valor={formatarMoeda(resumoHistorico.totalVendido)}
                      cor="text-emerald-400"
                    />

                    <ResumoHistoricoCard
                      titulo="Vendas"
                      valor={String(resumoHistorico.quantidadeVendas)}
                      cor="text-white"
                    />

                    <ResumoHistoricoCard
                      titulo="Ticket médio"
                      valor={formatarMoeda(resumoHistorico.ticketMedio)}
                      cor="text-blue-300"
                    />

                    <ResumoHistoricoCard
                      titulo="Total pago"
                      valor={formatarMoeda(resumoHistorico.totalPago)}
                      cor="text-emerald-300"
                    />

                    <ResumoHistoricoCard
                      titulo="Pendente"
                      valor={formatarMoeda(resumoHistorico.totalPendente)}
                      cor="text-yellow-300"
                    />

                    <ResumoHistoricoCard
                      titulo="Lucro / margem"
                      valor={`${formatarMoeda(
                        resumoHistorico.lucroEstimado
                      )} • ${resumoHistorico.margemMedia.toFixed(1)}%`}
                      cor="text-green-300"
                    />
                  </div>

                  <div className="mt-6 hidden overflow-x-auto rounded-2xl border border-zinc-800 md:block">
                    <table className="w-full min-w-[980px] text-left text-sm">
                      <thead className="bg-zinc-950 text-xs uppercase tracking-wide text-zinc-500">
                        <tr>
                          <th className="px-4 py-3">Data</th>
                          <th className="w-28 px-4 py-3">OS</th>
                          <th className="min-w-[180px] px-4 py-3">Cliente</th>
                          <th className="min-w-[180px] px-4 py-3">
                            Serviço/Material
                          </th>
                          <th className="px-4 py-3">Valor</th>
                          <th className="w-36 px-4 py-3">Pagamento</th>
                          <th className="w-32 px-4 py-3">Margem</th>
                          <th className="w-56 px-4 py-3">Ações</th>
                        </tr>
                      </thead>

                      <tbody>
                        {vendasFiltradas.map((venda) => {
                          const pagamento = getStatusPagamento(venda);
                          const margem = getMargem(venda);
                          const saldo = getSaldoVenda(venda);
                          const podeCobrar = saldo > 0;

                          return (
                            <tr
                              key={venda.id}
                              className="border-t border-zinc-800 transition hover:bg-zinc-800/40"
                            >
                              <td className="px-4 py-4 align-top text-xs font-bold text-zinc-400 whitespace-nowrap">
                                {formatarDataVenda(getDataVenda(venda))}
                              </td>

                              <td className="px-4 py-4 align-top font-bold text-emerald-400 whitespace-nowrap">
                                {venda.numeroOS || "-"}
                              </td>

                              <td className="px-4 py-4 align-top">
                                <div className="max-w-[220px] truncate font-bold text-zinc-200">
                                  {venda.cliente || "Cliente não informado"}
                                </div>
                              </td>

                              <td className="px-4 py-4 align-top">
                                <div className="max-w-[240px] truncate text-zinc-300">
                                  {getServicoPrincipal(venda)}
                                </div>
                              </td>

                              <td className="px-4 py-4 align-top font-black text-emerald-300 whitespace-nowrap">
                                {formatarMoeda(getValorVenda(venda))}
                              </td>

                              <td className="px-4 py-4 align-top">
                                <span
                                  className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap ${pagamento.cor}`}
                                >
                                  {pagamento.texto}
                                </span>
                              </td>

                              <td className="px-4 py-4 align-top">
                                <span
                                  className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap ${
                                    margem < 0
                                      ? "bg-red-500/15 text-red-300"
                                      : margem < 30
                                      ? "bg-yellow-500/15 text-yellow-300"
                                      : "bg-emerald-500/15 text-emerald-300"
                                  }`}
                                >
                                  {margem.toFixed(1)}%
                                </span>
                              </td>

                              <td className="px-4 py-4 align-top">
                                <div className="flex max-w-[220px] flex-wrap items-start gap-2">
                                  {podeCobrar ? (
                                    <button
                                      onClick={() => enviarCobranca(venda)}
                                      className="inline-flex w-fit items-center rounded-full bg-yellow-500/15 px-3 py-1 text-xs font-bold text-yellow-300 whitespace-nowrap transition hover:bg-yellow-500/25"
                                    >
                                      Cobrar
                                    </button>
                                  ) : (
                                    <span className="inline-flex w-fit items-center rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300 whitespace-nowrap">
                                      Quitado
                                    </span>
                                  )}

                                  {renderAcoesNFe(venda)}
                                </div>
                              </td>
                            </tr>
                          );
                        })}

                        {vendasFiltradas.length === 0 && (
                          <tr>
                            <td
                              colSpan={8}
                              className="px-4 py-8 text-center text-sm text-zinc-400"
                            >
                              Nenhuma venda encontrada neste período.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-6 flex flex-col gap-3 md:hidden">
                    {vendasFiltradas.map((venda) => {
                      const pagamento = getStatusPagamento(venda);
                      const margem = getMargem(venda);
                      const saldo = getSaldoVenda(venda);

                      return (
                        <div
                          key={venda.id}
                          className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-black text-emerald-400">
                                {venda.numeroOS || "-"}
                              </p>

                              <p className="truncate text-sm font-bold text-zinc-200">
                                {venda.cliente || "Cliente não informado"}
                              </p>
                            </div>

                            <span
                              className={`inline-flex w-fit shrink-0 items-center rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap ${pagamento.cor}`}
                            >
                              {pagamento.texto}
                            </span>
                          </div>

                          <p className="mt-3 truncate text-sm text-zinc-300">
                            {getServicoPrincipal(venda)}
                          </p>

                          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <p className="text-zinc-500">Data</p>
                              <p className="font-bold text-zinc-300">
                                {formatarDataVenda(getDataVenda(venda))}
                              </p>
                            </div>

                            <div>
                              <p className="text-zinc-500">Valor</p>
                              <p className="font-black text-emerald-300">
                                {formatarMoeda(getValorVenda(venda))}
                              </p>
                            </div>

                            <div>
                              <p className="text-zinc-500">Margem</p>
                              <p className="font-bold text-zinc-300">
                                {margem.toFixed(1)}%
                              </p>
                            </div>

                            <div>
                              <p className="text-zinc-500">Saldo</p>
                              <p className="font-bold text-yellow-300">
                                {formatarMoeda(Math.max(saldo, 0))}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {saldo > 0 ? (
                              <button
                                onClick={() => enviarCobranca(venda)}
                                className="inline-flex flex-1 items-center justify-center rounded-2xl bg-yellow-500/15 px-4 py-2 text-xs font-black text-yellow-300 transition hover:bg-yellow-500/25"
                              >
                                Cobrar
                              </button>
                            ) : (
                              <span className="inline-flex flex-1 items-center justify-center rounded-2xl bg-emerald-500/15 px-4 py-2 text-xs font-black text-emerald-300">
                                Quitado
                              </span>
                            )}

                            {renderAcoesNFe(venda)}
                          </div>
                        </div>
                      );
                    })}

                    {vendasFiltradas.length === 0 && (
                      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-center text-sm text-zinc-400">
                        Nenhuma venda encontrada neste período.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
            <div className="p-6 border-b border-zinc-800">
              <h2 className="text-2xl font-black">Orçamentos financeiros</h2>

              <p className="text-zinc-400 text-sm mt-1">
                Visão financeira individual de cada OS.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1240px] text-left text-sm">
                <thead className="bg-zinc-800 text-zinc-300">
                  <tr>
                    <th className="w-28 px-4 py-3">OS</th>
                    <th className="min-w-[180px] px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Venda</th>
                    <th className="px-4 py-3">Entrada</th>
                    <th className="px-4 py-3">Saldo</th>
                    <th className="px-4 py-3">Custo real</th>
                    <th className="px-4 py-3">Lucro real</th>
                    <th className="px-4 py-3">Margem real</th>
                    <th className="px-4 py-3">Diferença</th>
                    <th className="w-40 px-4 py-3">Status</th>
                    <th className="w-64 px-4 py-3">Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {orcamentos.map((orcamento) => {
                    const saldo = saldoOS(orcamento);
                    const margemReal = margemRealOS(orcamento);
                    const margemMinima = margemMinimaOS(orcamento);
                    const status = statusMargemFinanceira(orcamento, margemMinima);
                    const pagamento = statusPagamento(orcamento);

                    const estaPago =
                      orcamento.financeiro?.statusFinanceiro === "Pago" ||
                      saldo <= 0;

                    return (
                      <tr
                        key={orcamento.id}
                        className="border-t border-zinc-800 hover:bg-zinc-800/50 transition"
                      >
                        <td className="w-28 px-4 py-4 align-top font-bold text-green-400 whitespace-nowrap">
                          {orcamento.numeroOS || "-"}
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="max-w-[220px] truncate text-zinc-300">
                            {orcamento.cliente}
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top font-bold whitespace-nowrap">
                          R$ {vendaOS(orcamento).toFixed(2)}
                        </td>

                        <td className="px-4 py-4 align-top text-blue-300 whitespace-nowrap">
                          R$ {entradaOS(orcamento).toFixed(2)}
                        </td>

                        <td className="px-4 py-4 align-top text-yellow-300 whitespace-nowrap">
                          R$ {saldo.toFixed(2)}
                        </td>

                        <td className="px-4 py-4 align-top text-red-300 whitespace-nowrap">
                          R$ {custoRealOS(orcamento).toFixed(2)}
                        </td>

                        <td className="px-4 py-4 align-top text-emerald-300 whitespace-nowrap">
                          R$ {lucroRealOS(orcamento).toFixed(2)}
                        </td>

                        <td className="px-4 py-4 align-top">
                          <span
                            className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap ${status.cor}`}
                          >
                            {margemReal.toFixed(1)}%
                          </span>
                        </td>

                        <td
                          className={`px-4 py-4 align-top font-bold whitespace-nowrap ${
                            diferencaLucroOS(orcamento) < 0
                              ? "text-red-300"
                              : "text-green-300"
                          }`}
                        >
                          R$ {diferencaLucroOS(orcamento).toFixed(2)}
                        </td>

                        <td className="w-40 px-4 py-4 align-top">
                          <div className="flex w-fit max-w-[160px] flex-col items-start gap-2">
                            <span
                              className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap ${
                                pagamento.cor
                              }`}
                            >
                              {pagamento.texto}
                            </span>

                            <span
                              className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap ${status.cor}`}
                            >
                              {status.texto}
                            </span>
                          </div>
                        </td>

                        <td className="w-64 px-4 py-4 align-top">
                          <div className="flex max-w-[260px] flex-wrap items-start gap-2">
                            {!estaPago && (
                              <>
                                <button
                                  onClick={() => setModalPago(orcamento)}
                                  className="inline-flex w-fit items-center rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300 whitespace-nowrap hover:bg-emerald-500/25 transition"
                                >
                                  Pago
                                </button>

                                <button
                                  onClick={() => enviarCobranca(orcamento)}
                                  className="inline-flex w-fit items-center rounded-full bg-yellow-500/15 px-3 py-1 text-xs font-bold text-yellow-300 whitespace-nowrap hover:bg-yellow-500/25 transition"
                                >
                                  Enviar cobrança
                                </button>
                              </>
                            )}

                            {estaPago && (
                              <span className="inline-flex w-fit items-center rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300 whitespace-nowrap">
                                Quitado
                              </span>
                            )}

                            {ehVendaHistorico(orcamento) && renderAcoesNFe(orcamento)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {orcamentos.length === 0 && (
                    <tr>
                      <td colSpan={11} className="p-6 text-zinc-400">
                        Nenhum orçamento encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

            </>
          )}

          {modalMargemBaixa && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
              <div className="bg-zinc-900 border border-red-500/30 rounded-3xl p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="text-red-400 font-semibold">
                      Alerta financeiro
                    </p>

                    <h2 className="text-3xl font-black">OS com margem baixa</h2>

                    <p className="text-zinc-400 mt-1">
                      Margem real abaixo da margem mínima cadastrada no material.
                    </p>
                  </div>

                  <button
                    onClick={() => setModalMargemBaixa(false)}
                    className="bg-zinc-800 text-zinc-300 px-4 py-2 rounded-xl hover:bg-zinc-700"
                  >
                    Fechar
                  </button>
                </div>

                <div className="flex flex-col gap-4">
                  {osMargemBaixa.map((orcamento) => (
                    <div
                      key={orcamento.id}
                      className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-green-400 font-bold">
                            {orcamento.numeroOS || "Sem OS"}
                          </p>

                          <h3 className="text-xl font-black mt-1">
                            {orcamento.cliente}
                          </h3>

                          <p className="text-zinc-400 text-sm mt-1">
                            {orcamento.servico || "Serviço não informado"}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-zinc-400 text-sm">Problema</p>

                          <p className="text-red-300 font-bold">
                            Margem abaixo do mínimo
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4 mt-5">
                        <MiniCard
                          titulo="Venda"
                          valor={`R$ ${vendaOS(orcamento).toFixed(2)}`}
                        />

                        <MiniCard
                          titulo="Custo previsto"
                          valor={`R$ ${custoOS(orcamento).toFixed(2)}`}
                        />

                        <MiniCard
                          titulo="Custo real"
                          valor={`R$ ${custoRealOS(orcamento).toFixed(2)}`}
                        />

                        <MiniCard
                          titulo="Lucro real"
                          valor={`R$ ${lucroRealOS(orcamento).toFixed(2)}`}
                        />

                        <MiniCard
                          titulo="Margem real"
                          valor={`${margemRealOS(orcamento).toFixed(1)}%`}
                        />

                        <MiniCard
                          titulo="Margem mínima"
                          valor={`${margemMinimaOS(orcamento).toFixed(1)}%`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {modalNFe && dadosNFe && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 md:p-6">
              <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl md:p-6">
                <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="mb-2 text-sm font-semibold text-blue-300">
                      Emitir NF-e
                    </p>

                    <h2 className="text-3xl font-black">
                      Conferência fiscal da venda
                    </h2>

                    <p className="mt-2 max-w-3xl text-sm text-zinc-400">
                      Confira os dados fiscais antes de emitir. Após autorização,
                      alterações exigem cancelamento ou carta de correção.
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setModalNFe(null);
                      setDadosNFe(null);
                      setErroNFe("");
                    }}
                    className="rounded-2xl bg-zinc-800 px-4 py-2 text-sm font-bold text-zinc-300 transition hover:bg-zinc-700"
                  >
                    Fechar
                  </button>
                </div>

                <div className="mb-5 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm font-bold text-yellow-200">
                  Os dados fiscais como CFOP, NCM, CST/CSOSN, alíquotas e regime
                  tributário devem ser validados pelo contador da empresa.
                </div>

                {erroNFe && (
                  <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-300">
                    {erroNFe}
                  </div>
                )}

                <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-4">
                  <MiniCard titulo="OS" valor={modalNFe.numeroOS || "-"} />
                  <MiniCard titulo="Cliente" valor={modalNFe.cliente || "-"} />
                  <MiniCard titulo="Valor" valor={formatarMoeda(vendaOS(modalNFe))} />
                  <MiniCard
                    titulo="Status pagamento"
                    valor={statusPagamento(modalNFe).texto}
                  />
                </div>

                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1.4fr]">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                    <h3 className="mb-4 text-sm font-black text-zinc-200">
                      Dados do cliente
                    </h3>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <CampoFiscal
                        label="Nome/Razão social"
                        value={dadosNFe.cliente.nomeRazaoSocial}
                        onChange={(valor) => atualizarClienteNFe("nomeRazaoSocial", valor)}
                      />
                      <CampoFiscal
                        label="CPF/CNPJ"
                        value={dadosNFe.cliente.cpfCnpj}
                        onChange={(valor) => atualizarClienteNFe("cpfCnpj", somenteDigitos(valor))}
                      />
                      <CampoFiscal
                        label="Inscrição estadual"
                        value={dadosNFe.cliente.inscricaoEstadual}
                        onChange={(valor) => atualizarClienteNFe("inscricaoEstadual", valor)}
                      />
                      <CampoFiscal
                        label="Email"
                        value={dadosNFe.cliente.email}
                        onChange={(valor) => atualizarClienteNFe("email", valor)}
                      />
                      <CampoFiscal
                        label="Telefone"
                        value={dadosNFe.cliente.telefone}
                        onChange={(valor) => atualizarClienteNFe("telefone", valor)}
                      />
                      <CampoFiscal
                        label="CEP"
                        value={dadosNFe.cliente.endereco.cep}
                        onChange={(valor) => atualizarEnderecoNFe("cep", somenteDigitos(valor))}
                      />
                      <CampoFiscal
                        label="Endereço"
                        value={dadosNFe.cliente.endereco.logradouro}
                        onChange={(valor) => atualizarEnderecoNFe("logradouro", valor)}
                      />
                      <CampoFiscal
                        label="Número"
                        value={dadosNFe.cliente.endereco.numero}
                        onChange={(valor) => atualizarEnderecoNFe("numero", valor)}
                      />
                      <CampoFiscal
                        label="Bairro"
                        value={dadosNFe.cliente.endereco.bairro}
                        onChange={(valor) => atualizarEnderecoNFe("bairro", valor)}
                      />
                      <CampoFiscal
                        label="Cidade"
                        value={dadosNFe.cliente.endereco.cidade}
                        onChange={(valor) => atualizarEnderecoNFe("cidade", valor)}
                      />
                      <CampoFiscal
                        label="UF"
                        value={dadosNFe.cliente.endereco.uf}
                        onChange={(valor) => atualizarEnderecoNFe("uf", valor)}
                      />
                      <CampoFiscal
                        label="Complemento"
                        value={dadosNFe.cliente.endereco.complemento}
                        onChange={(valor) => atualizarEnderecoNFe("complemento", valor)}
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                    <h3 className="mb-4 text-sm font-black text-zinc-200">
                      Itens fiscais
                    </h3>

                    <div className="flex flex-col gap-4">
                      {dadosNFe.itens.map((item: any, index: number) => (
                        <div
                          key={item.id || index}
                          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
                        >
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-xs font-black text-zinc-400">
                              Item {index + 1}
                            </p>

                            <p className="text-xs font-bold text-emerald-300">
                              {formatarMoeda(item.valorTotal)}
                            </p>
                          </div>

                          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                            <div className="md:col-span-2">
                              <CampoFiscal
                                label="Descrição"
                                value={item.descricao}
                                onChange={(valor) => atualizarItemNFe(index, "descricao", valor)}
                              />
                            </div>
                            <CampoFiscal
                              label="NCM"
                              value={item.ncm}
                              onChange={(valor) => atualizarItemNFe(index, "ncm", valor)}
                            />
                            <CampoFiscal
                              label="CFOP"
                              value={item.cfop}
                              onChange={(valor) => atualizarItemNFe(index, "cfop", valor)}
                            />
                            <CampoFiscal
                              label="Un."
                              value={item.unidade}
                              onChange={(valor) => atualizarItemNFe(index, "unidade", valor)}
                            />
                            <CampoFiscal
                              label="Qtd"
                              type="number"
                              value={item.quantidade}
                              onChange={(valor) => atualizarItemNFe(index, "quantidade", valor)}
                            />
                            <CampoFiscal
                              label="Valor unit."
                              type="number"
                              value={item.valorUnitario}
                              onChange={(valor) => atualizarItemNFe(index, "valorUnitario", valor)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 md:flex-row md:justify-end">
                  <button
                    onClick={() => {
                      setModalNFe(null);
                      setDadosNFe(null);
                      setErroNFe("");
                    }}
                    className="rounded-2xl bg-zinc-800 px-5 py-3 text-sm font-bold text-zinc-300 transition hover:bg-zinc-700"
                  >
                    Cancelar
                  </button>

                  <button
                    onClick={confirmarEmissaoNFe}
                    disabled={emitindoNFeId === modalNFe.id}
                    className="rounded-2xl bg-blue-500 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {emitindoNFeId === modalNFe.id
                      ? "Emitindo NF-e..."
                      : "Confirmar e emitir NF-e"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {modalPago && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-lg">
                <p className="text-green-400 font-semibold mb-2">
                  Confirmar pagamento
                </p>

                <h2 className="text-3xl font-black mb-4">
                  Marcar OS como paga?
                </h2>

                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 mb-6">
                  <p className="text-zinc-400 text-sm">OS</p>

                  <p className="font-bold text-green-400">
                    {modalPago.numeroOS}
                  </p>

                  <p className="text-zinc-400 text-sm mt-3">Cliente</p>

                  <p className="font-bold">{modalPago.cliente}</p>

                  <p className="text-zinc-400 text-sm mt-3">Valor em aberto</p>

                  <p className="font-bold text-yellow-300">
                    R$ {saldoOS(modalPago).toFixed(2)}
                  </p>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setModalPago(null)}
                    className="bg-zinc-800 text-zinc-300 px-5 py-3 rounded-xl hover:bg-zinc-700 transition"
                  >
                    Cancelar
                  </button>

                  <button
                    onClick={() => marcarComoPago(modalPago)}
                    className="bg-green-500 text-black px-5 py-3 rounded-xl font-bold hover:bg-green-400 transition"
                  >
                    Sim, marcar como pago
                  </button>
                </div>
              </div>
            </div>
          )}

          {modalZerarVendas && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
              <div className="bg-zinc-900 border border-red-500/30 rounded-3xl p-6 w-full max-w-lg">
                <p className="text-red-400 font-semibold mb-2">Ação perigosa</p>

                <h2 className="text-3xl font-black mb-4">
                  Zerar todas as vendas?
                </h2>

                <p className="text-zinc-300 mb-6">
                  Isso vai apagar todos os orçamentos registrados no financeiro.
                  Essa ação não pode ser desfeita.
                </p>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setModalZerarVendas(false)}
                    className="bg-zinc-800 text-zinc-300 px-5 py-3 rounded-xl hover:bg-zinc-700 transition"
                  >
                    Cancelar
                  </button>

                  <button
                    onClick={zerarTodasVendas}
                    className="bg-red-500 text-white px-5 py-3 rounded-xl font-bold hover:bg-red-400 transition"
                  >
                    Sim, zerar vendas
                  </button>
                </div>
              </div>
            </div>
          )}

          {caixaDetalhe && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 md:p-6">
              <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <p className="mb-2 text-sm font-semibold text-emerald-400">
                      Detalhes do fechamento
                    </p>
                    <h2 className="text-3xl font-black">
                      Caixa de {formatarDataVenda(converterData(caixaDetalhe.abertoEm))}
                    </h2>
                  </div>
                  <button
                    onClick={() => setCaixaDetalhe(null)}
                    className="rounded-2xl bg-zinc-800 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-zinc-700"
                  >
                    Fechar
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <MiniCard titulo="Responsável" valor={caixaDetalhe.responsavel || "-"} />
                  <MiniCard titulo="Saldo inicial" valor={formatarMoeda(caixaDetalhe.saldoInicial)} />
                  <MiniCard titulo="Saldo esperado" valor={formatarMoeda(caixaDetalhe.saldoEsperado)} />
                  <MiniCard titulo="Diferença" valor={formatarMoeda(caixaDetalhe.diferenca)} />
                  <MiniCard titulo="Total vendido" valor={formatarMoeda(caixaDetalhe.totalVendido)} />
                  <MiniCard titulo="PIX" valor={formatarMoeda(caixaDetalhe.totalPix)} />
                  <MiniCard titulo="Dinheiro" valor={formatarMoeda(caixaDetalhe.totalDinheiro)} />
                  <MiniCard titulo="Cartão" valor={formatarMoeda(caixaDetalhe.totalCartao)} />
                  <MiniCard titulo="Abertura" valor={formatarDataHora(caixaDetalhe.abertoEm)} />
                  <MiniCard titulo="Fechamento" valor={formatarDataHora(caixaDetalhe.fechadoEm)} />
                  <MiniCard titulo="Despesas" valor={formatarMoeda(caixaDetalhe.totalDespesas)} />
                  <MiniCard titulo="Sangrias" valor={formatarMoeda(caixaDetalhe.totalSangrias)} />
                </div>

                <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <p className="text-xs font-bold text-zinc-500">Observações</p>
                  <p className="mt-2 text-sm text-zinc-300">
                    {caixaDetalhe.observacoes || "Sem observações."}
                  </p>
                </div>

                <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <p className="text-xs font-bold text-zinc-500">Sugestões</p>
                  <div className="mt-3 space-y-2">
                    {(caixaDetalhe.sugestoes || []).map((sugestao: string) => (
                      <p key={sugestao} className="text-sm text-zinc-300">
                        {sugestao}
                      </p>
                    ))}
                    {(!caixaDetalhe.sugestoes || caixaDetalhe.sugestoes.length === 0) && (
                      <p className="text-sm text-zinc-400">
                        Nenhuma sugestão registrada.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </AuthGuard>
  );
}

function CardFinanceiro({
  titulo,
  valor,
  cor,
}: {
  titulo: string;
  valor: string;
  cor: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
      <p className="text-zinc-400 text-sm">{titulo}</p>

      <h2 className={`text-3xl font-black mt-3 ${cor}`}>{valor}</h2>
    </div>
  );
}

function ResumoHistoricoCard({
  titulo,
  valor,
  cor,
}: {
  titulo: string;
  valor: string;
  cor: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <p className="truncate text-xs font-bold text-zinc-500">{titulo}</p>

      <p className={`mt-2 truncate text-lg font-black ${cor}`}>{valor}</p>
    </div>
  );
}

function MovimentoCaixaForm({
  titulo,
  tipo,
  form,
  onForm,
  onRegistrar,
  desabilitado,
}: {
  titulo: string;
  tipo: TipoMovimentacaoCaixa;
  form: {
    tipo: TipoMovimentacaoCaixa;
    valor: string;
    observacao: string;
    responsavel: string;
  };
  onForm: (form: {
    tipo: TipoMovimentacaoCaixa;
    valor: string;
    observacao: string;
    responsavel: string;
  }) => void;
  onRegistrar: (tipo: TipoMovimentacaoCaixa) => void;
  desabilitado: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <h3 className="text-sm font-black text-zinc-200">{titulo}</h3>
      <div className="mt-4 grid grid-cols-1 gap-3">
        <input
          inputMode="decimal"
          placeholder="Valor"
          value={form.valor}
          onChange={(evento) =>
            onForm({ ...form, tipo, valor: evento.target.value })
          }
          className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-emerald-400"
        />
        <input
          placeholder="Responsável"
          value={form.responsavel}
          onChange={(evento) =>
            onForm({ ...form, tipo, responsavel: evento.target.value })
          }
          className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-emerald-400"
        />
        <textarea
          placeholder="Observação"
          value={form.observacao}
          onChange={(evento) =>
            onForm({ ...form, tipo, observacao: evento.target.value })
          }
          className="min-h-20 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-emerald-400"
        />
        <button
          onClick={() => onRegistrar(tipo)}
          disabled={desabilitado}
          className="rounded-2xl bg-zinc-800 px-4 py-3 text-sm font-black text-zinc-200 transition hover:bg-zinc-700 disabled:opacity-60"
        >
          Registrar
        </button>
      </div>
    </div>
  );
}

function HistoricoCaixas({
  caixas,
  onDetalhes,
  onReabrir,
  onExportar,
}: {
  caixas: any[];
  onDetalhes: (caixa: any) => void;
  onReabrir: (caixa: any) => void;
  onExportar: (caixa: any) => void;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
      <div className="border-b border-zinc-800 p-6">
        <p className="text-sm font-semibold text-emerald-400">
          Histórico de caixas
        </p>
        <h2 className="mt-1 text-2xl font-black">Fechamentos anteriores</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-zinc-800 text-xs uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Responsável</th>
              <th className="px-4 py-3">Total vendido</th>
              <th className="px-4 py-3">Diferença</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {caixas.map((caixa) => {
              const status = statusFechamentoCaixa(parseValor(caixa.diferenca));

              return (
                <tr
                  key={caixa.id}
                  className="border-t border-zinc-800 text-zinc-300 hover:bg-zinc-800/50"
                >
                  <td className="px-4 py-4 align-top whitespace-nowrap">
                    {formatarDataHora(caixa.fechadoEm || caixa.abertoEm)}
                  </td>
                  <td className="px-4 py-4 align-top">
                    {caixa.responsavel || "-"}
                  </td>
                  <td className="px-4 py-4 align-top font-black text-emerald-300 whitespace-nowrap">
                    {formatarMoeda(caixa.totalVendido)}
                  </td>
                  <td className="px-4 py-4 align-top font-black whitespace-nowrap">
                    {formatarMoeda(caixa.diferenca)}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${status.cor}`}
                    >
                      {caixa.statusFechamento || status.texto}
                    </span>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => onDetalhes(caixa)}
                        className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-bold text-zinc-200 hover:bg-zinc-700"
                      >
                        Ver detalhes
                      </button>
                      <button
                        onClick={() => onReabrir(caixa)}
                        className="rounded-full bg-yellow-500/15 px-3 py-1 text-xs font-bold text-yellow-300 hover:bg-yellow-500/25"
                      >
                        Reabrir caixa
                      </button>
                      <button
                        onClick={() => onExportar(caixa)}
                        className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-300 hover:bg-blue-500/25"
                      >
                        Exportar relatório
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {caixas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  Nenhum fechamento registrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampoFiscal({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: any;
  onChange: (valor: string) => void;
  type?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-bold text-zinc-500">{label}</span>

      <input
        type={type}
        value={value ?? ""}
        step={type === "number" ? "0.01" : undefined}
        onChange={(evento) => onChange(evento.target.value)}
        className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-blue-400"
      />
    </label>
  );
}

function MiniCard({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <p className="text-zinc-500 text-sm">{titulo}</p>
      <p className="font-black mt-1">{valor}</p>
    </div>
  );
}
