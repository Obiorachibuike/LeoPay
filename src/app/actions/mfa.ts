"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, requireUser } from "@/lib/auth/context";
import { assertCurrentPassword } from "@/services/auth";
import {
  confirmMfaEnrollment,
  disableMfa,
  regenerateRecoveryCodes,
  setMfaPolicy,
  startMfaEnrollment,
} from "@/services/mfa";
import { toErrorResponse, type ActionResult } from "@/lib/actions";
import { qrCodeDataUrl } from "@/lib/qr";

export type EnrollmentResult = ActionResult & { secret?: string; uri?: string; qrDataUrl?: string };
export type RecoveryResult = ActionResult & { recoveryCodes?: string[] };

/** Step 1: generate a secret and return it for manual entry into an app. */
export async function startMfaEnrollmentAction(): Promise<EnrollmentResult> {
  try {
    const user = await requireUser();
    const enrollment = await startMfaEnrollment({ userId: user.id, email: user.email });
    return {
      ok: true,
      message: "Scan the QR code, or enter the secret, in your authenticator app.",
      ...enrollment,
      qrDataUrl: await qrCodeDataUrl(enrollment.uri),
    };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

/** Step 2: prove the app works, then enable MFA and show recovery codes once. */
export async function confirmMfaEnrollmentAction(_prev: RecoveryResult, formData: FormData): Promise<RecoveryResult> {
  try {
    const user = await requireUser();
    const code = String(formData.get("code") ?? "").trim();
    const result = await confirmMfaEnrollment({ userId: user.id, code });
    revalidatePath("/dashboard/settings");
    return {
      ok: true,
      message: "Two-factor authentication is on. Store these recovery codes somewhere safe.",
      recoveryCodes: result.recoveryCodes,
    };
  } catch (error) {
    const response = toErrorResponse(error);
    return { ok: false, message: response.message };
  }
}

export async function disableMfaAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await assertCurrentPassword(user.id, String(formData.get("password") ?? ""));
    await disableMfa({ userId: user.id, code: String(formData.get("code") ?? "") });
    revalidatePath("/dashboard/settings");
    return { ok: true, message: "Two-factor authentication is off." };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

export async function regenerateRecoveryCodesAction(_prev: RecoveryResult, formData: FormData): Promise<RecoveryResult> {
  try {
    const user = await requireUser();
    const codes = await regenerateRecoveryCodes({ userId: user.id, code: String(formData.get("code") ?? "") });
    revalidatePath("/dashboard/settings");
    return { ok: true, message: "New recovery codes generated. Previous codes no longer work.", recoveryCodes: codes };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

/** Owners/admins can require MFA for every privileged role in the workspace. */
export async function setMfaPolicyAction(enabled: boolean): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("org:manage");
    await setMfaPolicy({
      organizationId: ctx.organization.id,
      actor: { id: ctx.user.id, email: ctx.user.email, mfaEnabled: ctx.user.mfaEnabled },
      enabled,
    });
    revalidatePath("/dashboard/settings");
    return {
      ok: true,
      message: enabled
        ? "Two-factor authentication is now required for owners and admins."
        : "Two-factor authentication is no longer required for owners and admins.",
    };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}
