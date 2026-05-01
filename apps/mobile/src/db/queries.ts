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
  manually_unchecked: number;
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
  const params: string[] = [];
  if (!opts?.includeInactive) conditions.push('(c.is_active = 1 OR c.is_system = 1)');
  if (opts?.type && opts.type !== 'both') {
    conditions.push(`c.type IN (?, 'both')`);
    params.push(opts.type);
  }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  return db.getAllAsync<Category>(`SELECT * FROM categories c ${where} ORDER BY c.is_system DESC, c.name`, params);
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

export async function deleteAllRecurringByCategory(categoryId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM transactions WHERE category_id = ? AND is_recurring = 1', [categoryId]);
  // Prevent autoPopulateRecurring from re-creating these transactions
  await db.runAsync('UPDATE categories SET is_recurring = 0, default_amount = 0 WHERE id = ?', [categoryId]);
}

export async function getTransactionById(id: string): Promise<Transaction | null> {
  const db = await getDb();
  const rows = await db.getAllAsync<Transaction>(`${TX_SELECT} WHERE t.id = ?`, [id]);
  return rows[0] ?? null;
}

export async function deleteRecurringFuture(categoryId: string, fromDate: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'DELETE FROM transactions WHERE category_id = ? AND is_recurring = 1 AND date >= ?',
    [categoryId, fromDate]
  );
}

export async function deleteRecurringPast(categoryId: string, toDate: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'DELETE FROM transactions WHERE category_id = ? AND is_recurring = 1 AND date <= ?',
    [categoryId, toDate]
  );
}

export async function updateTransactionAndFuture(
  categoryId: string, fromDate: string,
  data: Partial<Pick<Transaction, 'amount' | 'note' | 'merchant'>>
): Promise<void> {
  const db = await getDb();
  const keys = Object.keys(data) as (keyof typeof data)[];
  if (!keys.length) return;
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => data[k] ?? null);
  await db.runAsync(
    `UPDATE transactions SET ${sets} WHERE category_id = ? AND is_recurring = 1 AND date >= ?`,
    [...values, categoryId, fromDate]
  );
  if (data.amount !== undefined) {
    await db.runAsync('UPDATE categories SET default_amount = ? WHERE id = ?', [data.amount, categoryId]);
  }
}

export async function markTransactionPaid(id: string, paid_date: string | null): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE transactions SET paid_date = ?, manually_unchecked = 0 WHERE id = ?', [paid_date, id]);
}

export async function markTransactionUnchecked(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE transactions SET paid_date = NULL, manually_unchecked = 1 WHERE id = ?', [id]);
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

    const dueDate = `${y}-${String(m).padStart(2,'0')}-${String(effectiveDueDay).padStart(2,'0')}`;

    // Check if already has a recurring transaction this month
    const existing = await db.getAllAsync<{count:number}>(
      `SELECT COUNT(*) as count FROM transactions WHERE category_id = ? AND strftime('%Y-%m', date) = ? AND type = ? AND is_recurring = 1`,
      [cat.id, `${y}-${String(m).padStart(2,'0')}`, type]
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
  const txId = uuid();
  const txNote = `Fuel${data.vehicle !== 'Car' ? ` - ${data.vehicle}` : ''}${data.notes ? ` (${data.notes})` : ''}`;
  await db.runAsync(
    'INSERT INTO transactions (id, amount, type, date, category_id, note) VALUES (?,?,?,?,?,?)',
    [txId, data.amount, 'expense', data.date, 'c2', txNote]
  );
  await db.runAsync(
    'INSERT INTO fuel_entries (id, year, month, date, vehicle, amount, liters, price_per_liter, notes, transaction_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [uuid(), data.year, data.month, data.date, data.vehicle, data.amount, data.liters ?? null, price_per_liter, data.notes ?? null, txId]
  );
}

export async function deleteFuelEntry(id: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ transaction_id: string | null }>(
    'SELECT transaction_id FROM fuel_entries WHERE id = ?', [id]
  );
  const txId = rows[0]?.transaction_id;
  if (txId) await db.runAsync('DELETE FROM transactions WHERE id = ?', [txId]);
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
    const key = `${year}-${String(m).padStart(2,'0')}`;
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
      balance: opening + income - expense,
    });
  }
  return result;
}

