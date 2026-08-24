// VOLTECH — Presupuestos & Gestión — Servidor HTTP (sin dependencias externas)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { db, initDb, uuid, getSetting, setSetting, getAllSettings, audit, DB_PATH } from './db.js';
import { hashPassword, verifyPassword, newToken } from './auth.js';
import { computeLine, computeQuoteTotals } from './pricing.js';
import { fetchOfficialRate } from './exchange.js';
import { parseWorkbook, diffCatalog } from './importer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;
const SESSION_DAYS = 7;

initDb();

// ---------- helpers ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(body);
}
function sendErr(res, status, msg) { send(res, status, { error: msg }); }

function parseCookies(req) {
  const h = req.headers.cookie || '';
  const out = {};
  h.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

async function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => {
      try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); }
    });
  });
}

function getUser(req) {
  const token = parseCookies(req).vol_session;
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token=?').get(token);
  if (!s) return null;
  if (new Date(s.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token=?').run(token);
    return null;
  }
  return db.prepare('SELECT id,username,role FROM users WHERE id=?').get(s.user_id);
}

function currentRate() {
  return db.prepare('SELECT * FROM exchange_rates ORDER BY created_at DESC LIMIT 1').get();
}

function num(v, def = 0) { const n = Number(v); return Number.isFinite(n) ? n : def; }
// SQLite no acepta `undefined` como valor de binding: lo convertimos a null.
function nz(v) { return v === undefined ? null : v; }

// ---------- product mapping ----------
function productRow(p) {
  return {
    id: p.id, code: p.code, description: p.description,
    category: p.category_name, family: p.family_name, technology: p.technology,
    netUSD: p.net_usd, iva: p.iva, updateState: p.update_state,
    observations: p.observations, active: !!p.active,
    createdAt: p.created_at, updatedAt: p.updated_at,
  };
}
const PRODUCT_SELECT = `
  SELECT p.*, c.name AS category_name, f.name AS family_name
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN families f ON f.id = p.family_id`;

// ---------- routes ----------
const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
  routes.push({ method, rx, keys, handler, public: !!opts.public });
}

