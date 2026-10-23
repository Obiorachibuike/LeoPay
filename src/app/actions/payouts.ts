"use server";

import { revalidatePath } from "next/cache";
import { createBeneficiary, requestPayout, approvePayout } from "@/services/payouts";
import { requirePermission } from "@/lib/auth/context";
import { fieldErrorsApp, toErrorResponse, type ActionResult } from "@/lib/actions";
import { beneficiarySchema, payoutRequestSchema } from "@/lib/validation";

export async function createBeneficiaryAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("payout:request");
    const parsed = beneficiarySchema.safeParse({
      name: formData.get("name"),
      bankCode: formData.get("bankCode"),
      bankName: formData.get("bankName"),
      accountNumber: formData.get("accountNumber"),
    });
    if (!parsed.success) {
      return { ok: false, message: "Check the highlighted fields.", errors: fieldErrorsApp(parsed.error) };
    }
    await createBeneficiary({
      organizationId: ctx.organization.id,
      actor: { id: ctx.user.id, email: ctx.user.email },
      data: parsed.data,
    });
    revalidatePath("/dashboard/beneficiaries");
    revalidatePath("/dashboard/payouts");
    return { ok: true, message: "Beneficiary verified with the provider and saved." };
  } catch (error) {
    const response = toErrorResponse(error);
    return { ok: false, message: response.message, errors: response.details };
  }
}

export async function requestPayoutAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("payout:request");
    const parsed = payoutRequestSchema.safeParse({
      beneficiaryId: formData.get("beneficiaryId"),
      amountMinor: Math.round(Number(formData.get("amount") ?? 0) * 100),
      currency: formData.get("currency") || ctx.organization.defaultCurrency,
      reason: formData.get("reason") || undefined,
      idempotencyKey: formData.get("idempotencyKey") || undefined,
    });
    if (!parsed.success) {
      return { ok: false, message: "Check the highlighted fields.", errors: fieldErrorsApp(parsed.error) };
    }
    const result = await requestPayout({
      organizationId: ctx.organization.id,
      actor: { id: ctx.user.id, email: ctx.user.email },
      beneficiaryId: parsed.data.beneficiaryId,
      amountMinor: parsed.data.amountMinor,
      currency: parsed.data.currency,
      reason: parsed.data.reason,
      idempotencyKey: parsed.data.idempotencyKey,
      dailyLimitMinor: ctx.organization.payoutDailyLimitMinor,
      approvalThresholdMinor: ctx.organization.payoutApprovalThresholdMinor,
    });
    revalidatePath("/dashboard/payouts");
    return {
      ok: true,
      message: result.requiresApproval
        ? "Payout requested. A second approver must approve it before it is sent."
        : "Payout submitted to the provider.",
    };
  } catch (error) {
    const response = toErrorResponse(error);
    return { ok: false, message: response.message, errors: response.details };
  }
}

export async function decidePayoutAction(payoutId: string, decision: "approve" | "reject", note?: string): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("payout:approve");
    await approvePayout({
      organizationId: ctx.organization.id,
      payoutId,
      actor: { id: ctx.user.id, email: ctx.user.email, role: ctx.role },
      decision,
      note,
    });
    revalidatePath("/dashboard/payouts");
    return { ok: true, message: decision === "approve" ? "Payout approved and sent to the provider." : "Payout rejected." };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}
