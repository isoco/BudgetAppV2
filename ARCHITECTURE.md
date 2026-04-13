# Architecture & Operations

## Scalability (100k+ users)

### Database
- **Connection pooling**: PgBouncer in front of Postgres (pool_mode=transaction)
- **Read replicas**: Route `SELECT` queries to replicas via pg-pool-ro
- **Indexes**: Already added on `(user_id, date)` and `(user_id, category_id)`
- **Partitioning**: Partition `transactions` by `user_id` range at 1M+ rows

### API
- **Stateless**: JWT auth → horizontal scaling via load balancer
- **Caching**: Redis for dashboard aggregates (TTL 5 min, invalidate on new tx)
- **Rate limiting**: Already applied at Express level; add at nginx/CDN level
- **Queue**: Use BullMQ for subscription detection + bill reminder notifications

### Redis Caching (add when needed)
```ts
// Cache dashboard per user
const key = `dashboard:${userId}`;
const cached = await redis.get(key);
if (cached) return JSON.parse(cached);
// ... compute ...
await redis.setex(key, 300, JSON.stringify(result));
```

---

## Backend Deployment

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter api build
CMD ["node", "apps/api/dist/index.js"]
```

### Railway / Render (quick)
1. Connect GitHub repo
2. Set env vars from `.env.example`
3. Build command: `pnpm install && pnpm --filter api build`
4. Start command: `node apps/api/dist/index.js`

### Production (AWS / GCP)
- **ECS Fargate** or **Cloud Run** for API containers
- **RDS PostgreSQL** with Multi-AZ
- **ElastiCache Redis** for caching
- **CloudFront** in front of API

---

## Mobile Deployment

### Expo EAS Build
```bash
npm install -g eas-cli
eas login
eas build --platform all --profile production
```

### App Store / Play Store
1. `eas submit --platform ios`
2. `eas submit --platform android`

### OTA Updates (no app store review)
```bash
eas update --branch production --message "Fix budget calculation"
```

---

## Security Checklist
- [x] Passwords: bcrypt with cost factor 12
- [x] JWT: 15-min access + 30-day refresh rotation
- [x] Helmet: security headers
- [x] Rate limiting: 200 req/15min per IP
- [x] Input validation: express-validator on all routes
- [x] SQL: parameterized queries only (no interpolation)
- [x] Secrets: env vars, never committed
- [ ] HTTPS: enforce via nginx/CDN (infra-level)
- [ ] Audit log: add `audit_logs` table for sensitive ops
- [ ] 2FA: add TOTP via `otpauth` library

---

## Notification System (Bill Reminders)

Use a cron job (or BullMQ scheduler) to check due subscriptions daily:

```ts
// Run daily at 9am
async function sendBillReminders() {
  const { rows } = await db.query(
    `SELECT s.*, u.id as user_id FROM subscriptions s
     JOIN users u ON u.id = s.user_id
     WHERE s.is_active = TRUE AND s.next_due <= NOW() + INTERVAL '3 days'`
  );
  for (const sub of rows) {
    await sendPushNotification(sub.user_id, {
      title: `Bill due: ${sub.name}`,
      body:  `$${sub.amount} due on ${sub.next_due}`,
    });
  }
}
```

Expo push via `expo-server-sdk`:
```ts
import { Expo } from 'expo-server-sdk';
const expo = new Expo();
await expo.sendPushNotificationsAsync([{
  to: pushToken, title, body, data: { type: 'bill_reminder' }
}]);
```
