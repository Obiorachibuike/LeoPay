import { requireOrgContext } from "@/lib/auth/context";
import { listMembers, listPendingInvitations, listAuditLogs } from "@/services/organizations";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role } from "@/lib/auth/rbac";
import { formatDate, formatDateTime, timeAgo } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { InviteMemberForm } from "@/components/dashboard/team-forms";
import { MemberRowActions } from "@/components/dashboard/member-actions";
import { Alert } from "@/components/ui/feedback";

export default async function TeamPage() {
  const ctx = await requireOrgContext();
  const canManage = ctx.permissions.includes("member:manage");
  const [members, invitations, audit] = await Promise.all([
    listMembers(ctx.organization.id),
    canManage ? listPendingInvitations(ctx.organization.id) : Promise.resolve([]),
    ctx.permissions.includes("audit:read") ? listAuditLogs(ctx.organization.id, { limit: 25 }) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Team"
        description="Invite teammates with least-privilege roles. Every action is authorized on the server against your organization."
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Members" description={`${members.length} member(s)`} />
          <TableWrap>
            <thead>
              <tr><Th>Member</Th><Th>Role</Th><Th>Joined</Th><Th /></tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <Tr key={member.membershipId}>
                  <Td>
                    <span className="block font-medium">{member.name}</span>
                    <span className="block text-[10.5px] text-muted">{member.email}</span>
                  </Td>
                  <Td>
                    <Badge tone={member.role === "owner" ? "accent" : "neutral"}>{ROLE_LABELS[member.role as Role] ?? member.role}</Badge>
                    {member.userId === ctx.user.id ? <span className="ml-2 text-[10.5px] text-muted">You</span> : null}
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{formatDate(member.joinedAt)}</Td>
                  <Td align="right">
                    <MemberRowActions
                      membershipId={member.membershipId}
                      role={member.role}
                      isSelf={member.userId === ctx.user.id}
                      canManage={canManage}
                      ownerCount={members.filter((m) => m.role === "owner").length}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Invite a teammate" description="Invitations expire after 7 days." />
            <CardBody>
              {canManage ? (
                <InviteMemberForm />
              ) : (
                <p className="text-[12.5px] text-muted">Your role cannot invite members.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Role reference" />
            <CardBody className="space-y-2 text-[12px]">
              {ROLES.map((role) => (
                <div key={role}>
                  <p className="font-medium">{ROLE_LABELS[role]}</p>
                  <p className="text-muted">{ROLE_DESCRIPTIONS[role]}</p>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>

      {invitations.length > 0 ? (
        <Card>
          <CardHeader title="Pending invitations" description="Not yet accepted." />
          <TableWrap>
            <thead><tr><Th>Email</Th><Th>Role</Th><Th>Invited</Th><Th>Expires</Th></tr></thead>
            <tbody>
              {invitations.map((invite) => (
                <Tr key={invite.id}>
                  <Td>{invite.email}</Td>
                  <Td>{ROLE_LABELS[invite.role as Role] ?? invite.role}</Td>
                  <Td className="text-muted">{timeAgo(invite.createdAt)}</Td>
                  <Td className="text-muted">{formatDateTime(invite.expiresAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      ) : null}

      {audit.length > 0 ? (
        <Card>
          <CardHeader title="Recent activity" description="Audit log entries for this organization." />
          <CardBody className="space-y-2">
            {audit.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2 text-[12px] last:border-0">
                <span>
                  <span className="font-medium">{entry.action.replaceAll(".", " · ")}</span>
                  {entry.targetType ? <span className="text-muted"> — {entry.targetType}</span> : null}
                </span>
                <span className="text-muted">{entry.actorEmail ?? "system"} · {timeAgo(entry.createdAt)}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : (
        <Alert tone="info">Audit log access requires the owner or admin role.</Alert>
      )}
    </div>
  );
}
