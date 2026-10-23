import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { verifyAndSettlePayment } from "@/services/payments";
import { toErrorResponse } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { Card, CardBody } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payment status", robots: { index: false, follow: false } };

/**
 * The return page is informational only. It asks the provider for the truth
 * (verifyAndSettlePayment) and renders the persisted state. Visiting this URL
 * with an arbitrary reference can never create a successful payment.
 */
export default async function CheckoutReturnPage({ searchParams }: { searchParams: Promise<{ reference?: string }> }) {
  const params = await searchParams;
  const reference = params.reference?.trim();

  if (!reference) {
    return <StatusShell tone="warning" title="Nothing to show" description="No payment reference was supplied." />;
  }

  let view: { title: string; tone: "success" | "warning" | "danger"; description: string; detail?: string } | null = null;
  try {
    const outcome = await verifyAndSettlePayment(reference);
    const payment = outcome.payment;
    if (payment.status === "succeeded") {
      view = {
        title: "Payment confirmed",
        tone: "success",
        description: `${formatMoney(payment.amountMinor, payment.currency)} received. A receipt is on its way to ${payment.customerEmail ?? "your email"}.`,
        detail: `Reference ${payment.internalReference} · ${formatDateTime(payment.paidAt ?? payment.createdAt)}`,
      };
    } else if (payment.status === "pending" || payment.status === "processing" || payment.status === "created") {
      view = {
        title: "Payment is still pending",
        tone: "warning",
        description:
          "Your provider has not confirmed this payment yet. This page does not mark a payment as paid — we check with the provider and again in the background. Keep this reference.",
        detail: `Reference ${payment.internalReference}`,
      };
    } else {
      view = {
        title: "Payment was not completed",
        tone: "danger",
        description: payment.failureMessage ?? "The provider reported that this payment did not succeed. No money was taken.",
        detail: `Reference ${payment.internalReference}`,
      };
    }
  } catch (error) {
    const response = toErrorResponse(error);
    view = {
      title: "We could not confirm this payment",
      tone: "warning",
      description:
        response.code === "NOT_FOUND"
          ? "We could not find a payment with that reference. Check the link you followed."
          : `${response.message} The merchant can verify the payment from their dashboard.`,
      detail: `Reference ${reference}`,
    };
  }

  return (
    <div className="mx-auto max-w-lg">
      <StatusShell tone={view.tone} title={view.title} description={view.description} detail={view.detail} />
    </div>
  );
}

function StatusShell({
  tone,
  title,
  description,
  detail,
}: {
  tone: "success" | "warning" | "danger";
  title: string;
  description: string;
  detail?: string;
}) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "danger" ? XCircle : Clock;
  const color =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "danger"
        ? "text-red-600 dark:text-red-400"
        : "text-amber-600 dark:text-amber-400";
  return (
    <Card>
      <CardBody className="space-y-4 py-8 text-center">
        <Icon className={`mx-auto h-10 w-10 ${color}`} />
        <div>
          <h1 className="text-[20px] font-semibold">{title}</h1>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted">{description}</p>
          {detail ? <p className="mt-2 font-mono text-[10.5px] text-muted">{detail}</p> : null}
        </div>
        <div className="flex justify-center gap-2 pt-1">
          <Link href="/" className={buttonClasses("secondary", "sm")}>
            Back to LeoPay
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
