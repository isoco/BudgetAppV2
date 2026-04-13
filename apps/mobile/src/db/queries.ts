/**
 * All SQLite query functions.
 */
import { getDb } from './index';

// Works on native and web (no crypto.getRandomValues dependency)
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Category {
  id: string; name: string; icon: string; color: string;
  type: 'income' | 'expense' | 'both';
  is_system: number; is_active: number;
  is_recurring: number; default_amount: number; due_day: number | null;
}

export interface Transaction {
  id: string; category_id: string | null; amount: number;
  type: 'income' | 'expense' | 'transfer'; date: string;
  note: string | null; merchant: string | null;
  is_recurring: number; created_at: string; paid_date: string | null;
  category_name?: string; category_icon?: string; category_color?: string;
}

export interface Budget {
  id: string; category_id: string; amount: number; month: number; year: number;
  category_name?: string; category_icon?: string; category_color?: string;
  spent?: number; remaining?: number; pct?: number;
}

export interface Goal {
  id: string; name: string; icon: string; color: string;
  target_amount: number; current_amount: number;
  deadline: string | null; is_completed: number; created_at: string;
  pct?: number;
}

export interface Subscription {
  id: string; name: string; amount: number;
  billing_cycle: 'weekly' | 'monthly' | 'yearly';
  next_due: string; category_id: string | null; is_active: number;
  category_name?: string; category_color?: string;
}

export interface DailyEntry {
  id: string; year: number; month: number; day: number;
  allowed_amount: number; spent_amount: number; notes: string | null;
}

export interface FuelEntry {
  id: string; year: number; month: number; date: string;
  vehicle: string; amount: number; liters: number | null;
  price_per_liter: number | null; notes: string | null; created_at: string;
}

export interface UpcomingItem {
  category_id: string; name: string; icon: string; color: string;
  due_day: number; default_amount: number; due_date: string; is_overdue: boolean;
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function getCategories(opts?: { includeInactive?: boolean; type?: string }): Promise<Category[]> {
  const db = await getDb();
  const conditions: string[] = [];
  if (!opts?.includeInactive) conditions.push('(c.is_active = 1 OR c.is_system = 1)');
  if (opts?.type && opts.type !== 'both') conditions.push(`c.type IN ('${opts.type}','both')`);
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  return db.getAllAsync<Category>(`SELECT * FROM categories c ${where} ORDER BY c.is_system DESC, c.name`);
}

export async function createCategory(data: Omit<Category, 'id' | 'is_system' | 'is_active'>): Promise<Category> {
  const db = await getDb();
  const id = uuid();
  await db.runAsync(
    'INSERT INTO categories (id, name, icon, color, type, is_system, is_active, is_recurring, default_amount, due_day) VALUES (?,?,?,?,?,0,1,?,?,?)',
    [id, data.name, data.icon, data.color, data.type, data.is_recurring ?? 0, data.default_amount ?? 0, data.due_day ?? null]
  );
  return { id, ...data, is_system: 0, is_active: 1 };
}

export async function updateCategory(id: string, data: Partial<Pick<Category, 'name' | 'icon' | 'color' | 'type' | 'is_recurring' | 'default_amount' | 'due_day'>>): Promise<void> {
  const db = await getDb();
  const keys = Object.keys(data) as (keyof typeof data)[];
  if (!keys.length) return;
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => data[k] ?? null);
  await db.runAsync(`UPDATE categories SET ${sets} WHERE id = ?`, [...values, id]);
}

export async function toggleCategoryActive(id: string, is_active: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE categories SET is_active = ? WHERE id = ?', [is_active, id]);
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM categories WHERE id = ? AND is_system = 0', [id]);
}

// ─── Transactions ─────────────────────────────────────────────────────────────

const TX_SELECT = `
  SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
  FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
`;

export async function getTransactions(opts?: {
  from?: string; to?: string; type?: string; limit?: number; offset?: number;
}): Promise<Transaction[]> {
  const db = await getDb();
  const { from, to, type, limit = 50, offset = 0 } = opts ?? {};
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (from)  { where.push('t.date >= ?'); params.push(from); }
  if (to)    { where.push('t.date <= ?'); params.push(to); }
  if (type)  { where.push('t.type = ?'); params.push(type); }
  const sql = `${TX_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY t.date DESC, t.created_at DESC LIMIT ? OFFSET ?`;
  return db.getAllAsync<Transaction>(sql, [...params, limit, offset]);
}

