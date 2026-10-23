"use server";

import { supportTicketSchema } from "@/lib/validation";
import { submitSupportTicket } from "@/services/support";
import { toErrorResponse } from "@/lib/errors";
import { requestMeta } from "@/lib/auth/session";

export type SupportFormState = { ok: boolean; message: string; errors?: Record<string, string[]> };

export async function submitSupportAction(_prev: SupportFormState, formData: FormData): Promise<SupportFormState> {
  const parsed = supportTicketSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    subject: formData.get("subject"),
    message: formData.get("message"),
    reference: formData.get("reference") || undefined,
  });

  if (!parsed.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      errors[key] = [...(errors[key] ?? []), issue.message];
    }
    return { ok: false, message: "Please check the highlighted fields.", errors };
  }

  try {
    const meta = await requestMeta();
    await submitSupportTicket({ data: parsed.data, ip: meta.ip });
    return {
      ok: true,
      message: "Thanks — your message is with our team. We usually reply within one business day.",
    };
  } catch (error) {
    const response = toErrorResponse(error);
    return { ok: false, message: response.message };
  }
}
