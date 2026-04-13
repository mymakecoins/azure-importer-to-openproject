export default function ImportHistory({
  items,
  total,
  offset,
  pageSize,
  loading,
  onSelect,
  onPrevPage,
  onNextPage,
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.floor(offset / pageSize) + 1;
  const canPrev = offset > 0 && !loading;
  const canNext = offset + (items?.length || 0) < total && !loading;

  if (!total && !loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-500">
        Nenhuma importação ainda.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">Histórico</h2>
        {total > 0 ? (
          <span className="text-xs text-slate-500">
            Página {currentPage} de {totalPages} · {total} registro(s)
          </span>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Carregando…</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-800">
          {(items || []).map((it) => (
            <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div>
                <div className="font-mono text-xs text-sky-300">{it.id}</div>
                <div className="text-slate-300">{it.filename}</div>
                <div className="text-xs text-slate-500">
                  {new Date(it.created_at).toLocaleString('pt-BR')} · {it.status}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelect(it.id)}
                className="rounded-md bg-slate-800 px-3 py-1 text-xs text-white hover:bg-slate-700"
              >
                Ver
              </button>
            </li>
          ))}
        </ul>
      )}

      {total > pageSize ? (
        <div className="mt-4 flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => onPrevPage()}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => onNextPage()}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      ) : null}
    </div>
  );
}