export async function createTransaction(data: {
  amount: number; type: string; date: string;
  category_id?: string | null; note?: string | null; merchant?: string | null;
}): Promise<Transaction> {
  const db = await getDb();
  const id = uuid();
  await db.runAsync(
    'INSERT INTO transactions (id, amount, type, date, category_id, note, merchant) VALUES (?,?,?,?,?,?,?)',
    [id, data.amount, data.type, data.date, data.category_id ?? null, data.note ?? null, data.merchant ?? null]
  );
  const rows = await db.getAllAsync<Transaction>(`${TX_SELECT} WHERE t.id = ?`, [id]);
  return rows[0];
}

export async function updateTransaction(id: string, data: Partial<Pick<Transaction, 'amount' | 'type' | 'date' | 'category_id' | 'note' | 'merchant'>>): Promise<void> {
  const db = await getDb();
  const keys = Object.keys(data) as (keyof typeof data)[];
  if (!keys.length) return;
  const sets   = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => data[k] ?? null);
  await db.runAsync(`UPDATE transactions SET ${sets} WHERE id = ?`, [...values, id]);
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
}

export async function markTransactionPaid(id: string, paid_date: string | null): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE transactions SET paid_date = ? WHERE id = ?', [paid_date, id]);
}

export async function getMonthlySummary(): Promise<{ month: string; income: number; expense: number }[]> {
  const db = await getDb();
  return db.getAllAsync(`
    SELECT
      strftime('%Y-%m', date) AS month,
      SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS income,
      SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expense
    FROM transactions
    WHERE date >= date('now', '-6 months')
    GROUP BY month ORDER BY month
  `);
}

// ─── Budgets ──────────────────────────────────────────────────────────────────

export async function getBudgets(month: number, year: number): Promise<Budget[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Budget & { spent: number }>(`
    SELECT
      b.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
      COALESCE((
        SELECT SUM(t.amount) FROM transactions t
        WHERE t.category_id = b.category_id AND t.type = 'expense'
          AND strftime('%m', t.date) = printf('%02d', b.month)
          AND strftime('%Y', t.date) = CAST(b.year AS TEXT)
      ), 0) AS spent
    FROM budgets b JOIN categories c ON c.id = b.category_id
    WHERE b.month = ? AND b.year = ?
    ORDER BY c.name
  `, [month, year]);
  return rows.map(b => ({
    ...b,
    remaining: b.amount - b.spent,
    pct: Math.min(100, Math.round((b.spent / b.amount) * 100)),
  }));
}

export async function upsertBudget(data: { category_id: string; amount: number; month: number; year: number }): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO budgets (id, category_id, amount, month, year) VALUES (?,?,?,?,?)
     ON CONFLICT(category_id, month, year) DO UPDATE SET amount = excluded.amount`,
    [uuid(), data.category_id, data.amount, data.month, data.year]
  );
}

export async function deleteBudget(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM budgets WHERE id = ?', [id]);
}

// ─── Goals ───────────────────────────────────────────────────────────────────

export async function getGoals(): Promise<Goal[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Goal>('SELECT * FROM goals ORDER BY is_completed, created_at DESC');
  return rows.map(g => ({
    ...g,
    pct: Math.min(100, Math.round((g.current_amount / g.target_amount) * 100)),
  }));
}

export async function createGoal(data: { name: string; icon: string; color: string; target_amount: number; deadline?: string | null }): Promise<Goal> {
  const db = await getDb();
  const id = uuid();
  await db.runAsync(
    'INSERT INTO goals (id, name, icon, color, target_amount, deadline) VALUES (?,?,?,?,?,?)',
    [id, data.name, data.icon, data.color, data.target_amount, data.deadline ?? null]
  );
  const rows = await db.getAllAsync<Goal>('SELECT * FROM goals WHERE id = ?', [id]);
  return { ...rows[0], pct: 0 };
}

export async function depositToGoal(id: string, amount: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE goals
     SET current_amount = MIN(target_amount, current_amount + ?),
         is_completed   = CASE WHEN current_amount + ? >= target_amount THEN 1 ELSE 0 END
     WHERE id = ?`,
    [amount, amount, id]
  );
}

export async function deleteGoal(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM goals WHERE id = ?', [id]);
}

// ─── Upcoming Bills / Income ──────────────────────────────────────────────────

export async function getUpcomingBills(): Promise<UpcomingItem[]> {
  return _getUpcoming('expense');
}

export async function getUpcomingIncome(): Promise<UpcomingItem[]> {
  return _getUpcoming('income');
}