// --- Auth ---
route('POST', '/api/login', async (req, res) => {
  const { username, password } = await readBody(req);
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(String(username || ''));
  if (!u || !verifyPassword(String(password || ''), u.password_hash)) return sendErr(res, 401, 'Usuario o contraseña incorrectos');
  const token = newToken();
  const now = new Date();
  const exp = new Date(now.getTime() + SESSION_DAYS * 864e5);
  db.prepare('INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)')
    .run(token, u.id, now.toISOString(), exp.toISOString());
  const cookie = `vol_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
  send(res, 200, { user: { id: u.id, username: u.username, role: u.role } }, { 'Set-Cookie': cookie });
}, { public: true });

route('POST', '/api/logout', async (req, res, _p, user) => {
  const token = parseCookies(req).vol_session;
  if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
  send(res, 200, { ok: true }, { 'Set-Cookie': 'vol_session=; HttpOnly; Path=/; Max-Age=0' });
});

route('GET', '/api/me', async (req, res, _p, user) => send(res, 200, { user }));

route('POST', '/api/password', async (req, res, _p, user) => {
  const { current, next } = await readBody(req);
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
  if (!verifyPassword(String(current || ''), u.password_hash)) return sendErr(res, 400, 'La contraseña actual no es correcta');
  if (!next || String(next).length < 6) return sendErr(res, 400, 'La nueva contraseña debe tener al menos 6 caracteres');
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(String(next)), user.id);
  audit(user.id, 'change_password', 'user', user.id, null, null);
  send(res, 200, { ok: true });
});

// --- Settings ---
route('GET', '/api/settings', async (req, res) => send(res, 200, getAllSettings()));
route('PUT', '/api/settings', async (req, res, _p, user) => {
  const body = await readBody(req);
  for (const [k, v] of Object.entries(body)) setSetting(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  audit(user.id, 'update_settings', 'settings', null, null, body);
  send(res, 200, getAllSettings());
});

// --- Exchange ---
route('GET', '/api/exchange/current', async (req, res) => send(res, 200, currentRate()));
route('GET', '/api/exchange/history', async (req, res) =>
  send(res, 200, db.prepare('SELECT * FROM exchange_rates ORDER BY created_at DESC LIMIT 50').all()));
route('POST', '/api/exchange/refresh', async (req, res, _p, user) => {
  try {
    const r = await fetchOfficialRate();
    const id = uuid();
    db.prepare('INSERT INTO exchange_rates(id,value,buy,sell,source,type,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(id, r.value, r.buy, r.sell, r.source, r.type, new Date().toISOString());
    audit(user.id, 'update_dollar', 'exchange_rate', id, null, r);
    send(res, 200, currentRate());
  } catch (e) {
    sendErr(res, 502, e.message + ' Podés ingresar el valor manualmente.');
  }
});
route('POST', '/api/exchange/manual', async (req, res, _p, user) => {
  const { value } = await readBody(req);
  const v = num(value);
  if (v <= 0) return sendErr(res, 400, 'Ingresá un valor de dólar válido');
  const id = uuid();
  db.prepare('INSERT INTO exchange_rates(id,value,buy,sell,source,type,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(id, v, null, v, 'Manual', 'oficial_venta', new Date().toISOString());
  audit(user.id, 'update_dollar', 'exchange_rate', id, null, { value: v, source: 'Manual' });
  send(res, 200, currentRate());
});

// --- Catalog ---
route('GET', '/api/families', async (req, res) =>
  send(res, 200, db.prepare('SELECT id,name FROM families ORDER BY sort_order').all()));
route('GET', '/api/categories', async (req, res) =>
  send(res, 200, db.prepare('SELECT c.id,c.name,f.name AS family FROM categories c LEFT JOIN families f ON f.id=c.family_id ORDER BY c.sort_order').all()));

route('GET', '/api/products', async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const q = (u.searchParams.get('search') || '').trim().toLowerCase();
  const family = u.searchParams.get('family');
  const category = u.searchParams.get('category');
  const iva = u.searchParams.get('iva');
  const estado = u.searchParams.get('estado');
  const active = u.searchParams.get('active');

  let rows = db.prepare(PRODUCT_SELECT).all().map(productRow);
  if (q) rows = rows.filter((p) =>
    (p.code || '').toLowerCase().includes(q) ||
    (p.description || '').toLowerCase().includes(q) ||
    (p.category || '').toLowerCase().includes(q) ||
    (p.family || '').toLowerCase().includes(q) ||
    (p.technology || '').toLowerCase().includes(q));
  if (family) rows = rows.filter((p) => p.family === family);
  if (category) rows = rows.filter((p) => p.category === category);
  if (iva) rows = rows.filter((p) => String(p.iva) === iva);
  if (estado) rows = rows.filter((p) => p.updateState === estado);
  if (active === '1') rows = rows.filter((p) => p.active);

  const dollar = currentRate().value;
  const settings = getAllSettings();
  const cd = num(settings.commercialDiscount), mg = num(settings.margin);
  rows.forEach((p) => {
    if (p.netUSD != null) {
      const c = computeLine({ netUSD: p.netUSD, iva: p.iva, dollar, commercialDiscount: cd, margin: mg });
      p.finalUSD = c.finalUSD;
      p.priceARS = c.finalUnit;
    }
  });
  send(res, 200, { products: rows, dollar });
});

route('GET', '/api/products/:id', async (req, res, p) => {
  const row = db.prepare(PRODUCT_SELECT + ' WHERE p.id=?').get(p.id);
  if (!row) return sendErr(res, 404, 'Producto no encontrado');
  send(res, 200, productRow(row));
});

// --- Customers ---
route('GET', '/api/customers', async (req, res) => {
  const rows = db.prepare('SELECT * FROM customers ORDER BY name').all();
  rows.forEach((c) => {
    const agg = db.prepare(`SELECT COUNT(*) n,
      SUM(CASE WHEN status IN ('Aprobado','Seña recibida','Finalizado','Cobrado') THEN 1 ELSE 0 END) approved
      FROM quotes WHERE customer_id=?`).get(c.id);
    c.quoteCount = agg.n; c.approvedCount = agg.approved || 0;
  });
  send(res, 200, rows);
});
route('POST', '/api/customers', async (req, res, _p, user) => {
  const b = await readBody(req);
  if (!b.name || !b.name.trim()) return sendErr(res, 400, 'El nombre / razón social es obligatorio');
  const id = uuid();
  db.prepare(`INSERT INTO customers(id,name,tax_id,contact,phone,whatsapp,email,address,city,install_address,notes,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, b.name.trim(), nz(b.taxId), nz(b.contact), nz(b.phone), nz(b.whatsapp),
    nz(b.email), nz(b.address), nz(b.city), nz(b.installAddress), nz(b.notes), new Date().toISOString());
  audit(user.id, 'create', 'customer', id, null, b);
  send(res, 201, db.prepare('SELECT * FROM customers WHERE id=?').get(id));
});
route('PUT', '/api/customers/:id', async (req, res, p, user) => {
  const b = await readBody(req);
  const old = db.prepare('SELECT * FROM customers WHERE id=?').get(p.id);
  if (!old) return sendErr(res, 404, 'Cliente no encontrado');
  db.prepare(`UPDATE customers SET name=?,tax_id=?,contact=?,phone=?,whatsapp=?,email=?,address=?,city=?,install_address=?,notes=? WHERE id=?`)
    .run(b.name ?? old.name, b.taxId ?? old.tax_id, b.contact ?? old.contact, b.phone ?? old.phone,
      b.whatsapp ?? old.whatsapp, b.email ?? old.email, b.address ?? old.address, b.city ?? old.city,
      b.installAddress ?? old.install_address, b.notes ?? old.notes, p.id);
  audit(user.id, 'update', 'customer', p.id, old, b);
  send(res, 200, db.prepare('SELECT * FROM customers WHERE id=?').get(p.id));
});
route('GET', '/api/customers/:id', async (req, res, p) => {
  const c = db.prepare('SELECT * FROM customers WHERE id=?').get(p.id);
  if (!c) return sendErr(res, 404, 'Cliente no encontrado');
  c.quotes = db.prepare('SELECT id,number,status,created_at FROM quotes WHERE customer_id=? ORDER BY created_at DESC').all(p.id);
  send(res, 200, c);
});

