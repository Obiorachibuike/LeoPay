"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { paymentLinkSchema } from "@/lib/validation";
import { createPaymentLink, setPaymentLinkStatus } from "@/services/payment-links";
import { requirePermission } from "@/lib/auth/context";
import { fieldErrorsApp, toErrorResponse, type ActionResult } from "@/lib/actions";

export type LinkFormState = ActionResult & { redirectTo?: string; createdReference?: string };

export async function createPaymentLinkAction(_prev: LinkFormState, formData: FormData): Promise<LinkFormState> {
  try {
    const ctx = await requirePermission("payment:write");
    const amount = String(formData.get("amount") ?? "").trim();
    const variable = formData.get("allowVariableAmount") === "on";

    const parsed = paymentLinkSchema.safeParse({
      title: formData.get("title"),
      description: formData.get("description") || undefined,
      allowVariableAmount: variable,
      amountMinor: !variable && amount ? Math.round(Number(amount) * 100) : undefined,
      minAmountMinor: variable ? Math.round(Number(formData.get("minAmount") ?? 0) * 100) : undefined,
      maxAmountMinor: variable ? Math.round(Number(formData.get("maxAmount") ?? 0) * 100) : undefined,
      currency: formData.get("currency") || "NGN",
      successUrl: formData.get("successUrl") || null,
      cancelUrl: formData.get("cancelUrl") || null,
      expiresAt: formData.get("expiresAt") ? new Date(String(formData.get("expiresAt"))).toISOString() : "",
      collectCustomerPhone: formData.get("collectCustomerPhone") === "on",
    });

    if (!parsed.success) {
      return { ok: false, message: "Check the highlighted fields.", errors: fieldErrorsApp(parsed.error) };
    }

    const link = await createPaymentLink({
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      actorEmail: ctx.user.email,
      data: parsed.data,
    });

    revalidatePath("/dashboard/payment-links");
    return {
      ok: true,
      message: "Payment link created.",
      createdReference: link.publicReference,
      redirectTo: `/dashboard/payment-links/${link.id}`,
    };
  } catch (error) {
    const response = toErrorResponse(error);
    return { ok: false, message: response.message, errors: response.details };
  }
}

export async function togglePaymentLinkAction(linkId: string, currentStatus: "active" | "disabled"): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("payment:write");
    await setPaymentLinkStatus({
      organizationId: ctx.organization.id,
      linkId,
      status: currentStatus === "active" ? "disabled" : "active",
      actor: { id: ctx.user.id, email: ctx.user.email },
    });
    revalidatePath("/dashboard/payment-links");
    revalidatePath(`/dashboard/payment-links/${linkId}`);
    return { ok: true, message: currentStatus === "active" ? "Payment link disabled." : "Payment link enabled." };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

export async function createLinkAndOpenAction(formData: FormData) {
  const result = await createPaymentLinkAction({ ok: false, message: "" }, formData);
  if (result.ok && result.redirectTo) redirect(result.redirectTo);
  redirect(`/dashboard/payment-links/new?error=${encodeURIComponent(result.message)}`);
}
