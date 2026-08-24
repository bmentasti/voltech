// VOLTECH — Base de datos (SQLite embebido vía better-sqlite3).
// Persistencia local real. Se inicializa y siembra en el primer arranque
// a partir de server/data/seed.json (los 170 productos reales del Excel).
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { hashPassword } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
// La ubicación de la base se puede sobreescribir con la variable VOLTECH_DB
// (útil para tests o para colocar la base fuera del proyecto).
const DB_PATH = process.env.VOLTECH_DB || join(DATA_DIR, 'voltech.db');
const SEED_PATH = join(DATA_DIR, 'seed.json');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);
// WAL mejora la concurrencia; si el filesystem no lo soporta se usa el modo por defecto.
try { db.pragma('journal_mode = WAL'); } catch { /* filesystem sin soporte WAL */ }
db.pragma('foreign_keys = ON');

export function uuid() {
  return randomUUID();
}

function initSchema() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS families (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    family_id TEXT,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY(family_id) REFERENCES families(id)
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    description TEXT,
    category_id TEXT,
    family_id TEXT,
    technology TEXT,
    net_usd REAL,
    iva REAL,
    update_state TEXT,
    observations TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(category_id) REFERENCES categories(id),
    FOREIGN KEY(family_id) REFERENCES families(id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_products_code ON products(code);

  CREATE TABLE IF NOT EXISTS exchange_rates (
    id TEXT PRIMARY KEY,
    value REAL NOT NULL,
    buy REAL,
    sell REAL,
    source TEXT,
    type TEXT DEFAULT 'oficial_venta',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tax_id TEXT,
    contact TEXT,
    phone TEXT,
    whatsapp TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    install_address TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY,
    number TEXT UNIQUE NOT NULL,
    customer_id TEXT,
    status TEXT NOT NULL DEFAULT 'Borrador',
    current_version INTEGER NOT NULL DEFAULT 1,
    lost_reason TEXT,
    next_followup TEXT,
    last_contact TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
  );

  CREATE TABLE IF NOT EXISTS quote_versions (
    id TEXT PRIMARY KEY,
    quote_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    date TEXT NOT NULL,
    due_date TEXT,
    dollar_used REAL NOT NULL,
    commercial_discount REAL DEFAULT 0,
    margin REAL DEFAULT 0,
    extras REAL DEFAULT 0,
    labor REAL DEFAULT 0,
    freight REAL DEFAULT 0,
    other_concepts REAL DEFAULT 0,
    deposit_requested REAL DEFAULT 0,
    notes TEXT,
    warranty TEXT,
    payment_terms TEXT,
    conditions TEXT,
    subtotal REAL, discount_amount REAL, total REAL, cost REAL, profit REAL, margin_pct REAL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(quote_id) REFERENCES quotes(id)
  );

  -- Cada línea guarda un SNAPSHOT inmutable (preservación de presupuestos históricos)
  CREATE TABLE IF NOT EXISTS quote_items (
    id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL,
    product_id TEXT,
    code TEXT,
    description TEXT,
    net_usd REAL,
    iva REAL,
    dollar_used REAL,
    commercial_discount REAL,
    margin REAL,
    client_discount REAL,
    qty REAL,
    final_usd REAL,
    cost_ars REAL,
    sale_price REAL,
    final_unit REAL,
    line_total REAL,
    profit_line REAL,
    margin_pct REAL,
    FOREIGN KEY(version_id) REFERENCES quote_versions(id)
  );

  CREATE TABLE IF NOT EXISTS quote_activity (
    id TEXT PRIMARY KEY,
    quote_id TEXT NOT NULL,
    type TEXT,
    detail TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(quote_id) REFERENCES quotes(id)
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action TEXT,
    entity TEXT,
    entity_id TEXT,
    old_value TEXT,
    new_value TEXT,
    created_at TEXT NOT NULL
  );

  -- ===== Etapa 2: compras, cobros, gastos, importaciones, historial de precios =====

  CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    supplier TEXT,
    date TEXT NOT NULL,
    quote_id TEXT,
    invoice_number TEXT,
    expected_date TEXT,
    received_date TEXT,
    status TEXT NOT NULL DEFAULT 'Pendiente',
    dollar_used REAL,
    total REAL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(quote_id) REFERENCES quotes(id)
  );

  CREATE TABLE IF NOT EXISTS purchase_items (
    id TEXT PRIMARY KEY,
    purchase_id TEXT NOT NULL,
    product_id TEXT,
    code TEXT,
    description TEXT,
    qty REAL,
    cost_usd REAL,
    cost_ars REAL,
    dollar_used REAL,
    line_total REAL,
    FOREIGN KEY(purchase_id) REFERENCES purchases(id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    quote_id TEXT NOT NULL,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'ARS',
    method TEXT,
    kind TEXT DEFAULT 'Pago',
    reference TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(quote_id) REFERENCES quotes(id)
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    category TEXT,
    description TEXT,
    amount REAL NOT NULL,
    recurring INTEGER DEFAULT 0,
    quote_id TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS price_list_imports (
    id TEXT PRIMARY KEY,
    filename TEXT,
    date TEXT NOT NULL,
    user_id TEXT,
    total INTEGER, new_count INTEGER, updated_count INTEGER,
    unchanged_count INTEGER, discontinued_count INTEGER, error_count INTEGER,
    dollar_used REAL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS product_price_history (
    id TEXT PRIMARY KEY,
    product_id TEXT,
    code TEXT,
    old_usd REAL,
    new_usd REAL,
    diff_usd REAL,
    pct REAL,
    import_id TEXT,
    date TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pph_product ON product_price_history(product_id);
  `);
}

const DEFAULT_SETTINGS = {
  dollarSource: 'dolarapi.com (oficial)',
  dollarBackup: '1500',
  commercialDiscount: '0',
  margin: '0',
  additionalDiscountMax: '0.15',
  defaultDeposit: '0.5',
  minDeposit: '0.3',
  quoteValidityDays: '15',
  minMargin: '0.15',
  dollarAlertVariation: '0.05',
  followupAlertDays: '7',
  company: JSON.stringify({
    name: 'VOLTECH',
    phone: '',
    whatsapp: '',
    email: '',
    address: '',
    cuit: '',
  }),
  standardConditions: 'Precios expresados en pesos argentinos. Validez sujeta a stock y variación del tipo de cambio.',
  warranty: '12 meses de garantía sobre motores y componentes electrónicos.',
  quoteCounter: '0',
  priceListVersion: '1',
  priceListSource: '',
  priceListDate: '',
  expenseCategories: JSON.stringify(['Mano de obra', 'Ayudante', 'Materiales de instalación', 'Soldadura / herrería', 'Fletes / logística', 'Alquiler de equipos', 'Viáticos', 'Herramientas', 'Combustible', 'Vehículos', 'Alquiler', 'Servicios', 'Marketing', 'Software', 'Contador', 'Impuestos', 'Sueldos/colaboradores', 'Otros']),
  autoDollarUpdate: '1',
};

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : undefined;
}
export function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, String(value));
}
export function getAllSettings() {
  const rows = db.prepare('SELECT key,value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function seedIfEmpty() {
  const now = new Date().toISOString();

  // Usuario admin inicial
  const userCount = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (userCount === 0) {
    db.prepare('INSERT INTO users(id,username,password_hash,role,created_at) VALUES(?,?,?,?,?)')
      .run(uuid(), 'Voltech', hashPassword('Lauti123'), 'admin', now);
    console.log('  ✓ Usuario admin creado: Voltech (contraseña inicial hasheada con scrypt)');
  }

  // Settings por defecto
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (getSetting(k) === undefined) setSetting(k, v);
  }

  // Productos / familias / categorías
  const prodCount = db.prepare('SELECT COUNT(*) c FROM products').get().c;
  if (prodCount === 0) {
    if (!existsSync(SEED_PATH)) {
      console.warn('  ! No se encontró seed.json — la app arranca sin catálogo.');
    } else {
      const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'));

      // Config del Excel -> settings
      if (seed.config) {
        if (seed.config.dollarBackup) setSetting('dollarBackup', String(seed.config.dollarBackup));
        if (seed.config.commercialDiscount != null) setSetting('commercialDiscount', String(seed.config.commercialDiscount));
        if (seed.config.margin != null) setSetting('margin', String(seed.config.margin));
        if (seed.config.updateDate) setSetting('priceListDate', String(seed.config.updateDate));
        if (seed.config.source) setSetting('priceListSource', String(seed.config.source));
      }

      const famIds = {};
      seed.families.forEach((name, i) => {
        const id = uuid();
        famIds[name] = id;
        db.prepare('INSERT INTO families(id,name,sort_order) VALUES(?,?,?)').run(id, name, i);
      });

      const catIds = {};
      seed.categories.forEach((c, i) => {
        const id = uuid();
        catIds[c.name] = id;
        db.prepare('INSERT INTO categories(id,name,family_id,sort_order) VALUES(?,?,?,?)')
          .run(id, c.name, famIds[c.family] || null, i);
      });

      const ins = db.prepare(`INSERT INTO products
        (id,code,description,category_id,family_id,technology,net_usd,iva,update_state,observations,active,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)`);
      const seedDate = (seed.config && seed.config.updateDate) ? seed.config.updateDate : now;
      let n = 0;
      for (const p of seed.products) {
        ins.run(uuid(), p.code, p.description, catIds[p.category] || null,
          famIds[p.family] || null, p.technology, p.netUSD, p.iva,
          p.updateState, p.observations, seedDate, seedDate);
        n++;
      }
      console.log(`  ✓ Catálogo importado: ${n} productos, ${seed.families.length} familias, ${seed.categories.length} categorías`);
      console.log(`  ✓ Lista de precios v1 — fuente: ${seed.config?.source || 'Excel'} (${seed.config?.updateDate || ''})`);
    }
  }

  // Cotización de dólar inicial (respaldo del Excel = 1500)
  const rateCount = db.prepare('SELECT COUNT(*) c FROM exchange_rates').get().c;
  if (rateCount === 0) {
    const backup = Number(getSetting('dollarBackup')) || 1500;
    db.prepare('INSERT INTO exchange_rates(id,value,buy,sell,source,type,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(uuid(), backup, null, backup, 'Respaldo inicial (Excel)', 'oficial_venta', now);
  }
}

export function initDb() {
  initSchema();
  seedIfEmpty();
}

export function audit(userId, action, entity, entityId, oldValue, newValue) {
  db.prepare('INSERT INTO audit_log(id,user_id,action,entity,entity_id,old_value,new_value,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(uuid(), userId || null, action, entity || null, entityId || null,
      oldValue != null ? JSON.stringify(oldValue) : null,
      newValue != null ? JSON.stringify(newValue) : null,
      new Date().toISOString());
}
