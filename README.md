# CredFX API

> Enterprise-grade multi-currency FX Trading Platform — built with NestJS, TypeORM, PostgreSQL & Redis.

## Architecture Overview
```
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENT (Postman/Web)                      │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTP
┌────────────────────────────▼─────────────────────────────────────┐
│                    NestJS Application (Port 3000)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  ┌─────────┐  │
│  │  AuthModule  │  │ WalletModule │  │  FxModule│  │  Admin  │  │
│  └──────┬───────┘  └──────┬───────┘  └────┬─────┘  └────┬────┘  │
│         │                 │               │              │        │
│  ┌──────▼─────────────────▼───────────────▼──────────────▼────┐  │
│  │                    PostgreSQL (TypeORM)                      │  │
│  │  users │ wallets │ wallet_balances │ transactions │ fx_snaps │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌────────────────────┐         ┌────────────────────────────────┐ │
│  │  Redis (ioredis)   │         │  ExchangeRate API (external)   │ │
│  │  · FX Rate Cache   │         │  + DB Snapshot Fallback        │ │
│  │  · Idempotency Keys│         └────────────────────────────────┘ │
│  └────────────────────┘                                            │
└────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer          | Technology                |
|----------------|---------------------------|
| Framework      | NestJS 10 + TypeScript    |
| ORM            | TypeORM 0.3.x             |
| Database       | PostgreSQL 15+            |
| Cache          | Redis 7 (via ioredis)     |
| Auth           | JWT + Passport            |
| Email          | Nodemailer + Mailtrap     |
| FX Rates       | ExchangeRate-API v6       |
| Documentation  | Swagger (OpenAPI 3.0)     |
| Testing        | Jest + @nestjs/testing    |

## Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- A free API key from [exchangerate-api.com](https://www.exchangerate-api.com)
- A [Mailtrap](https://mailtrap.io) account (SMTP credentials)

## Setup Instructions

### 1. Clone and install
```bash
git clone https://github.com/YOUR_USERNAME/credfx-api.git
cd credfx-api
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```

Open `.env` and fill in all values. Key ones:
```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_db_password
DB_NAME=credfx

JWT_SECRET=change_this_to_a_long_random_string_in_production

REDIS_HOST=localhost
REDIS_PORT=6379

MAIL_HOST=sandbox.smtp.mailtrap.io
MAIL_PORT=2525
MAIL_USER=your_mailtrap_user
MAIL_PASS=your_mailtrap_pass

FX_API_KEY=your_exchangerate_api_key
```

### 3. Create the database
```bash
psql -U postgres -c "CREATE DATABASE credfx;"
```

### 4. Run the application
```bash
# Development (with auto-reload + DB synchronize)
npm run start:dev

# Production build
npm run build
npm run start:prod
```

The API will be available at:
- **Base URL**: `http://localhost:3000/api/v1`
- **Swagger Docs**: `http://localhost:3000/api/docs`

### 5. Run tests
```bash
npm test              # All tests
npm run test:cov      # With coverage report
```

## API Documentation

Full interactive documentation at `/api/docs` (Swagger UI).

### Auth Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register + send OTP |
| POST | `/api/v1/auth/verify` | Verify OTP, activate account |
| POST | `/api/v1/auth/resend-otp` | Resend OTP |
| POST | `/api/v1/auth/login` | Login, get JWT |
| GET | `/api/v1/auth/me` | Get own profile  |

### Wallet Endpoints ( JWT Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/wallet` | Get all currency balances |
| POST | `/api/v1/wallet/fund` | Fund wallet |
| POST | `/api/v1/wallet/convert` | Convert (no fee) |
| POST | `/api/v1/wallet/trade` | Trade (0.5% fee) |

### FX Endpoints ( JWT Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/fx/rates?base=NGN` | Real-time FX rates |
| GET | `/api/v1/fx/pairs` | All supported pairs |

### Transaction Endpoints ( JWT Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/transactions` | Paginated history |
| GET | `/api/v1/transactions/:reference` | Single transaction |

### Admin Endpoints ( JWT + ADMIN Role Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/users` | All users |
| GET | `/api/v1/admin/users/:id` | User by ID |
| PATCH | `/api/v1/admin/users/:id/role` | Update user role |
| GET | `/api/v1/admin/transactions` | All transactions |
| GET | `/api/v1/admin/analytics/summary` | Platform analytics |
| GET | `/api/v1/admin/analytics/fx-trends` | FX rate history |

## Key Assumptions

1. **Multi-currency wallet**: Each user has a single wallet entity with multiple `WalletBalance` rows (one per currency). Balances are created on demand when a new currency is received for the first time.

2. **NGN is the onboarding currency**: New users receive 1,000 NGN as initial balance (configurable via `INITIAL_NGN_BALANCE`).

3. **Convert vs Trade distinction**:
   - `/wallet/convert`: You specify the source amount and get the calculated destination amount. No fee.
   - `/wallet/trade`: You specify the exact destination amount you want to buy. The system calculates how much source currency to deduct, plus a 0.5% trading fee. This mirrors how real FX desks quote trades.

4. **FX Rate caching**: Rates are cached in Redis for 5 minutes (configurable). On cache miss, we fetch live rates and store a snapshot in PostgreSQL for trend analytics and fallback.

5. **Race condition prevention**: All balance operations use PostgreSQL `SELECT FOR UPDATE` row-level locking within explicit transactions. Two concurrent requests against the same balance will queue — not race.

6. **Idempotency**: Fund, convert, and trade operations accept an optional `idempotencyKey` field. Duplicate submissions with the same key return the cached result from Redis (TTL: 24h) without re-executing.

7. **OTP security**: OTPs are hashed with bcrypt before storage. Even if the database is compromised, raw OTPs are not exposed.

8. **Admin bootstrapping**: To make a user an admin, use the `PATCH /admin/users/:id/role` endpoint — but the first admin must be manually updated in the database: `UPDATE users SET role = 'ADMIN' WHERE email = 'admin@example.com';`

## Architectural Decisions

### Why TypeORM with `QueryRunner` instead of `EntityManager.transaction()`?

`QueryRunner` gives us explicit control over the transaction lifecycle, making it easier to handle complex scenarios like:
- Acquiring pessimistic locks (`SELECT FOR UPDATE`) at specific points
- Conditional rollback logic
- Logging failed operations before rollback


### Scalability at Millions of Users

- **Horizontal scaling**: The app is stateless (JWT auth, Redis for shared state) — run multiple instances behind a load balancer.
- **Database**: Add read replicas for GET-heavy workloads. Partition `transactions` table by `created_at`.
- **FX rates**: Redis cluster with rate refresh via a separate background worker (NestJS `@Cron` scheduler).
- **Wallet locks**: At extreme scale, migrate to advisory locks or a queue-based architecture (e.g., BullMQ) to serialize balance updates per user.
```

---
