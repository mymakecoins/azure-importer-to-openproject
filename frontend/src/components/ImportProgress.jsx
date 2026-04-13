const ERROR_LINES_PREVIEW = 10;

function splitErrorSummary(text) {
  const raw = String(text).trim();
  if (!raw) return [];
  if (raw.includes('\n')) {
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (raw.includes('; ') && /^Linha \d+/i.test(raw)) {
    return raw
      .split('; ')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [raw];
}

export default function ImportProgress({ job, actionBusy, onStartImport, onCancelImport, onRetryImport }) {
  if (!job) return null;
  const pct =
    job.total_rows > 0 ? Math.min(100, Math.round((job.processed_rows / job.total_rows) * 100)) : 0;

  const canStart = job.status === 'awaiting_start';
  const canRetry = job.status === 'failed';
  const canCancel =
    job.status === 'awaiting_start' ||
    job.status === 'queued' ||
    job.status === 'validating' ||
    job.status === 'running' ||
    job.cancel_requested;
  const stopping = job.cancel_requested && (job.status === 'validating' || job.status === 'running');

  const showActions = canStart || canCancel || canRetry;

  const errorLines = job.error_summary ? splitErrorSummary(job.error_summary) : [];
  const previewLines = errorLines.slice(0, ERROR_LINES_PREVIEW);
  const hasMoreErrors = errorLines.length > ERROR_LINES_PREVIEW;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
      <h2 className="text-lg font-semibold text-white">Progresso</h2>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-300">
        <dt>ID</dt>
        <dd className="font-mono text-sky-300">{job.id}</dd>
        <dt>Status</dt>
        <dd className="capitalize">{job.status}</dd>
        <dt>Arquivo</dt>
        <dd className="truncate">{job.filename}</dd>
        <dt>Linhas</dt>
        <dd>
          {job.processed_rows} / {job.total_rows}
        </dd>
      </dl>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full bg-sky-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {previewLines.length > 0 ? (
        <div className="relative mt-4 text-sm text-amber-400" role="alert">
          <ul className="list-none space-y-1.5 pr-6 pb-1">
            {previewLines.map((line, i) => (
              <li key={i} className="break-words">
                {line}
              </li>
            ))}
          </ul>
          {hasMoreErrors ? (
            <span
              className="absolute bottom-0 right-0 select-none text-lg font-semibold leading-none text-amber-300"
              title={`Há mais ${errorLines.length - ERROR_LINES_PREVIEW} mensagem(ns) de erro`}
              aria-label={`Há mais ${errorLines.length - ERROR_LINES_PREVIEW} mensagens de erro não exibidas`}
            >
              +
            </span>
          ) : null}
        </div>
      ) : null}

      {showActions ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-800 pt-4">
          {canStart ? (
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => onStartImport?.()}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionBusy ? 'Iniciando…' : 'Iniciar importação'}
            </button>
          ) : null}
          {canRetry ? (
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => onRetryImport?.()}
              className="rounded-md border border-amber-600/80 bg-amber-950/40 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-950/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionBusy ? '…' : 'Tentar novamente'}
            </button>
          ) : null}
          {canCancel ? (
            <button
              type="button"
              disabled={actionBusy || stopping}
              onClick={() => onCancelImport?.()}
              className="rounded-md border border-rose-700/80 bg-rose-950/40 px-4 py-2 text-sm font-medium text-rose-200 hover:bg-rose-950/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {stopping ? 'Parando…' : actionBusy ? '…' : 'Parar importação'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