// ─── Savings History ─────────────────────────────────────────────────────────

export interface SavingsMonth {
  month: number; year: number; label: string;
  savings: number; cumulative: number;
}

export async function getSavingsHistory(): Promise<{ months: SavingsMonth[]; total: number }> {
  const db  = await getDb();
  const now = new Date();
  // Go back up to 24 months, stop at first month with no data
  const rows = await db.getAllAsync<{ month: number; year: number; savings_contribution: number }>(
    `SELECT month, year, savings_contribution FROM month_balances
     WHERE savings_contribution > 0
     ORDER BY year ASC, month ASC`
  );

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let cumulative = 0;
  const months: SavingsMonth[] = rows.map(r => {
    cumulative += r.savings_contribution;
    return {
      month: r.month, year: r.year,
      label: `${monthNames[r.month - 1]} ${r.year}`,
      savings: r.savings_contribution,
      cumulative,
    };
  });

  return { months: months.reverse(), total: cumulative };
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
  const thisMonth   = `${y}-${String(m).padStart(2,'0')}`;

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
  const projected_balance = opening + projected_income - projected_expense;

  return { projected_income, projected_expense, projected_balance, savings_target: savingsTarget, days_left };
}

// ─── Auto-Populate Recurring ──────────────────────────────────────────────────

export async function autoPopulateRecurring(year: number, month: number): Promise<void> {
  const db = await getDb();
  const monthStr = `${year}-${String(month).padStart(2,'0')}`;
  const daysInMonth = new Date(year, month, 0).getDate();

  // Pass 1: categories explicitly configured as recurring
  const cats = await db.getAllAsync<Category>(
    `SELECT * FROM categories WHERE is_recurring = 1 AND is_active = 1 AND default_amount > 0`
  );
  for (const cat of cats) {
    const txType = cat.type === 'income' ? 'income' : 'expense';
    const existing = await db.getAllAsync<{count:number}>(
      `SELECT COUNT(*) as count FROM transactions WHERE category_id=? AND strftime('%Y-%m',date)=? AND type=? AND is_recurring=1`,
      [cat.id, monthStr, txType]
    );
    if (existing[0].count > 0) continue;
    const day = cat.due_day ? Math.min(cat.due_day, daysInMonth) : 1;
    const date = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    await db.runAsync(
      'INSERT INTO transactions (id, amount, type, date, category_id, is_recurring) VALUES (?,?,?,?,?,1)',
      [uuid(), cat.default_amount, txType, date, cat.id]
    );
  }

  // Pass 2: propagate recurring transactions that exist in any prior month
  // but whose category wasn't configured via the recurring toggle
  // (handles manually-created or imported recurring transactions)
  const templates = await db.getAllAsync<{
    category_id: string; amount: number; type: string; day: number;
  }>(`
    SELECT t.category_id,
           t.amount,
           t.type,
           CAST(strftime('%d', MAX(t.date)) AS INTEGER) AS day
    FROM transactions t
    WHERE t.is_recurring = 1
      AND t.type != 'transfer'
      AND t.category_id IS NOT NULL
      AND strftime('%Y-%m', t.date) < ?
    GROUP BY t.category_id, t.type
  `, [monthStr]);

  for (const tpl of templates) {
    const existing = await db.getAllAsync<{count:number}>(
      `SELECT COUNT(*) as count FROM transactions WHERE category_id=? AND strftime('%Y-%m',date)=? AND type=? AND is_recurring=1`,
      [tpl.category_id, monthStr, tpl.type]
    );
    if (existing[0].count > 0) continue;
    const day = Math.min(tpl.day, daysInMonth);
    const date = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    await db.runAsync(
      'INSERT INTO transactions (id, amount, type, date, category_id, is_recurring) VALUES (?,?,?,?,?,1)',
      [uuid(), tpl.amount, tpl.type, date, tpl.category_id]
    );
  }
}

