import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('budget.db');
  await _db.execAsync('PRAGMA journal_mode = WAL;');
  await initSchema(_db);
  return _db;
}

// ─── Versioned migrations ─────────────────────────────────────────────────────
// Each entry is applied exactly once, in order, tracked by PRAGMA user_version.
// To add a new migration: append to this array. Never edit existing entries.
const MIGRATIONS: string[] = [
  // v1 — baseline tables
  `CREATE TABLE IF NOT EXISTS categories (
    id    TEXT PRIMARY KEY,
    name  TEXT NOT NULL,
    icon  TEXT NOT NULL DEFAULT 'circle',
    color TEXT NOT NULL DEFAULT '#6366f1',
    type  TEXT NOT NULL CHECK (type IN ('income','expense','both')),
    is_system INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id           TEXT PRIMARY KEY,
    category_id  TEXT REFERENCES categories(id),
    amount       REAL NOT NULL CHECK (amount > 0),
    type         TEXT NOT NULL CHECK (type IN ('income','expense','transfer')),
    date         TEXT NOT NULL,
    note         TEXT,
    merchant     TEXT,
    is_recurring INTEGER DEFAULT 0,
    created_at   TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_tx_cat  ON transactions(category_id)`,
  `CREATE TABLE IF NOT EXISTS daily_spends (
    id         TEXT PRIMARY KEY,
    date       TEXT NOT NULL,
    amount     REAL NOT NULL CHECK (amount > 0),
    note       TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ds_date ON daily_spends(date DESC)`,
  `CREATE TABLE IF NOT EXISTS budgets (
    id          TEXT PRIMARY KEY,
    category_id TEXT NOT NULL REFERENCES categories(id),
    amount      REAL NOT NULL CHECK (amount > 0),
    month       INTEGER NOT NULL,
    year        INTEGER NOT NULL,
    UNIQUE(category_id, month, year)
  )`,
  `CREATE TABLE IF NOT EXISTS goals (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    icon           TEXT DEFAULT '🎯',
    color          TEXT DEFAULT '#10b981',
    target_amount  REAL NOT NULL CHECK (target_amount > 0),
    current_amount REAL NOT NULL DEFAULT 0,
    deadline       TEXT,
    is_completed   INTEGER DEFAULT 0,
    created_at     TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    amount        REAL NOT NULL,
    billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('weekly','monthly','yearly')),
    next_due      TEXT NOT NULL,
    category_id   TEXT REFERENCES categories(id),
    is_active     INTEGER DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS month_balances (
    id                   TEXT PRIMARY KEY,
    month                INTEGER NOT NULL,
    year                 INTEGER NOT NULL,
    opening_balance      REAL NOT NULL DEFAULT 0,
    savings_contribution REAL NOT NULL DEFAULT 0,
    UNIQUE(month, year)
  )`,
  `CREATE TABLE IF NOT EXISTS daily_tracking (
    id             TEXT PRIMARY KEY,
    year           INTEGER NOT NULL,
    month          INTEGER NOT NULL,
    day            INTEGER NOT NULL,
    allowed_amount REAL DEFAULT 30,
    spent_amount   REAL DEFAULT 0,
    notes          TEXT,
    UNIQUE(year, month, day)
  )`,
  `CREATE TABLE IF NOT EXISTS fuel_entries (
    id              TEXT PRIMARY KEY,
    year            INTEGER NOT NULL,
    month           INTEGER NOT NULL,
    date            TEXT NOT NULL,
    vehicle         TEXT DEFAULT 'Car',
    amount          REAL NOT NULL,
    liters          REAL,
    price_per_liter REAL,
    notes           TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
  )`,
  // v2 — new columns
  `ALTER TABLE categories ADD COLUMN is_active INTEGER DEFAULT 1`,
  `ALTER TABLE categories ADD COLUMN is_recurring INTEGER DEFAULT 0`,
  `ALTER TABLE categories ADD COLUMN default_amount REAL DEFAULT 0`,
  `ALTER TABLE categories ADD COLUMN due_day INTEGER`,
  `ALTER TABLE transactions ADD COLUMN paid_date TEXT`,
  `ALTER TABLE transactions ADD COLUMN manually_unchecked INTEGER DEFAULT 0`,
  `ALTER TABLE fuel_entries ADD COLUMN transaction_id TEXT`,
  `ALTER TABLE daily_spends ADD COLUMN transaction_id TEXT`,
  // ↑ Add new migrations above this line. Never remove or reorder existing ones.
];

