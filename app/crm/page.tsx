"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

import { db } from "@/app/lib/firebase";

type ItemPreVenda = {
  id: string;
  materialId: string;
  material: string;
  largura: string;
  altura: string;
  quantidade: string;
  valorM2: string;
  custoM2: string;
  margemDesejada: string;
};

function criarItemPreVenda(): ItemPreVenda {
  return {
    id: `item-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    materialId: "",
    material: "",
    largura: "",
    altura: "",
    quantidade: "1",
    valorM2: "",
    custoM2: "",
    margemDesejada: "",
  };
}

export default function CrmPage() {
  const router = useRouter();
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [materiais, setMateriais] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [pedidoDetalhe, setPedidoDetalhe] = useState<any>(null);

  const [busca, setBusca] = useState("");
  const [mostrarTodosStatus, setMostrarTodosStatus] = useState<string | null>(
    null
  );
  const [abaHistorico, setAbaHistorico] = useState(false);
  const [modalFiltro, setModalFiltro] = useState<{
    tipo: "origem" | "vendedor";
    valor: string;
    pedidos: any[];
  } | null>(null);

  const [cnpj, setCnpj] = useState("");
  const [cliente, setCliente] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cep, setCep] = useState("");
  const [numeroEndereco, setNumeroEndereco] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [situacao, setSituacao] = useState("");
  const [analiseRisco, setAnaliseRisco] = useState("");
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [mensagemCnpj, setMensagemCnpj] = useState("");
  const [clienteExistente, setClienteExistente] = useState<any>(null);
  const [servicoInteresse, setServicoInteresse] = useState("");
  const [valorEstimado, setValorEstimado] = useState("");
  const [itensPreVenda, setItensPreVenda] = useState<ItemPreVenda[]>([
    criarItemPreVenda(),
  ]);
  const [transformandoOrcamento, setTransformandoOrcamento] = useState(false);
  const [vendedor, setVendedor] = useState("");
  const [proximoContato, setProximoContato] = useState("");
  const [status, setStatus] = useState("Pedido recebido");
  const [origem, setOrigem] = useState("WhatsApp");
  const [observacoes, setObservacoes] = useState("");
  const [motivoPerda, setMotivoPerda] = useState("");

  const etapasFunil = [
    "Pedido recebido",
    "Pré-orçamento",
    "Orçamento enviado",
    "Aguardando resposta",
    "Fechado",
    "Perdido",
  ];

  const origensPedido = [
    "WhatsApp",
    "Instagram",
    "Google",
    "Indicação",
    "Loja física",
    "Tráfego pago",
    "Site",
    "Outro",
  ];

  const motivosPerda = [
    "Preço alto",
    "Prazo",
    "Concorrente",
    "Cliente sumiu",
    "Sem retorno",
    "Outro",
  ];

  async function carregarPedidos() {
    const querySnapshot = await getDocs(collection(db, "crm"));
    const lista: any[] = [];

    querySnapshot.forEach((documento) => {
      lista.push({
        id: documento.id,
        ...documento.data(),
      });
    });

    setPedidos(lista);
  }

  async function carregarMateriais() {
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

    lista.sort((a, b) =>
      String(a.nome || a.material || "").localeCompare(
        String(b.nome || b.material || ""),
        "pt-BR"
      )
    );

    console.log("Materiais carregados:", lista);
    setMateriais(lista);
  }

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

  useEffect(() => {
    carregarPedidos();
    carregarMateriais();
    carregarClientes();
  }, []);

  useEffect(() => {
    const cnpjLimpo = limparCnpj(cnpj);

    if (cnpjLimpo.length !== 14) {
      setMensagemCnpj("");
      setClienteExistente(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      buscarCnpj(cnpjLimpo);
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [cnpj]);

  function obterTimestamp(data: any) {
    if (!data) return 0;

    if (data.seconds) return data.seconds * 1000;
    if (data.toDate) return data.toDate().getTime();
    if (data instanceof Date) return data.getTime();

    const convertido = new Date(data).getTime();

    return Number.isNaN(convertido) ? 0 : convertido;
  }

  function formatarData(data: any) {
    const timestamp = obterTimestamp(data);

    if (!timestamp) return "Não informado";

    return new Date(timestamp).toLocaleString("pt-BR");
  }

  function formatarValor(valor: any) {
    return `R$ ${Number(valor || 0).toFixed(2)}`;
  }

  function formatarMoeda(valor: any) {
    return Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function parseNumero(valor: any) {
    if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;

    const convertido = Number(
      String(valor || "0")
        .replace(/[^\d,.-]/g, "")
        .replace(/\.(?=\d{3}(,|$))/g, "")
        .replace(",", ".")
    );

    return Number.isFinite(convertido) ? convertido : 0;
  }

  function limparTelefone(telefoneAtual: string) {
    return telefoneAtual.replace(/\D/g, "");
  }

  function limparCnpj(valor: string) {
    return valor.replace(/\D/g, "");
  }

  function nomeMaterial(material: any) {
    return String(material?.nome || material?.material || material?.materialNome || "").trim();
  }

  function valorVendaMaterial(material: any) {
    return parseNumero(
      material?.precoM2 ??
        material?.valorM2 ??
        material?.precoVenda ??
        material?.valorVenda ??
        material?.precoMetro
    );
  }

  function custoMaterial(material: any) {
    return parseNumero(
      material?.custoM2 ??
        material?.custoInterno ??
        material?.custo ??
        material?.valorCusto
    );
  }

  function calcularItem(item: ItemPreVenda) {
    const largura = parseNumero(item.largura);
    const altura = parseNumero(item.altura);
    const quantidade = Math.max(parseNumero(item.quantidade), 0);
    const custoM2 = parseNumero(item.custoM2);
    const margemDesejada = parseNumero(item.margemDesejada);
    const areaM2 = largura * altura * quantidade;
    const custoTotal = areaM2 * custoM2;
    const valorM2Base = parseNumero(item.valorM2);
    const valorTotal =
      margemDesejada > 0 && margemDesejada < 100 && custoTotal > 0
        ? custoTotal / (1 - margemDesejada / 100)
        : areaM2 * valorM2Base;
    const valorM2 = areaM2 > 0 ? valorTotal / areaM2 : valorM2Base;
    const lucro = valorTotal - custoTotal;
    const margemReal = valorTotal > 0 ? (lucro / valorTotal) * 100 : 0;

    return {
      largura,
      altura,
      quantidade,
      areaM2: Number.isFinite(areaM2) ? areaM2 : 0,
      valorM2: Number.isFinite(valorM2) ? valorM2 : 0,
      custoM2,
      custoTotal: Number.isFinite(custoTotal) ? custoTotal : 0,
      valorTotal: Number.isFinite(valorTotal) ? valorTotal : 0,
      lucro: Number.isFinite(lucro) ? lucro : 0,
      margemReal: Number.isFinite(margemReal) ? margemReal : 0,
    };
  }

  async function buscarCnpjLegado() {
    const cnpjLimpo = limparCnpj(cnpj);

    if (cnpjLimpo.length !== 14) {
      alert("Digite um CNPJ válido com 14 números.");
      return;
    }

    try {
      setBuscandoCnpj(true);

      const resposta = await fetch(
        `https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`
      );

      if (!resposta.ok) {
        throw new Error("CNPJ não encontrado.");
      }

      const dados = await resposta.json();

      const enderecoCompleto = `${dados.logradouro || ""}, ${
        dados.numero || ""
      } - ${dados.bairro || ""}, ${dados.municipio || ""} - ${
        dados.uf || ""
      }, CEP: ${dados.cep || ""}`;

      setEmpresa(dados.nome_fantasia || dados.razao_social || "");
      setCliente(dados.razao_social || "");
      setTelefone(dados.ddd_telefone_1 || "");
      setEmail(dados.email || "");
      setEndereco(enderecoCompleto);
      setSituacao(dados.descricao_situacao_cadastral || "");

      if (dados.descricao_situacao_cadastral === "ATIVA") {
        setAnaliseRisco("Baixo risco cadastral");
      } else {
        setAnaliseRisco("Atenção: situação cadastral exige verificação");
      }
    } catch (error) {
      console.error(error);
      alert("Não foi possível consultar este CNPJ.");
      setSituacao("Não encontrado");
      setAnaliseRisco("Verificar manualmente");
    } finally {
      setBuscandoCnpj(false);
    }
  }

  void buscarCnpjLegado;

  async function buscarCnpj(cnpjInformado?: string) {
    const cnpjLimpo = cnpjInformado || limparCnpj(cnpj);

    console.log("CNPJ digitado:", cnpjLimpo);

    if (cnpjLimpo.length !== 14 || buscandoCnpj) {
      return;
    }

    try {
      setBuscandoCnpj(true);
      setMensagemCnpj("Buscando CNPJ...");

      const resposta = await fetch(
        `https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`
      );

      if (!resposta.ok) {
        setMensagemCnpj("CNPJ não encontrado. Preencha manualmente.");
        return;
      }

      const dados = await resposta.json();
      const enderecoCompleto = [
        dados.logradouro,
        dados.numero,
        dados.bairro,
      ]
        .filter(Boolean)
        .join(", ");

      setEmpresa(dados.nome_fantasia || dados.razao_social || "");
      setCliente(dados.razao_social || "");
      setCnpj(dados.cnpj || cnpjLimpo);
      setTelefone(dados.ddd_telefone_1 || "");
      setEmail(dados.email || "");
      setEndereco(enderecoCompleto);
      setCep(dados.cep || "");
      setNumeroEndereco(dados.numero || "");
      setBairro(dados.bairro || "");
      setCidade(dados.municipio || "");
      setUf(dados.uf || "");
      setSituacao(dados.descricao_situacao_cadastral || "");
      setMensagemCnpj("Dados do CNPJ carregados com sucesso.");

      if (dados.descricao_situacao_cadastral === "ATIVA") {
        setAnaliseRisco("Baixo risco cadastral");
      } else {
        setAnaliseRisco("Atenção: situação cadastral exige verificação");
      }

      const clienteEncontrado = clientes.find((item) => {
        const documento = limparCnpj(
          item.cpfCnpj || item.cnpj || item.documento || ""
        );

        return documento === cnpjLimpo;
      });

      setClienteExistente(clienteEncontrado || null);
      console.log("Cliente carregado:", clienteEncontrado || dados);
    } catch (error) {
      console.error(error);
      setMensagemCnpj("Não foi possível consultar agora. Preencha manualmente.");
    } finally {
      setBuscandoCnpj(false);
    }
  }

  function diasSemMovimento(pedido: any) {
    const base = pedido.atualizadoEm || pedido.criadoEm;
    const timestamp = obterTimestamp(base);

    if (!timestamp) return 0;

    return Math.floor((Date.now() - timestamp) / 1000 / 60 / 60 / 24);
  }

  function pedidoParado(pedido: any) {
    if (pedido.status === "Fechado" || pedido.status === "Perdido") {
      return false;
    }

    return diasSemMovimento(pedido) >= 3;
  }

  function pedidosOrdenados(lista: any[]) {
    return [...lista].sort((a, b) => {
      return (
        obterTimestamp(b.atualizadoEm || b.criadoEm) -
        obterTimestamp(a.atualizadoEm || a.criadoEm)
      );
    });
  }

  const pedidosFiltrados = useMemo(() => {
    return pedidos.filter((pedido) => {
      if (pedido.oculto) {
        return false;
      }

      const termo = busca.toLowerCase();

      if (!termo) return true;

      return (
        String(pedido.cliente || "").toLowerCase().includes(termo) ||
        String(pedido.telefone || "").toLowerCase().includes(termo) ||
        String(pedido.servicoInteresse || "").toLowerCase().includes(termo) ||
        String(pedido.vendedor || "").toLowerCase().includes(termo) ||
        String(pedido.origem || "").toLowerCase().includes(termo)
      );
    });
  }, [pedidos, busca]);

  const pedidosHistorico = pedidos.filter((pedido) => {
    return (
      pedido.oculto ||
      pedido.status === "Convertido em orçamento" ||
      pedido.status === "Perdido"
    );
  });

  const pedidosParados = pedidosFiltrados.filter((pedido) =>
    pedidoParado(pedido)
  );

  const itensCalculados = useMemo(() => {
    return itensPreVenda.map((item) => ({
      ...item,
      calculo: calcularItem(item),
    }));
  }, [itensPreVenda]);

  const resumoPreVenda = useMemo(() => {
    const areaTotal = itensCalculados.reduce(
      (total, item) => total + item.calculo.areaM2,
      0
    );
    const custoTotal = itensCalculados.reduce(
      (total, item) => total + item.calculo.custoTotal,
      0
    );
    const vendaTotal = itensCalculados.reduce(
      (total, item) => total + item.calculo.valorTotal,
      0
    );
    const lucroTotal = vendaTotal - custoTotal;
    const margemMedia = vendaTotal > 0 ? (lucroTotal / vendaTotal) * 100 : 0;

    return {
      areaTotal,
      custoTotal,
      vendaTotal,
      lucroTotal,
      margemMedia,
    };
  }, [itensCalculados]);

  const valorEmNegociacao = pedidosFiltrados
    .filter(
      (pedido) => pedido.status !== "Fechado" && pedido.status !== "Perdido"
    )
    .reduce((total, pedido) => total + Number(pedido.valorEstimado || 0), 0);

  const totalFechado = pedidosFiltrados
    .filter((pedido) => pedido.status === "Fechado")
    .reduce((total, pedido) => total + Number(pedido.valorEstimado || 0), 0);

  const totalPerdido = pedidosFiltrados
    .filter((pedido) => pedido.status === "Perdido")
    .reduce((total, pedido) => total + Number(pedido.valorEstimado || 0), 0);

  const taxaConversao =
    pedidosFiltrados.length > 0
      ? (pedidosFiltrados.filter((pedido) => pedido.status === "Fechado")
          .length /
          pedidosFiltrados.length) *
        100
      : 0;

  const rankingOrigens = useMemo(() => {
    const mapa: Record<
      string,
      {
        origem: string;
        quantidade: number;
        valor: number;
        fechados: number;
      }
    > = {};

    pedidosFiltrados.forEach((pedido) => {
      const origemAtual = pedido.origem || "Não informado";

      if (!mapa[origemAtual]) {
        mapa[origemAtual] = {
          origem: origemAtual,
          quantidade: 0,
          valor: 0,
          fechados: 0,
        };
      }

      mapa[origemAtual].quantidade += 1;
      mapa[origemAtual].valor += Number(pedido.valorEstimado || 0);

      if (pedido.status === "Fechado") {
        mapa[origemAtual].fechados += 1;
      }
    });

    return Object.values(mapa).sort((a, b) => b.valor - a.valor);
  }, [pedidosFiltrados]);

  const rankingVendedores = useMemo(() => {
    const mapa: Record<
      string,
      {
        vendedor: string;
        quantidade: number;
        valor: number;
        fechados: number;
        valorFechado: number;
      }
    > = {};

    pedidosFiltrados.forEach((pedido) => {
      const vendedorAtual = pedido.vendedor || "Não informado";

      if (!mapa[vendedorAtual]) {
        mapa[vendedorAtual] = {
          vendedor: vendedorAtual,
          quantidade: 0,
          valor: 0,
          fechados: 0,
          valorFechado: 0,
        };
      }

      mapa[vendedorAtual].quantidade += 1;
      mapa[vendedorAtual].valor += Number(pedido.valorEstimado || 0);

      if (pedido.status === "Fechado") {
        mapa[vendedorAtual].fechados += 1;
        mapa[vendedorAtual].valorFechado += Number(pedido.valorEstimado || 0);
      }
    });

    return Object.values(mapa).sort((a, b) => b.valorFechado - a.valorFechado);
  }, [pedidosFiltrados]);

  function atualizarItemPreVenda(
    id: string,
    campo: keyof ItemPreVenda,
    valor: string
  ) {
    setItensPreVenda((listaAtual) =>
      listaAtual.map((item) => {
        if (item.id !== id) return item;

        if (campo === "materialId") {
          const materialSelecionado = materiais.find(
            (material) => material.id === valor
          );

          return {
            ...item,
            materialId: valor,
            material: nomeMaterial(materialSelecionado),
            valorM2: String(valorVendaMaterial(materialSelecionado) || ""),
            custoM2: String(custoMaterial(materialSelecionado) || ""),
          };
        }

        return {
          ...item,
          [campo]: valor,
        };
      })
    );
  }

  function adicionarItemPreVenda() {
    setItensPreVenda((listaAtual) => [...listaAtual, criarItemPreVenda()]);
  }

  function removerItemPreVenda(id: string) {
    setItensPreVenda((listaAtual) =>
      listaAtual.length > 1
        ? listaAtual.filter((item) => item.id !== id)
        : listaAtual
    );
  }

  function duplicarItemPreVenda(item: ItemPreVenda) {
    setItensPreVenda((listaAtual) => [
      ...listaAtual,
      {
        ...item,
        id: criarItemPreVenda().id,
      },
    ]);
  }

  function validarPreVenda() {
    if (!cliente.trim()) return "Informe o cliente antes de transformar em orçamento.";
    if (itensPreVenda.length === 0) return "Adicione pelo menos um item.";

    const itemInvalido = itensCalculados.some((item) => {
      return (
        !item.material.trim() ||
        item.calculo.largura <= 0 ||
        item.calculo.altura <= 0 ||
        item.calculo.quantidade <= 0 ||
        item.calculo.valorM2 < 0 ||
        !Number.isFinite(item.calculo.areaM2) ||
        !Number.isFinite(item.calculo.valorTotal)
      );
    });

    if (itemInvalido) {
      return "Preencha material, largura e altura antes de transformar em orçamento.";
    }

    return "";
  }

  async function criarOuEncontrarCliente() {
    if (clienteExistente?.id) return clienteExistente.id;

    const cnpjLimpo = limparCnpj(cnpj);
    const telefoneLimpo = limparTelefone(telefone);
    const clienteEncontrado = clientes.find((item) => {
      const documento = limparCnpj(item.cpfCnpj || item.cnpj || item.documento || "");
      const telefoneCliente = limparTelefone(item.telefone || item.whatsapp || "");

      return (
        (cnpjLimpo.length === 14 && documento === cnpjLimpo) ||
        (telefoneLimpo && telefoneCliente === telefoneLimpo)
      );
    });

    if (clienteEncontrado?.id) return clienteEncontrado.id;

    const clienteRef = await addDoc(collection(db, "clientes"), {
      nome: cliente.trim(),
      razaoSocial: cliente.trim(),
      nomeFantasia: empresa.trim(),
      empresa: empresa.trim(),
      tipoDocumento: cnpjLimpo.length === 14 ? "CNPJ" : "",
      cpfCnpj: cnpj,
      cnpj,
      telefone,
      whatsapp: telefone,
      email,
      cep,
      endereco,
      numero: numeroEndereco,
      bairro,
      cidade,
      uf,
      situacaoCadastral: situacao,
      observacoes,
      origem: origem || "Central Comercial",
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    });

    return clienteRef.id;
  }

  async function salvarPedido() {
    if (!cliente || !telefone) {
      alert("Preencha pelo menos cliente e telefone.");
      return;
    }

    await addDoc(collection(db, "crm"), {
      cnpj,
      cliente,
      empresa,
      telefone,
      email,
      endereco,
      cep,
      numeroEndereco,
      bairro,
      cidade,
      uf,
      situacao,
      analiseRisco,
      servicoInteresse,
      valorEstimado: resumoPreVenda.vendaTotal || Number(valorEstimado || 0),
      itensPreVenda: itensCalculados.map((item) => ({
        id: item.id,
        materialId: item.materialId,
        material: item.material,
        largura: item.largura,
        altura: item.altura,
        quantidade: item.quantidade,
        areaM2: item.calculo.areaM2,
        valorM2: item.calculo.valorM2,
        custoM2: item.calculo.custoM2,
        valorTotal: item.calculo.valorTotal,
        custoTotal: item.calculo.custoTotal,
        lucro: item.calculo.lucro,
        margemReal: item.calculo.margemReal,
        margemDesejada: item.margemDesejada,
      })),
      resumoPreVenda,
      vendedor,
      proximoContato,
      status,
      origem,
      motivoPerda: status === "Perdido" ? motivoPerda : "",
      observacoes,
      historico: [
        {
          status,
          acao: "Pedido comercial criado",
          data: new Date(),
        },
      ],
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    });

    limparFormulario();
    setMostrarFormulario(false);

    await carregarPedidos();
  }

  function limparFormulario() {
    setCnpj("");
    setCliente("");
    setEmpresa("");
    setTelefone("");
    setEmail("");
    setEndereco("");
    setCep("");
    setNumeroEndereco("");
    setBairro("");
    setCidade("");
    setUf("");
    setSituacao("");
    setAnaliseRisco("");
    setMensagemCnpj("");
    setClienteExistente(null);
    setServicoInteresse("");
    setValorEstimado("");
    setItensPreVenda([criarItemPreVenda()]);
    setVendedor("");
    setProximoContato("");
    setStatus("Pedido recebido");
    setOrigem("WhatsApp");
    setMotivoPerda("");
    setObservacoes("");
  }

  async function alterarStatus(pedido: any, novoStatus: string) {
    let motivo = pedido.motivoPerda || "";

    if (novoStatus === "Perdido") {
      const motivoSelecionado = prompt(
        "Motivo da perda: Preço alto, Prazo, Concorrente, Cliente sumiu, Sem retorno ou Outro"
      );

      motivo = motivoSelecionado || "Não informado";
    }

    await updateDoc(doc(db, "crm", pedido.id), {
      status: novoStatus,
      motivoPerda: novoStatus === "Perdido" ? motivo : "",
      atualizadoEm: new Date(),
      historico: [
        ...(pedido.historico || []),
        {
          status: novoStatus,
          acao:
            novoStatus === "Perdido"
              ? `Status alterado para Perdido. Motivo: ${motivo}`
              : `Status alterado para ${novoStatus}`,
          data: new Date(),
        },
      ],
    });

    await carregarPedidos();
  }

  async function excluirPedido(id: string) {
    const confirmar = confirm("Deseja realmente excluir este pedido comercial?");

    if (!confirmar) return;

    await deleteDoc(doc(db, "crm", id));

    await carregarPedidos();
  }

  function enviarWhatsApp(pedido: any) {
    const telefoneLimpo = limparTelefone(pedido.telefone || "");

    if (!telefoneLimpo) {
      alert("Este pedido não possui telefone cadastrado.");
      return;
    }

    const telefoneBrasil = telefoneLimpo.startsWith("55")
      ? telefoneLimpo
      : `55${telefoneLimpo}`;

    const mensagem = `Olá, ${pedido.cliente}! Tudo bem?

Passando para dar continuidade ao seu atendimento sobre:
${pedido.servicoInteresse || "serviço solicitado"}.

Podemos seguir com o orçamento ou tirar alguma dúvida?`;

    const url = `https://wa.me/${telefoneBrasil}?text=${encodeURIComponent(
      mensagem
    )}`;

    window.open(url, "_blank");
  }

  function enviarResumoOrcamentoWhatsApp(pedido: any) {
    const telefoneLimpo = limparTelefone(pedido.telefone || "");

    if (!telefoneLimpo) {
      alert("Este pedido não possui telefone cadastrado.");
      return;
    }

    const telefoneBrasil = telefoneLimpo.startsWith("55")
      ? telefoneLimpo
      : `55${telefoneLimpo}`;

    const mensagem = `Olá, ${pedido.cliente}! Tudo bem?