async function _getUpcoming(type: 'income' | 'expense'): Promise<UpcomingItem[]> {
  const db  = await getDb();
  const now = new Date();
  const y   = now.getFullYear();
  const m   = now.getMonth() + 1;
  const today = now.getDate();
  const lookahead = type === 'expense' ? 7 : 14;

  const cats = await db.getAllAsync<Category>(
    `SELECT * FROM categories WHERE is_recurring = 1 AND (type = ? OR type = 'both') AND is_active = 1 AND due_day IS NOT NULL`,
    [type]
  );

  const result: UpcomingItem[] = [];
  for (const cat of cats) {
    if (!cat.due_day) continue;
    const dueDay = cat.due_day;
    const daysInMonth = new Date(y, m, 0).getDate();
    const effectiveDueDay = Math.min(dueDay, daysInMonth);
    const daysUntilDue = effectiveDueDay - today;
    const is_overdue = daysUntilDue < 0;

    if (daysUntilDue > lookahead) continue;

    const dueDate = `${y}-€{String(m).padStart(2,'0')}-€{String(effectiveDueDay).padStart(2,'0')}`;

    // Check if already has a transaction this month
    const existing = await db.getAllAsync<{count:number}>(
      `SELECT COUNT(*) as count FROM transactions WHERE category_id = ? AND strftime('%Y-%m', date) = ? AND type = ?`,
      [cat.id, `${y}-€{String(m).padStart(2,'0')}`, type]
    );
    if (existing[0].count > 0) continue;

    result.push({
      category_id: cat.id,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      due_day: dueDay,
      default_amount: cat.default_amount,
      due_date: dueDate,
      is_overdue,
    });
  }
  return result.sort((a, b) => a.due_date.localeCompare(b.due_date));
}

// ─── Daily Tracking ───────────────────────────────────────────────────────────

export async function getDailyTracking(year: number, month: number): Promise<DailyEntry[]> {
  const db = await getDb();
  return db.getAllAsync<DailyEntry>(
    'SELECT * FROM daily_tracking WHERE year = ? AND month = ? ORDER BY day',
    [year, month]
  );
}

export async function initDailyTracking(year: number, month: number, defaultAllowed: number): Promise<void> {
  const db = await getDb();
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    await db.runAsync(
      `INSERT OR IGNORE INTO daily_tracking (id, year, month, day, allowed_amount, spent_amount) VALUES (?,?,?,?,?,0)`,
      [uuid(), year, month, day, defaultAllowed]
    );
  }
}

export async function upsertDailyEntry(data: {
  year: number; month: number; day: number;
  allowed_amount: number; spent_amount: number; notes?: string | null;
}): Promise<void> {
  const db = await getDb();
  const existing = await db.getAllAsync<DailyEntry>(
    'SELECT id FROM daily_tracking WHERE year=? AND month=? AND day=?',
    [data.year, data.month, data.day]
  );
  if (existing.length > 0) {
    await db.runAsync(
      'UPDATE daily_tracking SET allowed_amount=?, spent_amount=?, notes=? WHERE year=? AND month=? AND day=?',
      [data.allowed_amount, data.spent_amount, data.notes ?? null, data.year, data.month, data.day]
    );
  } else {
    await db.runAsync(
      'INSERT INTO daily_tracking (id, year, month, day, allowed_amount, spent_amount, notes) VALUES (?,?,?,?,?,?,?)',
      [uuid(), data.year, data.month, data.day, data.allowed_amount, data.spent_amount, data.notes ?? null]
    );
  }
}

// ─── Fuel Tracking ────────────────────────────────────────────────────────────

export async function getFuelEntries(year: number, month: number): Promise<FuelEntry[]> {
  const db = await getDb();
  return db.getAllAsync<FuelEntry>(
    'SELECT * FROM fuel_entries WHERE year=? AND month=? ORDER BY date DESC',
    [year, month]
  );
}

export async function createFuelEntry(data: {
  year: number; month: number; date: string; vehicle: string;
  amount: number; liters?: number | null; notes?: string | null;
}): Promise<void> {
  const db = await getDb();
  const price_per_liter = (data.liters && data.liters > 0) ? data.amount / data.liters : null;
  await db.runAsync(
    'INSERT INTO fuel_entries (id, year, month, date, vehicle, amount, liters, price_per_liter, notes) VALUES (?,?,?,?,?,?,?,?,?)',
    [uuid(), data.year, data.month, data.date, data.vehicle, data.amount, data.liters ?? null, price_per_liter, data.notes ?? null]
  );
}

