// VOLTECH — Tests del motor de precios (node:test, sin dependencias)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLine, computeQuoteTotals } from '../server/pricing.js';

const approx = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

test('Prueba de compatibilidad Excel: E02306300 (neto 87,20 / IVA 10,5% / dólar 1500)', () => {
  const r = computeLine({ netUSD: 87.2, iva: 0.105, dollar: 1500 });
  assert.ok(approx(r.finalUSD, 96.356, 0.001), `finalUSD=${r.finalUSD} esperado 96.356`);
  assert.ok(approx(r.finalUnit, 144534, 1), `ARS=${r.finalUnit} esperado 144534`);
  assert.ok(approx(r.costARS, 144534, 1), 'sin margen, costo = venta');
  assert.ok(approx(r.profitUnit, 0, 1), 'sin margen, ganancia = 0');
});

test('IVA 21% se aplica como fracción (no dividir de nuevo por 100)', () => {
  const r = computeLine({ netUSD: 100, iva: 0.21, dollar: 1000 });
  assert.equal(r.finalUSD, 121);
  assert.equal(r.costARS, 121000);
});

test('Margen se aplica como MARKUP sobre costo (compatibilidad Excel)', () => {
  const r = computeLine({ netUSD: 100, iva: 0, dollar: 1000, margin: 0.5 });
  assert.equal(r.costARS, 100000);
  assert.equal(r.salePrice, 150000);        // markup 50% sobre costo
  assert.equal(r.finalUnit, 150000);
  assert.ok(approx(r.markupPct, 50), 'markup 50%');
  assert.ok(approx(r.marginOnSalesPct, 33.333), 'margen real sobre ventas ≈ 33,33%');
});

test('Descuento comercial del proveedor reduce el costo', () => {
  const r = computeLine({ netUSD: 100, iva: 0, dollar: 1000, commercialDiscount: 0.1, margin: 0 });
  assert.equal(r.costARS, 90000);
  assert.equal(r.finalUnit, 90000);
});

test('Descuento al cliente reduce el precio final y el margen', () => {
  const r = computeLine({ netUSD: 100, iva: 0, dollar: 1000, margin: 0.5, clientDiscount: 0.1 });
  assert.equal(r.costARS, 100000);
  assert.equal(r.salePrice, 150000);
  assert.equal(r.finalUnit, 135000);        // 150000 × (1 - 0,10)
  assert.equal(r.profitUnit, 35000);
});

test('Cantidad multiplica el total de línea', () => {
  const r = computeLine({ netUSD: 100, iva: 0, dollar: 1000, qty: 3 });
  assert.equal(r.lineTotal, 300000);
  assert.equal(r.profitLine, 0);
});

test('Totales de presupuesto suman líneas + extras', () => {
  const l1 = { ...computeLine({ netUSD: 100, iva: 0, dollar: 1000, margin: 0.5, qty: 2 }), qty: 2 };
  const l2 = { ...computeLine({ netUSD: 50, iva: 0, dollar: 1000, margin: 0.5, qty: 1 }), qty: 1 };
  const t = computeQuoteTotals([l1, l2], 20000);
  // costos: 200000 + 50000 = 250000 ; ventas: 300000 + 75000 = 375000
  assert.equal(t.cost, 250000);
  assert.equal(t.total, 375000 + 20000);
  assert.equal(t.extras, 20000);
});

test('Producto sin neto no rompe el cálculo', () => {
  const r = computeLine({ netUSD: null, iva: 0.21, dollar: 1500 });
  assert.equal(r.finalUnit, 0);
});
