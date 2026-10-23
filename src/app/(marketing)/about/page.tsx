import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/page-hero";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About"
        title="Money should be clear, not complicated"
        description="LeoPay is a business payments platform built for Nigerian businesses that want to collect, invoice, sell and understand their money without a stack of disconnected tools."
      />
      <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
        <div className="space-y-5 text-[14px] leading-relaxed text-muted-strong">
          <p>
            Most small businesses do not lose money because they cannot accept payments. They lose clarity: which
            invoice is still open, what the provider actually charged, what was refunded, and what is genuinely available.
            LeoPay is built around fixing that clarity problem.
          </p>
          <p>
            We start in Nigeria with the naira, because that is where our first customers operate. The platform is built
            with configurable currency metadata, provider adapters and country settings so it can expand without
            hardcoding assumptions — but nothing beyond NGN is enabled until it genuinely works.
          </p>
          <h2 className="pt-4 text-[19px] font-semibold tracking-tight text-foreground">What we are deliberate about</h2>
          <ul className="space-y-2">
            <li>• We do not present an estimate as a balance, or a redirect as a payment.</li>
            <li>• We do not invent fees, certifications or customer statistics.</li>
            <li>• We do not move money without verification, authorization and a record.</li>
            <li>• When a capability is unavailable, we say so instead of pretending.</li>
          </ul>
          <h2 className="pt-4 text-[19px] font-semibold tracking-tight text-foreground">Where we are going</h2>
          <p>
            The roadmap is deliberately unglamorous: deeper reconciliation, richer reporting, additional provider
            adapters, and multi-currency support where the operational and regulatory groundwork exists.
          </p>
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <ButtonLink href="/register">Create your account</ButtonLink>
          <ButtonLink href="/contact" variant="secondary">Talk to us</ButtonLink>
        </div>
      </div>
    </>
  );
}
