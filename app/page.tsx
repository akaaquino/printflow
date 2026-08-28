"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";

import { collection, getDocs } from "firebase/firestore";
import { db } from "@/app/lib/firebase";

type PeriodoDashboard = "hoje" | "semana" | "tudo";

export default function Home() {
  const [orcamentos, setOrcamentos] = useState<any[]>([]);
  const [artes, setArtes] = useState<any[]>([]);
  const [producoes, setProducoes] = useState<any[]>([]);
  const [instalacoes, setInstalacoes] = useState<any[]>([]);

  const [periodoDashboard, setPeriodoDashboard] =
    useState<PeriodoDashboard>("hoje");
  const [detalhe, setDetalhe] = useState<any>(null);
  const [mostrarFinalizados, setMostrarFinalizados] = useState(false);
  const [buscaFinalizados, setBuscaFinalizados] = useState("");

  async function carregarDashboard() {
    const orcamentosSnapshot = await getDocs(collection(db, "orcamentos"));
    const artesSnapshot = await getDocs(collection(db, "artes"));
    const producoesSnapshot = await getDocs(collection(db, "producoes"));
    const instalacoesSnapshot = await getDocs(collection(db, "instalacoes"));

    setOrcamentos(
      orcamentosSnapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
        tipo: "Orçamento",
      }))
    );

    setArtes(
      artesSnapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
        tipo: "Aprovação",
      }))
    );

    setProducoes(
      producoesSnapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
        tipo: "Produção",
      }))
    );

    setInstalacoes(
      instalacoesSnapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
        tipo: "Instalação",
      }))
    );
  }

  useEffect(() => {
    carregarDashboard();
  }, []);

  function obterData(data: any) {
    if (!data) return null;

    const dataItem = data?.toDate ? data.toDate() : new Date(data);

    return Number.isNaN(dataItem.getTime()) ? null : dataItem;
  }

  function estaNoPeriodo(data: any, periodo: PeriodoDashboard) {
    if (periodo === "tudo") return true;

    const dataItem = obterData(data);
    if (!dataItem) return false;

    const hoje = new Date();
    const inicioHoje = new Date(
      hoje.getFullYear(),
      hoje.getMonth(),
      hoje.getDate()
    );
    const fimHoje = new Date(inicioHoje);
    fimHoje.setDate(fimHoje.getDate() + 1);

    if (periodo === "hoje") {
      return dataItem >= inicioHoje && dataItem < fimHoje;
    }

    const inicioSemana = new Date(inicioHoje);
    const diaSemana = inicioSemana.getDay();
    const diasDesdeSegunda = diaSemana === 0 ? 6 : diaSemana - 1;
    inicioSemana.setDate(inicioSemana.getDate() - diasDesdeSegunda);

    const fimSemana = new Date(inicioSemana);
    fimSemana.setDate(fimSemana.getDate() + 7);

    return dataItem >= inicioSemana && dataItem < fimSemana;
  }

  const orcamentosPendentes = orcamentos.filter(
    (item) =>
      item.status === "Em aprovação" &&
      estaNoPeriodo(item.criadoEm, periodoDashboard)
  );

  const artesEmEspera = artes.filter(
    (item) =>
      item.status === "Pendente" &&
      estaNoPeriodo(item.criadoEm, periodoDashboard)
  );

  const producoesAtivas = producoes.filter(
    (item) =>
      !item.finalizado && estaNoPeriodo(item.criadoEm, periodoDashboard)
  );

  const instalacoesPendentes = instalacoes.filter(
    (item) =>
      !item.finalizado && estaNoPeriodo(item.criadoEm, periodoDashboard)
  );

  const finalizados = [
    ...producoes.filter(
      (item) =>
        item.finalizado && estaNoPeriodo(item.finalizadoEm, periodoDashboard)
    ),
    ...instalacoes.filter(
      (item) =>
        item.finalizado && estaNoPeriodo(item.finalizadoEm, periodoDashboard)
    ),
  ].sort((a, b) => {
    const dataA = a.finalizadoEm?.seconds || 0;
    const dataB = b.finalizadoEm?.seconds || 0;

    return dataB - dataA;
  });

  const finalizadosRecentes = finalizados.slice(0, 2);

  const trabalhosPendentes =
    orcamentosPendentes.length +
    artesEmEspera.length +
    producoesAtivas.length +
    instalacoesPendentes.length;

  const finalizadosFiltrados = finalizados.filter((item) => {
    const busca = buscaFinalizados.toLowerCase();

    const data =
      item.finalizadoEm?.toDate?.().toLocaleDateString("pt-BR") ||
      item.data ||
      "";

    return (
      item.numeroOS?.toString().toLowerCase().includes(busca) ||
      item.cliente?.toLowerCase().includes(busca) ||
      item.servico?.toLowerCase().includes(busca) ||
      data.toLowerCase().includes(busca)
    );
  });

  function CardResumo({
    titulo,
    valor,
    descricao,
  }: {
    titulo: string;
    valor: number;
    descricao: string;
  }) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
        <p className="text-zinc-400 text-sm">{titulo}</p>
        <h2 className="text-4xl font-black mt-3">{valor}</h2>
        <p className="text-zinc-500 text-sm mt-2">{descricao}</p>
      </div>
    );
  }

  function CardItem({ item }: { item: any }) {
    return (
      <button
        onClick={() => setDetalhe(item)}
        className="text-left bg-zinc-950 border border-zinc-800 rounded-2xl p-4 hover:border-green-500 hover:scale-[1.02] transition-all duration-200"
      >
        <p className="text-green-400 text-xs font-bold mb-1">
          {item.numeroOS || "Sem OS"}
        </p>

        <p className="font-bold">
          {item.servico || item.nomeArte || "Serviço sem nome"}
        </p>

        <p className="text-zinc-400 text-sm mt-1">
          {item.cliente || "Cliente não informado"}
        </p>

        <p className="text-blue-300 text-sm mt-3 font-semibold">
          Clique para ver detalhes
        </p>
      </button>
    );
  }

  return (
    <AuthGuard>
      <main className="flex min-h-screen bg-zinc-950 text-white">
        <Sidebar />

        <section className="flex-1 p-10">
          <div className="mb-10">
            <p className="text-green-400 font-semibold mb-2">
              Centro operacional diário
            </p>

            <h1 className="text-5xl font-black mb-3">Dashboard</h1>

            <div className="mb-4 flex flex-wrap gap-2">
              {[
                { id: "hoje", label: "Hoje" },
                { id: "semana", label: "Esta semana" },
                { id: "tudo", label: "Tudo" },
              ].map((periodo) => (
                <button
                  key={periodo.id}
                  type="button"
                  onClick={() =>
                    setPeriodoDashboard(periodo.id as PeriodoDashboard)
                  }
                  className={
                    "rounded-full border px-4 py-2 text-xs font-black transition " +
                    (periodoDashboard === periodo.id
                      ? "border-green-500 bg-green-500 text-black"
                      : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800")
                  }
                >
                  {periodo.label}
                </button>
              ))}
            </div>

            <p className="text-zinc-400 max-w-2xl">
              Acompanhe os trabalhos por período: orçamento, aprovação,
              produção, instalação e finalização.
            </p>
          </div>

          <div className="grid grid-cols-4 gap-5 mb-10">
            <CardResumo
              titulo="Trabalhos pendentes hoje"
              valor={trabalhosPendentes}
              descricao="Orçamentos, artes, produção e instalação"
            />

            <CardResumo
              titulo="Orçamentos hoje"
              valor={orcamentosPendentes.length}
              descricao="Aguardando resposta"
            />

            <CardResumo
              titulo="Instalações hoje"
              valor={instalacoesPendentes.length}
              descricao="Aguardando execução"
            />

            <CardResumo
              titulo="Artes hoje"
              valor={artesEmEspera.length}
              descricao="Aguardando aprovação"
            />
          </div>

          <div className="grid grid-cols-5 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-lg">Orçamento</h3>

                <span className="bg-yellow-500/20 text-yellow-300 px-3 py-1 rounded-full text-sm">
                  {orcamentosPendentes.length}
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {orcamentosPendentes.length > 0 ? (
                  orcamentosPendentes.map((item) => (
                    <CardItem key={item.id} item={item} />
                  ))
                ) : (
                  <p className="text-zinc-500 text-sm">
                    Nenhum orçamento de hoje.
                  </p>
                )}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-lg">Aprovação</h3>

                <span className="bg-orange-500/20 text-orange-300 px-3 py-1 rounded-full text-sm">
                  {artesEmEspera.length}
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {artesEmEspera.length > 0 ? (
                  artesEmEspera.map((item) => (
                    <CardItem key={item.id} item={item} />
                  ))
                ) : (
                  <p className="text-zinc-500 text-sm">
                    Nenhuma arte de hoje.
                  </p>
                )}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-lg">Produção</h3>

                <span className="bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full text-sm">
                  {producoesAtivas.length}
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {producoesAtivas.length > 0 ? (
                  producoesAtivas.map((item) => (
                    <CardItem key={item.id} item={item} />
                  ))
                ) : (
                  <p className="text-zinc-500 text-sm">
                    Nada em produção hoje.
                  </p>
                )}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-lg">Instalação</h3>

                <span className="bg-purple-500/20 text-purple-300 px-3 py-1 rounded-full text-sm">
                  {instalacoesPendentes.length}
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {instalacoesPendentes.length > 0 ? (
                  instalacoesPendentes.map((item) => (
                    <CardItem key={item.id} item={item} />
                  ))
                ) : (
                  <p className="text-zinc-500 text-sm">
                    Nenhuma instalação de hoje.
                  </p>
                )}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-lg">Finalizado</h3>

                <span className="bg-green-500/20 text-green-300 px-3 py-1 rounded-full text-sm">
                  {finalizados.length}
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {finalizadosRecentes.length > 0 ? (
                  <>
                    {finalizadosRecentes.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setDetalhe(item)}
                        className="text-left bg-zinc-950 border border-green-500/20 rounded-xl p-3 hover:border-green-500 transition"
                      >
                        <p className="text-green-400 text-xs font-bold mb-1">
                          {item.numeroOS || "Sem OS"}
                        </p>

                        <p className="font-semibold text-sm mt-1">
                          {item.servico || item.nomeArte || "Serviço sem nome"}
                        </p>

                        <p className="text-zinc-400 text-xs mt-1">
                          {item.cliente || "Cliente não informado"}
                        </p>
                      </button>
                    ))}

                    {finalizados.length > 2 && (
                      <button
                        onClick={() => setMostrarFinalizados(true)}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl py-2 text-sm font-semibold transition"
                      >
                        Ver todos ({finalizados.length})
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-zinc-500 text-sm">
                    Nenhum trabalho finalizado hoje.
                  </p>
                )}
              </div>
            </div>
          </div>

          {mostrarFinalizados && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="text-green-400 font-semibold">
                      Histórico de hoje
                    </p>

                    <h2 className="text-3xl font-black">
                      Trabalhos finalizados
                    </h2>
                  </div>

                  <button
                    onClick={() => setMostrarFinalizados(false)}
                    className="bg-zinc-800 text-zinc-300 px-4 py-2 rounded-xl hover:bg-zinc-700"
                  >
                    Fechar
                  </button>
                </div>

                <div className="mb-6">
                  <input
                    type="text"
                    placeholder="Pesquisar por OS, cliente, serviço ou data..."
                    value={buscaFinalizados}
                    onChange={(e) => setBuscaFinalizados(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 outline-none focus:border-green-500 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {finalizadosFiltrados.length > 0 ? (
                    finalizadosFiltrados.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setDetalhe(item);
                          setMostrarFinalizados(false);
                        }}
                        className="text-left bg-zinc-950 border border-green-500/20 rounded-xl p-3 hover:border-green-500 transition"
                      >
                        <p className="text-green-400 text-xs font-bold mb-1">
                          {item.numeroOS || "Sem OS"}
                        </p>

                        <p className="font-semibold text-sm mt-1">
                          {item.servico || item.nomeArte || "Serviço sem nome"}
                        </p>

                        <p className="text-zinc-400 text-xs mt-1">
                          {item.cliente || "Cliente não informado"}
                        </p>
                      </button>
                    ))
                  ) : (
                    <div className="col-span-2 bg-zinc-950 border border-zinc-800 rounded-2xl p-6 text-zinc-400">
                      Nenhum trabalho finalizado encontrado.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {detalhe && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="text-green-400 font-semibold">
                      {detalhe.tipo}
                    </p>

                    <h2 className="text-3xl font-black">
                      {detalhe.servico || detalhe.nomeArte || "Serviço"}
                    </h2>

                    <p className="text-zinc-400 mt-1">
                      {detalhe.numeroOS || "Sem OS"}
                    </p>
                  </div>

                  <button
                    onClick={() => setDetalhe(null)}
                    className="bg-zinc-800 text-zinc-300 px-4 py-2 rounded-xl hover:bg-zinc-700"
                  >
                    Fechar
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-zinc-400 text-sm">Cliente</p>
                    <p className="font-bold mt-1">
                      {detalhe.cliente || "Não informado"}
                    </p>
                  </div>

                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-zinc-400 text-sm">Status</p>
                    <p className="font-bold mt-1">
                      {detalhe.status || "Não informado"}
                    </p>
                  </div>

                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-zinc-400 text-sm">Material</p>
                    <p className="font-bold mt-1">
                      {detalhe.material || detalhe.servico || "Não informado"}
                    </p>
                  </div>

                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-zinc-400 text-sm">Medida</p>
                    <p className="font-bold mt-1">
                      {detalhe.medida || "Não informada"}
                    </p>
                  </div>

                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-zinc-400 text-sm">Responsável</p>
                    <p className="font-bold mt-1">
                      {detalhe.responsavel || "Sem responsável"}
                    </p>
                  </div>

                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-zinc-400 text-sm">Prioridade</p>
                    <p className="font-bold mt-1">
                      {detalhe.prioridade || "Normal"}
                    </p>
                  </div>
                </div>

                {detalhe.endereco && (
                  <div className="mt-4 bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-zinc-400 text-sm">Instalação</p>

                    <p className="font-bold mt-1">{detalhe.endereco}</p>

                    <p className="text-zinc-400 text-sm mt-2">
                      {detalhe.data || "Sem data"} às{" "}
                      {detalhe.horario || "sem horário"}
                    </p>
                  </div>
                )}

                {detalhe.arquivos?.length > 0 && (
                  <div className="mt-6">
                    <p className="text-zinc-400 text-sm mb-3">
                      Arquivos / Mockups
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                      {detalhe.arquivos.map((arquivo: any, index: number) => (
                        <a
                          key={index}
                          href={arquivo.url}
                          target="_blank"
                          className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 hover:border-blue-500 transition"
                        >
                          <p className="font-semibold break-all">
                            {arquivo.nome}
                          </p>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </AuthGuard>
  );
}
