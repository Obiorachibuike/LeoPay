import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/forms";
import { Alert } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <AuthCard title="Reset link required" description="This page needs a valid password reset link.">
        <Alert tone="danger" title="Missing token">
          Open the link from your reset email, or{" "}
          <Link href="/forgot-password" className="underline">request a new one</Link>.
        </Alert>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" description="Your other sessions will be signed out for security.">
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
