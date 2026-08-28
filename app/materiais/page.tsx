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
  updateDoc,
} from "firebase/firestore";

import { db } from "@/app/lib/firebase";

type AbaEstoque = "materiais" | "impressoras";

type FormImpressora = {
  nome: string;
  tipo: string;
  larguraMaximaM: string;
  velocidadeM2Hora: string;
  tempoSetupMin: string;
  observacoes: string;
};

const TIPOS_IMPRESSORA = [
  "Solvente",
  "Eco solvente",
  "UV",
  "Sublimação",
  "Látex",
  "DTF",
  "Recorte",
  "Outro",
];

const formImpressoraVazio: FormImpressora = {
  nome: "",
  tipo: "Solvente",
  larguraMaximaM: "",
  velocidadeM2Hora: "",
  tempoSetupMin: "0",
  observacoes: "",
};

export default function MateriaisPage() {
  const [abaAtiva, setAbaAtiva] = useState<AbaEstoque>("materiais");
  const [materiais, setMateriais] = useState<any[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<any[]>([]);
  const [impressoras, setImpressoras] = useState<any[]>([]);
  const [formImpressora, setFormImpressora] =
    useState<FormImpressora>(formImpressoraVazio);
  const [impressoraEditandoId, setImpressoraEditandoId] = useState("");
  const [salvandoImpressora, setSalvandoImpressora] = useState(false);

  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [unidade, setUnidade] = useState("m²");
  const [largura, setLargura] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [estoqueMinimo, setEstoqueMinimo] = useState("");
  const [precoVenda, setPrecoVenda] = useState("");
  const [custoInterno, setCustoInterno] = useState("");
  const [margemMinima, setMargemMinima] = useState("20");
  const [fornecedor, setFornecedor] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const [busca, setBusca] = useState("");

  function parseNumero(valor: any) {
    if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;

    const convertido = Number(String(valor || "0").replace(",", "."));

    return Number.isFinite(convertido) ? convertido : 0;
  }

  function estoqueAtualMaterial(material: any) {
    return parseNumero(
      material.estoqueM2 ??
        material.metragemAtual ??
        material.quantidadeM2 ??
        material.saldoM2 ??
        material.quantidade
    );
  }

  function camposEstoqueAtualizacao(material: any, valor: number) {
    const campos = ["estoqueM2", "metragemAtual", "quantidadeM2", "saldoM2", "quantidade"];
    const campoEstoque =
      campos.find((campo) => material[campo] !== undefined && material[campo] !== null) ||
      "quantidade";

    return {
      [campoEstoque]: valor,
    };
  }

  function formatarMetragem(valor: any) {
    return `${parseNumero(valor).toFixed(2)} m²`;
  }

  async function carregarMateriais() {
    const [querySnapshot, movimentacoesSnapshot, impressorasSnapshot] = await Promise.all([
      getDocs(collection(db, "materiais")),
      getDocs(collection(db, "movimentacoesEstoque")),
      getDocs(collection(db, "impressoras")),
    ]);

    const lista: any[] = [];
    const listaMovimentacoes: any[] = [];
    const listaImpressoras: any[] = [];

    querySnapshot.forEach((documento) => {
      lista.push({
        id: documento.id,
        ...documento.data(),
      });
    });

    movimentacoesSnapshot.forEach((documento) => {
      listaMovimentacoes.push({
        id: documento.id,
        ...documento.data(),
      });
    });

    impressorasSnapshot.forEach((documento) => {
      listaImpressoras.push({
        id: documento.id,
        ...documento.data(),
      });
    });

    setMateriais(lista);
    setImpressoras(
      listaImpressoras.sort((a, b) =>
        String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR")
      )
    );
    setMovimentacoes(
      listaMovimentacoes.sort((a, b) => {
        const dataA = a.criadoEm?.seconds ? a.criadoEm.seconds * 1000 : new Date(a.criadoEm || 0).getTime();
        const dataB = b.criadoEm?.seconds ? b.criadoEm.seconds * 1000 : new Date(b.criadoEm || 0).getTime();

        return dataB - dataA;
      })
    );
  }

  useEffect(() => {
    carregarMateriais();
  }, []);

  const materiaisFiltrados = useMemo(() => {
    return materiais.filter((material) => {
      const termo = busca.toLowerCase();

      if (!termo) return true;

      return (
        String(material.nome || "")
          .toLowerCase()
          .includes(termo) ||
        String(material.categoria || "")
          .toLowerCase()
          .includes(termo) ||
        String(material.fornecedor || "")
          .toLowerCase()
          .includes(termo)
      );
    });
  }, [materiais, busca]);

  const materiaisAtivos = materiais.filter(
    (material) => material.ativo !== false
  );

  const materiaisAbaixoMinimo = materiaisAtivos.filter((material) => {
    return (
      estoqueAtualMaterial(material) <=
      parseNumero(material.estoqueMinimo)
    );
  });

  const valorTotalEstoque = materiaisAtivos.reduce(
    (total, material) => {
      return (
        total +
        estoqueAtualMaterial(material) *
          parseNumero(material.custoInterno)
      );
    },
    0
  );

  const impressorasAtivas = impressoras.filter(
    (impressora) => impressora.ativo !== false
  );

  function atualizarFormImpressora(campo: keyof FormImpressora, valor: string) {
    setFormImpressora((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  }

  async function salvarMaterial() {
    if (!nome) {
      alert("Digite o nome do material.");
      return;
    }

    const estoqueInicial = parseNumero(quantidade);

    await addDoc(collection(db, "materiais"), {
      nome,
      categoria,
      unidade,
      largura: parseNumero(largura),
      quantidade: estoqueInicial,
      estoqueMinimo: parseNumero(estoqueMinimo),
      precoVenda: parseNumero(precoVenda),
      custoInterno: parseNumero(custoInterno),
      margemMinima: parseNumero(margemMinima),
      fornecedor,
      observacoes,
      ativo: true,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    });

    limparFormulario();

    await carregarMateriais();
  }

  function limparFormulario() {
    setNome("");
    setCategoria("");
    setUnidade("m²");
    setLargura("");
    setQuantidade("");
    setEstoqueMinimo("");
    setPrecoVenda("");
    setCustoInterno("");
    setMargemMinima("20");
    setFornecedor("");
    setObservacoes("");
  }

  async function alterarStatus(material: any) {
    await updateDoc(doc(db, "materiais", material.id), {
      ativo: !material.ativo,
      atualizadoEm: new Date(),
    });

    await carregarMateriais();
  }

  async function excluirMaterial(id: string) {
    const confirmar = confirm(
      "Deseja realmente excluir este material?"
    );

    if (!confirmar) return;

    await deleteDoc(doc(db, "materiais", id));

    await carregarMateriais();
  }

  async function movimentarEstoque(
    material: any,
    tipo: "entrada" | "saida"
  ) {
    const valor = prompt(
      tipo === "entrada"
        ? "Quantidade de entrada:"
        : "Quantidade de saída:"
    );

    if (!valor) return;

    const quantidadeMovimentada = parseNumero(valor);

    if (quantidadeMovimentada <= 0) {
      alert("Digite uma quantidade válida.");
      return;
    }

    const quantidadeAtual = estoqueAtualMaterial(material);

    const novaQuantidade =
      tipo === "entrada"
        ? quantidadeAtual + quantidadeMovimentada
        : Math.max(
            quantidadeAtual - quantidadeMovimentada,
            0
          );

    await updateDoc(doc(db, "materiais", material.id), {
      ...camposEstoqueAtualizacao(material, novaQuantidade),
      atualizadoEm: new Date(),
    });

    await addDoc(collection(db, "movimentacoesEstoque"), {
      materialId: material.id,
      materialNome: material.nome,
      tipo,
      origem: "manual",
      quantidade: quantidadeMovimentada,
      quantidadeM2: quantidadeMovimentada,
      quantidadeAnterior: quantidadeAtual,
      quantidadeAtual: novaQuantidade,
      observacao:
        tipo === "entrada"
          ? "Entrada manual de estoque"
          : "Saída manual de estoque",
      criadoEm: new Date(),
    });

    await carregarMateriais();
  }

  function limparFormularioImpressora() {
    setFormImpressora(formImpressoraVazio);
    setImpressoraEditandoId("");
  }

  function editarImpressora(impressora: any) {
    setFormImpressora({
      nome: String(impressora.nome || ""),
      tipo: String(impressora.tipo || "Solvente"),
      larguraMaximaM: String(impressora.larguraMaximaM || ""),
      velocidadeM2Hora: String(impressora.velocidadeM2Hora || ""),
      tempoSetupMin: String(impressora.tempoSetupMin ?? "0"),
      observacoes: String(impressora.observacoes || ""),
    });
    setImpressoraEditandoId(impressora.id);
  }

  async function salvarImpressora() {
    const larguraMaximaM = parseNumero(formImpressora.larguraMaximaM);
    const velocidadeM2Hora = parseNumero(formImpressora.velocidadeM2Hora);
    const tempoSetupMin = Math.max(parseNumero(formImpressora.tempoSetupMin), 0);

    if (!formImpressora.nome.trim()) {
      alert("Digite o nome da impressora.");
      return;
    }

    if (larguraMaximaM <= 0) {
      alert("A largura máxima precisa ser maior que zero.");
      return;
    }

    if (velocidadeM2Hora <= 0) {
      alert("A velocidade precisa ser maior que zero.");
      return;
    }

    const dadosImpressora = {
      nome: formImpressora.nome.trim(),
      tipo: formImpressora.tipo,
      larguraMaximaM,
      velocidadeM2Hora,
      tempoSetupMin,
      ativo: true,
      observacoes: formImpressora.observacoes.trim(),
      atualizadoEm: new Date(),
    };

    try {
      setSalvandoImpressora(true);

      if (impressoraEditandoId) {
        await updateDoc(doc(db, "impressoras", impressoraEditandoId), dadosImpressora);
      } else {
        await addDoc(collection(db, "impressoras"), {
          ...dadosImpressora,
          criadoEm: new Date(),
        });
      }

      limparFormularioImpressora();
      await carregarMateriais();
    } catch (erro) {
      console.error(erro);
      alert("Erro ao salvar impressora.");
    } finally {
      setSalvandoImpressora(false);
    }
  }

  async function arquivarImpressora(impressora: any) {
    const confirmar = confirm(
      impressora.ativo === false
        ? "Deseja reativar esta impressora?"
        : "Deseja arquivar esta impressora?"
    );

    if (!confirmar) return;

    try {
      await updateDoc(doc(db, "impressoras", impressora.id), {
        ativo: impressora.ativo === false,
        atualizadoEm: new Date(),
      });
      await carregarMateriais();
    } catch (erro) {
      console.error(erro);
      alert("Erro ao atualizar impressora.");
    }
  }

  async function excluirImpressora(impressora: any) {
    const producoesSnapshot = await getDocs(collection(db, "producoes"));
    const emUso = producoesSnapshot.docs.some((documento) => {
      const dados = documento.data();

      return (
        dados.impressoraId === impressora.id ||
        (Array.isArray(dados.itens) &&
          dados.itens.some((item: any) => item?.impressoraId === impressora.id))
      );
    });

    if (emUso) {
      alert(
        "Esta impressora já está vinculada a OS. Ela será arquivada para preservar o histórico."
      );
      await updateDoc(doc(db, "impressoras", impressora.id), {
        ativo: false,
        atualizadoEm: new Date(),
      });
      await carregarMateriais();
      return;
    }

    const confirmar = confirm("Deseja realmente excluir esta impressora?");

    if (!confirmar) return;

    try {
      await deleteDoc(doc(db, "impressoras", impressora.id));
      await carregarMateriais();
    } catch (erro) {
      console.error(erro);
      alert("Erro ao excluir impressora.");
    }
  }

  return (
    <AuthGuard>
      <main className="flex min-h-screen bg-zinc-950 text-white">
        <Sidebar />

        <section className="flex-1 p-10">
          <div className="flex items-start justify-between gap-6 mb-10">
            <div>
              <p className="text-green-400 font-semibold mb-2">
                Estoque inteligente
              </p>

              <h1 className="text-5xl font-black mb-3">
                Materiais
              </h1>

              <p className="text-zinc-400 max-w-3xl">
                Controle estoque, custos, margem mínima,
                fornecedores e materiais utilizados pela
                gráfica.
              </p>
            </div>
          </div>

          <div className="mb-8 flex w-fit rounded-2xl border border-zinc-800 bg-zinc-900 p-1">
            {[
              { id: "materiais", label: "Materiais" },
              { id: "impressoras", label: "Impressoras" },
            ].map((aba) => (
              <button
                key={aba.id}
                onClick={() => setAbaAtiva(aba.id as AbaEstoque)}
                className={`rounded-xl px-5 py-2 text-sm font-bold transition ${
                  abaAtiva === aba.id
                    ? "bg-green-500 text-black"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                {aba.label}
              </button>
            ))}
          </div>

          {abaAtiva === "materiais" ? (
            <>
          <div className="grid grid-cols-4 gap-5 mb-8">
            <CardIndicador
              titulo="Materiais ativos"
              valor={materiaisAtivos.length.toString()}
              cor="text-white"
            />

            <CardIndicador
              titulo="Abaixo do mínimo"
              valor={materiaisAbaixoMinimo.length.toString()}
              cor="text-red-300"
            />

            <CardIndicador
              titulo="Valor em estoque"
              valor={`R$ ${valorTotalEstoque.toFixed(2)}`}
              cor="text-green-400"
            />

            <CardIndicador
              titulo="Total cadastrado"
              valor={materiais.length.toString()}
              cor="text-zinc-300"
            />
          </div>

          {materiaisAbaixoMinimo.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-3xl p-5 mb-8">
              <p className="text-red-300 font-black text-xl">
                ⚠ Materiais abaixo do mínimo
              </p>

              <div className="flex flex-wrap gap-2 mt-4">
                {materiaisAbaixoMinimo.map((material) => (
                  <span
                    key={material.id}
                    className="bg-zinc-950 border border-red-500/30 text-red-300 px-3 py-1 rounded-full text-sm font-bold"
                  >
                    {material.nome}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 mb-8">
            <h2 className="text-2xl font-black mb-6">
              Novo material
            </h2>

            <div className="grid grid-cols-5 gap-4">
              <input
                placeholder="Nome do material"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
              />

              <input
                placeholder="Categoria"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
              />

              <input
                placeholder="Fornecedor"
                value={fornecedor}
                onChange={(e) =>
                  setFornecedor(e.target.value)
                }
                className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
              />

              <select
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-white"
              >
                <option value="m²">m²</option>
                <option value="metro linear">
                  metro linear
                </option>
                <option value="unidade">unidade</option>
                <option value="folha">folha</option>
              </select>

              <input
                type="number"
                placeholder="Largura"
                value={largura}
                onChange={(e) => setLargura(e.target.value)}
                className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
              />

              <input
                type="number"
                placeholder="Quantidade"
                value={quantidade}
                onChange={(e) =>
                  setQuantidade(e.target.value)
                }
                className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
              />

              <input
                type="number"
                placeholder="Estoque mínimo"
                value={estoqueMinimo}
                onChange={(e) =>
                  setEstoqueMinimo(e.target.value)
                }
                className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
              />

              <input
                type="number"
                placeholder="Preço venda"
                value={precoVenda}
                onChange={(e) =>
                  setPrecoVenda(e.target.value)
                }
                className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
              />

              <input
                type="number"
                placeholder="Custo interno"
                value={custoInterno}
                onChange={(e) =>
                  setCustoInterno(e.target.value)
                }
                className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
              />

              <input
                type="number"
                placeholder="Margem mínima"
                value={margemMinima}
                onChange={(e) =>
                  setMargemMinima(e.target.value)
                }
                className="bg-zinc-950 border border-zinc-700 rounded-xl p-3"
              />
            </div>

            <textarea
              placeholder="Observações"
              value={observacoes}
              onChange={(e) =>
                setObservacoes(e.target.value)
              }
              className="mt-4 w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 min-h-24"
            />

            <button
              onClick={salvarMaterial}
              className="mt-6 bg-green-500 text-black px-5 py-3 rounded-xl font-bold hover:bg-green-400 transition"
            >
              Salvar material
            </button>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 mb-8">
            <input
              placeholder="Pesquisar material, categoria ou fornecedor"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3"
            />
          </div>

          <div className="grid grid-cols-4 gap-4">
            {materiaisFiltrados.map((material) => {
              const estoqueAtual = estoqueAtualMaterial(material);
              const estoqueMinimoAtual = parseNumero(material.estoqueMinimo);
              const abaixoMinimo =
                estoqueAtual <= estoqueMinimoAtual;
              const historicoMaterial = movimentacoes
                .filter((movimentacao) => movimentacao.materialId === material.id)
                .slice(0, 3);

              return (
                <div
                  key={material.id}
                  className={`bg-zinc-900 border rounded-2xl p-4 transition ${
                    abaixoMinimo
                      ? "border-red-500/40"
                      : "border-zinc-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-green-400 text-xs font-black mb-1">
                        {material.categoria || "Sem categoria"}
                      </p>

                      <h3 className="font-black text-lg leading-tight">
                        {material.nome}
                      </h3>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-bold ${
                          material.ativo !== false
                            ? "bg-green-500/20 text-green-300"
                            : "bg-red-500/20 text-red-300"
                        }`}
                      >
                        {material.ativo !== false
                          ? "Ativo"
                          : "Inativo"}
                      </span>

                      {abaixoMinimo && (
                        <span className="rounded-full bg-red-500/15 px-2 py-1 text-xs font-bold text-red-300">
                          Baixo estoque
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 text-sm text-zinc-400">
                    <p>
                      Metragem atual: {formatarMetragem(estoqueAtual)}
                    </p>

                    <p>
                      Estoque mínimo: {formatarMetragem(estoqueMinimoAtual)}
                    </p>

                    <p>
                      Custo: R$ {parseNumero(material.custoInterno).toFixed(2)}
                    </p>

                    <p>
                      Venda: R$ {parseNumero(material.precoVenda).toFixed(2)}
                    </p>

                    <p>
                      Fornecedor: {material.fornecedor || "Não informado"}
                    </p>
                  </div>

                  {historicoMaterial.length > 0 && (
                    <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
                      <p className="mb-2 text-xs font-bold uppercase text-zinc-500">
                        Últimas movimentações
                      </p>

                      <div className="flex flex-col gap-2">
                        {historicoMaterial.map((movimentacao) => (
                          <div
                            key={movimentacao.id}
                            className="flex items-center justify-between gap-3 text-xs"
                          >
                            <span
                              className={
                                movimentacao.tipo === "saida"
                                  ? "font-bold text-red-300"
                                  : "font-bold text-green-300"
                              }
                            >
                              {movimentacao.tipo === "saida" ? "Saída" : "Entrada"}
                            </span>
                            <span className="text-zinc-400">
                              {formatarMetragem(
                                movimentacao.quantidadeM2 || movimentacao.quantidade
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <button
                      onClick={() =>
                        movimentarEstoque(material, "entrada")
                      }
                      className="bg-green-500 text-black px-3 py-2 rounded-xl text-sm font-bold hover:bg-green-400 transition"
                    >
                      Entrada
                    </button>

                    <button
                      onClick={() =>
                        movimentarEstoque(material, "saida")
                      }
                      className="bg-yellow-500 text-black px-3 py-2 rounded-xl text-sm font-bold hover:bg-yellow-400 transition"
                    >
                      Saída
                    </button>

                    <button
                      onClick={() => alterarStatus(material)}
                      className="bg-blue-600 text-white px-3 py-2 rounded-xl text-sm font-bold hover:bg-blue-500 transition"
                    >
                      Status
                    </button>

                    <button
                      onClick={() => excluirMaterial(material.id)}
                      className="bg-red-500/20 text-red-300 px-3 py-2 rounded-xl text-sm font-bold hover:bg-red-500/30 transition"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
            </>
          ) : (
            <div className="space-y-8">
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <CardIndicador
                  titulo="Impressoras ativas"
                  valor={impressorasAtivas.length.toString()}
                  cor="text-green-300"
                />
                <CardIndicador
                  titulo="Total cadastrado"
                  valor={impressoras.length.toString()}
                  cor="text-zinc-200"
                />
                <CardIndicador
                  titulo="Maior largura"
                  valor={`${Math.max(
                    0,
                    ...impressoras.map((impressora) =>
                      parseNumero(impressora.larguraMaximaM)
                    )
                  ).toFixed(2)} m`}
                  cor="text-blue-300"
                />
              </div>

              <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black">
                      {impressoraEditandoId ? "Editar impressora" : "Nova impressora"}
                    </h2>
                    <p className="mt-1 text-sm text-zinc-400">
                      Cadastre impressoras em coleção separada para uso na Produção.
                    </p>
                  </div>

                  {impressoraEditandoId && (
                    <button
                      onClick={limparFormularioImpressora}
                      className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-zinc-700"
                    >
                      Cancelar edição
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
                  <input
                    placeholder="Nome da impressora"
                    value={formImpressora.nome}
                    onChange={(e) => atualizarFormImpressora("nome", e.target.value)}
                    className="lg:col-span-2 rounded-xl border border-zinc-700 bg-zinc-950 p-3 outline-none focus:border-green-500"
                  />

                  <select
                    value={formImpressora.tipo}
                    onChange={(e) => atualizarFormImpressora("tipo", e.target.value)}
                    className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 outline-none focus:border-green-500"
                  >
                    {TIPOS_IMPRESSORA.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {tipo}
                      </option>
                    ))}
                  </select>

                  <input
                    inputMode="decimal"
                    placeholder="Largura máxima (m)"
                    value={formImpressora.larguraMaximaM}
                    onChange={(e) =>
                      atualizarFormImpressora("larguraMaximaM", e.target.value)
                    }
                    className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 outline-none focus:border-green-500"
                  />

                  <input
                    inputMode="decimal"
                    placeholder="Velocidade m²/h"
                    value={formImpressora.velocidadeM2Hora}
                    onChange={(e) =>
                      atualizarFormImpressora("velocidadeM2Hora", e.target.value)
                    }
                    className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 outline-none focus:border-green-500"
                  />

                  <input
                    inputMode="numeric"
                    placeholder="Setup (min)"
                    value={formImpressora.tempoSetupMin}
                    onChange={(e) =>
                      atualizarFormImpressora("tempoSetupMin", e.target.value)
                    }
                    className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 outline-none focus:border-green-500"
                  />

                  <textarea
                    placeholder="Observações"
                    value={formImpressora.observacoes}
                    onChange={(e) =>
                      atualizarFormImpressora("observacoes", e.target.value)
                    }
                    className="lg:col-span-6 min-h-20 rounded-xl border border-zinc-700 bg-zinc-950 p-3 outline-none focus:border-green-500"
                  />
                </div>

                <button
                  onClick={salvarImpressora}
                  disabled={salvandoImpressora}
                  className="mt-6 rounded-xl bg-green-500 px-5 py-3 font-bold text-black hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {salvandoImpressora
                    ? "Salvando..."
                    : impressoraEditandoId
                      ? "Salvar alterações"
                      : "Salvar impressora"}
                </button>
              </div>

              <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-zinc-800 text-xs uppercase tracking-wide text-zinc-400">
                      <tr>
                        <th className="px-4 py-3">Impressora</th>
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3">Largura máxima</th>
                        <th className="px-4 py-3">Velocidade</th>
                        <th className="px-4 py-3">Setup</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Ações</th>
                      </tr>
                    </thead>

                    <tbody>
                      {impressoras.map((impressora) => (
                        <tr
                          key={impressora.id}
                          className="border-t border-zinc-800 text-zinc-300 hover:bg-zinc-800/50"
                        >
                          <td className="px-4 py-4 align-top font-black text-zinc-100">
                            {impressora.nome}
                          </td>
                          <td className="px-4 py-4 align-top whitespace-nowrap">
                            {impressora.tipo || "-"}
                          </td>
                          <td className="px-4 py-4 align-top whitespace-nowrap">
                            {parseNumero(impressora.larguraMaximaM).toFixed(2)} m
                          </td>
                          <td className="px-4 py-4 align-top whitespace-nowrap">
                            {parseNumero(impressora.velocidadeM2Hora).toFixed(2)} m²/h
                          </td>
                          <td className="px-4 py-4 align-top whitespace-nowrap">
                            {parseNumero(impressora.tempoSetupMin)} min
                          </td>
                          <td className="px-4 py-4 align-top">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                                impressora.ativo !== false
                                  ? "bg-green-500/15 text-green-300"
                                  : "bg-zinc-700 text-zinc-300"
                              }`}
                            >
                              {impressora.ativo !== false ? "Ativa" : "Arquivada"}
                            </span>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => editarImpressora(impressora)}
                                className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-300 hover:bg-blue-500/25"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => arquivarImpressora(impressora)}
                                className="rounded-full bg-yellow-500/15 px-3 py-1 text-xs font-bold text-yellow-300 hover:bg-yellow-500/25"
                              >
                                {impressora.ativo === false ? "Reativar" : "Arquivar"}
                              </button>
                              <button
                                onClick={() => excluirImpressora(impressora)}
                                className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300 hover:bg-red-500/25"
                              >
                                Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}

                      {impressoras.length === 0 && (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-4 py-8 text-center text-zinc-500"
                          >
                            Nenhuma impressora cadastrada.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
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
  valor: string;
  cor: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
      <p className="text-zinc-400 text-sm">{titulo}</p>

      <h2 className={`text-3xl font-black mt-2 ${cor}`}>
        {valor}
      </h2>
    </div>
  );
}