/**
 * Deletes all auto-populated recurring transactions for all months >= current month,
 * then re-populates them with current category settings.
 * Call this whenever a recurring category is created or updated.
 */
export async function refreshRecurringAllFutureMonths(futureMonths = 13): Promise<void> {
  const db  = await getDb();
  const now = new Date();
  const m   = now.getMonth() + 1;
  const y   = now.getFullYear();

  const cats = await db.getAllAsync<Category>(
    `SELECT * FROM categories WHERE is_recurring = 1 AND is_active = 1 AND default_amount > 0`
  );

  for (let i = 0; i < futureMonths; i++) {
    const d       = new Date(y, m - 1 + i, 1);
    const month   = d.getMonth() + 1;
    const year    = d.getFullYear();
    const monthStr = `${year}-${String(month).padStart(2,'0')}`;

    for (const cat of cats) {
      const txType = cat.type === 'income' ? 'income' : 'expense';
      // Delete old auto-populated entry for this category+month
      await db.runAsync(
        `DELETE FROM transactions WHERE category_id=? AND strftime('%Y-%m',date)=? AND type=? AND is_recurring=1`,
        [cat.id, monthStr, txType]
      );
      // Re-insert with current values
      const daysInMonth = new Date(year, month, 0).getDate();
      const day  = cat.due_day ? Math.min(cat.due_day, daysInMonth) : 1;
      const date = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      await db.runAsync(
        'INSERT INTO transactions (id, amount, type, date, category_id, is_recurring) VALUES (?,?,?,?,?,1)',
        [uuid(), cat.default_amount, txType, date, cat.id]
      );
    }
  }
}

/**
 * Computes and stores the opening balance for any month by walking back
 * through previous months until it finds stored data or reaches the beginning.
 */
/**
 * Returns the opening_balance for a month from month_balances.
 * Call cascadeOpeningBalances() first to ensure the value is current.
 */
export async function computeMonthOpening(month: number, year: number): Promise<number> {
  const db = await getDb();
  const rows = await db.getAllAsync<MonthBalance>(
    'SELECT opening_balance FROM month_balances WHERE month=? AND year=?', [month, year]
  );
  return rows[0]?.opening_balance ?? 0;
}

/**
 * Recomputes opening_balance for ALL months from the earliest transaction to
 * (month + forwardMonths). Always starts from scratch so every carryover is correct
 * regardless of whether intermediate months were ever viewed.
 */
