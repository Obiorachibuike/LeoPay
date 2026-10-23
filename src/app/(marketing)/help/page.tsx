import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/marketing/page-hero";

export const metadata: Metadata = { title: "Help centre" };

const faqs = [
  {
    q: "How do I start accepting live payments?",
    a: "Complete your business profile, then configure a payment provider in Dashboard → Settings → Payments. Live card and transfer payments require a provider account that has been approved for your business. LeoPay will show an explicit unavailable state until the provider is configured.",
  },
  {
    q: "Why is my payment still pending?",
    a: "A payment settles only when the provider confirms it. Bank transfers can take time to clear. Open the payment in Dashboard → Payments to see its status and provider reference. Never treat a pending payment as collected.",
  },
  {
    q: "How do I verify my email address?",
    a: "Open the verification link sent at registration, or resend it from Settings → Security. In local development the link is logged by the email adapter and shown once on the registration screen.",
  },
  {
    q: "Why can’t I withdraw an amount that appears in collections?",
    a: "Collections are not a wallet balance. Payouts use a ledger-derived estimate of settled funds minus refunds and completed payouts, and are also limited by your payout policy. Provider settlement timing may differ.",
  },
  {
    q: "How do invoices get marked paid?",
    a: "Only when a payment for that invoice is verified with the provider. Visiting a success page, or marking it manually, never marks an invoice as paid.",
  },
  {
    q: "My webhook is failing. What should I do?",
    a: "Check the delivery log in Dashboard → Developers for the response status and error. Endpoints must return a 2xx status within ten seconds. Private network destinations are rejected for security. You can redeliver a failed event manually.",
  },
  {
    q: "How do I add a team member?",
    a: "Dashboard → Team → Invite. Invitations expire after seven days. Roles determine what a member can do, and permissions are enforced on the server.",
  },
  {
    q: "I think my account is compromised.",
    a: "Change your password immediately, revoke active API keys and webhook secrets, then email security@leopay.app with details.",
  },
];

export default function HelpPage() {
  return (
    <>
      <PageHero
        eyebrow="Help centre"
        title="Answers to the questions that matter"
        description="Operational guidance for payments, invoices, payouts and integrations."
      />
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-2">
          {faqs.map((faq) => (
            <details key={faq.q} className="group rounded-xl border border-border bg-surface px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14px] font-medium">
                {faq.q}
                <span aria-hidden className="text-muted transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">{faq.a}</p>
            </details>
          ))}
        </div>
        <aside className="space-y-4">
          <div className="surface-card p-5">
            <h2 className="text-[14px] font-semibold">Still stuck?</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Send us the payment reference and what you expected to happen.
            </p>
            <Link href="/contact" className="mt-3 inline-block text-[13px] font-medium text-accent underline">
              Contact support
            </Link>
          </div>
          <div className="surface-card p-5">
            <h2 className="text-[14px] font-semibold">Developer questions</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">API, webhooks and test mode are documented.</p>
            <Link href="/docs" className="mt-3 inline-block text-[13px] font-medium text-accent underline">
              Read the docs
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
