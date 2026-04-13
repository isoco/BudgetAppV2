import { Router, Response } from 'express';
import { body } from 'express-validator';
import { db } from '../db/client';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../types';

export const subscriptionsRouter = Router();
subscriptionsRouter.use(requireAuth);

subscriptionsRouter.get('/', async (req: AuthRequest, res: Response) => {
  const { rows } = await db.query(
    `SELECT s.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
     FROM subscriptions s
     LEFT JOIN categories c ON c.id = s.category_id
     WHERE s.user_id = $1
     ORDER BY s.next_due`,
    [req.user!.id]
  );
  res.json(rows);
});

subscriptionsRouter.post('/',
  body('name').trim().notEmpty(),
  body('amount').isFloat({ min: 0.01 }),
  body('billing_cycle').isIn(['weekly', 'monthly', 'yearly']),
  body('next_due').isISO8601(),
  body('category_id').optional().isUUID(),
  validate,
  async (req: AuthRequest, res: Response) => {
    const { name, amount, billing_cycle, next_due, category_id = null } = req.body;
    const { rows } = await db.query(
      'INSERT INTO subscriptions (user_id, name, amount, billing_cycle, next_due, category_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.user!.id, name, amount, billing_cycle, next_due, category_id]
    );
    res.status(201).json(rows[0]);
  }
);

// POST /api/subscriptions/detect  →  detect from recurring transactions
subscriptionsRouter.post('/detect', async (req: AuthRequest, res: Response) => {
  // Find transactions with same merchant + similar amount in last 90 days, occurring 2+ times
  const { rows } = await db.query(
    `SELECT
       LOWER(TRIM(merchant)) AS merchant,
       category_id,
       ROUND(AVG(amount)::numeric, 2) AS avg_amount,
       COUNT(*) AS occurrences,
       MAX(date) AS last_seen
     FROM transactions
     WHERE user_id = $1
       AND type = 'expense'
       AND merchant IS NOT NULL
       AND date >= NOW() - INTERVAL '90 days'
     GROUP BY 1, 2
     HAVING COUNT(*) >= 2
     ORDER BY occurrences DESC`,
    [req.user!.id]
  );
  res.json(rows);
});

subscriptionsRouter.patch('/:id',
  body('is_active').optional().isBoolean(),
  body('next_due').optional().isISO8601(),
  validate,
  async (req: AuthRequest, res: Response) => {
    const allowed = ['name', 'amount', 'billing_cycle', 'next_due', 'category_id', 'is_active'];
    const fields  = allowed.filter(f => req.body[f] !== undefined);
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    const sets   = fields.map((f, i) => `${f} = $${i + 3}`).join(', ');
    const values = fields.map(f => req.body[f]);

    const { rows } = await db.query(
      `UPDATE subscriptions SET ${sets} WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user!.id, ...values]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  }
);

subscriptionsRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const { rowCount } = await db.query(
    'DELETE FROM subscriptions WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user!.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});
