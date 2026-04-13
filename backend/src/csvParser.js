import { parse } from 'csv-parse/sync';

const PARSE_OPTS = {
  skip_empty_lines: true,
  trim: true,
  relax_column_count: true,
};

/** UTF-8 BOM no início do arquivo quebra o nome da primeira coluna (ex.: "﻿ID"). */
function stripLeadingBom(text) {
  return String(text).replace(/^\uFEFF/, '');
}

/** Nomes alternativos comuns (export Azure DevOps / variações). */
const BUILTIN_ALIASES = {
  id: ['ID', 'Id', 'Work Item Id', 'Work Item ID', 'WorkItemId'],
  title: ['Title', 'Work Item Title', 'Summary'],
  workItemType: ['Work Item Type', 'Type', 'WorkItemType'],
  parent: ['Parent', 'Parent ID', 'Parent Id', 'Parent Work Item Id'],
};

/**
 * Colunas estilo export hierárquico Azure: "Title 1", "Title 2", … (ordem numérica).
 * @param {string[]} columnNames
 * @returns {string[]} nomes exatos como no CSV
 */
export function detectHierarchyTitleColumns(columnNames) {
  const withIndex = [];
  for (const c of columnNames) {
    const m = String(c).trim().match(/^title\s*(\d+)$/i);
    if (m) withIndex.push({ name: c.trim(), n: Number.parseInt(m[1], 10) });
  }
  withIndex.sort((a, b) => a.n - b.n);
  return withIndex.map((x) => x.name);
}

function cellNonEmpty(v) {
  return v !== undefined && v !== null && String(v).trim() !== '';
}

/**
 * Profundidade 1 = Title 1 preenchido é o nível mais à esquerda ainda “ativo”, …
 * Usa a coluna não vazia mais à direita (folha do caminho na linha).
 * @param {object} row registro csv-parse
 * @param {string[]} titleCols Title 1 … Title N na ordem
 * @returns {number} 0 se nenhuma coluna de título hierárquico preenchida
 */
function hierarchyDepthForRow(row, titleCols) {
  for (let i = titleCols.length - 1; i >= 0; i -= 1) {
    if (cellNonEmpty(row[titleCols[i]])) return i + 1;
  }
  return 0;
}

/**
 * Texto do item = valor na coluna do nível detectado.
 */
function hierarchyLeafTitle(row, titleCols) {
  const d = hierarchyDepthForRow(row, titleCols);
  if (d === 0) return '';
  return String(row[titleCols[d - 1]] ?? '').trim();
}

/**
 * Pai = último ID visto em nível menor, na ordem do arquivo (pilha por profundidade).
 * @param {Array<{ id: string, raw: object }>} rows com id e raw preenchidos
 * @param {string[]} titleCols
 * @returns {Map<number, string | null>} rowIndex -> parentId
 */
function deriveParentIdsByHierarchy(rows, titleCols) {
  /** @type {{ depth: number, id: string }[]} */
  const stack = [];
  const out = new Map();
  rows.forEach((r, rowIndex) => {
    const depth = hierarchyDepthForRow(r.raw, titleCols);
    let parentId = null;
    if (depth > 0 && r.id) {
      while (stack.length && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }
      parentId = stack.length ? stack[stack.length - 1].id : null;
      stack.push({ depth, id: r.id });
    }
    out.set(rowIndex, parentId);
  });
  return out;
}

/**
 * Lê apenas a primeira linha de dados do CSV como lista de nomes de coluna (linha 1 = cabeçalho).
 * @param {string} text
 * @returns {string[]}
 */
export function readCsvHeaderCells(text) {
  const rows = parse(stripLeadingBom(text), {
    ...PARSE_OPTS,
    columns: false,
    from_line: 1,
    to_line: 1,
  });
  const first = rows[0];
  if (!first?.length) return [];
  return first.map((c) => String(c).trim()).filter((c) => c.length > 0);
}

