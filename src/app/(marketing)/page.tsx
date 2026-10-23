import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Code2,
  CreditCard,
  FileText,
  Link2,
  Lock,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  Store,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductPreview } from "@/components/marketing/product-preview";
import { pricingConfig, platformFeeLabel } from "@/lib/pricing";

const features = [
  {
    icon: Link2,
    title: "Payment links",
    description: "Create a secure checkout link in seconds, share it anywhere, and get paid without a website.",
    href: "/features#payment-links",
  },
  {
    icon: FileText,
    title: "Invoicing",
    description: "Professional invoices with line items, tax, discounts, PDF export, email delivery and reminders.",
    href: "/features#invoicing",
  },
  {
    icon: Store,
    title: "Storefronts",
    description: "Publish a hosted storefront for your products with stock control that resists overselling.",
    href: "/features#storefront",
  },
  {
    icon: BarChart3,
    title: "Business analytics",
    description: "Track collections, fees, refunds, payouts and outstanding invoices with clear separation.",
    href: "/features#analytics",
  },
  {
    icon: Wallet,
    title: "Payout management",
    description: "Pay beneficiaries through a controlled workflow with approvals and separation of duties.",
    href: "/features#payouts",
  },
  {
    icon: Code2,
    title: "Developer platform",
    description: "Versioned REST API, API keys with scopes, signed webhooks you can verify and replay.",
    href: "/developers",
  },
];

const useCases = [
  { icon: Building2, title: "Agencies", copy: "Invoice retainers, collect project deposits, and pay contractors from one workspace." },
  { icon: Receipt, title: "Freelancers", copy: "Send a payment link or invoice and see exactly when money lands." },
  { icon: ShoppingBag, title: "Online sellers", copy: "Publish a lightweight storefront with real inventory tracking." },
  { icon: Users, title: "Growing finance teams", copy: "Give finance read access, developers API keys, and keep an audit trail." },
];

