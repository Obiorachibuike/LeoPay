"use server";

import { redirect } from "next/navigation";
import { loginSchema, registerSchema, resetPasswordSchema, resetRequestSchema } from "@/lib/validation";
import { login, logout, registerUser, requestPasswordReset, resetPassword, verifyEmailToken, issueEmailVerification } from "@/services/auth";
import { toErrorResponse, fieldErrorsApp } from "@/lib/actions";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  requestMeta,
  getSession,
  setMfaChallengeCookie,
  readMfaChallengeCookie,
  clearMfaChallengeCookie,
} from "@/lib/auth/session";
import { completeMfaChallenge, createMfaChallenge } from "@/services/mfa";
import { completeLogin } from "@/services/auth";
import { acceptInvitation } from "@/services/organizations";
import { queueEmail } from "@/services/notifications";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type FormState = { ok: boolean; message: string; errors?: Record<string, string[]>; redirectTo?: string };

function safeRedirect(target: FormDataEntryValue | null): string {
  const value = typeof target === "string" ? target : "";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return "/dashboard";
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    acceptTerms: formData.get("acceptTerms") === "on",
  });
  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", errors: fieldErrorsApp(parsed.error) };
  }

  try {
    const meta = await requestMeta();
    await enforceRateLimit({ bucket: `register:${meta.ip ?? "unknown"}`, limit: 10, windowSeconds: 3600 });
    const { user, verificationUrl } = await registerUser(parsed.data);
    // Sign the user in immediately; email verification is prompted in-app.
    await login({ email: user.email, password: parsed.data.password, ip: meta.ip });
    return {
      ok: true,
      message: verificationUrl
        ? `Account created. Development verification link: ${verificationUrl}`
        : "Account created. Check your email to verify your address.",
      redirectTo: "/onboarding",
    };
  } catch (error) {
    const response = toErrorResponse(error);
    return { ok: false, message: response.message, errors: response.details };
  }
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", errors: fieldErrorsApp(parsed.error) };
  }

  try {
    const meta = await requestMeta();
    const result = await login({ ...parsed.data, ip: meta.ip });
    if (result.mfaRequired) {
      const token = await createMfaChallenge({ userId: result.user.id, ip: meta.ip });
      await setMfaChallengeCookie(token);
      return {
        ok: true,
        message: "Enter the 6-digit code from your authenticator app.",
        redirectTo: `/login?step=mfa&redirectTo=${encodeURIComponent(safeRedirect(formData.get("redirectTo")))}`,
      };
    }
    return { ok: true, message: "Signed in", redirectTo: safeRedirect(formData.get("redirectTo")) };
  } catch (error) {
    const response = toErrorResponse(error);
    return { ok: false, message: response.message };
  }
}

/**
 * Second step of sign-in. A session is created only after the TOTP or recovery
 * code is verified against the pending challenge.
 */
export async function verifyMfaLoginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = await readMfaChallengeCookie();
  const code = String(formData.get("code") ?? "").trim();
  const redirectTo = safeRedirect(formData.get("redirectTo"));

  if (!token) {
    return { ok: false, message: "Your sign-in attempt expired. Start again.", redirectTo: "/login" };
  }
  if (!/^[0-9a-zA-Z-]{6,20}$/.test(code)) {
    return { ok: false, message: "Enter the 6-digit code from your authenticator app, or a recovery code." };
  }

  try {
    const user = await completeMfaChallenge({ token, code });
    await clearMfaChallengeCookie();
    await completeLogin(user);
    return { ok: true, message: "Signed in", redirectTo };
  } catch (error) {
    const response = toErrorResponse(error);
    return { ok: false, message: response.message };
  }
}

/** Abandons a pending second-factor challenge. */
export async function cancelMfaLoginAction(): Promise<void> {
  await clearMfaChallengeCookie();
  redirect("/login");
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/login");
}

export async function resendVerificationAction(): Promise<FormState> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Sign in to continue" };
  if (session.user.emailVerifiedAt) return { ok: true, message: "Your email is already verified." };

  await enforceRateLimit({ bucket: `verify-resend:${session.user.id}`, limit: 3, windowSeconds: 3600 });
  const url = await issueEmailVerification(session.user.id);
  return {
    ok: true,
    message: url
      ? `Verification link (development only): ${url}`
      : "Verification email sent. Check your inbox.",
  };
}

export async function verifyEmailAction(token: string): Promise<FormState> {
  try {
    await verifyEmailToken(token);
    return { ok: true, message: "Your email address is verified." };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, message: "Enter a valid email address.", errors: fieldErrorsApp(parsed.error) };
  }
  try {
    const url = await requestPasswordReset(parsed.data.email);
    return {
      ok: true,
      message: url
        ? `Development reset link: ${url}`
        : "If an account exists for that email, a reset link is on its way.",
    };
  } catch (error) {
    const response = toErrorResponse(error);
    return { ok: false, message: response.message };
  }
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", errors: fieldErrorsApp(parsed.error) };
  }
  try {
    await resetPassword(parsed.data);
    return { ok: true, message: "Password updated. You can now sign in.", redirectTo: "/login" };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

export async function acceptInvitationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  const token = String(formData.get("token") ?? "");
  if (!session) return { ok: false, message: "Sign in or create an account to accept this invitation." };

  try {
    await acceptInvitation({ token, userId: session.user.id, userEmail: session.user.email });
    return { ok: true, message: "Invitation accepted", redirectTo: "/dashboard" };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

export async function sendSecurityNotice(userId: string, message: string): Promise<void> {
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return;
  await queueEmail({ to: user.email, template: "security_alert", data: { message } }).catch(() => undefined);
}

