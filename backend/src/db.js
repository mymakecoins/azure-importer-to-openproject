import pg from 'pg';
import { logger } from './logger.js';

const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required');
    pool = new Pool({ connectionString: url });
    pool.on('error', (err) => logger.error('pg_pool_error', { err: String(err) }));
  }
  return pool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}
