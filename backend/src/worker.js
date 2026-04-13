import { parseCsv } from './csvParser.js';
import { validateHierarchy } from './dataValidator.js';
import {
  appendLog,
  getImport,
  markItem,
  replaceImportItems,
  updateImport,
} from './jobQueue.js';
import { createWorkPackage, loadOpenProjectConfig, resolveProjectId } from './openprojectIntegrator.js';
import { logger } from './logger.js';

/** Nomes preferidos para casar com a linha 1 do CSV (exato ou sem diferenciar maiúsculas; aliases embutidos como fallback). */
function columnHintsFromEnv() {
  return {
    id: process.env.CSV_COLUMN_ID || 'ID',
    title: process.env.CSV_COLUMN_TITLE || 'Title',
    workItemType: process.env.CSV_COLUMN_WORK_ITEM_TYPE || 'Work Item Type',
    parent: process.env.CSV_COLUMN_PARENT || 'Parent',
  };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry(fn, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const status = e.status;
      if (status >= 400 && status < 500 && status !== 429) {
        break;
      }
      const delay = 500 * 2 ** i;
      logger.warn('openproject_retry', { attempt: i + 1, delay, err: String(e) });
      await sleep(delay);
    }
  }
  throw lastErr;
}

/** true = importação deve parar (já cancelada ou cancel_requested aplicado). */
async function checkUserCancel(importId, opts = {}) {
  const row = await getImport(importId);
  if (!row) return true;
  if (row.status === 'cancelled') return true;
  if (row.cancel_requested) {
    await updateImport(importId, {
      status: 'cancelled',
      cancel_requested: false,
      error_summary: 'Importação interrompida pelo usuário.',
      ...(opts.processed_rows != null ? { processed_rows: opts.processed_rows } : {}),
    });
    await appendLog(importId, 'info', 'importação_cancelada', { phase: 'during_run' });
    return true;
  }
  return false;
}

export async function processImport(importId) {
  const imp = await getImport(importId);
  if (!imp) return;
  if (imp.status !== 'queued') {
    logger.warn('processImport_skipped', { importId, status: imp.status });
    return;
  }
  if (await checkUserCancel(importId)) return;

  const headers = columnHintsFromEnv();
  await updateImport(importId, { status: 'validating', error_summary: null });
  await appendLog(importId, 'info', 'validação_iniciada', {});

  let rows;
  try {
    rows = parseCsv(imp.raw_csv, headers);
  } catch (e) {
    const msg = String(e);
    await appendLog(importId, 'error', 'parse_csv_falhou', { message: msg });
    await updateImport(importId, { status: 'failed', error_summary: msg });
    return;
  }

  if (await checkUserCancel(importId)) return;

  await updateImport(importId, { total_rows: rows.length });

  const validation = validateHierarchy(rows);
  if (!validation.ok) {
    const summary = validation.errors.join('\n');
    await appendLog(importId, 'error', 'validação_falhou', { errors: validation.errors });
    await updateImport(importId, { status: 'failed', error_summary: summary });
    return;
  }

  if (await checkUserCancel(importId)) return;

  const sorted = validation.sorted;
  await replaceImportItems(importId, sorted);

  const opConfig = loadOpenProjectConfig();
  if (!opConfig.baseUrl || !opConfig.identifier) {
    await updateImport(importId, {
      status: 'failed',
      error_summary: 'OPENPROJECT_BASE_URL ou OPENPROJECT_PROJECT_IDENTIFIER ausente',
    });
    return;
  }

  if (await checkUserCancel(importId)) return;

  await updateImport(importId, { status: 'running', processed_rows: 0 });
  await appendLog(importId, 'info', 'importação_iniciada', { dryRun: opConfig.dryRun });

  let projectId;
  try {
    projectId = await withRetry(() =>
      resolveProjectId({
        baseUrl: opConfig.baseUrl,
        apiKey: opConfig.apiKey,
        authMode: opConfig.authMode,
        identifier: opConfig.identifier,
      }),
    );
  } catch (e) {
    const msg = String(e);
    await appendLog(importId, 'error', 'projeto_não_resolvido', { message: msg });
    await updateImport(importId, { status: 'failed', error_summary: msg });
    return;
  }

  if (await checkUserCancel(importId)) return;

  const idToOpenProject = new Map();
  let processed = 0;

  for (const row of sorted) {
    if (await checkUserCancel(importId, { processed_rows: processed })) return;

    if (!row.id) continue;
    const parentOpId = row.parentId ? idToOpenProject.get(row.parentId) : null;
    try {
      const created = await withRetry(() =>
        createWorkPackage({
          baseUrl: opConfig.baseUrl,
          apiKey: opConfig.apiKey,
          authMode: opConfig.authMode,
          projectId,
          row,
          typeMap: opConfig.typeMap,
          defaultTypeId: opConfig.defaultTypeId,
          parentOpenProjectId: parentOpId || undefined,
          dryRun: opConfig.dryRun,
        }),
      );

      if (created.id != null) idToOpenProject.set(row.id, created.id);
      await markItem(importId, row.id, 'ok', created.id, null);
    } catch (e) {
      const msg = String(e);
      await markItem(importId, row.id, 'error', null, msg);
      await appendLog(importId, 'error', 'item_falhou', { externalKey: row.id, message: msg });
      processed += 1;
      const summary = `Importação interrompida no primeiro erro (ID ${row.id}, linha ${row.rowIndex + 2}): ${msg}`;
      await updateImport(importId, {
        status: 'failed',
        error_summary: summary,
        processed_rows: processed,
      });
      await appendLog(importId, 'info', 'importação_interrompida_primeiro_erro', { externalKey: row.id });
      logger.info('import_stopped_first_error', { importId, externalKey: row.id });
      return;
    }
    processed += 1;
    if (processed % 25 === 0) {
      await updateImport(importId, { processed_rows: processed });
    }
  }

  await updateImport(importId, {
    processed_rows: processed,
    status: 'completed',
    error_summary: null,
  });

  await appendLog(importId, 'info', 'importação_finalizada', { processed });
  logger.info('import_finished', { importId, processed });
}
