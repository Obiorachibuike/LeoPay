# LeoPay

A production-oriented, multi-tenant business payments platform for Nigerian businesses. LeoPay brings payment links, hosted checkout, invoicing, a hosted storefront, payouts and financial reporting into one workspace with an append-only double-entry ledger behind it.

**Built with** Next.js 15 (App Router, server actions, route handlers) · TypeScript (strict) · Tailwind CSS v4 · PostgreSQL via Drizzle ORM · Zod · Vitest · pdf-lib.

> LeoPay is payments software. It is not a bank or a licensed payment institution. Card and transfer processing is performed by a licensed payment provider, and business verification is a manual review — nothing in this repository claims regulatory approval, certification or live provider credentials.

---

## What is implemented

| Area | Status |
| --- | --- |
| Marketing site (home, features, solutions, pricing, security, developers, docs, about, contact, legal, status) | Implemented |
| Authentication (register, login, email verification, password reset, invitations), sessions, rate limits | Implemented |
| Two-factor authentication (TOTP, QR enrolment, single-use recovery codes) + workspace MFA policy for owners/admins | Implemented |
| Multi-tenant organizations, roles (owner/admin/finance/developer/viewer), audit log | Implemented |
| Payment links + hosted checkout + public payment page | Implemented |
| Payments: provider initialization, server-side verification, refunds, reconciliation | Implemented |
| Invoices: line items, tax, discounts, PDF, email, reminders, overdue tracking | Implemented |
| Storefront, products, inventory reservations, orders | Implemented |
| Image uploads: product photos, workspace logo, profile photo (validated, content-addressed, served from the app) | Implemented |
| Payouts: beneficiaries, account resolution, approval threshold, separation of duties, daily limits | Implemented |
| Transactions, analytics, CSV export, ledger, reconciliation exceptions | Implemented |
| Developer API v1 (scoped keys, idempotency), signed merchant webhooks with retry outbox | Implemented |
| Provider webhook receiver, scheduled job endpoint, platform admin console | Implemented |
| Mock payment provider for local end-to-end flows (blocked in production) | Implemented, clearly labelled |
| Live provider adapter (Paystack) | Implemented against the public API and covered by recorded-response contract tests; **not tested against live credentials here** |
| Automated tests | 110 integration/unit/contract tests (see `docs/TESTING.md`) |

Nothing in the UI is a dead button: every action calls a server action or route handler that re-authorizes, validates and persists.

---

## Quick start

Requires Node.js 20+ and PostgreSQL 14+ (developed on Node 22 and PostgreSQL 16).

```bash
npm install
cp .env.example .env.local       # then set AUTH_SECRET (32+ random chars)
npm run db:up                    # PostgreSQL 16 in Docker (or use your own server)
npm run db:migrate               # applies db/migrations
npm run db:seed                  # demo workspace + demo data (mock payments)
npm run dev                      # http://localhost:3000
```

No Docker? Point `DATABASE_URL` in `.env.local` at any PostgreSQL instance and run the
same `db:migrate` / `db:seed` steps. The application has no fallback database: if
`DATABASE_URL` is missing, startup fails with an explanation rather than silently using
an embedded engine.

Demo sign-in after seeding:

```
Email:    demo@leopay.test
Password: printed by `npm run db:seed` (a random value is generated per run)
```

No password is committed. Set `SEED_PASSWORD` in `.env.local` before seeding if you need a
reproducible demo password; the seed refuses to run with a production configuration.

The seed refuses to run against a production configuration and only works with `PAYMENT_PROVIDER=mock`. PostgreSQL is multi-process, so migrations and seeds can run while the dev server is up (migrations are additive).

Useful scripts:

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run test         # vitest; uses TEST_DATABASE_URL when set, else in-memory PGlite
npm run test:db      # vitest against the local PostgreSQL test database
npm run build        # production build
npm run db:generate  # regenerate migrations after schema changes
npm run db:reset     # drop the local Docker volume, recreate and migrate
```

### Local demo login (optional)

Setting `ENABLE_DEV_LOGIN=true` exposes `POST /api/dev/login` with `{ "email": "demo@leopay.test" }`. It creates a normal session row and refuses to run when `NODE_ENV=production`. This is for demo environments and smoke tests only.

---

## Architecture

```
src/
  app/
    (marketing)/         public marketing + legal pages
    (auth)/              sign-in, registration, verification, password reset
    (public)/            hosted checkout, invoices, storefront (no dashboard chrome)
    (app)/dashboard/     authenticated workspace
    (app)/admin/         platform administration
    api/v1/              public REST API
    api/webhooks/        provider webhook receiver
    api/cron/            scheduled background work
    api/exports/         CSV exports
    actions/             server actions (all authorization happens here too)
  components/            design system, dashboard, marketing, checkout
  lib/                   env, db client, crypto, errors, ledger, money, rate limits, SSRF
  services/              business logic (payments, payouts, invoices, storefront, analytics…)
  db/migrations/         generated SQL migrations
