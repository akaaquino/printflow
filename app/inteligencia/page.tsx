"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/app/lib/firebase";

export default function InteligenciaPage() {
  const [orcamentos, setOrcamentos] = useState<any[]>([]);
  const [producoes, setProducoes] = useState<any[]>([]);
  const [materiais, setMateriais] = useState<any[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<any[]>([]);
  const [busca, setBusca] = useState("");

  async function carregarDados() {
    const [orcamentosSnap, producoesSnap, materiaisSnap, movSnap] =
      await Promise.all([
        getDocs(collection(db, "orcamentos")),
        getDocs(collection(db, "producoes")),
        getDocs(collection(db, "materiais")),
        getDocs(collection(db, "movimentacoesEstoque")),
      ]);

    setOrcamentos(orcamentosSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    setProducoes(producoesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    setMateriais(materiaisSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    setMovimentacoes(movSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  }

  useEffect(() => {
    carregarDados();
  }, []);

  function dinheiro(valor: number) {
    return `R$ ${Number(valor || 0).toFixed(2)}`;
  }

  function timestamp(data: any) {
    if (!data) return 0;
    if (data.seconds) return data.seconds * 1000;
    if (data.toDate) return data.toDate().getTime();
    if (data instanceof Date) return data.getTime();

    const convertido = new Date(data).getTime();
    return Number.isNaN(convertido) ? 0 : convertido;
  }

  function vendaOS(os: any) {
    return Number(os.financeiro?.valorVenda || os.valor || 0);
  }

  function custoPrevistoOS(os: any) {
    return Number(os.financeiro?.custoPrevisto || 0);
  }

  function custoRealOS(os: any) {
    const movs = movimentacoes.filter((mov) => mov.numeroOS === os.numeroOS);

    const custo = movs.reduce((total, mov) => {
      const custoUnitario = Number(
        mov.custoUnitario || mov.custoInterno || mov.valorUnitario || 0
      );

      return total + Number(mov.quantidade || 0) * custoUnitario;
    }, 0);

    return custo > 0 ? custo : custoPrevistoOS(os);
  }

  function lucroPrevistoOS(os: any) {
    if (os.financeiro?.lucroPrevisto !== undefined) {
      return Number(os.financeiro.lucroPrevisto || 0);
    }

    return vendaOS(os) - custoPrevistoOS(os);
  }

  function lucroRealOS(os: any) {
    return vendaOS(os) - custoRealOS(os);
  }

  function margemRealOS(os: any) {
    const venda = vendaOS(os);
    if (venda <= 0) return 0;
    return (lucroRealOS(os) / venda) * 100;
  }

  function margemMinimaOS(os: any) {
    if (!os.itens || os.itens.length === 0) return 0;

    return Math.max(...os.itens.map((item: any) => Number(item.margemMinima || 0)));
  }

  function horasNoStatus(producao: any) {
    const base = producao.statusAtualizadoEm || producao.iniciadoEm || producao.criadoEm;
    const ts = timestamp(base);

    if (!ts) return 0;

    return Math.max(Math.floor((Date.now() - ts) / 1000 / 60 / 60), 0);
  }

  const totalVendido = orcamentos.reduce((total, os) => total + vendaOS(os), 0);

  const lucroPrevistoTotal = orcamentos.reduce(
    (total, os) => total + lucroPrevistoOS(os),
    0
  );

  const lucroRealTotal = orcamentos.reduce(
    (total, os) => total + lucroRealOS(os),
    0
  );

  const margemMediaReal =
    totalVendido > 0 ? (lucroRealTotal / totalVendido) * 100 : 0;

  const osCriticas = useMemo(() => {
    return orcamentos.filter((os) => {
      const margem = margemRealOS(os);
      const minima = margemMinimaOS(os);

      return vendaOS(os) > 0 && ((minima > 0 && margem < minima) || margem < 15);
    });
  }, [orcamentos, movimentacoes]);

  const materiaisCriticos = materiais.filter((material) => {
    return (
      material.ativo !== false &&
      Number(material.quantidade || 0) <= Number(material.estoqueMinimo || 0)
    );
  });

  const producoesParadas = producoes.filter((producao) => {
    if (producao.finalizado || producao.status === "Finalizado") return false;
    return horasNoStatus(producao) >= 24;
  });

  const rankingServicos = useMemo(() => {
    const mapa: Record<string, any> = {};

    orcamentos.forEach((os) => {
      const nome = os.servico || "Serviço não informado";

      if (!mapa[nome]) {
        mapa[nome] = { nome, quantidade: 0, venda: 0, lucro: 0 };
      }

      mapa[nome].quantidade += 1;
      mapa[nome].venda += vendaOS(os);
      mapa[nome].lucro += lucroRealOS(os);
    });

    return Object.values(mapa).sort((a, b) => b.lucro - a.lucro).slice(0, 5);
  }, [orcamentos, movimentacoes]);

  const rankingClientes = useMemo(() => {
    const mapa: Record<string, any> = {};

    orcamentos.forEach((os) => {
      const nome = os.cliente || "Cliente não informado";

      if (!mapa[nome]) {
        mapa[nome] = { nome, quantidade: 0, venda: 0, lucro: 0 };
      }

      mapa[nome].quantidade += 1;
      mapa[nome].venda += vendaOS(os);
      mapa[nome].lucro += lucroRealOS(os);
    });

    return Object.values(mapa).sort((a, b) => b.lucro - a.lucro).slice(0, 5);
  }, [orcamentos, movimentacoes]);

  const osCriticasFiltradas = osCriticas.filter((os) => {
    const termo = busca.toLowerCase();

    if (!termo) return true;

    return (
      String(os.numeroOS || "").toLowerCase().includes(termo) ||
      String(os.cliente || "").toLowerCase().includes(termo) ||
      String(os.servico || "").toLowerCase().includes(termo)
    );
  });

  return (
    <AuthGuard>
      <main className="flex min-h-screen bg-zinc-950 text-white">
        <Sidebar />

        <section className="flex-1 p-10">
          <div className="mb-10">
            <p className="text-green-400 font-semibold mb-2">
              BI + Inteligência operacional
            </p>

            <h1 className="text-5xl font-black mb-3">Inteligência</h1>

            <p className="text-zinc-400 max-w-4xl">
              Analise lucro real, margem, serviços mais lucrativos, clientes,
              estoque crítico e gargalos da produção.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-5 mb-8">
            <Card titulo="Faturamento" valor={dinheiro(totalVendido)} cor="text-green-400" />
            <Card titulo="Lucro previsto" valor={dinheiro(lucroPrevistoTotal)} cor="text-emerald-300" />
            <Card titulo="Lucro real" valor={dinheiro(lucroRealTotal)} cor="text-green-300" />
            <Card
              titulo="Margem real"
              valor={`${margemMediaReal.toFixed(1)}%`}
              cor={margemMediaReal < 20 ? "text-red-300" : "text-purple-300"}
            />
            <Card titulo="OS críticas" valor={osCriticas.length.toString()} cor="text-red-300" />
            <Card titulo="Produção parada" valor={producoesParadas.length.toString()} cor="text-orange-300" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-8">
            <Alerta
              ativo={osCriticas.length > 0}
              titulo={`${osCriticas.length} OS com margem crítica`}
              texto="Revise preço, desconto ou consumo real dessas OS."
              cor="red"
            />

            <Alerta
              ativo={materiaisCriticos.length > 0}
              titulo={`${materiaisCriticos.length} materiais abaixo do mínimo`}
              texto="Existe risco de parada na produção se o estoque não for reposto."
              cor="yellow"
            />

            <Alerta
              ativo={producoesParadas.length > 0}
              titulo={`${producoesParadas.length} produções paradas há mais de 24h`}
              texto="Existem gargalos operacionais que podem atrasar entregas."
              cor="orange"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
            <Ranking titulo="Serviços mais lucrativos" dados={rankingServicos} />
            <Ranking titulo="Clientes mais lucrativos" dados={rankingClientes} />

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
              <h2 className="text-2xl font-black mb-2">Materiais críticos</h2>

              <p className="text-zinc-400 text-sm mb-5">
                Materiais próximos ou abaixo do estoque mínimo.
              </p>

              <div className="flex flex-col gap-3">
                {materiaisCriticos.slice(0, 6).map((material) => (
                  <div
                    key={material.id}
                    className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-bold">{material.nome}</p>
                        <p className="text-zinc-500 text-sm">
                          {material.categoria || "Sem categoria"}
                        </p>
                      </div>

                      <span className="bg-red-500/20 text-red-300 px-3 py-1 rounded-full text-xs font-bold">
                        {material.quantidade || 0} / {material.estoqueMinimo || 0}
                      </span>
                    </div>
                  </div>
                ))}

                {materiaisCriticos.length === 0 && (
                  <p className="text-zinc-500">Nenhum material crítico.</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
              <h2 className="text-2xl font-black mb-2">Produções paradas</h2>

              <p className="text-zinc-400 text-sm mb-5">
                Produções sem movimentação há 24h ou mais.
              </p>

              <div className="flex flex-col gap-3">
                {producoesParadas.slice(0, 8).map((producao) => (
                  <div
                    key={producao.id}
                    className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-green-400 text-sm font-black">
                          {producao.numeroOS || "Sem OS"}
                        </p>

                        <p className="font-bold mt-1">
                          {producao.cliente || "Cliente não informado"}
                        </p>

                        <p className="text-zinc-500 text-sm">
                          {producao.status || "Sem status"}
                        </p>
                      </div>

                      <span className="bg-orange-500/20 text-orange-300 px-3 py-1 rounded-full text-xs font-bold">
                        {horasNoStatus(producao)}h parado
                      </span>
                    </div>
                  </div>
                ))}

                {producoesParadas.length === 0 && (
                  <p className="text-zinc-500">Nenhuma produção parada.</p>
                )}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
              <h2 className="text-2xl font-black mb-2">Leitura estratégica</h2>

              <p className="text-zinc-400 text-sm mb-5">
                Interpretação automática dos dados atuais.
              </p>

              <div className="space-y-4 text-zinc-300">
                <p>
                  O sistema compara venda, custo previsto, custo real e margem
                  real para encontrar OS com baixo lucro.
                </p>

                <p>
                  Quando houver movimentação de estoque vinculada à OS, o
                  PrintFlow aproxima o lucro real do resultado de produção.
                </p>

                <p>
                  A próxima evolução pode incluir sugestão de preço, previsão de
                  falta de material e análise de desperdício por operador.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
            <div className="p-6 border-b border-zinc-800">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black">OS críticas</h2>

                  <p className="text-zinc-400 text-sm mt-1">
                    OS com margem real abaixo da mínima ou abaixo de 15%.
                  </p>
                </div>

                <input
                  placeholder="Pesquisar OS, cliente ou serviço"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 w-80"
                />
              </div>
            </div>

            <table className="w-full text-left">
              <thead className="bg-zinc-800 text-zinc-300">
                <tr>
                  <th className="p-4">OS</th>
                  <th className="p-4">Cliente</th>
                  <th className="p-4">Serviço</th>
                  <th className="p-4">Venda</th>
                  <th className="p-4">Lucro real</th>
                  <th className="p-4">Margem real</th>
                  <th className="p-4">Mínima</th>
                </tr>
              </thead>

              <tbody>
                {osCriticasFiltradas.map((os) => (
                  <tr
                    key={os.id}
                    className="border-t border-zinc-800 hover:bg-zinc-800/40 transition"
                  >
                    <td className="p-4 font-bold text-green-400">
                      {os.numeroOS || "Sem OS"}
                    </td>

                    <td className="p-4">{os.cliente}</td>
                    <td className="p-4">{os.servico}</td>
                    <td className="p-4">{dinheiro(vendaOS(os))}</td>

                    <td className="p-4 text-red-300 font-bold">
                      {dinheiro(lucroRealOS(os))}
                    </td>

                    <td className="p-4">
                      <span className="bg-red-500/20 text-red-300 px-3 py-1 rounded-full text-sm font-bold">
                        {margemRealOS(os).toFixed(1)}%
                      </span>
                    </td>

                    <td className="p-4">{margemMinimaOS(os).toFixed(1)}%</td>
                  </tr>
                ))}

                {osCriticasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-zinc-400">
                      Nenhuma OS crítica encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </AuthGuard>
  );
}

function Card({
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

function Alerta({
  ativo,
  titulo,
  texto,
  cor,
}: {
  ativo: boolean;
  titulo: string;
  texto: string;
  cor: "red" | "yellow" | "orange";
}) {
  if (!ativo) {
    return (
      <div className="bg-green-500/10 border border-green-500/30 rounded-3xl p-5">
        <h3 className="text-green-300 font-black text-lg">Tudo certo</h3>
        <p className="text-zinc-300 mt-2">Nenhum alerta para este indicador.</p>
      </div>
    );
  }

  const classe =
    cor === "red"
      ? "bg-red-500/10 border-red-500/30 text-red-300"
      : cor === "yellow"
      ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-300"
      : "bg-orange-500/10 border-orange-500/30 text-orange-300";

  return (
    <div className={`border rounded-3xl p-5 ${classe}`}>
      <h3 className="font-black text-lg">{titulo}</h3>
      <p className="text-zinc-300 mt-2">{texto}</p>
    </div>
  );
}

function Ranking({
  titulo,
  dados,
}: {
  titulo: string;
  dados: any[];
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
      <h2 className="text-2xl font-black mb-2">{titulo}</h2>

      <p className="text-zinc-400 text-sm mb-5">
        Ranking por lucro real acumulado.
      </p>

      <div className="flex flex-col gap-3">
        {dados.map((item, index) => (
          <div
            key={item.nome}
            className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-green-400 text-sm font-black">
                  #{index + 1}
                </p>

                <h3 className="font-bold mt-1">{item.nome}</h3>

                <p className="text-zinc-500 text-sm mt-1">
                  {item.quantidade} OS • R$ {item.venda.toFixed(2)} vendido
                </p>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  item.lucro < 0
                    ? "bg-red-500/20 text-red-300"
                    : "bg-green-500/20 text-green-300"
                }`}
              >
                R$ {item.lucro.toFixed(2)}
              </span>
            </div>
          </div>
        ))}

        {dados.length === 0 && (
          <p className="text-zinc-500">Nenhum dado disponível ainda.</p>
        )}
      </div>
    </div>
  );
}
