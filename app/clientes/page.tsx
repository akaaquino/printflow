"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
} from "firebase/firestore";

import { auth, db } from "@/app/lib/firebase";
import {
  formatarCEP,
  formatarCNPJ,
  formatarCPF,
  formatarDocumento,
  identificarTipoDocumento,
  limparCEP,
  limparDocumento,
  validarCNPJ,
  validarCPF,
} from "@/lib/validadores/documentos";
import type { TipoDocumento } from "@/lib/validadores/documentos";

type AbaCliente = "resumo" | "dados" | "historico";
type OrigemDadosCliente = "manual" | "cnpj" | "cep";

type DadosCnpjNormalizados = {
  nome: string;
  razaoSocial: string;
  nomeFantasia: string;
  cpfCnpj: string;
  cnpj: string;
  situacaoCadastral: string;
  dataAbertura: string;
  cnaePrincipal: string;
  telefone: string;
  email: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

type FormCliente = {
  nome: string;
  empresa: string;
  nomeFantasia: string;
  razaoSocial: string;
  tipoDocumento: TipoDocumento | "";
  cpfCnpj: string;
  situacaoCadastral: string;
  dataAbertura: string;
  cnaePrincipal: string;
  telefone: string;
  whatsapp: string;
  email: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  observacoes: string;
  dadosImportadosDe: OrigemDadosCliente;
};

const formVazio: FormCliente = {
  nome: "",
  empresa: "",
  nomeFantasia: "",
  razaoSocial: "",
  tipoDocumento: "",
  cpfCnpj: "",
  situacaoCadastral: "",
  dataAbertura: "",
  cnaePrincipal: "",
  telefone: "",
  whatsapp: "",
  email: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  cep: "",
  observacoes: "",
  dadosImportadosDe: "manual",
};

function texto(valor: any) {
  return String(valor || "").trim();
}

function normalizar(valor: any) {
  return texto(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function somenteDigitos(valor: any) {
  return texto(valor).replace(/\D/g, "");
}

function parseValor(valor: any) {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;

  if (typeof valor === "string") {
    return (
      Number(
        valor
          .replace(/[^\d,.-]/g, "")
          .replace(/\.(?=\d{3}(,|$))/g, "")
          .replace(",", ".")
      ) || 0
    );
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
  if (valor instanceof Date) return valor;
  if (typeof valor?.toDate === "function") return valor.toDate();
  if (typeof valor?.seconds === "number") return new Date(valor.seconds * 1000);

  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

function formatarData(valor: any) {
  const data = converterData(valor);

  if (!data) return "-";

  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getNomeCliente(cliente: any) {
  return (
    texto(cliente.nome) ||
    texto(cliente.razaoSocial) ||
    texto(cliente.cliente) ||
    texto(cliente.empresa) ||
    texto(cliente.nomeFantasia) ||
    "Cliente sem nome"
  );
}

function getDocumentoLimpoCliente(cliente: any) {
  return limparDocumento(
    texto(cliente.cpfCnpj) ||
      texto(cliente.documento) ||
      texto(cliente.cnpj) ||
      texto(cliente.cpf)
  );
}

function getDocumentoCliente(cliente: any) {
  const documentoLimpo = getDocumentoLimpoCliente(cliente);

  if (documentoLimpo.length === 11) return formatarCPF(documentoLimpo);
  if (documentoLimpo.length === 14) return formatarCNPJ(documentoLimpo);

  return texto(cliente.documento) || "-";
}

function getTelefoneCliente(cliente: any) {
  return texto(cliente.telefone) || texto(cliente.whatsapp) || texto(cliente.celular) || "-";
}

function getWhatsappCliente(cliente: any) {
  return texto(cliente.whatsapp) || texto(cliente.telefone) || texto(cliente.celular);
}

function getCidadeUf(cliente: any) {
  const cidade = texto(cliente.cidade);
  const uf = texto(cliente.uf).toUpperCase();

  if (cidade && uf) return `${cidade}/${uf}`;
  if (cidade) return cidade;
  if (uf) return uf;

  return "-";
}

function getEnderecoCompleto(cliente: any) {
  const partes = [
    texto(cliente.endereco || cliente.logradouro),
    texto(cliente.numero),
    texto(cliente.complemento),
    texto(cliente.bairro),
  ].filter(Boolean);

  return partes.join(", ");
}

function clienteIncompleto(cliente: any) {
  const documento =
    texto(cliente.cpfCnpj) ||
    texto(cliente.documento) ||
    texto(cliente.cnpj) ||
    texto(cliente.cpf);
  const telefone = texto(cliente.telefone) || texto(cliente.whatsapp) || texto(cliente.celular);
  const endereco = texto(cliente.endereco) || texto(cliente.logradouro);

  return (
    !documento ||
    !telefone ||
    !endereco
  );
}

function statusCliente(cliente: any) {
  if (cliente.arquivado === true || cliente.status === "Arquivado") return "Arquivado";
  if (texto(cliente.status)) return texto(cliente.status);
  if (clienteIncompleto(cliente)) return "Incompleto";

  return "Ativo";
}

function classeStatus(status: string) {
  if (status === "Arquivado") return "bg-zinc-700 text-zinc-300";
  if (status === "Incompleto") return "bg-yellow-500/15 text-yellow-300";

  return "bg-emerald-500/15 text-emerald-300";
}

function classeSituacaoCnpj(situacao: string) {
  const status = normalizar(situacao);

  if (status === "ativa") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  if (status.includes("baixada")) return "bg-red-500/15 text-red-300 border-red-500/30";
  if (status.includes("inapta")) return "bg-red-500/15 text-red-300 border-red-500/30";
  if (status.includes("suspensa")) return "bg-yellow-500/15 text-yellow-300 border-yellow-500/30";

  return "bg-zinc-800 text-zinc-300 border-zinc-700";
}

function valorOrcamento(orcamento: any) {
  return parseValor(
    orcamento.financeiro?.valorVenda ??
      orcamento.valorTotal ??
      orcamento.valor ??
      orcamento.total
  );
}

function ehVenda(orcamento: any) {
  const status = normalizar(orcamento.status || orcamento.statusOrcamento);
  const financeiro = normalizar(
    orcamento.financeiro?.statusFinanceiro || orcamento.statusFinanceiro
  );

  return (
    status.includes("aprov") ||
    status.includes("finaliz") ||
    Boolean(orcamento.aprovadoEm) ||
    ["pago", "parcial", "entrada paga", "em atraso"].some((item) =>
      financeiro.includes(item)
    )
  );
}

function dadosParaForm(cliente: any): FormCliente {
  const documento =
    texto(cliente.cpfCnpj) ||
    texto(cliente.documento) ||
    texto(cliente.cnpj) ||
    texto(cliente.cpf);
  const documentoLimpo = limparDocumento(documento);
  const tipoDocumentoSalvo = texto(cliente.tipoDocumento);
  const tipoDocumento =
    tipoDocumentoSalvo === "CPF" || tipoDocumentoSalvo === "CNPJ"
      ? tipoDocumentoSalvo
      : identificarTipoDocumento(documentoLimpo) || "";

  return {
    nome: getNomeCliente(cliente) === "Cliente sem nome" ? "" : getNomeCliente(cliente),
    empresa: texto(cliente.empresa || cliente.nomeFantasia || cliente.fantasia),
    nomeFantasia: texto(cliente.nomeFantasia || cliente.empresa || cliente.fantasia),
    razaoSocial: texto(cliente.razaoSocial || cliente.nome),
    tipoDocumento,
    cpfCnpj: formatarDocumento(documentoLimpo || documento),
    situacaoCadastral: texto(cliente.situacaoCadastral || cliente.situacao),
    dataAbertura: texto(cliente.dataAbertura),
    cnaePrincipal: texto(cliente.cnaePrincipal),
    telefone: texto(cliente.telefone || cliente.celular),
    whatsapp: getWhatsappCliente(cliente),
    email: texto(cliente.email),
    endereco: texto(cliente.endereco || cliente.logradouro),
    numero: texto(cliente.numero),
    complemento: texto(cliente.complemento),
    bairro: texto(cliente.bairro),
    cidade: texto(cliente.cidade),
    uf: texto(cliente.uf).toUpperCase(),
    cep: formatarCEP(cliente.cep),
    observacoes: texto(cliente.observacoes),
    dadosImportadosDe: cliente.dadosImportadosDe || "manual",
  };
}

export default function ClientesPage() {
  const router = useRouter();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  const [formNovo, setFormNovo] = useState<FormCliente>(formVazio);
  const [situacao, setSituacao] = useState("");
  const [analiseRisco, setAnaliseRisco] = useState("");

  const [busca, setBusca] = useState("");
  const [clientes, setClientes] = useState<any[]>([]);
  const [orcamentos, setOrcamentos] = useState<any[]>([]);
  const [artes, setArtes] = useState<any[]>([]);
  const [producoes, setProducoes] = useState<any[]>([]);
  const [instalacoes, setInstalacoes] = useState<any[]>([]);
  const [buscandoDocumento, setBuscandoDocumento] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [mensagemDocumento, setMensagemDocumento] = useState("");
  const [mensagemCep, setMensagemCep] = useState("");
  const [camposDestacados, setCamposDestacados] = useState<Array<keyof FormCliente>>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [acaoClienteId, setAcaoClienteId] = useState("");
  const [clienteAberto, setClienteAberto] = useState<any>(null);
  const [abaAtiva, setAbaAtiva] = useState<AbaCliente>("resumo");
  const [modoEdicao, setModoEdicao] = useState(false);
  const [formEdicao, setFormEdicao] = useState<FormCliente>(formVazio);
  const [toast, setToast] = useState("");
  const [erroFormulario, setErroFormulario] = useState("");
  const documentoConsultadoRef = useRef("");
  const cepConsultadoRef = useRef("");
  const numeroInputRef = useRef<HTMLInputElement | null>(null);

  function mostrarToast(mensagem: string) {
    setToast(mensagem);
    window.setTimeout(() => setToast(""), 3500);
  }

  async function carregarColecao(nomeColecao: string) {
    try {
      const querySnapshot = await getDocs(collection(db, nomeColecao));
      const lista: any[] = [];

      querySnapshot.forEach((documento) => {
        lista.push({
          id: documento.id,
          ...documento.data(),
        });
      });

      return lista;
    } catch (erro) {
      console.error(`Erro ao carregar ${nomeColecao}`, erro);
      return [];
    }
  }

  async function carregarDados() {
    try {
      setCarregando(true);

      const [
        clientesCarregados,
        orcamentosCarregados,
        artesCarregadas,
        producoesCarregadas,
        instalacoesCarregadas,
      ] = await Promise.all([
        carregarColecao("clientes"),
        carregarColecao("orcamentos"),
        carregarColecao("artes"),
        carregarColecao("producoes"),
        carregarColecao("instalacoes"),
      ]);

      console.log("Clientes carregados:", clientesCarregados);

      setClientes(clientesCarregados);
      setOrcamentos(orcamentosCarregados);
      setArtes(artesCarregadas);
      setProducoes(producoesCarregadas);
      setInstalacoes(instalacoesCarregadas);
    } catch (erro) {
      console.error(erro);
      mostrarToast("Não foi possível carregar os clientes.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    // Dados da tela vêm do Firestore após o AuthGuard liberar o usuário.
    carregarDados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function atualizarNovo(campo: keyof FormCliente, valor: string) {
    setFormNovo((atual) => ({
      ...atual,
      [campo]: campo === "uf" ? valor.toUpperCase() : valor,
    }));
  }

  function atualizarDocumentoNovo(valor: string) {
    const documento = limparDocumento(valor);
    const tipoDocumento = identificarTipoDocumento(documento) || "";

    documentoConsultadoRef.current = "";
    setMensagemDocumento("");
    setSituacao("");
    setAnaliseRisco("");

    setFormNovo((atual) => ({
      ...atual,
      cpfCnpj:
        documento.length > 11 ? formatarCNPJ(documento) : formatarCPF(documento),
      tipoDocumento,
      situacaoCadastral: "",
      dataAbertura: "",
      cnaePrincipal: "",
    }));
  }

  function atualizarCepNovo(valor: string) {
    const cep = limparCEP(valor);

    cepConsultadoRef.current = "";
    setMensagemCep("");

    setFormNovo((atual) => ({
      ...atual,
      cep: formatarCEP(cep),
    }));
  }

  function atualizarNomeFantasiaNovo(valor: string) {
    setFormNovo((atual) => ({
      ...atual,
      empresa: valor,
      nomeFantasia: valor,
    }));
  }

  function atualizarEdicao(campo: keyof FormCliente, valor: string) {
    setFormEdicao((atual) => ({
      ...atual,
      [campo]: campo === "uf" ? valor.toUpperCase() : valor,
    }));
  }

  function atualizarDocumentoEdicao(valor: string) {
    const documento = limparDocumento(valor);
    const tipoDocumento = identificarTipoDocumento(documento) || "";

    setFormEdicao((atual) => ({
      ...atual,
      cpfCnpj:
        documento.length > 11 ? formatarCNPJ(documento) : formatarCPF(documento),
      tipoDocumento,
    }));
  }

  function atualizarCepEdicao(valor: string) {
    setFormEdicao((atual) => ({
      ...atual,
      cep: formatarCEP(limparCEP(valor)),
    }));
  }

  function atualizarNomeFantasiaEdicao(valor: string) {
    setFormEdicao((atual) => ({
      ...atual,
      empresa: valor,
      nomeFantasia: valor,
    }));
  }

  function destacarCamposPreenchidos(campos: Array<keyof FormCliente>) {
    const unicos = Array.from(new Set(campos));

    if (unicos.length === 0) return;

    setCamposDestacados(unicos);
    window.setTimeout(() => setCamposDestacados([]), 2600);
  }

  function campoFoiPreenchido(campo: keyof FormCliente) {
    return camposDestacados.includes(campo);
  }

  async function buscarDadosCNPJ(cnpjLimpo: string) {
    const cnpj = limparDocumento(cnpjLimpo);

    if (cnpj.length !== 14 || !validarCNPJ(cnpj)) {
      setMensagemDocumento("Documento inválido.");
      return null;
    }

    try {
      const idToken = await auth.currentUser?.getIdToken();

      if (!idToken) {
        setMensagemDocumento("Faça login novamente para consultar o CNPJ.");
        return null;
      }

      const resposta = await fetch(
        `/api/clientes/cnpj?cnpj=${encodeURIComponent(cnpj)}`,
        {
          cache: "no-store",
          headers: { Authorization: `Bearer ${idToken}` },
        }
      );
      const retorno = await resposta.json().catch(() => ({}));

      if (!resposta.ok || retorno?.ok === false) {
        setMensagemDocumento(
          retorno?.erro || "Não foi possível consultar agora. Preencha manualmente."
        );
        return null;
      }

      const dadosNormalizados = retorno?.dados as DadosCnpjNormalizados | undefined;

      if (!dadosNormalizados) {
        setMensagemDocumento("CNPJ não encontrado. Preencha manualmente.");
        return null;
      }

      return dadosNormalizados;
    } catch (erro) {
      console.warn("Erro ao consultar CNPJ sem bloquear o cadastro:", erro);
      setMensagemDocumento("Não foi possível consultar agora. Preencha manualmente.");
      return null;
    }
  }

  async function consultarDocumento(forcarSobrescrita = false) {
    const documento = limparDocumento(formNovo.cpfCnpj);
    const tipoDocumento = identificarTipoDocumento(documento);

    if (!tipoDocumento) {
      setMensagemDocumento("Documento inválido.");
      return;
    }

    if (tipoDocumento === "CPF") {
      if (!validarCPF(documento)) {
        setMensagemDocumento("Documento inválido.");
        return;
      }

      setFormNovo((atual) => ({
        ...atual,
        cpfCnpj: formatarCPF(documento),
        tipoDocumento: "CPF",
      }));
      setMensagemDocumento(
        "CPF validado. Preencha os dados do cliente manualmente."
      );
      documentoConsultadoRef.current = documento;
      return;
    }

    if (!validarCNPJ(documento)) {
      setMensagemDocumento("Documento inválido.");
      return;
    }

    if (buscandoDocumento) return;

    const camposComDados = [
      formNovo.nome,
      formNovo.empresa,
      formNovo.telefone,
      formNovo.email,
      formNovo.endereco,
      formNovo.cidade,
    ].some(Boolean);

    if (
      forcarSobrescrita &&
      camposComDados &&
      !confirm("Atualizar os dados do formulário com as informações do CNPJ?")
    ) {
      return;
    }

    try {
      setBuscandoDocumento(true);
      setMensagemDocumento("Consultando...");

      const dados = await buscarDadosCNPJ(documento);

      if (!dados) {
        setSituacao("");
        setAnaliseRisco("");
        documentoConsultadoRef.current = documento;
        return null;
      }

      const preenchidos: Array<keyof FormCliente> = [];

      setFormNovo((atual) => {
        const proximo: FormCliente = {
          ...atual,
          cpfCnpj: formatarCNPJ(documento),
          tipoDocumento: "CNPJ",
          situacaoCadastral: dados.situacaoCadastral || "",
          dataAbertura: dados.dataAbertura || "",
          cnaePrincipal: dados.cnaePrincipal || "",
          dadosImportadosDe: "cnpj",
        };
        const aplicar = (campo: keyof FormCliente, valor: string) => {
          const valorTratado = texto(valor);

          if (!valorTratado) return;
          if (!forcarSobrescrita && texto(proximo[campo])) return;

          proximo[campo] = valorTratado as never;
          preenchidos.push(campo);
        };

        aplicar("nome", dados.razaoSocial || dados.nome);
        aplicar("razaoSocial", dados.razaoSocial || dados.nome);
        aplicar("empresa", dados.nomeFantasia || dados.razaoSocial || dados.nome);
        aplicar("nomeFantasia", dados.nomeFantasia);
        aplicar("situacaoCadastral", dados.situacaoCadastral);
        aplicar("dataAbertura", dados.dataAbertura);
        aplicar("cnaePrincipal", dados.cnaePrincipal);
        aplicar("telefone", dados.telefone);
        aplicar("whatsapp", dados.telefone);
        aplicar("email", dados.email);
        aplicar("cep", formatarCEP(dados.cep));
        aplicar("endereco", dados.endereco);
        aplicar("numero", dados.numero);
        aplicar("bairro", dados.bairro);
        aplicar("cidade", dados.cidade);
        aplicar("uf", texto(dados.uf).toUpperCase());

        return proximo;
      });

      setSituacao(dados.situacaoCadastral || "");
      setAnaliseRisco(
        normalizar(dados.situacaoCadastral) === "ativa"
          ? "Baixo risco cadastral"
          : dados.situacaoCadastral
            ? "Atenção: este CNPJ não está com situação ATIVA."
            : ""
      );
      setMensagemDocumento("Dados do CNPJ carregados com sucesso.");
      destacarCamposPreenchidos(preenchidos);
      documentoConsultadoRef.current = documento;

      if (dados.cep) {
        cepConsultadoRef.current = limparCEP(dados.cep);
      }

      return dados;
    } catch (erro) {
      console.warn("Erro ao consultar CNPJ sem bloquear o cadastro:", erro);
      setMensagemDocumento("Não foi possível consultar agora. Preencha manualmente.");
      setSituacao("");
      setAnaliseRisco("");
      documentoConsultadoRef.current = documento;
      return null;
    } finally {
      setBuscandoDocumento(false);
    }
  }

  async function consultarCep(forcarSobrescrita = false) {
    const cep = limparCEP(formNovo.cep);

    if (cep.length !== 8) {
      setMensagemCep("CEP deve ter 8 números.");
      return;
    }

    if (buscandoCep) return;

    try {
      setBuscandoCep(true);
      setMensagemCep("Buscando CEP...");

      const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const dados = await resposta.json().catch(() => null);

      if (!resposta.ok || dados?.erro) {
        console.warn("Falha esperada na consulta de CEP:", dados);
        setMensagemCep("CEP não encontrado. Preencha manualmente.");
        cepConsultadoRef.current = cep;
        return null;
      }

      if (!dados) {
        setMensagemCep("Não foi possível consultar agora. Preencha manualmente.");
        cepConsultadoRef.current = cep;
        return null;
      }

      const preenchidos: Array<keyof FormCliente> = [];

      setFormNovo((atual) => {
        const proximo: FormCliente = {
          ...atual,
          cep: formatarCEP(cep),
          dadosImportadosDe:
            atual.dadosImportadosDe === "cnpj" ? "cnpj" : "cep",
        };
        const aplicar = (campo: keyof FormCliente, valor: string) => {
          const valorTratado = texto(valor);

          if (!valorTratado) return;
          if (!forcarSobrescrita && texto(proximo[campo])) return;

          proximo[campo] = valorTratado as never;
          preenchidos.push(campo);
        };

        aplicar("endereco", dados.logradouro);
        aplicar("bairro", dados.bairro);
        aplicar("cidade", dados.localidade);
        aplicar("uf", texto(dados.uf).toUpperCase());

        return proximo;
      });

      setMensagemCep("Endereço preenchido pelo CEP.");
      destacarCamposPreenchidos(preenchidos);
      cepConsultadoRef.current = cep;
      window.setTimeout(() => numeroInputRef.current?.focus(), 80);
      return dados;
    } catch (erro) {
      console.warn("Erro ao consultar CEP sem bloquear o cadastro:", erro);
      setMensagemCep("Não foi possível consultar agora. Preencha manualmente.");
      cepConsultadoRef.current = cep;
      return null;
    } finally {
      setBuscandoCep(false);
    }
  }

  useEffect(() => {
    if (!mostrarFormulario) return;

    const documento = limparDocumento(formNovo.cpfCnpj);

    if (!documento) return;

    if (documento.length !== 11 && documento.length !== 14) return;
    if (documentoConsultadoRef.current === documento) return;

    const timer = window.setTimeout(() => {
      consultarDocumento(false);
    }, 700);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formNovo.cpfCnpj, mostrarFormulario]);

  useEffect(() => {
    if (!mostrarFormulario) return;

    const cep = limparCEP(formNovo.cep);

    if (!cep) return;

    if (cep.length !== 8) return;
    if (cepConsultadoRef.current === cep) return;

    const timer = window.setTimeout(() => {
      consultarCep(false);
    }, 650);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formNovo.cep, mostrarFormulario]);

  function validarFormularioCliente(form: FormCliente, clienteIdIgnorado = "") {
    if (!form.nome.trim() && !form.empresa.trim() && !form.nomeFantasia.trim()) {
      return "Informe pelo menos o nome ou a razão social.";
    }

    const documento = limparDocumento(form.cpfCnpj);
    const tipoDocumento = identificarTipoDocumento(documento);

    if (documento && !tipoDocumento) return "Documento inválido.";
    if (tipoDocumento === "CPF" && !validarCPF(documento)) return "Documento inválido.";
    if (tipoDocumento === "CNPJ" && !validarCNPJ(documento)) return "Documento inválido.";

    if (documento) {
      const clienteDuplicado = clientes.find((cliente) => {
        if (cliente.id === clienteIdIgnorado) return false;
        if (cliente.arquivado === true) return false;

        return getDocumentoLimpoCliente(cliente) === documento;
      });

      if (clienteDuplicado) {
        return `Já existe um cliente cadastrado com este documento: ${getNomeCliente(
          clienteDuplicado
        )}.`;
      }
    }

    const cep = limparCEP(form.cep);

    if (cep && cep.length !== 8) return "CEP inválido.";

    return "";
  }

  function prepararDadosCliente(form: FormCliente) {
    const documento = limparDocumento(form.cpfCnpj);
    const tipoDocumento = identificarTipoDocumento(documento) || form.tipoDocumento || "";
    const cep = limparCEP(form.cep);
    const nomeFantasia = texto(form.nomeFantasia || form.empresa);

    return {
      ...form,
      nome: texto(form.nome),
      empresa: nomeFantasia,
      nomeFantasia,
      razaoSocial: texto(form.razaoSocial || form.nome),
      tipoDocumento,
      cpfCnpj: documento,
      cpf: tipoDocumento === "CPF" ? documento : "",
      cnpj: tipoDocumento === "CNPJ" ? documento : "",
      situacaoCadastral: texto(form.situacaoCadastral),
      dataAbertura: texto(form.dataAbertura),
      cnaePrincipal: texto(form.cnaePrincipal),
      telefone: texto(form.telefone),
      whatsapp: texto(form.whatsapp),
      email: texto(form.email),
      cep,
      endereco: texto(form.endereco),
      numero: texto(form.numero),
      complemento: texto(form.complemento),
      bairro: texto(form.bairro),
      cidade: texto(form.cidade),
      uf: texto(form.uf).toUpperCase(),
      observacoes: texto(form.observacoes),
      dadosImportadosDe: form.dadosImportadosDe || "manual",
    };
  }

  async function salvarCliente() {
    const erroValidacao = validarFormularioCliente(formNovo);

    if (erroValidacao) {
      setErroFormulario(erroValidacao);
      return;
    }

    try {
      setSalvando(true);
      setErroFormulario("");

      const novoCliente = {
        ...prepararDadosCliente(formNovo),
        situacao,
        analiseRisco,
        status: "Ativo",
        tenantId: auth.currentUser?.uid || "",
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      };

      const documento = await addDoc(collection(db, "clientes"), novoCliente);

      setClientes((atuais) => [
        { id: documento.id, ...novoCliente },
        ...atuais,
      ]);
      setMostrarFormulario(false);
      setFormNovo(formVazio);
      setMensagemDocumento("");
      setMensagemCep("");
      setSituacao("");
      setAnaliseRisco("");
      mostrarToast("Cliente cadastrado com sucesso.");
    } catch (erro) {
      console.error(erro);
      mostrarToast("Erro ao salvar cliente.");
    } finally {
      setSalvando(false);
    }
  }

  function registrosDoCliente(lista: any[], cliente: any) {
    const nomeCliente = normalizar(getNomeCliente(cliente));

    return lista.filter((item) => {
      return (
        item.clienteId === cliente.id ||
        normalizar(item.cliente) === nomeCliente ||
        normalizar(item.nomeCliente) === nomeCliente
      );
    });
  }

  function getResumoCliente(cliente: any) {
    const orcamentosCliente = registrosDoCliente(orcamentos, cliente);
    const vendas = orcamentosCliente.filter(ehVenda);
    const totalComprado = vendas.reduce(
      (total, orcamento) => total + valorOrcamento(orcamento),
      0
    );
    const ultimoOrcamento = [...orcamentosCliente].sort((a, b) => {
      const dataA =
        converterData(a.aprovadoEm)?.getTime() ||
        converterData(a.criadoEm)?.getTime() ||
        0;
      const dataB =
        converterData(b.aprovadoEm)?.getTime() ||
        converterData(b.criadoEm)?.getTime() ||
        0;

      return dataB - dataA;
    })[0];
    const ultimaCompra = [...vendas].sort((a, b) => {
      const dataA =
        converterData(a.aprovadoEm)?.getTime() ||
        converterData(a.criadoEm)?.getTime() ||
        0;
      const dataB =
        converterData(b.aprovadoEm)?.getTime() ||
        converterData(b.criadoEm)?.getTime() ||
        0;

      return dataB - dataA;
    })[0];
    const temPendencia = orcamentosCliente.some((orcamento) => {
      const saldo = parseValor(orcamento.financeiro?.saldo);
      const statusFinanceiro = normalizar(orcamento.financeiro?.statusFinanceiro);

      return saldo > 0 || statusFinanceiro.includes("atraso");
    });

    return {
      orcamentosCliente,
      vendas,
      totalComprado,
      ultimoOrcamento,
      ultimaCompra,
      statusFinanceiro: temPendencia
        ? "Pendências"
        : vendas.length > 0
          ? "Em dia"
          : "Sem compras",
    };
  }

  function abrirCliente(cliente: any) {
    setClienteAberto(cliente);
    setAbaAtiva("resumo");
    setModoEdicao(false);
    setFormEdicao(dadosParaForm(cliente));
    setErroFormulario("");
  }

  function fecharCliente() {
    setClienteAberto(null);
    setModoEdicao(false);
    setFormEdicao(formVazio);
    setErroFormulario("");
  }

  async function salvarEdicao() {
    if (!clienteAberto || acaoClienteId) return;

    const erroValidacao = validarFormularioCliente(formEdicao, clienteAberto.id);

    if (erroValidacao) {
      setErroFormulario(erroValidacao);
      return;
    }

    try {
      setAcaoClienteId(clienteAberto.id);
      setErroFormulario("");

      const dadosAtualizados = {
        ...prepararDadosCliente(formEdicao),
        status:
          clienteAberto.arquivado || clienteAberto.status === "Arquivado"
            ? "Arquivado"
            : "Ativo",
        atualizadoEm: new Date(),
      };

      await updateDoc(doc(db, "clientes", clienteAberto.id), dadosAtualizados);

      setClientes((atuais) =>
        atuais.map((cliente) =>
          cliente.id === clienteAberto.id
            ? { ...cliente, ...dadosAtualizados }
            : cliente
        )
      );
      setClienteAberto((atual: any) => ({ ...atual, ...dadosAtualizados }));
      setModoEdicao(false);
      mostrarToast("Cliente atualizado com sucesso.");
    } catch (erro) {
      console.error(erro);
      mostrarToast("Erro ao atualizar cliente.");
    } finally {
      setAcaoClienteId("");
    }
  }

  async function arquivarCliente(cliente: any) {
    if (!cliente || acaoClienteId) return;

    try {
      setAcaoClienteId(cliente.id);

      const arquivando = !(cliente.arquivado || cliente.status === "Arquivado");
      const dadosAtualizados = arquivando
        ? {
            arquivado: true,
            status: "Arquivado",
            arquivadoEm: new Date(),
            atualizadoEm: new Date(),
          }
        : {
            arquivado: false,
            status: "Ativo",
            atualizadoEm: new Date(),
          };

      await updateDoc(doc(db, "clientes", cliente.id), dadosAtualizados);

      setClientes((atuais) =>
        atuais.map((item) =>
          item.id === cliente.id ? { ...item, ...dadosAtualizados } : item
        )
      );
      setClienteAberto((atual: any) =>
        atual?.id === cliente.id ? { ...atual, ...dadosAtualizados } : atual
      );
      mostrarToast(arquivando ? "Cliente arquivado." : "Cliente reativado.");
    } catch (erro) {
      console.error(erro);
      mostrarToast("Erro ao alterar status do cliente.");
    } finally {
      setAcaoClienteId("");
    }
  }

  async function excluirCliente(cliente: any) {
    if (!cliente || acaoClienteId) return;

    const orcamentosCliente = registrosDoCliente(orcamentos, cliente);

    if (
      orcamentosCliente.length > 0 &&
      !window.confirm(
        "Este cliente possui orçamentos vinculados. Recomenda-se arquivar em vez de excluir. Deseja continuar mesmo assim?"
      )
    ) {
      return;
    }

    const confirmar = window.confirm(
      "Tem certeza que deseja excluir este cliente? Essa ação não poderá ser desfeita."
    );

    if (!confirmar) return;

    try {
      setAcaoClienteId(cliente.id);

      await deleteDoc(doc(db, "clientes", cliente.id));

      setClientes((atuais) => atuais.filter((item) => item.id !== cliente.id));
      fecharCliente();
      mostrarToast("Cliente excluído com sucesso.");
    } catch (erro) {
      console.error(erro);
      mostrarToast("Erro ao excluir cliente.");
    } finally {
      setAcaoClienteId("");
    }
  }

  async function copiar(valor: string, mensagem: string) {
    if (!valor) {
      mostrarToast("Não há informação para copiar.");
      return;
    }

    try {
      await navigator.clipboard.writeText(valor);
      mostrarToast(mensagem);
    } catch (erro) {
      console.error(erro);
      mostrarToast("Não foi possível copiar.");
    }
  }

  function abrirWhatsapp(cliente: any) {
    const telefone = somenteDigitos(getWhatsappCliente(cliente));

    if (!telefone) {
      mostrarToast("Cliente sem WhatsApp cadastrado.");
      return;
    }

    const telefoneBrasil = telefone.startsWith("55") ? telefone : `55${telefone}`;
    window.open(`https://wa.me/${telefoneBrasil}`, "_blank");
  }

  function criarOrcamento(cliente: any) {
    const payload = {
      id: cliente.id,
      clienteId: cliente.id,
      nome: getNomeCliente(cliente),
      cliente: getNomeCliente(cliente),
    };

    localStorage.setItem("clienteSelecionadoOrcamento", JSON.stringify(payload));
    localStorage.setItem("printflow_cliente_orcamento", JSON.stringify(payload));
    router.push(
      `/orcamentos?clienteId=${encodeURIComponent(cliente.id)}&cliente=${encodeURIComponent(
        getNomeCliente(cliente)
      )}`
    );
  }

  const clientesFiltrados = useMemo(() => {
    const termo = normalizar(busca);
    const termoNumerico = somenteDigitos(busca);

    return clientes
      .filter((cliente) => {
        if (cliente.arquivado === true) return false;
        if (!termo && !termoNumerico) return true;

        const textoBusca = normalizar(
          [
            cliente.nome,
            cliente.razaoSocial,
            cliente.cliente,
            cliente.empresa,
            cliente.nomeFantasia,
            cliente.email,
            cliente.telefone,
            cliente.whatsapp,
            cliente.celular,
            cliente.cidade,
            cliente.uf,
            cliente.cpfCnpj,
            cliente.documento,
            cliente.cnpj,
            cliente.cpf,
            getDocumentoCliente(cliente),
          ].join(" ")
        );
        const numerosBusca = somenteDigitos(
          [
            cliente.telefone,
            cliente.whatsapp,
            cliente.celular,
            cliente.cpfCnpj,
            cliente.documento,
            cliente.cnpj,
            cliente.cpf,
            getDocumentoCliente(cliente),
          ].join(" ")
        );

        return (
          textoBusca.includes(termo) ||
          (termoNumerico && numerosBusca.includes(termoNumerico))
        );
      })
      .sort((a, b) => getNomeCliente(a).localeCompare(getNomeCliente(b), "pt-BR"));
  }, [clientes, busca]);

  useEffect(() => {
    console.log("Clientes filtrados:", clientesFiltrados);
    console.log("Busca atual:", busca);
  }, [clientesFiltrados, busca]);

  const resumoAberto = clienteAberto ? getResumoCliente(clienteAberto) : null;
  const documentoNovo = limparDocumento(formNovo.cpfCnpj);
  const cnpjNovoPreenchido = documentoNovo.length === 14;
  const clienteDuplicadoDocumento = useMemo(() => {
    if (!documentoNovo) return null;

    return (
      clientes.find((cliente) => {
        if (cliente.arquivado === true) return false;

        return getDocumentoLimpoCliente(cliente) === documentoNovo;
      }) || null
    );
  }, [clientes, documentoNovo]);
  const situacaoCnpjAtual = texto(formNovo.situacaoCadastral || situacao).toUpperCase();
  const cnpjNaoAtivo =
    situacaoCnpjAtual && normalizar(situacaoCnpjAtual) !== "ativa";

  return (
    <AuthGuard>
      <main className="flex min-h-screen bg-zinc-950 text-white">
        <Sidebar />

        <section className="flex-1 p-5 md:p-10">
          {toast && (
            <div className="fixed right-5 top-5 z-[70] rounded-2xl border border-emerald-500/30 bg-zinc-900 px-5 py-3 text-sm font-bold text-emerald-300 shadow-2xl">
              {toast}
            </div>
          )}

          <div className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="mb-2 text-sm font-semibold text-emerald-400">
                Base comercial
              </p>

              <h1 className="text-4xl font-black md:text-5xl">Clientes</h1>

              <p className="mt-2 max-w-3xl text-sm text-zinc-400">
                Consulte clientes, abra detalhes, revise dados incompletos e
                inicie um orçamento sem sair da operação.
              </p>
            </div>

            <button
              onClick={() => {
                if (mostrarFormulario) {
                  setFormNovo(formVazio);
                  setMensagemDocumento("");
                  setMensagemCep("");
                  setSituacao("");
                  setAnaliseRisco("");
                  setErroFormulario("");
                }

                setMostrarFormulario((valor) => !valor);
              }}
              className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-black transition hover:bg-emerald-400"
            >
              {mostrarFormulario ? "Fechar cadastro" : "Novo cliente"}
            </button>
          </div>

          <div className="mb-6 rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
            <input
              type="text"
              placeholder="Buscar por nome, telefone, CPF/CNPJ ou e-mail..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm outline-none transition focus:border-emerald-400"
            />
          </div>

          {mostrarFormulario && (
            <div className="mb-8 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-6">
              <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-black">Novo cliente</h2>
                  <p className="text-sm text-zinc-400">
                    Digite CPF/CNPJ e CEP para preencher o que for possível.
                  </p>
                </div>
              </div>

              {erroFormulario && (
                <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-bold text-red-300">
                  {erroFormulario}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="grid grid-cols-1 gap-3 md:col-span-2 md:grid-cols-[1fr_auto] md:items-start">
                  <CampoCliente
                    label="CPF/CNPJ"
                    value={formNovo.cpfCnpj}
                    onChange={atualizarDocumentoNovo}
                    placeholder="Digite o CPF ou CNPJ"
                    helper={
                      buscandoDocumento ? "Buscando CNPJ..." : mensagemDocumento
                    }
                  />

                  <button
                    onClick={() => consultarDocumento(true)}
                    disabled={buscandoDocumento || !cnpjNovoPreenchido}
                    className="mt-6 rounded-2xl bg-blue-500 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {buscandoDocumento ? "Consultando..." : "Buscar CNPJ"}
                  </button>
                </div>

                {clienteDuplicadoDocumento && (
                  <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-200 md:col-span-2">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <p className="font-bold">
                        Já existe cliente com este documento:{" "}
                        {getNomeCliente(clienteDuplicadoDocumento)}.
                      </p>
                      <button
                        type="button"
                        onClick={() => abrirCliente(clienteDuplicadoDocumento)}
                        className="w-fit rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-black text-yellow-100 transition hover:bg-yellow-500/30"
                      >
                        Ver cliente
                      </button>
                    </div>
                  </div>
                )}

                {situacaoCnpjAtual && (
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 md:col-span-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-xs font-bold text-zinc-500">
                        Situação cadastral:
                      </p>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${classeSituacaoCnpj(
                          situacaoCnpjAtual
                        )}`}
                      >
                        {situacaoCnpjAtual}
                      </span>
                    </div>

                    {(formNovo.dataAbertura || formNovo.cnaePrincipal) && (
                      <div className="mt-3 grid grid-cols-1 gap-3 text-xs text-zinc-400 md:grid-cols-2">
                        <span>
                          <strong className="text-zinc-300">Abertura:</strong>{" "}
                          {formNovo.dataAbertura || "-"}
                        </span>
                        <span className="min-w-0 truncate">
                          <strong className="text-zinc-300">CNAE:</strong>{" "}
                          {formNovo.cnaePrincipal || "-"}
                        </span>
                      </div>
                    )}

                    {cnpjNaoAtivo && (
                      <p className="mt-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm font-bold text-yellow-300">
                        Atenção: este CNPJ não está com situação ATIVA.
                      </p>
                    )}

                    {analiseRisco && (
                      <p
                        className={`mt-2 text-sm font-bold ${
                          analiseRisco.includes("Baixo")
                            ? "text-emerald-300"
                            : "text-yellow-300"
                        }`}
                      >
                        {analiseRisco}
                      </p>
                    )}
                  </div>
                )}

                <CampoCliente
                  label="Nome/Razão social"
                  value={formNovo.nome}
                  onChange={(valor) => atualizarNovo("nome", valor)}
                  highlight={campoFoiPreenchido("nome")}
                />
                <CampoCliente
                  label="Nome fantasia"
                  value={formNovo.empresa}
                  onChange={atualizarNomeFantasiaNovo}
                  highlight={campoFoiPreenchido("empresa")}
                />
                <CampoCliente
                  label="Telefone"
                  value={formNovo.telefone}
                  onChange={(valor) => atualizarNovo("telefone", valor)}
                  highlight={campoFoiPreenchido("telefone")}
                />
                <CampoCliente
                  label="WhatsApp"
                  value={formNovo.whatsapp}
                  onChange={(valor) => atualizarNovo("whatsapp", valor)}
                  highlight={campoFoiPreenchido("whatsapp")}
                />
                <CampoCliente
                  label="E-mail"
                  value={formNovo.email}
                  onChange={(valor) => atualizarNovo("email", valor)}
                  highlight={campoFoiPreenchido("email")}
                />
                <CampoCliente
                  label="CEP"
                  value={formNovo.cep}
                  onChange={atualizarCepNovo}
                  helper={buscandoCep ? "Buscando CEP..." : mensagemCep}
                  highlight={campoFoiPreenchido("cep")}
                />
                <CampoCliente
                  label="Endereço"
                  value={formNovo.endereco}
                  onChange={(valor) => atualizarNovo("endereco", valor)}
                  highlight={campoFoiPreenchido("endereco")}
                  className="md:col-span-2"
                />
                <CampoCliente
                  label="Número"
                  value={formNovo.numero}
                  onChange={(valor) => atualizarNovo("numero", valor)}
                  inputRef={numeroInputRef}
                />
                <CampoCliente
                  label="Complemento"
                  value={formNovo.complemento}
                  onChange={(valor) => atualizarNovo("complemento", valor)}
                />
                <CampoCliente
                  label="Bairro"
                  value={formNovo.bairro}
                  onChange={(valor) => atualizarNovo("bairro", valor)}
                  highlight={campoFoiPreenchido("bairro")}
                />
                <CampoCliente
                  label="Cidade"
                  value={formNovo.cidade}
                  onChange={(valor) => atualizarNovo("cidade", valor)}
                  highlight={campoFoiPreenchido("cidade")}
                />
                <CampoCliente
                  label="UF"
                  value={formNovo.uf}
                  onChange={(valor) => atualizarNovo("uf", valor)}
                  highlight={campoFoiPreenchido("uf")}
                />
                <CampoCliente
                  label="Observações"
                  value={formNovo.observacoes}
                  onChange={(valor) => atualizarNovo("observacoes", valor)}
                  className="md:col-span-2"
                />
              </div>

              <button
                onClick={salvarCliente}
                disabled={salvando}
                className="mt-6 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {salvando ? "Salvando..." : "Salvar cliente"}
              </button>
            </div>
          )}

          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="text-sm font-bold text-zinc-400">
              {clientesFiltrados.length} cliente
              {clientesFiltrados.length === 1 ? "" : "s"} encontrado
              {clientesFiltrados.length === 1 ? "" : "s"}
            </p>

            {carregando && (
              <p className="text-xs font-bold text-zinc-500">Carregando...</p>
            )}
          </div>

          <div className="hidden overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-left text-sm">
                <thead className="bg-zinc-800 text-xs uppercase tracking-wide text-zinc-400">
                  <tr>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="w-40 px-4 py-3">CPF/CNPJ</th>
                    <th className="w-36 px-4 py-3">Telefone</th>
                    <th className="w-36 px-4 py-3">Cidade</th>
                    <th className="w-32 px-4 py-3">Status</th>
                    <th className="w-44 px-4 py-3">Último orçamento</th>
                    <th className="w-72 px-4 py-3">Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {clientesFiltrados.map((cliente) => {
                    const status = statusCliente(cliente);
                    const resumo = getResumoCliente(cliente);

                    return (
                      <tr
                        key={cliente.id}
                        onClick={() => abrirCliente(cliente)}
                        className="cursor-pointer border-t border-zinc-800 transition hover:bg-zinc-800/60"
                      >
                        <td className="px-4 py-4 align-top">
                          <div className="max-w-[320px] min-w-0">
                            <p className="truncate font-black text-zinc-100">
                              {getNomeCliente(cliente)}
                            </p>
                            {texto(cliente.empresa) && (
                              <p className="mt-1 truncate text-xs text-zinc-500">
                                {cliente.empresa}
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top text-zinc-300 whitespace-nowrap">
                          {getDocumentoCliente(cliente) || "-"}
                        </td>

                        <td className="px-4 py-4 align-top text-zinc-300 whitespace-nowrap">
                          {getTelefoneCliente(cliente)}
                        </td>

                        <td className="px-4 py-4 align-top text-zinc-300 whitespace-nowrap">
                          {getCidadeUf(cliente)}
                        </td>

                        <td className="px-4 py-4 align-top">
                          <span
                            className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap ${classeStatus(
                              status
                            )}`}
                          >
                            {status}
                          </span>
                        </td>

                        <td className="px-4 py-4 align-top text-zinc-300 whitespace-nowrap">
                          {resumo.ultimoOrcamento?.numeroOS || "Nenhum ainda"}
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-wrap items-start gap-2 whitespace-nowrap">
                            <button
                              onClick={(evento) => {
                                evento.stopPropagation();
                                abrirWhatsapp(cliente);
                              }}
                              className="inline-flex w-fit rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/25"
                            >
                              WhatsApp
                            </button>
                            <button
                              onClick={(evento) => {
                                evento.stopPropagation();
                                criarOrcamento(cliente);
                              }}
                              className="inline-flex w-fit rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-300 transition hover:bg-blue-500/25"
                            >
                              Orçamento
                            </button>
                            <button
                              onClick={(evento) => {
                                evento.stopPropagation();
                                abrirCliente(cliente);
                              }}
                              className="inline-flex w-fit rounded-full bg-zinc-800 px-3 py-1 text-xs font-bold text-zinc-300 transition hover:bg-zinc-700"
                            >
                              Detalhes
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {!carregando && clientesFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-zinc-400">
                        Nenhum cliente encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            {clientesFiltrados.map((cliente) => {
              const status = statusCliente(cliente);
              const resumo = getResumoCliente(cliente);

              return (
                <div
                  key={cliente.id}
                  onClick={() => abrirCliente(cliente)}
                  className="cursor-pointer overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition hover:bg-zinc-800/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-zinc-100">
                        {getNomeCliente(cliente)}
                      </p>
                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {getDocumentoCliente(cliente) || "CPF/CNPJ não informado"}
                      </p>
                    </div>

                    <span
                      className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-bold ${classeStatus(
                        status
                      )}`}
                    >
                      {status}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="font-bold text-zinc-500">Telefone</p>
                      <p className="mt-1 truncate text-zinc-300">
                        {getTelefoneCliente(cliente)}
                      </p>
                    </div>
                    <div>
                      <p className="font-bold text-zinc-500">Cidade</p>
                      <p className="mt-1 truncate text-zinc-300">
                        {getCidadeUf(cliente)}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="font-bold text-zinc-500">Último orçamento</p>
                      <p className="mt-1 truncate text-zinc-300">
                        {resumo.ultimoOrcamento?.numeroOS || "Nenhum ainda"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 whitespace-nowrap">
                    <button
                      onClick={(evento) => {
                        evento.stopPropagation();
                        abrirWhatsapp(cliente);
                      }}
                      className="inline-flex rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/25"
                    >
                      WhatsApp
                    </button>
                    <button
                      onClick={(evento) => {
                        evento.stopPropagation();
                        criarOrcamento(cliente);
                      }}
                      className="inline-flex rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-300 transition hover:bg-blue-500/25"
                    >
                      Orçamento
                    </button>
                    <button
                      onClick={(evento) => {
                        evento.stopPropagation();
                        abrirCliente(cliente);
                      }}
                      className="inline-flex rounded-full bg-zinc-800 px-3 py-1 text-xs font-bold text-zinc-300 transition hover:bg-zinc-700"
                    >
                      Detalhes
                    </button>
                  </div>
                </div>
              );
            })}

            {!carregando && clientesFiltrados.length === 0 && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-400">
                Nenhum cliente encontrado.
              </div>
            )}
          </div>

          {clienteAberto && resumoAberto && (
            <div className="fixed inset-0 z-50 flex justify-end bg-black/70">
              <aside className="flex h-full w-full flex-col overflow-hidden border-l border-zinc-800 bg-zinc-950 shadow-2xl md:max-w-3xl">
                <div className="border-b border-zinc-800 bg-zinc-900 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${classeStatus(
                            statusCliente(clienteAberto)
                          )}`}
                        >
                          {statusCliente(clienteAberto)}
                        </span>
                        <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-bold text-zinc-400">
                          Cliente
                        </span>
                      </div>

                      <h2 className="truncate text-2xl font-black">
                        {getNomeCliente(clienteAberto)}
                      </h2>
                      <p className="mt-1 truncate text-sm text-zinc-400">
                        {getDocumentoCliente(clienteAberto) || "CPF/CNPJ não informado"}
                      </p>
                    </div>

                    <button
                      onClick={fecharCliente}
                      className="rounded-2xl bg-zinc-800 px-4 py-2 text-sm font-bold text-zinc-300 transition hover:bg-zinc-700"
                    >
                      Fechar
                    </button>
                  </div>

                  <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
                    {[
                      { id: "resumo", label: "Resumo" },
                      { id: "dados", label: "Dados" },
                      { id: "historico", label: "Histórico" },
                    ].map((aba) => (
                      <button
                        key={aba.id}
                        onClick={() => setAbaAtiva(aba.id as AbaCliente)}
                        className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${
                          abaAtiva === aba.id
                            ? "bg-emerald-500 text-black"
                            : "bg-zinc-950 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                        }`}
                      >
                        {aba.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  <div className="mb-5 flex flex-wrap gap-2">
                    {!modoEdicao && (
                      <button
                        onClick={() => {
                          setModoEdicao(true);
                          setAbaAtiva("dados");
                          setFormEdicao(dadosParaForm(clienteAberto));
                        }}
                        className="rounded-full bg-zinc-800 px-4 py-2 text-xs font-bold text-zinc-200 transition hover:bg-zinc-700"
                      >
                        Editar
                      </button>
                    )}
                    <button
                      onClick={() => criarOrcamento(clienteAberto)}
                      className="rounded-full bg-blue-500/15 px-4 py-2 text-xs font-bold text-blue-300 transition hover:bg-blue-500/25"
                    >
                      Criar orçamento
                    </button>
                    <button
                      onClick={() => arquivarCliente(clienteAberto)}
                      disabled={acaoClienteId === clienteAberto.id}
                      className="rounded-full bg-yellow-500/15 px-4 py-2 text-xs font-bold text-yellow-300 transition hover:bg-yellow-500/25 disabled:opacity-60"
                    >
                      {clienteAberto.arquivado || clienteAberto.status === "Arquivado"
                        ? "Reativar"
                        : "Arquivar"}
                    </button>
                    <button
                      onClick={() => excluirCliente(clienteAberto)}
                      disabled={acaoClienteId === clienteAberto.id}
                      className="rounded-full bg-red-500/15 px-4 py-2 text-xs font-bold text-red-300 transition hover:bg-red-500/25 disabled:opacity-60"
                    >
                      Excluir
                    </button>
                  </div>

                  {abaAtiva === "resumo" && (
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <ResumoClienteCard
                          titulo="Total comprado"
                          valor={formatarMoeda(resumoAberto.totalComprado)}
                        />
                        <ResumoClienteCard
                          titulo="Orçamentos"
                          valor={String(resumoAberto.orcamentosCliente.length)}
                        />
                        <ResumoClienteCard
                          titulo="Última compra"
                          valor={
                            resumoAberto.ultimaCompra
                              ? formatarData(
                                  resumoAberto.ultimaCompra.aprovadoEm ||
                                    resumoAberto.ultimaCompra.criadoEm
                                )
                              : "-"
                          }
                        />
                        <ResumoClienteCard
                          titulo="Status financeiro"
                          valor={resumoAberto.statusFinanceiro}
                        />
                      </div>

                      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                        <h3 className="text-sm font-black">Ações rápidas</h3>
                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                          <BotaoAcao
                            label="Copiar telefone/WhatsApp"
                            onClick={() =>
                              copiar(
                                getWhatsappCliente(clienteAberto),
                                "Telefone copiado."
                              )
                            }
                          />
                          <BotaoAcao
                            label="Copiar e-mail"
                            onClick={() =>
                              copiar(texto(clienteAberto.email), "E-mail copiado.")
                            }
                          />
                          <BotaoAcao
                            label="Ver histórico de orçamentos"
                            onClick={() => setAbaAtiva("historico")}
                          />
                          <BotaoAcao
                            label="Ver histórico financeiro"
                            onClick={() => setAbaAtiva("historico")}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {abaAtiva === "dados" && (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                      {!modoEdicao ? (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <InfoCliente label="Nome/Razão social" valor={getNomeCliente(clienteAberto)} />
                          <InfoCliente label="CPF/CNPJ" valor={getDocumentoCliente(clienteAberto)} />
                          <InfoCliente label="Situação cadastral" valor={clienteAberto.situacaoCadastral || clienteAberto.situacao} />
                          <InfoCliente label="Data de abertura" valor={clienteAberto.dataAbertura} />
                          <InfoCliente label="CNAE principal" valor={clienteAberto.cnaePrincipal} />
                          <InfoCliente label="Telefone" valor={getTelefoneCliente(clienteAberto)} />
                          <InfoCliente label="WhatsApp" valor={getWhatsappCliente(clienteAberto)} />
                          <InfoCliente label="E-mail" valor={clienteAberto.email} />
                          <InfoCliente label="Cidade/UF" valor={getCidadeUf(clienteAberto)} />
                          <InfoCliente label="CEP" valor={formatarCEP(clienteAberto.cep)} />
                          <InfoCliente label="Endereço completo" valor={getEnderecoCompleto(clienteAberto)} />
                          <InfoCliente label="Observações" valor={clienteAberto.observacoes} />
                          <InfoCliente label="Data de cadastro" valor={formatarData(clienteAberto.criadoEm)} />
                          <InfoCliente label="Última atualização" valor={formatarData(clienteAberto.atualizadoEm)} />
                        </div>
                      ) : (
                        <div>
                          {erroFormulario && (
                            <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-bold text-red-300">
                              {erroFormulario}
                            </div>
                          )}

                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <CampoCliente label="Nome/Razão social" value={formEdicao.nome} onChange={(valor) => atualizarEdicao("nome", valor)} />
                            <CampoCliente label="Nome fantasia" value={formEdicao.empresa} onChange={atualizarNomeFantasiaEdicao} />
                            <CampoCliente label="CPF/CNPJ" value={formEdicao.cpfCnpj} onChange={atualizarDocumentoEdicao} />
                            <CampoCliente label="Telefone" value={formEdicao.telefone} onChange={(valor) => atualizarEdicao("telefone", valor)} />
                            <CampoCliente label="WhatsApp" value={formEdicao.whatsapp} onChange={(valor) => atualizarEdicao("whatsapp", valor)} />
                            <CampoCliente label="E-mail" value={formEdicao.email} onChange={(valor) => atualizarEdicao("email", valor)} />
                            <CampoCliente label="Endereço" value={formEdicao.endereco} onChange={(valor) => atualizarEdicao("endereco", valor)} className="md:col-span-2" />
                            <CampoCliente label="Número" value={formEdicao.numero} onChange={(valor) => atualizarEdicao("numero", valor)} />
                            <CampoCliente label="Complemento" value={formEdicao.complemento} onChange={(valor) => atualizarEdicao("complemento", valor)} />
                            <CampoCliente label="Bairro" value={formEdicao.bairro} onChange={(valor) => atualizarEdicao("bairro", valor)} />
                            <CampoCliente label="Cidade" value={formEdicao.cidade} onChange={(valor) => atualizarEdicao("cidade", valor)} />
                            <CampoCliente label="UF" value={formEdicao.uf} onChange={(valor) => atualizarEdicao("uf", valor)} />
                            <CampoCliente label="CEP" value={formEdicao.cep} onChange={atualizarCepEdicao} />
                            <CampoCliente label="Observações" value={formEdicao.observacoes} onChange={(valor) => atualizarEdicao("observacoes", valor)} className="md:col-span-2" />
                          </div>

                          <div className="mt-5 flex justify-end gap-3">
                            <button
                              onClick={() => {
                                setModoEdicao(false);
                                setFormEdicao(dadosParaForm(clienteAberto));
                                setErroFormulario("");
                              }}
                              className="rounded-2xl bg-zinc-800 px-5 py-3 text-sm font-bold text-zinc-300 transition hover:bg-zinc-700"
                            >
                              Cancelar edição
                            </button>
                            <button
                              onClick={salvarEdicao}
                              disabled={acaoClienteId === clienteAberto.id}
                              className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-black transition hover:bg-emerald-400 disabled:opacity-60"
                            >
                              {acaoClienteId === clienteAberto.id ? "Salvando..." : "Salvar alterações"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {abaAtiva === "historico" && (
                    <div className="space-y-4">
                      <BlocoHistorico
                        titulo="Orçamentos"
                        itens={resumoAberto.orcamentosCliente}
                        vazio="Nenhum orçamento vinculado."
                        renderItem={(orcamento) => (
                          <ItemHistorico
                            titulo={orcamento.numeroOS || "Orçamento sem OS"}
                            detalhe={orcamento.status || "Sem status"}
                            valor={formatarMoeda(valorOrcamento(orcamento))}
                          />
                        )}
                      />
                      <BlocoHistorico
                        titulo="Aprovações de arte"
                        itens={registrosDoCliente(artes, clienteAberto)}
                        vazio="Nenhuma aprovação de arte vinculada."
                        renderItem={(arte) => (
                          <ItemHistorico
                            titulo={arte.numeroOS || "Arte sem OS"}
                            detalhe={arte.status || "Sem status"}
                            valor={formatarData(arte.aprovadoEm || arte.criadoEm)}
                          />
                        )}
                      />
                      <BlocoHistorico
                        titulo="Produções"
                        itens={registrosDoCliente(producoes, clienteAberto)}
                        vazio="Nenhuma produção vinculada."
                        renderItem={(producao) => (
                          <ItemHistorico
                            titulo={producao.numeroOS || "Produção sem OS"}
                            detalhe={producao.status || producao.etapa || "Sem status"}
                            valor={formatarData(producao.finalizadoEm || producao.criadoEm)}
                          />
                        )}
                      />
                      <BlocoHistorico
                        titulo="Instalações"
                        itens={registrosDoCliente(instalacoes, clienteAberto)}
                        vazio="Nenhuma instalação vinculada."
                        renderItem={(instalacao) => (
                          <ItemHistorico
                            titulo={instalacao.numeroOS || "Instalação sem OS"}
                            detalhe={instalacao.status || "Sem status"}
                            valor={formatarData(instalacao.data || instalacao.criadoEm)}
                          />
                        )}
                      />
                      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                        <h3 className="text-sm font-black">Financeiro</h3>
                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                          <ResumoClienteCard
                            titulo="Total comprado"
                            valor={formatarMoeda(resumoAberto.totalComprado)}
                          />
                          <ResumoClienteCard
                            titulo="Vendas aprovadas"
                            valor={String(resumoAberto.vendas.length)}
                          />
                          <ResumoClienteCard
                            titulo="Status"
                            valor={resumoAberto.statusFinanceiro}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </aside>
            </div>
          )}
        </section>
      </main>
    </AuthGuard>
  );
}

function CampoCliente({
  label,
  value,
  onChange,
  placeholder,
  className = "",
  helper = "",
  highlight = false,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  className?: string;
  helper?: string;
  highlight?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-2 block text-xs font-bold text-zinc-500">{label}</span>
      <input
        ref={inputRef}
        value={value}
        onChange={(evento) => onChange(evento.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-2xl border bg-zinc-950 px-4 py-3 text-sm text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-emerald-400 ${
          highlight
            ? "border-emerald-400/70 shadow-[0_0_0_1px_rgba(52,211,153,0.35)]"
            : "border-zinc-800"
        }`}
      />
      {helper && (
        <span className="mt-2 block text-xs font-bold text-zinc-500">{helper}</span>
      )}
    </label>
  );
}

function InfoCliente({ label, valor }: { label: string; valor: any }) {
  return (
    <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <p className="text-xs font-bold text-zinc-500">{label}</p>
      <p className="mt-2 break-words text-sm font-bold text-zinc-200">
        {texto(valor) || "-"}
      </p>
    </div>
  );
}

function ResumoClienteCard({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <p className="text-xs font-bold text-zinc-500">{titulo}</p>
      <p className="mt-2 truncate text-lg font-black text-emerald-300">{valor}</p>
    </div>
  );
}

function BotaoAcao({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-left text-sm font-bold text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-800"
    >
      {label}
    </button>
  );
}

function BlocoHistorico({
  titulo,
  itens,
  vazio,
  renderItem,
}: {
  titulo: string;
  itens: any[];
  vazio: string;
  renderItem: (item: any) => React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-black">{titulo}</h3>
        <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-bold text-zinc-400">
          {itens.length}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {itens.slice(0, 6).map((item) => (
          <div key={item.id || item.numeroOS} className="min-w-0">
            {renderItem(item)}
          </div>
        ))}

        {itens.length === 0 && (
          <p className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-500">
            {vazio}
          </p>
        )}
      </div>
    </div>
  );
}

function ItemHistorico({
  titulo,
  detalhe,
  valor,
}: {
  titulo: string;
  detalhe: string;
  valor: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-zinc-200">{titulo}</p>
        <p className="truncate text-xs text-zinc-500">{detalhe}</p>
      </div>
      <p className="shrink-0 text-xs font-bold text-zinc-400">{valor}</p>
    </div>
  );
}
