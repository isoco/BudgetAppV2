CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email        TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name         TEXT NOT NULL,
  currency     CHAR(3) NOT NULL DEFAULT 'USD',
  avatar_url   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Refresh Tokens ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Categories ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id   UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = system
  name      TEXT NOT NULL,
  icon      TEXT NOT NULL DEFAULT 'circle',
  color     TEXT NOT NULL DEFAULT '#6366f1',
  type      TEXT NOT NULL CHECK (type IN ('income', 'expense', 'both')),
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Transactions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id  UUID REFERENCES categories(id) ON DELETE SET NULL,
  amount       DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  type         TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  date         DATE NOT NULL,
  note         TEXT,
  merchant     TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_id UUID,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_user_cat  ON transactions(user_id, category_id);
CREATE INDEX IF NOT EXISTS idx_tx_recurring ON transactions(recurring_id) WHERE recurring_id IS NOT NULL;

-- ─── Budgets (monthly per category) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount      DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  month       SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year        SMALLINT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, category_id, month, year)
);

-- ─── Savings Goals ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goals (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  icon           TEXT DEFAULT 'target',
  color          TEXT DEFAULT '#10b981',
  target_amount  DECIMAL(12,2) NOT NULL CHECK (target_amount > 0),
  current_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  deadline       DATE,
  is_completed   BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Subscriptions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  amount        DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('weekly', 'monthly', 'yearly')),
  next_due      DATE NOT NULL,
  category_id   UUID REFERENCES categories(id) ON DELETE SET NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Seed System Categories ──────────────────────────────────────────────────
INSERT INTO categories (user_id, name, icon, color, type, is_system) VALUES
  (NULL, 'Food & Dining',    'utensils',       '#f59e0b', 'expense', TRUE),
  (NULL, 'Transport',        'car',             '#3b82f6', 'expense', TRUE),
  (NULL, 'Shopping',         'shopping-bag',    '#ec4899', 'expense', TRUE),
  (NULL, 'Bills & Utilities','zap',             '#8b5cf6', 'expense', TRUE),
  (NULL, 'Health',           'heart',           '#ef4444', 'expense', TRUE),
  (NULL, 'Entertainment',    'tv',              '#06b6d4', 'expense', TRUE),
  (NULL, 'Travel',           'plane',           '#f97316', 'expense', TRUE),
  (NULL, 'Education',        'book',            '#84cc16', 'expense', TRUE),
  (NULL, 'Salary',           'briefcase',       '#10b981', 'income',  TRUE),
  (NULL, 'Freelance',        'laptop',          '#14b8a6', 'income',  TRUE),
  (NULL, 'Investment',       'trending-up',     '#6366f1', 'income',  TRUE),
  (NULL, 'Other',            'more-horizontal', '#94a3b8', 'both',    TRUE)
ON CONFLICT DO NOTHING;
