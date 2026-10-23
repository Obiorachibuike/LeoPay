import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/forms";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; reason?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/dashboard");
  const params = await searchParams;

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
      <LoginForm redirectTo={params.redirectTo} />
    </AuthCard>
  );
}
