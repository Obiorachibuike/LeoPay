# Security

## Threat model

Assets: customer and business data, API keys, session tokens, beneficiary bank details, money movement. Adversaries: unauthenticated visitors, authenticated users of another tenant, lower-privileged members of the same tenant, and a malicious merchant acting against its own customers.

## Controls

### Authentication

- Passwords hashed with `scrypt` (explicit cost parameters, per-password salt) and compared in constant time.
- Opaque session tokens (256-bit), stored only as SHA-256 hashes, delivered as `HttpOnly`, `SameSite=Lax` cookies, `Secure` in production.
- Login attempts are rate-limited per email and per IP; failures return a uniform message and take a similar amount of time (a dummy hash is verified for unknown accounts).
- Email verification and password reset tokens are hashed, single-use, expiring rows.
- Two-factor authentication (RFC 6238 TOTP, ±1 step drift, constant-time comparison). No session is created from a password alone when MFA is on: the password step issues a short-lived, single-use, hashed challenge token (10 minutes, 5 attempts, bound to the user) and the session only exists after a valid TOTP or recovery code.
- TOTP secrets are encrypted at rest (AES-256-GCM); recovery codes are stored as SHA-256 hashes, shown once, and consumed atomically.
- Workspace owners can require MFA for owners/admins. When on (or when `REQUIRE_MFA_FOR_ADMINS` is set platform-wide), `requirePermission` refuses `org:manage`, `member:manage`, `payout:approve` and `developer:manage` for privileged users who have not enrolled.
- Suspending a user or organization invalidates access immediately (checked on every request, sessions revocable).

### Authorization

- Role-based permissions (`owner`, `admin`, `finance`, `developer`, `viewer`) evaluated server-side by `requirePermission` in every page and action.
- Platform administration (`platformRole = 'admin'`) is a separate boundary with its own guard.
- Cross-tenant access returns 404; tests assert that another organization cannot read invoices, list links/orders or refund a payment.
- Payout approval enforces separation of duties; the last owner cannot be removed and ownership cannot be granted by invite.
- MFA gating is enforced in the permission check, not in the UI: hiding a button never substitutes for the server-side refusal.

### Input and output

- Zod validation at every action and API boundary; amounts and currency are never trusted from the client for payment links or invoices.
- JSON API bodies capped at 200 KB; pagination capped at 100 rows.
- CSV exports escape quotes/newlines and neutralise spreadsheet formula injection.
- React escapes output by default; no `dangerouslySetInnerHTML` for user data (the theme bootstrap script is static).
- Uploads are identified by magic bytes, not by the client's MIME type or filename; only PNG/JPEG/WebP/GIF are accepted, capped at 4 MB, stored under `<organization>/<kind>/<sha256>.<ext>` and served by a route that sets the sniffed content type, `nosniff`, an immutable cache policy and a sandboxing CSP. SVG and HTML are rejected, so an upload cannot become a script on our origin.
- Upload keys are unguessable content hashes and namespaced per organization; uploaders cannot choose the storage key.
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
- No secret is sent to the browser; only `NEXT_PUBLIC_*` values appear client-side. The database URL never leaves the server: logs print `host:port/database` only (no credentials), and the health endpoint reports the driver name alone.
- `instrumentation.ts` refuses to start with fatal misconfiguration (weak secret, missing DATABASE_URL or the test-only PGlite driver in production, mock provider in production, live provider without a key).
- Beneficiary account numbers are encrypted at rest with AES-256-GCM derived from `WEBHOOK_ENCRYPTION_KEY`; only the last four digits are displayed.
- API keys and session tokens never appear in logs.

### Auditing

Security-relevant actions write to `audit_logs` with actor, organization, target, IP and user agent where available: sign-in, MFA enrolment/disable/recovery use/policy changes, role changes, invitations, refunds, payout decisions, API key and webhook changes, exports, administrative decisions.

## Deliberate limitations

- MFA covers TOTP only: no WebAuthn/passkeys, no SMS, no per-device "remember this browser", and no break-glass recovery for a user who loses both their authenticator and their recovery codes (a platform admin would have to reset it in the database).
- The workspace MFA policy gates sensitive permissions; it does not force every admin to enrol before viewing dashboards.
- No antivirus or image re-encoding: uploaded bytes are sniffed, size-capped and served with a locked content type, but a malformed image is not decoded.
- Uploaded files live on a local volume (`UPLOAD_DIR`); there is no object-storage/CDN driver, no signed-URL access control, and deleting a record does not delete its file.
- No automated identity document verification (manual review, no claims of regulatory approval).
- Rate limiting is a fixed window in PostgreSQL (accurate enough for abuse control, not a DDoS shield).
- CSP allows `'unsafe-inline'` scripts because Next.js injects inline bootstrap code; adopting nonces is a follow-up.
- Merchant webhook delivery does not pin resolved IPs between check and connect; a determined DNS-rebinding attacker could exploit the gap. Best practice for the deployment is to deliver from an egress-restricted network segment.

See [`OPERATIONS.md`](OPERATIONS.md) for incident handling.