async function initSchema(db: SQLite.SQLiteDatabase) {
  const versionRows = await db.getAllAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = versionRows[0]?.user_version ?? 0;

  if (currentVersion < MIGRATIONS.length) {
    await db.withTransactionAsync(async () => {
      for (let i = currentVersion; i < MIGRATIONS.length; i++) {
        try {
          await db.execAsync(MIGRATIONS[i]);
        } catch (e: any) {
          // Safe to ignore: table already exists or column already exists.
          // Android SQLite: "table X already has a column named Y"
          // Other SQLite:   "duplicate column name: Y"
          const msg: string = e?.message ?? '';
          if (!msg.includes('duplicate column') && !msg.includes('already has a column')) {
            console.error(`Migration ${i + 1} failed: ${msg}`);
            throw e;
          }
        }
      }
      await db.execAsync(`PRAGMA user_version = ${MIGRATIONS.length}`);
    });
  }

  await seedCategories(db);
}

async function seedCategories(db: SQLite.SQLiteDatabase) {
  const rows = await db.getAllAsync<{ count: number }>('SELECT COUNT(*) as count FROM categories');
  if (rows[0].count > 0) return;

  const cats = [
    { id: 'c1',  name: 'Food & Dining',     icon: 'restaurant',      color: '#f59e0b', type: 'expense' },
    { id: 'c2',  name: 'Transport',          icon: 'car',             color: '#3b82f6', type: 'expense' },
    { id: 'c3',  name: 'Shopping',           icon: 'bag-handle',      color: '#ec4899', type: 'expense' },
    { id: 'c4',  name: 'Bills & Utilities',  icon: 'flash',           color: '#8b5cf6', type: 'expense' },
    { id: 'c5',  name: 'Health',             icon: 'heart',           color: '#ef4444', type: 'expense' },
    { id: 'c6',  name: 'Entertainment',      icon: 'tv',              color: '#06b6d4', type: 'expense' },
    { id: 'c7',  name: 'Travel',             icon: 'airplane',        color: '#f97316', type: 'expense' },
    { id: 'c8',  name: 'Education',          icon: 'book',            color: '#84cc16', type: 'expense' },
    { id: 'c9',  name: 'Salary',             icon: 'briefcase',       color: '#10b981', type: 'income'  },
    { id: 'c10', name: 'Freelance',          icon: 'laptop',          color: '#14b8a6', type: 'income'  },
    { id: 'c11', name: 'Investment',         icon: 'trending-up',     color: '#6366f1', type: 'income'  },
    { id: 'c12', name: 'Other',              icon: 'ellipsis-horizontal', color: '#94a3b8', type: 'both' },
    { id: 'c13', name: 'Emergency Fund',     icon: 'shield',          color: '#ef4444', type: 'expense' },
    { id: 'c14', name: 'Vacation Fund',      icon: 'airplane',        color: '#f97316', type: 'expense' },
    { id: 'c15', name: 'Investments',        icon: 'trending-up',     color: '#6366f1', type: 'income'  },
  ];

  for (const c of cats) {
    await db.runAsync(
      'INSERT OR IGNORE INTO categories (id, name, icon, color, type, is_system) VALUES (?,?,?,?,?,1)',
      [c.id, c.name, c.icon, c.color, c.type]
    );
  }
}
