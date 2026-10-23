"use server";

import { revalidatePath } from "next/cache";
import { toErrorResponse, type ActionResult } from "@/lib/actions";
import { requireOrgContext, requirePermission } from "@/lib/auth/context";
import { saveUploadedImage, setOrganizationLogo, setUserAvatar } from "@/services/uploads";

function singleFile(formData: FormData, name: string): File | null {
  const value = formData.get(name);
  return value instanceof File && value.size > 0 ? value : null;
}

/** Uploads a workspace logo and points the organization at it. */
export async function uploadLogoAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("org:manage");
    const file = singleFile(formData, "logo");
    if (!file) return { ok: false, message: "Choose an image to upload." };

    const stored = await saveUploadedImage({
      organizationId: ctx.organization.id,
      kind: "logo",
      file,
    });
    await setOrganizationLogo({
      organizationId: ctx.organization.id,
      actor: { id: ctx.user.id, email: ctx.user.email },
      logoUrl: stored.url,
    });
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");
    return { ok: true, message: "Logo updated." };
  } catch (error) {
    const response = toErrorResponse(error);
    return { ok: false, message: response.message, errors: response.details };
  }
}

/** Removes the workspace logo; the uploaded file itself is left in place. */
export async function removeLogoAction(): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("org:manage");
    await setOrganizationLogo({
      organizationId: ctx.organization.id,
      actor: { id: ctx.user.id, email: ctx.user.email },
      logoUrl: null,
    });
    revalidatePath("/dashboard/settings");
    return { ok: true, message: "Logo removed." };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

/** Uploads the signed-in user's avatar. Scoped to the current organization. */
export async function uploadAvatarAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    const file = singleFile(formData, "avatar");
    if (!file) return { ok: false, message: "Choose an image to upload." };

    const stored = await saveUploadedImage({
      organizationId: ctx.organization.id,
      kind: "avatar",
      file,
    });
    await setUserAvatar({ userId: ctx.user.id, avatarUrl: stored.url });
    revalidatePath("/dashboard/settings");
    return { ok: true, message: "Photo updated." };
  } catch (error) {
    const response = toErrorResponse(error);
    return { ok: false, message: response.message, errors: response.details };
  }
}

export async function removeAvatarAction(): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await setUserAvatar({ userId: ctx.user.id, avatarUrl: null });
    revalidatePath("/dashboard/settings");
    return { ok: true, message: "Photo removed." };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}
