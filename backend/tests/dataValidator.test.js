import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHierarchy } from '../src/dataValidator.js';

test('validateHierarchy aceita árvore simples', () => {
  const rows = [
    { rowIndex: 0, id: '1', title: 'A', workItemType: 'Epic', parentId: null, raw: {} },
    { rowIndex: 1, id: '2', title: 'B', workItemType: 'Task', parentId: '1', raw: {} },
  ];
  const r = validateHierarchy(rows);
  assert.equal(r.ok, true);
  assert.equal(r.sorted[0].id, '1');
  assert.equal(r.sorted[1].id, '2');
});

test('validateHierarchy rejeita pai inexistente', () => {
  const rows = [
    { rowIndex: 0, id: '1', title: 'A', workItemType: 'Epic', parentId: 'x', raw: {} },
  ];
  const r = validateHierarchy(rows);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('não encontrado')));
});
