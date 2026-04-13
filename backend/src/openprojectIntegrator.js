import fs from 'fs';
import { logger } from './logger.js';

/** Erro comum no .env: "locahost" em vez de "localhost". */
function fixHostnameTypoInUrl(url) {
  if (url.hostname.toLowerCase() === 'locahost') {
    url.hostname = 'localhost';
  }
}

/**
 * Dentro do Docker, localhost/127.0.0.1 apontam para o próprio container.
 * Se OPENPROJECT_BASE_URL vier do .env do host com localhost, reescreve para host.docker.internal
 * (o compose já define extra_hosts host.docker.internal:host-gateway no Linux).
 */
function effectiveOpenProjectBaseUrl(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  if (process.env.BACKEND_NETWORK_MODE === 'host') {
    let hostModeUrl;
    try {
      hostModeUrl = new URL(raw.trim());
    } catch {
      return raw.replace(/\/$/, '');
    }
    fixHostnameTypoInUrl(hostModeUrl);
    if (hostModeUrl.hostname === '127.0.0.1') {
      hostModeUrl.hostname = 'localhost';
    }
    let out = hostModeUrl.toString();
    if (out.endsWith('/')) out = out.slice(0, -1);
    return out;
  }
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return raw.replace(/\/$/, '');
  }
  fixHostnameTypoInUrl(url);
  const h = url.hostname.toLowerCase();
  const inDocker = fs.existsSync('/.dockerenv');
  if (inDocker && (h === 'localhost' || h === '127.0.0.1')) {
    url.hostname = 'host.docker.internal';
    let out = url.toString();
    if (out.endsWith('/')) out = out.slice(0, -1);
    logger.info('openproject_base_url_docker_rewrite', { fromHost: h, toHost: 'host.docker.internal' });
    return out;
  }
  return raw.replace(/\/$/, '');
}

function buildAuthHeader(apiKey, mode) {
  if (!apiKey) throw new Error('OPENPROJECT_API_KEY ausente');
  if (mode === 'bearer') return `Bearer ${apiKey}`;
  const token = Buffer.from(`apikey:${apiKey}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

/** Explica fetch falho (ex.: TypeError: fetch failed) com causa Node e dica Docker. */
function formatOpenProjectNetworkError(baseUrl, err) {
  const base = String(baseUrl || '');
  const cause = err?.cause;
  const causeMsg =
    cause && typeof cause === 'object' && cause != null && 'message' in cause
      ? String(cause.message)
      : cause != null
        ? String(cause)
        : '';
  const core = [String(err), causeMsg].filter(Boolean).join(' — ');
  if (/locahost/i.test(causeMsg) || /locahost/i.test(base)) {
    return `${core}. O hostname da URL parece ser um erro de digitação: use "localhost" (com "l" após "o"), não "locahost".`;
  }
  if (/localhost|127\.0\.0\.1/i.test(base)) {
    return `${core}. Dentro do Docker, localhost não é o host: use OPENPROJECT_BASE_URL=http://host.docker.internal:8080 (ou o IP da máquina) no .env e recrie o container backend.`;
  }
  if (/host\.docker\.internal/i.test(base) && /ECONNREFUSED/i.test(causeMsg)) {
    return `${core}. O container alcançou o host, mas nada aceita essa porta na interface acessível pelo Docker. Costuma ocorrer quando o OpenProject (ou nginx/apache na frente) escuta só em 127.0.0.1 — configure escuta em 0.0.0.0 na porta correta, ou rode o OpenProject no mesmo docker-compose/rede que o backend.`;
  }
  return `${core}. Verifique URL, porta, http/https e se o OpenProject aceita conexões da rede Docker.`;
}

async function fetchJson(baseUrl, path, apiKey, authMode, options = {}) {
  const url = `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: buildAuthHeader(apiKey, authMode),
    ...options.headers,
  };
  let res;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (e) {
    throw new Error(formatOpenProjectNetworkError(baseUrl, e));
  }
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { _raw: text };
  }
  if (!res.ok) {
    const err = new Error(`OpenProject ${res.status}: ${text?.slice(0, 500)}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function resolveProjectId(config) {
  const { baseUrl, apiKey, authMode, identifier } = config;
  const tryPaths = [
    `/api/v3/projects/${encodeURIComponent(identifier)}`,
    `/api/v3/projects/${identifier}`,
  ];
  for (const p of tryPaths) {
    try {
      const body = await fetchJson(baseUrl, p, apiKey, authMode);
      if (body?.id) return body.id;
    } catch (e) {
      if (e.status !== 404) throw e;
    }
  }

  const filters = encodeURIComponent(
    JSON.stringify([{ identifier: { operator: '=', values: [identifier] } }]),
  );
  const listed = await fetchJson(baseUrl, `/api/v3/projects?filters=${filters}`, apiKey, authMode);
  const first = listed?._embedded?.elements?.[0];
  if (!first?.id) throw new Error(`Projeto "${identifier}" não encontrado`);
  return first.id;
}

function typeIdForRow(row, typeMap, defaultTypeId) {
  const mapped = typeMap[row.workItemType];
  if (mapped != null && mapped !== '') return Number(mapped);
  return Number(defaultTypeId);
}

/**
 * @param {object} params
 * @param {boolean} params.dryRun
 */
export async function createWorkPackage(params) {
  const {
    baseUrl,
    apiKey,
    authMode,
    projectId,
    row,
    typeMap,
    defaultTypeId,
    parentOpenProjectId,
    dryRun,
  } = params;

  const typeId = typeIdForRow(row, typeMap, defaultTypeId);
  if (!Number.isFinite(typeId)) {
    throw new Error(`Tipo inválido para linha ${row.rowIndex}: ${row.workItemType}`);
  }

  const body = {
    subject: row.title,
    _links: {
      type: { href: `${baseUrl.replace(/\/$/, '')}/api/v3/types/${typeId}` },
      project: { href: `${baseUrl.replace(/\/$/, '')}/api/v3/projects/${projectId}` },
    },
  };

  if (parentOpenProjectId) {
    body._links.parent = {
      href: `${baseUrl.replace(/\/$/, '')}/api/v3/work_packages/${parentOpenProjectId}`,
    };
  }

  if (dryRun) {
    logger.info('dry_run_work_package', { subject: row.title, typeId, parentOpenProjectId });
    return { id: null, dryRun: true };
  }

  const created = await fetchJson(baseUrl, '/api/v3/work_packages', apiKey, authMode, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!created?.id) throw new Error('Resposta sem id ao criar work package');
  return { id: created.id, dryRun: false };
}

export function loadOpenProjectConfig() {
  const typeMap = JSON.parse(process.env.OPENPROJECT_TYPE_MAP_JSON || '{}');
  return {
    baseUrl: effectiveOpenProjectBaseUrl(process.env.OPENPROJECT_BASE_URL || ''),
    apiKey: process.env.OPENPROJECT_API_KEY || '',
    authMode: process.env.OPENPROJECT_AUTH_MODE || 'basic',
    identifier: process.env.OPENPROJECT_PROJECT_IDENTIFIER || '',
    defaultTypeId: process.env.OPENPROJECT_DEFAULT_TYPE_ID || '1',
    typeMap,
    dryRun: String(process.env.DRY_RUN).toLowerCase() === 'true',
  };
}
