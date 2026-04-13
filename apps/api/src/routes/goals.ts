import { Router, Response } from 'express';
import { body } from 'express-validator';
import { db } from '../db/client';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../types';

export const goalsRouter = Router();
goalsRouter.use(requireAuth);

goalsRouter.get('/', async (req: AuthRequest, res: Response) => {
  const { rows } = await db.query(
    'SELECT * FROM goals WHERE user_id = $1 ORDER BY is_completed, created_at DESC',
    [req.user!.id]
  );
  res.json(rows.map(g => ({
    ...g,
    pct: Math.min(100, Math.round((parseFloat(g.current_amount) / parseFloat(g.target_amount)) * 100)),
  })));
});

goalsRouter.post('/',
  body('name').trim().notEmpty(),
  body('target_amount').isFloat({ min: 0.01 }),
  body('deadline').optional().isISO8601(),
  body('icon').optional().trim(),
  body('color').optional().matches(/^#[0-9a-fA-F]{6}$/),
  validate,
  async (req: AuthRequest, res: Response) => {
    const { name, target_amount, deadline = null, icon = 'target', color = '#10b981' } = req.body;
    const { rows } = await db.query(
      'INSERT INTO goals (user_id, name, target_amount, deadline, icon, color) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.user!.id, name, target_amount, deadline, icon, color]
    );
    res.status(201).json(rows[0]);
  }
);

// PATCH /api/goals/:id/deposit
goalsRouter.patch('/:id/deposit',
  body('amount').isFloat({ min: 0.01 }),
  validate,
  async (req: AuthRequest, res: Response) => {
    const { rows } = await db.query(
      `UPDATE goals
       SET current_amount = LEAST(target_amount, current_amount + $3),
           is_completed   = CASE WHEN current_amount + $3 >= target_amount THEN TRUE ELSE FALSE END,
           updated_at     = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, req.user!.id, req.body.amount]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  }
);

goalsRouter.patch('/:id',
  body('name').optional().trim().notEmpty(),
  body('target_amount').optional().isFloat({ min: 0.01 }),
  validate,
  async (req: AuthRequest, res: Response) => {
    const allowed = ['name', 'target_amount', 'deadline', 'icon', 'color'];
    const fields  = allowed.filter(f => req.body[f] !== undefined);
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    const sets   = fields.map((f, i) => `${f} = $${i + 3}`).join(', ');
    const values = fields.map(f => req.body[f]);

    const { rows } = await db.query(
      `UPDATE goals SET ${sets}, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user!.id, ...values]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  }
);

goalsRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const { rowCount } = await db.query(
    'DELETE FROM goals WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user!.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});
