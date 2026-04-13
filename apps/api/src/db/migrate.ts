import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { db } from './client';

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(sql);
  console.log('Migration complete');
  await db.end();
}

migrate().catch((e) => { console.error(e); process.exit(1); });
