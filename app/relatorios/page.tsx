"use client";

import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";

import { collection, getDocs } from "firebase/firestore";
import { db } from "@/app/lib/firebase";

export default function RelatoriosPage() {
  const [orcamentos, setOrcamentos] = useState<any[]>([]);
  const [producoes, setProducoes] = useState<any[]>([]);
  const [materiais, setMateriais] = useState<any[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<any[]>([]);
  const [pedidosComerciais, setPedidosComerciais] = useState<any[]>([]);

  const [abaAtiva, setAbaAtiva] = useState("resumo");
  const [busca, setBusca] = useState("");

  async function carregarDados() {
    const [
      orcamentosSnap,
      producoesSnap,
      materiaisSnap,
      movimentacoesSnap,
      pedidosComerciaisSnap,
    ] = await Promise.all([
      getDocs(collection(db, "orcamentos")),
      getDocs(collection(db, "producoes")),
      getDocs(collection(db, "materiais")),
      getDocs(collection(db, "movimentacoesEstoque")),
      getDocs(collection(db, "crm")),
    ]);

    setOrcamentos(
      orcamentosSnap.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }))
    );

    setProducoes(
      producoesSnap.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }))
    );

    setMateriais(
      materiaisSnap.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }))
    );

    setMovimentacoes(
      movimentacoesSnap.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }))
    );

    setPedidosComerciais(
      pedidosComerciaisSnap.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }))
    );
  }

  useEffect(() => {
    carregarDados();
  }, []);

  function dinheiro(valor: number) {
    return `R$ ${Number(valor || 0).toFixed(2)}`;
  }

  function exportarPDFResumo() {
    const pdf = new jsPDF();

    pdf.setFillColor(10, 10, 10);
    pdf.rect(0, 0, 210, 32, "F");

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(24);
    pdf.setFont("helvetica", "bold");
    pdf.text("PRINTFLOW", 14, 17);

    pdf.setFontSize(11);
    pdf.setFont("helvetica", "normal");
    pdf.text("Relatório Executivo", 14, 25);

    pdf.setTextColor(0, 0, 0);

    let y = 45;

    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text("Resumo Financeiro", 14, y);

    y += 8;

    const resumo = [
      ["Total vendido", dinheiro(totalVendido)],
      ["Custo previsto", dinheiro(custoPrevistoTotal)],
      ["Custo real", dinheiro(custoRealTotal)],
      ["Lucro previsto", dinheiro(lucroPrevistoTotal)],
      ["Lucro real", dinheiro(lucroRealTotal)],
      ["Margem real", `${margemRealMedia.toFixed(1)}%`],
      ["OS críticas", String(osCriticas.length)],
      ["Produções paradas", String(producoesParadas.length)],
      ["Materiais abaixo do mínimo", String(materiaisBaixoEstoque.length)],
    ];

    autoTable(pdf, {
      startY: y,
      head: [["Indicador", "Valor"]],
      body: resumo,
      theme: "grid",
      headStyles: {
        fillColor: [0, 0, 0],
        textColor: [255, 255, 255],
      },
      styles: {
        fontSize: 10,
      },
    });

    let finalY = (pdf as any).lastAutoTable.finalY + 14;

    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text("OS Críticas", 14, finalY);

    autoTable(pdf, {
      startY: finalY + 8,
      head: [["OS", "Cliente", "Serviço", "Venda", "Lucro Real", "Margem"]],
      body: osCriticas.slice(0, 20).map((orcamento) => [
        orcamento.numeroOS || "-",
        orcamento.cliente || "-",
        orcamento.servico || "-",
        dinheiro(vendaOS(orcamento)),
        dinheiro(lucroRealOS(orcamento)),
        `${margemRealOS(orcamento).toFixed(1)}%`,
      ]),
      theme: "grid",
      headStyles: {
        fillColor: [0, 0, 0],
        textColor: [255, 255, 255],
      },
      styles: {
        fontSize: 8,
      },
    });

    finalY = (pdf as any).lastAutoTable.finalY + 14;

    if (finalY > 240) {
      pdf.addPage();
      finalY = 20;
    }

    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text("Materiais abaixo do mínimo", 14, finalY);

    autoTable(pdf, {
      startY: finalY + 8,
      head: [["Material", "Categoria", "Quantidade", "Mínimo", "Fornecedor"]],
      body: materiaisBaixoEstoque.slice(0, 20).map((material) => [
        material.nome || "-",
        material.categoria || "-",
        `${material.quantidade || 0} ${material.unidade || ""}`,
        String(material.estoqueMinimo || 0),
        material.fornecedor || "-",
      ]),
      theme: "grid",
      headStyles: {
        fillColor: [0, 0, 0],
        textColor: [255, 255, 255],
      },
      styles: {
        fontSize: 8,
      },
    });

    finalY = (pdf as any).lastAutoTable.finalY + 14;

    if (finalY > 240) {
      pdf.addPage();
      finalY = 20;
    }

    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text("Produções paradas", 14, finalY);

    autoTable(pdf, {
      startY: finalY + 8,
      head: [["OS", "Cliente", "Status", "Horas", "Atualizado em"]],
      body: producoesParadas.slice(0, 20).map((producao) => [
        producao.numeroOS || "-",
        producao.cliente || "-",
        producao.status || "-",
        `${horasNoStatus(producao)}h`,
        formatarData(producao.statusAtualizadoEm),
      ]),
      theme: "grid",
      headStyles: {
        fillColor: [0, 0, 0],
        textColor: [255, 255, 255],
      },
      styles: {
        fontSize: 8,
      },
    });

    pdf.setFontSize(9);
    pdf.setTextColor(120, 120, 120);
    pdf.text(
      `Gerado em ${new Date().toLocaleString("pt-BR")}`,
      14,
      287
    );

    pdf.save(`relatorio-printflow-${new Date().getTime()}.pdf`);
  }

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

  function vendaOS(orcamento: any) {
    return Number(orcamento.financeiro?.valorVenda || orcamento.valor || 0);
  }

  function custoPrevistoOS(orcamento: any) {
    return Number(orcamento.financeiro?.custoPrevisto || 0);
  }

  function custoRealOS(orcamento: any) {
    const movimentacoesDaOS = movimentacoes.filter(
      (movimentacao) => movimentacao.numeroOS === orcamento.numeroOS
    );

    const custoReal = movimentacoesDaOS.reduce((total, movimentacao) => {
      const custoUnitario = Number(
        movimentacao.custoUnitario ||
          movimentacao.custoInterno ||
          movimentacao.valorUnitario ||
          0
      );

      return total + Number(movimentacao.quantidade || 0) * custoUnitario;
    }, 0);

    if (custoReal > 0) return custoReal;

    return custoPrevistoOS(orcamento);
  }

  function lucroPrevistoOS(orcamento: any) {
    if (orcamento.financeiro?.lucroPrevisto !== undefined) {
      return Number(orcamento.financeiro.lucroPrevisto || 0);
    }

    return vendaOS(orcamento) - custoPrevistoOS(orcamento);
  }

  function lucroRealOS(orcamento: any) {
    return vendaOS(orcamento) - custoRealOS(orcamento);
  }

  function margemRealOS(orcamento: any) {
    const venda = vendaOS(orcamento);

    if (venda <= 0) return 0;

    return (lucroRealOS(orcamento) / venda) * 100;
  }

  function margemMinimaOS(orcamento: any) {
    if (!orcamento.itens || orcamento.itens.length === 0) return 0;

    return Math.max(
      ...orcamento.itens.map((item: any) => Number(item.margemMinima || 0))
    );
  }

  function horasNoStatus(producao: any) {
    const dataBase =
      producao.statusAtualizadoEm || producao.iniciadoEm || producao.criadoEm;

    const timestamp = obterTimestamp(dataBase);

    if (!timestamp) return 0;

    return Math.max(Math.floor((Date.now() - timestamp) / 1000 / 60 / 60), 0);
  }

  function producaoParada(producao: any) {
    if (producao.finalizado || producao.status === "Finalizado") return false;

    return horasNoStatus(producao) >= 24;
  }

  const totalVendido = orcamentos.reduce(
    (total, orcamento) => total + vendaOS(orcamento),
    0
  );

  const custoPrevistoTotal = orcamentos.reduce(
    (total, orcamento) => total + custoPrevistoOS(orcamento),
    0
  );

  const custoRealTotal = orcamentos.reduce(
    (total, orcamento) => total + custoRealOS(orcamento),
    0
  );

  const lucroPrevistoTotal = orcamentos.reduce(
    (total, orcamento) => total + lucroPrevistoOS(orcamento),
    0
  );

  const lucroRealTotal = orcamentos.reduce(
    (total, orcamento) => total + lucroRealOS(orcamento),
    0
  );

  const margemRealMedia =
    totalVendido > 0 ? (lucroRealTotal / totalVendido) * 100 : 0;

  const osCriticas = useMemo(() => {
    return orcamentos.filter((orcamento) => {
      const margemReal = margemRealOS(orcamento);
      const margemMinima = margemMinimaOS(orcamento);

      return (
        vendaOS(orcamento) > 0 &&
        ((margemMinima > 0 && margemReal < margemMinima) || margemReal < 15)
      );
    });
  }, [orcamentos, movimentacoes]);

  const materiaisBaixoEstoque = materiais.filter((material) => {
    return (
      material.ativo !== false &&
      Number(material.quantidade || 0) <= Number(material.estoqueMinimo || 0)
    );
  });

  const producoesParadas = producoes.filter((producao) =>
    producaoParada(producao)
  );

  const rankingClientes = useMemo(() => {
    const mapa: Record<string, any> = {};

    orcamentos.forEach((orcamento) => {
      const nome = orcamento.cliente || "Cliente não informado";

      if (!mapa[nome]) {
        mapa[nome] = {
          nome,
          quantidade: 0,
          venda: 0,
          lucro: 0,
        };
      }

      mapa[nome].quantidade += 1;
      mapa[nome].venda += vendaOS(orcamento);
      mapa[nome].lucro += lucroRealOS(orcamento);
    });

    return Object.values(mapa).sort((a, b) => b.lucro - a.lucro);
  }, [orcamentos, movimentacoes]);

  const rankingServicos = useMemo(() => {
    const mapa: Record<string, any> = {};

    orcamentos.forEach((orcamento) => {
      const nome = orcamento.servico || "Serviço não informado";

      if (!mapa[nome]) {
        mapa[nome] = {
          nome,
          quantidade: 0,
          venda: 0,
          lucro: 0,
        };
      }

      mapa[nome].quantidade += 1;
      mapa[nome].venda += vendaOS(orcamento);
      mapa[nome].lucro += lucroRealOS(orcamento);
    });

    return Object.values(mapa).sort((a, b) => b.lucro - a.lucro);
  }, [orcamentos, movimentacoes]);

  const osCriticasFiltradas = osCriticas.filter((orcamento) => {
    const termo = busca.toLowerCase();

    if (!termo) return true;

    return (
      String(orcamento.numeroOS || "").toLowerCase().includes(termo) ||
      String(orcamento.cliente || "").toLowerCase().includes(termo) ||
      String(orcamento.servico || "").toLowerCase().includes(termo)
    );
  });

  function valorPedidoComercial(pedido: any) {
    return Number(pedido.valorEstimado || 0);
  }

  function pedidoComercialParado(pedido: any) {
    if (
      pedido.status === "Fechado" ||
      pedido.status === "Perdido" ||
      pedido.status === "Convertido em orçamento"
    ) {
      return false;
    }

    const base = pedido.atualizadoEm || pedido.criadoEm;
    const timestamp = obterTimestamp(base);

    if (!timestamp) return false;

    const dias = Math.floor((Date.now() - timestamp) / 1000 / 60 / 60 / 24);

    return dias >= 3;
  }

  function diasPedidoParado(pedido: any) {
    const base = pedido.atualizadoEm || pedido.criadoEm;
    const timestamp = obterTimestamp(base);

    if (!timestamp) return 0;

    return Math.floor((Date.now() - timestamp) / 1000 / 60 / 60 / 24);
  }

  const pedidosComerciaisAtivos = pedidosComerciais.filter(
    (pedido) => !pedido.oculto
  );

  const totalPedidosComerciais = pedidosComerciais.length;

  const valorComercialEmNegociacao = pedidosComerciais
    .filter(
      (pedido) =>
        pedido.status !== "Fechado" &&
        pedido.status !== "Perdido" &&
        pedido.status !== "Convertido em orçamento"
    )
    .reduce((total, pedido) => total + valorPedidoComercial(pedido), 0);

  const valorComercialFechado = pedidosComerciais
    .filter(
      (pedido) =>
        pedido.status === "Fechado" ||
        pedido.status === "Convertido em orçamento" ||
        pedido.oculto
    )
    .reduce((total, pedido) => total + valorPedidoComercial(pedido), 0);

  const valorComercialPerdido = pedidosComerciais
    .filter((pedido) => pedido.status === "Perdido")
    .reduce((total, pedido) => total + valorPedidoComercial(pedido), 0);

  const pedidosComerciaisParados = pedidosComerciais.filter((pedido) =>
    pedidoComercialParado(pedido)
  );

  const taxaConversaoComercial =
    totalPedidosComerciais > 0
      ? (pedidosComerciais.filter(
          (pedido) =>
            pedido.status === "Fechado" ||
            pedido.status === "Convertido em orçamento" ||
            pedido.oculto
        ).length /
          totalPedidosComerciais) *
        100
      : 0;

  const rankingOrigemComercial = useMemo(() => {
    const mapa: Record<string, any> = {};

    pedidosComerciais.forEach((pedido) => {
      const origem = pedido.origem || "Não informado";

      if (!mapa[origem]) {
        mapa[origem] = {
          nome: origem,
          quantidade: 0,
          valor: 0,
          fechados: 0,
          perdidos: 0,
        };
      }

      mapa[origem].quantidade += 1;
      mapa[origem].valor += valorPedidoComercial(pedido);

      if (
        pedido.status === "Fechado" ||
        pedido.status === "Convertido em orçamento" ||
        pedido.oculto
      ) {
        mapa[origem].fechados += 1;
      }

      if (pedido.status === "Perdido") {
        mapa[origem].perdidos += 1;
      }
    });

    return Object.values(mapa).sort((a, b) => b.valor - a.valor);
  }, [pedidosComerciais]);

  const rankingVendedorComercial = useMemo(() => {
    const mapa: Record<string, any> = {};

    pedidosComerciais.forEach((pedido) => {
      const vendedor = pedido.vendedor || "Não informado";

      if (!mapa[vendedor]) {
        mapa[vendedor] = {
          nome: vendedor,
          quantidade: 0,
          valor: 0,
          fechados: 0,
          valorFechado: 0,
          perdidos: 0,
        };
      }

      mapa[vendedor].quantidade += 1;
      mapa[vendedor].valor += valorPedidoComercial(pedido);

      if (
        pedido.status === "Fechado" ||
        pedido.status === "Convertido em orçamento" ||
        pedido.oculto
      ) {
        mapa[vendedor].fechados += 1;
        mapa[vendedor].valorFechado += valorPedidoComercial(pedido);
      }

      if (pedido.status === "Perdido") {
        mapa[vendedor].perdidos += 1;
      }
    });

    return Object.values(mapa).sort((a, b) => b.valorFechado - a.valorFechado);
  }, [pedidosComerciais]);

  const rankingMotivosPerda = useMemo(() => {
    const mapa: Record<string, any> = {};

    pedidosComerciais
      .filter((pedido) => pedido.status === "Perdido")
      .forEach((pedido) => {
        const motivo = pedido.motivoPerda || "Não informado";

        if (!mapa[motivo]) {
          mapa[motivo] = {
            nome: motivo,
            quantidade: 0,
            valor: 0,
          };
        }

        mapa[motivo].quantidade += 1;
        mapa[motivo].valor += valorPedidoComercial(pedido);
      });

    return Object.values(mapa).sort((a, b) => b.valor - a.valor);
  }, [pedidosComerciais]);

  return (
    <AuthGuard>
      <main className="flex min-h-screen bg-zinc-950 text-white">
        <Sidebar />

        <section className="flex-1 p-10">
          <div className="mb-10">
            <p className="text-green-400 font-semibold mb-2">
              Relatórios inteligentes
            </p>

            <h1 className="text-5xl font-black mb-3">Relatórios</h1>

            <p className="text-zinc-400 max-w-4xl">
              Acompanhe relatórios financeiros, operacionais, estoque,
              clientes, serviços e OS críticas.
            </p>

            <div className="flex gap-3 mt-5">
              <button
                onClick={exportarPDFResumo}
                className="bg-green-500 text-black px-5 py-3 rounded-xl font-bold hover:bg-green-400 transition"
              >
                Exportar PDF
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-5 mb-8">
            <CardRelatorio
              titulo="Total vendido"
              valor={dinheiro(totalVendido)}
              cor="text-green-400"
            />

            <CardRelatorio
              titulo="Lucro previsto"
              valor={dinheiro(lucroPrevistoTotal)}
              cor="text-emerald-300"
            />

            <CardRelatorio
              titulo="Lucro real"
              valor={dinheiro(lucroRealTotal)}
              cor="text-green-300"
            />

            <CardRelatorio
              titulo="Margem real"
              valor={`${margemRealMedia.toFixed(1)}%`}
              cor={margemRealMedia < 20 ? "text-red-300" : "text-purple-300"}
            />

            <CardRelatorio
              titulo="OS críticas"
              valor={osCriticas.length.toString()}
              cor="text-red-300"
            />

            <CardRelatorio
              titulo="Produção parada"
              valor={producoesParadas.length.toString()}
              cor="text-orange-300"
            />
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-3 mb-8 flex flex-wrap gap-2">
            <BotaoAba
              ativo={abaAtiva === "resumo"}
              onClick={() => setAbaAtiva("resumo")}
              texto="Resumo"
            />

            <BotaoAba
              ativo={abaAtiva === "financeiro"}
              onClick={() => setAbaAtiva("financeiro")}
              texto="Financeiro"
            />

            <BotaoAba
              ativo={abaAtiva === "comercial"}
              onClick={() => setAbaAtiva("comercial")}
              texto="Comercial"
            />

            <BotaoAba
              ativo={abaAtiva === "criticas"}
              onClick={() => setAbaAtiva("criticas")}
              texto="OS críticas"
            />

            <BotaoAba
              ativo={abaAtiva === "estoque"}
              onClick={() => setAbaAtiva("estoque")}
              texto="Estoque"
            />

            <BotaoAba
              ativo={abaAtiva === "producao"}
              onClick={() => setAbaAtiva("producao")}
              texto="Produção"
            />

            <BotaoAba
              ativo={abaAtiva === "rankings"}
              onClick={() => setAbaAtiva("rankings")}
              texto="Rankings"
            />
          </div>

          {abaAtiva === "resumo" && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <ResumoBox
                titulo="Resultado financeiro"
                itens={[
                  ["Total vendido", dinheiro(totalVendido)],
                  ["Custo previsto", dinheiro(custoPrevistoTotal)],
                  ["Custo real", dinheiro(custoRealTotal)],
                  ["Lucro previsto", dinheiro(lucroPrevistoTotal)],
                  ["Lucro real", dinheiro(lucroRealTotal)],
                  ["Margem real", `${margemRealMedia.toFixed(1)}%`],
                ]}
              />

              <ResumoBox
                titulo="Alertas operacionais"
                itens={[
                  ["OS críticas", osCriticas.length.toString()],
                  ["Materiais baixo estoque", materiaisBaixoEstoque.length.toString()],
                  ["Produções paradas", producoesParadas.length.toString()],
                  ["Total de OS", orcamentos.length.toString()],
                  ["Total de materiais", materiais.length.toString()],
                  ["Total de produções", producoes.length.toString()],
                ]}
              />

              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                <h2 className="text-2xl font-black mb-3">
                  Leitura do sistema
                </h2>

                <div className="space-y-4 text-zinc-300">
                  <p>
                    Este relatório consolida orçamento, produção, estoque e
                    financeiro em uma visão única.
                  </p>

                  <p>
                    Quando o estoque é baixado pela produção, o sistema começa a
                    aproximar o lucro real da operação.
                  </p>

                  <p>
                    A próxima evolução pode incluir exportação PDF e filtros por
                    período.
                  </p>
                </div>
              </div>
            </div>
          )}

          {abaAtiva === "comercial" && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-5">
                <CardRelatorio
                  titulo="Pedidos recebidos"
                  valor={totalPedidosComerciais.toString()}
                  cor="text-white"
                />

                <CardRelatorio
                  titulo="Em negociação"
                  valor={dinheiro(valorComercialEmNegociacao)}
                  cor="text-yellow-300"
                />

                <CardRelatorio
                  titulo="Fechado"
                  valor={dinheiro(valorComercialFechado)}
                  cor="text-green-400"
                />

                <CardRelatorio
                  titulo="Perdido"
                  valor={dinheiro(valorComercialPerdido)}
                  cor="text-red-300"
                />

                <CardRelatorio
                  titulo="Conversão"
                  valor={`${taxaConversaoComercial.toFixed(1)}%`}
                  cor="text-purple-300"
                />

                <CardRelatorio
                  titulo="Parados"
                  valor={pedidosComerciaisParados.length.toString()}
                  cor="text-orange-300"
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <RankingComercialBox
                  titulo="Ranking por origem"
                  descricao="De onde vêm os pedidos e quanto movimentam."
                  dados={rankingOrigemComercial}
                  tipo="origem"
                />

                <RankingComercialBox
                  titulo="Ranking por vendedor"
                  descricao="Desempenho comercial por responsável."
                  dados={rankingVendedorComercial}
                  tipo="vendedor"
                />

                <RankingComercialBox
                  titulo="Motivos de perda"
                  descricao="Por que os pedidos estão sendo perdidos."
                  dados={rankingMotivosPerda}
                  tipo="perda"
                />
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
                <HeaderTabela
                  titulo="Pedidos comerciais parados"
                  descricao="Pedidos sem movimentação há mais de 3 dias."
                />

                <table className="w-full text-left">
                  <thead className="bg-zinc-800 text-zinc-300">
                    <tr>
                      <th className="p-4">Cliente</th>
                      <th className="p-4">Serviço</th>
                      <th className="p-4">Origem</th>
                      <th className="p-4">Vendedor</th>
                      <th className="p-4">Valor</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Parado há</th>
                    </tr>
                  </thead>

                  <tbody>
                    {pedidosComerciaisParados.map((pedido) => (
                      <tr
                        key={pedido.id}
                        className="border-t border-zinc-800 hover:bg-zinc-800/40 transition"
                      >
                        <td className="p-4 font-bold">
                          {pedido.cliente || "-"}
                        </td>

                        <td className="p-4">
                          {pedido.servicoInteresse || "-"}
                        </td>

                        <td className="p-4">
                          {pedido.origem || "-"}
                        </td>

                        <td className="p-4">
                          {pedido.vendedor || "-"}
                        </td>

                        <td className="p-4 text-green-400 font-bold">
                          {dinheiro(valorPedidoComercial(pedido))}
                        </td>

                        <td className="p-4">
                          <span className="bg-orange-500/20 text-orange-300 px-3 py-1 rounded-full text-sm font-bold">
                            {pedido.status || "-"}
                          </span>
                        </td>

                        <td className="p-4 text-red-300 font-bold">
                          {diasPedidoParado(pedido)} dias
                        </td>
                      </tr>
                    ))}

                    {pedidosComerciaisParados.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-6 text-zinc-400">
                          Nenhum pedido comercial parado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
                <HeaderTabela
                  titulo="Histórico comercial"
                  descricao="Pedidos convertidos em orçamento, perdidos ou arquivados."
                />

                <table className="w-full text-left">
                  <thead className="bg-zinc-800 text-zinc-300">
                    <tr>
                      <th className="p-4">Cliente</th>
                      <th className="p-4">Origem</th>
                      <th className="p-4">Vendedor</th>
                      <th className="p-4">Valor</th>
                      <th className="p-4">OS</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Atualizado</th>
                    </tr>
                  </thead>

                  <tbody>
                    {pedidosComerciais
                      .filter(
                        (pedido) =>
                          pedido.oculto ||
                          pedido.status === "Convertido em orçamento" ||
                          pedido.status === "Perdido"
                      )
                      .map((pedido) => (
                        <tr
                          key={pedido.id}
                          className="border-t border-zinc-800 hover:bg-zinc-800/40 transition"
                        >
                          <td className="p-4 font-bold">
                            {pedido.cliente || "-"}
                          </td>

                          <td className="p-4">
                            {pedido.origem || "-"}
                          </td>

                          <td className="p-4">
                            {pedido.vendedor || "-"}
                          </td>

                          <td className="p-4 text-green-400 font-bold">
                            {dinheiro(valorPedidoComercial(pedido))}
                          </td>

                          <td className="p-4 text-blue-300 font-bold">
                            {pedido.numeroOS || "-"}
                          </td>

                          <td className="p-4">
                            {pedido.status || "-"}
                          </td>

                          <td className="p-4 text-zinc-400">
                            {formatarData(
                              pedido.atualizadoEm || pedido.criadoEm
                            )}
                          </td>
                        </tr>
                      ))}

                    {pedidosComerciais.filter(
                      (pedido) =>
                        pedido.oculto ||
                        pedido.status === "Convertido em orçamento" ||
                        pedido.status === "Perdido"
                    ).length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-6 text-zinc-400">
                          Nenhum histórico comercial encontrado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {abaAtiva === "financeiro" && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
              <HeaderTabela
                titulo="Lucro previsto x lucro real"
                descricao="Comparativo financeiro por OS."
              />

              <table className="w-full text-left">
                <thead className="bg-zinc-800 text-zinc-300">
                  <tr>
                    <th className="p-4">OS</th>
                    <th className="p-4">Cliente</th>
                    <th className="p-4">Venda</th>
                    <th className="p-4">Custo previsto</th>
                    <th className="p-4">Custo real</th>
                    <th className="p-4">Lucro previsto</th>
                    <th className="p-4">Lucro real</th>
                    <th className="p-4">Margem real</th>
                  </tr>
                </thead>

                <tbody>
                  {orcamentos.map((orcamento) => (
                    <tr
                      key={orcamento.id}
                      className="border-t border-zinc-800 hover:bg-zinc-800/40 transition"
                    >
                      <td className="p-4 text-green-400 font-bold">
                        {orcamento.numeroOS || "Sem OS"}
                      </td>
                      <td className="p-4">{orcamento.cliente}</td>
                      <td className="p-4">{dinheiro(vendaOS(orcamento))}</td>
                      <td className="p-4">{dinheiro(custoPrevistoOS(orcamento))}</td>
                      <td className="p-4">{dinheiro(custoRealOS(orcamento))}</td>
                      <td className="p-4 text-emerald-300">
                        {dinheiro(lucroPrevistoOS(orcamento))}
                      </td>
                      <td className="p-4 text-green-300 font-bold">
                        {dinheiro(lucroRealOS(orcamento))}
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-bold ${
                            margemRealOS(orcamento) < 20
                              ? "bg-red-500/20 text-red-300"
                              : "bg-green-500/20 text-green-300"
                          }`}
                        >
                          {margemRealOS(orcamento).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}

                  {orcamentos.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-zinc-400">
                        Nenhum orçamento encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {abaAtiva === "criticas" && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
              <div className="p-6 border-b border-zinc-800">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black">OS críticas</h2>
                    <p className="text-zinc-400 text-sm mt-1">
                      OS abaixo da margem mínima ou com margem real abaixo de
                      15%.
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
                  {osCriticasFiltradas.map((orcamento) => (
                    <tr
                      key={orcamento.id}
                      className="border-t border-zinc-800 hover:bg-zinc-800/40 transition"
                    >
                      <td className="p-4 text-green-400 font-bold">
                        {orcamento.numeroOS || "Sem OS"}
                      </td>
                      <td className="p-4">{orcamento.cliente}</td>
                      <td className="p-4">{orcamento.servico}</td>
                      <td className="p-4">{dinheiro(vendaOS(orcamento))}</td>
                      <td className="p-4 text-red-300 font-bold">
                        {dinheiro(lucroRealOS(orcamento))}
                      </td>
                      <td className="p-4">
                        <span className="bg-red-500/20 text-red-300 px-3 py-1 rounded-full text-sm font-bold">
                          {margemRealOS(orcamento).toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-4">
                        {margemMinimaOS(orcamento).toFixed(1)}%
                      </td>
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
          )}

          {abaAtiva === "estoque" && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
              <HeaderTabela
                titulo="Materiais abaixo do mínimo"
                descricao="Materiais com risco de faltar e parar produção."
              />

              <table className="w-full text-left">
                <thead className="bg-zinc-800 text-zinc-300">
                  <tr>
                    <th className="p-4">Material</th>
                    <th className="p-4">Categoria</th>
                    <th className="p-4">Quantidade</th>
                    <th className="p-4">Mínimo</th>
                    <th className="p-4">Fornecedor</th>
                  </tr>
                </thead>

                <tbody>
                  {materiaisBaixoEstoque.map((material) => (
                    <tr
                      key={material.id}
                      className="border-t border-zinc-800 hover:bg-zinc-800/40 transition"
                    >
                      <td className="p-4 text-red-300 font-bold">
                        {material.nome}
                      </td>
                      <td className="p-4">{material.categoria || "-"}</td>
                      <td className="p-4">
                        {material.quantidade || 0} {material.unidade || ""}
                      </td>
                      <td className="p-4">{material.estoqueMinimo || 0}</td>
                      <td className="p-4">{material.fornecedor || "-"}</td>
                    </tr>
                  ))}

                  {materiaisBaixoEstoque.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-zinc-400">
                        Nenhum material abaixo do mínimo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {abaAtiva === "producao" && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
              <HeaderTabela
                titulo="Produções paradas"
                descricao="Produções sem movimentação há mais de 24h."
              />

              <table className="w-full text-left">
                <thead className="bg-zinc-800 text-zinc-300">
                  <tr>
                    <th className="p-4">OS</th>
                    <th className="p-4">Cliente</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Horas no status</th>
                    <th className="p-4">Atualizado em</th>
                  </tr>
                </thead>

                <tbody>
                  {producoesParadas.map((producao) => (
                    <tr
                      key={producao.id}
                      className="border-t border-zinc-800 hover:bg-zinc-800/40 transition"
                    >
                      <td className="p-4 text-green-400 font-bold">
                        {producao.numeroOS || "Sem OS"}
                      </td>
                      <td className="p-4">{producao.cliente}</td>
                      <td className="p-4">{producao.status}</td>
                      <td className="p-4 text-orange-300 font-bold">
                        {horasNoStatus(producao)}h
                      </td>
                      <td className="p-4">
                        {formatarData(producao.statusAtualizadoEm)}
                      </td>
                    </tr>
                  ))}

                  {producoesParadas.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-zinc-400">
                        Nenhuma produção parada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {abaAtiva === "rankings" && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <RankingBox titulo="Clientes mais lucrativos" dados={rankingClientes} />
              <RankingBox titulo="Serviços mais lucrativos" dados={rankingServicos} />
            </div>
          )}
        </section>
      </main>
    </AuthGuard>
  );
}

function CardRelatorio({
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

function BotaoAba({
  texto,
  ativo,
  onClick,
}: {
  texto: string;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-3 rounded-2xl font-bold transition ${
        ativo
          ? "bg-green-500 text-black"
          : "bg-zinc-950 text-zinc-400 hover:text-white"
      }`}
    >
      {texto}
    </button>
  );
}

function HeaderTabela({
  titulo,
  descricao,
}: {
  titulo: string;
  descricao: string;
}) {
  return (
    <div className="p-6 border-b border-zinc-800">
      <h2 className="text-2xl font-black">{titulo}</h2>
      <p className="text-zinc-400 text-sm mt-1">{descricao}</p>
    </div>
  );
}

function ResumoBox({
  titulo,
  itens,
}: {
  titulo: string;
  itens: string[][];
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
      <h2 className="text-2xl font-black mb-5">{titulo}</h2>

      <div className="space-y-3">
        {itens.map(([label, valor]) => (
          <div
            key={label}
            className="flex items-center justify-between border-b border-zinc-800 pb-3"
          >
            <span className="text-zinc-400">{label}</span>
            <span className="font-bold">{valor}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


function RankingComercialBox({
  titulo,
  descricao,
  dados,
  tipo,
}: {
  titulo: string;
  descricao: string;
  dados: any[];
  tipo: "origem" | "vendedor" | "perda";
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
      <h2 className="text-2xl font-black mb-2">{titulo}</h2>

      <p className="text-zinc-400 text-sm mb-5">{descricao}</p>

      <div className="flex flex-col gap-3">
        {dados.slice(0, 8).map((item, index) => {
          const conversao =
            item.quantidade > 0 ? (Number(item.fechados || 0) / item.quantidade) * 100 : 0;

          return (
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
                    {item.quantidade} pedido(s)
                    {tipo !== "perda" ? ` • ${Number(item.fechados || 0)} fechado(s)` : ""}
                  </p>

                  {tipo !== "perda" && (
                    <p className="text-zinc-500 text-sm mt-1">
                      Conversão: {conversao.toFixed(1)}%
                    </p>
                  )}
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    tipo === "perda"
                      ? "bg-red-500/20 text-red-300"
                      : "bg-green-500/20 text-green-300"
                  }`}
                >
                  R$ {Number(item.valor || item.valorFechado || 0).toFixed(2)}
                </span>
              </div>
            </div>
          );
        })}

        {dados.length === 0 && (
          <p className="text-zinc-500">Nenhum dado disponível ainda.</p>
        )}
      </div>
    </div>
  );
}

function RankingBox({
  titulo,
  dados,
}: {
  titulo: string;
  dados: any[];
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
      <h2 className="text-2xl font-black mb-5">{titulo}</h2>

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
