import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, readCsvHeaderCells, resolveColumnMapping } from '../src/csvParser.js';

const defaultHints = {
  id: 'ID',
  title: 'Title',
  workItemType: 'Work Item Type',
  parent: 'Parent',
};

test('parseCsv mapeia colunas e pai vazio', () => {
  const csv = `ID,Title,Work Item Type,Parent
1,Epic A,Epic,
2,Task B,Task,1`;
  const rows = parseCsv(csv, defaultHints);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, '1');
  assert.equal(rows[0].parentId, null);
  assert.equal(rows[1].parentId, '1');
});

test('readCsvHeaderCells lê nomes da linha 1', () => {
  const csv = `Alpha,Beta,Gamma
1,2,3`;
  assert.deepEqual(readCsvHeaderCells(csv), ['Alpha', 'Beta', 'Gamma']);
});

test('parseCsv segue ordem e nomes da linha 1 (case-insensitive)', () => {
  const csv = `parent,title,id,work item type
,Root,,Epic
1,Child,2,Task`;
  const rows = parseCsv(csv, defaultHints);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, '');
  assert.equal(rows[1].id, '2');
  assert.equal(rows[1].parentId, '1');
});

test('parseCsv resolve alias embutido (Work Item Id)', () => {
  const csv = `Work Item Id,Title,Work Item Type,Parent
10,A,Epic,
11,B,Task,10`;
  const rows = parseCsv(csv, defaultHints);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].id, '11');
  assert.equal(rows[1].parentId, '10');
});

test('resolveColumnMapping usa hint quando coluna existe com outra capitalização', () => {
  const m = resolveColumnMapping(['id', 'TITLE', 'Work Item Type', 'parent'], {
    id: 'ID',
    title: 'Title',
    workItemType: 'Work Item Type',
    parent: 'Parent',
  });
  assert.equal(m.id, 'id');
  assert.equal(m.title, 'TITLE');
  assert.equal(m.parent, 'parent');
  assert.equal(m.titleHierarchyColumns.length, 0);
});

test('parseCsv remove BOM UTF-8 da primeira coluna (ID)', () => {
  const csv = '\uFEFFID,Work Item Type,Title 1,Title 2\n70173,Epic,X,,\n70193,Feature,,Y';
  const rows = parseCsv(csv, defaultHints);
  assert.equal(rows[0].id, '70173');
  assert.equal(rows[1].parentId, '70173');
});

test('parseCsv export hierárquico Azure (Title 1–4, sem coluna Parent)', () => {
  const csv = `ID,Work Item Type,Title 1,Title 2,Title 3,Title 4,Assigned To,State,Tags,Estimate
"70173","Epic","Restruturação",,,,,"New",,
"70193","Feature",,"Ambiente Dev",,,,"New",,
"70199","Product Backlog Item",,,"PostgreSQL - Holding",,,"New",,
"70209","Task",,,,"[infra] - Criar banco","Elvis","Done","bd","1"`;
  const rows = parseCsv(csv, defaultHints);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].id, '70173');
  assert.equal(rows[0].parentId, null);
  assert.equal(rows[0].title, 'Restruturação');
  assert.equal(rows[1].parentId, '70173');
  assert.equal(rows[1].title, 'Ambiente Dev');
  assert.equal(rows[2].parentId, '70193');
  assert.equal(rows[2].title, 'PostgreSQL - Holding');
  assert.equal(rows[3].parentId, '70199');
  assert.equal(rows[3].title, '[infra] - Criar banco');
});

test('parseCsv falha com mensagem clara se coluna obrigatória não existe na linha 1', () => {
  const csv = `Foo,Bar
1,2`;
  assert.throws(
    () => parseCsv(csv, defaultHints),
    /Colunas obrigatórias não encontradas.*Colunas detectadas: Foo; Bar/s,
  );
});
