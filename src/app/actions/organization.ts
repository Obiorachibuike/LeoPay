"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { memberships } from "@/lib/db/schema";
import { businessDetailsSchema, organizationSchema } from "@/lib/validation";
import { completeOnboarding, createOrganization, requestVerification, updateBusinessDetails, updatePayoutPolicy } from "@/services/organizations";
import { getSession, setActiveOrganization } from "@/lib/auth/session";
import { requireOrgContext, requirePermission } from "@/lib/auth/context";
import { toErrorResponse, fieldErrorsApp, type ActionResult } from "@/lib/actions";
import { AppError } from "@/lib/errors";

export type OrgFormState = { ok: boolean; message: string; errors?: Record<string, string[]>; redirectTo?: string };

export async function createOrganizationAction(_prev: OrgFormState, formData: FormData): Promise<OrgFormState> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Sign in to create a workspace" };

  const parsed = organizationSchema.safeParse({
    name: formData.get("name"),
    businessEmail: formData.get("businessEmail") || undefined,
    businessPhone: formData.get("businessPhone") || undefined,
    countryCode: formData.get("countryCode") || "NG",
    defaultCurrency: formData.get("defaultCurrency") || "NGN",
    businessType: formData.get("businessType") || "sole_proprietorship",
    website: formData.get("website") || null,
  });

  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", errors: fieldErrorsApp(parsed.error) };
  }

  try {
    await createOrganization({
      userId: session.user.id,
      userEmail: session.user.email,
      userName: session.user.name,
      data: parsed.data,
    });
    return { ok: true, message: "Workspace created", redirectTo: "/dashboard" };
  } catch (error) {
    const response = toErrorResponse(error);
    return { ok: false, message: response.message, errors: response.details };
  }
}

export async function switchOrganizationAction(orgId: string): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");
  const [membership] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.organizationId, orgId), eq(memberships.userId, session.user.id), eq(memberships.status, "active")))
    .limit(1);
  if (!membership) throw new AppError("FORBIDDEN", "You do not have access to that organization");
  await setActiveOrganization(orgId);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function updateBusinessDetailsAction(_prev: OrgFormState, formData: FormData): Promise<OrgFormState> {
  try {
    const ctx = await requirePermission("org:manage");
    const parsed = businessDetailsSchema.safeParse({
      name: formData.get("name") || undefined,
      businessEmail: formData.get("businessEmail") || undefined,
      businessPhone: formData.get("businessPhone") || undefined,
      website: formData.get("website") || null,
      businessType: formData.get("businessType") || undefined,
      defaultCurrency: formData.get("defaultCurrency") || undefined,
      settlementBankName: formData.get("settlementBankName") || undefined,
      settlementAccountName: formData.get("settlementAccountName") || undefined,
      settlementAccountNumber: formData.get("settlementAccountNumber") || undefined,
    });
    if (!parsed.success) {
      return { ok: false, message: "Check the highlighted fields.", errors: fieldErrorsApp(parsed.error) };
    }
    await updateBusinessDetails({
      organizationId: ctx.organization.id,
      actor: { id: ctx.user.id, email: ctx.user.email },
      data: parsed.data,
    });
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");
    return { ok: true, message: "Business details updated." };
  } catch (error) {
    const response = toErrorResponse(error);
    return { ok: false, message: response.message, errors: response.details };
  }
}

export async function completeOnboardingAction(): Promise<void> {
  const ctx = await requireOrgContext();
  await completeOnboarding(ctx.organization.id, { id: ctx.user.id, email: ctx.user.email });
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function requestVerificationAction(): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("org:manage");
    await requestVerification(ctx.organization.id, { id: ctx.user.id, email: ctx.user.email });
    revalidatePath("/dashboard/settings");
    return { ok: true, message: "Verification requested. Our team will review your business details." };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

export async function updatePayoutPolicyAction(_prev: OrgFormState, formData: FormData): Promise<OrgFormState> {
  try {
    const ctx = await requirePermission("org:manage");
    const threshold = Number(formData.get("approvalThreshold"));
    const daily = Number(formData.get("dailyLimit"));
    if (!Number.isFinite(threshold) || !Number.isFinite(daily)) {
      return { ok: false, message: "Enter valid amounts" };
    }
    await updatePayoutPolicy({
      organizationId: ctx.organization.id,
      actor: { id: ctx.user.id, email: ctx.user.email },
      approvalThresholdMinor: Math.round(threshold * 100),
      dailyLimitMinor: Math.round(daily * 100),
    });
    revalidatePath("/dashboard/settings");
    return { ok: true, message: "Payout policy updated." };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}
