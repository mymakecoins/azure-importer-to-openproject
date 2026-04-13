import { useCallback, useEffect, useState } from 'react';
import { cancelImport, getImport, listImports, HISTORY_PAGE_SIZE, retryImport, startImport, uploadCsv } from './api.js';
import CSVUpload from './components/CSVUpload.jsx';
import ErrorHandler from './components/ErrorHandler.jsx';
import ImportHistory from './components/ImportHistory.jsx';
import ImportProgress from './components/ImportProgress.jsx';
import MappingConfiguration from './components/MappingConfiguration.jsx';

export default function App() {
  const [busy, setBusy] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [job, setJob] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [importActionBusy, setImportActionBusy] = useState(false);

  const fetchHistoryPage = useCallback(async (offset) => {
    setHistoryLoading(true);
    try {
      const data = await listImports({ limit: HISTORY_PAGE_SIZE, offset });
      setHistoryTotal(data.total ?? 0);
      setHistoryOffset(data.offset ?? offset);
      setHistory(data.items || []);
    } catch (e) {
      setGlobalError(String(e.message || e));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const refreshHistory = useCallback(async () => {
    await fetchHistoryPage(0);
  }, [fetchHistoryPage]);

  const goHistoryPrev = useCallback(() => {
    const prev = Math.max(0, historyOffset - HISTORY_PAGE_SIZE);
    if (prev !== historyOffset) fetchHistoryPage(prev);
  }, [fetchHistoryPage, historyOffset]);

  const goHistoryNext = useCallback(() => {
    const next = historyOffset + HISTORY_PAGE_SIZE;
    if (next < historyTotal) fetchHistoryPage(next);
  }, [fetchHistoryPage, historyOffset, historyTotal]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    if (!activeId) return undefined;
    let cancelled = false;
    const tick = async () => {
      try {
        const j = await getImport(activeId);
        if (!cancelled) setJob(j);
      } catch (e) {
        if (!cancelled) setGlobalError(String(e.message || e));
      }
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [activeId]);

  const onUploaded = async (file) => {
    setJob(null);
    setUploadError('');
    setGlobalError('');
    setBusy(true);
    try {
      const res = await uploadCsv(file);
      setActiveId(res.id);
      await refreshHistory();
      try {
        const j = await getImport(res.id);
        setJob(j);
      } catch {
        /* polling preenche */
      }
    } catch (e) {
      setUploadError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const onStartImport = useCallback(async () => {
    if (!activeId) return;
    setImportActionBusy(true);
    setGlobalError('');
    try {
      await startImport(activeId);
      const j = await getImport(activeId);
      setJob(j);
      await refreshHistory();
    } catch (e) {
      setGlobalError(String(e.message || e));
    } finally {
      setImportActionBusy(false);
    }
  }, [activeId, refreshHistory]);

  const onCancelImport = useCallback(async () => {
    if (!activeId) return;
    setImportActionBusy(true);
    setGlobalError('');
    try {
      await cancelImport(activeId);
      const j = await getImport(activeId);
      setJob(j);
      await refreshHistory();
    } catch (e) {
      setGlobalError(String(e.message || e));
    } finally {
      setImportActionBusy(false);
    }
  }, [activeId, refreshHistory]);

  const onRetryImport = useCallback(async () => {
    if (!activeId) return;
    setImportActionBusy(true);
    setGlobalError('');
    try {
      await retryImport(activeId);
      const j = await getImport(activeId);
      setJob(j);
      await refreshHistory();
    } catch (e) {
      setGlobalError(String(e.message || e));
    } finally {
      setImportActionBusy(false);
    }
  }, [activeId, refreshHistory]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-col gap-1 px-4 py-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">Importador Azure → OpenProject</h1>
          <p className="text-sm text-slate-400">
            Repositório <span className="font-mono text-slate-300">openproject-importer</span>
          </p>
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <ErrorHandler message={globalError} />
        <CSVUpload onUploaded={onUploaded} disabled={busy} error={uploadError} />
        <MappingConfiguration />
        <ImportProgress
          job={job}
          actionBusy={importActionBusy}
          onStartImport={onStartImport}
          onCancelImport={onCancelImport}
          onRetryImport={onRetryImport}
        />
        <ImportHistory
          items={history}
          total={historyTotal}
          offset={historyOffset}
          pageSize={HISTORY_PAGE_SIZE}
          loading={historyLoading}
          onSelect={(id) => setActiveId(id)}
          onPrevPage={goHistoryPrev}
          onNextPage={goHistoryNext}
        />
      </main>
    </div>
  );
}
