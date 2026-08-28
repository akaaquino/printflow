"use client";

type ItemConferenciaUI = {
  id: string;
  materialId: string;
  material: string;
  largura: string;
  altura: string;
  medida: string;
  area: number;
  quantidade: number;
  cor: string;
  acabamento: string;
  observacoes: string;
  status: "Pendente" | "Conferido" | "Ajuste" | "Aprovado";
};

const STATUS_ITENS: ItemConferenciaUI["status"][] = [
  "Pendente",
  "Conferido",
  "Ajuste",
  "Aprovado",
];

function formatarArea(area: any) {
  const valor = Number(area || 0);
  return valor > 0 ? `${valor.toFixed(2)} m²` : "0,00 m²";
}

function classeStatusItem(status: string) {
  if (status === "Aprovado" || status === "Conferido") {
    return "bg-green-500/20 text-green-300 border-green-500/30";
  }
  if (status === "Ajuste") {
    return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
  }
  return "bg-zinc-800 text-zinc-300 border-zinc-700";
}

export default function ConferenciaItens({
  itens,
  materiais,
  onAdicionar,
  onAlterar,
  onRemover,
  arquivosFormulario = [],
  onSelecionarArquivoPreview,
}: {
  itens: ItemConferenciaUI[];
  materiais: any[];
  onAdicionar: () => void;
  onAlterar: (index: number, campo: string, valor: any) => void;
  onRemover: (id: string) => void;
  arquivosFormulario?: { nome: string; url: string }[];
  onSelecionarArquivoPreview?: (index: number, nomeArquivo: string) => void;
}) {
  return (
    <div className="lg:col-span-3 rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-xl font-black">Itens da arte</h3>
          <p className="mt-1 text-xs text-zinc-500">Confira material, medidas e status de cada item.</p>
        </div>

        <button type="button" onClick={onAdicionar} className="rounded-xl bg-green-500 px-4 py-2 text-sm font-bold text-black transition hover:bg-green-400">
          Adicionar item
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {itens.map((item, index) => (
          <div key={item.id} className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-black">Item {index + 1}</p>
                <p className="text-sm text-zinc-500">Área calculada: {formatarArea(item.area)}</p>
              </div>

              <div className="flex items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${classeStatusItem(item.status)}`}>{item.status}</span>
                {itens.length > 1 && (
                  <button type="button" onClick={() => onRemover(item.id)} className="rounded-xl bg-red-500/20 px-3 py-1 text-xs font-bold text-red-300 hover:bg-red-500/30">
                    Remover
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <select value={item.materialId} onChange={(e) => onAlterar(index, "materialId", e.target.value)} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white md:col-span-2">
                <option value="">Selecione o material</option>
                {materiais.map((material) => (
                  <option key={material.id} value={material.id}>{material.nome || material.material || "Material"}</option>
                ))}
              </select>
              <input value={item.material} onChange={(e) => onAlterar(index, "material", e.target.value)} placeholder="Ou digite o material" className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm md:col-span-2" />

              <input value={item.largura} onChange={(e) => onAlterar(index, "largura", e.target.value)} placeholder="Largura" className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm" />
              <input value={item.altura} onChange={(e) => onAlterar(index, "altura", e.target.value)} placeholder="Altura" className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm" />
              <input value={item.quantidade} onChange={(e) => onAlterar(index, "quantidade", e.target.value)} placeholder="Qtd" className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm" />
              <input value={item.medida} onChange={(e) => onAlterar(index, "medida", e.target.value)} placeholder="Medida" className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm" />
              <input value={item.cor} onChange={(e) => onAlterar(index, "cor", e.target.value)} placeholder="Cor" className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm" />
              <input value={item.acabamento} onChange={(e) => onAlterar(index, "acabamento", e.target.value)} placeholder="Acabamento" className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm" />
              <select value={item.status} onChange={(e) => onAlterar(index, "status", e.target.value)} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white">
                {STATUS_ITENS.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              {onSelecionarArquivoPreview && (
                <select value={(item as any).arquivoPreviewNome || ""} onChange={(e) => onSelecionarArquivoPreview(index, e.target.value)} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white md:col-span-2">
                  <option value="">Arquivo/preview opcional</option>
                  {arquivosFormulario.map((arquivo) => (
                    <option key={arquivo.nome} value={arquivo.nome}>{arquivo.nome}</option>
                  ))}
                </select>
              )}
              <textarea value={item.observacoes} onChange={(e) => onAlterar(index, "observacoes", e.target.value)} placeholder="Observações" className="min-h-20 rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm md:col-span-4" />
            </div>
          </div>
        ))}

        {itens.length === 0 && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">
            Nenhum item cadastrado.
          </div>
        )}
      </div>
    </div>
  );
}
