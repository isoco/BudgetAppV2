# BudgetAppV2

A fully local, single-user personal finance app built with Expo (React Native) and SQLite — no backend required.

---

## Features

- Track daily income and expenses
- Budget management per category
- Savings goals tracking
- Spending statistics and insights
- Month history and year overview
- Fuel tracker
- Daily tracker
- Dark/light theme support
- Push notification support (bill reminders)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo (React Native) ~55 |
| Navigation | expo-router ~55 |
| State | Zustand ^4 |
| Storage | expo-sqlite ~55 (local, on-device) |
| Charts | react-native-svg 15 |
| Icons | @expo/vector-icons 15 |
| Dates | date-fns ^3 |
| Runtime | Node ≥20, pnpm ≥9 |

> **No backend required.** The app runs fully offline using SQLite on the device. The `apps/api` workspace is an optional Express + PostgreSQL server for future cloud sync.

---

## Project Structure

```
BudgetAppV2/
├── apps/
│   ├── mobile/                 # Expo app (main app)
│   │   ├── app/                # expo-router screens
│   │   │   ├── (tabs)/         # bottom tab screens
│   │   │   ├── add-transaction.tsx
│   │   │   ├── add-goal.tsx
│   │   │   ├── set-budget.tsx
│   │   │   ├── settings.tsx
│   │   │   └── ...
│   │   └── src/
│   │       ├── db/
│   │       │   ├── index.ts    # DB init + schema creation
│   │       │   └── queries.ts  # all SQL queries
│   │       ├── components/     # shared UI components
│   │       ├── hooks/
│   │       │   └── useQuery.ts # lightweight data-fetching hook
│   │       ├── store/
│   │       │   └── themeStore.ts
│   │       └── theme/
│   └── api/                    # optional Express API (not needed for mobile)
├── package.json                # monorepo root
├── pnpm-workspace.yaml
└── ARCHITECTURE.md
```

---

## Prerequisites

- **Node.js** ≥ 20 — [nodejs.org](https://nodejs.org)
- **pnpm** ≥ 9 — `npm install -g pnpm`
- **Expo CLI** — installed automatically via `expo` package
- **Expo Go** app on your phone — [iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)

---

## Local Development

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start the mobile app

```bash
pnpm mobile
```

This runs `expo start` inside `apps/mobile`. A QR code will appear in the terminal.

### 3. Open on device

- **Expo Go (physical device):** Scan the QR code with the Expo Go app. Device and computer must be on the same Wi-Fi network.
- **Android emulator:** Press `a` in the terminal (requires Android Studio + emulator running).
- **iOS simulator:** Press `i` in the terminal (macOS + Xcode required).
- **Web:** Press `w` in the terminal (limited native feature support).

> On first launch the app creates `budget.db` via `getDb()` in `src/db/index.ts` and runs the schema migrations automatically.

---

## Running Tests

```bash
# Mobile unit tests
cd apps/mobile
pnpm test
```

Tests use `jest-expo` + `@testing-library/react-native`.

---

## Optional: API Server

The `apps/api` workspace is an Express + PostgreSQL server. It is **not required** to run the mobile app.

### Setup

```bash
cp apps/api/.env.example apps/api/.env
# Edit .env — set DATABASE_URL to your local Postgres instance
```

```bash
pnpm db:migrate   # create tables
pnpm db:seed      # seed initial data
pnpm api          # start dev server on :3000
```

### Environment variables (`apps/api/.env`)

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default `3000`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Min 32-char secret for JWT signing |
| `JWT_EXPIRES_IN` | Access token TTL (default `15m`) |
| `REFRESH_TOKEN_EXPIRES_IN` | Refresh token TTL (default `30d`) |
| `CORS_ORIGIN` | Allowed origin (default `http://localhost:8081`) |

---

## Building for Production

### EAS Build (Expo Application Services)

```bash
npm install -g eas-cli
eas login
eas build --platform all --profile production
```

### Submit to stores

```bash
eas submit --platform ios
eas submit --platform android
```

### OTA updates (no store review)

```bash
eas update --branch production --message "Fix budget calculation"
```

---

## Database

The mobile app uses **SQLite via `expo-sqlite`** — fully local, no server needed.

- DB file: `budget.db` (created on device on first launch)
- Schema initialized in: `apps/mobile/src/db/index.ts`
- All queries in: `apps/mobile/src/db/queries.ts`

---

## Architecture Notes

See [ARCHITECTURE.md](./ARCHITECTURE.md) for:
- Scalability strategy (connection pooling, read replicas, Redis caching)
- Docker / Railway / AWS deployment guides
- Security checklist
- Notification system design

---

## Common Issues

| Problem | Fix |
|---------|-----|
| QR code not connecting | Ensure phone and PC are on the same Wi-Fi. Try tunnel mode: `expo start --tunnel` |
| Metro bundler cache issues | `expo start --clear` |
| Android emulator not detected | Start the emulator first, then press `a` |
| `pnpm` not found | `npm install -g pnpm` |
| SQLite errors on first launch | Delete app from device and reinstall to reset DB |
