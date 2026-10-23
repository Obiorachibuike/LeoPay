# Operations

## Jobs

| Job | Trigger | Effect |
| --- | --- | --- |
| Merchant webhook dispatch | inline ticker or `/api/cron` | Claims due deliveries with `SKIP LOCKED`, signs and POSTs them, backs off on failure (30s → 24h, six attempts) |
| Email delivery | inline ticker or `/api/cron` | Sends queued notifications; `log` provider records without sending |
| Stale payment expiry | `/api/cron` | `created`/`pending`/`processing` older than 24h → `expired` (never touches settled rows) |
| Invoice overdue refresh | `/api/cron` and invoice list | Issued/partially paid invoices past due → `overdue` |
| Rate-limit cleanup | `/api/cron` | Deletes windows older than 24h |

## Reconciliation

Run from **Dashboard → Transactions → Reconciliation**, or via the same service from a job.

- **Internal checks**: settled payments without ledger entries, refunds exceeding payments, paid orders/invoices whose payment does not match, payouts stuck in `processing`, failed provider events.
- **Provider check**: re-verifies up to 25 in-flight payments with the provider (catches missed webhooks).
- Results are `reconciliation_exceptions` rows with a severity. The dashboard lists open exceptions; the platform admin console lists them across tenants.

Reconciliation never rewrites history. Corrections use compensating ledger entries or an explicit operator decision recorded in the audit log.

## Runbooks

### A payment is stuck pending

1. Open the payment and press **Verify with provider** (dashboard) — this calls `verifyAndSettlePayment`.
2. If the provider says success but the payment remains pending, run reconciliation with the provider check and inspect `webhook_events` for a failed signature.
3. Never mark a payment successful manually; there is no such control by design.

### A webhook endpoint keeps failing

1. Inspect recent deliveries; the HTTP status and error are recorded.
2. Confirm the endpoint returns 2xx within 10 seconds and verifies `x-leopay-signature`.
3. Fix the endpoint and press **Retry** on the failed delivery.
4. Endpoints failing repeatedly are marked unhealthy after six attempts; delete and recreate if the URL has changed.

### A payout is processing for too long

1. `processing` means the provider may have accepted the transfer — do **not** resend it.
2. Check the provider dashboard for the reference; then run reconciliation or wait for the `transfer.*` webhook.
3. If the transfer failed, reconciliation marks it failed and no ledger posting exists. If it succeeded, the ledger posting is created once.
4. A critical `unresolved_payout` exception remains until resolved with a note.

### An amount mismatch exception appears

1. The provider verified an amount or currency different from the payment row. No revenue was recognised.
2. Compare the payment, its provider reference and the provider dashboard.
3. Resolve or ignore with a note. If money was genuinely received, create a new payment/link for the correct amount — do not edit the failed record.

### Suspected account compromise

1. Suspend the user in the admin console (sessions stop validating immediately).
2. Rotate `AUTH_SECRET` only as a last resort — this invalidates all sessions, which may be desirable but is disruptive.
3. Revoke API keys, rotate webhook secrets, review `audit_logs` for the actor.

## Monitoring

- `/api/v1/health` (authenticated with an API key) reports configuration warnings.
- `/status` renders provider/environment state for humans.
- The admin console surfaces open exceptions, failed provider events, failed deliveries and email backlog.
- Logs are structured JSON (`logger`), with secrets excluded. Ship them to your log platform and alert on: `PROVIDER_ERROR`, `amount_mismatch`, `unresolved_payout`, cron failures and 5xx rates.

## Backups

Back up PostgreSQL daily with point-in-time recovery. The ledger, audit log and payments are the critical tables. Test a restore before launch.