export async function deleteFuelEntry(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM fuel_entries WHERE id = ?', [id]);
}

export async function getFuelMonthSummary(year: number, month: number): Promise<{ total: number; count: number }> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ total: number; count: number }>(
    'SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM fuel_entries WHERE year=? AND month=?',
    [year, month]
  );
  return rows[0] ?? { total: 0, count: 0 };
}

// ─── Year Overview ────────────────────────────────────────────────────────────

export async function getYearOverview(year: number): Promise<{
  month: number; label: string; income: number; expense: number; savings: number; balance: number;
}[]> {
  const db = await getDb();
  const result = [];
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-€{String(m).padStart(2,'0')}`;
    const [totals, mb] = await Promise.all([
      db.getAllAsync<any>(`
        SELECT
          COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) AS income,
          COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense
        FROM transactions WHERE strftime('%Y-%m', date) = ?`, [key]
      ),
      db.getAllAsync<any>('SELECT * FROM month_balances WHERE month=? AND year=?', [m, year]),
    ]);
    const income  = totals[0]?.income  ?? 0;
    const expense = totals[0]?.expense ?? 0;
    const savings = mb[0]?.savings_contribution ?? 0;
    const opening = mb[0]?.opening_balance ?? 0;
    result.push({
      month: m,
      label: monthNames[m - 1],
      income, expense, savings,
      balance: opening + income - savings - expense,
    });
  }
  return result;
}

// ─── End-of-Month Projection ──────────────────────────────────────────────────

export async function getEndOfMonthProjection(): Promise<{
  projected_income: number; projected_expense: number; projected_balance: number; days_left: number;
}> {
  const db  = await getDb();
  const now = new Date();
  const m   = now.getMonth() + 1;
  const y   = now.getFullYear();
  const daysInMonth = new Date(y, m, 0).getDate();
  const days_left   = Math.max(0, daysInMonth - now.getDate());
  const thisMonth   = `${y}-€{String(m).padStart(2,'0')}`;

  const [actuals, budgets, mb, settingsRows] = await Promise.all([
    db.getAllAsync<any>(`
      SELECT
        COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) AS income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense
      FROM transactions WHERE strftime('%Y-%m',date)=?`, [thisMonth]
    ),
    db.getAllAsync<any>(`SELECT SUM(amount) AS total FROM budgets WHERE month=? AND year=?`, [m, y]),
    db.getAllAsync<any>('SELECT * FROM month_balances WHERE month=? AND year=?', [m, y]),
    db.getAllAsync<any>('SELECT key, value FROM settings'),
  ]);

  const cfg: Record<string,number> = {};
  for (const r of settingsRows) cfg[r.key] = parseFloat(r.value) || 0;

  const opening          = mb[0]?.opening_balance ?? 0;
  const savingsTarget    = mb[0]?.savings_contribution ?? cfg.monthly_savings ?? 0;
  const projected_income = actuals[0]?.income ?? 0;
  const projected_expense = Math.max(actuals[0]?.expense ?? 0, budgets[0]?.total ?? 0);
  const projected_balance = opening + projected_income - savingsTarget - projected_expense;

  return { projected_income, projected_expense, projected_balance, days_left };
}

// ─── Auto-Populate Recurring ──────────────────────────────────────────────────

export async function autoPopulateRecurring(year: number, month: number): Promise<void> {
  const db = await getDb();
  const cats = await db.getAllAsync<Category>(
    `SELECT * FROM categories WHERE is_recurring = 1 AND is_active = 1 AND default_amount > 0`
  );
  const monthStr = `${year}-€{String(month).padStart(2,'0')}`;
  for (const cat of cats) {
    const existing = await db.getAllAsync<{count:number}>(
      `SELECT COUNT(*) as count FROM transactions WHERE category_id=? AND strftime('%Y-%m',date)=?`,
      [cat.id, monthStr]
    );
    if (existing[0].count > 0) continue;
    const daysInMonth = new Date(year, month, 0).getDate();
    const day = cat.due_day ? Math.min(cat.due_day, daysInMonth) : 1;
    const date = `${year}-€{String(month).padStart(2,'0')}-€{String(day).padStart(2,'0')}`;
    const txType = cat.type === 'income' ? 'income' : 'expense';
    await db.runAsync(
      'INSERT INTO transactions (id, amount, type, date, category_id, is_recurring) VALUES (?,?,?,?,?,1)',
      [uuid(), cat.default_amount, txType, date, cat.id]
    );
  }
}

// ─── Insights / Dashboard ─────────────────────────────────────────────────────

export async function getDashboardData() {
  const db  = await getDb();
  const now = new Date();
  const m   = now.getMonth() + 1;
  const y   = now.getFullYear();
  const thisMonth    = `${y}-€{String(m).padStart(2, '0')}`;
  const lastMonthDt  = new Date(y, m - 2, 1);
  const lastMonthStr = `${lastMonthDt.getFullYear()}-€{String(lastMonthDt.getMonth() + 1).padStart(2, '0')}`;

  const [totals, cats, recent, mbRows, settings] = await Promise.all([
    db.getAllAsync<any>(`
      SELECT
        SUM(CASE WHEN type='income'  AND strftime('%Y-%m',date)=? THEN amount ELSE 0 END) AS income_this,
        SUM(CASE WHEN type='expense' AND strftime('%Y-%m',date)=? THEN amount ELSE 0 END) AS expense_this,
        SUM(CASE WHEN type='income'  AND strftime('%Y-%m',date)=? THEN amount ELSE 0 END) AS income_last,
        SUM(CASE WHEN type='expense' AND strftime('%Y-%m',date)=? THEN amount ELSE 0 END) AS expense_last,
        SUM(CASE WHEN type='expense' AND date=date('now') THEN amount ELSE 0 END)         AS spent_today
      FROM transactions`,
      [thisMonth, thisMonth, lastMonthStr, lastMonthStr]
    ),
    db.getAllAsync<any>(`
      SELECT c.name, c.color, c.icon, SUM(t.amount) AS total
      FROM transactions t JOIN categories c ON c.id = t.category_id
      WHERE t.type='expense' AND strftime('%Y-%m', t.date) = ?
      GROUP BY c.id ORDER BY total DESC LIMIT 6`,
      [thisMonth]
    ),
    db.getAllAsync<Transaction>(`${TX_SELECT} ORDER BY t.date DESC, t.created_at DESC LIMIT 5`),
    db.getAllAsync<any>('SELECT * FROM month_balances WHERE month=? AND year=?', [m, y]),
    db.getAllAsync<any>('SELECT key, value FROM settings'),
  ]);

  const t           = totals[0];
  const incomeThis  = t.income_this   ?? 0;
  const expenseThis = t.expense_this  ?? 0;
  const incomeLast  = t.income_last   ?? 0;
  const expenseLast = t.expense_last  ?? 0;
  const spentToday  = t.spent_today   ?? 0;
  const daysInMonth = new Date(y, m, 0).getDate();
  const daysLeft    = Math.max(1, daysInMonth - now.getDate());

  const cfg: Record<string, number | string> = {};
  for (const row of settings) cfg[row.key] = row.value;

  const openingBalance = mbRows[0]?.opening_balance ?? 0;
  const savingsTarget  = mbRows[0]?.savings_contribution ?? parseFloat(cfg.monthly_savings as string || '0');
  const dailyLimit     = parseFloat(cfg.daily_limit as string || '0');
  const available      = openingBalance + incomeThis - savingsTarget - expenseThis;

  // Get previous month name for rollover label
  const prevMonthDate = new Date(y, m - 2, 1);
  const prevMonthName = prevMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return {
    balance:              incomeThis - expenseThis,
    available,
    opening_balance:      openingBalance,
    rollover_from_month:  prevMonthName,
    income:  { this_month: incomeThis,  last_month: incomeLast,  change_pct: pct(incomeThis, incomeLast)  },
    expense: { this_month: expenseThis, last_month: expenseLast, change_pct: pct(expenseThis, expenseLast) },
    savings: { target: savingsTarget, remaining: Math.max(0, savingsTarget - 0) },
    daily:   { limit: dailyLimit, spent: spentToday, remaining: Math.max(0, dailyLimit - spentToday) },
    safe_to_spend:        Math.max(0, Math.round((available / daysLeft) * 100) / 100),
    category_breakdown:   cats,
    recent_transactions:  recent,
  };
}

export async function getSmartTips(): Promise<string[]> {
  const db   = await getDb();
  const now  = new Date();
  const m    = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());

  const [budgets, topCat, daily] = await Promise.all([
    db.getAllAsync<any>(`
      SELECT b.amount,
        COALESCE((SELECT SUM(t.amount) FROM transactions t
          WHERE t.category_id=b.category_id AND t.type='expense'
          AND strftime('%m',t.date)=? AND strftime('%Y',t.date)=?),0) AS spent,
        c.name
      FROM budgets b JOIN categories c ON c.id=b.category_id
      WHERE b.month=? AND b.year=?`, [m, yyyy, now.getMonth() + 1, now.getFullYear()]
    ),
    db.getAllAsync<any>(`
      SELECT c.name, SUM(t.amount) AS total FROM transactions t
      JOIN categories c ON c.id=t.category_id
      WHERE t.type='expense' AND strftime('%Y-%m',t.date)=?
      GROUP BY c.name ORDER BY total DESC LIMIT 1`,
      [`${yyyy}-€{m}`]
    ),
    db.getAllAsync<any>(`
      SELECT SUM(amount)/MAX(1,CAST(strftime('%d','now') AS INTEGER)) AS avg
      FROM transactions WHERE type='expense' AND strftime('%Y-%m',date)=?`,
      [`${yyyy}-€{m}`]
    ),
  ]);

  const tips: string[] = [];
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();

  budgets.forEach((b: any) => {
    const ratio = b.spent / b.amount;
    if (ratio > 0.9) tips.push(`⚠️ ${b.name} budget ${Math.round(ratio * 100)}% used.`);
  });
  if (topCat[0]) tips.push(`📊 Top spend: ${topCat[0].name} (€${topCat[0].total.toFixed(0)})`);
  const avg = daily[0]?.avg ?? 0;
  tips.push(`📈 On pace to spend €${(avg * (now.getDate() + daysLeft)).toFixed(0)} this month.`);
  return tips;
}

function pct(a: number, b: number) {
  return b ? Math.round(((a - b) / b) * 100) : 0;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface AppSettings {
  daily_limit:      number;
  monthly_savings:  number;
  auto_rollover:    boolean;
  theme:            'dark' | 'light' | 'system';
}

export async function getSettings(): Promise<AppSettings> {
  const db   = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const map  = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    daily_limit:     parseFloat(map.daily_limit    || '0'),
    monthly_savings: parseFloat(map.monthly_savings || '0'),
    auto_rollover:   (map.auto_rollover || '1') === '1',
    theme:           (map.theme as any) || 'dark',
  };
}

export async function saveSettings(s: Partial<AppSettings>): Promise<void> {
  const db = await getDb();
  const entries: [string, string][] = [];
  if (s.daily_limit     !== undefined) entries.push(['daily_limit',     String(s.daily_limit)]);
  if (s.monthly_savings !== undefined) entries.push(['monthly_savings', String(s.monthly_savings)]);
  if (s.auto_rollover   !== undefined) entries.push(['auto_rollover',   s.auto_rollover ? '1' : '0']);
  if (s.theme           !== undefined) entries.push(['theme',           s.theme]);
  for (const [k, v] of entries) {
    await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)', [k, v]);
  }
}

// ─── Monthly Rollover ─────────────────────────────────────────────────────────

export interface MonthBalance {
  month: number; year: number;
  opening_balance: number; savings_contribution: number;
}

export async function getMonthBalance(month: number, year: number): Promise<MonthBalance> {
  const db   = await getDb();
  const rows = await db.getAllAsync<MonthBalance>(
    'SELECT * FROM month_balances WHERE month=? AND year=?', [month, year]
  );
  return rows[0] ?? { month, year, opening_balance: 0, savings_contribution: 0 };
}

export async function setMonthBalance(month: number, year: number, opening_balance: number, savings_contribution: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO month_balances (id, month, year, opening_balance, savings_contribution)
     VALUES (?,?,?,?,?)
     ON CONFLICT(month,year) DO UPDATE SET opening_balance=excluded.opening_balance, savings_contribution=excluded.savings_contribution`,
    [uuid(), month, year, opening_balance, savings_contribution]
  );
}