export async function cascadeOpeningBalances(month: number, year: number, forwardMonths = 15): Promise<void> {
  const db = await getDb();

  // Remove legacy "Last Month Balance" transfer transactions — they double-count carryover
  await db.runAsync(`DELETE FROM transactions WHERE note = 'Last Month Balance'`);

  // Find earliest month with any transaction data
  const earliest = await db.getAllAsync<{ ym: string | null }>(
    `SELECT strftime('%Y-%m', MIN(date)) AS ym FROM transactions`
  );
  const ymStr = earliest[0]?.ym;

  let startMonth: number;
  let startYear: number;
  if (ymStr) {
    const [ey, em] = ymStr.split('-').map(Number);
    // Start one month BEFORE earliest so that month gets opening=0
    const startDate = new Date(ey, em - 1, 1); // earliest date itself
    startMonth = startDate.getMonth() + 1;
    startYear  = startDate.getFullYear();
  } else {
    startMonth = month;
    startYear  = year;
  }

  // End month = (month, year) + forwardMonths
  const endDate  = new Date(year, month - 1 + forwardMonths, 1);
  const endMonth = endDate.getMonth() + 1;
  const endYear  = endDate.getFullYear();
  const totalSteps = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
  if (totalSteps <= 0) return;

  const settingsRows = await db.getAllAsync<any>('SELECT key, value FROM settings');
  const cfg: Record<string, number> = {};
  for (const r of settingsRows) cfg[r.key] = parseFloat(r.value) || 0;

  // Walk from earliest month forward, carrying the running balance
  let runningOpening = 0;

  for (let i = 0; i < totalSteps; i++) {
    const d = new Date(startYear, startMonth - 1 + i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    const key = `${y}-${String(m).padStart(2,'0')}`;

    // Persist opening for this month (keep existing savings_contribution)
    const currMb = await db.getAllAsync<MonthBalance>(
      'SELECT * FROM month_balances WHERE month=? AND year=?', [m, y]
    );
    const savings = currMb[0]?.savings_contribution ?? cfg.monthly_savings ?? 0;
    await db.runAsync(
      `INSERT INTO month_balances (id, month, year, opening_balance, savings_contribution)
       VALUES (?,?,?,?,?)
       ON CONFLICT(month,year) DO UPDATE SET opening_balance=excluded.opening_balance`,
      [uuid(), m, y, runningOpening, savings]
    );

    // Read this month's transactions to compute NEXT month's opening
    // Exclude legacy "Last Month Balance" transfer transactions to avoid double-counting
    const totals = await db.getAllAsync<any>(
      `SELECT COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END),0) AS income,
              COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense
       FROM transactions WHERE strftime('%Y-%m', date) = ? AND (note != 'Last Month Balance' OR note IS NULL)`, [key]
    );
    const income  = totals[0]?.income  ?? 0;
    const expense = totals[0]?.expense ?? 0;
    runningOpening = runningOpening + income - expense - savings;
  }
}

/**
 * Update only the savings_contribution for a month.
 */
export async function updateMonthlySavings(month: number, year: number, savings: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO month_balances (id, month, year, opening_balance, savings_contribution)
     VALUES (?,?,?,0,?)
     ON CONFLICT(month,year) DO UPDATE SET savings_contribution=excluded.savings_contribution`,
    [uuid(), month, year, savings]
  );
}

/**
 * Returns total savings accumulated across all months + this month's target.
 */
export async function getSavingsSummary(): Promise<{ total: number; this_month: number }> {
  const db   = await getDb();
  const now  = new Date();
  const m    = now.getMonth() + 1;
  const y    = now.getFullYear();
  const [totRow, mbRow, settingsRows] = await Promise.all([
    db.getAllAsync<{ total: number }>(
      'SELECT COALESCE(SUM(savings_contribution),0) AS total FROM month_balances'
    ),
    db.getAllAsync<MonthBalance>(
      'SELECT * FROM month_balances WHERE month=? AND year=?', [m, y]
    ),
    db.getAllAsync<any>('SELECT key, value FROM settings'),
  ]);
  const cfg: Record<string, number> = {};
  for (const r of settingsRows) cfg[r.key] = parseFloat(r.value) || 0;
  return {
    total:      totRow[0]?.total ?? 0,
    this_month: mbRow[0]?.savings_contribution ?? cfg.monthly_savings ?? 0,
  };
}

// ─── Insights / Dashboard ─────────────────────────────────────────────────────

export async function getDashboardData(opts?: { month?: number; year?: number }) {
  const db  = await getDb();
  const now = new Date();
  const m   = opts?.month ?? (now.getMonth() + 1);
  const y   = opts?.year  ?? now.getFullYear();
  const thisMonth    = `${y}-${String(m).padStart(2, '0')}`;
  const lastMonthDt  = new Date(y, m - 2, 1);
  const lastMonthStr = `${lastMonthDt.getFullYear()}-${String(lastMonthDt.getMonth() + 1).padStart(2, '0')}`;

  // Ensure opening balance is computed for requested month
  const openingBalance = await computeMonthOpening(m, y);

  const [totals, cats, recent, mbRows, settings, spendTodayRows] = await Promise.all([
    db.getAllAsync<any>(`
      SELECT
        SUM(CASE WHEN type='income'  AND strftime('%Y-%m',date)=? THEN amount ELSE 0 END) AS income_this,
        SUM(CASE WHEN type='expense' AND strftime('%Y-%m',date)=? THEN amount ELSE 0 END) AS expense_this,
        SUM(CASE WHEN type='income'  AND strftime('%Y-%m',date)=? THEN amount ELSE 0 END) AS income_last,
        SUM(CASE WHEN type='expense' AND strftime('%Y-%m',date)=? THEN amount ELSE 0 END) AS expense_last
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
    db.getAllAsync<Transaction>(`${TX_SELECT} WHERE strftime('%Y-%m', t.date) = ? ORDER BY t.date DESC, t.created_at DESC LIMIT 5`, [thisMonth]),
    db.getAllAsync<any>('SELECT * FROM month_balances WHERE month=? AND year=?', [m, y]),
    db.getAllAsync<any>('SELECT key, value FROM settings'),
    db.getAllAsync<{ total: number }>("SELECT COALESCE(SUM(amount),0) AS total FROM daily_spends WHERE date = date('now')"),
  ]);

  const t           = totals[0];
  const incomeThis  = t.income_this   ?? 0;
  const expenseThis = t.expense_this  ?? 0;
  const incomeLast  = t.income_last   ?? 0;
  const expenseLast = t.expense_last  ?? 0;
  const spentToday  = spendTodayRows[0]?.total ?? 0;
  const daysInMonth = new Date(y, m, 0).getDate();
  const isCurMonth  = y === now.getFullYear() && m === (now.getMonth() + 1);
  const daysLeft    = isCurMonth ? Math.max(1, daysInMonth - now.getDate()) : 1;

  const cfg: Record<string, number | string> = {};
  for (const row of settings) cfg[row.key] = row.value;

  const savingsTarget  = mbRows[0]?.savings_contribution ?? parseFloat(cfg.monthly_savings as string || '0');
  const dailyLimit     = parseFloat(cfg.daily_limit as string || '0');
  // Savings is separate — available = what's actually spendable (opening + income - expenses)
  const available      = openingBalance + incomeThis - expenseThis;

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
      [`${yyyy}-${m}`]
    ),
    db.getAllAsync<any>(`
      SELECT SUM(amount)/MAX(1,CAST(strftime('%d','now') AS INTEGER)) AS avg
      FROM transactions WHERE type='expense' AND strftime('%Y-%m',date)=?`,
      [`${yyyy}-${m}`]
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
  daily_limit:           number;
  monthly_savings:       number;
  auto_rollover:         boolean;
  theme:                 'dark' | 'light' | 'system';
  privacy_hide_income:   boolean;
  privacy_biometric:     boolean;
  privacy_hide_cats:     string; // comma-separated category IDs, or 'all'
}

