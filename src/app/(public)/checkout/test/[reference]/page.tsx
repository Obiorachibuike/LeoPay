import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { AlertTriangle } from "lucide-react";
import { db } from "@/lib/db/client";
import { payments } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { MockOutcomeForm } from "@/components/checkout/mock-outcome-form";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Test checkout", robots: { index: false, follow: false } };

export default async function TestCheckoutPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  if (env.isProduction && process.env.ALLOW_MOCK_PAYMENTS !== "true") notFound();

  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.internalReference, reference), eq(payments.provider, "mock")))
    .limit(1);
  if (!payment) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Alert tone="warning" title="Test payments mode">
        <span className="inline-flex items-start gap-1.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This is a simulated checkout. No card is charged and no money moves. It cannot run in a production
          deployment unless explicitly enabled.
        </span>
      </Alert>

      <Card>
        <CardBody className="space-y-5">
          <div className="text-center">
            <p className="text-[12px] uppercase tracking-[0.1em] text-muted">Amount due</p>
            <p className="mt-1 text-[28px] font-semibold tabular">{formatMoney(payment.amountMinor, payment.currency)}</p>
            <p className="mt-1 font-mono text-[10.5px] text-muted">{payment.internalReference}</p>
          </div>

          <dl className="space-y-1 rounded-lg border border-border p-3 text-[12.5px]">
            <div className="flex justify-between"><dt className="text-muted">Provider</dt><dd>Mock (test)</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Email</dt><dd>{payment.customerEmail ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Status</dt><dd className="capitalize">{payment.status}</dd></div>
          </dl>

          {payment.status === "pending" || payment.status === "created" ? (
            <MockOutcomeForm reference={payment.internalReference} />
          ) : (
            <Alert tone="info">This test checkout is already {payment.status}. Start a new payment link checkout to test again.</Alert>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
