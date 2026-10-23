import Link from "next/link";
import { requireOrgContext } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SupportForm } from "@/components/dashboard/support-form";
import { env } from "@/lib/env";
import { providerStatus } from "@/lib/providers";
import { Badge } from "@/components/ui/badge";

const faqs = [
  {
    q: "When is a payment considered paid?",
    a: "Only after the provider's verification call confirms the amount, currency and status. A customer returning to a success URL does not settle anything; if verification has not happened, the payment stays pending.",
  },
  {
    q: "Is the clearing figure a withdrawable balance?",
    a: "No. The clearing account is an internal accounting figure. Provider settlement timing, reserves and provider fees mean the money actually available can differ. Payouts are limited by settled capacity minus in-flight payouts and by your daily limit.",
  },
  {
    q: "Why do I see a test-payments banner?",
    a: "The mock provider is active. It exists for development and cannot move real money. Add provider credentials and set PAYMENT_PROVIDER to switch.",
  },
  {
    q: "Who can approve payouts?",
    a: "Owners, admins and finance. Requesters can never approve their own payout; above your approval threshold a second person is required.",
  },
  {
    q: "How are webhooks delivered?",
    a: "Through a durable outbox with signed payloads and exponential-backoff retries. You can inspect and retry deliveries in Developers. Each endpoint needs a public HTTPS URL; private network addresses are rejected.",
  },
  {
    q: "How do I change roles?",
    a: "Owners and admins manage roles in Team. The last owner cannot be removed and ownership cannot be granted by invitation.",
  },
];

export default async function HelpPage() {
  const ctx = await requireOrgContext();
  const providers = providerStatus();

  return (
    <div className="space-y-5">
      <PageHeader title="Help" description="How settlement, payouts and integrations actually behave." />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Common questions" />
          <CardBody className="space-y-4">
            {faqs.map((faq) => (
              <details key={faq.q} className="group rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-[13px] font-medium">{faq.q}</summary>
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{faq.a}</p>
              </details>
            ))}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Contact support" description="We reply by email. Include a payment reference when relevant." />
            <CardBody>
              <SupportForm defaultEmail={ctx.user.email} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Environment" />
            <CardBody className="space-y-2 text-[12px]">
              <div className="flex items-center justify-between"><span className="text-muted">Environment</span><Badge>{env.nodeEnv}</Badge></div>
              <div className="flex items-center justify-between"><span className="text-muted">App URL</span><span className="font-mono text-[11px]">{env.appUrl}</span></div>
              {providers.map((provider) => (
                <div key={provider.name} className="flex items-center justify-between">
                  <span className="text-muted">{provider.displayName}</span>
                  <Badge tone={provider.active ? "accent" : provider.configured ? "neutral" : "warning"}>
                    {provider.active ? "active" : provider.configured ? "configured" : "not configured"}
                  </Badge>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Developer reference" />
            <CardBody className="space-y-2 text-[12.5px]">
              <Link href="/dashboard/developers" className="block text-accent hover:underline">API keys and webhooks</Link>
              <Link href="/docs" className="block text-accent hover:underline">Platform documentation</Link>
              <Link href="/status" className="block text-accent hover:underline">Service status and configuration</Link>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
