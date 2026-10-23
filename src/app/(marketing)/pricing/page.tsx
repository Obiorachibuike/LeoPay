import type { Metadata } from "next";
import { Check, Info } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pricingConfig, platformFeeLabel } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Pricing" };

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Clear pricing, with provider fees kept separate"
        description="LeoPay does not invent processing fees. What you pay your payment provider is set by your provider contract and shown separately from any LeoPay charge."
      >
        <div className="mt-6 inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-warning-soft/60 px-3 py-2 text-[12.5px] text-amber-900 dark:text-amber-200">
          <Info className="h-4 w-4" aria-hidden />
          {pricingConfig.status === "indicative"
            ? "Pricing is indicative pending final commercial approval. Confirm fees with your provider before accepting live payments."
            : "Pricing reflects the currently configured commercial terms."}
        </div>
      </PageHero>

      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-3">
          {pricingConfig.plans.map((plan) => (
            <article
              key={plan.name}
              className={cn(
                "surface-card flex flex-col p-6",
                plan.highlighted && "border-accent/40 ring-1 ring-accent/20",
              )}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">{plan.name}</h2>
                {plan.highlighted ? <Badge tone="success">Best for growing teams</Badge> : null}
              </div>
              <p className="mt-4 text-[30px] font-semibold tracking-tight">{plan.price}</p>
              <p className="text-[12px] uppercase tracking-[0.08em] text-muted">{plan.cadence}</p>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">{plan.description}</p>
              <ul className="mt-5 flex-1 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2 text-[13px] text-muted-strong">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>
              <ButtonLink
                href={plan.href}
                variant={plan.highlighted ? "primary" : "secondary"}
                className="mt-6 w-full"
              >
                {plan.cta}
              </ButtonLink>
            </article>
          ))}
        </div>

        <section className="mt-12" aria-labelledby="fee-heading">
          <h2 id="fee-heading" className="text-[20px] font-semibold tracking-tight">How fees are structured</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-[11px] uppercase tracking-[0.08em] text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3">Charge</th>
                  <th scope="col" className="px-5 py-3">Who sets it</th>
                  <th scope="col" className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border bg-surface">
                  <td className="px-5 py-3">LeoPay platform fee</td>
                  <td className="px-5 py-3 text-muted">LeoPay</td>
                  <td className="px-5 py-3 font-medium">{platformFeeLabel()}</td>
                </tr>
                {pricingConfig.providerFees.map((fee) => (
                  <tr key={fee.label} className="border-t border-border bg-surface">
                    <td className="px-5 py-3">{fee.label}</td>
                    <td className="px-5 py-3 text-muted">Payment provider</td>
                    <td className="px-5 py-3 text-muted">{fee.note}</td>
                  </tr>
                ))}
                <tr className="border-t border-border bg-surface">
                  <td className="px-5 py-3">Payout fee</td>
                  <td className="px-5 py-3 text-muted">Payment provider</td>
                  <td className="px-5 py-3 text-muted">
                    {pricingConfig.payoutFeeMinor > 0
                      ? "Configured transfer fee applies"
                      : "No LeoPay payout markup; provider transfer fees may apply"}
                  </td>
                </tr>
                <tr className="border-t border-border bg-surface">
                  <td className="px-5 py-3">International payments</td>
                  <td className="px-5 py-3 text-muted">Payment provider</td>
                  <td className="px-5 py-3 text-muted">Not enabled in this release</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 max-w-3xl text-[12.5px] leading-relaxed text-muted">
            Fees displayed in your transaction history come from provider data when the provider supplies it. LeoPay
            never estimates a fee and presents it as confirmed. Any fee shown as unavailable is genuinely unavailable.
          </p>
        </section>
      </div>
    </>
  );
}
