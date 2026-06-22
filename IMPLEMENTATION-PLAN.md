# IMPLEMENTATION PLAN — Terminal Database Deployment

**Date:** 2026-06-20  
**Source:** FRESH-SUPABASE-INTEGRATION-AUDIT.md  
**Status:** Plan only. No code modified. No migrations executed.

---

## 1. ALL 16 TERMINAL TABLES

| # | Table Name | Category |
|---|---|---|
| 1 | `terminal_users` | Auth & User Context |
| 2 | `terminal_sessions` | Auth & User Context |
| 3 | `terminal_accounts` | Auth & User Context |
| 4 | `challenges` | Challenge & Rules |
| 5 | `risk_rules` | Challenge & Rules |
| 6 | `account_metrics` | Challenge & Rules |
| 7 | `terminal_orders` | Order Execution |
| 8 | `terminal_positions` | Order Execution |
| 9 | `terminal_trades` | Order Execution |
| 10 | `watchlists` | User Features |
| 11 | `audit_log` | Audit & Persistence |
| 12 | `risk_events` | Audit & Persistence |
| 13 | `challenge_metrics` | Audit & Persistence |
| 14 | `order_audit` | Audit & Persistence |
| 15 | `broker_sessions` | Broker Infrastructure |
| 16 | `payouts` | Payouts |

---

## 2. MIGRATION EXECUTION ORDER

Strict FK-dependency order. Each phase must complete before the next begins.

```
PHASE 1 (no dependencies except platform `users`)
  └── terminal_users

PHASE 2 (depends on terminal_users)
  ├── challenges
  ├── terminal_sessions
  └── watchlists

PHASE 3 (depends on terminal_users + challenges)
  └── terminal_accounts

PHASE 4 (depends on terminal_accounts)
  ├── risk_rules
  ├── account_metrics
  ├── terminal_orders
  ├── terminal_positions
  ├── audit_log
  ├── risk_events
  ├── broker_sessions
  └── payouts (also depends on terminal_users, challenges)

PHASE 5 (depends on terminal_orders + terminal_accounts)
  ├── terminal_trades
  ├── order_audit
  └── challenge_metrics (also depends on challenges)

PHASE 6 (no table dependencies)
  ├── Triggers (update_updated_at)
  └── Row Level Security (all 16 tables)
```

---

## 3. COLLISION VERIFICATION

| Existing Platform Table | Collision with any of the 16 new tables? | Status |
|---|---|---|
| `users` | ❌ NO — Terminal uses `terminal_users` | SAFE |
| `orders` | ❌ NO — Terminal uses `terminal_orders` | SAFE |
| `sessions` | ❌ NO — Terminal uses `terminal_sessions` | SAFE |
| `payouts` | ⚠️ POTENTIAL — if platform has a `payouts` table | SEE BELOW |
| `kyc_*` | ❌ NO — No terminal table uses `kyc` prefix | SAFE |

### Payouts collision check:
- Production audit (2026-06-19) confirmed: **no `payouts` table exists** in current Supabase.
- The platform's payment data is in the `orders` table (plan purchases).
- Terminal `payouts` table is for trader profit withdrawal requests — different domain.
- **Verdict: NO COLLISION.** Safe to create.

### Additional table name checks:
- `watchlists` — does not exist in production. SAFE.
- `audit_log` — does not exist in production. SAFE.
- `risk_rules` — does not exist in production. SAFE.
- `account_metrics` — does not exist in production. SAFE.
- `challenges` — does not exist in production. SAFE.
- `risk_events` — does not exist in production. SAFE.
- `challenge_metrics` — does not exist in production. SAFE.
- `order_audit` — does not exist in production. SAFE.
- `broker_sessions` — does not exist in production. SAFE.

**All 16 tables: ZERO collisions.**

---

## 4. DEPLOYMENT CHECKLIST

### Phase 1 — Database Creation

| Step | Action | Verify |
|---|---|---|
| 1.1 | Open Supabase Dashboard → SQL Editor | Can access project |
| 1.2 | Confirm existing tables: `users` (20 rows), `orders` (17 rows), `sessions` (3 rows) | `SELECT tablename FROM pg_tables WHERE schemaname = 'public'` |
| 1.3 | Take full project backup | Supabase Dashboard → Settings → Backups → Create |
| 1.4 | Confirm `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` available | Supabase → Settings → API |
| 1.5 | Confirm no table named `terminal_*`, `challenges`, `watchlists`, `payouts`, `audit_log`, `risk_*`, `account_metrics`, `order_audit`, `broker_sessions` exists | Query above returns only `users`, `orders`, `sessions` |

### Phase 2 — Migration Execution

