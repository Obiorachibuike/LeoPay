import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm, MfaChallengeForm } from "@/components/auth/forms";
import { getSession, readMfaChallengeCookie } from "@/lib/auth/session";
import { pendingChallenge } from "@/services/mfa";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; reason?: string; step?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/dashboard");
  const params = await searchParams;

  const token = await readMfaChallengeCookie();
  const pending = params.step === "mfa" ? await pendingChallenge(token) : null;

  if (params.step === "mfa" && pending) {
    return (
      <AuthCard
        title="Two-factor authentication"
        description={`Enter the 6-digit code from your authenticator app for ${pending.user.email}. You can also use one of your recovery codes.`}
        footer={
          <Link href="/login" className="font-medium text-accent hover:underline">
            Back to sign in
          </Link>
        }
      >
        <MfaChallengeForm redirectTo={params.redirectTo} />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Sign in to LeoPay"
      description="Welcome back. Enter your details to continue to your workspace."
      footer={
        <>
          New to LeoPay?{" "}
          <Link href="/register" className="font-medium text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {params.reason === "session" ? (
        <p className="mb-4 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-muted">
          Please sign in again to continue.
        </p>
      ) : null}
      {params.step === "mfa" && !pending ? (
        <p className="mb-4 rounded-lg border border-border bg-warning-soft px-3 py-2 text-[12.5px] text-foreground">
          That verification step expired. Sign in again to continue.
        </p>
      ) : null}
      <LoginForm redirectTo={params.redirectTo} />
    </AuthCard>
  );
}
