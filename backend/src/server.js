import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import multer from 'multer';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });
import {
  migrate,
  createImportRecord,
  claimImportForProcessing,
  getImport,
  listImports,
  requestCancelImport,
  retryFailedImport,
} from './jobQueue.js';
import { logger } from './logger.js';
import { processImport } from './worker.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/imports', upload.single('file'), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'Arquivo CSV obrigatório (campo file)' });
    }
    const raw = req.file.buffer.toString('utf8');
    const rec = await createImportRecord(req.file.originalname || 'upload.csv', raw);
    return res.status(202).json({ id: rec.id, status: 'awaiting_start' });
  } catch (e) {
    logger.error('upload_failed', { err: String(e) });
    return res.status(500).json({ error: String(e) });
  }
});

function importToJson(row) {
  const iso = (d) => {
    if (d == null) return null;
    const t = new Date(d);
    return Number.isNaN(t.getTime()) ? null : t.toISOString();
  };
  return {
    id: String(row.id),
    filename: row.filename,
    status: row.status,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
    total_rows: Number(row.total_rows) || 0,
    processed_rows: Number(row.processed_rows) || 0,
    error_summary: row.error_summary ?? null,
    cancel_requested: Boolean(row.cancel_requested),
  };
}

app.post('/api/imports/:id/start', async (req, res) => {
  try {
    const claimed = await claimImportForProcessing(req.params.id);
    if (!claimed) {
      return res.status(409).json({
        error: 'Só é possível iniciar importações aguardando início (awaiting_start).',
      });
    }
    setImmediate(() => {
      processImport(req.params.id).catch((e) =>
        logger.error('processImport_failed', { id: req.params.id, err: String(e) }),
      );
    });
    return res.status(202).json({ ok: true, status: 'queued' });
  } catch (e) {
    logger.error('start_import_failed', { err: String(e) });
    return res.status(500).json({ error: String(e) });
  }
});

app.post('/api/imports/:id/cancel', async (req, res) => {
  try {
    const r = await requestCancelImport(req.params.id);
    if (!r.ok) {
      if (r.error === 'not_found') return res.status(404).json({ error: 'Não encontrado' });
      return res.status(409).json({ error: 'Não é possível cancelar neste estado.' });
    }
    return res.json({ ok: true });
  } catch (e) {
    logger.error('cancel_import_failed', { err: String(e) });
    return res.status(500).json({ error: String(e) });
  }
});

app.post('/api/imports/:id/retry', async (req, res) => {
  try {
    const ok = await retryFailedImport(req.params.id);
    if (!ok) {
      return res.status(409).json({ error: 'Só importações com falha podem ser preparadas para nova tentativa.' });
    }
    return res.json({ ok: true, status: 'awaiting_start' });
  } catch (e) {
    logger.error('retry_import_failed', { err: String(e) });
    return res.status(500).json({ error: String(e) });
  }
});

app.get('/api/imports', async (req, res) => {
  try {
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const offset = req.query.offset != null ? Number(req.query.offset) : undefined;
    const page = await listImports(limit, offset);
    return res.json({
      items: page.items.map(importToJson),
      total: page.total,
      limit: page.limit,
      offset: page.offset,
      hasMore: page.offset + page.items.length < page.total,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

app.get('/api/imports/:id', async (req, res) => {
  try {
    const row = await getImport(req.params.id);
    if (!row) return res.status(404).json({ error: 'Não encontrado' });
    return res.json(importToJson(row));
  } catch (e) {
    logger.error('get_import_failed', { id: req.params.id, err: String(e) });
    return res.status(500).json({ error: String(e) });
  }
});

const port = Number(process.env.PORT || 3001);

async function main() {
  await migrate();
  app.listen(port, '0.0.0.0', () => {
    logger.info('server_listen', { port });
  });
}

main().catch((e) => {
  logger.error('server_boot_failed', { err: String(e) });
  process.exit(1);
});
