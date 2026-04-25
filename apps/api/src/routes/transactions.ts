import { Router, Response } from 'express';
import { body, query } from 'express-validator';
import { db } from '../db/client';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../types';

export const transactionsRouter = Router();
transactionsRouter.use(requireAuth);

const TX_SELECT = `
  SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
`;

// GET /api/transactions
transactionsRouter.get('/',
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
  query('type').optional().isIn(['income', 'expense', 'transfer']),
  query('category_id').optional().isUUID(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  validate,
  async (req: AuthRequest, res: Response) => {
    const { from, to, type, category_id, limit = 50, offset = 0 } = req.query as Record<string, string>;
    const params: unknown[] = [req.user!.id];
    const filters: string[] = ['t.user_id = $1'];

    if (from)        { params.push(from);        filters.push(`t.date >= $${params.length}`); }
    if (to)          { params.push(to);           filters.push(`t.date <= $${params.length}`); }
    if (type)        { params.push(type);         filters.push(`t.type = $${params.length}`); }
    if (category_id) { params.push(category_id);  filters.push(`t.category_id = $${params.length}`); }

    params.push(Number(limit), Number(offset));
    const { rows } = await db.query(
      `${TX_SELECT} WHERE ${filters.join(' AND ')} ORDER BY t.date DESC, t.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    // total count for pagination
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) FROM transactions t WHERE ${filters.slice(0, -2 + filters.length).join(' AND ')}`,
      params.slice(0, -2)
    );

    res.json({ data: rows, total: parseInt(countRows[0].count) });
  }
);

// GET /api/transactions/summary/monthly  →  totals per month
transactionsRouter.get('/summary/monthly', async (req: AuthRequest, res: Response) => {
  const { rows } = await db.query(
    `SELECT
       DATE_TRUNC('month', date) AS month,
       type,
       SUM(amount) AS total
     FROM transactions
     WHERE user_id = $1 AND date >= NOW() - INTERVAL '12 months'
     GROUP BY 1, 2
     ORDER BY 1`,
    [req.user!.id]
  );
  res.json(rows);
});

// GET /api/transactions/:id
transactionsRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  const { rows } = await db.query(
    `${TX_SELECT} WHERE t.id = $1 AND t.user_id = $2`,
    [req.params.id, req.user!.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// POST /api/transactions
transactionsRouter.post('/',
  body('amount').isFloat({ min: 0.01 }),
  body('type').isIn(['income', 'expense', 'transfer']),
  body('date').isISO8601(),
  body('category_id').optional().isUUID(),
  body('note').optional().trim(),
  body('merchant').optional().trim(),
  validate,
  async (req: AuthRequest, res: Response) => {
    const { amount, type, date, category_id = null, note = null, merchant = null } = req.body;
    const { rows } = await db.query(
      `INSERT INTO transactions (user_id, amount, type, date, category_id, note, merchant)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user!.id, amount, type, date, category_id, note, merchant]
    );
    res.status(201).json(rows[0]);
  }
);

// PATCH /api/transactions/:id
transactionsRouter.patch('/:id',
  body('amount').optional().isFloat({ min: 0.01 }),
  body('type').optional().isIn(['income', 'expense', 'transfer']),
  body('date').optional().isISO8601(),
  validate,
  async (req: AuthRequest, res: Response) => {
    const allowed = ['amount', 'type', 'date', 'category_id', 'note', 'merchant'];
    const fields  = allowed.filter(f => req.body[f] !== undefined);
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    const sets   = fields.map((f, i) => `${f} = $${i + 3}`).join(', ');
    const values = fields.map(f => req.body[f]);

    const { rows } = await db.query(
      `UPDATE transactions SET ${sets}, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user!.id, ...values]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  }
);

// DELETE /api/transactions/:id
transactionsRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const { rowCount } = await db.query(
    'DELETE FROM transactions WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user!.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});
