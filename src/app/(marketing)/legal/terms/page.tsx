import type { Metadata } from "next";
import { PageHero, Prose } from "@/components/marketing/page-hero";
import { Alert } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Terms of service" description="The terms that govern use of LeoPay. Effective date: 1 October 2026." />
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <Alert tone="info" className="mb-8">
          These terms are a product draft describing how the software is intended to be used. They are not legal advice
          and require review by qualified counsel before launch.
        </Alert>
        <Prose>
          <h2>1. The service</h2>
          <p>
            LeoPay provides software for creating payment links, invoices and storefronts, tracking transactions, and
            initiating payouts through third-party payment providers. LeoPay is not a bank, does not hold customer
            deposits, and is not itself a licensed payment institution. Payment processing is performed by licensed
            providers under their own terms.
          </p>

          <h2>2. Eligibility and accounts</h2>
          <p>
            You must be at least 18 and able to enter a binding contract. You are responsible for the accuracy of your
            business information, for safeguarding credentials and API keys, and for all activity under your account. You
            must notify us promptly of unauthorised access.
          </p>

          <h2>3. Provider requirements</h2>
          <p>
            Accepting live payments requires a payment provider account approved for your business. Provider approval,
            supported payment methods, limits and settlement timing are controlled by the provider and applicable
            regulation, not by LeoPay. Completing LeoPay onboarding does not grant access to regulated payment services.
          </p>

          <h2>4. Fees</h2>
          <p>
            Provider processing fees are set by your payment provider. Any LeoPay fee is disclosed on the pricing page and
            in your dashboard before you accept it. We do not silently change a customer's total at checkout.
          </p>

          <h2>5. Acceptable use</h2>
          <p>You may not use LeoPay to:</p>
          <ul>
            <li>collect payments for unlawful goods or services, fraud, or money laundering;</li>
            <li>misrepresent your business, products or identity;</li>
            <li>infringe intellectual property or violate privacy rights;</li>
            <li>attempt to access another organization's data, bypass rate limits, or probe infrastructure without written permission;</li>
            <li>use the API to send unlawful, deceptive or unsolicited communications.</li>
          </ul>

          <h2>6. Your customers and data</h2>
          <p>
            You are responsible for having a lawful basis to process your customers' data, for the accuracy of invoices
            and tax treatment, and for your own consumer-protection, KYC and record-keeping obligations. You must not use
            LeoPay to store full card numbers or sensitive authentication data.
          </p>

          <h2>7. Payouts</h2>
          <p>
            Payouts are subject to provider capability, verified beneficiary details, available settled funds, approval
            policies and provider limits. Where a provider outcome is uncertain, LeoPay will hold the payout for
            verification rather than retrying automatically. You are responsible for verifying beneficiary details before
            approval.
          </p>

          <h2>8. Availability and changes</h2>
          <p>
            We work to keep the service available but do not guarantee uninterrupted access. We may change or withdraw
            features, and will give reasonable notice of material adverse changes affecting paid plans.
          </p>

          <h2>9. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, LeoPay is not liable for indirect or consequential loss, loss of
            profit or goodwill, or for the acts and omissions of payment providers. Nothing in these terms excludes
            liability that cannot lawfully be excluded.
          </p>

          <h2>10. Suspension and termination</h2>
          <p>
            We may suspend or terminate accounts for material breach, suspected fraud, legal compulsion, or risk to other
            users or providers. You may close your account at any time; records we must retain for legal or accounting
            purposes will be retained as described in the privacy policy.
          </p>

          <h2>11. Governing law</h2>
          <p>
            These terms are governed by the laws of the Federal Republic of Nigeria. The courts of Lagos State have
            jurisdiction, subject to any mandatory consumer protections that apply to you.
          </p>

          <h2>12. Contact</h2>
          <p>Questions about these terms: <a href="mailto:legal@leopay.app">legal@leopay.app</a>.</p>
        </Prose>
      </div>
    </>
  );
}