docs/                    architecture, payments, API, security, deployment, operations
tests/                   Vitest integration tests against PostgreSQL
```

Detailed documentation:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — layers, data model, request flow
- [`docs/PAYMENTS.md`](docs/PAYMENTS.md) — payment lifecycle, invariants, ledger
- [`docs/API.md`](docs/API.md) — REST API, idempotency, webhooks, signature verification
- [`docs/SECURITY.md`](docs/SECURITY.md) — threat model and controls
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — production checklist
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — jobs, reconciliation, runbooks
- [`docs/TESTING.md`](docs/TESTING.md) — what is covered and how to run it
- [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) — known gaps, stated plainly

---

## Money handling

All monetary values are **integers in minor units** (`amount_minor`, kobo for NGN). Conversions live in `src/lib/money.ts`; no floating-point arithmetic touches a stored amount or a ledger posting.

The ledger (`src/lib/ledger.ts`) is append-only and double-entry:

| Code | Account | Type |
| --- | --- | --- |
| 1000 | Provider clearing | asset |
| 2000 | Refunds payable | liability |
| 3100 | Payouts to beneficiaries | expense |
| 4000 | Sales revenue | revenue |
| 4010 | Refunds (contra-revenue) | revenue |
| 5000 | Provider processing fees | expense |

Corrections are compensating entries. Entries are unique per `(organization, reference)`, so retries cannot double-post. Collections, provider fees, refunds, payouts and outstanding invoices are always reported separately — the clearing figure is **not** presented as a withdrawable balance.

---

## Payments safety model

- A payment becomes `succeeded` only after the provider's verification endpoint confirms the status, amount and currency. A visit to a success URL never settles anything.
- Amount and currency mismatches are recorded as `amount_mismatch` and a critical reconciliation exception; no revenue is recognised.
- Settlement, ledger posting, invoice/order updates, merchant webhook outbox rows and email queueing happen in **one database transaction** with `SELECT … FOR UPDATE`.
- Provider webhooks are signature-verified against the raw body, deduplicated on `(provider, event_id)`, and re-verified with the provider rather than trusted from the payload.
- Refunds are validated against the original amount, cumulative refunds and provider capability.
- Payouts require a verified beneficiary, enforce a rolling 24-hour limit, require a second approver above the configured threshold, and never let a requester approve their own payout. An uncertain provider outcome is marked `processing` with a critical exception instead of being retried blindly.

See [`docs/PAYMENTS.md`](docs/PAYMENTS.md) for the state machine.

---

## Configuration

Every variable is documented in [`.env.example`](.env.example). Production safety checks (`src/lib/env.ts`, `instrumentation.ts`) refuse to start when:

- `AUTH_SECRET` is missing, short or a placeholder,
- `DB_DRIVER=pglite` (the test-only embedded fallback) is used with `NODE_ENV=production`,
- `DATABASE_URL` is missing in production,
- `PAYMENT_PROVIDER=paystack` without `PAYSTACK_SECRET_KEY`,
- the mock provider is active in production (unless `ALLOW_MOCK_PAYMENTS=true` for a demo).

Non-fatal warnings (log-only email delivery, missing encryption key) are surfaced in the admin/health surfaces.

---

## Tests

```bash
npm run db:up          # PostgreSQL 16 on localhost:5432 (creates leopay + leopay_test)
npm test               # picks up TEST_DATABASE_URL if exported
npm run test:db        # explicit: run the suite against the local test database
```

110 tests cover money conversion, password hashing/tokens, MFA (TOTP, challenges, recovery codes, workspace policy), image uploads, Paystack contract shapes, payment settlement and idempotency, refunds, invoice numbering and totals, payout limits/approvals, storefront oversell protection, tenant isolation, webhook SSRF protection, rate limiting, API-key scopes, the API v1 checkout flow with idempotency, provider webhook signature rejection and ledger integrity.

Tests run against PostgreSQL with the real migrations applied, so `FOR UPDATE`, partial indexes, array columns and `SKIP LOCKED` behave exactly as in production. Without `TEST_DATABASE_URL` the suite falls back to PGlite (PostgreSQL compiled to WASM, in-memory) so it still runs on a machine with no server — that fallback is test-only.

There is no browser end-to-end suite in this environment (no browser runtime available); the same flows are exercised through server-side integration tests and HTTP smoke tests against the running app.

---

## Licence / attribution

Original code and copy. No third-party design assets or source code were copied. Provider names are referenced only to describe integrations.
