import { Router, Response } from 'express';
import { body, query } from 'express-validator';
import { db } from '../db/client';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../types';

export const budgetsRouter = Router();
budgetsRouter.use(requireAuth);

// GET /api/budgets?month=6&year=2025
budgetsRouter.get('/',
  query('month').isInt({ min: 1, max: 12 }),
  query('year').isInt({ min: 2000 }),
  validate,
  async (req: AuthRequest, res: Response) => {
    const { month, year } = req.query as { month: string; year: string };
    const { rows } = await db.query(
      `SELECT
         b.*,
         c.name  AS category_name,
         c.icon  AS category_icon,
         c.color AS category_color,
         COALESCE(SUM(t.amount), 0) AS spent
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
       LEFT JOIN transactions t
         ON t.category_id = b.category_id
         AND t.user_id    = b.user_id
         AND t.type       = 'expense'
         AND EXTRACT(MONTH FROM t.date) = b.month
         AND EXTRACT(YEAR  FROM t.date) = b.year
       WHERE b.user_id = $1 AND b.month = $2 AND b.year = $3
       GROUP BY b.id, c.name, c.icon, c.color
       ORDER BY c.name`,
      [req.user!.id, month, year]
    );

    const enriched = rows.map(r => ({
      ...r,
      spent:     parseFloat(r.spent),
      remaining: parseFloat(r.amount) - parseFloat(r.spent),
      pct:       Math.min(100, Math.round((parseFloat(r.spent) / parseFloat(r.amount)) * 100)),
    }));

    res.json(enriched);
  }
);

// PUT /api/budgets  →  upsert
budgetsRouter.put('/',
  body('category_id').isUUID(),
  body('amount').isFloat({ min: 0.01 }),
  body('month').isInt({ min: 1, max: 12 }),
  body('year').isInt({ min: 2000 }),
  validate,
  async (req: AuthRequest, res: Response) => {
    const { category_id, amount, month, year } = req.body;
    const { rows } = await db.query(
      `INSERT INTO budgets (user_id, category_id, amount, month, year)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, category_id, month, year)
       DO UPDATE SET amount = EXCLUDED.amount
       RETURNING *`,
      [req.user!.id, category_id, amount, month, year]
    );
    res.status(201).json(rows[0]);
  }
);

// DELETE /api/budgets/:id
budgetsRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const { rowCount } = await db.query(
    'DELETE FROM budgets WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user!.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});
