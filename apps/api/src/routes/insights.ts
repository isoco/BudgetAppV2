import { Router, Response } from 'express';
import { db } from '../db/client';
import { requireAuth } from '../middleware/auth';
import { AuthRequest } from '../types';

export const insightsRouter = Router();
insightsRouter.use(requireAuth);

// GET /api/insights/dashboard  →  single endpoint for dashboard data
insightsRouter.get('/dashboard', async (req: AuthRequest, res: Response) => {
  const uid = req.user!.id;
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`;

  const [totals, categoryBreakdown, recentTx] = await Promise.all([
    // Income vs expense this month vs last month
    db.query(
      `SELECT
         SUM(CASE WHEN type='income'  AND date >= $2 THEN amount ELSE 0 END) AS income_this,
         SUM(CASE WHEN type='expense' AND date >= $2 THEN amount ELSE 0 END) AS expense_this,
         SUM(CASE WHEN type='income'  AND date >= $3 AND date < $2 THEN amount ELSE 0 END) AS income_last,
         SUM(CASE WHEN type='expense' AND date >= $3 AND date < $2 THEN amount ELSE 0 END) AS expense_last
       FROM transactions WHERE user_id = $1`,
      [uid, thisMonth, lastMonthStr]
    ),
    // Spending by category this month
    db.query(
      `SELECT c.name, c.color, c.icon, SUM(t.amount) AS total
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = $1 AND t.type = 'expense' AND t.date >= $2
       GROUP BY c.id ORDER BY total DESC LIMIT 6`,
      [uid, thisMonth]
    ),
    // Last 5 transactions
    db.query(
      `SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = $1 ORDER BY t.date DESC, t.created_at DESC LIMIT 5`,
      [uid]
    ),
  ]);

  const t = totals.rows[0];
  const incomeThis   = parseFloat(t.income_this  || 0);
  const expenseThis  = parseFloat(t.expense_this || 0);
  const incomeLast   = parseFloat(t.income_last  || 0);
  const expenseLast  = parseFloat(t.expense_last || 0);

  res.json({
    balance: incomeThis - expenseThis,
    income:  { this_month: incomeThis,  last_month: incomeLast,  change_pct: pct(incomeThis, incomeLast) },
    expense: { this_month: expenseThis, last_month: expenseLast, change_pct: pct(expenseThis, expenseLast) },
    safe_to_spend: safeToSpend(incomeThis, expenseThis, now),
    category_breakdown: categoryBreakdown.rows,
    recent_transactions: recentTx.rows,
  });
});

// GET /api/insights/spending-trend?months=6
insightsRouter.get('/spending-trend', async (req: AuthRequest, res: Response) => {
  const months = Math.min(12, parseInt(req.query.months as string) || 6);
  const { rows } = await db.query(
    `SELECT
       TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM') AS month,
       SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS income,
       SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expense
     FROM transactions
     WHERE user_id = $1 AND date >= NOW() - ($2 || ' months')::INTERVAL
     GROUP BY 1 ORDER BY 1`,
    [req.user!.id, months]
  );
  res.json(rows);
});

// GET /api/insights/smart  →  rule-based tips
insightsRouter.get('/smart', async (req: AuthRequest, res: Response) => {
  const uid = req.user!.id;
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const [budgetStatus, topCategory, avgDaily] = await Promise.all([
    db.query(
      `SELECT b.amount, COALESCE(SUM(t.amount),0) AS spent, c.name
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
       LEFT JOIN transactions t ON t.category_id=b.category_id AND t.user_id=b.user_id
         AND t.type='expense' AND t.date >= $2
       WHERE b.user_id=$1 AND b.month=$3 AND b.year=$4
       GROUP BY b.id, c.name`,
      [uid, thisMonth, now.getMonth() + 1, now.getFullYear()]
    ),
    db.query(
      `SELECT c.name, SUM(t.amount) AS total FROM transactions t
       JOIN categories c ON c.id=t.category_id
       WHERE t.user_id=$1 AND t.type='expense' AND t.date >= $2
       GROUP BY c.name ORDER BY total DESC LIMIT 1`,
      [uid, thisMonth]
    ),
    db.query(
      `SELECT SUM(amount)/GREATEST(1, EXTRACT(DAY FROM NOW())) AS avg
       FROM transactions WHERE user_id=$1 AND type='expense' AND date >= $2`,
      [uid, thisMonth]
    ),
  ]);

  const tips: string[] = [];
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();

  budgetStatus.rows.forEach(b => {
    const ratio = parseFloat(b.spent) / parseFloat(b.amount);
    if (ratio > 0.9) tips.push(`⚠️ You've used ${Math.round(ratio * 100)}% of your ${b.name} budget.`);
  });

  if (topCategory.rows[0]) {
    tips.push(`📊 Your top spending category this month is ${topCategory.rows[0].name}.`);
  }

  const dailyAvg = parseFloat(avgDaily.rows[0]?.avg || 0);
  const projectedEnd = dailyAvg * (now.getDate() + daysLeft);
  tips.push(`📈 At current pace you'll spend ~$${projectedEnd.toFixed(0)} this month.`);

  res.json({ tips });
});

function pct(current: number, previous: number): number {
  if (!previous) return 0;
  return Math.round(((current - previous) / previous) * 100);
}

function safeToSpend(income: number, expense: number, now: Date): number {
  const daysInMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft     = daysInMonth - now.getDate();
  const dailyBudget  = (income - expense) / Math.max(1, daysLeft);
  return Math.max(0, Math.round(dailyBudget * 100) / 100);
}
