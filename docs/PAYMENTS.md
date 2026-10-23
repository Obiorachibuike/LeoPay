# Payments, refunds and payouts

## State machine (`payments.status`)

```
created ──initialize ok──▶ pending ──verify pending──▶ pending
   │                         │
   │                         ├──verify success──▶ succeeded ──refund──▶ partially_refunded ──▶ refunded
   │                         ├──verify failed───▶ failed
   │                         └──provider processing──▶ processing ──▶ succeeded | failed
   └──initialize error──▶ failed

pending/created ──24h──▶ expired
```

`succeeded`, `failed`, `cancelled`, `expired`, `refunded` are terminal for settlement purposes. A `failed` payment may still become `succeeded` if the provider later verifies success (late settlement); this can only happen through provider verification, never from a client request.

## What makes a payment paid

`verifyAndSettlePayment(internalReference)`:

1. Loads the payment by internal reference; returns the persisted state if already terminal.
2. Calls the provider's verification endpoint — never the browser's word, never the webhook body's `status`.
3. If pending/processing, records that state and stops.
4. If failed/cancelled, records the failure with the provider's reason.
5. If succeeded, compares **amount and currency** with the payment row. A mismatch marks the payment `failed (amount_mismatch)` and raises a critical reconciliation exception; nothing is credited.
6. Otherwise, inside one transaction with `SELECT … FOR UPDATE`:
   - re-check the status (concurrent callers observe a settled record),
   - set `succeeded`, `paidAt`, fee and net,
   - post the collection journal entry (`1000` debit, `4000` credit, plus `5000`/`1000` for the fee),
   - apply the amount to the invoice or order if linked,
   - enqueue `payment.succeeded` (and `invoice.paid` / `order.paid`) into the merchant webhook outbox,
   - queue the receipt email,
   - write an audit entry.

Returning from a provider redirect only calls this function; a forged success URL cannot create a successful payment.

## Duplicate and out-of-order events

- Provider events are deduplicated by the unique index on `(provider, event_id)`.
- Merchant deliveries are claimed with `FOR UPDATE SKIP LOCKED`, so two workers cannot send the same row.
- All settlement steps are idempotent: ledger entries are unique by reference, invoice application re-checks the remaining balance, and status updates use conditional `WHERE` clauses.

## Refunds

`refundPayment` validates that the payment succeeded, the amount is positive and does not exceed `amount - alreadyRefunded`, and that the provider supports refunds. A `refunds` row is created as `pending`, the provider is called, and the ledger entry (`4010` debit / `1000` credit) is posted only when the refund is confirmed. Partial refunds set `partially_refunded`; the sum can never exceed the original amount.

## Payouts

```
requested ──below threshold──▶ approved ──provider──▶ processing ──▶ succeeded
    │                                                       └──────▶ failed
    └──at/above threshold──▶ pending_approval ──approve──▶ approved
                                   └──reject──▶ failed (rejected)
```

Controls:

- Beneficiary must be `active` and `verified` (account name resolved by the provider, never typed by the user).
- Capacity = ledger clearing minus payouts that are pending/processing — labelled as an estimate, never as a provider-confirmed balance.
- Rolling 24-hour limit (`payoutDailyLimitMinor`).
- Approval threshold (`payoutApprovalThresholdMinor`); the requester can never approve their own payout.
- Idempotency key support for API-created payouts.
- An ambiguous provider response leaves the payout in `processing` and opens a critical exception instead of retrying, because a duplicate transfer is worse than a stuck one.

## Ledger

Balanced entries only; the database call throws if debits and credits differ. Postings are immutable rows. `getBalances` computes signed balances by account type. `verifyLedgerIntegrity` checks that every entry balances and is used by tests and reconciliation.

## Reconciliation

`runReconciliation` performs internal checks (settled payments without ledger entries, refunds exceeding payments, paid orders/invoices that do not match payments, payouts stuck in processing, failed provider events) and optionally re-verifies in-flight payments with the provider. It never mutates financial records; every problem becomes a `reconciliation_exceptions` row with a severity, and resolving one is audited.