const steps = [
  { title: "Create your workspace", copy: "Register, verify your email and add your business details in a guided setup." },
  { title: "Connect payments", copy: "Configure your payment provider account in Settings. Availability depends on provider approval." },
  { title: "Collect and track", copy: "Share a link, send an invoice or publish a storefront — every payment is verified server-side." },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div aria-hidden className="hero-grid absolute inset-0 -z-10" />
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-24">
          <div className="animate-rise">
            <Badge tone="success" dot className="mb-5">
              Built for Nigerian businesses · NGN first
            </Badge>
            <h1 className="text-[34px] font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl lg:text-[54px]">
              Payments that move your business forward.
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-strong sm:text-base">
              Collect payments, send invoices, manage your storefront, and understand your business finances from one
              secure workspace.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/register" size="lg" className="w-full sm:w-auto">
                Create your account <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/features" variant="secondary" size="lg" className="w-full sm:w-auto">
                Explore the platform
              </ButtonLink>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] text-muted">
              {["No card required to start", "Server-verified payments", "Audit trail included"].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-accent" aria-hidden /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="animate-rise lg:justify-self-end">
            <ProductPreview />
          </div>
        </div>
      </section>

      {/* Trust */}
      <section aria-labelledby="trust-heading" className="border-b border-border bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          <h2 id="trust-heading" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Designed around financial control
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: ShieldCheck,
                title: "Server-side verification",
                copy: "Payment state changes only when your provider confirms the transaction — never from a browser redirect.",
              },
              {
                icon: Lock,
                title: "Tenant isolation",
                copy: "Every record is scoped to an organization with role checks on every sensitive operation.",
              },
              {
                icon: Receipt,
                title: "Double-entry ledger",
                copy: "Collections, fees, refunds and payouts post as balanced, immutable journal entries.",
              },
              {
                icon: Users,
                title: "Controls that scale",
                copy: "Roles, payout approvals and a complete audit trail as your finance team grows.",
              },
            ].map((item) => (
              <div key={item.title}>
                <item.icon className="h-5 w-5 text-accent" aria-hidden />
                <h3 className="mt-3 text-sm font-semibold text-foreground">{item.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{item.copy}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 rounded-lg border border-border bg-surface-2/60 px-4 py-3 text-[12px] leading-relaxed text-muted">
            LeoPay is a payments software platform, not a bank or a licensed payment institution. Payment processing is
            performed by licensed payment providers. Verification requirements and provider eligibility are set by your
            provider and applicable regulation.
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" aria-labelledby="features-heading" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">The platform</p>
          <h2 id="features-heading" className="mt-2 text-[28px] font-semibold tracking-tight sm:text-[36px]">
            One workspace for the money side of your business
          </h2>
          <p className="mt-3 text-[14.5px] leading-relaxed text-muted-strong">
            LeoPay brings collection, invoicing, commerce and financial visibility together — without stitching five
            tools together.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Link
              key={feature.title}
              href={feature.href}
              className="group surface-card p-5 transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[var(--shadow-md)]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-accent">
                <feature.icon className="h-4 w-4" aria-hidden />
              </div>
              <h3 className="mt-4 text-[15px] font-semibold text-foreground">{feature.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{feature.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
                Learn more <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-border bg-surface" aria-labelledby="how-heading">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">How LeoPay works</p>
              <h2 id="how-heading" className="mt-2 text-[28px] font-semibold tracking-tight sm:text-[34px]">
                Set up once. Get paid continuously.
              </h2>
              <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-strong">
                Onboarding is explicit about what each step unlocks. Completing LeoPay onboarding does not itself grant
                access to regulated payment services.
              </p>
              <ButtonLink href="/register" variant="secondary" className="mt-6">
                Start onboarding
              </ButtonLink>
            </div>
            <ol className="space-y-4">
              {steps.map((step, index) => (
                <li key={step.title} className="flex gap-4 rounded-xl border border-border bg-background p-5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-[13px] font-semibold text-foreground">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-[14.5px] font-semibold text-foreground">{step.title}</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">{step.copy}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section aria-labelledby="usecases-heading" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 id="usecases-heading" className="text-[28px] font-semibold tracking-tight sm:text-[34px]">
          Built for how Nigerian businesses actually work
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {useCases.map((useCase) => (
            <div key={useCase.title} className="rounded-xl border border-border bg-surface p-5">
              <useCase.icon className="h-5 w-5 text-accent" aria-hidden />
              <h3 className="mt-3 text-sm font-semibold">{useCase.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{useCase.copy}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Developers */}
      <section className="border-y border-border bg-[#0B1220] text-white" aria-labelledby="dev-heading">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-400">Developer platform</p>
            <h2 id="dev-heading" className="mt-2 text-[28px] font-semibold tracking-tight sm:text-[34px]">
              Integrate payments without fighting the API
            </h2>
            <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-slate-300">
              A versioned REST API, scoped keys, idempotency on financial writes and HMAC-signed webhooks with retries
              and manual redelivery.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/developers" className="bg-emerald-400 text-[#04110B] hover:bg-emerald-300">
                Explore the API
              </ButtonLink>
              <ButtonLink href="/docs" variant="outline" className="border-white/25 text-white hover:bg-white/10">
                Read the docs
              </ButtonLink>
            </div>
          </div>
          <pre className="scroll-thin overflow-x-auto rounded-xl border border-white/10 bg-white/[0.04] p-5 text-[12.5px] leading-relaxed text-slate-200">
            <code>{`import { LeoPay } from "@leopay/node";

const leopay = new LeoPay(process.env.LEOPAY_SECRET_KEY);

const link = await leopay.paymentLinks.create({
  title: "Website design deposit",
  amount_minor: 250000,
  currency: "NGN",
  allow_variable_amount: false,
});`}</code>
          </pre>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="surface-card grid gap-6 p-6 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <Badge tone="neutral" className="mb-3">
              {pricingConfig.status === "indicative" ? "Indicative pricing" : "Pricing"}
            </Badge>
            <h2 className="text-[24px] font-semibold tracking-tight sm:text-[28px]">
              Start free. Pay your provider for processing.
            </h2>
            <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted">
              {platformFeeLabel()}. Provider processing fees are set by your payment provider and are not charged by
              LeoPay. Final commercial terms are confirmed before you accept live payments.
            </p>
          </div>
          <ButtonLink href="/pricing" variant="secondary" size="lg">
            See pricing details
          </ButtonLink>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border bg-surface" aria-labelledby="faq-heading">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 id="faq-heading" className="text-[28px] font-semibold tracking-tight sm:text-[32px]">
              Frequently asked questions
            </h2>
            <p className="mt-2 text-[13.5px] text-muted">
              Something else? <Link href="/contact" className="font-medium text-accent hover:underline">Contact our team</Link>.
            </p>
          </div>
          <div className="space-y-2">
            {[
              {
                q: "Is LeoPay a bank?",
                a: "No. LeoPay is a payments and financial operations platform. Customer payments are processed by licensed payment providers. LeoPay does not hold deposits and does not present your collections as a bank balance.",
              },
              {
                q: "Can I accept payments immediately after signing up?",
                a: "You can explore the full product immediately. Accepting live payments requires a configured payment provider and provider approval for your business. Until then, checkout shows a clear unavailable state instead of failing silently.",
              },
              {
                q: "Which payment methods are supported?",
                a: "Methods are determined by your provider and merchant account. LeoPay only displays methods the configured provider supports; card, bank transfer and USSD availability depends on provider approval.",
              },
              {
                q: "How do payouts work?",
                a: "Payouts require a verified beneficiary, a configured provider with payout capability, and sufficient settled collections. Amounts above your approval threshold require a second approver, and uncertain provider outcomes are held for verification rather than retried automatically.",
              },
              {
                q: "Can I integrate LeoPay into my own product?",
                a: "Yes. Create scoped API keys in the developer section, use the versioned REST API with idempotency keys on financial writes, and verify the HMAC signature on every webhook you receive.",
              },
            ].map((item) => (
              <details key={item.q} className="group rounded-xl border border-border bg-background px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14px] font-medium text-foreground">
                  {item.q}
                  <span aria-hidden className="text-muted transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-[13px] leading-relaxed text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden border-t border-border">
        <div aria-hidden className="dot-grid absolute inset-0 -z-10 opacity-60" />
        <div className="mx-auto w-full max-w-4xl px-4 py-20 text-center sm:px-6">
          <Zap className="mx-auto h-6 w-6 text-accent" aria-hidden />
          <h2 className="mt-4 text-[30px] font-semibold tracking-tight sm:text-[38px]">
            Your business. Your money. Your momentum.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[14.5px] leading-relaxed text-muted-strong">
            Set up your workspace, create your first payment link, and see how clear your money can look.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/register" size="lg">
              <CreditCard className="h-4 w-4" /> Create your account
            </ButtonLink>
            <ButtonLink href="/contact" variant="secondary" size="lg">
              Talk to our team
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
