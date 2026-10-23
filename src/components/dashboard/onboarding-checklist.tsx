import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { Organization } from "@/lib/db/schema";

export function OnboardingChecklist({
  organization,
  emailVerified,
  paymentLinks,
  invoices,
  providerConfigured,
  providerConfiguredLabel,
}: {
  organization: Organization;
  emailVerified: boolean;
  paymentLinks: number;
  invoices: number;
  providerConfigured: boolean;
  providerConfiguredLabel: string;
}) {
  const items = [
    { label: "Create your account", done: true, href: "/dashboard" },
    { label: "Verify your email address", done: emailVerified, href: "/dashboard/settings#security" },
    {
      label: "Complete your business profile",
      done: Boolean(organization.businessType && organization.businessPhone && organization.businessEmail),
      href: "/dashboard/settings#business",
    },
    {
      label: `Connect ${providerConfiguredLabel}`,
      done: providerConfigured,
      href: "/dashboard/settings#payments",
    },
    {
      label: "Create your first payment link or invoice",
      done: paymentLinks > 0 || invoices > 0,
      href: "/dashboard/payment-links/new",
    },
  ];

  const completed = items.filter((item) => item.done).length;
  const allDone = completed === items.length;

  if (allDone) return null;

  return (
    <Card>
      <CardHeader
        title="Finish setting up"
        description={`${completed} of ${items.length} steps complete`}
        action={
          <span className="text-[11px] font-medium text-muted">
            {Math.round((completed / items.length) * 100)}%
          </span>
        }
      />
      <CardBody className="space-y-1 pt-3">
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(completed / items.length) * 100}%` }} />
        </div>
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="flex items-center gap-2.5 rounded-md px-1 py-1.5 text-[12.5px] hover:bg-surface-2"
          >
            {item.done ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 text-border-strong" aria-hidden />
            )}
            <span className={item.done ? "text-muted line-through" : "text-muted-strong"}>{item.label}</span>
          </Link>
        ))}
        <p className="pt-2 text-[10.5px] leading-relaxed text-muted">
          Completing setup does not grant access to regulated payment services; provider approval is separate.
        </p>
      </CardBody>
    </Card>
  );
}
