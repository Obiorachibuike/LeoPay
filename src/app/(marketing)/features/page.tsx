import type { Metadata } from "next";
import { ArrowRight, BarChart3, CheckCircle2, Code2, FileText, Link2, ShoppingBag, Store, Users, Wallet } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Features" };

const sections = [
  {
    id: "payment-links",
    icon: Link2,
    title: "Payment links",
    copy: "Create a hosted checkout in seconds. Set a fixed or customer-chosen amount within limits you control, add an expiry date, and share the link anywhere.",
    points: [
      "Server-validated amounts — the browser can never change the price",
      "Expired or disabled links are rejected before checkout starts",
      "Redirect handling with clear success, pending and failure states",
      "Payment history and conversion counts per link",
    ],
  },
  {
    id: "invoicing",
    icon: FileText,
    title: "Invoicing",
    copy: "Bill customers with itemised invoices, tax and discounts, then track the balance until it is actually paid.",
    points: [
      "Sequential invoice numbers allocated safely under concurrency",
      "Totals recalculated and validated on the server",
      "PDF export, email delivery and manual reminders",
      "Invoices only become paid when a payment is verified",
    ],
  },
  {
    id: "storefront",
    icon: Store,
    title: "Storefronts and orders",
    copy: "Publish a lightweight hosted storefront for physical or digital products, with stock control that prevents overselling.",
    points: [
      "Product images, SKUs and inventory tracking",
      "Atomic stock reservation at checkout",
      "Stock released automatically if an order is cancelled",
      "Orders only marked paid after payment verification",
    ],
  },
  {
    id: "analytics",
    icon: BarChart3,
    title: "Analytics and reporting",
    copy: "Understand what you collected, what you paid in fees, what was refunded and what is still outstanding — each shown separately.",
    points: [
      "Date filters including custom ranges",
      "Collections vs provider fees vs refunds vs payouts",
      "CSV export scoped to your organization",
      "Ledger balances distinct from collections",
    ],
  },
  {
    id: "payouts",
    icon: Wallet,
    title: "Payouts and beneficiaries",
    copy: "Pay out with a controlled workflow instead of a one-click button that can move money by accident.",
    points: [
      "Bank account names resolved with your provider before saving",
      "Approval threshold and separation of duties",
      "Ledger-derived capacity — not a fabricated wallet balance",
      "Uncertain provider outcomes held for verification, never retried blindly",
    ],
  },
  {
    id: "team",
    icon: Users,
    title: "Team and controls",
    copy: "Give people the access they need. Owners, administrators, finance, developers and viewers each get a distinct permission set.",
    points: [
      "Role checks on the server for every sensitive action",
      "Organization-scoped data access",
      "Invitations by email with expiry",
      "Complete audit log of sensitive activity",
    ],
  },
  {
    id: "developer",
    icon: Code2,
    title: "Developer platform",
    copy: "Integrate LeoPay into your own applications with scoped keys, a versioned API and verifiable webhooks.",
    points: [
      "API keys stored as hashes, shown once at creation",
      "Idempotency keys for financial writes",
      "HMAC-signed webhooks with timestamp replay protection",
      "Manual redelivery and delivery inspection",
    ],
  },
  {
    id: "commerce-guardrails",
    icon: ShoppingBag,
    title: "Financial guardrails",
    copy: "The unglamorous parts that protect your money: balanced ledgers, idempotency and reconciliation.",
    points: [
      "Append-only double-entry journal, balanced before commit",
      "Provider amount and currency verified before settlement",
      "Duplicate webhook events ignored by unique event id",
      "Reconciliation exceptions for missing or mismatched records",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        eyebrow="Product"
        title="Everything you need to collect and understand payments"
        description="LeoPay combines collection, invoicing, commerce and financial visibility in a single workspace — with the controls a finance team expects."
        actions={<ButtonLink href="/register">Create your account <ArrowRight className="h-4 w-4" /></ButtonLink>}
      />
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Features" className="hidden lg:block">
          <div className="sticky top-24 space-y-1">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="block rounded-lg px-3 py-2 text-[13px] text-muted-strong hover:bg-surface-2 hover:text-foreground"
              >
                {section.title}
              </a>
            ))}
          </div>
        </nav>
        <div className="space-y-10">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-accent">
                  <section.icon className="h-4 w-4" aria-hidden />
                </div>
                <h2 className="text-[21px] font-semibold tracking-tight">{section.title}</h2>
              </div>
              <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted-strong">{section.copy}</p>
              <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {section.points.map((point) => (
                  <li key={point} className="flex gap-2 text-[13px] leading-relaxed text-muted">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <div className="surface-card flex flex-col justify-between gap-4 p-6 sm:flex-row sm:items-center">
            <div>
              <Badge tone="success" dot>Ready when you are</Badge>
              <p className="mt-2 text-[15px] font-semibold">See it with your own data</p>
              <p className="text-[13px] text-muted">Create a workspace and start with a payment link or invoice.</p>
            </div>
            <ButtonLink href="/register">Get started</ButtonLink>
          </div>
        </div>
      </div>
    </>
  );
}