/**
 * Associa campos lógicos às colunas reais da linha 1 (preferência: valor em hints, depois aliases).
 * @param {string[]} columnNames nomes exatamente como na linha 1
 * @param {{ id: string, title: string, workItemType: string, parent: string }} hints nomes preferidos (ex.: env)
 * @returns {{ id: string | null, title: string | null, workItemType: string | null, parent: string | null, titleHierarchyColumns: string[] }}
 */
export function resolveColumnMapping(columnNames, hints) {
  const exact = new Set(columnNames);
  const byLower = new Map();
  for (const c of columnNames) {
    const low = c.toLowerCase();
    if (!byLower.has(low)) byLower.set(low, c);
  }

  function pick(logicalKey) {
    const preferred = hints[logicalKey]?.trim();
    const aliasList = BUILTIN_ALIASES[logicalKey] ?? [];
    const candidates = [preferred, ...aliasList].filter(Boolean);
    for (const c of candidates) {
      const t = String(c).trim();
      if (exact.has(t)) return t;
      const hit = byLower.get(t.toLowerCase());
      if (hit) return hit;
    }
    return null;
  }

  return {
    id: pick('id'),
    title: pick('title'),
    workItemType: pick('workItemType'),
    parent: pick('parent'),
    titleHierarchyColumns: detectHierarchyTitleColumns(columnNames),
  };
}

/**
 * @param {string} text
 * @param {{ id: string, title: string, workItemType: string, parent: string }} columnHints nomes preferidos por campo; a linha 1 do CSV define as colunas disponíveis
 */
export function parseCsv(text, columnHints) {
  const textNorm = stripLeadingBom(text);
  const headerCells = readCsvHeaderCells(textNorm);
  if (!headerCells.length) {
    return [];
  }

  const mapping = resolveColumnMapping(headerCells, columnHints);
  const hierarchyCols = mapping.titleHierarchyColumns;
  const useHierarchyTitle = hierarchyCols.length > 0 && !mapping.title;
  const useHierarchyParent = hierarchyCols.length > 0 && !mapping.parent;

  const missing = [];
  if (!mapping.id) missing.push('id');
  if (!mapping.workItemType) missing.push('workItemType');
  if (!mapping.title && !useHierarchyTitle) missing.push('title');
  if (!mapping.parent && !useHierarchyParent) missing.push('parent');

  if (missing.length) {
    throw new Error(
      `Colunas obrigatórias não encontradas no CSV (linha 1): ${missing.join(', ')}. ` +
        `Colunas detectadas: ${headerCells.join('; ')}`,
    );
  }

  const records = parse(textNorm, {
    ...PARSE_OPTS,
    columns: true,
  });

  const base = records.map((row, rowIndex) => {
    const id = String(row[mapping.id] ?? '').trim();
    const workItemType = String(row[mapping.workItemType] ?? '').trim();
    let title = mapping.title ? String(row[mapping.title] ?? '').trim() : '';
    let parentId =
      mapping.parent === null
        ? null
        : (() => {
            const parentRaw = row[mapping.parent];
            return parentRaw === undefined ||
              parentRaw === null ||
              String(parentRaw).trim() === ''
              ? null
              : String(parentRaw).trim();
          })();

    return {
      rowIndex,
      id,
      title,
      workItemType,
      parentId,
      raw: row,
    };
  });

  if (!useHierarchyTitle && !useHierarchyParent) {
    return base;
  }

  const parentByIndex = useHierarchyParent ? deriveParentIdsByHierarchy(base, hierarchyCols) : null;

  return base.map((r, i) => {
    let title = r.title;
    if (useHierarchyTitle) {
      title = hierarchyLeafTitle(r.raw, hierarchyCols);
    }
    let parentId = r.parentId;
    if (useHierarchyParent) {
      parentId = parentByIndex.get(i);
    }
    return {
      ...r,
      title,
      parentId,
    };
  });
}
