/**
 * @typedef {{ rowIndex: number, id: string, title: string, workItemType: string, parentId: string | null, raw: object }} NormalizedRow
 */

/**
 * @param {NormalizedRow[]} rows
 * @returns {{ ok: boolean, errors: string[], sorted: NormalizedRow[] }}
 */
export function validateHierarchy(rows) {
  const errors = [];
  const byId = new Map();

  for (const r of rows) {
    if (!r.id) errors.push(`Linha ${r.rowIndex + 2}: ID vazio`);
    if (!r.title) errors.push(`Linha ${r.rowIndex + 2}: título vazio`);
    if (byId.has(r.id)) errors.push(`ID duplicado: ${r.id}`);
    if (r.id) byId.set(r.id, r);
  }

  for (const r of rows) {
    if (r.parentId && !byId.has(r.parentId)) {
      errors.push(`Linha ${r.rowIndex + 2}: pai "${r.parentId}" não encontrado`);
    }
  }

  const cycle = detectCycle(rows, byId);
  if (cycle) errors.push(`Ciclo detectado na hierarquia: ${cycle.join(' -> ')}`);

  if (errors.length) return { ok: false, errors, sorted: [] };

  const sorted = topologicalSort(rows, byId);
  return { ok: true, errors: [], sorted };
}

function detectCycle(rows, byId) {
  for (const r of rows) {
    if (!r.id) continue;
    const seen = new Set();
    let cur = r.id;
    while (cur) {
      if (seen.has(cur)) return [...seen, cur];
      seen.add(cur);
      const row = byId.get(cur);
      cur = row?.parentId && byId.has(row.parentId) ? row.parentId : null;
    }
  }
  return null;
}

/**
 * @param {NormalizedRow[]} rows
 * @param {Map<string, NormalizedRow>} byId
 */
function topologicalSort(rows, byId) {
  const ids = [...byId.keys()];
  const indegree = new Map(ids.map((id) => [id, 0]));
  const adj = new Map(ids.map((id) => [id, []]));

  for (const r of rows) {
    if (!r.id) continue;
    if (r.parentId && byId.has(r.parentId)) {
      adj.get(r.parentId).push(r.id);
      indegree.set(r.id, indegree.get(r.id) + 1);
    }
  }

  const queue = ids.filter((id) => indegree.get(id) === 0);
  const orderedIds = [];

  while (queue.length) {
    const id = queue.shift();
    orderedIds.push(id);
    for (const child of adj.get(id)) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
  }

  if (orderedIds.length !== ids.length) {
    throw new Error('Ordenação topológica falhou');
  }

  const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
  return [...rows].sort((a, b) => {
    if (!a.id) return 1;
    if (!b.id) return -1;
    return orderMap.get(a.id) - orderMap.get(b.id);
  });
}