// --- Alta de cliente por formulario público (sin autenticación) ---
route('POST', '/api/public/intake', async (req, res) => {
  const b = await readBody(req);
  const cap = (v, n = 200) => (v == null ? null : String(v).trim().slice(0, n) || null);
  const name = cap(b.name);
  if (!name) return sendErr(res, 400, 'Ingresá tu nombre o razón social');
  const id = uuid();
  db.prepare(`INSERT INTO customers(id,name,tax_id,contact,phone,whatsapp,email,address,city,install_address,notes,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, name, cap(b.taxId, 40), cap(b.contact), cap(b.phone, 40), cap(b.whatsapp, 40),
    cap(b.email), cap(b.address, 300), cap(b.city), cap(b.installAddress, 300), cap(b.notes, 1000), new Date().toISOString());
  send(res, 200, { ok: true });
}, { public: true });

// --- Pricing preview (para el cotizador en vivo) ---
route('POST', '/api/pricing/preview', async (req, res) => {
  const b = await readBody(req);
  const dollar = num(b.dollar) || currentRate().value;
  const cd = num(b.commercialDiscount), mg = num(b.margin);
  const lines = (b.items || []).map((it) => {
    const prod = db.prepare(PRODUCT_SELECT + ' WHERE p.id=?').get(it.productId);
    const netUSD = prod ? prod.net_usd : num(it.netUSD);
    const iva = prod ? prod.iva : num(it.iva);
    const c = computeLine({ netUSD, iva, dollar, commercialDiscount: cd, margin: mg, clientDiscount: num(it.clientDiscount), qty: num(it.qty, 1) });
    return {
      productId: it.productId, code: prod?.code || it.code, description: prod?.description || it.description,
      netUSD, iva, qty: num(it.qty, 1), clientDiscount: num(it.clientDiscount), ...c,
    };
  });
  const totals = computeQuoteTotals(lines, num(b.extras));
  send(res, 200, { dollar, lines, totals });
});

// --- Quotes ---
function nextQuoteNumber() {
  const year = new Date().getFullYear();
  const n = num(getSetting('quoteCounter')) + 1;
  setSetting('quoteCounter', n);
  return `VOL-${year}-${String(n).padStart(4, '0')}`;
}

route('GET', '/api/quotes', async (req, res) => {
  const includeVoided = new URL(req.url, 'http://x').searchParams.get('includeVoided') === '1';
  const rows = db.prepare(`
    SELECT q.*, c.name AS customer_name,
      (SELECT total FROM quote_versions v WHERE v.quote_id=q.id AND v.version=q.current_version) AS total,
      (SELECT margin_pct FROM quote_versions v WHERE v.quote_id=q.id AND v.version=q.current_version) AS margin_pct
    FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id
    ${includeVoided ? '' : "WHERE q.status <> 'Anulado'"}
    ORDER BY q.created_at DESC`).all();
  send(res, 200, rows);
});

route('POST', '/api/quotes', async (req, res, _p, user) => {
  const b = await readBody(req);
  if (!b.items || !b.items.length) return sendErr(res, 400, 'Agregá al menos un producto');
  const dollar = num(b.dollar) || currentRate().value;
  const cd = num(b.commercialDiscount, num(getSetting('commercialDiscount')));
  const mg = num(b.margin, num(getSetting('margin')));
  const extras = num(b.labor) + num(b.freight) + num(b.otherConcepts) + num(b.extras);

  // snapshot de cada línea
  const lines = b.items.map((it) => {
    const prod = db.prepare(PRODUCT_SELECT + ' WHERE p.id=?').get(it.productId);
    const netUSD = prod ? prod.net_usd : num(it.netUSD);
    const iva = prod ? prod.iva : num(it.iva);
    const c = computeLine({ netUSD, iva, dollar, commercialDiscount: cd, margin: mg, clientDiscount: num(it.clientDiscount), qty: num(it.qty, 1) });
    return { productId: it.productId, code: prod?.code || it.code, description: prod?.description || it.description,
      netUSD, iva, clientDiscount: num(it.clientDiscount), qty: num(it.qty, 1), commercialDiscount: cd, margin: mg, ...c };
  });
  const totals = computeQuoteTotals(lines, extras);

  const now = new Date().toISOString();
  const quoteId = uuid();
  const number = nextQuoteNumber();
  db.prepare(`INSERT INTO quotes(id,number,customer_id,status,current_version,next_followup,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?)`).run(quoteId, number, b.customerId || null, 'Borrador', 1, b.nextFollowup || null, now, now);

  const versionId = uuid();
  db.prepare(`INSERT INTO quote_versions(id,quote_id,version,date,due_date,dollar_used,commercial_discount,margin,extras,labor,freight,other_concepts,deposit_requested,notes,warranty,payment_terms,conditions,subtotal,discount_amount,total,cost,profit,margin_pct,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    versionId, quoteId, 1, b.date || now, b.dueDate || null, dollar, cd, mg,
    extras, num(b.labor), num(b.freight), num(b.otherConcepts), num(b.depositRequested),
    b.notes || null, b.warranty || getSetting('warranty'), b.paymentTerms || null, b.conditions || getSetting('standardConditions'),
    totals.subtotal, totals.discountAmount, totals.total, totals.cost, totals.profit, totals.marginOnSalesPct, now);

  const insItem = db.prepare(`INSERT INTO quote_items
    (id,version_id,product_id,code,description,net_usd,iva,dollar_used,commercial_discount,margin,client_discount,qty,final_usd,cost_ars,sale_price,final_unit,line_total,profit_line,margin_pct)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const l of lines) {
    insItem.run(uuid(), versionId, l.productId || null, l.code, l.description, l.netUSD, l.iva, dollar, cd, mg,
      l.clientDiscount, l.qty, l.finalUSD, l.costARS, l.salePrice, l.finalUnit, l.lineTotal, l.profitLine, l.marginOnSalesPct);
  }
  db.prepare('INSERT INTO quote_activity(id,quote_id,type,detail,user_id,created_at) VALUES(?,?,?,?,?,?)')
    .run(uuid(), quoteId, 'created', `Presupuesto ${number} creado (V1)`, user.id, now);
  audit(user.id, 'create', 'quote', quoteId, null, { number, total: totals.total });

  send(res, 201, { id: quoteId, number });
});

route('GET', '/api/quotes/:id', async (req, res, p) => {
  const q = db.prepare('SELECT q.*, c.name AS customer_name FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id WHERE q.id=?').get(p.id);
  if (!q) return sendErr(res, 404, 'Presupuesto no encontrado');
  q.customer = q.customer_id ? db.prepare('SELECT * FROM customers WHERE id=?').get(q.customer_id) : null;
  q.versions = db.prepare('SELECT * FROM quote_versions WHERE quote_id=? ORDER BY version').all(p.id);
  for (const v of q.versions) v.items = db.prepare('SELECT * FROM quote_items WHERE version_id=?').all(v.id);
  q.activity = db.prepare('SELECT * FROM quote_activity WHERE quote_id=? ORDER BY created_at DESC').all(p.id);
  q.payments = db.prepare('SELECT * FROM payments WHERE quote_id=? ORDER BY date').all(p.id);
  q.purchases = db.prepare('SELECT * FROM purchases WHERE quote_id=? ORDER BY date').all(p.id);
  q.settings = getAllSettings();

  const cv = q.versions.find((v) => v.version === q.current_version) || q.versions[0];
  // aviso de variación de dólar
  const cur = currentRate().value;
  if (cv && cv.dollar_used) {
    q.dollarVariation = { used: cv.dollar_used, current: cur, pct: ((cur - cv.dollar_used) / cv.dollar_used) * 100 };
  }
  // resumen económico: estimado vs real
  const paid = q.payments.reduce((s, x) => s + (x.amount || 0), 0);
  const realCost = db.prepare('SELECT COALESCE(SUM(total),0) t FROM purchases WHERE quote_id=?').get(p.id).t;
  const directExpenses = db.prepare('SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE quote_id=?').get(p.id).t;
  const estCost = cv ? (cv.cost || 0) : 0;
  const estProfit = cv ? (cv.profit || 0) : 0;
  const total = cv ? (cv.total || 0) : 0;
  const deposit = cv ? (cv.deposit_requested || 0) : 0;
  q.finance = {
    total, paid, balance: total - paid,
    depositRequested: deposit,
    estCost, estProfit,
    realCost, directExpenses,
    realProfit: total - realCost - directExpenses,
    profitDeviation: (total - realCost - directExpenses) - estProfit,
    // capital a financiar: compras comprometidas + costos directos - señas/cobros
    capitalToFinance: (realCost || estCost) + directExpenses - paid,
    depositCoversPurchases: deposit >= (realCost || estCost),
  };
  send(res, 200, q);
});

route('PUT', '/api/quotes/:id/status', async (req, res, p, user) => {
  const b = await readBody(req);
  const q = db.prepare('SELECT * FROM quotes WHERE id=?').get(p.id);
  if (!q) return sendErr(res, 404, 'Presupuesto no encontrado');
  db.prepare('UPDATE quotes SET status=?, lost_reason=?, next_followup=?, last_contact=?, updated_at=? WHERE id=?')
    .run(b.status || q.status, b.lostReason ?? q.lost_reason, b.nextFollowup ?? q.next_followup,
      b.lastContact ?? q.last_contact, new Date().toISOString(), p.id);
  db.prepare('INSERT INTO quote_activity(id,quote_id,type,detail,user_id,created_at) VALUES(?,?,?,?,?,?)')
    .run(uuid(), p.id, 'status', `Estado → ${b.status}${b.lostReason ? ' (' + b.lostReason + ')' : ''}`, user.id, new Date().toISOString());
  audit(user.id, 'change_status', 'quote', p.id, { status: q.status }, { status: b.status });
  send(res, 200, { ok: true });
});

// --- Dashboard (básico para el núcleo) ---
route('GET', '/api/dashboard', async (req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const q = db.prepare(`SELECT q.status, v.total, v.margin_pct FROM quotes q
    JOIN quote_versions v ON v.quote_id=q.id AND v.version=q.current_version
    WHERE q.created_at >= ? AND q.status <> 'Anulado'`).all(monthStart);
  const approvedStates = ['Aprobado', 'Seña recibida', 'Finalizado', 'Cobrado'];
  const lostStates = ['Perdido / rechazado', 'Vencido'];
  const total = q.reduce((s, r) => s + (r.total || 0), 0);
  const approved = q.filter((r) => approvedStates.includes(r.status));
  const lost = q.filter((r) => lostStates.includes(r.status));
  const approvedAmt = approved.reduce((s, r) => s + (r.total || 0), 0);
  const lostAmt = lost.reduce((s, r) => s + (r.total || 0), 0);
  const estProfit = approved.reduce((s, r) => s + (r.profit || 0), 0);

  const paidMonth = db.prepare('SELECT COALESCE(SUM(amount),0) t FROM payments WHERE created_at >= ?').get(monthStart).t;
  const purchasesMonth = db.prepare('SELECT COALESCE(SUM(total),0) t FROM purchases WHERE created_at >= ?').get(monthStart).t;
  const purchasesPending = db.prepare(`SELECT COALESCE(SUM(total),0) t FROM purchases WHERE status NOT IN ('Recibido','Pagado','Cancelado')`).get().t;
  // saldo pendiente de clientes: total aprobado histórico - total cobrado histórico
  const approvedAll = db.prepare(`SELECT COALESCE(SUM(v.total),0) t FROM quotes q JOIN quote_versions v ON v.quote_id=q.id AND v.version=q.current_version
    WHERE q.status IN ('Aprobado','Seña pendiente','Seña recibida','Productos a comprar','Comprado','En preparación','Instalación programada','Finalizado','Cobrado')`).get().t;
  const paidAll = db.prepare('SELECT COALESCE(SUM(amount),0) t FROM payments').get().t;

  send(res, 200, {
    monthQuotes: q.length,
    totalQuoted: total,
    approvedAmount: approvedAmt,
    lostAmount: lostAmt,
    conversion: q.length ? (approved.length / q.length) * 100 : 0,
    avgTicket: q.length ? total / q.length : 0,
    avgMargin: q.length ? q.reduce((s, r) => s + (r.margin_pct || 0), 0) / q.length : 0,
    estProfit,
    paidMonth,
    purchasesMonth,
    purchasesPending,
    pendingBalance: approvedAll - paidAll,
    capitalToFinance: Math.max(0, purchasesPending - 0),
    customers: db.prepare('SELECT COUNT(*) c FROM customers').get().c,
    products: db.prepare('SELECT COUNT(*) c FROM products WHERE active=1').get().c,
  });
});

// ================= COMPRAS =================
route('GET', '/api/purchases', async (req, res) => {
  const rows = db.prepare(`SELECT p.*, q.number AS quote_number, c.name AS customer_name
    FROM purchases p LEFT JOIN quotes q ON q.id=p.quote_id LEFT JOIN customers c ON c.id=q.customer_id
    ORDER BY p.date DESC`).all();
  send(res, 200, rows);
});
route('POST', '/api/purchases', async (req, res, _p, user) => {
  const b = await readBody(req);
  const dollar = num(b.dollar) || currentRate().value;
  const items = (b.items || []).map((it) => {
    const prod = it.productId ? db.prepare(PRODUCT_SELECT + ' WHERE p.id=?').get(it.productId) : null;
    const costUSD = num(it.costUSD);
    const costARS = num(it.costARS) || costUSD * dollar;
    const qty = num(it.qty, 1);
    return { productId: it.productId || null, code: prod?.code || it.code, description: prod?.description || it.description,
      qty, costUSD, costARS, lineTotal: costARS * qty };
  });
  const total = items.reduce((s, i) => s + i.lineTotal, 0);
  const id = uuid(); const now = new Date().toISOString();
  db.prepare(`INSERT INTO purchases(id,supplier,date,quote_id,invoice_number,expected_date,received_date,status,dollar_used,total,notes,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, nz(b.supplier), b.date || now, nz(b.quoteId), nz(b.invoiceNumber),
    nz(b.expectedDate), nz(b.receivedDate), b.status || 'Pendiente', dollar, total, nz(b.notes), now);
  const ins = db.prepare(`INSERT INTO purchase_items(id,purchase_id,product_id,code,description,qty,cost_usd,cost_ars,dollar_used,line_total)
    VALUES(?,?,?,?,?,?,?,?,?,?)`);
  for (const i of items) ins.run(uuid(), id, i.productId, i.code, i.description, i.qty, i.costUSD, i.costARS, dollar, i.lineTotal);
  if (b.quoteId) db.prepare('INSERT INTO quote_activity(id,quote_id,type,detail,user_id,created_at) VALUES(?,?,?,?,?,?)')
    .run(uuid(), b.quoteId, 'purchase', `Compra registrada: ${fmtMoney(total)}`, user.id, now);
  audit(user.id, 'create', 'purchase', id, null, { total });
  send(res, 201, { id });
});
route('GET', '/api/purchases/:id', async (req, res, p) => {
  const pr = db.prepare(`SELECT p.*, q.number AS quote_number FROM purchases p LEFT JOIN quotes q ON q.id=p.quote_id WHERE p.id=?`).get(p.id);
  if (!pr) return sendErr(res, 404, 'Compra no encontrada');
  pr.items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id=?').all(p.id);
  send(res, 200, pr);
});
route('PUT', '/api/purchases/:id/status', async (req, res, p, user) => {
  const b = await readBody(req);
  const pr = db.prepare('SELECT * FROM purchases WHERE id=?').get(p.id);
  if (!pr) return sendErr(res, 404, 'Compra no encontrada');
  db.prepare('UPDATE purchases SET status=?, received_date=? WHERE id=?')
    .run(b.status || pr.status, b.status === 'Recibido' ? (b.receivedDate || new Date().toISOString()) : pr.received_date, p.id);
  audit(user.id, 'change_status', 'purchase', p.id, { status: pr.status }, { status: b.status });
  send(res, 200, { ok: true });
});

// ================= COBROS & SEÑAS =================
route('GET', '/api/payments', async (req, res) => {
  const rows = db.prepare(`SELECT pay.*, q.number AS quote_number, c.name AS customer_name
    FROM payments pay LEFT JOIN quotes q ON q.id=pay.quote_id LEFT JOIN customers c ON c.id=q.customer_id
    ORDER BY pay.date DESC`).all();
  send(res, 200, rows);
});
route('POST', '/api/payments', async (req, res, _p, user) => {
  const b = await readBody(req);
  if (!b.quoteId) return sendErr(res, 400, 'Falta el presupuesto');
  const amount = num(b.amount);
  if (amount <= 0) return sendErr(res, 400, 'Ingresá un monto válido');
  const id = uuid(); const now = new Date().toISOString();
  db.prepare(`INSERT INTO payments(id,quote_id,date,amount,currency,method,kind,reference,notes,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id, b.quoteId, b.date || now, amount, b.currency || 'ARS',
    nz(b.method), b.kind || 'Pago', nz(b.reference), nz(b.notes), now);
  db.prepare('INSERT INTO quote_activity(id,quote_id,type,detail,user_id,created_at) VALUES(?,?,?,?,?,?)')
    .run(uuid(), b.quoteId, 'payment', `${b.kind || 'Pago'} recibido: ${fmtMoney(amount)}`, user.id, now);
  audit(user.id, 'create', 'payment', id, null, { amount, quoteId: b.quoteId });
  send(res, 201, { id });
});
route('DELETE', '/api/payments/:id', async (req, res, p, user) => {
  db.prepare('DELETE FROM payments WHERE id=?').run(p.id);
  audit(user.id, 'delete', 'payment', p.id, null, null);
  send(res, 200, { ok: true });
});

// ================= GASTOS =================
route('GET', '/api/expenses', async (req, res) => {
  send(res, 200, db.prepare('SELECT * FROM expenses ORDER BY date DESC').all());
});
route('POST', '/api/expenses', async (req, res, _p, user) => {
  const b = await readBody(req);
  const amount = num(b.amount);
  if (amount <= 0) return sendErr(res, 400, 'Ingresá un monto válido');
  const id = uuid(); const now = new Date().toISOString();
  db.prepare('INSERT INTO expenses(id,date,category,description,amount,recurring,quote_id,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(id, b.date || now, nz(b.category), nz(b.description), amount, b.recurring ? 1 : 0, nz(b.quoteId), now);
  audit(user.id, 'create', 'expense', id, null, b);
  send(res, 201, { id });
});
route('DELETE', '/api/expenses/:id', async (req, res, p, user) => {
  db.prepare('DELETE FROM expenses WHERE id=?').run(p.id);
  audit(user.id, 'delete', 'expense', p.id, null, null);
  send(res, 200, { ok: true });
});

// ================= ESTADÍSTICAS =================
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const mkey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const mlabel = (k) => { const [y, m] = k.split('-'); return `${MONTHS[+m - 1]} ${String(y).slice(2)}`; };
const APPROVED = ['Aprobado', 'Seña pendiente', 'Seña recibida', 'Productos a comprar', 'Comprado', 'En preparación', 'Instalación programada', 'Finalizado', 'Cobrado'];
const LOST = ['Perdido / rechazado', 'Vencido'];

route('GET', '/api/stats', async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const from = u.searchParams.get('from');
  const to = u.searchParams.get('to');
  const y = new Date().getFullYear();
  const fromISO = from || new Date(y, 0, 1).toISOString();
  const toISO = to || new Date(y, 11, 31, 23, 59).toISOString();

  const quotes = db.prepare(`SELECT q.id,q.status,q.lost_reason,q.created_at,q.customer_id,c.name AS customer_name,
      v.total,v.cost,v.profit,v.margin_pct
    FROM quotes q JOIN quote_versions v ON v.quote_id=q.id AND v.version=q.current_version
    LEFT JOIN customers c ON c.id=q.customer_id
    WHERE q.created_at BETWEEN ? AND ? AND q.status <> 'Anulado'`).all(fromISO, toISO);

  const months = {};
  const bucket = (k) => (months[k] ||= { key: k, label: mlabel(k), quoted: 0, approved: 0, lost: 0, count: 0, estProfit: 0 });
  for (const q of quotes) {
    const b = bucket(mkey(q.created_at));
    b.count++; b.quoted += q.total || 0;
    if (APPROVED.includes(q.status)) { b.approved += q.total || 0; b.estProfit += q.profit || 0; }
    if (LOST.includes(q.status)) b.lost += q.total || 0;
  }
  const monthly = Object.values(months).sort((a, b) => a.key.localeCompare(b.key));

  const approvedQ = quotes.filter((q) => APPROVED.includes(q.status));
  const lostQ = quotes.filter((q) => LOST.includes(q.status));
  const totalQuoted = quotes.reduce((s, q) => s + (q.total || 0), 0);
  const totalApproved = approvedQ.reduce((s, q) => s + (q.total || 0), 0);
  const totalLost = lostQ.reduce((s, q) => s + (q.total || 0), 0);

  // motivos de pérdida
  const lossReasons = {};
  lostQ.forEach((q) => { const r = q.lost_reason || 'Sin especificar'; lossReasons[r] = (lossReasons[r] || 0) + 1; });

  // top clientes
  const custAgg = {};
  approvedQ.forEach((q) => { const k = q.customer_name || 'Sin cliente'; (custAgg[k] ||= { name: k, total: 0, count: 0 }); custAgg[k].total += q.total || 0; custAgg[k].count++; });
  const topCustomers = Object.values(custAgg).sort((a, b) => b.total - a.total).slice(0, 8);

  // top productos y categorías (por líneas de presupuestos en el período)
  const qIds = quotes.map((q) => q.id);
  let topProducts = [], topCategories = [];
  if (qIds.length) {
    const ph = qIds.map(() => '?').join(',');
    const items = db.prepare(`SELECT qi.code, qi.description, qi.qty, qi.line_total, p.family_id, f.name AS family, cat.name AS category
      FROM quote_items qi
      JOIN quote_versions v ON v.id=qi.version_id
      JOIN quotes q ON q.id=v.quote_id AND q.current_version=v.version
      LEFT JOIN products p ON p.id=qi.product_id
      LEFT JOIN families f ON f.id=p.family_id
      LEFT JOIN categories cat ON cat.id=p.category_id
      WHERE v.quote_id IN (${ph})`).all(...qIds);
    const prodAgg = {}, catAgg = {};
    items.forEach((it) => {
      const pk = it.code || it.description || '—';
      (prodAgg[pk] ||= { code: it.code, description: it.description, qty: 0, total: 0 });
      prodAgg[pk].qty += it.qty || 0; prodAgg[pk].total += it.line_total || 0;
      const ck = it.category || it.family || 'Sin categoría';
      (catAgg[ck] ||= { name: ck, qty: 0, total: 0 }); catAgg[ck].qty += it.qty || 0; catAgg[ck].total += it.line_total || 0;
    });
    topProducts = Object.values(prodAgg).sort((a, b) => b.qty - a.qty).slice(0, 10);
    topCategories = Object.values(catAgg).sort((a, b) => b.total - a.total).slice(0, 8);
  }

  // cobros
  const payments = db.prepare('SELECT * FROM payments WHERE date BETWEEN ? AND ?').all(fromISO, toISO);
  const totalPaid = payments.reduce((s, x) => s + (x.amount || 0), 0);
  const byMethod = {};
  payments.forEach((x) => { const m = x.method || 'Otro'; byMethod[m] = (byMethod[m] || 0) + (x.amount || 0); });
  const paidByMonth = {};
  payments.forEach((x) => { const k = mkey(x.date); paidByMonth[k] = (paidByMonth[k] || 0) + (x.amount || 0); });

  // compras
  const purchases = db.prepare('SELECT * FROM purchases WHERE date BETWEEN ? AND ?').all(fromISO, toISO);
  const totalPurchased = purchases.reduce((s, x) => s + (x.total || 0), 0);
  const purchasesPending = purchases.filter((x) => !['Recibido', 'Pagado', 'Cancelado'].includes(x.status)).reduce((s, x) => s + (x.total || 0), 0);
  const purchasesByMonth = {};
  purchases.forEach((x) => { const k = mkey(x.date); purchasesByMonth[k] = (purchasesByMonth[k] || 0) + (x.total || 0); });

  // gastos generales
  const expenses = db.prepare('SELECT * FROM expenses WHERE date BETWEEN ? AND ?').all(fromISO, toISO);
  const totalExpenses = expenses.reduce((s, x) => s + (x.amount || 0), 0);
  const expByCat = {};
  expenses.forEach((x) => { const c = x.category || 'Otros'; expByCat[c] = (expByCat[c] || 0) + (x.amount || 0); });

  // rentabilidad estimada vs real
  const estProfit = approvedQ.reduce((s, q) => s + (q.profit || 0), 0);
  const avgMargin = quotes.length ? quotes.reduce((s, q) => s + (q.margin_pct || 0), 0) / quotes.length : 0;

  // estado de resultados operativo (real)
  const income = totalPaid;
  const costProducts = totalPurchased;
  const operatingResult = income - costProducts - totalExpenses;

  send(res, 200, {
    period: { from: fromISO, to: toISO },
    commercial: {
      totalQuotes: quotes.length, totalQuoted, totalApproved, totalLost,
      conversion: quotes.length ? (approvedQ.length / quotes.length) * 100 : 0,
      avgTicket: quotes.length ? totalQuoted / quotes.length : 0,
      approvedCount: approvedQ.length, lostCount: lostQ.length,
      monthly, lossReasons, topCustomers, topProducts, topCategories,
    },
    profitability: { estProfit, avgMargin, monthly },
    cobros: {
      billed: totalApproved, paid: totalPaid, pending: totalApproved - totalPaid,
      byMethod, byMonth: paidByMonth,
    },
    compras: { total: totalPurchased, pending: purchasesPending, byMonth: purchasesByMonth, count: purchases.length },
    gastos: { total: totalExpenses, byCategory: expByCat },
    resultado: { income, costProducts, expenses: totalExpenses, operatingResult, estProfit },
  });
});

// ================= IMPORTADOR DE LISTAS (Excel) =================
function currentCatalog() {
  return db.prepare(`SELECT p.id, p.code, p.net_usd AS netUSD, p.iva, p.active, p.description, c.name AS category
    FROM products p LEFT JOIN categories c ON c.id=p.category_id`).all();
}
route('POST', '/api/price-list/preview', async (req, res) => {
  const b = await readBody(req);
  if (!b.dataBase64) return sendErr(res, 400, 'Falta el archivo');
  try {
    const buffer = Buffer.from(b.dataBase64, 'base64');
    const parsed = await parseWorkbook(buffer);
    if (!parsed.rows.length) return sendErr(res, 400, 'No se detectaron productos. Verificá que el Excel tenga columnas Código y Precio neto.');
    const diff = diffCatalog(currentCatalog(), parsed.rows);
    send(res, 200, { sheetUsed: parsed.sheetUsed, sheets: parsed.sheets, ...diff });
  } catch (e) {
    sendErr(res, 400, 'No se pudo leer el Excel: ' + e.message);
  }
});
route('POST', '/api/price-list/confirm', async (req, res, _p, user) => {
  const b = await readBody(req);
  if (!b.dataBase64) return sendErr(res, 400, 'Falta el archivo');
  try {
    const buffer = Buffer.from(b.dataBase64, 'base64');
    const parsed = await parseWorkbook(buffer);
    const diff = diffCatalog(currentCatalog(), parsed.rows);
    const now = new Date().toISOString();
    const dollar = currentRate().value;
    const importId = uuid();

    const apply = db.transaction(() => {
      const famRow = (name) => db.prepare('SELECT id FROM families WHERE name=?').get(name);
      const catRow = (name) => db.prepare('SELECT id FROM categories WHERE name=?').get(name);
      const ensureCategory = (name) => {
        if (!name) return null;
        let c = catRow(name);
        if (c) return c.id;
        const id = uuid();
        db.prepare('INSERT INTO categories(id,name,family_id,sort_order) VALUES(?,?,?,?)').run(id, name, null, 999);
        return id;
      };
      for (const r of diff.rows) {
        if (r.action === 'new') {
          const pid = uuid();
          db.prepare(`INSERT INTO products(id,code,description,category_id,family_id,technology,net_usd,iva,update_state,observations,active,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?)`).run(pid, r.code, r.description, ensureCategory(r.category), null,
            r.technology, r.netUSD, r.iva, 'Nuevo', r.observations, now, now);
          db.prepare('INSERT INTO product_price_history(id,product_id,code,old_usd,new_usd,diff_usd,pct,import_id,date) VALUES(?,?,?,?,?,?,?,?,?)')
            .run(uuid(), pid, r.code, null, r.netUSD, r.netUSD, null, importId, now);
        } else if (r.action === 'updated') {
          const prod = db.prepare('SELECT * FROM products WHERE code=?').get(r.code);
          if (prod) {
            db.prepare('UPDATE products SET net_usd=?, iva=?, update_state=?, updated_at=? WHERE id=?')
              .run(r.netUSD, r.iva, 'Actualizado', now, prod.id);
            db.prepare('INSERT INTO product_price_history(id,product_id,code,old_usd,new_usd,diff_usd,pct,import_id,date) VALUES(?,?,?,?,?,?,?,?,?)')
              .run(uuid(), prod.id, r.code, prod.net_usd, r.netUSD, r.netUSD - prod.net_usd, r.pct, importId, now);
          }
        } else if (r.action === 'unchanged' || r.action === 'manual') {
          db.prepare('UPDATE products SET update_state=? WHERE code=?').run('Sin cambios', r.code);
        } else if (r.action === 'discontinued') {
          // NO borrar: marcar inactivo/discontinuado
          db.prepare('UPDATE products SET active=0, update_state=? WHERE code=?').run('Discontinuado', r.code);
        }
      }
      db.prepare(`INSERT INTO price_list_imports(id,filename,date,user_id,total,new_count,updated_count,unchanged_count,discontinued_count,error_count,dollar_used,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(importId, b.filename || 'lista.xlsx', now, user.id,
        diff.summary.total, diff.summary.new, diff.summary.updated, diff.summary.unchanged, diff.summary.discontinued, diff.summary.errors, dollar, now);
      const ver = num(getSetting('priceListVersion')) + 1;
      setSetting('priceListVersion', ver);
      setSetting('priceListDate', now.slice(0, 10));
      if (b.filename) setSetting('priceListSource', b.filename);
    });
    apply();
    audit(user.id, 'import_price_list', 'price_list_import', importId, null, diff.summary);
    send(res, 200, { ok: true, summary: diff.summary, importId });
  } catch (e) {
    sendErr(res, 400, 'Error al importar: ' + e.message);
  }
});
route('GET', '/api/price-list/imports', async (req, res) =>
  send(res, 200, db.prepare('SELECT * FROM price_list_imports ORDER BY created_at DESC LIMIT 50').all()));

route('GET', '/api/products/:id/price-history', async (req, res, p) =>
  send(res, 200, db.prepare('SELECT * FROM product_price_history WHERE product_id=? ORDER BY date').all(p.id)));

// ---------- server ----------
function fmtMoney(n) { return '$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR'); }

