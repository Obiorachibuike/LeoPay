"use server";

import { revalidatePath } from "next/cache";
import { createInvoice, sendInvoiceEmail, updateInvoiceStatus } from "@/services/invoices";
import { requirePermission } from "@/lib/auth/context";
import { fieldErrorsApp, toErrorResponse, type ActionResult } from "@/lib/actions";
import { invoiceSchema } from "@/lib/validation";

export type InvoiceFormState = ActionResult & { redirectTo?: string };

/** Form payload: line items are sent as JSON from the invoice editor. */
export async function createInvoiceAction(_prev: InvoiceFormState, formData: FormData): Promise<InvoiceFormState> {
  try {
    const ctx = await requirePermission("invoice:write");
    let items: unknown;
    try {
      items = JSON.parse(String(formData.get("items") ?? "[]"));
    } catch {
      return { ok: false, message: "Line items could not be read. Add at least one item." };
    }

    const parsed = invoiceSchema.safeParse({
      customerId: formData.get("customerId") || null,
      customerName: formData.get("customerName"),
      customerEmail: formData.get("customerEmail") || undefined,
      currency: formData.get("currency") || "NGN",
      items,
      discountMinor: Math.round(Number(formData.get("discount") ?? 0) * 100),
      taxRateBps: Math.round(Number(formData.get("taxRate") ?? 0) * 100),
      issueDate: String(formData.get("issueDate") ?? ""),
      dueDate: formData.get("dueDate") ? String(formData.get("dueDate")) : "",
      notes: formData.get("notes") || undefined,
      terms: formData.get("terms") || undefined,
      status: formData.get("status") === "issued" ? "issued" : "draft",
    });

    if (!parsed.success) {
      return { ok: false, message: "Check the highlighted fields.", errors: fieldErrorsApp(parsed.error) };
    }

    const invoice = await createInvoice({
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      actorEmail: ctx.user.email,
      data: parsed.data,
    });

    revalidatePath("/dashboard/invoices");
    return { ok: true, message: `Invoice ${invoice.invoiceNumber} created.`, redirectTo: `/dashboard/invoices/${invoice.id}` };
  } catch (error) {
    const response = toErrorResponse(error);
    return { ok: false, message: response.message, errors: response.details };
  }
}

export async function sendInvoiceAction(invoiceId: string, reminder: boolean): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("invoice:write");
    await sendInvoiceEmail({
      organizationId: ctx.organization.id,
      invoiceId,
      reminder,
      actor: { id: ctx.user.id, email: ctx.user.email },
    });
    revalidatePath(`/dashboard/invoices/${invoiceId}`);
    return { ok: true, message: reminder ? "Reminder queued." : "Invoice email queued." };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

export async function setInvoiceStatusAction(invoiceId: string, status: "issued" | "cancelled"): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("invoice:write");
    await updateInvoiceStatus(ctx.organization.id, invoiceId, status, { id: ctx.user.id, email: ctx.user.email });
    revalidatePath(`/dashboard/invoices/${invoiceId}`);
    revalidatePath("/dashboard/invoices");
    return { ok: true, message: `Invoice marked ${status}.` };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}