export async function rolloverFromPreviousMonth(): Promise<{ amount: number; fromMonth: string }> {
  const db  = await getDb();
  const now = new Date();
  const m   = now.getMonth() + 1;
  const y   = now.getFullYear();

  const existing = await db.getAllAsync<MonthBalance>(
    'SELECT * FROM month_balances WHERE month=? AND year=?', [m, y]
  );
  if (existing[0]?.opening_balance) {
    const prev = new Date(y, m - 2, 1);
    return {
      amount: existing[0].opening_balance,
      fromMonth: prev.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
  }

  const prev         = new Date(y, m - 2, 1);
  const prevM        = prev.getMonth() + 1;
  const prevY        = prev.getFullYear();
  const prevMonthStr = `${prevY}-€{String(prevM).padStart(2, '0')}`;

  const [prevTotals, prevMb, settingsRows] = await Promise.all([
    db.getAllAsync<any>(`
      SELECT
        COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS expense
      FROM transactions WHERE strftime('%Y-%m', date) = ?`,
      [prevMonthStr]
    ),
    db.getAllAsync<MonthBalance>('SELECT * FROM month_balances WHERE month=? AND year=?', [prevM, prevY]),
    db.getAllAsync<any>('SELECT key, value FROM settings'),
  ]);

  const cfg: Record<string, number> = {};
  for (const r of settingsRows) cfg[r.key] = parseFloat(r.value) || 0;

  const prevOpening = prevMb[0]?.opening_balance      ?? 0;
  const prevSavings = prevMb[0]?.savings_contribution ?? cfg.monthly_savings ?? 0;
  const prevIncome  = prevTotals[0]?.income  ?? 0;
  const prevExpense = prevTotals[0]?.expense ?? 0;
  const closing     = prevOpening + prevIncome - prevSavings - prevExpense;
  const rollover    = Math.max(0, closing);

  await setMonthBalance(m, y, rollover, cfg.monthly_savings ?? 0);
  return {
    amount: rollover,
    fromMonth: prev.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  };
}

export async function getMonthHistory(months = 12): Promise<{
  label: string; income: number; expense: number; savings: number;
  opening: number; closing: number;
}[]> {
  const db  = await getDb();
  const now = new Date();
  const result = [];

  for (let i = months - 1; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m   = d.getMonth() + 1;
    const y   = d.getFullYear();
    const key = `${y}-€{String(m).padStart(2, '0')}`;

    const [totals, mb] = await Promise.all([
      db.getAllAsync<any>(`
        SELECT
          COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END),0) AS income,
          COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense
        FROM transactions WHERE strftime('%Y-%m', date) = ?`, [key]
      ),
      db.getAllAsync<MonthBalance>('SELECT * FROM month_balances WHERE month=? AND year=?', [m, y]),
    ]);

    const opening = mb[0]?.opening_balance      ?? 0;
    const savings = mb[0]?.savings_contribution ?? 0;
    const income  = totals[0]?.income  ?? 0;
    const expense = totals[0]?.expense ?? 0;

    result.push({
      label:   d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      income, expense, savings,
      opening,
      closing: opening + income - savings - expense,
    });
  }
  return result;
}

// ─── Export / Import ──────────────────────────────────────────────────────────

export async function exportAllData(): Promise<string> {
  const db = await getDb();
  const [categories, transactions, budgets, goals, settings, month_balances, daily_tracking, fuel_entries, daily_spends] = await Promise.all([
    db.getAllAsync('SELECT * FROM categories'),
    db.getAllAsync('SELECT * FROM transactions'),
    db.getAllAsync('SELECT * FROM budgets'),
    db.getAllAsync('SELECT * FROM goals'),
    db.getAllAsync('SELECT * FROM settings'),
    db.getAllAsync('SELECT * FROM month_balances'),
    db.getAllAsync('SELECT * FROM daily_tracking'),
    db.getAllAsync('SELECT * FROM fuel_entries'),
    db.getAllAsync('SELECT * FROM daily_spends'),
  ]);
  return JSON.stringify({
    version: 2,
    exported_at: new Date().toISOString(),
    data: { categories, transactions, budgets, goals, settings, month_balances, daily_tracking, fuel_entries, daily_spends },
  }, null, 2);
}

// ─── Daily Spends ─────────────────────────────────────────────────────────────

export interface DailySpend {
  id: string; date: string; amount: number; note: string | null; created_at: string;
}

export async function getDailySpends(date: string): Promise<DailySpend[]> {
  const db = await getDb();
  return db.getAllAsync<DailySpend>(
    'SELECT * FROM daily_spends WHERE date = ? ORDER BY created_at DESC',
    [date]
  );
}

export async function getDailySpendTotal(date: string): Promise<number> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ total: number }>(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM daily_spends WHERE date = ?',
    [date]
  );
  return rows[0]?.total ?? 0;
}

