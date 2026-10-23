"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  changeMemberRole,
  inviteMember,
  listMembers,
  removeMember,
  revokeInvitation,
} from "@/services/organizations";
import { requirePermission } from "@/lib/auth/context";
import { emailSchema } from "@/lib/validation";
import { isRole, ROLES } from "@/lib/auth/rbac";
import { fieldErrorsApp, toErrorResponse, type ActionResult } from "@/lib/actions";
import { AppError } from "@/lib/errors";

export type InviteResult = ActionResult & { invitationUrl?: string };

export async function inviteMemberAction(_prev: InviteResult, formData: FormData): Promise<InviteResult> {
  try {
    const ctx = await requirePermission("member:manage");
    const parsed = z
      .object({ email: emailSchema, role: z.enum(ROLES) })
      .safeParse({ email: formData.get("email"), role: formData.get("role") });
    if (!parsed.success) {
      return { ok: false, message: "Check the invited email and role.", errors: fieldErrorsApp(parsed.error) };
    }

    const members = await listMembers(ctx.organization.id);
    const result = await inviteMember({
      organizationId: ctx.organization.id,
      organizationName: ctx.organization.name,
      actor: { id: ctx.user.id, email: ctx.user.email, name: ctx.user.name },
      email: parsed.data.email,
      role: parsed.data.role,
      memberCount: members.length,
      existingMemberEmails: members.map((m) => m.email.toLowerCase()),
    });
    revalidatePath("/dashboard/team");
    return { ok: true, message: "Invitation sent.", invitationUrl: result.invitationUrl };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

export async function changeRoleAction(membershipId: string, role: string): Promise<ActionResult> {
  try {
    if (!isRole(role)) throw new AppError("VALIDATION_ERROR", "Unknown role");
    const ctx = await requirePermission("member:manage");
    await changeMemberRole({
      organizationId: ctx.organization.id,
      membershipId,
      role,
      actor: { id: ctx.user.id, email: ctx.user.email, membershipId: ctx.membership.id },
    });
    revalidatePath("/dashboard/team");
    return { ok: true, message: "Role updated." };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

export async function removeMemberAction(membershipId: string): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("member:manage");
    await removeMember({
      organizationId: ctx.organization.id,
      membershipId,
      actor: { id: ctx.user.id, email: ctx.user.email, membershipId: ctx.membership.id },
    });
    revalidatePath("/dashboard/team");
    return { ok: true, message: "Member removed." };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

export async function revokeInvitationAction(invitationId: string): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("member:manage");
    await revokeInvitation({
      organizationId: ctx.organization.id,
      invitationId,
      actor: { id: ctx.user.id, email: ctx.user.email },
    });
    revalidatePath("/dashboard/team");
    return { ok: true, message: "Invitation revoked." };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}
