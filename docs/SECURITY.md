# Security

## Threat model

Assets: customer and business data, API keys, session tokens, beneficiary bank details, money movement. Adversaries: unauthenticated visitors, authenticated users of another tenant, lower-privileged members of the same tenant, and a malicious merchant acting against its own customers.

## Controls

### Authentication

- Passwords hashed with `scrypt` (explicit cost parameters, per-password salt) and compared in constant time.
- Opaque session tokens (256-bit), stored only as SHA-256 hashes, delivered as `HttpOnly`, `SameSite=Lax` cookies, `Secure` in production.
- Login attempts are rate-limited per email and per IP; failures return a uniform message and take a similar amount of time (a dummy hash is verified for unknown accounts).
- Email verification and password reset tokens are hashed, single-use, expiring rows.
- Suspending a user or organization invalidates access immediately (checked on every request, sessions revocable).

### Authorization

- Role-based permissions (`owner`, `admin`, `finance`, `developer`, `viewer`) evaluated server-side by `requirePermission` in every page and action.
- Platform administration (`platformRole = 'admin'`) is a separate boundary with its own guard.
- Cross-tenant access returns 404; tests assert that another organization cannot read invoices, list links/orders or refund a payment.
- Payout approval enforces separation of duties; the last owner cannot be removed and ownership cannot be granted by invite.

### Input and output

- Zod validation at every action and API boundary; amounts and currency are never trusted from the client for payment links or invoices.
- JSON API bodies capped at 200 KB; pagination capped at 100 rows.
- CSV exports escape quotes/newlines and neutralise spreadsheet formula injection.
- React escapes output by default; no `dangerouslySetInnerHTML` for user data (the theme bootstrap script is static).
- Content-Security-Policy, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and HSTS set in middleware. `X-Frame-Options: DENY` in production for app pages; hosted payment pages remain embeddable by design.

### Webhooks and SSRF

- Provider webhooks require a valid signature over the raw body.
- Merchant webhook URLs are validated (scheme, credentials, literal private IPs) and DNS-resolved before delivery; private, loopback, link-local, CGNAT and metadata addresses are rejected. Redirects are not followed.
- Merchant deliveries are HMAC-SHA256 signed with a per-endpoint secret and a timestamp.

### Money

- Integer minor units only.
- Server-side verification of provider state, amount and currency before revenue is recognised.
- Double-entry ledger with balanced-entry enforcement and unique references (no double posting).
- Payout limits, approval thresholds, provider capability checks and no automatic retry of ambiguous transfers.

### Secrets and configuration

- `.env*` is git-ignored; `.env.example` contains placeholders only.
- No secret is sent to the browser; only `NEXT_PUBLIC_*` values appear client-side.
- `instrumentation.ts` refuses to start with fatal misconfiguration (weak secret, PGlite in production, mock provider in production, live provider without a key).
- Beneficiary account numbers are encrypted at rest with AES-256-GCM derived from `WEBHOOK_ENCRYPTION_KEY`; only the last four digits are displayed.
- API keys and session tokens never appear in logs.

### Auditing

Security-relevant actions write to `audit_logs` with actor, organization, target, IP and user agent where available: sign-in, role changes, invitations, refunds, payout decisions, API key and webhook changes, exports, administrative decisions.

## Deliberate limitations

- No MFA/TOTP yet.
- No automated identity document verification (manual review, no claims of regulatory approval).
- Rate limiting is a fixed window in PostgreSQL (accurate enough for abuse control, not a DDoS shield).
- CSP allows `'unsafe-inline'` scripts because Next.js injects inline bootstrap code; adopting nonces is a follow-up.
- Merchant webhook delivery does not pin resolved IPs between check and connect; a determined DNS-rebinding attacker could exploit the gap. Best practice for the deployment is to deliver from an egress-restricted network segment.

See [`OPERATIONS.md`](OPERATIONS.md) for incident handling.
