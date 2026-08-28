"use client";

type ItemAprovacao = {
  status?: string;
  conferido?: boolean;
};

function todosItensConferidos(itens: ItemAprovacao[]) {
  return (
    itens.length > 0 &&
    itens.every((item) => {
      const status = String(item.status || "").trim().toLowerCase();

      return item.conferido === true || status === "conferido" || status === "aprovado";
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
  const status = String(arte?.status || "").trim().toLowerCase();

  return (
    arte?.aprovadoPeloCliente === true ||
    status === "aprovado" ||
    status === "aprovada" ||
    status === "enviado para produção" ||
    status === "enviado para producao"
  );
}

export default function BotaoAprovar({
  arte,
  itens,
  carregando,
  onAprovar,
  className = "",
}: {
  arte: any;
  itens: ItemAprovacao[];
  carregando: boolean;
  onAprovar: () => void;
  className?: string;
}) {
  const motivo = carregando
    ? "Aguarde o processamento."
    : !todosItensConferidos(itens)
      ? "Confira todos os itens"
      : !temArquivoOuMockup(arte)
        ? "Adicione arquivo ou mockup"
        : arteJaAprovada(arte)
          ? "Arte já aprovada"
          : "";
  const podeAprovar = !motivo;

  return (
    <div className={className}>
      <button
        onClick={onAprovar}
        disabled={!podeAprovar}
        title={motivo}
        className="w-full rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500"
      >
        {carregando ? "Aprovando..." : "Aprovar"}
      </button>

      {!podeAprovar && motivo && (
        <p className="mt-2 text-[11px] font-bold text-yellow-300">{motivo}</p>
      )}
    </div>
  );
}
