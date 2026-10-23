/**
 * Pricing configuration.
 *
 * LeoPay does not add a platform fee in this release unless PLATFORM_FEE_BPS is
 * configured. Provider processing fees are set by the payment provider and are
 * shown as indicative until confirmed against your provider contract. Nothing
 * here should be presented as a final commercial commitment.
 */
export const pricingConfig = {
  platformFeeBps: Number(process.env.PLATFORM_FEE_BPS ?? 0),
  payoutFeeMinor: Number(process.env.PAYOUT_FEE_MINOR ?? 0),
  status: (process.env.PRICING_STATUS ?? "indicative") as "indicative" | "final",
  providerFees: [
    {
      label: "Card payments",
      detail: "Charged by your payment provider, not by LeoPay.",
      note: "Refer to your provider's published pricing before launch.",
    },
    {
      label: "Bank transfer",
      detail: "Charged by your payment provider, not by LeoPay.",
      note: "Availability depends on your provider account and merchant category.",
    },
    {
      label: "Payouts",
      detail: "Provider transfer fees apply where the provider charges them.",
      note: "LeoPay does not mark up provider transfer fees.",
    },
  ],
  plans: [
    {
      name: "Starter",
      price: "Free",
      cadence: "no monthly fee",
      description: "Everything you need to start collecting payments as a small business.",
      features: [
        "Payment links and hosted checkout",
        "Invoices with PDF export and reminders",
        "Storefront with inventory tracking",
        "Team roles and audit history",
        "Developer API keys and webhooks",
      ],
      cta: "Create your account",
      href: "/register",
      highlighted: false,
    },
    {
      name: "Growth",
      price: "Contact us",
      cadence: "pricing pending",
      description: "For growing teams that need higher limits, more control and priority support.",
      features: [
        "Everything in Starter",
        "Payout approval policies",
        "Higher API rate limits",
        "Reconciliation exports",
        "Priority support",
      ],
      cta: "Talk to us",
      href: "/contact",
      highlighted: true,
    },
    {
      name: "Scale",
      price: "Custom",
      cadence: "pricing pending",
      description: "For established businesses with finance teams and bespoke operational requirements.",
      features: [
        "Everything in Growth",
        "Custom approval and settlement workflows",
        "Dedicated onboarding",
        "Multi-entity support (roadmap)",
      ],
      cta: "Talk to us",
      href: "/contact",
      highlighted: false,
    },
  ],
} as const;

export function platformFeeLabel(): string {
  if (pricingConfig.platformFeeBps === 0) return "No LeoPay platform fee";
  return `${(pricingConfig.platformFeeBps / 100).toFixed(2)}% LeoPay platform fee`;
}
