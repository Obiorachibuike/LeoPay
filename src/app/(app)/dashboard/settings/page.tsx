import Link from "next/link";
import { requireOrgContext } from "@/lib/auth/context";
import { defaultProvider, providerStatus } from "@/lib/providers";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { PasswordForm } from "@/components/dashboard/settings-forms";
import { BusinessDetailsForm, PayoutPolicyForm } from "@/components/dashboard/organization-forms";
import { VerifyEmailPanel } from "@/components/dashboard/verify-email-panel";
import { ActionButton } from "@/components/ui/action-button";
import { requestVerificationAction } from "@/app/actions/organization";

export default async function SettingsPage() {
  const ctx = await requireOrgContext();
  const provider = defaultProvider();
  const providers = providerStatus();
  const canManage = ctx.permissions.includes("org:manage");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Business profile, payments, payout policy and account security."
      />

      <nav className="flex flex-wrap gap-2 text-[12px]">
        {[
          { href: "#business", label: "Business" },
          { href: "#payments", label: "Payments" },
          { href: "#payouts", label: "Payouts" },
          { href: "#security", label: "Security" },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="rounded-full border border-border bg-surface px-3 py-1.5 text-muted hover:text-foreground">
            {item.label}
          </Link>
        ))}
      </nav>

      <Card id="business">
        <CardHeader
          title="Business profile"
          description="Shown to customers on invoices and receipts."
          action={<StatusBadge status={ctx.organization.verificationStatus} />}
        />
        <CardBody className="space-y-4">
          {ctx.organization.verificationStatus === "unverified" && canManage ? (
            <Alert tone="info" title="Verify your business">
              Verification unlocks live payments and payouts. Submit your details and our team will review them — approval
              is manual and cannot be guaranteed.
              <div className="mt-2">
                <ActionButton action={requestVerificationAction} size="sm" variant="secondary">
                  Request verification
                </ActionButton>
              </div>
            </Alert>
          ) : null}
          <BusinessDetailsForm organization={ctx.organization} />
        </CardBody>
      </Card>

      <Card id="payments">
        <CardHeader title="Payments" description="Provider configuration and environment." />
        <CardBody className="space-y-3">
          {providers.map((item) => (
            <div key={item.name} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
              <div>
                <p className="text-[13px] font-medium">{item.displayName}</p>
                <p className="text-[11.5px] text-muted">
                  {item.configured ? "Credentials detected" : "Not configured"} · capabilities: {item.capabilities.join(", ")}
                </p>
              </div>
              <Badge tone={item.active ? "accent" : item.configured ? "neutral" : "warning"}>
                {item.active ? "active" : item.configured ? "available" : "unavailable"}
              </Badge>
            </div>
          ))}
          <p className="text-[11.5px] leading-relaxed text-muted">
            Provider credentials are configured with environment variables on the server and are never exposed to the
            browser. LeoPay does not mark a payment as paid based on a redirect — settlement requires provider
            verification.
          </p>
          {provider.name === "mock" ? (
            <Alert tone="warning" title="Test payments mode">
              The active provider is the built-in mock provider{env.isProduction ? "" : " (development only)"}. It cannot
              move real money; test checkouts are available at /checkout/test/&lt;reference&gt;.
            </Alert>
          ) : null}
          {env.isProduction && provider.name === "mock" ? (
            <Alert tone="danger" title="Unsafe production configuration">
              A production deployment must not run the mock provider. The app refuses to start in this configuration.
            </Alert>
          ) : null}
        </CardBody>
      </Card>

      <Card id="payouts">
        <CardHeader title="Payout policy" description="Thresholds apply to every payout request, for every role." />
        <CardBody>
          <PayoutPolicyForm organization={ctx.organization} />
        </CardBody>
      </Card>

      <Card id="security">
        <CardHeader title="Security" description={`Signed in as ${ctx.user.email}`} />
        <CardBody className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="text-muted">Email verification:</span>
            <Badge tone={ctx.user.emailVerifiedAt ? "success" : "warning"}>
              {ctx.user.emailVerifiedAt ? "verified" : "not verified"}
            </Badge>
          </div>
          {!ctx.user.emailVerifiedAt ? <VerifyEmailPanel email={ctx.user.email} /> : null}
          <div className="max-w-sm border-t border-border pt-4">
            <p className="mb-3 text-[13px] font-medium">Change password</p>
            <PasswordForm />
          </div>
          <p className="text-[11.5px] text-muted">
            Sessions are HTTP-only cookies. Signing out revokes this session immediately.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
