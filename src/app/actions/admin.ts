"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/context";
import { decideVerification, setOrganizationStatus, setUserStatus } from "@/services/admin";
import { toErrorResponse, type ActionResult } from "@/lib/actions";

export async function adminSetOrgStatusAction(organizationId: string, status: "active" | "suspended"): Promise<ActionResult> {
  try {
    const admin = await requirePlatformAdmin();
    await setOrganizationStatus({ organizationId, status, admin: { id: admin.id, email: admin.email } });
    revalidatePath("/admin");
    return { ok: true, message: `Organization ${status === "active" ? "reactivated" : "suspended"}.` };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

export async function adminVerificationDecisionAction(
  organizationId: string,
  decision: "verified" | "rejected",
): Promise<ActionResult> {
  try {
    const admin = await requirePlatformAdmin();
    await decideVerification({ organizationId, decision, admin: { id: admin.id, email: admin.email } });
    revalidatePath("/admin");
    return { ok: true, message: `Verification ${decision}.` };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

export async function adminSetUserStatusAction(userId: string, status: "active" | "suspended"): Promise<ActionResult> {
  try {
    const admin = await requirePlatformAdmin();
    await setUserStatus({ userId, status, admin: { id: admin.id, email: admin.email } });
    revalidatePath("/admin");
    return { ok: true, message: `User ${status === "active" ? "reactivated" : "suspended"}.` };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}
