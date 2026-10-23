# Deployment

## Requirements

- Node.js 20+ (developed on Node 22)
- PostgreSQL 14+ (managed: Neon, Supabase, RDS, Cloud SQL). PGlite is **not** a production database.
- A payment provider account (Paystack) to accept real payments.
- An email provider (Resend) to deliver real email; otherwise messages are recorded but not sent.
- An HTTPS hostname, and a scheduler that can call `POST /api/cron`.

## 1. Configure

Copy `.env.example` and set at minimum:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `NEXT_PUBLIC_APP_URL` | your HTTPS origin |
| `DATABASE_URL` | your managed PostgreSQL connection string |
| `DB_DRIVER` | `postgres` |
| `AUTH_SECRET` | 48 random bytes, e.g. from `openssl rand -base64 48` |
| `WEBHOOK_ENCRYPTION_KEY` | 48 random bytes, generated the same way |
| `PAYMENT_PROVIDER` | `paystack` |
| `PAYSTACK_SECRET_KEY` | the secret key from your provider dashboard |
| `PAYSTACK_PUBLIC_KEY` | the public key from your provider dashboard |
| `EMAIL_PROVIDER` | `resend` |
| `EMAIL_FROM` | a verified sender on your domain |
| `EMAIL_API_KEY` | the API key from your email provider dashboard |
| `JOB_RUNNER_TOKEN` | a long random value shared with your scheduler |
| `ENABLE_INLINE_JOBS` | `false` |

Copy `.env.example` to `.env.local` (or your platform's environment settings) and fill in the
values; no secret is stored in this repository.

The process refuses to start if a fatal problem is detected (`instrumentation.ts` → `validateRuntimeConfig`).

## 2. Build and migrate

```bash
npm ci
npm run db:migrate     # applies db/migrations against DATABASE_URL
npm run build
npm run start
```

Run migrations as a separate release step, before new instances receive traffic. Migrations are additive by convention; financial tables are never rewritten in place.

## 3. Provider setup

In the provider dashboard:

- Set the webhook URL to `https://app.example.com/api/webhooks/providers/paystack`.
- Subscribe to `charge.success`, `charge.failed`, `transfer.success`, `transfer.failed`, `transfer.reversed`, `refund.processed`.
- Enable transfers and confirm that payouts are permitted for your account; the app surfaces "payouts unavailable" until the provider is configured and capable.

## 4. Scheduler

Call `POST /api/cron` every minute with `Authorization: Bearer $JOB_RUNNER_TOKEN`.

Vercel Cron example (`vercel.json`):

```json
{ "crons": [{ "path": "/api/cron", "schedule": "* * * * *" }] }
```

For other platforms use a cron job, Cloud Scheduler, or GitHub Actions schedule. The endpoint is idempotent and safe to call concurrently.

## 5. Verify after deploy

1. `GET /status` renders and reports configuration warnings.
2. Sign in, complete onboarding, and confirm the dashboard shows "Test payments mode" only if the mock provider is active.
3. Create a payment link and pay it in test mode; confirm the payment settles, the ledger entry appears and the invoice (if any) is marked paid.
4. Create a webhook endpoint pointing at a request bin; confirm delivery and verify the signature.
5. Trigger `/api/cron` and confirm a 200 with a job summary.
6. Verify admin access with a platform administrator account.

## Rollback

Deploy the previous build; migrations are additive so the old code continues to work. Do not roll back a migration that dropped a column — none are expected to.

## Scaling notes

- The app is stateless; run multiple instances behind a load balancer.
- Set `ENABLE_INLINE_JOBS=false` and use the scheduler when running more than one instance (the outbox uses `SKIP LOCKED`, so duplicates are avoided, but centralising jobs makes behaviour predictable).
- PGlite cannot be shared between processes — local development only.
