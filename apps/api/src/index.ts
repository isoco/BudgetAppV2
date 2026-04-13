import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { authRouter } from './routes/auth';
import { transactionsRouter } from './routes/transactions';
import { budgetsRouter } from './routes/budgets';
import { categoriesRouter } from './routes/categories';
import { insightsRouter } from './routes/insights';
import { goalsRouter } from './routes/goals';
import { subscriptionsRouter } from './routes/subscriptions';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '10kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true }));

app.use('/api/auth',          authRouter);
app.use('/api/transactions',  transactionsRouter);
app.use('/api/budgets',       budgetsRouter);
app.use('/api/categories',    categoriesRouter);
app.use('/api/insights',      insightsRouter);
app.use('/api/goals',         goalsRouter);
app.use('/api/subscriptions', subscriptionsRouter);

app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date() }));

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API → http://localhost:${PORT}`));

export default app;
