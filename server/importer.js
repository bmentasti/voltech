// VOLTECH — Importador de listas de precios (Excel)
// Flujo: parsear → normalizar → validar → comparar → (confirmar en index.js)
// El parseo de XLSX usa SheetJS (dependencia 'xlsx'); la lógica de diff es pura y testeable.

const HEADER_MAP = [
  [/^(codigo|código|cod|sku|art[ií]culo)$/i, 'code'],
  [/^(descripci[oó]n|detalle|producto|nombre)$/i, 'description'],
  [/^(categor[ií]a|rubro|familia\/categoria)$/i, 'category'],
  [/^(tecnolog[ií]a|tecnolog[ií]a o tipo|tipo|tec\.?)$/i, 'technology'],
  [/^(precio neto usd|neto usd|precio neto|neto|costo usd|precio usd)$/i, 'netUSD'],
  [/^(iva|iva %|al[ií]cuota|alicuota)$/i, 'iva'],
  [/^(observaci[oó]n(es)?|obs\.?|notas?)$/i, 'observations'],
];

export function normalizeHeader(h) {
  const s = String(h || '').trim();
  for (const [rx, key] of HEADER_MAP) if (rx.test(s)) return key;
  return null;
}

export function parseNumber(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// IVA a fracción: 0.105 → 0.105 ; 10,5 / "10,5%" / 21 → /100
export function parseIva(v) {
  const n = parseNumber(v);
  if (n == null) return null;
  return n > 1 ? +(n / 100).toFixed(5) : n;
}

// Convierte una hoja (array de arrays) en filas normalizadas.
export function rowsFromSheet(aoa) {
  if (!aoa || !aoa.length) return [];
  // encontrar la fila de encabezados (la que tenga 'codigo' y 'precio')
  let headerRow = -1, headerKeys = null;
  for (let i = 0; i < Math.min(aoa.length, 8); i++) {
    const keys = aoa[i].map(normalizeHeader);
    if (keys.includes('code') && keys.includes('netUSD')) { headerRow = i; headerKeys = keys; break; }
  }
  if (headerRow < 0) return [];
  const out = [];
  for (let r = headerRow + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row || row.every((c) => c == null || c === '')) continue;
    const obj = {};
    headerKeys.forEach((k, c) => { if (k) obj[k] = row[c]; });
    if (obj.code == null && obj.description == null) continue;
    out.push({
      code: obj.code != null ? String(obj.code).trim() : '',
      description: obj.description != null ? String(obj.description).trim() : '',
      category: obj.category != null ? String(obj.category).trim() : '',
      technology: obj.technology != null ? String(obj.technology).trim() : '',
      netUSD: parseNumber(obj.netUSD),
      iva: parseIva(obj.iva),
      observations: obj.observations != null ? String(obj.observations).trim() : '',
    });
  }
  return out;
}

// Parsea el workbook completo. Prioriza la hoja "Todos"; si no, consolida las de categorías.
export async function parseWorkbook(buffer) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetNames = wb.SheetNames;
  const toAoa = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true });

  const todos = sheetNames.find((n) => /^todos$/i.test(n));
  if (todos) {
    const rows = rowsFromSheet(toAoa(todos));
    if (rows.length) return { rows, sheetUsed: todos, sheets: sheetNames };
  }
  // consolidar todas las hojas que parezcan de productos
  const skip = /config|actualiz|observ|resumen|hoja\d/i;
  let all = [];
  for (const n of sheetNames) {
    if (skip.test(n)) continue;
    all = all.concat(rowsFromSheet(toAoa(n)));
  }
  return { rows: all, sheetUsed: 'consolidado', sheets: sheetNames };
}

/**
 * Compara catálogo actual vs lista importada. Comparación principal por CÓDIGO.
 * existing: [{id, code, netUSD, iva, category, description, active}]
 * imported: filas normalizadas
 */
export function diffCatalog(existing, imported) {
  const byCode = new Map();
  existing.forEach((p) => byCode.set(String(p.code).trim(), p));

  const seen = new Map(); // code -> count en importado
  imported.forEach((r) => seen.set(r.code, (seen.get(r.code) || 0) + 1));

  const rows = [];
  const importedCodes = new Set();

  for (const r of imported) {
    const issues = [];
    if (!r.code) issues.push('sin código');
    if (r.netUSD == null) issues.push('sin precio');
    else if (r.netUSD < 0) issues.push('precio negativo');
    if (r.iva == null) issues.push('sin IVA');
    if (r.code && seen.get(r.code) > 1) issues.push('duplicado');

    let action, oldNet = null, pct = null;
    if (issues.length) {
      action = 'error';
    } else {
      importedCodes.add(r.code);
      const cur = byCode.get(r.code);
      if (!cur) action = 'new';
      else {
        oldNet = cur.netUSD;
        const changedPrice = Math.abs((cur.netUSD || 0) - (r.netUSD || 0)) > 0.001;
        const changedCat = (cur.category || '') !== (r.category || '') && r.category;
        if (changedPrice) {
          action = 'updated';
          pct = cur.netUSD ? ((r.netUSD - cur.netUSD) / cur.netUSD) * 100 : null;
        } else if (changedCat) {
          action = 'manual'; // cambio de categoría → revisión manual
        } else {
          action = 'unchanged';
        }
      }
    }
    rows.push({
      code: r.code, description: r.description, category: r.category, technology: r.technology,
      netUSD: r.netUSD, iva: r.iva, observations: r.observations,
      action, oldNet, pct, issues: issues.join(', '),
    });
  }

  // discontinuados: activos que no vinieron en la lista (y sin error de código)
  const discontinued = existing
    .filter((p) => p.active && !importedCodes.has(String(p.code).trim()))
    .map((p) => ({ code: p.code, description: p.description, action: 'discontinued', oldNet: p.netUSD }));

  const all = rows.concat(discontinued);
  const summary = {
    total: imported.length,
    new: rows.filter((r) => r.action === 'new').length,
    updated: rows.filter((r) => r.action === 'updated').length,
    unchanged: rows.filter((r) => r.action === 'unchanged').length,
    discontinued: discontinued.length,
    duplicates: [...seen.values()].filter((c) => c > 1).length,
    errors: rows.filter((r) => r.action === 'error').length,
    manual: rows.filter((r) => r.action === 'manual').length,
  };
  return { rows: all, summary };
}
