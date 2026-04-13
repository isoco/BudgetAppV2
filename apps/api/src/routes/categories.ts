import { Router, Response } from 'express';
import { body } from 'express-validator';
import { db } from '../db/client';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../types';

export const categoriesRouter = Router();
categoriesRouter.use(requireAuth);

// GET /api/categories  →  system + user's custom
categoriesRouter.get('/', async (req: AuthRequest, res: Response) => {
  const { rows } = await db.query(
    `SELECT * FROM categories
     WHERE user_id IS NULL OR user_id = $1
     ORDER BY is_system DESC, name`,
    [req.user!.id]
  );
  res.json(rows);
});

// POST /api/categories
categoriesRouter.post('/',
  body('name').trim().notEmpty(),
  body('icon').trim().notEmpty(),
  body('color').matches(/^#[0-9a-fA-F]{6}$/),
  body('type').isIn(['income', 'expense', 'both']),
  validate,
  async (req: AuthRequest, res: Response) => {
    const { name, icon, color, type } = req.body;
    const { rows } = await db.query(
      'INSERT INTO categories (user_id, name, icon, color, type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user!.id, name, icon, color, type]
    );
    res.status(201).json(rows[0]);
  }
);

// PATCH /api/categories/:id
categoriesRouter.patch('/:id',
  body('name').optional().trim().notEmpty(),
  body('color').optional().matches(/^#[0-9a-fA-F]{6}$/),
  validate,
  async (req: AuthRequest, res: Response) => {
    const allowed = ['name', 'icon', 'color'];
    const fields  = allowed.filter(f => req.body[f] !== undefined);
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    const sets   = fields.map((f, i) => `${f} = $${i + 3}`).join(', ');
    const values = fields.map(f => req.body[f]);

    const { rows } = await db.query(
      `UPDATE categories SET ${sets} WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user!.id, ...values]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found or system category' });
    res.json(rows[0]);
  }
);

// DELETE /api/categories/:id
categoriesRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const { rowCount } = await db.query(
    'DELETE FROM categories WHERE id = $1 AND user_id = $2 AND is_system = FALSE',
    [req.params.id, req.user!.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Not found or system category' });
  res.status(204).end();
});
