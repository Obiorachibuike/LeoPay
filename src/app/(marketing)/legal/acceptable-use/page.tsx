import type { Metadata } from "next";
import { PageHero, Prose } from "@/components/marketing/page-hero";

export const metadata: Metadata = { title: "Acceptable use policy" };

export default function AcceptableUsePage() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Acceptable use policy" description="What LeoPay may and may not be used for." />
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <Prose>
          <h2>Prohibited businesses and activities</h2>
          <p>
            LeoPay may not be used to collect or move funds connected to unlawful activity, deception, exploitation, or
            activities prohibited by your payment provider. Examples include fraud, unlicensed gambling where prohibited,
            the sale of stolen goods, unlicensed financial services, and deceptive crowdfunding.
          </p>
          <p>
            Your payment provider's acceptable use policy also applies and may be stricter. LeoPay cannot enable a
            payment category your provider has not approved.
          </p>

          <h2>Security expectations</h2>
          <ul>
            <li>Keep API keys secret; store them server-side and rotate them if exposed.</li>
            <li>Verify webhook signatures before trusting payloads.</li>
            <li>Do not attempt to access other organizations' records or probe the platform's defences.</li>
            <li>Do not use the platform to store card numbers, PINs or one-time codes.</li>
          </ul>

          <h2>Data obligations</h2>
          <p>
            You must have a lawful basis to process your customers' personal data, honour their rights, and provide
            accurate invoices and receipts required by law. Tax and consumer obligations remain yours.
          </p>

          <h2>Enforcement</h2>
          <p>
            We may suspend access to protect users, providers or the platform, and will explain the reason where we are
            legally able to. Suspected criminal activity may be reported to the relevant authorities.
          </p>

          <h2>Reporting abuse</h2>
          <p>
            Report abuse or phishing impersonating LeoPay to <a href="mailto:abuse@leopay.app">abuse@leopay.app</a>.
          </p>
        </Prose>
      </div>
    </>
  );
}
