# LeoPay API v1

Base URL: `{APP_URL}/api/v1` · Version header: `LeoPay-Version: 2026-01-01`

## Authentication

Create a key in **Dashboard → Developers**. Keys are shown once; only a SHA-256 hash is stored.

```
Authorization: Bearer <your api key>
```

- `lp_test_…` keys are rejected in a production deployment (unless that deployment runs the mock provider).
- Every request is rate-limited per key (120 requests/minute) and every scope is checked server-side.
- Scopes: `payment_links:read|write`, `payments:read|write`, `invoices:read|write`, `customers:read|write`, `payouts:read|write`, `products:read`, `orders:read`.

## Errors

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Check the request body", "details": { "items": ["Add at least one line item"] } } }
```

| Status | Codes |
| --- | --- |
| 401 | `UNAUTHENTICATED` |
| 403 | `FORBIDDEN` (scope, suspended organization, unverified business) |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` (state transition, idempotency mismatch) |
| 422 | `VALIDATION_ERROR` |
| 429 | `RATE_LIMITED` |
| 5xx | `PROVIDER_ERROR`, `CONFIGURATION_ERROR`, `INTERNAL_ERROR` |

## Endpoints

### Health
`GET /health` — authenticated, any scope. Returns environment warnings (variable names only, never values).

### Payment links
- `GET /payment-links?status=&limit=&page=` → `{ data: [...], meta: { page, limit, total } }`
- `POST /payment-links` — `{ title, description?, amount_minor | allow_variable_amount + min/max, currency, collect_customer_phone?, expires_at? }`
- `GET /payment-links/:id`

### Checkout sessions
`POST /checkout/sessions`

```json
{
  "payment_link": "pl_xxx",
  "amount_minor": 250000,
  "customer": { "email": "ada@example.com", "name": "Ada Obi", "phone": "+234..." },
  "description": "Design retainer",
  "metadata": { "order_id": "42" }
}
```

Either `payment_link` (its fixed/min/max rules are enforced) or a merchant-supplied `amount_minor` + `currency` is required. The customer never sets the price in the link case.

Supports `Idempotency-Key: <8–200 chars>`. Replaying the same key with the same body returns the stored response; the same key with a different body returns `409`. Keys are scoped per organization and endpoint and stored with a request hash.

Response `201`:

```json
{
  "data": {
    "id": "uuid",
    "reference": "pay_xxx",
    "status": "pending",
    "amount_minor": 250000,
    "amount": "2500.00",
    "currency": "NGN",
    "authorization_url": "https://...",
    "channel": "api"
  }
}
```

`authorization_url` is the provider's hosted checkout. Redirect the customer there; the payment is only settled after provider verification.

### Payments
- `GET /payments?status=&from=&to=&limit=&page=`
- `GET /payments/:id` (UUID or internal reference) — includes refunds

### Customers
- `GET /customers`
- `POST /customers` — `{ name, email?, phone? }` (updates the existing record when the email already exists in your organization)

### Invoices
- `GET /invoices?status=`
- `POST /invoices`

```json
{
  "customer": { "name": "Lagos Property Group", "email": "accounts@example.com" },
  "items": [{ "description": "Interior design", "quantity": 1, "unit_amount_minor": 85000000 }],
  "discount_minor": 2000000,
  "tax_rate_bps": 750,
  "due_date": "2026-11-06",
  "status": "issued",
  "send": true
}
```

Totals are recomputed server-side. `send: true` queues the invoice email when the customer has an address.

### Payouts
- `GET /payouts`
- `POST /payouts` — `{ beneficiary_id, amount_minor, currency, reason? }`

Requires a verified business. The approval threshold and daily limit still apply; the accountable actor is the human who created the API key (or the organization owner), so separation of duties is preserved. API keys cannot bypass an approval.

### Orders
`GET /orders` — storefront orders with totals and customer details.

## Merchant webhooks

Create endpoints in **Dashboard → Developers**. Subscribed events:

`payment.pending`, `payment.succeeded`, `payment.failed`, `payment.refunded`, `invoice.created`, `invoice.paid`, `payout.processing`, `payout.succeeded`, `payout.failed`, `order.created`, `order.paid`

Delivery:

```
POST <your https url>
content-type: application/json
x-leopay-signature: t=1730000000,v1=<hex hmac-sha256>
x-leopay-event: payment.succeeded
```

Signature = `HMAC_SHA256(secret, "{timestamp}.{raw_body}")`.

Verify by recomputing the HMAC over the raw request body, comparing in constant time, and rejecting timestamps older than five minutes. Respond `2xx` quickly. Retries use exponential backoff (30s → 24h, six attempts); deliveries are inspectable and replayable from the dashboard. Destinations are SSRF-checked (private ranges, localhost, credentials in URLs and non-HTTP(S) schemes are rejected) before each attempt.

Payload:

```json
{ "id": "evt_uuid", "type": "payment.succeeded", "created_at": "2026-10-23T12:00:00.000Z", "data": { "...": "..." } }
```

## Provider webhooks (not for merchants)

`POST /api/webhooks/providers/{paystack|mock}`

- Paystack signatures (`x-paystack-signature`, HMAC-SHA512 of the raw body) are verified before parsing.
- Events are deduplicated on `(provider, event_id)`.
- The handler re-verifies the transaction with the provider; the payload's status and amount are not trusted.
- Invalid signatures return `401`; processing failures return `500` so the provider retries (processing is idempotent).

## Image delivery (not an API endpoint)

`GET /api/uploads/{organizationId}/{kind}/{sha256}.{ext}`

- Serves merchant-uploaded product photos, workspace logos and profile photos.
  Uploads themselves happen through dashboard server actions, not the public API.
- Keys are content hashes: responses are immutable and cacheable, with the
  content type derived from the sniffed file bytes and `X-Content-Type-Options:
  nosniff`.
- Unknown or malformed keys return `404`; a key never resolves outside the
  configured `UPLOAD_DIR`.
