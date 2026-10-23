import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { AuthCard } from "@/components/auth/auth-card";
import { AcceptInvitationButton } from "@/components/auth/forms";
import { Alert } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { hashToken } from "@/lib/crypto";
import { invitations, organizations } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const session = await getSession();

  if (!token) {
    return (
      <AuthCard title="Invitation required">
        <Alert tone="danger">This link is missing its invitation token.</Alert>
      </AuthCard>
    );
  }

  const [invitation] = await db
    .select({
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      organizationName: organizations.name,
    })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
    .where(eq(invitations.tokenHash, hashToken(token)))
    .limit(1);

  if (!invitation) {
    return (
      <AuthCard title="Invitation not found">
        <Alert tone="danger">This invitation is invalid or has been revoked. Ask an administrator to resend it.</Alert>
        <ButtonLink href="/login" variant="secondary" className="mt-4 w-full">Go to sign in</ButtonLink>
      </AuthCard>
    );
  }

  const expired = invitation.expiresAt.getTime() < Date.now() || Boolean(invitation.acceptedAt);

  return (
    <AuthCard
      title={`Join ${invitation.organizationName}`}
      description={`You were invited as a ${invitation.role} using ${invitation.email}.`}
    >
      {expired ? (
        <Alert tone="warning" title="This invitation can no longer be used">
          It has expired or was already accepted. Ask an administrator to send a new invitation.
        </Alert>
      ) : !session ? (
        <>
          <Alert tone="info">Sign in with the invited email address, or create an account, then return to this link.</Alert>
          <div className="mt-5 grid gap-2">
            <ButtonLink href={`/login?redirectTo=${encodeURIComponent(`/accept-invitation?token=${token}`)}`}>
              Sign in to accept
            </ButtonLink>
            <ButtonLink href="/register" variant="secondary">Create an account</ButtonLink>
          </div>
        </>
      ) : session.user.email.toLowerCase() !== invitation.email.toLowerCase() ? (
        <Alert tone="warning" title="Wrong account">
          You are signed in as {session.user.email}. Sign out and sign in as {invitation.email} to accept this invitation.
        </Alert>
      ) : (
        <AcceptInvitationButton token={token} />
      )}
      <p className="mt-5 text-[12px] text-muted">
        <Link href="/legal/terms" className="hover:text-foreground">Terms</Link> apply to your organization membership.
      </p>
    </AuthCard>
  );
}
