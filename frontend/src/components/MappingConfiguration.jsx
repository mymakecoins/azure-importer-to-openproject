/**
 * Na v1 o mapeamento colunas CSV → campos e tipos OpenProject é feito no servidor
 * via variáveis de ambiente (ver .env.example). Este bloco documenta isso na UI.
 */
export default function MappingConfiguration() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
      <h2 className="text-lg font-semibold text-white">Configuração de mapeamento</h2>
      <p className="mt-2 text-sm text-slate-400">
        Ajuste <code className="rounded bg-slate-950 px-1 text-sky-300">CSV_COLUMN_*</code>,{' '}
        <code className="rounded bg-slate-950 px-1 text-sky-300">OPENPROJECT_TYPE_MAP_JSON</code> e{' '}
        <code className="rounded bg-slate-950 px-1 text-sky-300">OPENPROJECT_DEFAULT_TYPE_ID</code> no
        backend (Docker Compose / <code className="text-sky-300">.env</code>). Uma UI editável pode ser
        adicionada em versão futura.
      </p>
    </div>
  );
}
