import type { Metadata } from "next";
import { ArrowRight, Boxes, Code2, KeyRound, Repeat, ShieldCheck, Terminal } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Developers" };

export default function DevelopersPage() {
  return (
    <>
      <PageHero
        eyebrow="Developers"
        title="A payments API you can reason about"
        description="Versioned endpoints, scoped keys, idempotent financial writes, consistent errors and webhooks signed with a scheme you can verify in a few lines."
        actions={
          <>
            <ButtonLink href="/docs">Read the docs <ArrowRight className="h-4 w-4" /></ButtonLink>
            <ButtonLink href="/register" variant="secondary">Create a sandbox workspace</ButtonLink>
          </>
        }
      />

      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: KeyRound, title: "Scoped API keys", copy: "Test and live keys with explicit scopes. Secrets are shown once and stored only as hashes." },
            { icon: Repeat, title: "Idempotency", copy: "Send an Idempotency-Key on financial writes. The same key returns the original response, never a second charge." },
            { icon: ShieldCheck, title: "Verifiable webhooks", copy: "HMAC-SHA256 signatures with timestamps, exponential backoff retries and manual redelivery." },
            { icon: Code2, title: "Consistent responses", copy: "Predictable JSON envelopes with machine-readable error codes and field-level validation details." },
            { icon: Boxes, title: "Cursor-friendly pagination", copy: "Page and page_size parameters with totals, so you can build stable lists." },
            { icon: Terminal, title: "Real examples", copy: "TypeScript-first documentation with copy-paste request and response examples that match the implementation." },
          ].map((item) => (
            <div key={item.title} className="surface-card p-5">
              <item.icon className="h-5 w-5 text-accent" aria-hidden />
              <h2 className="mt-3 text-[14px] font-semibold">{item.title}</h2>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{item.copy}</p>
            </div>
          ))}
        </div>

        <section className="mt-12 grid gap-6 lg:grid-cols-2" aria-labelledby="quickstart">
          <div>
            <h2 id="quickstart" className="text-[22px] font-semibold tracking-tight">Quick start</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
              Create an API key in Dashboard → Developers, then call the sandbox API. All requests are scoped to the
              organization that owns the key.
            </p>
            <ol className="mt-5 space-y-3 text-[13px] text-muted-strong">
              {[
                "Create a test API key with the scopes your integration needs.",
                "Create a payment link and redirect the customer to its checkout URL.",
                "Verify the payment server-side, or handle the signed payment.succeeded webhook.",
                "Never mark an order as paid based on a browser redirect alone.",
              ].map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-foreground">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Badge tone="neutral">REST · JSON</Badge>
              <Badge tone="neutral">/api/v1</Badge>
              <Badge tone="neutral">Bearer auth</Badge>
              <Badge tone="success" dot>Idempotent writes</Badge>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-[#0B1220] text-slate-200">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 text-[11px] text-slate-400">
              <span>create a payment link</span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono">bash</span>
            </div>
            <pre className="scroll-thin overflow-x-auto p-4 text-[12px] leading-relaxed">
              <code>{`curl -X POST https://your-domain.com/api/v1/payment-links \\
  -H "Authorization: Bearer lp_test_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Website design deposit",
    "amount_minor": 250000,
    "currency": "NGN"
  }'`}</code>
            </pre>
            <div className="border-t border-white/10 px-4 py-2.5 text-[11px] text-slate-400">Response</div>
            <pre className="scroll-thin overflow-x-auto px-4 pb-4 text-[12px] leading-relaxed">
              <code>{`{
  "data": {
    "id": "…",
    "public_reference": "pl_…",
    "checkout_url": "…/pay/pl_…",
    "status": "active",
    "amount_minor": 250000,
    "currency": "NGN"
  }
}`}</code>
            </pre>
          </div>
        </section>

        <section className="mt-12" aria-labelledby="webhook-heading">
          <h2 id="webhook-heading" className="text-[22px] font-semibold tracking-tight">Verify a webhook</h2>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            The <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[12px]">LeoPay-Signature</code> header
            contains <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[12px]">t=&lt;timestamp&gt;,v1=&lt;hmac&gt;</code>.
            Compute HMAC-SHA256 over <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[12px]">timestamp + &quot;.&quot; + rawBody</code> and compare in constant time. Reject timestamps older than
            five minutes.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-[#0B1220] p-4 text-[12px] leading-relaxed text-slate-200">
            <code>{`import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(rawBody: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const timestamp = Number(parts.t);
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1 ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}`}</code>
          </pre>
        </section>
      </div>
    </>
  );
}
