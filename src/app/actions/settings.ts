"use server";

import { revalidatePath } from "next/cache";
import { changePassword } from "@/services/auth";
import { issueEmailVerification } from "@/services/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { toErrorResponse, fieldErrorsApp, type ActionResult } from "@/lib/actions";
import { changePasswordSchema } from "@/lib/validation";
import { getSession } from "@/lib/auth/session";
import { queueEmail } from "@/services/notifications";

export async function changePasswordAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Sign in to continue" };

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", errors: fieldErrorsApp(parsed.error) };
  }

  try {
    await enforceRateLimit({ bucket: `change-password:${session.user.id}`, limit: 5, windowSeconds: 900 });
    await changePassword({
      userId: session.user.id,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      keepSessionId: session.sessionId,
    });
    revalidatePath("/dashboard/settings");
    return { ok: true, message: "Password updated. Other sessions were signed out." };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

export async function resendVerificationFromSettingsAction(): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Sign in to continue" };
  if (session.user.emailVerifiedAt) return { ok: true, message: "Your email is already verified." };
  try {
    await enforceRateLimit({ bucket: `verify-resend:${session.user.id}`, limit: 3, windowSeconds: 3600 });
    const url = await issueEmailVerification(session.user.id);
    return {
      ok: true,
      message: url ? `Development verification link: ${url}` : "Verification email sent.",
    };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

export async function sendTestEmailAction(): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Sign in to continue" };
  try {
    await queueEmail({
      to: session.user.email,
      template: "security_alert",
      data: { message: "This is a test notification from your LeoPay workspace settings." },
    });
    const { runJobTick } = await import("@/services/jobs");
    await runJobTick().catch(() => undefined);
    return { ok: true, message: "Test notification queued. Check delivery status in Developers → Notifications." };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}