Segue o resumo do atendimento:

Serviço solicitado: ${pedido.servicoInteresse || "Serviço solicitado"}
Valor previsto: ${formatarValor(pedido.valorEstimado)}
Origem do pedido: ${pedido.origem || "Não informado"}

Fico à disposição para ajustar qualquer detalhe.`;

    const url = `https://wa.me/${telefoneBrasil}?text=${encodeURIComponent(
      mensagem
    )}`;

    window.open(url, "_blank");
  }

  async function transformarEmOrcamentoLegado(pedido: any) {
    if (pedido.orcamentoId) {
      alert(`Este pedido já foi transformado em orçamento: ${pedido.numeroOS}`);
      return;
    }

    const confirmar = confirm(
      "Deseja transformar este pedido comercial em orçamento?"
    );

    if (!confirmar) return;

    const numeroOS = `OS-${Date.now()}`;
    let clienteId = pedido.clienteId || "";

    if (!clienteId) {
      const cnpjLimpo = limparCnpj(pedido.cnpj || "");
      const telefoneLimpo = limparTelefone(pedido.telefone || "");

      let clienteEncontrado: any = null;

      if (cnpjLimpo.length === 14) {
        const clientesCnpjSnapshot = await getDocs(
          query(collection(db, "clientes"), where("cnpj", "==", pedido.cnpj))
        );

        if (!clientesCnpjSnapshot.empty) {
          clienteEncontrado = {
            id: clientesCnpjSnapshot.docs[0].id,
            ...clientesCnpjSnapshot.docs[0].data(),
          };
        }
      }

      if (!clienteEncontrado && telefoneLimpo) {
        const clientesTelefoneSnapshot = await getDocs(
          query(collection(db, "clientes"), where("telefone", "==", pedido.telefone))
        );

        if (!clientesTelefoneSnapshot.empty) {
          clienteEncontrado = {
            id: clientesTelefoneSnapshot.docs[0].id,
            ...clientesTelefoneSnapshot.docs[0].data(),
          };
        }
      }

      if (clienteEncontrado) {
        clienteId = clienteEncontrado.id;
      } else {
        const clienteRef = await addDoc(collection(db, "clientes"), {
          cnpj: pedido.cnpj || "",
          nome: pedido.cliente,
          empresa: pedido.empresa || "",
          telefone: pedido.telefone,
          email: pedido.email || "",
          endereco: pedido.endereco || "",
          situacao: pedido.situacao || "",
          analiseRisco: pedido.analiseRisco || "",
          origem: pedido.origem || "",
          criadoEm: new Date(),
        });

        clienteId = clienteRef.id;
      }
    }

    const valor = Number(pedido.valorEstimado || 0);

    const orcamentoRef = await addDoc(collection(db, "orcamentos"), {
      numeroOS,
      clienteId,
      cliente: pedido.cliente,
      telefone: pedido.telefone,
      origem: "central-comercial",
      pedidoComercialId: pedido.id,
      servico: pedido.servicoInteresse || "Serviço solicitado",
      itens: [
        {
          materialId: "",
          servico: pedido.servicoInteresse || "Serviço solicitado",
          largura: 0,
          altura: 0,
          medida: "A definir",
          area: 0,
          precoMetro: valor,
          custoInterno: 0,
          margemMinima: 20,
          subtotal: valor,
        },
      ],
      valor,
      financeiro: {
        valorVenda: valor,
        entrada: 0,
        saldo: valor,
        custoPrevisto: 0,
        lucroPrevisto: valor,
        margemPrevista: valor > 0 ? 100 : 0,
        lucroReal: 0,
        margemReal: 0,
        statusFinanceiro: "Aguardando pagamento",
      },
      status: "Pendente",
      observacoes: pedido.observacoes || "",
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    });

    await updateDoc(doc(db, "crm", pedido.id), {
      status: "Convertido em orçamento",
      oculto: true,
      orcamentoId: orcamentoRef.id,
      clienteId,
      numeroOS,
      atualizadoEm: new Date(),
      historico: [
        ...(pedido.historico || []),
        {
          status: "Convertido em orçamento",
          acao: `Pedido transformado no orçamento ${numeroOS}.`,
          data: new Date(),
        },
      ],
    });

    await carregarPedidos();

    alert(`Orçamento ${numeroOS} criado com sucesso.`);
  }

  void transformarEmOrcamentoLegado;

  async function transformarEmOrcamento(pedido?: any) {
    if (transformandoOrcamento) return;

    const origemFormulario = !pedido;
    const pedidoBase = pedido || {
      cnpj,
      cliente,
      empresa,
      telefone,
      email,
      endereco,
      cep,
      numeroEndereco,
      bairro,
      cidade,
      uf,
      situacao,
      analiseRisco,
      servicoInteresse,
      valorEstimado: resumoPreVenda.vendaTotal || Number(valorEstimado || 0),
      vendedor,
      proximoContato,
      status,
      origem,
      observacoes,
      itensPreVenda: itensCalculados,
      resumoPreVenda,
      historico: [],
    };

    if (pedidoBase.orcamentoId) {
      alert(`Este pedido já foi transformado em orçamento: ${pedidoBase.numeroOS}`);
      return;
    }

    const itensOrigem =
      Array.isArray(pedidoBase.itensPreVenda) && pedidoBase.itensPreVenda.length > 0
        ? pedidoBase.itensPreVenda
        : origemFormulario
        ? itensCalculados
        : [
            {
              id: "item-legacy-1",
              materialId: "",
              material: pedidoBase.servicoInteresse || "Serviço solicitado",
              servico: pedidoBase.servicoInteresse || "Serviço solicitado",
              largura: "1",
              altura: "1",
              quantidade: "1",
              valorM2: String(Number(pedidoBase.valorEstimado || 0)),
              custoM2: "0",
              margemDesejada: "",
            },
          ];
    const itensParaOrcamento = itensOrigem.map((item: any, index: number) => {
      const calculo = item.calculo || calcularItem(item);
      const materialNome = item.material || item.servico || `Item ${index + 1}`;

      return {
        id: item.id || `item-${index + 1}`,
        materialId: item.materialId || "",
        material: materialNome,
        servico: materialNome,
        largura: String(item.largura || ""),
        altura: String(item.altura || ""),
        quantidade: calculo.quantidade || parseNumero(item.quantidade) || 1,
        medida:
          calculo.largura > 0 && calculo.altura > 0
            ? `${String(item.largura || calculo.largura)} x ${String(item.altura || calculo.altura)}m`
            : "A definir",
        area: Number(calculo.areaM2.toFixed(2)),
        areaM2: Number(calculo.areaM2.toFixed(2)),
        precoMetro: Number(calculo.valorM2.toFixed(2)),
        valorM2: Number(calculo.valorM2.toFixed(2)),
        custoInterno: Number(calculo.custoM2.toFixed(2)),
        custoM2: Number(calculo.custoM2.toFixed(2)),
        custoPrevisto: Number(calculo.custoTotal.toFixed(2)),
        subtotal: Number(calculo.valorTotal.toFixed(2)),
        lucroPrevisto: Number(calculo.lucro.toFixed(2)),
        margemPrevista: Number(calculo.margemReal.toFixed(2)),
        margemMinima: parseNumero(item.margemDesejada) || 20,
      };
    });

    const erroValidacao = origemFormulario
      ? validarPreVenda()
      : itensParaOrcamento.some(
          (item: any) =>
            !item.material ||
            parseNumero(item.largura) <= 0 ||
            parseNumero(item.altura) <= 0 ||
            parseNumero(item.quantidade) <= 0
        )
      ? "Preencha material, largura e altura antes de transformar em orçamento."
      : "";

    if (erroValidacao) {
      alert(erroValidacao);
      return;
    }

    const confirmar = confirm("Transformar esta pré-venda em orçamento rascunho?");
    if (!confirmar) return;

    try {
      setTransformandoOrcamento(true);

      const clienteId = pedidoBase.clienteId || (await criarOuEncontrarCliente());
      const numeroOS = `OS-${Date.now()}`;
      const vendaTotal = itensParaOrcamento.reduce(
        (total: number, item: any) => total + parseNumero(item.subtotal),
        0
      );
      const custoTotal = itensParaOrcamento.reduce(
        (total: number, item: any) => total + parseNumero(item.custoPrevisto),
        0
      );
      const lucroTotal = vendaTotal - custoTotal;
      const margemMedia = vendaTotal > 0 ? (lucroTotal / vendaTotal) * 100 : 0;
      const servicoResumo =
        pedidoBase.servicoInteresse ||
        itensParaOrcamento.map((item: any) => item.servico).filter(Boolean).join(" + ") ||
        "Pré-venda comercial";
      const payload = {
        numeroOS,
        clienteId,
        cliente: pedidoBase.cliente || cliente,
        telefone: pedidoBase.telefone || telefone,
        email: pedidoBase.email || email,
        endereco: pedidoBase.endereco || endereco,
        cidade: pedidoBase.cidade || cidade,
        uf: pedidoBase.uf || uf,
        servico: servicoResumo,
        itens: itensParaOrcamento,
        origem: "central_comercial",
        pedidoComercialId: pedidoBase.id || "",
        tipoOrcamento: "Geral",
        status: "Rascunho",
        editavel: true,
        valor: vendaTotal.toFixed(2),
        valorTotal: vendaTotal,
        valorBruto: vendaTotal.toFixed(2),
        descontoReais: 0,
        descontoPercentual: 0,
        descontoTotal: "0.00",
        observacoes: pedidoBase.observacoes || observacoes,
        vendedor: pedidoBase.vendedor || vendedor,
        financeiro: {
          valorBruto: vendaTotal,
          valorVenda: vendaTotal,
          descontoReais: 0,
          descontoPercentual: 0,
          descontoTotal: 0,
          entrada: 0,
          saldo: vendaTotal,
          custoPrevisto: custoTotal,
          custoReal: 0,
          lucroPrevisto: lucroTotal,
          lucroReal: 0,
          margemPrevista: margemMedia,
          margemMinimaExigida: 20,
          margemAbaixoDoMinimo: margemMedia < 20,
          margemReal: 0,
          statusFinanceiro: "Aguardando pagamento",
        },
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      };

      console.log("Itens calculados:", itensParaOrcamento);
      console.log("Payload orçamento:", payload);

      const orcamentoRef = await addDoc(collection(db, "orcamentos"), payload);

      if (!pedidoBase.id && origemFormulario) {
        await addDoc(collection(db, "crm"), {
          ...pedidoBase,
          clienteId,
          valorEstimado: vendaTotal,
          status: "Convertido em orçamento",
          oculto: true,
          orcamentoId: orcamentoRef.id,
          numeroOS,
          criadoEm: new Date(),
          atualizadoEm: new Date(),
          historico: [
            {
              status: "Convertido em orçamento",
              acao: `Pré-venda transformada no orçamento ${numeroOS}.`,
              data: new Date(),
            },
          ],
        });
      } else if (pedidoBase.id) {
        await updateDoc(doc(db, "crm", pedidoBase.id), {
          clienteId,
          status: "Convertido em orçamento",
          oculto: true,
          orcamentoId: orcamentoRef.id,
          numeroOS,
          atualizadoEm: new Date(),
          historico: [
            ...(pedidoBase.historico || []),
            {
              status: "Convertido em orçamento",
              acao: `Pedido transformado no orçamento ${numeroOS}.`,
              data: new Date(),
            },
          ],
        });
      }

      limparFormulario();
      setMostrarFormulario(false);
      await carregarPedidos();
      router.push(`/orcamentos?orcamentoId=${orcamentoRef.id}`);
    } catch (erro) {
      console.error(erro);
      alert("Não foi possível transformar a pré-venda em orçamento.");
    } finally {
      setTransformandoOrcamento(false);
    }
  }

  function abrirModalFiltro(tipo: "origem" | "vendedor", valor: string) {
    const lista = pedidos.filter((pedido) => {
      if (tipo === "origem") {
        return (pedido.origem || "Não informado") === valor;
      }

      return (pedido.vendedor || "Não informado") === valor;
    });

    setModalFiltro({
      tipo,
      valor,
      pedidos: lista,
    });
  }

  return (
    <AuthGuard>
      <main className="flex min-h-screen bg-zinc-950 text-white">
        <Sidebar />

        <section className="flex-1 p-10">
          <div className="flex items-start justify-between gap-6 mb-10">
            <div>
              <p className="text-green-400 font-semibold mb-2">
                Controle comercial da gráfica
              </p>

              <h1 className="text-5xl font-black mb-3">
                Central Comercial
              </h1>

              <p className="text-zinc-400 max-w-4xl">
                Controle pedidos recebidos, origem do atendimento, vendedor,
                valor em negociação, follow-up e conversão comercial.
              </p>
            </div>

            <button
              onClick={() => setMostrarFormulario(true)}
              className="bg-green-500 text-black px-5 py-3 rounded-xl font-bold hover:bg-green-400 transition"
            >
              Novo pedido
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5 mb-8">
            <CardComercial
              titulo="Pedidos"
              valor={pedidosFiltrados.length.toString()}
              cor="text-white"
            />

            <CardComercial
              titulo="Em negociação"
              valor={formatarValor(valorEmNegociacao)}
              cor="text-yellow-300"
            />

            <CardComercial
              titulo="Fechado"
              valor={formatarValor(totalFechado)}
              cor="text-green-400"
            />

            <CardComercial
              titulo="Perdido"
              valor={formatarValor(totalPerdido)}
              cor="text-red-300"
            />

            <CardComercial
              titulo="Conversão"
              valor={`${taxaConversao.toFixed(1)}%`}
              cor="text-purple-300"
            />
          </div>

          {pedidosParados.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-3xl p-5 mb-8">
              <p className="text-red-300 font-black text-xl">
                ⚠ Pedidos parados há mais de 3 dias
              </p>

              <p className="text-zinc-300 mt-2">
                Existem oportunidades comerciais sem movimentação. Faça follow-up
                antes de perder o cliente.
              </p>

              <div className="flex flex-wrap gap-2 mt-4">
                {pedidosParados.slice(0, 8).map((pedido) => (
                  <span
                    key={pedido.id}
                    className="bg-zinc-950 border border-red-500/30 text-red-300 px-3 py-1 rounded-full text-sm font-bold"
                  >
                    {pedido.cliente} • {diasSemMovimento(pedido)} dias
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
              <h2 className="text-2xl font-black mb-4">
                Origem dos pedidos
              </h2>

              <div className="flex flex-col gap-3">
                {rankingOrigens.slice(0, 5).map((item) => (
                  <button
                    key={item.origem}
                    onClick={() => abrirModalFiltro("origem", item.origem)}
                    className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between text-left hover:border-green-500 transition"
                  >
                    <div>
                      <p className="font-bold">{item.origem}</p>
                      <p className="text-zinc-500 text-sm">
                        {item.quantidade} pedidos • {item.fechados} fechados
                      </p>
                    </div>

                    <p className="text-green-400 font-black">
                      {formatarValor(item.valor)}
                    </p>
                  </button>
                ))}

                {rankingOrigens.length === 0 && (
                  <p className="text-zinc-500">
                    Nenhuma origem registrada ainda.
                  </p>
                )}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
              <h2 className="text-2xl font-black mb-4">
                Vendedores
              </h2>

              <div className="flex flex-col gap-3">
                {rankingVendedores.slice(0, 5).map((item) => (
                  <button
                    key={item.vendedor}
                    onClick={() => abrirModalFiltro("vendedor", item.vendedor)}
                    className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between text-left hover:border-green-500 transition"
                  >
                    <div>
                      <p className="font-bold">{item.vendedor}</p>
                      <p className="text-zinc-500 text-sm">
                        {item.quantidade} pedidos • {item.fechados} fechados
                      </p>
                    </div>

                    <p className="text-green-400 font-black">
                      {formatarValor(item.valorFechado)}
                    </p>
                  </button>
                ))}

                {rankingVendedores.length === 0 && (
                  <p className="text-zinc-500">
                    Nenhum vendedor registrado ainda.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 mb-8">
            <input
              placeholder="Pesquisar por cliente, telefone, serviço, origem ou vendedor"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3"
            />
          </div>

          {mostrarFormulario && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 mb-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black">
                  Novo pedido comercial
                </h2>

                <button
                  onClick={() => setMostrarFormulario(false)}
                  className="bg-zinc-800 text-zinc-300 px-4 py-2 rounded-xl hover:bg-zinc-700"
                >
                  Fechar
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 grid grid-cols-[1fr_auto] gap-3">
                  <input
                    placeholder="CNPJ"
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
                  />

                  <button
                    onClick={() => buscarCnpj()}
                    disabled={buscandoCnpj}
                    className="bg-blue-500 text-white px-5 py-3 rounded-xl font-bold hover:bg-blue-400 transition disabled:opacity-50"
                  >
                    {buscandoCnpj ? "Buscando..." : "Buscar CNPJ"}
                  </button>
                </div>

                {mensagemCnpj && (
                  <div className="col-span-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">
                    {mensagemCnpj}
                  </div>
                )}

                {clienteExistente && (
                  <div className="col-span-2 rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-300">
                    Cliente já cadastrado encontrado:{" "}
                    <strong>
                      {clienteExistente.nome ||
                        clienteExistente.razaoSocial ||
                        clienteExistente.cliente}
                    </strong>
                    . Os dados serão vinculados ao cadastro existente.
                  </div>
                )}

                <input
                  placeholder="Nome / razão social"
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
                />

                <input
                  placeholder="Empresa / nome fantasia"
                  value={empresa}
                  onChange={(e) => setEmpresa(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
                />

                <input
                  placeholder="Telefone / WhatsApp"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
                />

                <input
                  placeholder="E-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
                />

                <input
                  placeholder="Endereço"
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 col-span-2"
                />

                <input
                  placeholder="CEP"
                  value={cep}
                  onChange={(e) => setCep(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
                />

                <input
                  placeholder="Número"
                  value={numeroEndereco}
                  onChange={(e) => setNumeroEndereco(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
                />

                <input
                  placeholder="Bairro"
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
                />

                <div className="grid grid-cols-[1fr_90px] gap-3">
                  <input
                    placeholder="Cidade"
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
                  />

                  <input
                    placeholder="UF"
                    value={uf}
                    onChange={(e) => setUf(e.target.value.toUpperCase())}
                    maxLength={2}
                    className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
                  />
                </div>

                {(situacao || analiseRisco) && (
                  <div className="col-span-2 bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-zinc-400 text-sm">Situação cadastral</p>
                    <p className="font-bold text-green-400 mt-1">
                      {situacao || "Não informado"}
                    </p>
                    <p className="text-zinc-400 text-sm mt-3">Análise de risco</p>
                    <p className="font-bold text-yellow-300 mt-1">
                      {analiseRisco || "Não informado"}
                    </p>
                  </div>
                )}

                <input
                  placeholder="Serviço solicitado"
                  value={servicoInteresse}
                  onChange={(e) => setServicoInteresse(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
                />

                <input
                  type="number"
                  placeholder="Valor previsto / estimado"
                  value={valorEstimado}
                  onChange={(e) => setValorEstimado(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
                />

                <input
                  placeholder="Vendedor responsável"
                  value={vendedor}
                  onChange={(e) => setVendedor(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
                />

                <input
                  type="date"
                  value={proximoContato}
                  onChange={(e) => setProximoContato(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
                />

                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-white"
                >
                  {etapasFunil.map((etapa) => (
                    <option key={etapa} value={etapa}>
                      {etapa}
                    </option>
                  ))}
                </select>

                <select
                  value={origem}
                  onChange={(e) => setOrigem(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-white"
                >
                  {origensPedido.map((origemAtual) => (
                    <option key={origemAtual} value={origemAtual}>
                      {origemAtual}
                    </option>
                  ))}
                </select>

                {status === "Perdido" && (
                  <select
                    value={motivoPerda}
                    onChange={(e) => setMotivoPerda(e.target.value)}
                    className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-white col-span-2"
                  >
                    <option value="">Selecione o motivo da perda</option>
                    {motivosPerda.map((motivo) => (
                      <option key={motivo} value={motivo}>
                        {motivo}
                      </option>
                    ))}
                  </select>
                )}

                <div className="col-span-2 rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
                  <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-xl font-black">Itens do pedido</h3>
                      <p className="text-sm text-zinc-400">
                        Selecione o material, informe medidas e acompanhe margem e lucro em tempo real.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={adicionarItemPreVenda}
                      className="rounded-xl bg-green-500 px-4 py-2 text-sm font-black text-black hover:bg-green-400 transition"
                    >
                      Adicionar item
                    </button>
                  </div>

                  <div className="flex flex-col gap-4">
                    {itensCalculados.map((item, index) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
                      >
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <p className="font-black">Item {index + 1}</p>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => duplicarItemPreVenda(item)}
                              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-700"
                            >
                              Duplicar
                            </button>

                            <button
                              type="button"
                              onClick={() => removerItemPreVenda(item.id)}
                              className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/30"
                            >
                              Remover
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
                          <select
                            value={item.materialId}
                            onChange={(e) =>
                              atualizarItemPreVenda(item.id, "materialId", e.target.value)
                            }
                            className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-white lg:col-span-2"
                          >
                            <option value="">Selecionar material</option>
                            {materiais.map((material) => (
                              <option key={material.id} value={material.id}>
                                {nomeMaterial(material)} - {formatarMoeda(valorVendaMaterial(material))}/m²
                              </option>
                            ))}
                          </select>

                          <input
                            placeholder="Material"
                            value={item.material}
                            onChange={(e) =>
                              atualizarItemPreVenda(item.id, "material", e.target.value)
                            }
                            className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 lg:col-span-2"
                          />

                          <input
                            placeholder="Largura"
                            inputMode="decimal"
                            value={item.largura}
                            onChange={(e) =>
                              atualizarItemPreVenda(item.id, "largura", e.target.value)
                            }
                            className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
                          />

                          <input
                            placeholder="Altura"
                            inputMode="decimal"
                            value={item.altura}
                            onChange={(e) =>
                              atualizarItemPreVenda(item.id, "altura", e.target.value)
                            }
                            className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
                          />

                          <input
                            placeholder="Qtd"
                            inputMode="decimal"
                            value={item.quantidade}
                            onChange={(e) =>
                              atualizarItemPreVenda(item.id, "quantidade", e.target.value)
                            }
                            className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
                          />

                          <input
                            placeholder="Valor m²"
                            inputMode="decimal"
                            value={item.valorM2}
                            onChange={(e) =>
                              atualizarItemPreVenda(item.id, "valorM2", e.target.value)
                            }
                            className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
                          />

                          <input
                            placeholder="Custo m²"
                            inputMode="decimal"
                            value={item.custoM2}
                            onChange={(e) =>
                              atualizarItemPreVenda(item.id, "custoM2", e.target.value)
                            }
                            className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
                          />

                          <input
                            placeholder="Margem desejada %"
                            inputMode="decimal"
                            value={item.margemDesejada}
                            onChange={(e) =>
                              atualizarItemPreVenda(item.id, "margemDesejada", e.target.value)
                            }
                            className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
                          />
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                          <MiniCard titulo="Área" valor={`${item.calculo.areaM2.toFixed(2)} m²`} />
                          <MiniCard titulo="Venda" valor={formatarMoeda(item.calculo.valorTotal)} />
                          <MiniCard titulo="Custo" valor={formatarMoeda(item.calculo.custoTotal)} />
                          <MiniCard titulo="Lucro" valor={formatarMoeda(item.calculo.lucro)} />
                          <MiniCard titulo="Margem" valor={`${item.calculo.margemReal.toFixed(1)}%`} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
                    <MiniCard titulo="Itens" valor={String(itensCalculados.length)} />
                    <MiniCard titulo="Área total" valor={`${resumoPreVenda.areaTotal.toFixed(2)} m²`} />
                    <MiniCard titulo="Venda total" valor={formatarMoeda(resumoPreVenda.vendaTotal)} />
                    <MiniCard titulo="Lucro total" valor={formatarMoeda(resumoPreVenda.lucroTotal)} />
                    <MiniCard titulo="Margem média" valor={`${resumoPreVenda.margemMedia.toFixed(1)}%`} />
                  </div>
                </div>

                <textarea
                  placeholder="Observações comerciais"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 col-span-2 min-h-24"
                />
              </div>

              <div className="mt-6 flex flex-col gap-3 md:flex-row">
                <button
                  onClick={salvarPedido}
                  className="bg-zinc-800 text-zinc-100 px-5 py-3 rounded-xl font-bold hover:bg-zinc-700 transition"
                >
                  Salvar pedido
                </button>

                <button
                  onClick={() => transformarEmOrcamento()}
                  disabled={transformandoOrcamento}
                  className="bg-green-500 text-black px-5 py-3 rounded-xl font-black hover:bg-green-400 transition disabled:opacity-60"
                >
                  {transformandoOrcamento
                    ? "Transformando..."
                    : "Transformar em orçamento"}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => setAbaHistorico(false)}
              className={`px-5 py-2 rounded-xl font-bold transition ${
                !abaHistorico
                  ? "bg-green-500 text-black"
                  : "bg-zinc-900 text-zinc-300 border border-zinc-800"
              }`}
            >
              Em andamento
            </button>

            <button
              onClick={() => setAbaHistorico(true)}
              className={`px-5 py-2 rounded-xl font-bold transition ${
                abaHistorico
                  ? "bg-blue-500 text-white"
                  : "bg-zinc-900 text-zinc-300 border border-zinc-800"
              }`}
            >
              Histórico
            </button>
          </div>

          {!abaHistorico && (
            <div className="grid grid-cols-6 gap-3">
              {etapasFunil.map((etapa) => {
              const pedidosDaEtapa = pedidosOrdenados(
                pedidosFiltrados.filter((pedido) => pedido.status === etapa)
              );

              return (
                <div
                  key={etapa}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-sm">{etapa}</h3>

                    <span className="bg-green-500/20 text-green-300 px-2 py-1 rounded-full text-xs font-bold">
                      {pedidosDaEtapa.length}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {pedidosDaEtapa.length > 0 ? (
                      <>
                        {pedidosDaEtapa
                          .slice(
                            0,
                            mostrarTodosStatus === etapa
                              ? pedidosDaEtapa.length
                              : 3
                          )
                          .map((pedido) => (
                            <div
                              key={pedido.id}
                              onClick={() => setPedidoDetalhe(pedido)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  setPedidoDetalhe(pedido);
                                }
                              }}
                              className={`text-left bg-zinc-950 border rounded-xl p-3 hover:border-green-500 transition cursor-pointer ${
                                pedidoParado(pedido)
                                  ? "border-red-500/40"
                                  : "border-zinc-800"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-green-400 text-xs font-black leading-tight">
                                  {pedido.cliente || "Cliente não informado"}
                                </p>

                                {pedidoParado(pedido) && (
                                  <span className="bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap">
                                    {diasSemMovimento(pedido)}d
                                  </span>
                                )}
                              </div>

                              <p className="text-zinc-400 text-xs mt-2 line-clamp-2">
                                {pedido.servicoInteresse || "Sem serviço"}
                              </p>

                              <div className="flex items-center justify-between mt-2">
                                <p className="text-yellow-300 text-xs font-bold">
                                  {formatarValor(pedido.valorEstimado)}
                                </p>

                                <span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                  {pedido.origem || "Sem origem"}
                                </span>
                              </div>

                              {pedido.numeroOS && (
                                <p className="text-blue-300 text-xs font-bold mt-2">
                                  {pedido.numeroOS}
                                </p>
                              )}

                              <div className="mt-3 flex flex-col gap-1.5">
                                <select
                                  value={pedido.status}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    alterarStatus(pedido, e.target.value)
                                  }
                                  className="bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                                >
                                  {etapasFunil.map((opcao) => (
                                    <option key={opcao} value={opcao}>
                                      {opcao}
                                    </option>
                                  ))}
                                </select>

                                {pedido.status === "Fechado" ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      transformarEmOrcamento(pedido);
                                    }}
                                    className="bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-400 transition"
                                  >
                                    Criar orçamento
                                  </button>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      enviarWhatsApp(pedido);
                                    }}
                                    className="bg-green-500 text-black px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-400 transition"
                                  >
                                    WhatsApp
                                  </button>
                                )}

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    excluirPedido(pedido.id);
                                  }}
                                  className="bg-red-500/20 text-red-300 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-500/30 transition"
                                >
                                  Excluir
                                </button>
                              </div>
                            </div>
                          ))}

                        {pedidosDaEtapa.length > 3 &&
                          mostrarTodosStatus !== etapa && (
                            <button
                              onClick={() => setMostrarTodosStatus(etapa)}
                              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-1.5 text-xs font-bold transition"
                            >
                              Mostrar todos ({pedidosDaEtapa.length})
                            </button>
                          )}

                        {mostrarTodosStatus === etapa &&
                          pedidosDaEtapa.length > 3 && (
                            <button
                              onClick={() => setMostrarTodosStatus(null)}
                              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-1.5 text-xs font-bold transition"
                            >
                              Mostrar menos
                            </button>
                          )}
                      </>
                    ) : (
                      <p className="text-zinc-500 text-sm">Nenhum pedido.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          )}

          {abaHistorico && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-2xl font-black">
                    Histórico comercial
                  </h2>

                  <p className="text-zinc-400 mt-1">
                    Pedidos convertidos em orçamento, perdidos ou arquivados.
                  </p>
                </div>

                <div className="bg-zinc-950 border border-zinc-800 px-4 py-2 rounded-xl">
                  <span className="text-zinc-300 font-bold">
                    {pedidosHistorico.length} registros
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400 text-sm">
                      <th className="text-left py-3">Cliente</th>
                      <th className="text-left py-3">Origem</th>
                      <th className="text-left py-3">Vendedor</th>
                      <th className="text-left py-3">Valor</th>
                      <th className="text-left py-3">OS</th>
                      <th className="text-left py-3">Status</th>
                      <th className="text-left py-3">Data</th>
                      <th className="text-left py-3">Ações</th>
                    </tr>
                  </thead>

                  <tbody>
                    {pedidosHistorico.map((pedido) => (
                      <tr
                        key={pedido.id}
                        className="border-b border-zinc-900 hover:bg-zinc-950/60 transition"
                      >
                        <td className="py-4 font-bold">
                          {pedido.cliente || "-"}
                        </td>

                        <td className="py-4 text-zinc-300">
                          {pedido.origem || "-"}
                        </td>

                        <td className="py-4 text-zinc-300">
                          {pedido.vendedor || "-"}
                        </td>

                        <td className="py-4 text-green-400 font-bold">
                          {formatarValor(pedido.valorEstimado)}
                        </td>

                        <td className="py-4 text-blue-300 font-bold">
                          {pedido.numeroOS || "-"}
                        </td>

                        <td className="py-4">
                          <span className="bg-zinc-800 px-3 py-1 rounded-full text-sm">
                            {pedido.status || "-"}
                          </span>
                        </td>

                        <td className="py-4 text-zinc-400 text-sm">
                          {formatarData(
                            pedido.atualizadoEm || pedido.criadoEm
                          )}
                        </td>

                        <td className="py-4">
                          <button
                            onClick={() => excluirPedido(pedido.id)}
                            className="bg-red-500/20 text-red-300 px-3 py-1 rounded-full text-xs font-bold hover:bg-red-500/30 transition"
                          >
                            Excluir
                          </button>
                        </td>
                      </tr>
                    ))}

                    {pedidosHistorico.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          className="py-10 text-center text-zinc-500"
                        >
                          Nenhum histórico encontrado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {modalFiltro && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="text-green-400 font-semibold">
                      {modalFiltro.tipo === "origem"
                        ? "Pedidos por origem"
                        : "Pedidos por vendedor"}
                    </p>

                    <h2 className="text-3xl font-black">
                      {modalFiltro.valor}
                    </h2>

                    <p className="text-zinc-400 mt-1">
                      {modalFiltro.pedidos.length} pedido(s) encontrados.
                    </p>
                  </div>

                  <button
                    onClick={() => setModalFiltro(null)}
                    className="bg-zinc-800 text-zinc-300 px-4 py-2 rounded-xl hover:bg-zinc-700"
                  >
                    Fechar
                  </button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  {modalFiltro.pedidos.map((pedido) => (
                    <div
                      key={pedido.id}
                      className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-green-400 text-sm font-black">
                            {pedido.cliente || "Cliente não informado"}
                          </p>

                          <p className="text-zinc-400 text-sm mt-1">
                            {pedido.servicoInteresse || "Sem serviço informado"}
                          </p>
                        </div>

                        <span className="bg-zinc-800 text-zinc-300 px-2 py-1 rounded-full text-xs font-bold">
                          {pedido.status || "-"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                          <p className="text-zinc-500">Valor</p>
                          <p className="font-bold text-green-400">
                            {formatarValor(pedido.valorEstimado)}
                          </p>
                        </div>

                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                          <p className="text-zinc-500">Origem</p>
                          <p className="font-bold">
                            {pedido.origem || "-"}
                          </p>
                        </div>

                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                          <p className="text-zinc-500">Vendedor</p>
                          <p className="font-bold">
                            {pedido.vendedor || "-"}
                          </p>
                        </div>

                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                          <p className="text-zinc-500">OS</p>
                          <p className="font-bold text-blue-300">
                            {pedido.numeroOS || "-"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                        <p className="text-zinc-500 text-sm">Observações</p>
                        <p className="text-zinc-300 text-sm mt-1">
                          {pedido.observacoes || "Sem observações."}
                        </p>
                      </div>

                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => {
                            setPedidoDetalhe(pedido);
                            setModalFiltro(null);
                          }}
                          className="flex-1 bg-blue-500 text-white px-3 py-2 rounded-xl text-sm font-bold hover:bg-blue-400 transition"
                        >
                          Ver detalhes
                        </button>

                        <button
                          onClick={async () => {
                            await excluirPedido(pedido.id);
                            setModalFiltro((modalAtual) => {
                              if (!modalAtual) return null;

                              return {
                                ...modalAtual,
                                pedidos: modalAtual.pedidos.filter(
                                  (item) => item.id !== pedido.id
                                ),
                              };
                            });
                          }}
                          className="flex-1 bg-red-500/20 text-red-300 px-3 py-2 rounded-xl text-sm font-bold hover:bg-red-500/30 transition"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}

                  {modalFiltro.pedidos.length === 0 && (
                    <div className="col-span-3 bg-zinc-950 border border-zinc-800 rounded-2xl p-6 text-zinc-400">
                      Nenhum pedido encontrado.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {pedidoDetalhe && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="text-green-400 font-semibold">
                      Detalhes do pedido comercial
                    </p>

                    <h2 className="text-3xl font-black">
                      {pedidoDetalhe.cliente}
                    </h2>

                    <p className="text-zinc-400 mt-1">
                      {pedidoDetalhe.servicoInteresse ||
                        "Sem serviço informado"}
                    </p>
                  </div>

                  <button
                    onClick={() => setPedidoDetalhe(null)}
                    className="bg-zinc-800 text-zinc-300 px-4 py-2 rounded-xl hover:bg-zinc-700"
                  >
                    Fechar
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-4 mb-6">
                  <MiniCard titulo="CNPJ" valor={pedidoDetalhe.cnpj || "-"} />
                  <MiniCard titulo="Empresa" valor={pedidoDetalhe.empresa || "-"} />
                  <MiniCard titulo="Telefone" valor={pedidoDetalhe.telefone || "-"} />
                  <MiniCard
                    titulo="Valor previsto"
                    valor={formatarValor(pedidoDetalhe.valorEstimado)}
                  />
                  <MiniCard titulo="Vendedor" valor={pedidoDetalhe.vendedor || "-"} />
                  <MiniCard titulo="Origem" valor={pedidoDetalhe.origem || "-"} />
                  <MiniCard titulo="Status" valor={pedidoDetalhe.status || "-"} />
                  <MiniCard
                    titulo="Próximo contato"
                    valor={pedidoDetalhe.proximoContato || "Não informado"}
                  />
                  <MiniCard
                    titulo="Dias parado"
                    valor={`${diasSemMovimento(pedidoDetalhe)} dias`}
                  />
                  <MiniCard
                    titulo="OS vinculada"
                    valor={pedidoDetalhe.numeroOS || "Ainda não criada"}
                  />
                </div>

                <div className="flex flex-wrap gap-3 mb-6">
                  {pedidoDetalhe.status === "Fechado" && (
                    <button
                      onClick={() => transformarEmOrcamento(pedidoDetalhe)}
                      className="bg-blue-500 text-white px-5 py-3 rounded-xl font-bold hover:bg-blue-400 transition"
                    >
                      Criar orçamento
                    </button>
                  )}

                  <button
                    onClick={() => enviarWhatsApp(pedidoDetalhe)}
                    className="bg-green-500 text-black px-5 py-3 rounded-xl font-bold hover:bg-green-400 transition"
                  >
                    Enviar WhatsApp
                  </button>

                  <button
                    onClick={() => enviarResumoOrcamentoWhatsApp(pedidoDetalhe)}
                    className="bg-yellow-400 text-black px-5 py-3 rounded-xl font-bold hover:bg-yellow-300 transition"
                  >
                    Enviar resumo
                  </button>

                  <button
                    onClick={() => excluirPedido(pedidoDetalhe.id)}
                    className="bg-red-500/20 text-red-300 px-5 py-3 rounded-xl font-bold hover:bg-red-500/30 transition"
                  >
                    Excluir pedido
                  </button>
                </div>

                {pedidoDetalhe.motivoPerda && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 mb-6">
                    <p className="text-red-300 font-bold">
                      Motivo da perda
                    </p>
                    <p className="text-zinc-200 mt-1">
                      {pedidoDetalhe.motivoPerda}
                    </p>
                  </div>
                )}

                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 mb-6">
                  <p className="text-zinc-400 text-sm mb-2">Observações</p>
                  <p className="text-zinc-200">
                    {pedidoDetalhe.observacoes || "Sem observações."}
                  </p>
                </div>

                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5">
                  <h3 className="text-xl font-black mb-4">Histórico</h3>

                  <div className="flex flex-col gap-3">
                    {(pedidoDetalhe.historico || []).map(
                      (item: any, index: number) => (
                        <div
                          key={index}
                          className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
                        >
                          <p className="text-green-400 font-bold">
                            {item.status || "Status não informado"}
                          </p>

                          <p className="text-zinc-300 text-sm mt-1">
                            {item.acao || "Atualização"}
                          </p>

                          <p className="text-zinc-500 text-xs mt-1">
                            {formatarData(item.data)}
                          </p>
                        </div>
                      )
                    )}

                    {(pedidoDetalhe.historico || []).length === 0 && (
                      <p className="text-zinc-500">
                        Nenhum histórico registrado.
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

function CardComercial({
  titulo,
  valor,
  cor,
}: {
  titulo: string;
  valor: string;
  cor: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
      <p className="text-zinc-400 text-sm">{titulo}</p>
      <h2 className={`text-3xl font-black mt-2 ${cor}`}>{valor}</h2>
    </div>
  );
}

function MiniCard({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
      <p className="text-zinc-500 text-sm">{titulo}</p>
      <p className="font-bold mt-1">{valor}</p>
    </div>
  );
}