export async function createDailySpend(data: { date: string; amount: number; note?: string | null }): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO daily_spends (id, date, amount, note) VALUES (?,?,?,?)',
    [uuid(), data.date, data.amount, data.note ?? null]
  );
}

export async function deleteDailySpend(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM daily_spends WHERE id = ?', [id]);
}

export async function getTodayTransactions(): Promise<Transaction[]> {
  const db = await getDb();
  const today = new Date().toISOString().split('T')[0];
  return db.getAllAsync<Transaction>(
    `${TX_SELECT} WHERE t.date = ? ORDER BY t.created_at DESC`,
    [today]
  );
}

export async function getMonthTransactionDetails(): Promise<{
  income: Transaction[]; expense: Transaction[];
  totalIncome: number; totalExpense: number;
}> {
  const db  = await getDb();
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const all = await db.getAllAsync<Transaction>(
    `${TX_SELECT} WHERE strftime('%Y-%m', t.date) = ? ORDER BY t.date DESC, t.created_at DESC`,
    [key]
  );
  const income  = all.filter(t => t.type === 'income');
  const expense = all.filter(t => t.type === 'expense');
  return {
    income,
    expense,
    totalIncome:  income.reduce((s, t) => s + t.amount, 0),
    totalExpense: expense.reduce((s, t) => s + t.amount, 0),
  };
}

