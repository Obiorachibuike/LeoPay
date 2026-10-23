"use server";

import { revalidatePath } from "next/cache";
import { verifyAndSettlePayment } from "@/services/payments";
import { refundPayment } from "@/services/payments";
import { requirePermission } from "@/lib/auth/context";
import { toErrorResponse, type ActionResult } from "@/lib/actions";
import { AppError } from "@/lib/errors";
import { runReconciliation, resolveException } from "@/services/reconciliation";

export async function verifyPaymentAction(paymentReference: string): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("payment:read");
    const result = await verifyAndSettlePayment(paymentReference);
    if (result.payment.organizationId !== ctx.organization.id) {
      throw new AppError("NOT_FOUND", "Payment not found");
    }
    revalidatePath("/dashboard/payments");
    revalidatePath(`/dashboard/payments/${result.payment.id}`);
    revalidatePath("/dashboard");
    return {
      ok: result.settled,
      message: result.settled
        ? "Payment verified and settled."
        : result.reason === "pending"
          ? "The provider still reports this payment as pending."
          : "The provider has not confirmed this payment.",
    };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

export async function refundPaymentAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("payment:refund");
    const paymentId = String(formData.get("paymentId") ?? "");
    const amount = Number(formData.get("amount") ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: "Enter a refund amount" };

    const result = await refundPayment({
      organizationId: ctx.organization.id,
      paymentId,
      amountMinor: Math.round(amount * 100),
      reason: String(formData.get("reason") ?? "") || undefined,
      actorId: ctx.user.id,
      actorEmail: ctx.user.email,
    });

    revalidatePath("/dashboard/payments");
    revalidatePath(`/dashboard/payments/${paymentId}`);
    return { ok: true, message: `Refund submitted (${result.status}).` };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

export async function runReconciliationAction(verifyInFlight: boolean): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("report:read");
    const result = await runReconciliation({
      organizationId: ctx.organization.id,
      verifyInFlight,
      actorId: ctx.user.id,
    });
    revalidatePath("/dashboard/transactions");
    return {
      ok: true,
      message: `Reconciliation complete: ${result.checked} records checked, ${result.exceptions} exceptions.`,
    };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

export async function resolveExceptionAction(exceptionId: string, resolution: "resolved" | "ignored"): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("report:read");
    await resolveException({
      organizationId: ctx.organization.id,
      exceptionId,
      actorId: ctx.user.id,
      resolution,
    });
    revalidatePath("/dashboard/transactions");
    return { ok: true, message: "Exception updated." };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}
