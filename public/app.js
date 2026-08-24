// VOLTECH — Presupuestos & Gestión — SPA (vanilla JS, sin build)
'use strict';

// ---------- utils ----------
const $ = (s, r = document) => r.querySelector(s);
const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtARS = (n) => '$ ' + (Math.round(Number(n) || 0)).toLocaleString('es-AR');
const fmtUSD = (n) => 'US$ ' + (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n) => (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const pct100 = (n) => +((Number(n) || 0) * 100).toFixed(2); // fracción → % sin decimales espurios
const fmtDate = (s) => { if (!s) return '—'; const d = new Date(s); return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
const fmtDateTime = (s) => { if (!s) return '—'; const d = new Date(s); return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error ' + res.status);
  return data;
}

function toast(msg, kind = '') {
  const t = el(`<div class="toast ${kind}">${esc(msg)}</div>`);
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
}

function modal(html, { wide } = {}) {
  const root = $('#modal-root');
  const ov = el(`<div class="overlay"><div class="modal ${wide ? 'wide' : ''}">${html}</div></div>`);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  function close() { ov.remove(); }
  root.appendChild(ov);
  ov.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  return { el: ov, close, q: (s) => ov.querySelector(s) };
}

// ---------- icons ----------
const I = {
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  quote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8"/><path d="M3.27 6.96 12 12l8.73-5.04M12 22V12"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-6"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
};

// ---------- state ----------
const S = { user: null, dollar: null, dollarInfo: null, settings: {}, families: [], categories: [] };

const NAV = [
  { path: '#/dashboard', label: 'Dashboard', icon: I.dash },
  { path: '#/presupuestos', label: 'Presupuestos', icon: I.quote },
  { path: '#/clientes', label: 'Clientes', icon: I.users },
  { path: '#/productos', label: 'Productos', icon: I.box },
  { path: '#/compras', label: 'Compras', icon: I.cart },
  { path: '#/cobros', label: 'Cobros & Señas', icon: I.cash },
  { path: '#/gastos', label: 'Gastos', icon: I.wallet },
  { path: '#/estadisticas', label: 'Estadísticas', icon: I.chart },
  { path: '#/precios', label: 'Actualizar precios', icon: I.upload },
  { path: '#/config', label: 'Configuración', icon: I.gear },
];

// ---------- boot ----------
init();
async function init() {
  try {
    const me = await api('/me');
    S.user = me.user;
    await loadGlobals();
    renderApp();
  } catch {
    renderLogin();
  }
}

async function loadGlobals() {
  const [rate, settings, fams, cats] = await Promise.all([
    api('/exchange/current'), api('/settings'), api('/families'), api('/categories'),
  ]);
  S.dollarInfo = rate; S.dollar = rate.value; S.settings = settings; S.families = fams; S.categories = cats;
}

// ---------- login ----------
function renderLogin() {
  document.body.innerHTML = '';
  const root = el('<div id="root"></div>');
  document.body.append(root, el('<div id="modal-root"></div>'), el('<div id="toasts"></div>'));
  root.appendChild(el(`
    <div class="login-wrap"><form class="login-card">
      <img src="logo.jpeg" alt="Voltech" />
      <h1>Presupuestos &amp; Gestión</h1>
      <div id="lerr"></div>
      <label class="fld"><span>Usuario</span><input id="u" autocomplete="username" value="Voltech" /></label>
      <label class="fld"><span>Contraseña</span><input id="p" type="password" autocomplete="current-password" /></label>
      <button class="btn primary" style="width:100%;justify-content:center;margin-top:6px" type="submit">Ingresar</button>
    </form></div>`));
  const form = $('.login-card');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const me = await api('/login', { method: 'POST', body: { username: $('#u').value, password: $('#p').value } });
      S.user = me.user;
      await loadGlobals();
      location.hash = '#/dashboard';
      renderApp();
    } catch (err) {
      $('#lerr').innerHTML = `<div class="login-err">${esc(err.message)}</div>`;
    }
  });
  setTimeout(() => $('#p').focus(), 50);
}

// ---------- app shell ----------
function renderApp() {
  document.body.innerHTML = '';
  const root = el('<div id="root"></div>');
  document.body.append(root, el('<div id="modal-root"></div>'), el('<div id="toasts"></div>'));
  root.appendChild(el(`
    <div class="app">
      <aside class="sidebar" id="sidebar">
        <div class="brand"><img src="logo.jpeg" alt="Voltech"/></div>
        <nav class="nav">${NAV.map((n) => `<a href="${n.path}" data-path="${n.path}">${n.icon}<span>${n.label}</span>${n.soon ? '<span class="soon">pronto</span>' : ''}</a>`).join('')}</nav>
        <div class="sidebar-foot">v0.1 · Núcleo cotizador<br/>Lista: ${esc(S.settings.priceListDate || '—')}</div>
      </aside>
      <div class="main">
        <div class="topbar">
          <button class="icon-btn" id="burger" style="display:none">☰</button>
          <h2 id="page-title">Dashboard</h2>
          <div class="spacer"></div>
          <div class="dollar-chip" id="dollar-chip"></div>
          <button class="icon-btn" id="btn-refresh-dollar" title="Actualizar dólar">${I.refresh}</button>
          <div class="avatar" id="avatar" title="${esc(S.user.username)}">${esc(S.user.username[0].toUpperCase())}</div>
        </div>
        <div class="content" id="content"></div>
      </div>
    </div>`));
  renderDollarChip();
  $('#btn-refresh-dollar').addEventListener('click', refreshDollar);
  $('#avatar').addEventListener('click', userMenu);
  window.addEventListener('hashchange', router);
  if (!location.hash) location.hash = '#/dashboard';
  router();
  // refleja la actualización automática del dólar (cada 2 min)
  if (window._volPoll) clearInterval(window._volPoll);
  window._volPoll = setInterval(async () => {
    try {
      const r = await api('/exchange/current');
      if (r && r.value !== S.dollar) { S.dollarInfo = r; S.dollar = r.value; renderDollarChip(); }
    } catch { /* sesión cerrada */ }
  }, 120000);
}

function renderDollarChip() {
  const info = S.dollarInfo || {};
  $('#dollar-chip').innerHTML = `<span class="t">Dólar oficial</span> <b>${fmtARS(S.dollar)}</b> <span class="t">· ${esc(info.source || '')} · ${info.created_at ? new Date(info.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>`;
}

async function refreshDollar() {
  const btn = $('#btn-refresh-dollar'); btn.innerHTML = '<div class="spin"></div>';
  try {
    S.dollarInfo = await api('/exchange/refresh', { method: 'POST' }); S.dollar = S.dollarInfo.value;
    renderDollarChip(); toast('Dólar actualizado: ' + fmtARS(S.dollar), 'ok');
  } catch (e) {
    toast(e.message, 'err');
    manualDollar();
  } finally { btn.innerHTML = I.refresh; }
}

