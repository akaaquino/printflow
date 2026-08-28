"use client";

import type { ChangeEvent, ClipboardEvent, DragEvent } from "react";

export default function UploadArquivos({
  arquivos,
  previews,
  arquivosExistentes,
  uploadando,
  mockupPasteAtivo,
  onSelecionarArquivos,
  onRemoverArquivo,
  onRemoverExistente,
  onPaste,
  onDrop,
  onDragOver,
  onFocusPaste,
  onBlurPaste,
}: {
  arquivos: File[];
  previews: string[];
  arquivosExistentes: any[];
  uploadando: boolean;
  mockupPasteAtivo: boolean;
  onSelecionarArquivos: (evento: ChangeEvent<HTMLInputElement>) => void;
  onRemoverArquivo: (index: number) => void;
  onRemoverExistente: (index: number) => void;
  onPaste: (evento: ClipboardEvent<HTMLDivElement>) => void;
  onDrop: (evento: DragEvent<HTMLDivElement>) => void;
  onDragOver: (evento: DragEvent<HTMLDivElement>) => void;
  onFocusPaste: () => void;
  onBlurPaste: () => void;
}) {
  return (
    <div className="lg:col-span-3 rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-black">Arquivos e mockups</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Importe arquivos, arraste para a área ou cole um print com CTRL+V.
          </p>
        </div>

        {uploadando && (
          <span className="w-fit rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-300">
            Enviando...
          </span>
        )}
      </div>

      <div
        tabIndex={0}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onFocus={onFocusPaste}
        onBlur={onBlurPaste}
        className={`rounded-2xl border border-dashed p-5 text-center outline-none transition ${
          mockupPasteAtivo
            ? "border-green-500 bg-green-500/10"
            : "border-zinc-700 bg-zinc-900"
        }`}
      >
        <p className="text-sm font-bold text-zinc-200">
          Importe um arquivo ou cole um print com CTRL+V
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {mockupPasteAtivo
            ? "Agora pressione CTRL+V para colar o print."
            : "Clique nesta área para ativar a colagem."}
        </p>

        <label className="mt-4 inline-flex cursor-pointer rounded-xl bg-green-500 px-4 py-2 text-xs font-black text-black transition hover:bg-green-400">
          Selecionar arquivos
          <input type="file" multiple onChange={onSelecionarArquivos} className="hidden" />
        </label>
      </div>

      {arquivosExistentes.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold text-zinc-500">Arquivos já enviados</p>
          <div className="grid gap-2 md:grid-cols-2">
            {arquivosExistentes.map((arquivo, index) => (
              <div key={`${arquivo.nome || arquivo.url}-${index}`} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                <p className="truncate text-sm font-bold text-zinc-200">{arquivo.nome || arquivo.filename || "Arquivo"}</p>
                <button type="button" onClick={() => onRemoverExistente(index)} className="mt-2 text-xs font-bold text-red-300">
                  Remover
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {arquivos.length > 0 && (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {arquivos.map((arquivo, index) => (
            <div key={`${arquivo.name}-${arquivo.lastModified}`} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
              {previews[index] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previews[index]} alt={arquivo.name} className="mb-2 h-24 w-full rounded-lg object-cover" />
              ) : null}
              <p className="truncate text-sm font-bold text-zinc-200">{arquivo.name}</p>
              <p className="text-xs text-zinc-500">{(arquivo.size / 1024 / 1024).toFixed(2)} MB</p>
              <button type="button" onClick={() => onRemoverArquivo(index)} className="mt-2 text-xs font-bold text-red-300">
                Remover
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
