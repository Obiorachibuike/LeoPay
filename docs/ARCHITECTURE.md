# Architecture

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15 App Router | One deployable unit; server components keep data access on the server |
| Language | TypeScript strict (`noUncheckedIndexedAccess`) | Financial code benefits from exhaustiveness |
| Styling | Tailwind CSS v4 + CSS variables | Light/dark tokens without a runtime theme library |
| Data access | Drizzle ORM | Typed SQL, explicit transactions, no hidden lazy loading |
| Database | PostgreSQL 16 (`postgres.js` driver) | `FOR UPDATE`, partial unique indexes, `SKIP LOCKED` for queues |
| Local/test database | PostgreSQL via `docker-compose.yml` (`npm run db:up`) | The app, migrations, seed and tests run on the same engine as production |
| Validation | Zod | Shared between server actions and API routes |
| PDF | pdf-lib | Server-generated invoices without a browser |
| Tests | Vitest | Integration tests against PostgreSQL (PGlite only as an opt-in fallback) |

## Layers

```
Route / page / server action
        │  authentication + permission + Zod validation
        ▼
Service (src/services/*)
        │  business invariants, transactions, ledger, events
        ▼
Drizzle → PostgreSQL
```

Rules the codebase follows:

1. **Authorization lives on the server.** Pages call `requirePermission("...")`; server actions call it again. Hiding a button is never the control.
2. **Services never read cookies or headers.** They receive an explicit `organizationId` and actor, which makes them testable and prevents accidental cross-tenant reads.
3. **One transaction per financial event.** Payment settlement, refund application and payout completion each write their ledger entry, domain rows and outbox rows in a single transaction.
4. **Queues live in the database.** Emails and merchant webhooks are persisted rows; nothing important is held in memory.
5. **Provider calls happen outside long transactions** wherever possible, and always outside `FOR UPDATE` locks.

## Data model (38 tables)

Identity & access
: `users`, `sessions`, `verification_tokens`, `mfa_challenges`, `organizations`, `memberships`, `invitations`, `api_keys`, `rate_limits`, `audit_logs`

Money in
: `customers`, `payment_links`, `payments`, `refunds`, `invoices`, `invoice_items`, `invoice_sequences`

Commerce
: `storefronts`, `products`, `orders`, `order_items`, `inventory_movements`

Money out
: `beneficiaries`, `payouts`, `payout_events`

Accounting
: `ledger_accounts`, `journal_entries`, `journal_postings`

Reliability
: `webhook_events` (provider inbound), `webhook_endpoints`, `webhook_deliveries` (merchant outbound), `idempotency_keys`, `notifications`

Operations
: `reconciliation_runs`, `reconciliation_exceptions`, `platform_settings`, `support_tickets`, `mock_checkout_sessions` (development only)

### Uploads

Merchant images (product photos, workspace logos, profile photos) are written by
`src/lib/storage.ts` to `UPLOAD_DIR` (default `.data/uploads`) under
`<organizationId>/<kind>/<sha256>.<ext>` and served by
`GET /api/uploads/[...key]`. Keys are content-addressed, so the same bytes are
stored once, and the file extension comes from sniffed magic bytes rather than
the upload's filename. Swapping in object storage means reimplementing
`putImage`/`readImage`; callers never touch the filesystem.

### Tenancy

Every money-bearing table carries `organization_id` with a foreign key. Service queries always include it, both for reads and updates. Resources belonging to another organization return `NOT_FOUND` rather than `FORBIDDEN` so existence is not leaked (see `tests/tenancy.test.ts`).

### Identifiers

- UUID primary keys for internal identity.
- Human-facing references: `pl_…` (payment link), `pay_…` (payment), `inv_…` (invoice), `ord_…` (order), `pyt_…` (payout), `INV-YYYY-NNNN` (invoice number, per organization per year).
- API keys and session tokens are only stored as SHA-256 hashes.

## Request lifecycle

1. Middleware adds security headers and performs a cheap cookie gate for `/dashboard` and `/admin`.
2. The layout resolves the session and active organization (`leopay_org` cookie), then loads the membership and permissions.
3. The page calls a service with the organization id.
4. Mutations run through server actions: validate → require permission → call service → `revalidatePath`.
5. The service writes audit rows for security-relevant actions.

## Background processing

Three mechanisms, all durable:

- **Inline ticker** (`ENABLE_INLINE_JOBS`) for development and single-node deployments — an interval that drains due email and webhook rows.
- **`POST /api/cron`** protected by `JOB_RUNNER_TOKEN` for serverless schedulers. Runs webhook dispatch, email delivery, stale-payment expiry, invoice overdue refresh and rate-limit cleanup.
- **Provider webhooks** (`POST /api/webhooks/providers/:provider`) which verify the signature and then re-verify the transaction with the provider.

## Design system

Tokens are CSS custom properties in `src/app/globals.css`, mapped into Tailwind via `@theme inline`. Light and dark are first-class; the theme is applied by a blocking inline script (no flash) and persisted in `localStorage` with `prefers-color-scheme` as the default. Layouts are responsive from 320px, and animation respects `prefers-reduced-motion`.
