import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './db.js';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function splitSqlStatements(sql) {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function migrate() {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const st of splitSqlStatements(sql)) {
      await query(`${st};`);
    }
    logger.info('migration_applied', { file });
  }
}

export async function createImportRecord(filename, rawCsv) {
  const r = await query(
    `INSERT INTO imports (filename, raw_csv, status, total_rows)
     VALUES ($1, $2, 'awaiting_start', 0)
     RETURNING id, created_at`,
    [filename, rawCsv],
  );
  return r.rows[0];
}

/** awaiting_start → queued (um único concorrente vence). */
export async function claimImportForProcessing(importId) {
  const r = await query(
    `UPDATE imports SET status = 'queued', updated_at = now(), cancel_requested = false
     WHERE id = $1 AND status = 'awaiting_start'
     RETURNING id`,
    [importId],
  );
  return r.rows[0] != null;
}

/** Volta importação falha para aguardar novo "Iniciar" (limpa itens e contadores). */
export async function retryFailedImport(importId) {
  const row = await getImport(importId);
  if (!row || row.status !== 'failed') return false;
  await query(`DELETE FROM import_items WHERE import_id = $1`, [importId]);
  const r = await query(
    `UPDATE imports SET status = 'awaiting_start', error_summary = null, cancel_requested = false,
      processed_rows = 0, total_rows = 0, updated_at = now()
     WHERE id = $1 AND status = 'failed'
     RETURNING id`,
    [importId],
  );
  return r.rows[0] != null;
}

export async function requestCancelImport(importId) {
  const row = await getImport(importId);
  if (!row) return { ok: false, error: 'not_found' };
  const st = row.status;
  if (st === 'awaiting_start' || st === 'queued') {
    await updateImport(importId, {
      status: 'cancelled',
      error_summary: null,
      cancel_requested: false,
    });
    await appendLog(importId, 'info', 'importação_cancelada', { phase: 'before_run' });
    return { ok: true };
  }
  if (st === 'validating' || st === 'running') {
    await updateImport(importId, { cancel_requested: true });
    await appendLog(importId, 'info', 'cancelamento_solicitado', {});
    return { ok: true };
  }
  return { ok: false, error: 'invalid_state' };
}

export async function updateImport(importId, patch) {
  const fields = [];
  const values = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k} = $${i}`);
    values.push(v);
    i += 1;
  }
  fields.push(`updated_at = now()`);
  values.push(importId);
  await query(`UPDATE imports SET ${fields.join(', ')} WHERE id = $${i}`, values);
}

export async function getImport(importId) {
  const r = await query(`SELECT * FROM imports WHERE id = $1`, [importId]);
  return r.rows[0] || null;
}

const DEFAULT_IMPORT_PAGE_SIZE = 5;

export async function listImports(limit = DEFAULT_IMPORT_PAGE_SIZE, offset = 0) {
  const lim = Math.min(Math.max(1, Number(limit) || DEFAULT_IMPORT_PAGE_SIZE), 100);
  const off = Math.max(0, Number(offset) || 0);
  const r = await query(
    `SELECT id, filename, status, created_at, updated_at, total_rows, processed_rows, error_summary, cancel_requested
     FROM imports
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [lim, off],
  );
  const countR = await query(`SELECT COUNT(*)::int AS n FROM imports`);
  const total = countR.rows[0]?.n ?? 0;
  return { items: r.rows, total, limit: lim, offset: off };
}

export async function appendLog(importId, level, message, meta = null) {
  await query(
    `INSERT INTO import_logs (import_id, level, message, meta) VALUES ($1, $2, $3, $4)`,
    [importId, level, message, meta],
  );
}

export async function replaceImportItems(importId, rows) {
  await query(`DELETE FROM import_items WHERE import_id = $1`, [importId]);
  for (const row of rows) {
    await query(
      `INSERT INTO import_items (import_id, external_key, row_index, level, payload, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [
        importId,
        row.id,
        row.rowIndex,
        row.workItemType || null,
        JSON.stringify({ title: row.title, parentId: row.parentId, raw: row.raw }),
      ],
    );
  }
}

export async function markItem(importId, externalKey, status, openprojectId, errorMessage) {
  await query(
    `UPDATE import_items
     SET status = $3, openproject_id = $4, error_message = $5
     WHERE import_id = $1 AND external_key = $2`,
    [importId, externalKey, status, openprojectId, errorMessage],
  );
}
