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
| `mfa.test.ts` | RFC 6238 vectors, base32 round-trip, drift window, otpauth URI, QR rendering, recovery-code format/single-use/regeneration, enrolment gating, no double enrolment, challenge single-use + attempt burn + expiry + cross-user rejection, no session before the second factor, workspace MFA policy (gating, refusal to enforce without own MFA, persistence) |
| `paystack-contract.test.ts` | Recorded Paystack request/response shapes: initialize body and headers, status mapping (success/abandoned/reversed/ongoing), fee and paid-at parsing, refund/banks/account-resolve/transfer payloads, webhook HMAC-SHA512 accept/reject, transport and error-envelope handling, reference URL-encoding |
| `uploads.test.ts` | Magic-byte sniffing (rejects HTML/SVG/text renamed to `.png`), 4 MB cap, content-addressed dedupe, UUID-scoped keys, path-traversal refusal, key/tenant checks, image-reference schema (no `javascript:` or arbitrary same-origin paths), File bridge, DB persistence of logo/avatar, serving route headers and 404s |

## Provider contract fixtures

`tests/fixtures/paystack/*.json` hold recorded response shapes (no credentials). The adapter's `fetch` is stubbed, so the suite never touches the network. To refresh them against a sandbox account:

1. Point `PAYSTACK_SECRET_KEY` at a test key in a staging environment (never in this repository).
2. Capture the documented endpoints (`/transaction/initialize`, `/transaction/verify/:ref`, `/refund`, `/bank`, `/bank/resolve`, `/transferrecipient`, `/transfer`, `/transfer/verify/:ref`) with a funded test account and the same fields the adapter reads.
3. Replace the fixture files, keep the values non-identifying, and re-run `npx vitest run tests/paystack-contract.test.ts`.

## Not covered automatically

- Browser/visual regressions and real-device responsiveness. Playwright browsers cannot be downloaded in this environment (the CDN is blocked), so no browser suite is wired; add `@playwright/test` where browsers can be installed.
- Live provider calls (no credentials).
- Email delivery through a real provider.
- Load testing.

Manual smoke testing performed for this build: every dashboard page, both public checkout pages, the storefront, the invoice page and the admin console were fetched with an authenticated session and returned 200 with real seeded data. Server actions were exercised indirectly through the API and the seeded flows.

## Writing tests

Use `tests/helpers/factories.ts` (`makeUser`, `makeOrganization`) and call `resetDb()` in `beforeEach`. Never assert on generated random values; assert on invariants (statuses, balances, counts).