export async function importAllData(json: string): Promise<void> {
  const db = await getDb();
  let parsed: any;
  try { parsed = JSON.parse(json); } catch { throw new Error('Invalid JSON'); }
  if (!parsed?.data) throw new Error('Invalid export format');
  const d = parsed.data;

  await db.execAsync('BEGIN TRANSACTION');
  try {
    // Clear non-system data
    await db.execAsync(`
      DELETE FROM transactions;
      DELETE FROM budgets;
      DELETE FROM goals;
      DELETE FROM month_balances;
      DELETE FROM daily_tracking;
      DELETE FROM fuel_entries;
      DELETE FROM categories WHERE is_system = 0;
    `);
    for (const r of (d.categories || [])) {
      if (r.is_system) continue; // skip system cats, already seeded
      await db.runAsync(
        'INSERT OR IGNORE INTO categories (id,name,icon,color,type,is_system,is_active,is_recurring,default_amount,due_day) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [r.id,r.name,r.icon,r.color,r.type,r.is_system??0,r.is_active??1,r.is_recurring??0,r.default_amount??0,r.due_day??null]
      );
    }
    for (const r of (d.transactions || [])) {
      await db.runAsync(
        'INSERT OR IGNORE INTO transactions (id,amount,type,date,category_id,note,merchant,is_recurring,paid_date,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [r.id,r.amount,r.type,r.date,r.category_id??null,r.note??null,r.merchant??null,r.is_recurring??0,r.paid_date??null,r.created_at??new Date().toISOString()]
      );
    }
    for (const r of (d.budgets || [])) {
      await db.runAsync('INSERT OR IGNORE INTO budgets (id,category_id,amount,month,year) VALUES (?,?,?,?,?)',
        [r.id,r.category_id,r.amount,r.month,r.year]);
    }
    for (const r of (d.goals || [])) {
      await db.runAsync(
        'INSERT OR IGNORE INTO goals (id,name,icon,color,target_amount,current_amount,deadline,is_completed,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        [r.id,r.name,r.icon,r.color,r.target_amount,r.current_amount??0,r.deadline??null,r.is_completed??0,r.created_at??new Date().toISOString()]
      );
    }
    for (const r of (d.settings || [])) {
      await db.runAsync('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', [r.key,r.value]);
    }
    for (const r of (d.month_balances || [])) {
      await db.runAsync(
        'INSERT OR IGNORE INTO month_balances (id,month,year,opening_balance,savings_contribution) VALUES (?,?,?,?,?)',
        [r.id,r.month,r.year,r.opening_balance??0,r.savings_contribution??0]
      );
    }
    for (const r of (d.daily_tracking || [])) {
      await db.runAsync(
        'INSERT OR IGNORE INTO daily_tracking (id,year,month,day,allowed_amount,spent_amount,notes) VALUES (?,?,?,?,?,?,?)',
        [r.id,r.year,r.month,r.day,r.allowed_amount??30,r.spent_amount??0,r.notes??null]
      );
    }
    for (const r of (d.fuel_entries || [])) {
      await db.runAsync(
        'INSERT OR IGNORE INTO fuel_entries (id,year,month,date,vehicle,amount,liters,price_per_liter,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [r.id,r.year,r.month,r.date,r.vehicle??'Car',r.amount,r.liters??null,r.price_per_liter??null,r.notes??null,r.created_at??new Date().toISOString()]
      );
    }
    await db.execAsync('COMMIT');
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}
