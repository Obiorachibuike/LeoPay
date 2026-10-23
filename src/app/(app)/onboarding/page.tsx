import { redirect } from "next/navigation";
import { Building2, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { NewOrganizationForm } from "@/components/dashboard/organization-forms";
import { getSession } from "@/lib/auth/session";
import { listUserOrganizations } from "@/lib/auth/context";
import { ButtonLink } from "@/components/ui/button";

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const organizations = await listUserOrganizations();

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between px-4 sm:px-6">
          <Logo href="/" size={28} />
          <ThemeToggle compact />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Step 1 of 3</p>
          <h1 className="mt-2 text-[26px] font-semibold tracking-tight">Create your business workspace</h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-muted">
            A workspace holds your payment links, invoices, products and team. You can create more workspaces later and
            switch between them.
          </p>
        </div>

        {organizations.length > 0 ? (
          <div className="mb-8 surface-card p-5">
            <h2 className="text-[14px] font-semibold">Your existing workspaces</h2>
            <ul className="mt-3 divide-y divide-border">
              {organizations.map((org) => (
                <li key={org.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted" aria-hidden />
                    <div>
                      <p className="text-[13px] font-medium">{org.name}</p>
                      <p className="text-[11px] capitalize text-muted">{org.role} · {org.verificationStatus}</p>
                    </div>
                  </div>
                  <ButtonLink href="/dashboard" variant="secondary" size="sm">
                    Open
                  </ButtonLink>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="surface-card p-5 sm:p-6">
            <NewOrganizationForm />
          </div>
          <aside className="space-y-4">
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-[13px] font-semibold">What happens next</h2>
              <ol className="mt-3 space-y-3 text-[12.5px] text-muted">
                {[
                  "Add your business details and default currency.",
                  "Connect a payment provider when you are ready to accept live payments.",
                  "Create your first payment link or invoice.",
                ].map((step, index) => (
                  <li key={step} className="flex gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10.5px] font-semibold text-foreground">
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-xl border border-border bg-surface-2/60 p-4">
              <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                Creating a workspace does not grant access to regulated payment services. Live payments require an
                approved provider account.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
