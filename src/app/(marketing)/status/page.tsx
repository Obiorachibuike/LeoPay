import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/page-hero";
import { Badge } from "@/components/ui/badge";
import { providerStatus } from "@/lib/providers";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Status" };

export default function StatusPage() {
  const providers = providerStatus();
  return (
    <>
      <PageHero
        eyebrow="Status"
        title="Platform status"
        description="This page reports configuration state, not invented uptime statistics. Historical availability metrics are not collected by this deployment."
      />
      <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
        <div className="surface-card divide-y divide-border">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="text-[14px] font-semibold">LeoPay application</p>
              <p className="text-[12.5px] text-muted">Dashboard, API and public checkout pages</p>
            </div>
            <Badge tone="success" dot>Operational</Badge>
          </div>
          {providers.map((provider) => (
            <div key={provider.name} className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <p className="text-[14px] font-semibold">{provider.displayName}</p>
                <p className="text-[12.5px] text-muted">
                  {provider.active ? "Active provider for new payments" : "Available adapter, not active"}
                </p>
              </div>
              <Badge tone={provider.configured ? "success" : "warning"} dot>
                {provider.configured ? "Configured" : "Not configured"}
              </Badge>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="text-[14px] font-semibold">Email delivery</p>
              <p className="text-[12.5px] text-muted">Transactional notifications and verification links</p>
            </div>
            <Badge tone={env.emailProvider === "log" ? "warning" : "success"} dot>
              {env.emailProvider === "log" ? "Log only (not delivered)" : "Configured"}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="text-[14px] font-semibold">Background delivery</p>
              <p className="text-[12.5px] text-muted">Webhook retries and queued email processing</p>
            </div>
            <Badge tone={env.enableInlineJobs ? "warning" : "success"} dot>
              {env.enableInlineJobs ? "Inline worker (development)" : "External scheduler"}
            </Badge>
          </div>
        </div>
        <p className="mt-6 text-[12px] leading-relaxed text-muted">
          Provider availability is governed by your payment provider. When a provider is not configured, LeoPay disables
          checkout rather than simulating a successful payment.
        </p>
      </div>
    </>
  );
}
