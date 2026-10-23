import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicPaymentLink, linkIsPayable } from "@/services/payment-links";
import { formatMoney } from "@/lib/money";
import { Card, CardBody } from "@/components/ui/card";
import { LinkCheckoutForm } from "@/components/checkout/link-checkout-form";
import { Alert } from "@/components/ui/feedback";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ reference: string }> }): Promise<Metadata> {
  const { reference } = await params;
  const data = await getPublicPaymentLink(reference);
  return {
    title: data ? `Pay ${data.organizationName}` : "Payment link",
    robots: { index: false, follow: false },
  };
}

export default async function PublicPaymentLinkPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const data = await getPublicPaymentLink(reference);
  if (!data) notFound();

  const { link, organizationName } = data;
  const payable = linkIsPayable(link);
  const fixedAmount = link.allowVariableAmount ? null : link.amountMinor;

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-5 text-center">
        <p className="text-[12px] uppercase tracking-[0.1em] text-muted">Payment request from</p>
        <h1 className="mt-1 text-[22px] font-semibold">{organizationName}</h1>
      </div>

      <Card>
        <CardBody className="space-y-5">
          <div>
            <h2 className="text-[15px] font-semibold">{link.title}</h2>
            {link.description ? <p className="mt-1 text-[13px] leading-relaxed text-muted">{link.description}</p> : null}
          </div>

          {fixedAmount === null ? (
            <p className="rounded-lg bg-surface-2/60 px-3 py-2 text-[12.5px] text-muted">
              This link accepts a customer-specified amount
              {link.minAmountMinor ? ` from ${formatMoney(link.minAmountMinor, link.currency)}` : ""}
              {link.maxAmountMinor ? ` up to ${formatMoney(link.maxAmountMinor, link.currency)}` : ""}.
              The final amount is validated by the server.
            </p>
          ) : null}

          {!payable.payable ? (
            <Alert tone="warning" title="This link is not accepting payments">
              {payable.reason ?? "The merchant has disabled this link or it has expired."}
            </Alert>
          ) : null}

          <LinkCheckoutForm
            reference={link.publicReference}
            currency={link.currency}
            fixedAmountMinor={fixedAmount}
            minAmountMinor={link.minAmountMinor}
            maxAmountMinor={link.maxAmountMinor}
            collectPhone={link.collectCustomerPhone}
            collectName={link.collectCustomerName}
            disabledReason={payable.payable ? undefined : "Contact the merchant for a new payment link."}
          />
        </CardBody>
      </Card>

      <p className="mt-4 text-center font-mono text-[10.5px] text-muted">Ref {link.publicReference}</p>
    </div>
  );
}