export async function getSettings(): Promise<AppSettings> {
  const db   = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const map  = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    daily_limit:           parseFloat(map.daily_limit    || '0'),
    monthly_savings:       parseFloat(map.monthly_savings || '0'),
    auto_rollover:         (map.auto_rollover || '1') === '1',
    theme:                 (map.theme as any) || 'dark',
    privacy_hide_income:   (map.privacy_hide_income || '0') === '1',
    privacy_biometric:     (map.privacy_biometric   || '0') === '1',
    privacy_hide_cats:     map.privacy_hide_cats ?? 'all',
  };
}

export async function saveSettings(s: Partial<AppSettings>): Promise<void> {
  const db = await getDb();
  const entries: [string, string][] = [];
  if (s.daily_limit           !== undefined) entries.push(['daily_limit',           String(s.daily_limit)]);
  if (s.monthly_savings       !== undefined) entries.push(['monthly_savings',       String(s.monthly_savings)]);
  if (s.auto_rollover         !== undefined) entries.push(['auto_rollover',         s.auto_rollover ? '1' : '0']);
  if (s.theme                 !== undefined) entries.push(['theme',                 s.theme]);
  if (s.privacy_hide_income   !== undefined) entries.push(['privacy_hide_income',   s.privacy_hide_income ? '1' : '0']);
  if (s.privacy_biometric     !== undefined) entries.push(['privacy_biometric',     s.privacy_biometric ? '1' : '0']);
  if (s.privacy_hide_cats     !== undefined) entries.push(['privacy_hide_cats',     s.privacy_hide_cats]);
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
  const prevMonthStr = `${prevY}-${String(prevM).padStart(2, '0')}`;

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

  const cfg: Record<string, string> = {};
  for (const r of settingsRows) cfg[r.key] = r.value;

  if ((cfg.auto_rollover ?? '1') !== '1') {
    return { amount: 0, fromMonth: prev.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
  }

  const prevOpening = prevMb[0]?.opening_balance ?? 0;
  const prevIncome  = prevTotals[0]?.income  ?? 0;
  const prevExpense = prevTotals[0]?.expense ?? 0;
  const closing     = prevOpening + prevIncome - prevExpense;
  const rollover    = closing;

  await setMonthBalance(m, y, rollover, parseFloat(cfg.monthly_savings ?? '0') || 0);
  return {
    amount: rollover,
    fromMonth: prev.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  };
}


export async function getMonthDetail(month: number, year: number): Promise<{
  transactions: Transaction[];
  recurring: { name: string; icon: string; color: string; amount: number; type: string; due_day: number | null }[];
}> {
  const db = await getDb();
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const [txs, cats] = await Promise.all([
    db.getAllAsync<Transaction>(
      `${TX_SELECT} WHERE strftime('%Y-%m', t.date) = ? ORDER BY t.date ASC, t.created_at ASC`,
      [key]
    ),
    db.getAllAsync<Category>(
      `SELECT * FROM categories WHERE is_recurring = 1 AND is_active = 1 AND default_amount > 0`
    ),
  ]);
  return {
    transactions: txs,
    recurring: cats.map(c => ({
      name: c.name, icon: c.icon, color: c.color,
      amount: c.default_amount, type: c.type, due_day: c.due_day,
    })),
  };
}

export async function getMonthHistory(pastMonths = 3, futureMonths = 12): Promise<{
  label: string; income: number; expense: number; savings: number;
  opening: number; closing: number; month: number; year: number;
  expense_fuel: number; expense_daily: number; expense_bills: number; expense_other: number;
}[]> {
  const db  = await getDb();
  const now = new Date();
  const result = [];

  const settingsRows = await db.getAllAsync<any>('SELECT key, value FROM settings');
  const cfg: Record<string, number> = {};
  for (const r of settingsRows) cfg[r.key] = parseFloat(r.value) || 0;

  // i > 0 → past, i = 0 → current, i < 0 → future
  for (let i = pastMonths; i >= -futureMonths; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m   = d.getMonth() + 1;
    const y   = d.getFullYear();
    const key = `${y}-${String(m).padStart(2, '0')}`;

    const [totals, mb] = await Promise.all([
      db.getAllAsync<any>(`
        SELECT
          COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END),0) AS income,
          COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense,
          COALESCE(SUM(CASE WHEN type='expense' AND t.id IN (
            SELECT transaction_id FROM fuel_entries WHERE transaction_id IS NOT NULL AND strftime('%Y-%m', date) = ?
          ) THEN amount ELSE 0 END),0) AS expense_fuel,
          COALESCE(SUM(CASE WHEN type='expense' AND t.id IN (
            SELECT transaction_id FROM daily_spends WHERE transaction_id IS NOT NULL AND strftime('%Y-%m', date) = ?
          ) THEN amount ELSE 0 END),0) AS expense_daily,
          COALESCE(SUM(CASE WHEN type='expense' AND is_recurring=1
            AND t.id NOT IN (SELECT transaction_id FROM fuel_entries WHERE transaction_id IS NOT NULL)
            AND t.id NOT IN (SELECT transaction_id FROM daily_spends WHERE transaction_id IS NOT NULL)
          THEN amount ELSE 0 END),0) AS expense_bills
        FROM transactions t WHERE strftime('%Y-%m', t.date) = ?`, [key, key, key]
      ),
      db.getAllAsync<MonthBalance>('SELECT * FROM month_balances WHERE month=? AND year=?', [m, y]),
    ]);

    const opening       = mb[0]?.opening_balance      ?? 0;
    const savings       = mb[0]?.savings_contribution ?? cfg.monthly_savings ?? 0;
    const income        = totals[0]?.income        ?? 0;
    const expense       = totals[0]?.expense       ?? 0;
    const expense_fuel  = totals[0]?.expense_fuel  ?? 0;
    const expense_daily = totals[0]?.expense_daily ?? 0;
    const expense_bills = totals[0]?.expense_bills ?? 0;
    const expense_other = Math.max(0, expense - expense_fuel - expense_daily - expense_bills);

    result.push({
      label:   d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      income, expense, savings, opening, month: m, year: y,
      closing: opening + income - expense,
      expense_fuel, expense_daily, expense_bills, expense_other,
    });
  }
  return result;
}

export async function getDashboardDataForMonth(month: number, year: number): Promise<{
  income: number; expense: number; opening: number; savings: number; balance: number;
  transactions: Transaction[];
  recurring: { name: string; icon: string; color: string; amount: number; type: string; due_day: number | null }[];
}> {
  const db  = await getDb();
  const key = `${year}-${String(month).padStart(2, '0')}`;

  // Ensure opening balance is computed and stored before fetching
  const opening = await computeMonthOpening(month, year);

  const [totals, mb, txs, cats, settingsRows] = await Promise.all([
    db.getAllAsync<any>(`
      SELECT
        COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END),0) AS income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense
      FROM transactions WHERE strftime('%Y-%m', date) = ?`, [key]
    ),
    db.getAllAsync<MonthBalance>('SELECT * FROM month_balances WHERE month=? AND year=?', [month, year]),
    db.getAllAsync<Transaction>(
      `${TX_SELECT} WHERE strftime('%Y-%m', t.date) = ? ORDER BY t.date DESC, t.created_at DESC`,
      [key]
    ),
    db.getAllAsync<Category>(
      `SELECT * FROM categories WHERE is_recurring = 1 AND is_active = 1 AND default_amount > 0`
    ),
    db.getAllAsync<any>('SELECT key, value FROM settings'),
  ]);

  const cfg: Record<string, number> = {};
  for (const r of settingsRows) cfg[r.key] = parseFloat(r.value) || 0;

  const savings = mb[0]?.savings_contribution ?? cfg.monthly_savings ?? 0;
  const income  = totals[0]?.income  ?? 0;
  const expense = totals[0]?.expense ?? 0;

  return {
    income, expense, opening, savings,
    balance: opening + income - expense - savings,
    transactions: txs,
    recurring: cats.map(c => ({
      name: c.name, icon: c.icon, color: c.color,
      amount: c.default_amount, type: c.type === 'both' ? 'expense' : c.type, due_day: c.due_day,
    })),
  };
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

export async function getMonthExpenseTotalsByDay(year: number, month: number): Promise<Record<number, number>> {
  const db = await getDb();
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const rows = await db.getAllAsync<{ day: number; total: number }>(
    `SELECT CAST(strftime('%d', date) AS INTEGER) AS day, COALESCE(SUM(amount), 0) AS total
     FROM transactions WHERE type = 'expense' AND strftime('%Y-%m', date) = ?
     GROUP BY day`,
    [monthStr]
  );
  return Object.fromEntries(rows.map(r => [r.day, r.total]));
}

export async function getTransactionsForDate(date: string): Promise<Transaction[]> {
  const db = await getDb();
  return db.getAllAsync<Transaction>(
    `${TX_SELECT} WHERE t.date = ? AND t.type = 'expense' AND t.is_recurring = 0 ORDER BY t.created_at DESC`,
    [date]
  );
}

export async function getDailySpends(date: string): Promise<DailySpend[]> {
  const db = await getDb();
  return db.getAllAsync<DailySpend>(
    'SELECT * FROM daily_spends WHERE date = ? ORDER BY created_at DESC',
    [date]
  );
}

export async function getDailySpendTotalsForDates(dates: string[]): Promise<Record<string, number>> {
  if (dates.length === 0) return {};
  const db = await getDb();
  const placeholders = dates.map(() => '?').join(',');
  const rows = await db.getAllAsync<{ date: string; total: number }>(
    `SELECT date, COALESCE(SUM(amount), 0) AS total FROM daily_spends WHERE date IN (${placeholders}) GROUP BY date`,
    dates
  );
  return Object.fromEntries(rows.map(r => [r.date, r.total]));
}

export async function getDailySpendTotal(date: string): Promise<number> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ total: number }>(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM daily_spends WHERE date = ?',
    [date]
  );
  return rows[0]?.total ?? 0;
}

