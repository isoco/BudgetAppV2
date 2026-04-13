import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../db/client';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { AuthRequest } from '../types';

export const authRouter = Router();

const signAccess  = (id: string, email: string) =>
  jwt.sign({ id, email }, process.env.JWT_SECRET!, { expiresIn: process.env.JWT_EXPIRES_IN || '15m' });

const REFRESH_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRES_IN || '30');

// POST /api/auth/register
authRouter.post('/register',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('name').trim().notEmpty(),
  validate,
  async (req: Request, res: Response) => {
    const { email, password, name } = req.body;

    const exists = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, currency',
      [email, hash, name]
    );

    const user = rows[0];
    const accessToken  = signAccess(user.id, user.email);
    const refreshToken = crypto.randomBytes(40).toString('hex');
    const expiresAt    = new Date(Date.now() + REFRESH_DAYS * 86_400_000);

    await db.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, expiresAt]
    );

    res.status(201).json({ user, accessToken, refreshToken });
  }
);

// POST /api/auth/login
authRouter.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  validate,
  async (req: Request, res: Response) => {
    const { email, password } = req.body;

    const { rows } = await db.query(
      'SELECT id, email, name, currency, password_hash FROM users WHERE email = $1',
      [email]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken  = signAccess(user.id, user.email);
    const refreshToken = crypto.randomBytes(40).toString('hex');
    const expiresAt    = new Date(Date.now() + REFRESH_DAYS * 86_400_000);

    await db.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, expiresAt]
    );

    const { password_hash: _, ...safeUser } = user;
    res.json({ user: safeUser, accessToken, refreshToken });
  }
);

// POST /api/auth/refresh
authRouter.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Missing refresh token' });

  const { rows } = await db.query(
    'SELECT rt.*, u.email FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id WHERE rt.token = $1',
    [refreshToken]
  );
  const row = rows[0];
  if (!row || new Date(row.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Refresh token invalid or expired' });
  }

  const accessToken = signAccess(row.user_id, row.email);
  res.json({ accessToken });
});

// POST /api/auth/logout
authRouter.post('/logout', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (refreshToken) await db.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
  res.status(204).end();
});

// GET /api/auth/me
authRouter.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const { rows } = await db.query(
    'SELECT id, email, name, currency, avatar_url, created_at FROM users WHERE id = $1',
    [req.user!.id]
  );
  res.json(rows[0]);
});

// PATCH /api/auth/me
authRouter.patch('/me', requireAuth,
  body('name').optional().trim().notEmpty(),
  body('currency').optional().isLength({ min: 3, max: 3 }),
  validate,
  async (req: AuthRequest, res: Response) => {
    const fields = ['name', 'currency', 'avatar_url'].filter(f => req.body[f] !== undefined);
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    const sets   = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const values = fields.map(f => req.body[f]);

    const { rows } = await db.query(
      `UPDATE users SET ${sets}, updated_at = NOW() WHERE id = $1 RETURNING id, email, name, currency, avatar_url`,
      [req.user!.id, ...values]
    );
    res.json(rows[0]);
  }
);