| Step | Action | Verify |
|---|---|---|
| 2.1 | Run PHASE 1 SQL: Create `terminal_users` | `SELECT COUNT(*) FROM terminal_users` returns 0 |
| 2.2 | Run PHASE 2 SQL: Create `challenges`, `terminal_sessions`, `watchlists` | All 3 tables respond to SELECT |
| 2.3 | Run PHASE 3 SQL: Create `terminal_accounts` | Table responds to SELECT |
| 2.4 | Run PHASE 4 SQL: Create `risk_rules`, `account_metrics`, `terminal_orders`, `terminal_positions`, `audit_log`, `risk_events`, `broker_sessions`, `payouts` | All 8 tables respond to SELECT |
| 2.5 | Run PHASE 5 SQL: Create `terminal_trades`, `order_audit`, `challenge_metrics` | All 3 tables respond to SELECT |
| 2.6 | Run PHASE 6 SQL: Triggers + RLS | `SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_terminal%'` returns trigger names |
| 2.7 | Verify final table count | `SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public'` = 19 (3 existing + 16 new) |
| 2.8 | Verify FK integrity | `SELECT conname FROM pg_constraint WHERE contype = 'f'` shows all expected FKs |

### Phase 3 — Terminal Connection

| Step | Action | Verify |
|---|---|---|
| 3.1 | Set `SUPABASE_URL` in terminal `.env` | Value matches Supabase project URL |
| 3.2 | Set `SUPABASE_SERVICE_KEY` in terminal `.env` | Value is service role key (starts with `eyJ...`) |
| 3.3 | Set `JWT_SECRET` in terminal `.env` | 256-bit secret generated |
| 3.4 | Set `SSO_SHARED_SECRET` in terminal `.env` | Must match FW Dashboard config |
| 3.5 | Set `FW_DASHBOARD_URL` in terminal `.env` | `https://fundedwealth.com` |
| 3.6 | Update repository table names in code (see mapping below) | Each repo file points to new table |
| 3.7 | Start terminal server | `node server/index.js` starts without DB errors |
| 3.8 | Hit `/health` endpoint | Response shows `database.connected: true` |

**Code file → table name updates required:**

```
user.repository.js         → 'terminal_users'
account.repository.js      → 'terminal_accounts'
challenge.repository.js    → 'challenges'
risk-rules.repository.js   → 'risk_rules'
order.repository.js        → 'terminal_orders'
position.repository.js     → 'terminal_positions'
trade.repository.js        → 'terminal_trades'
session.service.js         → 'terminal_sessions'
sso.service.js             → 'terminal_users' + 'terminal_accounts'
accountService.js          → 'terminal_accounts' + 'terminal_positions' + 'terminal_orders' + 'terminal_trades' + 'risk_rules'
dailyChecks.js             → 'terminal_accounts'
```

### Phase 4 — Smoke Tests

| Step | Test | Expected Result |
|---|---|---|
| 4.1 | `GET /health` | `{ database: { connected: true }, status: "ok" }` |
| 4.2 | `GET /auth/verify` (no cookie) | `401 { valid: false, reason: "no_session" }` |
| 4.3 | `GET /api/instruments/search?q=RELIANCE` | Returns instrument results (no DB needed) |
| 4.4 | `GET /api/watchlists` (with valid session) | `[]` (empty array, table exists but no data) |
| 4.5 | `POST /api/watchlists` (create one) | Returns created watchlist with `id` |
| 4.6 | `GET /api/positions` (with valid session) | `[]` (empty array) |
| 4.7 | `GET /api/orders` (with valid session) | `[]` (empty array) |
| 4.8 | `GET /api/trades` (with valid session) | `[]` (empty array) |
| 4.9 | `GET /api/account` (with valid session) | Returns account object or null |
| 4.10 | `GET /api/account/challenge` (with valid session) | `{}` or challenge progress object |
| 4.11 | Verify `users` table unchanged | Still 20 rows, no schema modification |
| 4.12 | Verify `orders` table unchanged | Still 17 rows, no schema modification |
| 4.13 | Verify `sessions` table unchanged | Still 3 rows, no schema modification |
| 4.14 | Market data WebSocket connects | `ws://localhost:4000/ws` → receives tick data |

---

## 5. ROLLBACK PLAN

If anything fails:

```sql
-- Nuclear rollback: drop all 16 terminal tables
DROP TABLE IF EXISTS order_audit CASCADE;
DROP TABLE IF EXISTS challenge_metrics CASCADE;
DROP TABLE IF EXISTS terminal_trades CASCADE;
DROP TABLE IF EXISTS payouts CASCADE;
DROP TABLE IF EXISTS risk_events CASCADE;
DROP TABLE IF EXISTS broker_sessions CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS terminal_positions CASCADE;
DROP TABLE IF EXISTS terminal_orders CASCADE;
DROP TABLE IF EXISTS account_metrics CASCADE;
DROP TABLE IF EXISTS risk_rules CASCADE;
DROP TABLE IF EXISTS terminal_accounts CASCADE;
DROP TABLE IF EXISTS watchlists CASCADE;
DROP TABLE IF EXISTS terminal_sessions CASCADE;
DROP TABLE IF EXISTS challenges CASCADE;
DROP TABLE IF EXISTS terminal_users CASCADE;
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;
```

Platform tables (`users`, `orders`, `sessions`) are never touched and require no rollback.

---

*End of implementation plan. No code modified. No migrations executed. No deployment performed.*
