import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert } from "@/components/ui/feedback";
import { verifyEmailToken } from "@/services/auth";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <AuthCard title="Verify your email" description="Open the verification link from your inbox to confirm your address.">
        <Alert tone="info">
          If you did not receive it, sign in and use “Resend verification email” in your dashboard.
        </Alert>
        <div className="mt-5">
          <ButtonLink href="/dashboard" variant="secondary" className="w-full">Go to dashboard</ButtonLink>
        </div>
      </AuthCard>
    );
  }

  let error: string | null = null;
  try {
    await verifyEmailToken(token);
  } catch (e) {
    error = e instanceof Error ? e.message : "Verification failed";
  }

  return (
    <AuthCard title={error ? "Verification link problem" : "Email verified"}>
      {error ? (
        <Alert tone="danger" title="We could not verify this link">
          {error}. Links expire after 24 hours. Sign in and resend the verification email.
        </Alert>
      ) : (
        <Alert tone="success" title="You’re verified">
          Your email address is confirmed. You can now enable developer features and payout flows.
        </Alert>
      )}
      <div className="mt-5 flex flex-col gap-2">
        <ButtonLink href={error ? "/dashboard" : "/dashboard"} className="w-full">
          Continue to dashboard
        </ButtonLink>
        <Link href="/login" className="text-center text-[12.5px] text-muted hover:text-foreground">
          Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
}