function manualDollar() {
  const m = modal(`<div class="modal-head"><h4>Cotización manual del dólar</h4><button class="close-x" data-close>&times;</button></div>
    <div class="modal-body"><label class="fld"><span>Dólar oficial vendedor (ARS)</span><input id="dv" type="number" value="${S.dollar}"/></label></div>
    <div class="modal-foot"><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="save">Guardar</button></div>`);
  m.q('#save').addEventListener('click', async () => {
    try { S.dollarInfo = await api('/exchange/manual', { method: 'POST', body: { value: m.q('#dv').value } }); S.dollar = S.dollarInfo.value; renderDollarChip(); m.close(); toast('Dólar guardado', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  });
}

function userMenu() {
  const m = modal(`<div class="modal-head"><h4>${esc(S.user.username)}</h4><button class="close-x" data-close>&times;</button></div>
    <div class="modal-body">
      <button class="btn" style="width:100%;justify-content:center;margin-bottom:10px" id="pw">Cambiar contraseña</button>
      <button class="btn danger" style="width:100%;justify-content:center" id="lo">Cerrar sesión</button>
    </div>`);
  m.q('#lo').addEventListener('click', async () => { await api('/logout', { method: 'POST' }); location.reload(); });
  m.q('#pw').addEventListener('click', () => { m.close(); changePassword(); });
}

function changePassword() {
  const m = modal(`<div class="modal-head"><h4>Cambiar contraseña</h4><button class="close-x" data-close>&times;</button></div>
    <div class="modal-body">
      <label class="fld"><span>Contraseña actual</span><input id="c" type="password"/></label>
      <label class="fld"><span>Nueva contraseña (mín. 6)</span><input id="n" type="password"/></label>
    </div>
    <div class="modal-foot"><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="s">Guardar</button></div>`);
  m.q('#s').addEventListener('click', async () => {
    try { await api('/password', { method: 'POST', body: { current: m.q('#c').value, next: m.q('#n').value } }); m.close(); toast('Contraseña actualizada', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  });
}

// ---------- router ----------
function router() {
  const hash = location.hash || '#/dashboard';
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.path === '#/' + hash.slice(2).split('/')[0]));
  const path = hash.slice(2).split('/');
  const page = path[0];
  const titles = { dashboard: 'Dashboard', presupuestos: 'Presupuestos', clientes: 'Clientes', productos: 'Productos',
    compras: 'Compras', cobros: 'Cobros & Señas', gastos: 'Gastos', estadisticas: 'Estadísticas', precios: 'Actualizar precios', config: 'Configuración' };
  $('#page-title').textContent = titles[page] || 'VOLTECH';
  const c = $('#content'); c.innerHTML = '<div class="center"><div class="spin"></div></div>';
  const run = (fn) => fn(c).catch((e) => { c.innerHTML = `<div class="empty"><h3>Error</h3><p>${esc(e.message)}</p></div>`; });
  if (page === 'dashboard') run(viewDashboard);
  else if (page === 'productos') run(viewProducts);
  else if (page === 'clientes') run(viewCustomers);
  else if (page === 'presupuestos' && path[1] === 'nuevo') run(viewQuoteBuilder);
  else if (page === 'presupuestos' && path[1]) run((c) => viewQuoteDetail(c, path[1]));
  else if (page === 'presupuestos') run(viewQuotes);
  else if (page === 'compras') run(viewPurchases);
  else if (page === 'cobros') run(viewPayments);
  else if (page === 'gastos') run(viewExpenses);
  else if (page === 'estadisticas') run(viewStats);
  else if (page === 'precios') run(viewPriceUpdate);
  else if (page === 'config') run(viewConfig);
  else viewSoon(c);
}

function viewSoon(c) {
  c.innerHTML = `<div class="empty">${I.chart}<h3>Módulo en construcción</h3><p>Este módulo forma parte de las próximas etapas (compras, cobros, gastos, estadísticas e importador de listas).</p></div>`;
}

// ---------- Dashboard ----------
async function viewDashboard(c) {
  const d = await api('/dashboard');
  c.innerHTML = `
    <div class="page-head"><div><h3>Resumen del mes</h3><div class="sub">${new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</div></div>
      <a class="btn primary" href="#/presupuestos/nuevo">${I.plus} Nuevo presupuesto</a></div>
    <div class="kpis">
      ${kpi('Presupuestos del mes', d.monthQuotes, '')}
      ${kpi('Monto cotizado', fmtARS(d.totalQuoted), '', 'accent')}
      ${kpi('Monto aprobado', fmtARS(d.approvedAmount), '', 'good')}
      ${kpi('Monto perdido', fmtARS(d.lostAmount), '', 'bad')}
      ${kpi('Tasa de conversión', fmtPct(d.conversion), '')}
      ${kpi('Ticket promedio', fmtARS(d.avgTicket), '')}
      ${kpi('Ganancia proyectada', fmtARS(d.estProfit), 'presupuestos aprobados', 'good')}
      ${kpi('Margen promedio', fmtPct(d.avgMargin), 'sobre ventas')}
      ${kpi('Cobrado este mes', fmtARS(d.paidMonth), '', 'accent')}
      ${kpi('Saldo pendiente clientes', fmtARS(d.pendingBalance), 'a cobrar', 'bad')}
      ${kpi('Compras del mes', fmtARS(d.purchasesMonth), '')}
      ${kpi('Capital a financiar', fmtARS(d.capitalToFinance), 'compras pendientes', d.capitalToFinance > 0 ? 'bad' : 'good')}
      ${kpi('Clientes', d.customers, '')}
      ${kpi('Productos activos', d.products, 'catálogo vigente', 'accent')}
    </div>`;
}
const kpi = (l, v, s, cls = '') => `<div class="kpi ${cls}"><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;

// ---------- Products ----------
let prodCache = [];
async function viewProducts(c) {
  const stateBadge = (s) => {
    const map = { 'Nuevo': 'new', 'Actualizado': 'up', 'Sin cambios': 'same' };
    return `<span class="badge ${map[s] || 'same'}">${esc(s || '—')}</span>`;
  };
  c.innerHTML = `
    <div class="page-head"><div><h3>Productos</h3><div class="sub" id="pcount">Cargando…</div></div></div>
    <div class="toolbar">
      <div class="search">${I.search}<input id="psearch" placeholder="Buscar por código, descripción, tecnología…  (ej: STARK 600)"/></div>
      <select id="pfam"><option value="">Todas las familias</option>${S.families.map((f) => `<option>${esc(f.name)}</option>`).join('')}</select>
      <select id="pcat"><option value="">Todas las categorías</option>${S.categories.map((x) => `<option>${esc(x.name)}</option>`).join('')}</select>
      <select id="piva"><option value="">IVA (todos)</option><option value="0.105">10,5%</option><option value="0.21">21%</option></select>
      <select id="pest"><option value="">Estado (todos)</option><option>Nuevo</option><option>Actualizado</option><option>Sin cambios</option></select>
    </div>
    <div class="panel"><div class="table-wrap"><table>
      <thead><tr><th class="sortable" data-s="code">Código</th><th>Descripción</th><th>Categoría</th><th>Tec.</th>
      <th class="num sortable" data-s="netUSD">Neto USD</th><th class="num">IVA</th><th class="num sortable" data-s="priceARS">Precio ARS</th><th>Estado</th></tr></thead>
      <tbody id="ptbody"></tbody></table></div></div>`;
  let sortKey = 'code', sortDir = 1;
  const load = debounce(async () => {
    const p = new URLSearchParams();
    if ($('#psearch').value) p.set('search', $('#psearch').value);
    if ($('#pfam').value) p.set('family', $('#pfam').value);
    if ($('#pcat').value) p.set('category', $('#pcat').value);
    if ($('#piva').value) p.set('iva', $('#piva').value);
    if ($('#pest').value) p.set('estado', $('#pest').value);
    const d = await api('/products?' + p.toString());
    prodCache = d.products;
    render();
  }, 180);
  function render() {
    const rows = [...prodCache].sort((a, b) => {
      let x = a[sortKey], y = b[sortKey];
      if (typeof x === 'string') return sortDir * String(x).localeCompare(String(y));
      return sortDir * ((x || 0) - (y || 0));
    });
    $('#pcount').textContent = `${rows.length} productos · precios a dólar ${fmtARS(S.dollar)}`;
    $('#ptbody').innerHTML = rows.map((p) => `<tr>
      <td class="mono">${esc(p.code)}</td>
      <td>${esc(p.description || '')}</td>
      <td class="muted" style="font-size:12px">${esc(p.category || '')}</td>
      <td class="muted" style="font-size:12px">${esc(p.technology || '')}</td>
      <td class="num">${p.netUSD != null ? p.netUSD.toLocaleString('es-AR', { minimumFractionDigits: 2 }) : '—'}</td>
      <td class="num muted">${p.iva != null ? (p.iva * 100).toLocaleString('es-AR') + '%' : '—'}</td>
      <td class="num"><b>${p.priceARS != null ? fmtARS(p.priceARS) : '—'}</b></td>
      <td>${stateBadge(p.updateState)}</td></tr>`).join('') || `<tr><td colspan="8" class="empty">Sin resultados</td></tr>`;
  }
  ['#psearch', '#pfam', '#pcat', '#piva', '#pest'].forEach((s) => $(s).addEventListener('input', load));
  c.querySelectorAll('th.sortable').forEach((th) => th.addEventListener('click', () => {
    const k = th.dataset.s; if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = 1; } render();
  }));
  await load();
}

// ---------- Customers ----------
async function viewCustomers(c) {
  const list = await api('/customers');
  c.innerHTML = `
    <div class="page-head"><div><h3>Clientes</h3><div class="sub">${list.length} clientes</div></div>
      <button class="btn primary" id="newc">${I.plus} Nuevo cliente</button></div>
    <div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>Nombre / Razón social</th><th>Contacto</th><th>Teléfono</th><th>Localidad</th><th class="num">Presupuestos</th><th></th></tr></thead>
      <tbody>${list.map((c) => `<tr>
        <td><b>${esc(c.name)}</b></td><td class="muted">${esc(c.contact || '—')}</td><td>${esc(c.phone || '—')}</td>
        <td class="muted">${esc(c.city || '—')}</td><td class="num">${c.quoteCount} ${c.approvedCount ? `<span class="badge ok">${c.approvedCount} aprob.</span>` : ''}</td>
        <td class="num"><button class="btn sm" data-edit="${c.id}">Editar</button></td></tr>`).join('') || `<tr><td colspan="6" class="empty">Todavía no cargaste clientes</td></tr>`}</tbody>
    </table></div></div>`;
  $('#newc').addEventListener('click', () => customerModal());
  c.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => customerModal(list.find((x) => x.id === b.dataset.edit))));
}

function customerModal(cust = null) {
  const f = (k) => esc(cust?.[k] || '');
  const m = modal(`<div class="modal-head"><h4>${cust ? 'Editar' : 'Nuevo'} cliente</h4><button class="close-x" data-close>&times;</button></div>
    <div class="modal-body">
      <label class="fld"><span>Nombre / Razón social *</span><input id="name" value="${f('name')}"/></label>
      <div class="row"><label class="fld"><span>CUIT / DNI</span><input id="taxId" value="${esc(cust?.tax_id || '')}"/></label>
        <label class="fld"><span>Contacto</span><input id="contact" value="${f('contact')}"/></label></div>
      <div class="row"><label class="fld"><span>Teléfono</span><input id="phone" value="${f('phone')}"/></label>
        <label class="fld"><span>WhatsApp</span><input id="whatsapp" value="${f('whatsapp')}"/></label></div>
      <label class="fld"><span>Email</span><input id="email" value="${f('email')}"/></label>
      <div class="row"><label class="fld"><span>Dirección</span><input id="address" value="${f('address')}"/></label>
        <label class="fld"><span>Localidad</span><input id="city" value="${f('city')}"/></label></div>
      <label class="fld"><span>Dirección de instalación (si difiere)</span><input id="installAddress" value="${esc(cust?.install_address || '')}"/></label>
      <label class="fld"><span>Notas</span><textarea id="notes">${esc(cust?.notes || '')}</textarea></label>
    </div>
    <div class="modal-foot"><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="save">Guardar</button></div>`);
  m.q('#save').addEventListener('click', async () => {
    const body = {}; ['name', 'taxId', 'contact', 'phone', 'whatsapp', 'email', 'address', 'city', 'installAddress', 'notes'].forEach((k) => body[k] = m.q('#' + k).value);
    try {
      if (cust) await api('/customers/' + cust.id, { method: 'PUT', body });
      else await api('/customers', { method: 'POST', body });
      m.close(); toast('Cliente guardado', 'ok'); router();
    } catch (e) { toast(e.message, 'err'); }
  });
}

// ---------- Quotes list ----------
const stClass = (s) => {
  if (['Aprobado', 'Seña recibida', 'Finalizado', 'Cobrado'].includes(s)) return 'g';
  if (['Perdido / rechazado', 'Vencido'].includes(s)) return 'r';
  if (['Enviado', 'En negociación', 'Pendiente de seguimiento'].includes(s)) return 'a';
  return 'b';
};
async function viewQuotes(c) {
  const list = await api('/quotes');
  c.innerHTML = `
    <div class="page-head"><div><h3>Presupuestos</h3><div class="sub">${list.length} presupuestos</div></div>
      <a class="btn primary" href="#/presupuestos/nuevo">${I.plus} Nuevo presupuesto</a></div>
    <div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>N°</th><th>Cliente</th><th>Fecha</th><th>Estado</th><th class="num">Total</th><th class="num">Margen</th><th></th></tr></thead>
      <tbody>${list.map((q) => `<tr style="cursor:pointer" data-id="${q.id}">
        <td class="mono">${esc(q.number)}</td><td>${esc(q.customer_name || '— sin cliente —')}</td>
        <td class="muted">${fmtDate(q.created_at)}</td><td><span class="st ${stClass(q.status)}">${esc(q.status)}</span></td>
        <td class="num"><b>${fmtARS(q.total)}</b></td><td class="num muted">${q.margin_pct != null ? fmtPct(q.margin_pct) : '—'}</td>
        <td class="num">${I.doc}</td></tr>`).join('') || `<tr><td colspan="7" class="empty">Todavía no creaste presupuestos</td></tr>`}</tbody>
    </table></div></div>`;
  c.querySelectorAll('[data-id]').forEach((r) => r.addEventListener('click', () => location.hash = '#/presupuestos/' + r.dataset.id));
}

// ---------- Quote builder ----------
async function viewQuoteBuilder(c) {
  const customers = await api('/customers');
  const state = { items: [], customerId: '', margin: Number(S.settings.margin) || 0, commercialDiscount: Number(S.settings.commercialDiscount) || 0,
    labor: 0, freight: 0, otherConcepts: 0, depositRequested: 0, dueDate: '', nextFollowup: '', notes: '', paymentTerms: '' };
  c.innerHTML = `
    <div class="page-head"><div><h3>Nuevo presupuesto</h3><div class="sub">Dólar utilizado: ${fmtARS(S.dollar)} — se guarda un snapshot al crear</div></div>
      <a class="btn ghost" href="#/presupuestos">Cancelar</a></div>
    <div class="builder">
      <div>
        <div class="panel panel-pad" style="margin-bottom:16px">
          <div class="row">
            <label class="fld"><span>Cliente</span><select id="cust"><option value="">— seleccionar —</option>${customers.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
            <label class="fld" style="flex:none;width:150px"><span>&nbsp;</span><button class="btn" id="addcust" style="width:100%;justify-content:center">${I.plus} Cliente nuevo</button></label>
          </div>
        </div>
        <div class="panel panel-pad" style="margin-bottom:16px">
          <div class="search" style="position:relative">${I.search}<input id="psearch" placeholder="Buscar producto por código o nombre y agregar…"/></div>
          <div class="pick-list" id="picks" style="display:none"></div>
        </div>
        <div class="panel"><div class="table-wrap"><table>
          <thead><tr><th>Código</th><th>Descripción</th><th style="width:70px">Cant.</th><th style="width:80px">Desc.%</th><th class="num">Unitario</th><th class="num">Total</th><th></th></tr></thead>
          <tbody id="items"></tbody></table></div></div>
        <div class="panel panel-pad" style="margin-top:16px">
          <b style="font-size:13px">Conceptos adicionales</b>
          <div class="row" style="margin-top:12px">
            <label class="fld"><span>Mano de obra / instalación</span><input id="labor" type="number" value="0"/></label>
            <label class="fld"><span>Flete</span><input id="freight" type="number" value="0"/></label>
            <label class="fld"><span>Otros</span><input id="otherConcepts" type="number" value="0"/></label>
          </div>
          <div class="row">
            <label class="fld"><span>Margen (markup %)</span><input id="margin" type="number" value="${+(state.margin * 100).toFixed(2)}"/></label>
            <label class="fld"><span>Seña solicitada (ARS)</span><input id="depositRequested" type="number" value="0"/></label>
            <label class="fld"><span>Vencimiento</span><input id="dueDate" type="date"/></label>
          </div>
          <label class="fld"><span>Observaciones</span><textarea id="notes"></textarea></label>
        </div>
      </div>
      <div class="summary">
        <div class="panel panel-pad">
          <div id="totals"></div>
          <button class="btn primary" id="save" style="width:100%;justify-content:center;margin-top:14px">Crear presupuesto</button>
        </div>
        <div class="internal" id="internal"></div>
      </div>
    </div>`;

  $('#cust').addEventListener('change', (e) => state.customerId = e.target.value);
  $('#addcust').addEventListener('click', () => customerModal());
  ['labor', 'freight', 'otherConcepts', 'depositRequested', 'dueDate', 'notes'].forEach((k) =>
    $('#' + k).addEventListener('input', (e) => { state[k] = e.target.value; recalc(); }));
  $('#margin').addEventListener('input', (e) => { state.margin = (Number(e.target.value) || 0) / 100; recalc(); });

  // product search
  const psearch = $('#psearch'); const picks = $('#picks');
  const doSearch = debounce(async () => {
    const q = psearch.value.trim();
    if (!q) { picks.style.display = 'none'; return; }
    const d = await api('/products?active=1&search=' + encodeURIComponent(q));
    picks.style.display = 'block';
    picks.innerHTML = d.products.slice(0, 40).map((p) => `<div class="pick-item" data-p='${esc(JSON.stringify({ id: p.id, code: p.code, description: p.description }))}'>
      <span class="code">${esc(p.code)}</span><span class="d">${esc(p.description || '')}</span><span class="p">${fmtARS(p.priceARS)}</span></div>`).join('') || '<div class="pick-item">Sin resultados</div>';
    picks.querySelectorAll('[data-p]').forEach((it) => it.addEventListener('click', () => {
      const p = JSON.parse(it.dataset.p);
      const ex = state.items.find((x) => x.productId === p.id);
      if (ex) ex.qty++; else state.items.push({ productId: p.id, code: p.code, description: p.description, qty: 1, clientDiscount: 0 });
      psearch.value = ''; picks.style.display = 'none'; recalc();
    }));
  }, 200);
  psearch.addEventListener('input', doSearch);

  async function recalc() {
    renderItems();
    if (!state.items.length) { $('#totals').innerHTML = '<div class="muted center">Agregá productos para ver el total</div>'; $('#internal').innerHTML = ''; return; }
    const preview = await api('/pricing/preview', { method: 'POST', body: {
      dollar: S.dollar, margin: state.margin, commercialDiscount: state.commercialDiscount,
      extras: n('labor') + n('freight') + n('otherConcepts'),
      items: state.items.map((it) => ({ productId: it.productId, qty: it.qty, clientDiscount: it.clientDiscount })),
    } });
    state._lines = preview.lines;
    renderItems(preview.lines);
    const t = preview.totals;
    $('#totals').innerHTML = `
      <div class="sum-row"><span class="muted">Subtotal productos</span><span>${fmtARS(t.subtotal)}</span></div>
      <div class="sum-row"><span class="muted">Descuentos</span><span>- ${fmtARS(t.discountAmount)}</span></div>
      <div class="sum-row"><span class="muted">Extras (M.O./flete/otros)</span><span>${fmtARS(t.extras)}</span></div>
      <div class="sum-row total"><span>TOTAL</span><span>${fmtARS(t.total)}</span></div>
      <div class="sum-row"><span class="muted">Seña solicitada</span><span>${fmtARS(n('depositRequested'))}</span></div>
      <div class="sum-row"><span class="muted">Saldo</span><span>${fmtARS(t.total - n('depositRequested'))}</span></div>`;
    // internal
    const dep = n('depositRequested'); const financing = t.cost - dep;
    $('#internal').innerHTML = `<div class="tag">Interno — no aparece en el PDF</div>
      <div class="sum-row"><span class="muted">Costo de productos</span><span>${fmtARS(t.cost)}</span></div>
      <div class="sum-row"><span class="muted">Ganancia estimada</span><span style="color:var(--green)">${fmtARS(t.profit)}</span></div>
      <div class="sum-row"><span class="muted">Margen sobre ventas</span><span>${fmtPct(t.marginOnSalesPct)}</span></div>
      ${t.marginOnSalesPct < (Number(S.settings.minMargin) * 100) ? `<div class="warn">⚠ Margen (${fmtPct(t.marginOnSalesPct)}) por debajo del mínimo configurado (${fmtPct(Number(S.settings.minMargin) * 100)}).</div>` : ''}
      ${dep > 0 && financing > 0 ? `<div class="warn">⚠ La seña no cubre las compras. Voltech deberá financiar ${fmtARS(financing)} para comprar los materiales.</div>` : ''}`;
  }
  function renderItems(lines) {
    $('#items').innerHTML = state.items.map((it, i) => {
      const line = lines ? lines[i] : null;
      return `<tr>
        <td class="mono">${esc(it.code)}</td>
        <td style="font-size:12.5px">${esc(it.description || '')}</td>
        <td><input type="number" min="1" value="${it.qty}" data-qty="${i}" style="padding:5px"/></td>
        <td><input type="number" min="0" max="100" value="${it.clientDiscount * 100}" data-disc="${i}" style="padding:5px"/></td>
        <td class="num">${line ? fmtARS(line.finalUnit) : '…'}</td>
        <td class="num"><b>${line ? fmtARS(line.lineTotal) : '…'}</b></td>
        <td class="num"><button class="btn sm danger" data-del="${i}">✕</button></td></tr>`;
    }).join('') || `<tr><td colspan="7" class="empty" style="padding:30px">Buscá productos arriba para agregarlos</td></tr>`;
    $('#items').querySelectorAll('[data-qty]').forEach((inp) => inp.addEventListener('input', (e) => { state.items[+e.target.dataset.qty].qty = Math.max(1, Number(e.target.value) || 1); recalc(); }));
    $('#items').querySelectorAll('[data-disc]').forEach((inp) => inp.addEventListener('input', (e) => { state.items[+e.target.dataset.disc].clientDiscount = (Number(e.target.value) || 0) / 100; recalc(); }));
    $('#items').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { state.items.splice(+b.dataset.del, 1); recalc(); }));
  }
  const n = (id) => Number($('#' + id).value) || 0;

  $('#save').addEventListener('click', async () => {
    if (!state.items.length) return toast('Agregá al menos un producto', 'err');
    try {
      const r = await api('/quotes', { method: 'POST', body: {
        customerId: state.customerId, dollar: S.dollar, margin: state.margin, commercialDiscount: state.commercialDiscount,
        labor: n('labor'), freight: n('freight'), otherConcepts: n('otherConcepts'), depositRequested: n('depositRequested'),
        dueDate: $('#dueDate').value || null, nextFollowup: state.nextFollowup || null, notes: $('#notes').value,
        items: state.items.map((it) => ({ productId: it.productId, qty: it.qty, clientDiscount: it.clientDiscount })),
      } });
      toast('Presupuesto ' + r.number + ' creado', 'ok');
      location.hash = '#/presupuestos/' + r.id;
    } catch (e) { toast(e.message, 'err'); }
  });
  recalc();
}

// ---------- Quote detail ----------
async function viewQuoteDetail(c, id) {
  const q = await api('/quotes/' + id);
  const v = q.versions.find((x) => x.version === q.current_version) || q.versions[0];
  const dv = q.dollarVariation;
  const f = q.finance || {};
  const STATES = ['Borrador', 'Enviado', 'Pendiente de seguimiento', 'En negociación', 'Aprobado', 'Seña pendiente', 'Seña recibida', 'Productos a comprar', 'Comprado', 'En preparación', 'Instalación programada', 'Finalizado', 'Cobrado', 'Perdido / rechazado', 'Vencido'];
  c.innerHTML = `
    <div class="page-head">
      <div><a href="#/presupuestos" class="muted" style="font-size:12px">← Presupuestos</a>
        <h3>${esc(q.number)} <span class="st ${stClass(q.status)}">${esc(q.status)}</span></h3>
        <div class="sub">${esc(q.customer_name || 'Sin cliente')} · ${fmtDate(v.date)}</div></div>
      <div style="display:flex;gap:10px">
        <select id="status">${STATES.map((s) => `<option ${s === q.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        <button class="btn" id="wa">Copiar para WhatsApp</button>
        <button class="btn primary" id="pdf">${I.doc} PDF</button>
      </div>
    </div>
    ${dv && Math.abs(dv.pct) >= 0.5 ? `<div class="warn" style="margin-bottom:16px">Este presupuesto utilizó dólar ${fmtARS(dv.used)}. El dólar actual es ${fmtARS(dv.current)}. Variación: ${fmtPct(dv.pct)}.</div>` : ''}
    <div class="row" style="align-items:flex-start">
      <div class="panel" style="flex:2"><div class="table-wrap"><table>
        <thead><tr><th>Código</th><th>Descripción</th><th class="num">Cant.</th><th class="num">Unitario</th><th class="num">Total</th></tr></thead>
        <tbody>${v.items.map((it) => `<tr><td class="mono">${esc(it.code)}</td><td style="font-size:12.5px">${esc(it.description || '')}</td>
          <td class="num">${it.qty}</td><td class="num">${fmtARS(it.final_unit)}</td><td class="num"><b>${fmtARS(it.line_total)}</b></td></tr>`).join('')}</tbody>
      </table></div>
        <div class="panel-pad">
          <div class="sum-row"><span class="muted">Subtotal</span><span>${fmtARS(v.subtotal)}</span></div>
          <div class="sum-row"><span class="muted">Descuento</span><span>- ${fmtARS(v.discount_amount)}</span></div>
          <div class="sum-row"><span class="muted">Extras</span><span>${fmtARS(v.extras)}</span></div>
          <div class="sum-row total"><span>TOTAL</span><span>${fmtARS(v.total)}</span></div>
          <div class="sum-row"><span class="muted">Seña solicitada</span><span>${fmtARS(v.deposit_requested)}</span></div>
          <div class="sum-row"><span class="muted">Saldo</span><span>${fmtARS(v.total - v.deposit_requested)}</span></div>
        </div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;gap:16px">
        <div class="internal">
          <div class="tag">Interno — rentabilidad estimada vs real</div>
          <div class="sum-row"><span class="muted">Costo estimado productos</span><span>${fmtARS(f.estCost)}</span></div>
          <div class="sum-row"><span class="muted">Ganancia estimada</span><span style="color:var(--green)">${fmtARS(f.estProfit)}</span></div>
          <div class="sum-row"><span class="muted">Margen s/ ventas</span><span>${fmtPct(v.margin_pct)}</span></div>
          <div class="sum-row"><span class="muted">Dólar snapshot</span><span>${fmtARS(v.dollar_used)}</span></div>
          <div style="border-top:1px solid rgba(2,131,235,.3);margin:8px 0"></div>
          <div class="sum-row"><span class="muted">Costo real (compras)</span><span>${fmtARS(f.realCost)}</span></div>
          <div class="sum-row"><span class="muted">Costos directos reales</span><span>${fmtARS(f.directExpenses)}</span></div>
          <div class="sum-row"><span class="muted">Ganancia real</span><span style="color:${f.realProfit >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtARS(f.realProfit)}</span></div>
          <div class="sum-row"><span class="muted">Desvío vs estimado</span><span style="color:${f.profitDeviation >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtARS(f.profitDeviation)}</span></div>
          ${dv && Math.abs(dv.pct) >= 0.5 ? `<div class="sum-row"><span class="muted">Impacto dólar (cotiz.→hoy)</span><span>${fmtPct(dv.pct)}</span></div>` : ''}
        </div>
        <div class="panel panel-pad">
          <div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:13px">Cobros & Señas</b><button class="btn sm" id="addpay">${I.plus} Pago</button></div>
          <div class="sum-row" style="margin-top:8px"><span class="muted">Cobrado</span><span style="color:var(--green)">${fmtARS(f.paid)}</span></div>
          <div class="sum-row"><span class="muted">Saldo</span><span style="color:${f.balance > 0 ? 'var(--amber)' : 'var(--green)'}">${fmtARS(f.balance)}</span></div>
          ${q.payments.map((p) => `<div class="sum-row" style="font-size:12px"><span class="muted">${fmtDate(p.date)} · ${esc(p.kind || '')} ${esc(p.method || '')}</span><span>${fmtARS(p.amount)}</span></div>`).join('')}
        </div>
        <div class="panel panel-pad">
          <div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:13px">Compras & capital</b><button class="btn sm" id="addbuy">${I.plus} Compra</button></div>
          ${f.capitalToFinance > 0 ? `<div class="warn" style="margin-top:8px">Capital a financiar: ${fmtARS(f.capitalToFinance)} (compras/costos − cobros).</div>` : `<div class="sum-row" style="margin-top:8px"><span class="muted">Capital a financiar</span><span style="color:var(--green)">${fmtARS(Math.max(0, f.capitalToFinance))}</span></div>`}
          ${!f.depositCoversPurchases && f.depositRequested > 0 ? `<div class="warn">La seña (${fmtARS(f.depositRequested)}) no cubre las compras (${fmtARS(f.realCost || f.estCost)}).</div>` : ''}
          ${q.purchases.map((p) => `<div class="sum-row" style="font-size:12px"><span class="muted">${fmtDate(p.date)} · ${esc(p.supplier || 'compra')} · ${esc(p.status)}</span><span>${fmtARS(p.total)}</span></div>`).join('') || '<div class="muted" style="font-size:12px;margin-top:8px">Sin compras registradas</div>'}
        </div>
        <div class="panel panel-pad">
          <b style="font-size:13px">Actividad</b>
          <div style="margin-top:10px">${q.activity.map((a) => `<div class="sum-row" style="font-size:12px"><span class="muted">${fmtDateTime(a.created_at)}</span><span>${esc(a.detail)}</span></div>`).join('')}</div>
        </div>
      </div>
    </div>`;
  $('#addpay').addEventListener('click', () => paymentModal(id, [{ id, number: q.number, customer_name: q.customer_name, total: v.total }]));
  $('#addbuy').addEventListener('click', () => location.hash = '#/compras');
  $('#status').addEventListener('change', async (e) => {
    const status = e.target.value; let lostReason = null;
    if (status === 'Perdido / rechazado') lostReason = prompt('Motivo de pérdida (opcional): Precio / Competencia / No respondió / Financiación / Otro') || null;
    await api('/quotes/' + id + '/status', { method: 'PUT', body: { status, lostReason, lastContact: new Date().toISOString() } });
    toast('Estado actualizado', 'ok'); router();
  });
  $('#pdf').addEventListener('click', () => printQuote(q, v));
  $('#wa').addEventListener('click', () => copyWhatsApp(q, v));
}

function copyWhatsApp(q, v) {
  const company = JSON.parse(S.settings.company || '{}');
  let t = `*${company.name || 'VOLTECH'}* — Presupuesto ${q.number}\n`;
  t += `Cliente: ${q.customer_name || ''}\nFecha: ${fmtDate(v.date)}\n\n`;
  v.items.forEach((it) => t += `• ${it.qty}x ${it.description} — ${fmtARS(it.line_total)}\n`);
  t += `\n*TOTAL: ${fmtARS(v.total)}*\n`;
  if (v.deposit_requested) t += `Seña: ${fmtARS(v.deposit_requested)} — Saldo: ${fmtARS(v.total - v.deposit_requested)}\n`;
  if (v.warranty) t += `\nGarantía: ${v.warranty}`;
  navigator.clipboard.writeText(t).then(() => toast('Resumen copiado para WhatsApp', 'ok'), () => toast('No se pudo copiar', 'err'));
}

function printQuote(q, v) {
  const company = JSON.parse(S.settings.company || '{}');
  const w = window.open('', '_blank');
  const rows = v.items.map((it) => `<tr><td>${esc(it.description || '')}<div class="c">${esc(it.code)}</div></td>
    <td class="n">${it.qty}</td><td class="n">${fmtARS(it.final_unit)}</td><td class="n">${fmtARS(it.line_total)}</td></tr>`).join('');
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(q.number)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111;margin:0;padding:40px;font-size:13px}
    .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0283EB;padding-bottom:16px;margin-bottom:24px}
    .hd img{height:46px} .hd .r{text-align:right;font-size:12px;color:#555}
    h1{font-size:20px;margin:0 0 4px} .meta{display:flex;gap:40px;margin-bottom:20px;font-size:12px}
    .meta b{display:block;color:#0283EB;font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px} th{background:#0A0A0A;color:#fff;text-align:left;padding:9px 11px;font-size:11px;text-transform:uppercase}
    td{padding:9px 11px;border-bottom:1px solid #eee} .n{text-align:right} .c{color:#999;font-size:10px;font-family:monospace}
    .tot{width:280px;margin-left:auto} .tot .r{display:flex;justify-content:space-between;padding:5px 0}
    .tot .big{border-top:2px solid #0A0A0A;font-size:17px;font-weight:700;padding-top:8px;margin-top:4px}
    .foot{margin-top:30px;border-top:1px solid #eee;padding-top:16px;font-size:11px;color:#555;line-height:1.6}
    @media print{body{padding:20px}}
  </style></head><body>
    <div class="hd"><img src="${location.origin}/logo.jpeg"/><div class="r"><b style="color:#0283EB;font-size:15px">${esc(company.name || 'VOLTECH')}</b><br>${esc(company.phone || '')} ${company.whatsapp ? '· WA ' + esc(company.whatsapp) : ''}<br>${esc(company.email || '')}<br>${esc(company.address || '')}${company.cuit ? '<br>CUIT ' + esc(company.cuit) : ''}</div></div>
    <h1>Presupuesto ${esc(q.number)}</h1>
    <div class="meta">
      <div><b>Cliente</b>${esc(q.customer?.name || q.customer_name || '—')}<br>${esc(q.customer?.phone || '')}<br>${esc(q.customer?.address || '')} ${esc(q.customer?.city || '')}</div>
      <div><b>Fecha</b>${fmtDate(v.date)}</div>
      <div><b>Válido hasta</b>${v.due_date ? fmtDate(v.due_date) : (S.settings.quoteValidityDays + ' días')}</div>
    </div>
    <table><thead><tr><th>Descripción</th><th class="n">Cant.</th><th class="n">Unitario</th><th class="n">Total</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="tot">
      ${v.discount_amount > 0 ? `<div class="r"><span>Subtotal</span><span>${fmtARS(v.subtotal)}</span></div><div class="r"><span>Descuento</span><span>- ${fmtARS(v.discount_amount)}</span></div>` : ''}
      ${v.extras > 0 ? `<div class="r"><span>Instalación / otros</span><span>${fmtARS(v.extras)}</span></div>` : ''}
      <div class="r big"><span>TOTAL</span><span>${fmtARS(v.total)}</span></div>
      ${v.deposit_requested > 0 ? `<div class="r"><span>Seña</span><span>${fmtARS(v.deposit_requested)}</span></div><div class="r"><span>Saldo</span><span>${fmtARS(v.total - v.deposit_requested)}</span></div>` : ''}
    </div>
    <div class="foot">
      ${v.payment_terms ? '<b>Forma de pago:</b> ' + esc(v.payment_terms) + '<br>' : ''}
      ${v.warranty ? '<b>Garantía:</b> ' + esc(v.warranty) + '<br>' : ''}
      ${v.conditions ? '<b>Condiciones:</b> ' + esc(v.conditions) + '<br>' : ''}
      ${v.notes ? '<br>' + esc(v.notes) : ''}
    </div>
  </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

// ---------- Config ----------
async function viewConfig(c) {
  const s = S.settings; const company = JSON.parse(s.company || '{}');
  const hist = await api('/exchange/history');
  c.innerHTML = `
    <div class="page-head"><div><h3>Configuración</h3><div class="sub">Valores predeterminados del sistema</div></div></div>
    <div class="row" style="align-items:flex-start">
      <div class="panel panel-pad" style="flex:1">
        <b>Parámetros comerciales</b>
        <div class="row" style="margin-top:14px">
          <label class="fld"><span>Descuento comercial proveedor %</span><input id="commercialDiscount" type="number" value="${pct100(s.commercialDiscount)}"/></label>
          <label class="fld"><span>Margen (markup) %</span><input id="margin" type="number" value="${pct100(s.margin)}"/></label>
        </div>
        <div class="row">
          <label class="fld"><span>Descuento máx. cliente %</span><input id="additionalDiscountMax" type="number" value="${pct100(s.additionalDiscountMax)}"/></label>
          <label class="fld"><span>Margen mínimo %</span><input id="minMargin" type="number" value="${pct100(s.minMargin)}"/></label>
        </div>
        <div class="row">
          <label class="fld"><span>Seña predeterminada %</span><input id="defaultDeposit" type="number" value="${pct100(s.defaultDeposit)}"/></label>
          <label class="fld"><span>Validez presupuesto (días)</span><input id="quoteValidityDays" type="number" value="${esc(s.quoteValidityDays)}"/></label>
        </div>
        <button class="btn primary" id="saveComm" style="margin-top:6px">Guardar parámetros</button>
      </div>
      <div class="panel panel-pad" style="flex:1">
        <b>Datos de Voltech (para el PDF)</b>
        <label class="fld" style="margin-top:14px"><span>Nombre</span><input id="c_name" value="${esc(company.name || 'VOLTECH')}"/></label>
        <div class="row"><label class="fld"><span>Teléfono</span><input id="c_phone" value="${esc(company.phone || '')}"/></label>
          <label class="fld"><span>WhatsApp</span><input id="c_whatsapp" value="${esc(company.whatsapp || '')}"/></label></div>
        <label class="fld"><span>Email</span><input id="c_email" value="${esc(company.email || '')}"/></label>
        <div class="row"><label class="fld"><span>Dirección</span><input id="c_address" value="${esc(company.address || '')}"/></label>
          <label class="fld"><span>CUIT</span><input id="c_cuit" value="${esc(company.cuit || '')}"/></label></div>
        <label class="fld"><span>Garantía estándar</span><textarea id="warranty">${esc(s.warranty || '')}</textarea></label>
        <label class="fld"><span>Condiciones comerciales</span><textarea id="standardConditions">${esc(s.standardConditions || '')}</textarea></label>
        <button class="btn primary" id="saveCompany">Guardar datos</button>
      </div>
    </div>
    <div class="panel panel-pad" style="margin-top:16px">
      <b>Dólar</b> — actual: <b style="color:var(--blue)">${fmtARS(S.dollar)}</b> (${esc(S.dollarInfo.source || '')})
      <div style="display:flex;gap:10px;margin:12px 0;align-items:center;flex-wrap:wrap">
        <button class="btn" id="rf">${I.refresh} Actualizar online</button>
        <button class="btn" id="mn">Ingresar manual</button>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);cursor:pointer;margin-left:8px">
          <input type="checkbox" id="autoDollar" ${s.autoDollarUpdate === '1' ? 'checked' : ''} style="width:auto"/> Actualización automática cada 30 min</label>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Valor</th><th>Fuente</th><th>Tipo</th></tr></thead>
        <tbody>${hist.map((h) => `<tr><td class="muted">${fmtDateTime(h.created_at)}</td><td><b>${fmtARS(h.value)}</b></td><td>${esc(h.source || '')}</td><td class="muted">${esc(h.type || '')}</td></tr>`).join('')}</tbody></table></div>
    </div>`;
  $('#saveComm').addEventListener('click', async () => {
    await api('/settings', { method: 'PUT', body: {
      commercialDiscount: n('commercialDiscount') / 100, margin: n('margin') / 100,
      additionalDiscountMax: n('additionalDiscountMax') / 100, minMargin: n('minMargin') / 100,
      defaultDeposit: n('defaultDeposit') / 100, quoteValidityDays: $('#quoteValidityDays').value,
    } });
    S.settings = await api('/settings'); toast('Parámetros guardados', 'ok');
  });
  $('#saveCompany').addEventListener('click', async () => {
    const company = { name: $('#c_name').value, phone: $('#c_phone').value, whatsapp: $('#c_whatsapp').value, email: $('#c_email').value, address: $('#c_address').value, cuit: $('#c_cuit').value };
    await api('/settings', { method: 'PUT', body: { company, warranty: $('#warranty').value, standardConditions: $('#standardConditions').value } });
    S.settings = await api('/settings'); toast('Datos guardados', 'ok');
  });
  $('#rf').addEventListener('click', refreshDollar);
  $('#mn').addEventListener('click', manualDollar);
  $('#autoDollar').addEventListener('change', async (e) => {
    await api('/settings', { method: 'PUT', body: { autoDollarUpdate: e.target.checked ? '1' : '0' } });
    S.settings = await api('/settings'); toast('Preferencia guardada', 'ok');
  });
  const n = (id) => Number($('#' + id).value) || 0;
}

// ========================= COMPRAS =========================
async function viewPurchases(c) {
  const list = await api('/purchases');
  c.innerHTML = `
    <div class="page-head"><div><h3>Compras</h3><div class="sub">${list.length} compras registradas</div></div>
      <button class="btn primary" id="new">${I.plus} Nueva compra</button></div>
    <div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>Fecha</th><th>Proveedor</th><th>Presupuesto</th><th>Cliente</th><th class="num">Total</th><th>Estado</th><th></th></tr></thead>
      <tbody>${list.map((p) => `<tr>
        <td class="muted">${fmtDate(p.date)}</td><td><b>${esc(p.supplier || '—')}</b></td>
        <td class="mono">${esc(p.quote_number || '—')}</td><td class="muted">${esc(p.customer_name || '—')}</td>
        <td class="num"><b>${fmtARS(p.total)}</b></td>
        <td><select class="st-sel" data-id="${p.id}" data-cur="${esc(p.status)}">${['Pendiente', 'Pedido', 'Parcialmente recibido', 'Recibido', 'Pagado', 'Cancelado'].map((s) => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
        <td class="num">${esc(p.invoice_number || '')}</td></tr>`).join('') || `<tr><td colspan="7" class="empty">Todavía no registraste compras</td></tr>`}</tbody>
    </table></div></div>`;
  $('#new').addEventListener('click', () => purchaseModal());
  c.querySelectorAll('.st-sel').forEach((s) => s.addEventListener('change', async (e) => {
    await api('/purchases/' + e.target.dataset.id + '/status', { method: 'PUT', body: { status: e.target.value } });
    toast('Estado actualizado', 'ok');
  }));
}

async function purchaseModal() {
  const quotes = await api('/quotes');
  const state = { items: [] };
  const m = modal(`<div class="modal-head"><h4>Nueva compra</h4><button class="close-x" data-close>&times;</button></div>
    <div class="modal-body">
      <div class="row"><label class="fld"><span>Proveedor</span><input id="supplier"/></label>
        <label class="fld"><span>Fecha</span><input id="date" type="date" value="${new Date().toISOString().slice(0, 10)}"/></label></div>
      <div class="row"><label class="fld"><span>Presupuesto asociado (opcional)</span><select id="quoteId"><option value="">— ninguno —</option>${quotes.map((q) => `<option value="${q.id}">${esc(q.number)} · ${esc(q.customer_name || 's/cliente')}</option>`).join('')}</select></label>
        <label class="fld"><span>N° factura / remito</span><input id="invoiceNumber"/></label></div>
      <div class="search" style="margin-bottom:10px">${I.search}<input id="psearch" placeholder="Buscar producto para agregar…"/></div>
      <div class="pick-list" id="picks" style="display:none;margin-bottom:10px"></div>
      <div class="table-wrap"><table><thead><tr><th>Producto</th><th style="width:60px">Cant.</th><th style="width:90px">Costo USD</th><th class="num">Total ARS</th><th></th></tr></thead><tbody id="items"></tbody></table></div>
      <div class="row" style="margin-top:10px"><label class="fld"><span>Estado</span><select id="status">${['Pendiente', 'Pedido', 'Parcialmente recibido', 'Recibido', 'Pagado'].map((s) => `<option>${s}</option>`).join('')}</select></label>
        <label class="fld"><span>Entrega estimada</span><input id="expectedDate" type="date"/></label></div>
      <label class="fld"><span>Observaciones</span><textarea id="notes"></textarea></label>
      <div style="text-align:right;font-size:15px;font-weight:700" id="ptotal"></div>
    </div>
    <div class="modal-foot"><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="save">Guardar compra</button></div>`, { wide: true });

  const dollar = S.dollar;
  const psearch = m.q('#psearch'), picks = m.q('#picks');
  const doSearch = debounce(async () => {
    const q = psearch.value.trim(); if (!q) { picks.style.display = 'none'; return; }
    const d = await api('/products?active=1&search=' + encodeURIComponent(q));
    picks.style.display = 'block';
    picks.innerHTML = d.products.slice(0, 30).map((p) => `<div class="pick-item" data-p='${esc(JSON.stringify({ id: p.id, code: p.code, description: p.description, netUSD: p.netUSD }))}'>
      <span class="code">${esc(p.code)}</span><span class="d">${esc(p.description || '')}</span><span class="p">US$ ${(p.netUSD || 0).toFixed(2)}</span></div>`).join('');
    picks.querySelectorAll('[data-p]').forEach((it) => it.addEventListener('click', () => {
      const p = JSON.parse(it.dataset.p);
      state.items.push({ productId: p.id, code: p.code, description: p.description, qty: 1, costUSD: p.netUSD || 0 });
      psearch.value = ''; picks.style.display = 'none'; render();
    }));
  }, 200);
  psearch.addEventListener('input', doSearch);
  function render() {
    m.q('#items').innerHTML = state.items.map((it, i) => `<tr>
      <td style="font-size:12.5px"><span class="mono">${esc(it.code || '')}</span> ${esc(it.description || '')}</td>
      <td><input type="number" min="1" value="${it.qty}" data-qty="${i}" style="padding:5px"/></td>
      <td><input type="number" step="0.01" value="${it.costUSD}" data-cost="${i}" style="padding:5px"/></td>
      <td class="num">${fmtARS(it.qty * it.costUSD * dollar)}</td>
      <td><button class="btn sm danger" data-del="${i}">✕</button></td></tr>`).join('') || `<tr><td colspan="5" class="empty" style="padding:20px">Agregá productos</td></tr>`;
    const total = state.items.reduce((s, it) => s + it.qty * it.costUSD * dollar, 0);
    m.q('#ptotal').textContent = 'Total: ' + fmtARS(total) + ' (dólar ' + fmtARS(dollar) + ')';
    m.q('#items').querySelectorAll('[data-qty]').forEach((x) => x.addEventListener('input', (e) => { state.items[+e.target.dataset.qty].qty = Math.max(1, +e.target.value || 1); render(); }));
    m.q('#items').querySelectorAll('[data-cost]').forEach((x) => x.addEventListener('input', (e) => { state.items[+e.target.dataset.cost].costUSD = +e.target.value || 0; render(); }));
    m.q('#items').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { state.items.splice(+b.dataset.del, 1); render(); }));
  }
  render();
  m.q('#save').addEventListener('click', async () => {
    if (!state.items.length) return toast('Agregá al menos un producto', 'err');
    try {
      await api('/purchases', { method: 'POST', body: {
        supplier: m.q('#supplier').value, date: m.q('#date').value, quoteId: m.q('#quoteId').value || null,
        invoiceNumber: m.q('#invoiceNumber').value, status: m.q('#status').value, expectedDate: m.q('#expectedDate').value || null,
        notes: m.q('#notes').value, dollar,
        items: state.items.map((it) => ({ productId: it.productId, qty: it.qty, costUSD: it.costUSD })),
      } });
      m.close(); toast('Compra registrada', 'ok'); router();
    } catch (e) { toast(e.message, 'err'); }
  });
}

// ========================= COBROS & SEÑAS =========================
async function viewPayments(c) {
  const [quotes, payments] = await Promise.all([api('/quotes'), api('/payments')]);
  const approved = quotes.filter((q) => ['Aprobado', 'Seña pendiente', 'Seña recibida', 'Productos a comprar', 'Comprado', 'En preparación', 'Instalación programada', 'Finalizado', 'Cobrado'].includes(q.status));
  const paidByQuote = {};
  payments.forEach((p) => { paidByQuote[p.quote_id] = (paidByQuote[p.quote_id] || 0) + p.amount; });
  const totalBilled = approved.reduce((s, q) => s + (q.total || 0), 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  c.innerHTML = `
    <div class="page-head"><div><h3>Cobros & Señas</h3><div class="sub">${payments.length} movimientos</div></div>
      <button class="btn primary" id="new">${I.plus} Registrar pago</button></div>
    <div class="kpis" style="margin-bottom:18px">
      ${kpi('Total facturado', fmtARS(totalBilled), 'presupuestos aprobados', 'accent')}
      ${kpi('Total cobrado', fmtARS(totalPaid), '', 'good')}
      ${kpi('Saldo pendiente', fmtARS(totalBilled - totalPaid), '', 'bad')}
    </div>
    <div class="row" style="align-items:flex-start">
      <div class="panel" style="flex:1.3"><div class="panel-pad"><b>Saldos por presupuesto</b></div><div class="table-wrap"><table>
        <thead><tr><th>N°</th><th>Cliente</th><th class="num">Total</th><th class="num">Cobrado</th><th class="num">Saldo</th></tr></thead>
        <tbody>${approved.map((q) => { const paid = paidByQuote[q.id] || 0; const bal = (q.total || 0) - paid; return `<tr>
          <td class="mono">${esc(q.number)}</td><td>${esc(q.customer_name || '—')}</td>
          <td class="num">${fmtARS(q.total)}</td><td class="num" style="color:var(--green)">${fmtARS(paid)}</td>
          <td class="num"><b style="color:${bal > 0 ? 'var(--amber)' : 'var(--green)'}">${fmtARS(bal)}</b></td></tr>`; }).join('') || `<tr><td colspan="5" class="empty">Sin presupuestos aprobados</td></tr>`}</tbody>
      </table></div></div>
      <div class="panel" style="flex:1"><div class="panel-pad"><b>Últimos movimientos</b></div><div class="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>N°</th><th>Método</th><th class="num">Monto</th><th></th></tr></thead>
        <tbody>${payments.slice(0, 30).map((p) => `<tr><td class="muted">${fmtDate(p.date)}</td><td class="mono">${esc(p.quote_number || '—')}</td>
          <td>${esc(p.kind || '')} · ${esc(p.method || '')}</td><td class="num"><b>${fmtARS(p.amount)}</b></td>
          <td><button class="btn sm danger" data-del="${p.id}">✕</button></td></tr>`).join('') || `<tr><td colspan="5" class="empty">Sin cobros</td></tr>`}</tbody>
      </table></div></div>
    </div>`;
  $('#new').addEventListener('click', () => paymentModal(null, approved));
  c.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('¿Eliminar este movimiento?')) return;
    await api('/payments/' + b.dataset.del, { method: 'DELETE' }); toast('Movimiento eliminado', 'ok'); router();
  }));
}

async function paymentModal(quoteId, quotesList) {
  const quotes = quotesList || (await api('/quotes')).filter((q) => q.status !== 'Borrador');
  const m = modal(`<div class="modal-head"><h4>Registrar pago / seña</h4><button class="close-x" data-close>&times;</button></div>
    <div class="modal-body">
      <label class="fld"><span>Presupuesto</span><select id="quoteId">${quotes.map((q) => `<option value="${q.id}" ${q.id === quoteId ? 'selected' : ''}>${esc(q.number)} · ${esc(q.customer_name || 's/cliente')} · ${fmtARS(q.total)}</option>`).join('')}</select></label>
      <div class="row"><label class="fld"><span>Tipo</span><select id="kind"><option>Seña</option><option>Pago parcial</option><option>Saldo final</option><option>Pago</option></select></label>
        <label class="fld"><span>Monto (ARS)</span><input id="amount" type="number"/></label></div>
      <div class="row"><label class="fld"><span>Método</span><select id="method"><option>Transferencia</option><option>Efectivo</option><option>Tarjeta</option><option>Mercado Pago</option><option>USD</option><option>Otro</option></select></label>
        <label class="fld"><span>Fecha</span><input id="date" type="date" value="${new Date().toISOString().slice(0, 10)}"/></label></div>
      <label class="fld"><span>Referencia / comprobante</span><input id="reference"/></label>
      <label class="fld"><span>Observación</span><textarea id="notes"></textarea></label>
    </div>
    <div class="modal-foot"><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="save">Registrar</button></div>`);
  m.q('#save').addEventListener('click', async () => {
    try {
      await api('/payments', { method: 'POST', body: {
        quoteId: m.q('#quoteId').value, kind: m.q('#kind').value, amount: m.q('#amount').value,
        method: m.q('#method').value, date: m.q('#date').value, reference: m.q('#reference').value, notes: m.q('#notes').value,
      } });
      m.close(); toast('Pago registrado', 'ok'); router();
    } catch (e) { toast(e.message, 'err'); }
  });
}

// ========================= GASTOS =========================
async function viewExpenses(c) {
  const list = await api('/expenses');
  const cats = JSON.parse(S.settings.expenseCategories || '[]');
  const now = new Date(); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthTotal = list.filter((e) => new Date(e.date) >= monthStart).reduce((s, e) => s + e.amount, 0);
  const total = list.reduce((s, e) => s + e.amount, 0);
  c.innerHTML = `
    <div class="page-head"><div><h3>Gastos</h3><div class="sub">${list.length} registros</div></div>
      <button class="btn primary" id="new">${I.plus} Nuevo gasto</button></div>
    <div class="kpis" style="margin-bottom:18px">
      ${kpi('Gastos del mes', fmtARS(monthTotal), '', 'bad')}
      ${kpi('Gastos totales', fmtARS(total), 'histórico')}
    </div>
    <div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Tipo</th><th class="num">Monto</th><th></th></tr></thead>
      <tbody>${list.map((e) => `<tr><td class="muted">${fmtDate(e.date)}</td><td>${esc(e.category || '—')}</td>
        <td>${esc(e.description || '')}</td><td class="muted">${e.recurring ? 'Recurrente' : 'Único'}</td>
        <td class="num"><b>${fmtARS(e.amount)}</b></td><td><button class="btn sm danger" data-del="${e.id}">✕</button></td></tr>`).join('') || `<tr><td colspan="6" class="empty">Todavía no cargaste gastos</td></tr>`}</tbody>
    </table></div></div>`;
  $('#new').addEventListener('click', () => {
    const m = modal(`<div class="modal-head"><h4>Nuevo gasto</h4><button class="close-x" data-close>&times;</button></div>
      <div class="modal-body">
        <div class="row"><label class="fld"><span>Fecha</span><input id="date" type="date" value="${new Date().toISOString().slice(0, 10)}"/></label>
          <label class="fld"><span>Categoría</span><select id="category">${cats.map((x) => `<option>${esc(x)}</option>`).join('')}</select></label></div>
        <label class="fld"><span>Descripción</span><input id="description"/></label>
        <div class="row"><label class="fld"><span>Monto (ARS)</span><input id="amount" type="number"/></label>
          <label class="fld"><span>Tipo</span><select id="recurring"><option value="0">Único</option><option value="1">Recurrente (mensual)</option></select></label></div>
      </div>
      <div class="modal-foot"><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="save">Guardar</button></div>`);
    m.q('#save').addEventListener('click', async () => {
      try {
        await api('/expenses', { method: 'POST', body: { date: m.q('#date').value, category: m.q('#category').value, description: m.q('#description').value, amount: m.q('#amount').value, recurring: m.q('#recurring').value === '1' } });
        m.close(); toast('Gasto guardado', 'ok'); router();
      } catch (e) { toast(e.message, 'err'); }
    });
  });
  c.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('¿Eliminar este gasto?')) return;
    await api('/expenses/' + b.dataset.del, { method: 'DELETE' }); toast('Gasto eliminado', 'ok'); router();
  }));
}

// ========================= ESTADÍSTICAS =========================
async function viewStats(c) {
  const y = new Date().getFullYear();
  const s = await api('/stats');
  const cm = s.commercial;
  c.innerHTML = `
    <div class="page-head"><div><h3>Estadísticas</h3><div class="sub">Año ${y}</div></div></div>
    <div class="kpis" style="margin-bottom:18px">
      ${kpi('Presupuestos', cm.totalQuotes, '')}
      ${kpi('Cotizado', fmtARS(cm.totalQuoted), '', 'accent')}
      ${kpi('Aprobado', fmtARS(cm.totalApproved), `${cm.approvedCount} ganados`, 'good')}
      ${kpi('Perdido', fmtARS(cm.totalLost), `${cm.lostCount} perdidos`, 'bad')}
      ${kpi('Conversión', fmtPct(cm.conversion), '')}
      ${kpi('Ticket promedio', fmtARS(cm.avgTicket), '')}
    </div>
    <div class="row" style="align-items:flex-start;margin-bottom:16px">
      <div class="panel panel-pad" style="flex:1.4"><b>Cotizado vs Aprobado vs Perdido por mes</b>
        ${monthChart(cm.monthly)}</div>
      <div class="panel panel-pad" style="flex:1"><b>Motivos de pérdida</b>
        ${hbars(Object.entries(cm.lossReasons).map(([k, v]) => ({ label: k, value: v })), (v) => v + '')}</div>
    </div>
    <div class="row" style="align-items:flex-start;margin-bottom:16px">
      <div class="panel panel-pad" style="flex:1"><b>Clientes con más facturación</b>
        ${hbars(cm.topCustomers.map((x) => ({ label: x.name, value: x.total })), fmtARS)}</div>
      <div class="panel panel-pad" style="flex:1"><b>Categorías más vendidas</b>
        ${hbars(cm.topCategories.map((x) => ({ label: x.name, value: x.total })), fmtARS)}</div>
    </div>
    <div class="panel panel-pad" style="margin-bottom:16px"><b>Productos más cotizados (por cantidad)</b>
      <div class="table-wrap"><table><thead><tr><th>Código</th><th>Producto</th><th class="num">Cant.</th><th class="num">Monto</th></tr></thead>
        <tbody>${cm.topProducts.map((p) => `<tr><td class="mono">${esc(p.code || '')}</td><td>${esc(p.description || '')}</td><td class="num">${Math.round(p.qty)}</td><td class="num">${fmtARS(p.total)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Sin datos</td></tr>'}</tbody></table></div>
    </div>
    <div class="row" style="align-items:flex-start;margin-bottom:16px">
      <div class="panel panel-pad" style="flex:1"><b>Cobros por método</b>
        ${hbars(Object.entries(s.cobros.byMethod).map(([k, v]) => ({ label: k, value: v })), fmtARS)}
        <div class="sum-row total"><span>Total cobrado</span><span>${fmtARS(s.cobros.paid)}</span></div>
        <div class="sum-row"><span class="muted">Pendiente de cobro</span><span>${fmtARS(s.cobros.pending)}</span></div>
      </div>
      <div class="panel panel-pad" style="flex:1"><b>Estado de resultados operativo</b>
        <div class="sum-row"><span class="muted">Ingresos cobrados</span><span style="color:var(--green)">${fmtARS(s.resultado.income)}</span></div>
        <div class="sum-row"><span class="muted">− Costo de productos (compras)</span><span>${fmtARS(s.resultado.costProducts)}</span></div>
        <div class="sum-row"><span class="muted">− Gastos generales</span><span>${fmtARS(s.resultado.expenses)}</span></div>
        <div class="sum-row total"><span>Resultado operativo</span><span style="color:${s.resultado.operatingResult >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtARS(s.resultado.operatingResult)}</span></div>
        <div class="sum-row" style="margin-top:8px"><span class="muted">Ganancia proyectada (aprobados)</span><span>${fmtARS(s.profitability.estProfit)}</span></div>
        <div class="sum-row"><span class="muted">Margen promedio</span><span>${fmtPct(s.profitability.avgMargin)}</span></div>
      </div>
    </div>`;
}

// mini-gráfico de barras mensuales (3 series) en SVG
function monthChart(monthly) {
  if (!monthly || !monthly.length) return '<div class="empty" style="padding:30px">Sin datos en el período</div>';
  const max = Math.max(1, ...monthly.map((m) => Math.max(m.quoted, m.approved, m.lost)));
  const W = 560, H = 200, pad = 30, bw = (W - pad * 2) / monthly.length;
  const y = (v) => H - pad - (v / max) * (H - pad * 2);
  const bars = monthly.map((m, i) => {
    const x = pad + i * bw; const w = bw / 3.4;
    return `<rect x="${x + w * 0.2}" y="${y(m.quoted)}" width="${w}" height="${H - pad - y(m.quoted)}" fill="#378ADD"/>
      <rect x="${x + w * 1.3}" y="${y(m.approved)}" width="${w}" height="${H - pad - y(m.approved)}" fill="#21c07a"/>
      <rect x="${x + w * 2.4}" y="${y(m.lost)}" width="${w}" height="${H - pad - y(m.lost)}" fill="#f2555a"/>
      <text x="${x + bw / 2}" y="${H - 10}" fill="#8b8f96" font-size="10" text-anchor="middle">${esc(m.label)}</text>`;
  }).join('');
  return `<div style="margin-top:12px;overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:${W}px;height:auto">
    ${bars}</svg></div>
    <div style="display:flex;gap:16px;font-size:11.5px;color:var(--muted);margin-top:4px">
      <span><span style="color:#378ADD">■</span> Cotizado</span><span><span style="color:#21c07a">■</span> Aprobado</span><span><span style="color:#f2555a">■</span> Perdido</span></div>`;
}

// barras horizontales de ranking
function hbars(items, fmt) {
  if (!items || !items.length) return '<div class="empty" style="padding:24px">Sin datos</div>';
  const max = Math.max(1, ...items.map((i) => i.value));
  return '<div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">' + items.map((i) => `
    <div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px"><span>${esc(i.label)}</span><span class="muted">${fmt(i.value)}</span></div>
      <div style="background:#202020;border-radius:4px;height:8px;overflow:hidden"><div style="width:${(i.value / max) * 100}%;height:100%;background:var(--blue)"></div></div></div>`).join('') + '</div>';
}

// ========================= ACTUALIZAR PRECIOS =========================
async function viewPriceUpdate(c) {
  const imports = await api('/price-list/imports');
  c.innerHTML = `
    <div class="page-head"><div><h3>Actualizar precios</h3><div class="sub">Importá la nueva lista Excel del proveedor. Los presupuestos históricos NO se modifican.</div></div></div>
    <div class="panel panel-pad" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <label class="btn primary" style="cursor:pointer">${I.upload} Elegir archivo .xlsx<input type="file" id="file" accept=".xlsx,.xls" style="display:none"/></label>
        <span class="muted" id="fname">Ningún archivo seleccionado</span>
      </div>
      <div id="parsing" style="display:none;margin-top:14px"><div class="spin"></div></div>
    </div>
    <div id="result"></div>
    <div class="panel panel-pad" style="margin-top:16px">
      <b>Historial de importaciones</b>
      <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Archivo</th><th class="num">Total</th><th class="num">Nuevos</th><th class="num">Actualizados</th><th class="num">Sin cambios</th><th class="num">Discont.</th></tr></thead>
        <tbody>${imports.map((im) => `<tr><td class="muted">${fmtDateTime(im.created_at)}</td><td>${esc(im.filename || '')}</td>
          <td class="num">${im.total}</td><td class="num" style="color:#6cc0ff">${im.new_count}</td><td class="num" style="color:#ffce7a">${im.updated_count}</td>
          <td class="num muted">${im.unchanged_count}</td><td class="num" style="color:#ff9ea1">${im.discontinued_count}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sin importaciones aún</td></tr>'}</tbody></table></div>
    </div>`;
  let currentB64 = null, currentName = null;
  $('#file').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    $('#fname').textContent = file.name; currentName = file.name;
    $('#parsing').style.display = 'block'; $('#result').innerHTML = '';
    try {
      currentB64 = await fileToBase64(file);
      const d = await api('/price-list/preview', { method: 'POST', body: { dataBase64: currentB64, filename: file.name } });
      renderPreview(d);
    } catch (err) { toast(err.message, 'err'); $('#result').innerHTML = `<div class="warn">${esc(err.message)}</div>`; }
    finally { $('#parsing').style.display = 'none'; }
  });

  function renderPreview(d) {
    const su = d.summary;
    const badge = (a) => ({ new: 'new', updated: 'up', unchanged: 'same', discontinued: 'off', error: 'off', manual: 'up' }[a] || 'same');
    const label = (a) => ({ new: 'Nuevo', updated: 'Precio actualizado', unchanged: 'Sin cambios', discontinued: 'Discontinuado', error: 'Error', manual: 'Revisión manual' }[a] || a);
    $('#result').innerHTML = `
      <div class="panel panel-pad" style="margin-bottom:14px">
        <b>Vista previa — hoja usada: ${esc(d.sheetUsed)}</b>
        <div class="kpis" style="margin-top:12px">
          ${kpi('Nuevos', su.new, '', 'accent')}${kpi('Actualizados', su.updated, '')}${kpi('Sin cambios', su.unchanged, '')}
          ${kpi('Discontinuados', su.discontinued, '', 'bad')}${kpi('Duplicados', su.duplicates, '')}${kpi('Errores', su.errors, '', su.errors ? 'bad' : '')}${kpi('Revisión manual', su.manual, '')}
        </div>
        <div style="display:flex;gap:10px;margin-top:16px;align-items:center">
          <button class="btn primary" id="confirm">Confirmar importación</button>
          <select id="filter"><option value="">Ver todos</option><option value="new">Nuevos</option><option value="updated">Actualizados</option><option value="discontinued">Discontinuados</option><option value="error">Errores</option><option value="manual">Revisión manual</option></select>
          <span class="muted">Los productos que desaparecen se marcan discontinuados, nunca se borran.</span>
        </div>
      </div>
      <div class="panel"><div class="table-wrap"><table>
        <thead><tr><th>Código</th><th>Descripción</th><th class="num">Neto ant.</th><th class="num">Neto nuevo</th><th class="num">Var.</th><th>Estado</th></tr></thead>
        <tbody id="rows"></tbody></table></div></div>`;
    const draw = (f) => {
      const rows = d.rows.filter((r) => !f || r.action === f);
      $('#rows').innerHTML = rows.slice(0, 400).map((r) => `<tr>
        <td class="mono">${esc(r.code || '—')}</td><td style="font-size:12.5px">${esc(r.description || '')}${r.issues ? ` <span class="muted">(${esc(r.issues)})</span>` : ''}</td>
        <td class="num muted">${r.oldNet != null ? 'US$ ' + r.oldNet.toFixed(2) : '—'}</td>
        <td class="num">${r.netUSD != null ? 'US$ ' + r.netUSD.toFixed(2) : '—'}</td>
        <td class="num ${r.pct > 0 ? '' : ''}" style="color:${r.pct > 0 ? '#ffce7a' : r.pct < 0 ? '#74e3ad' : 'var(--muted)'}">${r.pct != null ? fmtPct(r.pct) : '—'}</td>
        <td><span class="badge ${badge(r.action)}">${label(r.action)}</span></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sin filas</td></tr>';
    };
    draw('');
    $('#filter').addEventListener('change', (e) => draw(e.target.value));
    $('#confirm').addEventListener('click', async () => {
      if (!confirm(`Confirmar: ${su.new} nuevos, ${su.updated} actualizados, ${su.discontinued} discontinuados. ¿Continuar?`)) return;
      try {
        const r = await api('/price-list/confirm', { method: 'POST', body: { dataBase64: currentB64, filename: currentName } });
        toast(`Importación aplicada: ${r.summary.new} nuevos, ${r.summary.updated} actualizados`, 'ok');
        S.settings = await api('/settings'); S.categories = await api('/categories');
        router();
      } catch (e) { toast(e.message, 'err'); }
    });
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = r.result; resolve(s.slice(s.indexOf(',') + 1)); };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ---------- helpers ----------
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
