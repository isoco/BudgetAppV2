import request from 'supertest';
import app from '../index';
import { db } from '../db/client';

let token: string;
let txId:  string;

beforeAll(async () => {
  const email = `tx-test-${Date.now()}@example.com`;
  const res   = await request(app).post('/api/auth/register').send({ email, password: 'Password123!', name: 'TX User' });
  token = res.body.accessToken;
});

afterAll(() => db.end());

describe('POST /api/transactions', () => {
  it('creates transaction', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 25.50, type: 'expense', date: '2025-06-15', note: 'Coffee' });

    expect(res.status).toBe(201);
    expect(parseFloat(res.body.amount)).toBe(25.50);
    txId = res.body.id;
  });

  it('rejects negative amount', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: -10, type: 'expense', date: '2025-06-15' });
    expect(res.status).toBe(422);
  });
});

describe('GET /api/transactions', () => {
  it('returns paginated transactions', async () => {
    const res = await request(app)
      .get('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .query({ limit: 10, offset: 0 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('PATCH /api/transactions/:id', () => {
  it('updates note', async () => {
    const res = await request(app)
      .patch(`/api/transactions/${txId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'Updated note' });

    expect(res.status).toBe(200);
    expect(res.body.note).toBe('Updated note');
  });
});

describe('DELETE /api/transactions/:id', () => {
  it('deletes transaction', async () => {
    const res = await request(app)
      .delete(`/api/transactions/${txId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 404 for missing transaction', async () => {
    const res = await request(app)
      .delete(`/api/transactions/${txId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
