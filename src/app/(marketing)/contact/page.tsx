import type { Metadata } from "next";
import { Clock, Mail, ShieldAlert } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { ContactForm } from "@/components/marketing/contact-form";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage() {
  const session = await getSession();
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Talk to the LeoPay team"
        description="Questions about onboarding, integrations or your account? Send us a message and we will get back to you."
      />
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="surface-card p-6">
          <ContactForm signedInEmail={session?.user.email} />
        </div>
        <div className="space-y-4">
          <div className="surface-card p-5">
            <Mail className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-2 text-[14px] font-semibold">Email us</h2>
            <p className="mt-1 text-[13px] text-muted">
              General: <a href="mailto:support@leopay.app" className="text-accent underline">support@leopay.app</a>
              <br />
              Security: <a href="mailto:security@leopay.app" className="text-accent underline">security@leopay.app</a>
            </p>
          </div>
          <div className="surface-card p-5">
            <Clock className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-2 text-[14px] font-semibold">Response times</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              We aim to reply within one business day, Monday to Friday. Payment issues with a reference are prioritised.
            </p>
          </div>
          <div className="surface-card p-5">
            <ShieldAlert className="h-5 w-5 text-[var(--danger)]" aria-hidden />
            <h2 className="mt-2 text-[14px] font-semibold">Suspicious activity</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              If you suspect fraud on your account, change your password immediately and email security@leopay.app with
              the payment reference. Never send your password or API keys.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
