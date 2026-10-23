import type { Metadata } from "next";
import { PageHero, Prose } from "@/components/marketing/page-hero";
import { Alert } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Privacy policy" description="How LeoPay handles personal and business data. Effective date: 1 October 2026." />
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <Alert tone="info" className="mb-8">
          This policy describes the data practices implemented in the LeoPay application. It is a product policy draft,
          not legal advice; have it reviewed by qualified counsel before launch in your jurisdiction.
        </Alert>
        <Prose>
          <h2>1. Who we are</h2>
          <p>
            LeoPay provides business payments software. Where you use LeoPay to collect payments from your own customers,
            you are the controller of your customers' data and LeoPay acts as a processor on your instructions. For your
            own account data, LeoPay acts as a controller.
          </p>

          <h2>2. Data we collect</h2>
          <ul>
            <li><strong>Account data:</strong> name, email address, hashed password, session metadata (IP address, user agent) and login timestamps.</li>
            <li><strong>Business data:</strong> organization name, business email, phone number, country, currency, business type and verification status.</li>
            <li><strong>Customer and transaction data:</strong> customer names, emails, phone numbers, payment amounts, currency, status, provider references and fees supplied by your provider.</li>
            <li><strong>Financial records:</strong> double-entry ledger postings, invoices, refunds and payout records.</li>
            <li><strong>Developer data:</strong> API key metadata (prefix, scopes, last used), webhook endpoint URLs and delivery attempt logs.</li>
            <li><strong>Support data:</strong> messages you send to our support channels.</li>
          </ul>
          <p>
            We do not store full payment card numbers, CVV codes or bank authentication credentials. Card data is handled
            by the payment provider's hosted checkout. Beneficiary bank account numbers are encrypted at rest.
          </p>

          <h2>3. Why we process data</h2>
          <ul>
            <li>To provide the service, including processing payments and issuing invoices.</li>
            <li>To meet legal, tax, accounting and anti-fraud obligations.</li>
            <li>To secure accounts and detect abuse (rate limiting, audit logs, reconciliation).</li>
            <li>To communicate service, security and transaction notifications.</li>
            <li>To improve the product using aggregated, non-identifying operational metrics.</li>
          </ul>

          <h2>4. Sharing</h2>
          <p>
            We share data with payment providers to process payments and payouts, with email providers to deliver
            notifications, with infrastructure providers that host the service, and where required by law. We do not sell
            personal data.
          </p>

          <h2>5. Retention</h2>
          <p>
            Transaction, invoice, ledger and audit records are retained for as long as needed to satisfy accounting and
            legal obligations. Sessions expire automatically. Support tickets are retained for up to 24 months. You may
            request deletion of account data that we are not legally required to retain.
          </p>

          <h2>6. Your rights</h2>
          <p>
            Depending on your jurisdiction — including under Nigeria's data protection framework — you may have rights to
            access, correct, delete, restrict or object to processing, and to data portability. Contact{" "}
            <a href="mailto:privacy@leopay.app">privacy@leopay.app</a>. We aim to respond within 30 days.
          </p>

          <h2>7. Security</h2>
          <p>
            Passwords are hashed with scrypt. Sessions use HTTP-only cookies. Sensitive fields are encrypted at rest.
            Access is scoped by organization, and administrative access is a separate permission boundary. No system is
            perfectly secure; report suspected issues to <a href="mailto:security@leopay.app">security@leopay.app</a>.
          </p>

          <h2>8. International transfers</h2>
          <p>
            Infrastructure and payment providers may process data outside Nigeria. Where that occurs, we rely on
            appropriate safeguards offered by those providers and applicable law.
          </p>

          <h2>9. Children</h2>
          <p>LeoPay is a business service and is not directed at children under 18.</p>

          <h2>10. Changes</h2>
          <p>
            We will publish material changes on this page and, where required, notify account owners by email. Continued
            use after an update constitutes acceptance of the revised policy.
          </p>
        </Prose>
      </div>
    </>
  );
}
