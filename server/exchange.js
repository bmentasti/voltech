// VOLTECH — ExchangeRateProvider
// Obtiene el dólar oficial argentino desde una API confiable, con fuente de respaldo
// y opción de ingreso manual. Reemplaza el IMPORTXML frágil del Excel.
// Por defecto: DÓLAR OFICIAL VENDEDOR (venta).

// Fuente primaria: dolarapi.com (JSON estable, sin scraping de HTML).
// Fuente de respaldo: bluelytics.com.ar
const PRIMARY = 'https://dolarapi.com/v1/dolares/oficial';
const BACKUP = 'https://api.bluelytics.com.ar/v2/latest';

async function fetchJson(url, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Devuelve { value, buy, sell, source, type, fetchedAt } o lanza error.
 * type = 'oficial_venta' por defecto.
 */
export async function fetchOfficialRate() {
  // Primaria
  try {
    const d = await fetchJson(PRIMARY);
    const sell = Number(d.venta);
    const buy = Number(d.compra);
    if (sell > 0) {
      return {
        value: sell,
        buy: buy || null,
        sell,
        source: 'dolarapi.com (oficial)',
        type: 'oficial_venta',
        fetchedAt: new Date().toISOString(),
      };
    }
  } catch (e) {
    // seguimos al respaldo
  }
  // Respaldo
  try {
    const d = await fetchJson(BACKUP);
    const sell = Number(d?.oficial?.value_sell);
    const buy = Number(d?.oficial?.value_buy);
    if (sell > 0) {
      return {
        value: sell,
        buy: buy || null,
        sell,
        source: 'bluelytics.com.ar (respaldo)',
        type: 'oficial_venta',
        fetchedAt: new Date().toISOString(),
      };
    }
  } catch (e) {
    // sin conexión
  }
  throw new Error('No se pudo obtener el dólar oficial de ninguna fuente online.');
}
