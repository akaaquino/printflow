"use client";

import { useEffect, useRef, useState } from "react";
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

type ItemOrcamentoForm = {
  materialId: string;
  servico: string;
  largura: string;
  altura: string;
  quantidade: string;
  precoMetro: string;
  custoInterno: number | string;
  margemMinima: number | string;
};

export default function OrcamentosPage() {
  const topoListagemRef = useRef<HTMLDivElement | null>(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [orcamentoDetalhe, setOrcamentoDetalhe] = useState<any>(null);
  const [modalMargemBaixa, setModalMargemBaixa] = useState(false);
  const [aprovandoOrcamentoId, setAprovandoOrcamentoId] = useState("");
  const [salvandoOrcamento, setSalvandoOrcamento] = useState(false);
  const [orcamentoEditando, setOrcamentoEditando] = useState<any>(null);
  const [toast, setToast] = useState("");
  const [destaqueTopo, setDestaqueTopo] = useState(false);

  const [clientes, setClientes] = useState<any[]>([]);
  const [orcamentos, setOrcamentos] = useState<any[]>([]);
  const [materiais, setMateriais] = useState<any[]>([]);

  const [clienteId, setClienteId] = useState("");
  const [clienteNome, setClienteNome] = useState("");

  const [tipoServicoFinal, setTipoServicoFinal] = useState("");
  const [precisaInstalacao, setPrecisaInstalacao] = useState(false);

  const [responsavelInstalacao, setResponsavelInstalacao] = useState("");
  const [enderecoInstalacao, setEnderecoInstalacao] = useState("");
  const [dataInstalacao, setDataInstalacao] = useState("");
  const [horarioInstalacao, setHorarioInstalacao] = useState("");
  const [observacoesInstalacao, setObservacoesInstalacao] = useState("");

  const [entradaFinanceira, setEntradaFinanceira] = useState("");
  const [descontoReais, setDescontoReais] = useState("");
  const [descontoPercentual, setDescontoPercentual] = useState("");

  const [itens, setItens] = useState<ItemOrcamentoForm[]>([
    {
      materialId: "",
      servico: "",
      largura: "",
      altura: "",
      quantidade: "1",
      precoMetro: "",
      custoInterno: 0,
      margemMinima: 20,
    },
  ]);

  async function carregarClientes() {
    const querySnapshot = await getDocs(collection(db, "clientes"));
    const lista: any[] = [];

    querySnapshot.forEach((documento) => {
      lista.push({
        id: documento.id,
        ...documento.data(),
      });
    });

    setClientes(lista);
  }

  async function carregarOrcamentos() {
    const querySnapshot = await getDocs(collection(db, "orcamentos"));
    const lista: any[] = [];

    querySnapshot.forEach((documento) => {
      lista.push({
        id: documento.id,
        ...documento.data(),
      });
    });

    lista.sort((a, b) => {
      const dataA = a.atualizadoEm?.toDate?.() || a.criadoEm?.toDate?.() || new Date(0);
      const dataB = b.atualizadoEm?.toDate?.() || b.criadoEm?.toDate?.() || new Date(0);
      return dataB.getTime() - dataA.getTime();
    });

    setOrcamentos(lista);
  }

  async function carregarMateriais() {
    const querySnapshot = await getDocs(collection(db, "materiais"));
    const lista: any[] = [];

    querySnapshot.forEach((documento) => {
      const dados: any = documento.data();

      if (dados.ativo !== false) {
        lista.push({
          id: documento.id,
          ...dados,
        });
      }
    });

    setMateriais(lista);
  }

  useEffect(() => {
    carregarClientes();
    carregarOrcamentos();
    carregarMateriais();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || orcamentos.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const orcamentoId = params.get("orcamentoId");

    if (!orcamentoId) return;

    const orcamentoEncontrado = orcamentos.find(
      (orcamento) => orcamento.id === orcamentoId
    );

    if (orcamentoEncontrado) {
      if (ehRascunhoCentral(orcamentoEncontrado)) {
        abrirFormularioOrcamento(orcamentoEncontrado);
      } else {
        setOrcamentoDetalhe(orcamentoEncontrado);
      }

      topoListagemRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [orcamentos]);

  function selecionarCliente(idSelecionado: string) {
    setClienteId(idSelecionado);

    const clienteSelecionado = clientes.find(
      (cliente) => cliente.id === idSelecionado
    );

    const nomeCliente =
      clienteSelecionado?.nome ||
      clienteSelecionado?.razaoSocial ||
      clienteSelecionado?.cliente ||
      "";

    setClienteNome(nomeCliente);

    if (clienteSelecionado) {
      const enderecoCompleto = [
        clienteSelecionado.endereco || clienteSelecionado.logradouro,
        clienteSelecionado.numero,
        clienteSelecionado.bairro,
      ]
        .filter(Boolean)
        .join(", ");

      setEnderecoInstalacao(enderecoCompleto);
    } else {
      setEnderecoInstalacao("");
    }
  }

  function atualizarItem(index: number, campo: string, valor: string) {
    const novaLista = [...itens];

    if (campo === "materialId") {
      const materialSelecionado = materiais.find(
        (material) => material.id === valor
      );

      novaLista[index] = {
        ...novaLista[index],
        materialId: valor,
        servico: materialSelecionado?.nome || "",
        precoMetro: String(materialSelecionado?.precoVenda || 0),
        custoInterno: Number(materialSelecionado?.custoInterno || 0),
        margemMinima: Number(materialSelecionado?.margemMinima || 20),
      };
    } else {
      novaLista[index] = {
        ...novaLista[index],
        [campo]: valor,
      };
    }

    setItens(novaLista);
  }

  function adicionarItem() {
    setItens([
      ...itens,
      {
        materialId: "",
        servico: "",
        largura: "",
        altura: "",
        quantidade: "1",
        precoMetro: "",
        custoInterno: 0,
        margemMinima: 20,
      },
    ]);
  }

  function removerItem(indexParaRemover: number) {
    const novaLista = itens.filter((_, index) => index !== indexParaRemover);
    setItens(novaLista.length > 0 ? novaLista : itens);
  }

  function calcularArea(item: any) {
    const quantidade = numeroSeguro(item.quantidade) || 1;
    return numeroSeguro(item.largura) * numeroSeguro(item.altura) * quantidade;
  }

  function numeroSeguro(valor: any) {
    const convertido = Number(
      String(valor ?? "0")
        .replace(/[^\d,.-]/g, "")
        .replace(/\.(?=\d{3}(,|$))/g, "")
        .replace(",", ".")
    );

    return Number.isFinite(convertido) ? convertido : 0;
  }

  function formatarMoeda(valor: any) {
    return numeroSeguro(valor).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function mostrarToast(mensagem: string) {
    setToast(mensagem);
    window.setTimeout(() => setToast(""), 3500);
  }

  function voltarParaTopoListagem(mensagem?: string) {
    setOrcamentoDetalhe(null);
    setDestaqueTopo(true);

    if (mensagem) {
      mostrarToast(mensagem);
    }

    window.requestAnimationFrame(() => {
      topoListagemRef.current?.focus({ preventScroll: true });
      topoListagemRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    });

    window.setTimeout(() => setDestaqueTopo(false), 1600);
  }

  function montarItensArteDoOrcamento(orcamento: any) {
    const itensOrigem = Array.isArray(orcamento.itens) ? orcamento.itens : [];

    if (itensOrigem.length === 0) {
      return [
        {
          id: `item-${Date.now()}`,
          materialId: "",
          material: orcamento.servico || "Material não informado",
          servico: orcamento.servico || "",
          largura: "",
          altura: "",
          quantidade: 1,
          area: 0,
          areaM2: 0,
          medida: orcamento.medida || "",
          acabamento: orcamento.acabamento || "",
          cor: orcamento.cor || "",
          observacoes: orcamento.observacoes || orcamento.observacoesInstalacao || "",
          conferido: false,
          status: "Pendente",
        },
      ];
    }

    return itensOrigem.map((item: any, index: number) => {
      const largura = numeroSeguro(item.largura);
      const altura = numeroSeguro(item.altura);
      const quantidade = numeroSeguro(item.quantidade) || 1;
      const areaInformada = numeroSeguro(item.areaM2 ?? item.area);
      const area = areaInformada || largura * altura * quantidade;

      return {
        id: item.id || `${orcamento.id || orcamento.numeroOS || "orcamento"}-${index + 1}`,
        materialId: item.materialId || "",
        material: item.material || item.servico || "Material não informado",
        servico: item.servico || item.material || "",
        largura: item.largura || "",
        altura: item.altura || "",
        quantidade,
        area,
        areaM2: area,
        medida:
          item.medida ||
          (largura && altura ? `${item.largura} x ${item.altura}m` : ""),
        acabamento: item.acabamento || orcamento.acabamento || "",
        cor: item.cor || orcamento.cor || "",
        observacoes: item.observacoes || orcamento.observacoes || "",
        conferido: false,
        status: "Pendente",
      };
    });
  }

  function calcularSubtotal(item: any) {
    return calcularArea(item) * numeroSeguro(item.precoMetro);
  }

  function calcularCustoItem(item: any) {
    return calcularArea(item) * numeroSeguro(item.custoInterno);
  }

  const valorBruto = itens.reduce((total, item) => {
    return total + calcularSubtotal(item);
  }, 0);

  const custoCalculado = itens.reduce((total, item) => {
    return total + calcularCustoItem(item);
  }, 0);

  const descontoEmReais = Number(descontoReais || 0);

  const descontoEmPorcentagem =
    valorBruto > 0 ? (Number(descontoPercentual || 0) / 100) * valorBruto : 0;

  const descontoTotal = Math.min(
    valorBruto,
    descontoEmReais + descontoEmPorcentagem
  );

  const valorTotal = Math.max(valorBruto - descontoTotal, 0);

  const valorEntrada = Number(entradaFinanceira || 0);
  const lucroPrevisto = valorTotal - custoCalculado;

  const margemPrevista =
    valorTotal > 0 ? (lucroPrevisto / valorTotal) * 100 : 0;

  const margemMinimaExigida =
    itens.length > 0
      ? Math.max(...itens.map((item) => Number(item.margemMinima || 0)))
      : 0;

  const margemAbaixoDoMinimo =
    valorTotal > 0 &&
    margemMinimaExigida > 0 &&
    margemPrevista < margemMinimaExigida;

  const saldoRestante = valorTotal - valorEntrada;

  function tentarSalvarOrcamento(formalizar = false) {
    if (margemAbaixoDoMinimo) {
      setModalMargemBaixa(true);
      return;
    }

    salvarOrcamento(formalizar);
  }

  async function gerarNumeroOS() {
    const querySnapshot = await getDocs(collection(db, "orcamentos"));
    const proximoNumero = querySnapshot.size + 1;

    return `OS-${String(proximoNumero).padStart(5, "0")}`;
  }

  function limparFormulario() {
    setClienteId("");
    setClienteNome("");
    setTipoServicoFinal("");
    setPrecisaInstalacao(false);
    setResponsavelInstalacao("");
    setEnderecoInstalacao("");
    setDataInstalacao("");
    setHorarioInstalacao("");
    setObservacoesInstalacao("");
    setEntradaFinanceira("");
    setDescontoReais("");
    setDescontoPercentual("");
    setOrcamentoEditando(null);

    setItens([
      {
        materialId: "",
        servico: "",
        largura: "",
        altura: "",
        quantidade: "1",
        precoMetro: "",
        custoInterno: 0,
        margemMinima: 20,
      },
    ]);
  }

  function ehRascunhoCentral(orcamento: any) {
    return (
      orcamento?.origem === "central_comercial" &&
      String(orcamento?.status || "").toLowerCase() === "rascunho"
    );
  }

  function encontrarMaterialPorItem(item: any) {
    if (item?.materialId) {
      const porId = materiais.find((material) => material.id === item.materialId);
      if (porId) return porId;
    }

    const nomeItem = String(item?.material || item?.servico || item?.nome || "")
      .trim()
      .toLowerCase();

    if (!nomeItem) return null;

    return (
      materiais.find((material) => {
        const nomeMaterial = String(material.nome || material.material || "")
          .trim()
          .toLowerCase();

        return nomeMaterial === nomeItem || nomeMaterial.includes(nomeItem) || nomeItem.includes(nomeMaterial);
      }) || null
    );
  }

  function mapearItemParaFormulario(item: any): ItemOrcamentoForm {
    const materialEncontrado = encontrarMaterialPorItem(item);
    const largura = numeroSeguro(item?.largura);
    const altura = numeroSeguro(item?.altura);
    const quantidade = numeroSeguro(item?.quantidade) || 1;
    const area = numeroSeguro(item?.areaM2 ?? item?.area) || largura * altura * quantidade;
    const valorTotal = numeroSeguro(item?.valorTotal ?? item?.subtotal);
    const custoTotal = numeroSeguro(item?.custoTotal ?? item?.custoPrevisto);
    const precoMetro =
      numeroSeguro(item?.precoMetro ?? item?.valorM2 ?? item?.valorUnitario) ||
      (area > 0 ? valorTotal / area : 0) ||
      numeroSeguro(materialEncontrado?.precoVenda ?? materialEncontrado?.valorM2 ?? materialEncontrado?.precoM2);
    const custoInterno =
      numeroSeguro(item?.custoInterno ?? item?.custoM2) ||
      (area > 0 ? custoTotal / area : 0) ||
      numeroSeguro(materialEncontrado?.custoInterno ?? materialEncontrado?.custoM2);
    const margemMinima = numeroSeguro(item?.margemMinima ?? item?.margem) || 20;

    return {
      materialId: item?.materialId || materialEncontrado?.id || "",
      servico: item?.servico || item?.material || materialEncontrado?.nome || "",
      largura: largura > 0 ? String(largura).replace(".", ",") : String(item?.largura || ""),
      altura: altura > 0 ? String(altura).replace(".", ",") : String(item?.altura || ""),
      quantidade: String(quantidade).replace(".", ","),
      precoMetro: precoMetro > 0 ? precoMetro.toFixed(2) : String(item?.precoMetro || item?.valorM2 || ""),
      custoInterno,
      margemMinima,
    };
  }

  function mapearOrcamentoParaFormulario(orcamento: any) {
    const itensOrigem = Array.isArray(orcamento?.itens) ? orcamento.itens : [];
    const itensMapeados = itensOrigem.length
      ? itensOrigem.map((item: any) => mapearItemParaFormulario(item))
      : [
          {
            materialId: "",
            servico: orcamento?.servico || "",
            largura: "",
            altura: "",
            quantidade: "1",
            precoMetro: "",
            custoInterno: numeroSeguro(orcamento?.financeiro?.custoPrevisto),
            margemMinima: 20,
          },
        ];

    return {
      clienteId: orcamento?.clienteId || "",
      cliente: orcamento?.cliente || "",
      itens: itensMapeados,
      tipoServicoFinal: orcamento?.tipoServicoFinal || "",
      precisaInstalacao: !!orcamento?.precisaInstalacao,
      responsavelInstalacao: orcamento?.responsavelInstalacao || "",
      enderecoInstalacao: orcamento?.enderecoInstalacao || orcamento?.endereco || "",
      dataInstalacao: orcamento?.dataInstalacao || orcamento?.prazo || "",
      horarioInstalacao: orcamento?.horarioInstalacao || "",
      observacoesInstalacao: orcamento?.observacoesInstalacao || orcamento?.observacoes || "",
      entradaFinanceira: String(orcamento?.financeiro?.entrada || ""),
      descontoReais: String(orcamento?.descontoReais || orcamento?.financeiro?.descontoReais || ""),
      descontoPercentual: String(orcamento?.descontoPercentual || orcamento?.financeiro?.descontoPercentual || ""),
    };
  }

  function abrirFormularioOrcamento(orcamentoInicial?: any) {
    setOrcamentoDetalhe(null);

    if (!orcamentoInicial) {
      limparFormulario();
      setMostrarFormulario(true);
      return;
    }

    const formulario = mapearOrcamentoParaFormulario(orcamentoInicial);
    setOrcamentoEditando(orcamentoInicial);
    setClienteId(formulario.clienteId);
    setClienteNome(formulario.cliente);
    setItens(formulario.itens);
    setTipoServicoFinal(formulario.tipoServicoFinal);
    setPrecisaInstalacao(formulario.precisaInstalacao);
    setResponsavelInstalacao(formulario.responsavelInstalacao);
    setEnderecoInstalacao(formulario.enderecoInstalacao);
    setDataInstalacao(formulario.dataInstalacao);
    setHorarioInstalacao(formulario.horarioInstalacao);
    setObservacoesInstalacao(formulario.observacoesInstalacao);
    setEntradaFinanceira(formulario.entradaFinanceira);
    setDescontoReais(formulario.descontoReais);
    setDescontoPercentual(formulario.descontoPercentual);
    setMostrarFormulario(true);
    topoListagemRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function salvarOrcamento(formalizar = false) {
    if (salvandoOrcamento) return;

    if (!clienteId || !clienteNome) {
      alert("Selecione um cliente antes de salvar o orçamento.");
      return;
    }

    if (
      itens.some(
        (item) =>
          (!item.materialId && !item.servico) ||
          calcularArea(item) <= 0 ||
          numeroSeguro(item.precoMetro) < 0
      )
    ) {
      alert("Preencha material, largura, altura, quantidade e valor antes de salvar.");
      return;
    }

    try {
      setSalvandoOrcamento(true);

      const numeroOS = orcamentoEditando?.numeroOS || (await gerarNumeroOS());

      const itensFormatados = itens.map((item) => {
        const area = calcularArea(item);
        const subtotal = calcularSubtotal(item);
        const custoPrevisto = calcularCustoItem(item);
        const lucro = subtotal - custoPrevisto;
        const margem = subtotal > 0 ? (lucro / subtotal) * 100 : 0;

        return {
          materialId: item.materialId,
          material: item.servico,
          servico: item.servico,
          largura: numeroSeguro(item.largura),
          altura: numeroSeguro(item.altura),
          quantidade: numeroSeguro(item.quantidade) || 1,
          precoMetro: numeroSeguro(item.precoMetro),
          valorM2: numeroSeguro(item.precoMetro),
          custoInterno: numeroSeguro(item.custoInterno),
          custoM2: numeroSeguro(item.custoInterno),
          margemMinima: numeroSeguro(item.margemMinima),
          margem,
          lucro,
          medida: item.largura + " x " + item.altura + "m",
          area: area.toFixed(2),
          areaM2: area,
          subtotal: subtotal.toFixed(2),
          valorTotal: subtotal,
          custoPrevisto: custoPrevisto.toFixed(2),
          custoTotal: custoPrevisto,
        };
      });

      const servicoResumo = itensFormatados
        .map((item) => item.servico)
        .filter(Boolean)
        .join(" + ");

      const statusAtualizado = formalizar
        ? orcamentoEditando?.origem === "central_comercial"
          ? "Em orçamento"
          : "Em aprovação"
        : orcamentoEditando?.status || "Rascunho";

      const payload: any = {
        tenantId: orcamentoEditando?.tenantId || auth.currentUser?.uid || "",
        numeroOS,
        clienteId,
        cliente: clienteNome,
        servico: servicoResumo,
        itens: itensFormatados,
        tipoOrcamento: orcamentoEditando?.tipoOrcamento || "Geral",

        tipoServicoFinal,
        precisaInstalacao,
        responsavelInstalacao,

        valorBruto: valorBruto.toFixed(2),
        valorTotal,
        custoTotal: custoCalculado,
        lucro: lucroPrevisto,
        margem: margemPrevista,
        descontoReais: descontoEmReais,
        descontoPercentual: numeroSeguro(descontoPercentual),
        descontoTotal: descontoTotal.toFixed(2),
        valor: valorTotal.toFixed(2),

        enderecoInstalacao,
        dataInstalacao,
        horarioInstalacao,
        observacoesInstalacao,
        observacoes: observacoesInstalacao,

        status: statusAtualizado,
        editavel: !formalizar,

        financeiro: {
          valorBruto,
          valorVenda: valorTotal,
          descontoReais: descontoEmReais,
          descontoPercentual: numeroSeguro(descontoPercentual),
          descontoTotal,
          entrada: valorEntrada,
          saldo: saldoRestante,
          custoPrevisto: custoCalculado,
          custoReal: orcamentoEditando?.financeiro?.custoReal || 0,
          lucroPrevisto,
          lucroReal: orcamentoEditando?.financeiro?.lucroReal || 0,
          margemPrevista,
          margemMinimaExigida,
          margemAbaixoDoMinimo,
          margemReal: orcamentoEditando?.financeiro?.margemReal || 0,
          comissao: orcamentoEditando?.financeiro?.comissao || 0,
          frete: orcamentoEditando?.financeiro?.frete || 0,
          instalacao: orcamentoEditando?.financeiro?.instalacao || 0,
          desperdicio: orcamentoEditando?.financeiro?.desperdicio || 0,
          statusFinanceiro:
            orcamentoEditando?.financeiro?.statusFinanceiro ||
            (valorEntrada > 0 ? "Entrada paga" : "Aguardando pagamento"),
        },

        atualizadoEm: new Date(),
      };

      if (orcamentoEditando?.origem) {
        payload.origem = orcamentoEditando.origem;
      }

      if (orcamentoEditando?.pedidoComercialId) {
        payload.pedidoComercialId = orcamentoEditando.pedidoComercialId;
      }

      if (formalizar) {
        payload.formalizado = true;
        payload.formalizadoEm = new Date();
      }

      if (orcamentoEditando?.id) {
        await updateDoc(doc(db, "orcamentos", orcamentoEditando.id), payload);
      } else {
        payload.criadoEm = new Date();
        const orcamentoRef = await addDoc(collection(db, "orcamentos"), payload);

        if (precisaInstalacao) {
          await addDoc(collection(db, "instalacoes"), {
            tenantId: auth.currentUser?.uid || "",
            numeroOS,
            cliente: clienteNome,
            servico: servicoResumo,
            endereco: enderecoInstalacao,
            data: dataInstalacao,
            horario: horarioInstalacao,
            responsavel: responsavelInstalacao,
            ajudante: "",
            observacoes:
              observacoesInstalacao ||
              "Instalação criada automaticamente pelo orçamento " + numeroOS + ".",
            status: "Aguardando Agendamento",
            finalizado: false,
            origem: "orcamento",
            orcamentoId: orcamentoRef.id,
            criadoEm: new Date(),
          });
        }
      }

      await carregarOrcamentos();

      limparFormulario();
      setMostrarFormulario(false);
      setModalMargemBaixa(false);
      voltarParaTopoListagem(
        formalizar
          ? "Orçamento formalizado com sucesso."
          : orcamentoEditando?.id
            ? "Orçamento atualizado com sucesso."
            : "Orçamento salvo com sucesso."
      );
    } catch (erro) {
      console.error(erro);
      mostrarToast("Não foi possível salvar o orçamento.");
    } finally {
      setSalvandoOrcamento(false);
    }
  }

  async function aprovarOrcamento(orcamento: any) {
    if (aprovandoOrcamentoId) return;

    if (!orcamento?.id || !orcamento?.numeroOS) {
      mostrarToast("Orçamento inválido. Atualize a página e tente novamente.");
      return;
    }

    const confirmar = confirm(
      `Aprovar ${orcamento.numeroOS} e enviar os dados para Aprovação de Arte?`
    );

    if (!confirmar) return;

    try {
      setAprovandoOrcamentoId(orcamento.id);

      const arteExistente = await getDocs(
        query(collection(db, "artes"), where("orcamentoId", "==", orcamento.id), limit(1))
      );

      const aprovadoEm = new Date();
      const clienteAtual = clientes.find((cliente) => cliente.id === orcamento.clienteId);
      const itensArte = montarItensArteDoOrcamento(orcamento);
      const servicos = Array.from(
        new Set(
          itensArte
            .map((item: any) => item.servico || item.material)
            .filter(Boolean)
        )
      );
      const arquivos = [...(orcamento.arquivos || []), ...(orcamento.mockups || [])];

      await updateDoc(doc(db, "orcamentos", orcamento.id), {
        status: "Aprovado",
        aprovadoEm,
        atualizadoEm: new Date(),
      });

      if (arteExistente.empty) {
        await addDoc(collection(db, "artes"), {
          tenantId: orcamento.tenantId || auth.currentUser?.uid || "",
          numeroOS: orcamento.numeroOS,
          orcamentoId: orcamento.id,
          clienteId: orcamento.clienteId || "",
          cliente: orcamento.cliente || clienteAtual?.nome || "",
          telefone: orcamento.telefone || clienteAtual?.telefone || "",
          email: orcamento.email || clienteAtual?.email || "",
          servicos,
          nomeArte: `Arte para ${orcamento.servico || orcamento.numeroOS}`,
          comentario:
            orcamento.observacoes ||
            orcamento.observacoesInstalacao ||
            `Arte criada automaticamente a partir da ${orcamento.numeroOS}.`,
          itens: itensArte,
          itensConferencia: itensArte,
          arquivos,
          mockups: [],
          status: "Aguardando conferência",
          aprovadoPeloCliente: false,
          prioridade: orcamento.prioridade || "Normal",
          prazo: orcamento.prazo || orcamento.dataInstalacao || "",
          tipoOrcamento: orcamento.tipoOrcamento || "Geral",
          acmDetalhes: orcamento.acmDetalhes || null,
          valorTotal: numeroSeguro(
            orcamento.valorTotal ?? orcamento.valor ?? orcamento.financeiro?.valorVenda
          ),
          vendedor: orcamento.vendedor || orcamento.responsavel || "",
          financeiro: orcamento.financeiro || null,
          criadoEm: new Date(),
          orcamentoCriadoEm: orcamento.criadoEm || null,
          aprovadoEm,
          origem: "orcamento",
          historico: [
            {
              tipo: "sistema",
              acao: "Orçamento aprovado e enviado para conferência de arte",
              statusNovo: "Aguardando conferência",
              data: aprovadoEm,
            },
          ],
        });
      } else {
        const arteDoc = arteExistente.docs[0];
        const arteAtual = arteDoc.data();

        await updateDoc(doc(db, "artes", arteDoc.id), {
          tenantId: arteAtual.tenantId || orcamento.tenantId || auth.currentUser?.uid || "",
          numeroOS: arteAtual.numeroOS || orcamento.numeroOS,
          orcamentoId: orcamento.id,
          clienteId: arteAtual.clienteId || orcamento.clienteId || "",
          cliente: arteAtual.cliente || orcamento.cliente || clienteAtual?.nome || "",
          telefone: arteAtual.telefone || orcamento.telefone || clienteAtual?.telefone || "",
          email: arteAtual.email || orcamento.email || clienteAtual?.email || "",
          servicos: arteAtual.servicos?.length ? arteAtual.servicos : servicos,
          nomeArte: arteAtual.nomeArte || `Arte para ${orcamento.servico || orcamento.numeroOS}`,
          comentario:
            arteAtual.comentario ||
            orcamento.observacoes ||
            orcamento.observacoesInstalacao ||
            `Arte criada automaticamente a partir da ${orcamento.numeroOS}.`,
          itens:
            Array.isArray(arteAtual.itens) && arteAtual.itens.length > 0
              ? arteAtual.itens
              : itensArte,
          itensConferencia:
            Array.isArray(arteAtual.itensConferencia) && arteAtual.itensConferencia.length > 0
              ? arteAtual.itensConferencia
              : itensArte,
          arquivos:
            Array.isArray(arteAtual.arquivos) && arteAtual.arquivos.length > 0
              ? arteAtual.arquivos
              : arquivos,
          mockups: arteAtual.mockups || [],
          status:
            arteAtual.status === "Pendente"
              ? "Aguardando conferência"
              : arteAtual.status || "Aguardando conferência",
          aprovadoPeloCliente: Boolean(arteAtual.aprovadoPeloCliente),
          prioridade: arteAtual.prioridade || orcamento.prioridade || "Normal",
          prazo: arteAtual.prazo || orcamento.prazo || orcamento.dataInstalacao || "",
          tipoOrcamento: arteAtual.tipoOrcamento || orcamento.tipoOrcamento || "Geral",
          acmDetalhes: arteAtual.acmDetalhes || orcamento.acmDetalhes || null,
          valorTotal:
            arteAtual.valorTotal ||
            numeroSeguro(orcamento.valorTotal ?? orcamento.valor ?? orcamento.financeiro?.valorVenda),
          vendedor: arteAtual.vendedor || orcamento.vendedor || orcamento.responsavel || "",
          financeiro: arteAtual.financeiro || orcamento.financeiro || null,
          orcamentoCriadoEm: arteAtual.orcamentoCriadoEm || orcamento.criadoEm || null,
          aprovadoEm: arteAtual.aprovadoEm || aprovadoEm,
          origem: arteAtual.origem || "orcamento",
          atualizadoEm: new Date(),
          historico: [
            ...(Array.isArray(arteAtual.historico) ? arteAtual.historico : []),
            {
              tipo: "sistema",
              acao: "Dados do orçamento importados para a arte existente",
              statusNovo:
                arteAtual.status === "Pendente"
                  ? "Aguardando conferência"
                  : arteAtual.status || "Aguardando conferência",
              data: aprovadoEm,
            },
          ],
        });
      }

      mostrarToast(
        arteExistente.empty
          ? "Orçamento aprovado. Arte criada com os dados importados."
          : "Orçamento aprovado. Arte existente atualizada com dados do orçamento."
      );
      await carregarOrcamentos();
      voltarParaTopoListagem(
        arteExistente.empty
          ? "Orçamento aprovado. Arte criada com os dados importados."
          : "Orçamento aprovado. Arte existente atualizada com dados do orçamento."
      );
    } catch (erro) {
      console.error(erro);
      mostrarToast("Erro ao aprovar orçamento e criar arte.");
    } finally {
      setAprovandoOrcamentoId("");
    }
  }

  async function excluirOrcamento(id: string) {
    const confirmar = confirm("Deseja realmente excluir este orçamento?");

    if (!confirmar) return;

    try {
      await deleteDoc(doc(db, "orcamentos", id));
      mostrarToast("Orçamento excluído.");
      await carregarOrcamentos();
    } catch (erro) {
      console.error(erro);
      mostrarToast("Erro ao excluir orçamento.");
    }
  }

  return (
    <AuthGuard>
      <main className="flex min-h-screen bg-zinc-950 text-white">
        <Sidebar />

        <section className="flex-1 p-10">
          <div
            ref={topoListagemRef}
            tabIndex={-1}
            className={`flex items-center justify-between mb-10 rounded-3xl outline-none transition ${
              destaqueTopo ? "bg-emerald-500/10 ring-1 ring-emerald-500/40" : ""
            }`}
          >
            <div>
              <h1 className="text-5xl font-bold">Orçamentos</h1>

              <p className="text-zinc-400">
                Crie orçamentos com múltiplos serviços, desconto inteligente e
                controle de margem.
              </p>
            </div>

            <button
              onClick={() => abrirFormularioOrcamento()}
              className="bg-white text-black px-5 py-3 rounded-xl font-semibold hover:scale-105 transition-all duration-200"
            >
              Novo orçamento
            </button>
          </div>

          {toast && (
            <div className="fixed right-4 top-4 z-50 max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 shadow-2xl">
              {toast}
            </div>
          )}

          <div className="mb-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => abrirFormularioOrcamento()}
              className="rounded-2xl border border-emerald-400 bg-emerald-500/15 px-5 py-3 text-sm font-black text-emerald-300 transition hover:bg-emerald-500/20"
            >
              Novo orçamento
            </button>
          </div>

          {mostrarFormulario && (
            <div className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-emerald-400">Orçamento Geral</p>
                  <h2 className="mt-1 text-2xl font-black">{orcamentoEditando ? "Editar orçamento" : "Novo orçamento rápido"}</h2>
                  <p className="mt-2 max-w-2xl text-sm text-zinc-400">Preencha cliente, material, medida e margem. O sistema calcula área, total, custo e lucro automaticamente.</p>
                </div>
                <button type="button" onClick={() => { limparFormulario(); setMostrarFormulario(false); }} className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-zinc-300 transition hover:bg-zinc-700">Fechar</button>
              </div>

              {orcamentoEditando?.origem === "central_comercial" && (
                <div className="mb-6 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-100">
                  <p className="font-bold text-blue-300">Pedido vindo da Central Comercial.</p>
                  <p className="mt-1 text-zinc-300">Confira os dados antes de formalizar. Ao salvar, o mesmo rascunho será atualizado sem criar duplicidade.</p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                <label className="block lg:col-span-2">
                  <span className="mb-2 block text-xs font-bold text-zinc-500">Cliente</span>
                  <select value={clienteId} onChange={(e) => selecionarCliente(e.target.value)} className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white outline-none focus:border-green-500">
                    <option value="">Selecione um cliente</option>
                    {clientes.map((cliente) => (<option key={cliente.id} value={cliente.id}>{cliente.nome || cliente.razaoSocial || cliente.cliente || "Cliente sem nome"}</option>))}
                  </select>
                </label>

                <label className="block lg:col-span-2">
                  <span className="mb-2 block text-xs font-bold text-zinc-500">Serviço / material</span>
                  <select value={itens[0]?.materialId || ""} onChange={(e) => atualizarItem(0, "materialId", e.target.value)} className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white outline-none focus:border-green-500">
                    <option value="">Selecione o material</option>
                    {materiais.map((material) => (<option key={material.id} value={material.id}>{material.nome || material.material || "Material"} - R$ {Number(material.precoVenda || material.valorM2 || material.precoM2 || 0).toFixed(2)}</option>))}
                  </select>
                </label>

                <label className="block"><span className="mb-2 block text-xs font-bold text-zinc-500">Largura</span><input value={itens[0]?.largura || ""} onChange={(e) => atualizarItem(0, "largura", e.target.value)} placeholder="0,00" className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm outline-none focus:border-green-500" /></label>
                <label className="block"><span className="mb-2 block text-xs font-bold text-zinc-500">Altura</span><input value={itens[0]?.altura || ""} onChange={(e) => atualizarItem(0, "altura", e.target.value)} placeholder="0,00" className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm outline-none focus:border-green-500" /></label>
                <label className="block"><span className="mb-2 block text-xs font-bold text-zinc-500">Quantidade</span><input value={itens[0]?.quantidade || "1"} onChange={(e) => atualizarItem(0, "quantidade", e.target.value)} placeholder="1" className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm outline-none focus:border-green-500" /></label>
                <label className="block"><span className="mb-2 block text-xs font-bold text-zinc-500">Preço por m²</span><input value={itens[0]?.precoMetro || ""} onChange={(e) => atualizarItem(0, "precoMetro", e.target.value)} placeholder="0,00" className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm outline-none focus:border-green-500" /></label>
                <label className="block"><span className="mb-2 block text-xs font-bold text-zinc-500">Margem desejada %</span><input value={itens[0]?.margemMinima || "20"} onChange={(e) => atualizarItem(0, "margemMinima", e.target.value)} placeholder="20" className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm outline-none focus:border-green-500" /></label>
                <label className="block lg:col-span-3"><span className="mb-2 block text-xs font-bold text-zinc-500">Observações</span><textarea value={observacoesInstalacao} onChange={(e) => setObservacoesInstalacao(e.target.value)} placeholder="Observações opcionais do or?amento" className="min-h-24 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm outline-none focus:border-green-500" /></label>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                <MiniResumoAcm titulo="Área" valor={calcularArea(itens[0] || {}).toFixed(2) + " m²"} />
                <MiniResumoAcm titulo="Total" valor={formatarMoeda(calcularSubtotal(itens[0] || {}))} />
                <MiniResumoAcm titulo="Custo" valor={formatarMoeda(calcularCustoItem(itens[0] || {}))} />
                <MiniResumoAcm titulo="Lucro" valor={formatarMoeda(calcularSubtotal(itens[0] || {}) - calcularCustoItem(itens[0] || {}))} />
                <MiniResumoAcm titulo="Margem" valor={margemPrevista.toFixed(1) + "%"} />
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button onClick={() => tentarSalvarOrcamento(false)} disabled={salvandoOrcamento} className="rounded-xl bg-zinc-800 px-5 py-3 text-sm font-black text-zinc-100 transition hover:bg-zinc-700 disabled:opacity-60">{salvandoOrcamento ? "Salvando..." : "Salvar rascunho"}</button>
                <button onClick={() => tentarSalvarOrcamento(true)} disabled={salvandoOrcamento} className="rounded-xl bg-green-500 px-5 py-3 text-sm font-black text-black transition hover:bg-green-400 disabled:opacity-60">Enviar para aprovação</button>
              </div>
            </div>
          )}

          <div className="hidden overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] table-fixed text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-950 text-xs uppercase tracking-wide text-zinc-400">
                  <tr>
                    <th className="w-[150px] px-4 py-3">OS</th>
                    <th className="w-[260px] px-4 py-3">Cliente</th>
                    <th className="w-[260px] px-4 py-3">Serviços</th>
                    <th className="w-[150px] px-4 py-3">Tipo final</th>
                    <th className="w-[110px] px-4 py-3">Instalação</th>
                    <th className="w-[180px] px-4 py-3">Status</th>
                    <th className="w-[260px] px-4 py-3">Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {orcamentos.map((orcamento) => (
                    <tr
                      key={orcamento.id}
                      onClick={() =>
                        ehRascunhoCentral(orcamento)
                          ? abrirFormularioOrcamento(orcamento)
                          : setOrcamentoDetalhe(orcamento)
                      }
                      className="border-t border-zinc-800/80 cursor-pointer transition hover:bg-zinc-800/45"
                    >
                      <td className="px-4 py-4 align-top">
                        <span className="block max-w-[130px] truncate whitespace-nowrap text-sm font-black text-emerald-400">
                          {orcamento.numeroOS || "Sem OS"}
                        </span>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <p className="max-w-[240px] line-clamp-2 text-sm font-bold text-zinc-100">
                          {orcamento.cliente || "Cliente não informado"}
                        </p>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <p className="max-w-[240px] line-clamp-2 text-sm text-zinc-300">
                          {orcamento.servico || "Serviço não informado"}
                        </p>
                      </td>

                      <td className="px-4 py-4 align-top text-xs text-zinc-400">
                        <span className="line-clamp-2">
                          {orcamento.tipoServicoFinal || "Não informado"}
                        </span>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <span className="inline-flex w-fit whitespace-nowrap rounded-full bg-zinc-800 px-3 py-1 text-xs font-bold text-zinc-300">
                          {orcamento.precisaInstalacao ? "Sim" : "Não"}
                        </span>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="flex max-w-[170px] flex-col items-start gap-2">
                          {orcamento.origem === "central_comercial" && (
                            <span className="inline-flex w-fit whitespace-nowrap rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-300">
                              Central Comercial
                            </span>
                          )}

                          <span
                            className={
                              "inline-flex w-fit whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold " +
                              (orcamento.status === "Aprovado"
                                ? "bg-emerald-500/15 text-emerald-300"
                                : ehRascunhoCentral(orcamento)
                                  ? "bg-yellow-500/15 text-yellow-300"
                                  : "bg-zinc-800 text-zinc-300")
                            }
                          >
                            {ehRascunhoCentral(orcamento) ? "Rascunho da Central" : orcamento.status || "Sem status"}
                          </span>
                        </div>
                      </td>

                      <td className="w-[240px] px-4 py-4 align-top">
                        <div className="grid w-[204px] grid-cols-2 gap-2">
                          {ehRascunhoCentral(orcamento) ? (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  abrirFormularioOrcamento(orcamento);
                                }}
                                className="inline-flex h-9 min-w-[96px] items-center justify-center whitespace-nowrap rounded-full bg-blue-600 px-3 text-xs font-bold text-white transition-colors hover:bg-blue-500"
                              >
                                Formalizar
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  abrirFormularioOrcamento(orcamento);
                                }}
                                className="inline-flex h-9 min-w-[96px] items-center justify-center whitespace-nowrap rounded-full bg-zinc-800 px-3 text-xs font-bold text-zinc-100 transition-colors hover:bg-zinc-700"
                              >
                                Editar
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  excluirOrcamento(orcamento.id);
                                }}
                                className="inline-flex h-9 min-w-[96px] items-center justify-center whitespace-nowrap rounded-full bg-red-950/80 px-3 text-xs font-bold text-red-100 transition-colors hover:bg-red-900"
                              >
                                Excluir
                              </button>
                            </>
                          ) : (
                            <>
                              {orcamento.status !== "Aprovado" && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    aprovarOrcamento(orcamento);
                                  }}
                                  disabled={!!aprovandoOrcamentoId}
                                  className="inline-flex h-9 min-w-[96px] items-center justify-center whitespace-nowrap rounded-full bg-emerald-500 px-3 text-xs font-bold text-black transition-colors hover:bg-emerald-400 disabled:opacity-50"
                                >
                                  {aprovandoOrcamentoId === orcamento.id ? "Enviando..." : "Aprovar"}
                                </button>
                              )}

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  abrirFormularioOrcamento(orcamento);
                                }}
                                className="inline-flex h-9 min-w-[96px] items-center justify-center whitespace-nowrap rounded-full bg-zinc-800 px-3 text-xs font-bold text-zinc-100 transition-colors hover:bg-zinc-700"
                              >
                                Editar
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  excluirOrcamento(orcamento.id);
                                }}
                                className="inline-flex h-9 min-w-[96px] items-center justify-center whitespace-nowrap rounded-full bg-red-950/80 px-3 text-xs font-bold text-red-100 transition-colors hover:bg-red-900"
                              >
                                Excluir
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {orcamentos.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-zinc-400">
                        Nenhum orçamento cadastrado ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-3 md:hidden">
            {orcamentos.map((orcamento) => (
              <button
                key={orcamento.id}
                type="button"
                onClick={() =>
                  ehRascunhoCentral(orcamento)
                    ? abrirFormularioOrcamento(orcamento)
                    : setOrcamentoDetalhe(orcamento)
                }
                className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-left transition hover:bg-zinc-800/70"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="max-w-[160px] truncate whitespace-nowrap text-sm font-black text-emerald-400">
                    {orcamento.numeroOS || "Sem OS"}
                  </span>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {orcamento.origem === "central_comercial" && (
                      <span className="w-fit whitespace-nowrap rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-300">
                        Central
                      </span>
                    )}
                    <span className="w-fit whitespace-nowrap rounded-full bg-yellow-500/15 px-3 py-1 text-xs font-bold text-yellow-300">
                      {ehRascunhoCentral(orcamento) ? "Rascunho" : orcamento.status || "Sem status"}
                    </span>
                  </div>
                </div>

                <p className="mt-3 line-clamp-2 text-sm font-bold text-zinc-100">
                  {orcamento.cliente || "Cliente não informado"}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-zinc-400">
                  {orcamento.servico || "Serviço não informado"}
                </p>

                <div className="mt-4 grid gap-2">
                  {ehRascunhoCentral(orcamento) ? (
                    <>
                      <span className="inline-flex h-9 w-full min-w-[96px] items-center justify-center rounded-full bg-blue-600 px-3 text-xs font-bold text-white">
                        Formalizar
                      </span>
                      <span className="inline-flex h-9 w-full min-w-[96px] items-center justify-center rounded-full bg-zinc-800 px-3 text-xs font-bold text-zinc-100">
                        Editar
                      </span>
                    </>
                  ) : (
                    <span className="inline-flex h-9 w-full min-w-[96px] items-center justify-center rounded-full bg-zinc-800 px-3 text-xs font-bold text-zinc-100">
                      Ver detalhes
                    </span>
                  )}
                </div>
              </button>
            ))}

            {orcamentos.length === 0 && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">
                Nenhum orçamento cadastrado ainda.
              </div>
            )}
          </div>

          {orcamentoDetalhe && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="text-green-400 font-semibold">
                      Detalhes do orçamento
                    </p>

                    <h2 className="text-3xl font-black">
                      {orcamentoDetalhe.numeroOS || "Sem OS"}
                    </h2>

                    <p className="text-zinc-400 mt-1">
                      {orcamentoDetalhe.cliente}
                    </p>
                  </div>

                  <button
                    onClick={() => setOrcamentoDetalhe(null)}
                    className="bg-zinc-800 text-zinc-300 px-4 py-2 rounded-xl hover:bg-zinc-700"
                  >
                    Fechar
                  </button>
                </div>

                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 mb-5">
                  <h3 className="text-xl font-bold mb-4">
                    Itens do orçamento
                  </h3>

                  <div className="flex flex-col gap-3">
                    {orcamentoDetalhe.itens?.map(
                      (item: any, index: number) => (
                        <div
                          key={index}
                          className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
                        >
                          <p className="font-bold">{item.servico}</p>

                          <p className="text-zinc-400 text-sm mt-1">
                            Medida: {item.medida} | Área: {item.area} m²
                          </p>

                          <p className="text-green-400 font-bold mt-2">
                            Venda: R$ {item.subtotal}
                          </p>

                          <p className="text-red-300 font-bold mt-1">
                            Custo previsto: R$ {item.custoPrevisto || "0.00"}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5">
                    <p className="text-zinc-400 text-sm">Total do orçamento</p>

                    <p className="text-4xl font-black text-green-400 mt-2">
                      R$ {orcamentoDetalhe.valor}
                    </p>

                    <p className="text-zinc-400 text-sm mt-3">
                      Desconto: R${" "}
                      {Number(
                        orcamentoDetalhe.financeiro?.descontoTotal || 0
                      ).toFixed(2)}
                    </p>
                  </div>

                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5">
                    <p className="text-zinc-400 text-sm">Lucro previsto</p>

                    <p className="text-4xl font-black text-emerald-400 mt-2">
                      R${" "}
                      {Number(
                        orcamentoDetalhe.financeiro?.lucroPrevisto || 0
                      ).toFixed(2)}
                    </p>

                    <p className="text-zinc-400 text-sm mt-2">
                      Margem:{" "}
                      {Number(
                        orcamentoDetalhe.financeiro?.margemPrevista || 0
                      ).toFixed(1)}
                      %
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {modalMargemBaixa && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
              <div className="bg-zinc-900 border border-red-500/30 rounded-3xl p-6 w-full max-w-2xl">
                <p className="text-red-400 font-semibold mb-2">
                  Alerta de margem
                </p>

                <h2 className="text-3xl font-black mb-4">
                  Margem abaixo do mínimo recomendado
                </h2>

                <p className="text-zinc-300 mb-6">
                  O desconto aplicado reduziu a margem deste orçamento abaixo da
                  margem mínima configurada no material.
                </p>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-zinc-500 text-sm">Venda final</p>

                    <p className="text-green-400 text-2xl font-black">
                      R$ {valorTotal.toFixed(2)}
                    </p>
                  </div>

                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-zinc-500 text-sm">Margem atual</p>

                    <p className="text-red-300 text-2xl font-black">
                      {margemPrevista.toFixed(1)}%
                    </p>
                  </div>

                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-zinc-500 text-sm">Margem mínima</p>

                    <p className="text-yellow-300 text-2xl font-black">
                      {margemMinimaExigida.toFixed(1)}%
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setModalMargemBaixa(false)}
                    className="bg-zinc-800 text-zinc-300 px-5 py-3 rounded-xl hover:bg-zinc-700 transition"
                  >
                    Voltar e ajustar
                  </button>

                  <button
                    onClick={() => salvarOrcamento()}
                    className="bg-red-500 text-white px-5 py-3 rounded-xl font-bold hover:bg-red-400 transition"
                  >
                    Salvar mesmo assim
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </AuthGuard>
  );
}

function MiniResumoAcm({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="truncate text-xs font-bold text-zinc-500">{titulo}</p>
      <p className="mt-1 truncate text-sm font-black text-zinc-100">{valor}</p>
    </div>
  );
}