export async function getDailySpendTotalsByDay(year: number, month: number): Promise<Record<number, number>> {
  const db = await getDb();
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const rows = await db.getAllAsync<{ day: number; total: number }>(
    `SELECT CAST(strftime('%d', date) AS INTEGER) AS day, COALESCE(SUM(amount), 0) AS total
     FROM daily_spends WHERE strftime('%Y-%m', date) = ? GROUP BY day`,
    [key]
  );
  return Object.fromEntries(rows.map(r => [r.day, r.total]));
}

export async function createDailySpend(data: { date: string; amount: number; note?: string | null }): Promise<void> {
  const db = await getDb();
  const txId = uuid();
  await db.runAsync(
    'INSERT INTO transactions (id, amount, type, date, category_id, note) VALUES (?,?,?,?,?,?)',
    [txId, data.amount, 'expense', data.date, 'c12', data.note ?? null]
  );
  await db.runAsync(
    'INSERT INTO daily_spends (id, date, amount, note, transaction_id) VALUES (?,?,?,?,?)',
    [uuid(), data.date, data.amount, data.note ?? null, txId]
  );
}

export async function deleteDailySpend(id: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ transaction_id: string | null }>(
    'SELECT transaction_id FROM daily_spends WHERE id = ?', [id]
  );
  const txId = rows[0]?.transaction_id;
  if (txId) await db.runAsync('DELETE FROM transactions WHERE id = ?', [txId]);
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

export async function getMonthTransactionDetails(month?: number, year?: number): Promise<{
  income: Transaction[]; expense: Transaction[];
  totalIncome: number; totalExpense: number;
}> {
  const db  = await getDb();
  const now = new Date();
  const m   = month ?? (now.getMonth() + 1);
  const y   = year  ?? now.getFullYear();
  const key = `${y}-${String(m).padStart(2, '0')}`;
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
      DELETE FROM daily_spends;
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
        'INSERT OR IGNORE INTO fuel_entries (id,year,month,date,vehicle,amount,liters,price_per_liter,notes,created_at,transaction_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [r.id,r.year,r.month,r.date,r.vehicle??'Car',r.amount,r.liters??null,r.price_per_liter??null,r.notes??null,r.created_at??new Date().toISOString(),r.transaction_id??null]
      );
    }
    for (const r of (d.daily_spends || [])) {
      await db.runAsync(
        'INSERT OR IGNORE INTO daily_spends (id,date,amount,note,created_at,transaction_id) VALUES (?,?,?,?,?,?)',
        [r.id,r.date,r.amount,r.note??null,r.created_at??new Date().toISOString(),r.transaction_id??null]
      );
    }
    await db.execAsync('COMMIT');
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}