async function serveStatic(req, res) {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') path = '/index.html';
  const filePath = normalize(join(PUBLIC_DIR, path));
  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
    // SPA fallback
    const idx = join(PUBLIC_DIR, 'index.html');
    if (existsSync(idx)) { const html = await readFile(idx); res.writeHead(200, { 'Content-Type': MIME['.html'] }); return res.end(html); }
    return sendErr(res, 404, 'No encontrado');
  }
  const data = await readFile(filePath);
  res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
  res.end(data);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res);

    const m = routes.find((r) => r.method === req.method && r.rx.test(url.pathname));
    if (!m) return sendErr(res, 404, 'Ruta no encontrada');

    let user = null;
    if (!m.public) {
      user = getUser(req);
      if (!user) return sendErr(res, 401, 'No autenticado');
    }
    const params = {};
    const match = url.pathname.match(m.rx);
    m.keys.forEach((k, i) => (params[k] = match[i + 1]));
    await m.handler(req, res, params, user);
  } catch (e) {
    console.error(e);
    sendErr(res, 500, 'Error interno del servidor');
  }
});

server.listen(PORT, () => {
  console.log('\n  ⚡ VOLTECH — Presupuestos & Gestión');
  console.log(`  ▸ Servidor en  http://localhost:${PORT}`);
  console.log(`  ▸ Base de datos: ${DB_PATH}`);
  const persistente = /^\/var\/data\//.test(DB_PATH) || !!process.env.VOLTECH_DB;
  console.log(`  ▸ Persistencia: ${persistente ? 'DISCO PERSISTENTE ✔' : 'DISCO TEMPORAL ✘ (se borra en cada deploy)'}\n`);
});

// ---------- Actualización automática del dólar cada 30 minutos ----------
const AUTO_MS = 30 * 60 * 1000;
async function autoUpdateDollar() {
  if (getSetting('autoDollarUpdate') !== '1') return;
  try {
    const r = await fetchOfficialRate();
    const last = currentRate();
    // solo inserta si el valor cambió (evita filas duplicadas)
    if (!last || Number(last.value) !== Number(r.value)) {
      db.prepare('INSERT INTO exchange_rates(id,value,buy,sell,source,type,created_at) VALUES(?,?,?,?,?,?,?)')
        .run(uuid(), r.value, r.buy, r.sell, r.source + ' (auto)', r.type, new Date().toISOString());
      console.log(`  ↻ Dólar actualizado automáticamente: $${r.value} (${r.source})`);
    }
  } catch (e) {
    console.log('  ! No se pudo actualizar el dólar automáticamente:', e.message);
  }
}
// primer intento a los 10s del arranque, luego cada 30 min
setTimeout(autoUpdateDollar, 10_000);
setInterval(autoUpdateDollar, AUTO_MS);
