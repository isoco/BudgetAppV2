import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db } from './client';

async function seed() {
  // Demo user
  const email = 'demo@budgetapp.io';
  const hash  = await bcrypt.hash('Demo1234!', 12);

  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [email, hash, 'Demo User']
  );
  const uid = rows[0].id;

  // Sample transactions
  const { rows: cats } = await db.query('SELECT id, name FROM categories WHERE is_system = TRUE');
  const catMap = Object.fromEntries(cats.map((c: any) => [c.name, c.id]));

  const txs = [
    { amount: 5200, type: 'income',  date: '2025-06-01', note: 'June Salary',     cat: 'Salary' },
    { amount: 48.5, type: 'expense', date: '2025-06-03', note: 'Groceries',       cat: 'Food & Dining' },
    { amount: 12.9, type: 'expense', date: '2025-06-04', note: 'Spotify',         cat: 'Entertainment' },
    { amount: 120,  type: 'expense', date: '2025-06-05', note: 'Electric bill',   cat: 'Bills & Utilities' },
    { amount: 35,   type: 'expense', date: '2025-06-07', note: 'Dinner',          cat: 'Food & Dining' },
    { amount: 250,  type: 'expense', date: '2025-06-10', note: 'Clothes',         cat: 'Shopping' },
    { amount: 500,  type: 'income',  date: '2025-06-12', note: 'Freelance work',  cat: 'Freelance' },
    { amount: 80,   type: 'expense', date: '2025-06-14', note: 'Doctor visit',    cat: 'Health' },
    { amount: 15,   type: 'expense', date: '2025-06-15', note: 'Uber',            cat: 'Transport' },
    { amount: 320,  type: 'expense', date: '2025-06-18', note: 'Weekend trip',    cat: 'Travel' },
  ];

  for (const tx of txs) {
    await db.query(
      'INSERT INTO transactions (user_id, category_id, amount, type, date, note) VALUES ($1,$2,$3,$4,$5,$6)',
      [uid, catMap[tx.cat], tx.amount, tx.type, tx.date, tx.note]
    );
  }

  // Sample budgets
  const budgets = [
    { cat: 'Food & Dining',    amount: 400 },
    { cat: 'Shopping',         amount: 300 },
    { cat: 'Entertainment',    amount: 100 },
    { cat: 'Bills & Utilities',amount: 200 },
    { cat: 'Transport',        amount: 150 },
    { cat: 'Health',           amount: 200 },
  ];

  for (const b of budgets) {
    await db.query(
      'INSERT INTO budgets (user_id, category_id, amount, month, year) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
      [uid, catMap[b.cat], b.amount, 6, 2025]
    );
  }

  // Sample goals
  await db.query(
    `INSERT INTO goals (user_id, name, icon, color, target_amount, current_amount, deadline)
     VALUES ($1, 'Emergency Fund', '🛡️', '#6366f1', 10000, 3200, '2025-12-31'),
            ($1, 'New MacBook',   '💻', '#3b82f6', 2500,  800,  '2025-09-01'),
            ($1, 'Vacation',      '✈️', '#f59e0b', 3000,  1500, '2025-08-01')
     ON CONFLICT DO NOTHING`,
    [uid]
  );

  console.log(`Seed complete. Login: ${email} / Demo1234!`);
  await db.end();
}

seed().catch((e) => { console.error(e); process.exit(1); });
