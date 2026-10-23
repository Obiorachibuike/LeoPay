import type { Metadata } from "next";
import { ArrowRight, Briefcase, Building2, Code2, GraduationCap, HeartHandshake, ShoppingBag, Store, Users } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Solutions" };

const solutions = [
  {
    icon: Briefcase,
    title: "Agencies and consultancies",
    copy: "Collect project deposits and retainers, invoice by milestone, and keep a clean record of what each client has paid.",
    bullets: ["Payment links for deposits", "Itemised invoices with terms", "Team roles for account managers"],
  },
  {
    icon: HeartHandshake,
    title: "Freelancers and independent professionals",
    copy: "A professional way to request payment without chasing messages. Send a link, get a verified confirmation, track the rest.",
    bullets: ["Fixed or variable links", "PDF invoices", "Email reminders"],
  },
  {
    icon: ShoppingBag,
    title: "Online sellers and digital product creators",
    copy: "Publish a storefront, list products with real stock counts, and let customers check out with verified payment status.",
    bullets: ["Hosted storefront", "Inventory reservation", "Order history"],
  },
  {
    icon: Building2,
    title: "Small and growing businesses",
    copy: "Bring collections and financial operations into one place your finance lead can actually audit.",
    bullets: ["Collections vs fees vs payouts", "Approval policies", "CSV exports and audit log"],
  },
  {
    icon: Code2,
    title: "Software teams and platforms",
    copy: "Add payments to your product with a documented API and webhooks that verify correctly the first time.",
    bullets: ["Scoped API keys", "Idempotent financial writes", "Signed webhook retries"],
  },
  {
    icon: GraduationCap,
    title: "Schools, communities and non-profits",
    copy: "Collect dues, donations and event fees with optional customer-chosen amounts within limits you set.",
    bullets: ["Variable amount links", "Clear success states", "Exportable records"],
  },
];

export default function SolutionsPage() {
  return (
    <>
      <PageHero
        eyebrow="Solutions"
        title="Built around the way your business gets paid"
        description="LeoPay adapts to different collection models without pretending every business works the same way."
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {solutions.map((solution) => (
            <article key={solution.title} className="surface-card flex flex-col p-5">
              <solution.icon className="h-5 w-5 text-accent" aria-hidden />
              <h2 className="mt-3 text-[15px] font-semibold">{solution.title}</h2>
              <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-muted">{solution.copy}</p>
              <ul className="mt-4 space-y-1.5 border-t border-border pt-4">
                {solution.bullets.map((bullet) => (
                  <li key={bullet} className="text-[12.5px] text-muted-strong">• {bullet}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <div className="surface-card mt-10 flex flex-col justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <Store className="mt-0.5 h-5 w-5 text-accent" aria-hidden />
            <div>
              <p className="text-[15px] font-semibold">Not sure which setup fits?</p>
              <p className="text-[13px] text-muted">Tell us how you collect money today and we will map it to a workflow.</p>
            </div>
          </div>
          <ButtonLink href="/contact" variant="secondary">
            Talk to us <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        </div>
        <div className="mt-10 flex items-center gap-3 rounded-xl border border-border bg-surface-2/60 p-4 text-[12.5px] text-muted">
          <Users className="h-4 w-4 shrink-0 text-muted-strong" aria-hidden />
          Feature availability such as card payments, bank transfers and payouts depends on your payment provider and
          merchant approval. LeoPay shows an explicit unavailable state rather than simulating those capabilities.
        </div>
      </div>
    </>
  );
}
