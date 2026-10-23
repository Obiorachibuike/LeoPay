import type { Metadata } from "next";
import { Database, Eye, FileLock2, KeyRound, Lock, ShieldCheck, UserCheck, Webhook } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { Alert } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Security" };

const controls = [
  { icon: KeyRound, title: "Authentication", copy: "Passwords hashed with scrypt and per-user salts. Sessions are HTTP-only, SameSite cookies with rotation on password change." },
  { icon: UserCheck, title: "Authorization", copy: "Every protected operation verifies the user, organization membership, role permission and organization status — server-side." },
  { icon: Database, title: "Tenant isolation", copy: "All business records carry an organization id, and queries are scoped to it. Cross-tenant access attempts return not-found." },
  { icon: Lock, title: "Sensitive data", copy: "Beneficiary account numbers are encrypted at rest with AES-256-GCM; API keys and session tokens are stored only as hashes." },
  { icon: Webhook, title: "Webhook integrity", copy: "Provider webhooks are verified with provider signatures. Merchant webhooks are signed with HMAC and timestamp replay protection." },
  { icon: ShieldCheck, title: "Financial controls", copy: "Idempotent payment settlement, balanced double-entry postings, approval thresholds and separation of duties for payouts." },
  { icon: FileLock2, title: "Audit trail", copy: "Authentication events, role changes, API keys, refunds, payouts and administrative decisions are recorded with actor and context." },
  { icon: Eye, title: "Abuse defences", copy: "Rate limiting on authentication, support and API endpoints; server-side validation; SSRF protections on merchant webhook destinations." },
];

export default function SecurityPage() {
  return (
    <>
      <PageHero
        eyebrow="Security"
        title="Security designed for money movement"
        description="LeoPay is built so that financial state changes only happen through verified, authorized, recorded operations."
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {controls.map((control) => (
            <div key={control.title} className="surface-card p-5">
              <control.icon className="h-5 w-5 text-accent" aria-hidden />
              <h2 className="mt-3 text-[14px] font-semibold">{control.title}</h2>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{control.copy}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="surface-card p-6">
            <h2 className="text-[18px] font-semibold">Responsible disclosure</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
              If you believe you have found a vulnerability, contact{" "}
              <a href="mailto:security@leopay.app" className="font-medium text-accent underline">security@leopay.app</a> with
              reproduction steps. Please do not test against other merchants' accounts, run destructive tests, or access
              data that is not yours.
            </p>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
              We aim to acknowledge reports within two business days. We do not operate a paid bug bounty programme at
              this time.
            </p>
          </div>
          <div className="surface-card p-6">
            <h2 className="text-[15px] font-semibold">Reporting suspicious activity</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              If you receive a suspicious payment request or believe your account is compromised, reset your password,
              then email <a href="mailto:security@leopay.app" className="font-medium text-accent underline">security@leopay.app</a>{" "}
              with the payment reference.
            </p>
            <ButtonLink href="/contact" variant="secondary" size="sm" className="mt-4">Contact support</ButtonLink>
          </div>
        </div>

        <Alert tone="warning" title="Compliance status" className="mt-8">
          LeoPay does not claim to be a licensed payment institution, bank, or PCI-certified processor. Payment
          processing is performed by licensed providers under their terms. Regulatory obligations that apply to your
          business — including KYC, AML, consumer protection and tax — remain your responsibility and should be assessed
          with qualified advisers before accepting real payments. This page describes engineering controls, not a
          certification.
        </Alert>
      </div>
    </>
  );
}
