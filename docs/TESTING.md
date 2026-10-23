# Testing

```bash
npm test              # unit + integration (PGlite)
npm run typecheck     # TypeScript
npm run lint          # ESLint
npm run build         # production build (includes type checking)
```

Tests run against an in-memory PGlite instance with the real migrations applied, so SQL, constraints, transactions and `FOR UPDATE` behave as they do in production.

## Coverage

| File | What it proves |
| --- | --- |
| `money.test.ts` | Minor-unit parsing/formatting, rounding, bps application, no float drift |
| `crypto.test.ts` | Password hashing + verification, token hashing, HMAC comparison, field encryption round-trip |
| `payments.test.ts` | Link checkout creates a pending payment; settlement requires provider verification; double verification is idempotent; refunds cannot exceed the paid amount; duplicate provider events are ignored; invoice totals settle correctly; ledger balances |
| `payouts.test.ts` | Capacity is derived from the ledger, approval threshold, daily limit, separation of duties, disabled beneficiary rejection, ledger integrity after payout |
| `storefront.test.ts` | Inventory reservation prevents overselling; cancelled orders release stock; public storefront hides unpublished stores |
| `invoices.test.ts` | Server-side totals (tax after discount), sequential invoice numbers, drafts cannot be paid, paid invoices cannot be cancelled, disabled links refuse payment |
| `tenancy.test.ts` | Another organization cannot read an invoice, list links/orders, or refund a payment |
| `security.test.ts` | SSRF blocks localhost/private IPv4, IPv6 literals, credentials in URLs and non-HTTP schemes; rate limiting blocks after the limit; API keys authenticate and enforce scopes; provider webhook replay is ignored; unbalanced ledger entries are rejected; duplicate references do not double-post |
| `api.test.ts` | API v1 requires a key and scope, rejects invalid payloads, creates checkout sessions, honours `Idempotency-Key` (including conflict on body change), lists only the caller's links, health leaks nothing, provider webhooks reject unsigned calls |

## Not covered automatically

- Browser/visual regressions and real-device responsiveness (no browser runtime in this environment).
- Live provider calls (no credentials).
- Email delivery through a real provider.
- Load testing.

Manual smoke testing performed for this build: every dashboard page, both public checkout pages, the storefront, the invoice page and the admin console were fetched with an authenticated session and returned 200 with real seeded data. Server actions were exercised indirectly through the API and the seeded flows.

## Writing tests

Use `tests/helpers/factories.ts` (`makeUser`, `makeOrganization`) and call `resetDb()` in `beforeEach`. Never assert on generated random values; assert on invariants (statuses, balances, counts).
