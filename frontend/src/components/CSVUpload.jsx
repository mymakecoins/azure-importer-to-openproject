export default function CSVUpload({ onUploaded, disabled, error }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
      <h2 className="text-lg font-semibold text-white">Upload do CSV</h2>
      <p className="mt-1 text-sm text-slate-400">
        Export hierárquico do Azure DevOps: formato com <span className="text-slate-300">Title 1…Title N</span> (sem
        coluna Parent) ou clássico com Title e Parent. Obrigatórios: ID e Work Item Type. Após o envio, use{' '}
        <span className="text-slate-300">Iniciar importação</span> no painel de progresso.
      </p>
      <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-600 bg-slate-950/50 px-4 py-10 hover:border-sky-500/50">
        <span className="text-sm text-slate-300">Arraste ou clique para selecionar</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          disabled={disabled}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) await onUploaded(f);
            e.target.value = '';
          }}
        />
      </label>
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
