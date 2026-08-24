// VOLTECH — Tests del importador de listas (lógica pura, sin XLSX)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHeader, parseNumber, parseIva, rowsFromSheet, diffCatalog } from '../server/importer.js';

test('normalizeHeader reconoce variantes de columnas', () => {
  assert.equal(normalizeHeader('Código'), 'code');
  assert.equal(normalizeHeader('codigo'), 'code');
  assert.equal(normalizeHeader('Precio neto USD'), 'netUSD');
  assert.equal(normalizeHeader('IVA %'), 'iva');
  assert.equal(normalizeHeader('Descripción'), 'description');
  assert.equal(normalizeHeader('Columna rara'), null);
});

test('parseNumber maneja coma decimal y separador de miles', () => {
  assert.equal(parseNumber('87,20'), 87.2);
  assert.equal(parseNumber('1.046,50'), 1046.5);
  assert.equal(parseNumber(103.1), 103.1);
  assert.equal(parseNumber(''), null);
});

test('parseIva normaliza a fracción', () => {
  assert.equal(parseIva(0.105), 0.105);
  assert.equal(parseIva(21), 0.21);
  assert.equal(parseIva('10,5%'), 0.105);
});

test('rowsFromSheet detecta encabezados y filas', () => {
  const aoa = [
    ['LISTA DE PRECIOS'],
    ['Código', 'Descripción', 'Precio neto USD', 'IVA %'],
    ['E001', 'KIT A', '100', '21'],
    ['E002', 'KIT B', '50,5', '10,5'],
    [null, null, null, null],
  ];
  const rows = rowsFromSheet(aoa);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].code, 'E001');
  assert.equal(rows[0].netUSD, 100);
  assert.equal(rows[0].iva, 0.21);
  assert.equal(rows[1].netUSD, 50.5);
});

test('diffCatalog: nuevos, actualizados, sin cambios, discontinuados (test 7/7/156 conceptual)', () => {
  const existing = [
    { id: '1', code: 'A', netUSD: 100, iva: 0.21, category: 'X', active: 1, description: 'A' },
    { id: '2', code: 'B', netUSD: 50, iva: 0.21, category: 'X', active: 1, description: 'B' },
    { id: '3', code: 'C', netUSD: 30, iva: 0.21, category: 'X', active: 1, description: 'C' }, // desaparece
  ];
  const imported = [
    { code: 'A', netUSD: 110, iva: 0.21, category: 'X', description: 'A' }, // actualizado
    { code: 'B', netUSD: 50, iva: 0.21, category: 'X', description: 'B' },  // sin cambios
    { code: 'D', netUSD: 80, iva: 0.21, category: 'X', description: 'D' },  // nuevo
  ];
  const { summary, rows } = diffCatalog(existing, imported);
  assert.equal(summary.new, 1);
  assert.equal(summary.updated, 1);
  assert.equal(summary.unchanged, 1);
  assert.equal(summary.discontinued, 1);
  const upd = rows.find((r) => r.code === 'A');
  assert.ok(Math.abs(upd.pct - 10) < 0.001, 'variación +10%');
});

test('diffCatalog: errores (sin código, sin precio, sin IVA) y duplicados', () => {
  const imported = [
    { code: '', netUSD: 10, iva: 0.21, description: 'sin codigo' },
    { code: 'X', netUSD: null, iva: 0.21, description: 'sin precio' },
    { code: 'Y', netUSD: 10, iva: null, description: 'sin iva' },
    { code: 'Z', netUSD: 10, iva: 0.21, description: 'dup' },
    { code: 'Z', netUSD: 10, iva: 0.21, description: 'dup2' },
  ];
  const { summary } = diffCatalog([], imported);
  // sin código + sin precio + sin IVA + ambos Z (duplicados) = 5 filas con error
  assert.equal(summary.errors, 5);
  assert.equal(summary.duplicates, 1); // un código repetido (Z)
});

test('diffCatalog: cambio de categoría → revisión manual', () => {
  const existing = [{ id: '1', code: 'A', netUSD: 100, iva: 0.21, category: 'X', active: 1, description: 'A' }];
  const imported = [{ code: 'A', netUSD: 100, iva: 0.21, category: 'NUEVA', description: 'A' }];
  const { summary } = diffCatalog(existing, imported);
  assert.equal(summary.manual, 1);
});
