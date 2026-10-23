import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Prose } from "@/components/marketing/page-hero";

export const metadata: Metadata = { title: "Documentation" };

export default function DocsPage() {
  return (
    <>
      <PageHero
        eyebrow="Documentation"
        title="LeoPay developer documentation"
        description="Authentication, endpoints, errors, idempotency and webhook verification — describing exactly what the implementation does."
      />
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Docs" className="hidden lg:block">
          <div className="sticky top-24 space-y-1 text-[13px]">
            {[
              ["#authentication", "Authentication"],
              ["#errors", "Errors"],
              ["#idempotency", "Idempotency"],
              ["#pagination", "Pagination & rate limits"],
              ["#api", "API reference"],
              ["#webhooks", "Webhooks"],
              ["#testing", "Test mode"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="block rounded-lg px-3 py-2 text-muted-strong hover:bg-surface-2 hover:text-foreground">
                {label}
              </a>
            ))}
          </div>
        </nav>
        <div className="min-w-0">
          <Prose>
            <h2 id="authentication">Authentication</h2>
            <p>
              All API requests are authenticated with a Bearer API key created in Dashboard → Developers. Keys are scoped
              to one organization and carry explicit scopes. The raw key is shown once at creation; LeoPay stores only a
              SHA-256 hash and a short prefix for identification.
            </p>
            <pre className="overflow-x-auto rounded-xl border border-border bg-[#0B1220] p-4 text-[12px] leading-relaxed text-slate-200">
              <code>{`Authorization: Bearer <your api key>`}</code>
            </pre>
            <p>
              Test keys only operate where the deployment runs the test payment provider; live keys are required against
              a live provider. Revoke a key at any time — revocation is immediate.
            </p>

            <h2 id="errors">Errors</h2>
            <p>Errors use HTTP status codes plus a stable envelope. Validation errors include per-field details.</p>
            <pre className="overflow-x-auto rounded-xl border border-border bg-[#0B1220] p-4 text-[12px] leading-relaxed text-slate-200">
              <code>{`{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Enter a title",
    "details": { "title": ["Enter a title"] }
  }
}`}</code>
            </pre>
            <p>
              Codes: <code>VALIDATION_ERROR</code> (422), <code>UNAUTHENTICATED</code> (401), <code>FORBIDDEN</code> (403),{" "}
              <code>NOT_FOUND</code> (404), <code>CONFLICT</code> (409), <code>RATE_LIMITED</code> (429),{" "}
              <code>PAYMENT_ERROR</code> (402), <code>PROVIDER_ERROR</code> (502), <code>PROVIDER_NOT_CONFIGURED</code>{" "}
              (503).
            </p>

            <h2 id="idempotency">Idempotency</h2>
            <p>
              Financial write endpoints (<code>POST /api/v1/checkout/sessions</code>, <code>POST /api/v1/payouts</code>)
              accept an <code>Idempotency-Key</code> header containing 8–120 characters. Replaying the same key with the
              same body returns the original response. Reusing a key with a different body is rejected with{" "}
              <code>CONFLICT</code>.
            </p>

            <h2 id="pagination">Pagination and rate limits</h2>
            <p>
              List endpoints accept <code>page</code> (default 1) and <code>page_size</code> (default 20, maximum 100) and
              return <code>meta.total</code>. API keys are limited to 120 requests per minute; exceeding the limit returns{" "}
              <code>429</code> with a <code>Retry-After</code> header.
            </p>

            <h2 id="api">API reference</h2>
            <table className="w-full text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-[0.08em] text-muted">
                <tr>
                  <th className="py-2 pr-4">Method</th>
                  <th className="py-2 pr-4">Path</th>
                  <th className="py-2">Scope</th>
                </tr>
              </thead>
              <tbody className="[&_td]:border-t [&_td]:border-border [&_td]:py-2 [&_td]:pr-4">
                {([
                  ["GET", "/api/v1/payment-links", "payment_links:read"],
                  ["POST", "/api/v1/payment-links", "payment_links:write"],
                  ["GET", "/api/v1/payment-links/{id}", "payment_links:read"],
                  ["POST", "/api/v1/checkout/sessions", "payments:write"],
                  ["GET", "/api/v1/payments", "payments:read"],
                  ["GET", "/api/v1/payments/{id}", "payments:read"],
                  ["GET", "/api/v1/customers", "customers:read"],
                  ["POST", "/api/v1/customers", "customers:write"],
                  ["GET", "/api/v1/invoices", "invoices:read"],
                  ["POST", "/api/v1/invoices", "invoices:write"],
                  ["GET", "/api/v1/payouts", "payouts:read"],
                  ["POST", "/api/v1/payouts", "payouts:write"],
                  ["GET", "/api/v1/orders", "orders:read"],
                  ["GET", "/api/v1/health", "any valid key"],
                ] as Array<[string, string, string]>).map(([method, path, scope]) => (
                  <tr key={method + path}>
                    <td className="font-mono text-[12px]">{method}</td>
                    <td className="font-mono text-[12px]">{path}</td>
                    <td className="font-mono text-[12px] text-muted">{scope}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>Create a checkout session</h3>
            <pre className="overflow-x-auto rounded-xl border border-border bg-[#0B1220] p-4 text-[12px] leading-relaxed text-slate-200">
              <code>{`POST /api/v1/checkout/sessions
{
  "payment_link_id": "uuid",
  "amount_minor": 250000,        // required for variable-amount links
  "customer": { "name": "Ada Obi", "email": "ada@example.com" }
}

200 { "data": { "payment_id": "…", "checkout_url": "https://paystack.com/…", "status": "pending" } }`}</code>
            </pre>

            <h2 id="webhooks">Webhooks</h2>
            <p>
              Configure endpoints in Dashboard → Developers. Events are delivered asynchronously from a durable outbox,
              so a delivery failure never reverses a payment. Delivery is retried with exponential backoff for up to six
              attempts; final failures are visible in the dashboard and can be redelivered manually.
            </p>
            <p>
              Event types: <code>payment.pending</code>, <code>payment.succeeded</code>, <code>payment.failed</code>,{" "}
              <code>payment.refunded</code>, <code>invoice.created</code>, <code>invoice.paid</code>,{" "}
              <code>payout.processing</code>, <code>payout.succeeded</code>, <code>payout.failed</code>,{" "}
              <code>order.created</code>, <code>order.paid</code>. Only events corresponding to implemented operations
              are emitted.
            </p>
            <p>
              Webhook destinations are validated against SSRF: private, loopback and link-local addresses are rejected,
              redirects are not followed, and the hostname is re-resolved before each delivery.
            </p>

            <h2 id="testing">Test mode</h2>
            <p>
              When the deployment runs the test payment provider, checkouts redirect to a clearly-labelled test page that
              simulates success or failure. Test transactions are tagged with the test provider and are never presented
              as live money. Automated tests in the repository exercise the full flow against this provider.
            </p>
            <p>
              Need the full setup guide? See the{" "}
              <Link href="/help">help centre</Link> and the repository <code>DEPLOYMENT.md</code>.
            </p>
          </Prose>
        </div>
      </div>
    </>
  );
}
