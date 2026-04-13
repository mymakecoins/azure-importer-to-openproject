/** Base da API: vazio = mesma origem (nginx em :3000 ou proxy do Vite em dev). Build: VITE_API_BASE=http://localhost:3001 se o SPA não tiver proxy. */
const prefix = import.meta.env.VITE_API_BASE ?? '';

async function fetchJson(url, options = {}, { retries = 3, retryDelayMs = 500 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (e) {
      lastErr = e;
      const isLast = attempt === retries - 1;
      if (isLast) break;
      await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
    }
  }
  const hint =
    prefix === ''
      ? ' Verifique se o backend está no ar (Compose: aguarde o backend healthy; dev: frontend com proxy /api para a porta 3001).'
      : '';
  throw new Error(`${lastErr?.message || 'Falha de rede ao chamar a API'}.${hint}`);
}

export async function uploadCsv(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetchJson(`${prefix}/api/imports`, { method: 'POST', body: fd }, { retries: 1 });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || res.statusText);
  }
  return res.json();
}

export async function getImport(id) {
  const res = await fetchJson(`${prefix}/api/imports/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export async function startImport(id) {
  const res = await fetchJson(
    `${prefix}/api/imports/${encodeURIComponent(id)}/start`,
    { method: 'POST' },
    { retries: 1 },
  );
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || res.statusText);
  }
  return res.json();
}

export async function cancelImport(id) {
  const res = await fetchJson(
    `${prefix}/api/imports/${encodeURIComponent(id)}/cancel`,
    { method: 'POST' },
    { retries: 1 },
  );
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || res.statusText);
  }
  return res.json();
}

export async function retryImport(id) {
  const res = await fetchJson(
    `${prefix}/api/imports/${encodeURIComponent(id)}/retry`,
    { method: 'POST' },
    { retries: 1 },
  );
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || res.statusText);
  }
  return res.json();
}

const HISTORY_PAGE_SIZE = 5;

export async function listImports({ limit = HISTORY_PAGE_SIZE, offset = 0 } = {}) {
  const q = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const res = await fetchJson(`${prefix}/api/imports?${q}`);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export { HISTORY_PAGE_SIZE };
