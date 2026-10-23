"use client";

import { useState } from "react";
import { changeRoleAction, removeMemberAction } from "@/app/actions/team";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/auth/rbac";
import { ActionButton } from "@/components/ui/action-button";
import { Select } from "@/components/ui/form";

/**
 * Role changes are re-authorized on the server; this control only offers the
 * choices and surfaces the server's response.
 */
export function MemberRowActions({
  membershipId,
  role,
  isSelf,
  canManage,
  ownerCount,
}: {
  membershipId: string;
  role: string;
  isSelf: boolean;
  canManage: boolean;
  ownerCount: number;
}) {
  const [nextRole, setNextRole] = useState(role);
  const isLastOwner = role === "owner" && ownerCount <= 1;

  if (!canManage) {
    return <span className="text-[11px] text-muted">—</span>;
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Select
        aria-label="Change role"
        value={nextRole}
        onChange={(event) => setNextRole(event.target.value)}
        className="h-8 w-[120px] text-[12px]"
        disabled={isLastOwner}
      >
        {ROLES.map((candidate) => (
          <option key={candidate} value={candidate} disabled={candidate === "owner" && role !== "owner"}>
            {ROLE_LABELS[candidate as Role]}
          </option>
        ))}
      </Select>
      {nextRole !== role ? (
        <ActionButton action={changeRoleAction.bind(null, membershipId, nextRole)} size="sm" variant="secondary">
          Save
        </ActionButton>
      ) : null}
      {!isSelf && !isLastOwner ? (
        <ActionButton
          action={removeMemberAction.bind(null, membershipId)}
          size="sm"
          variant="ghost"
          confirm="Remove this member from the organization? They will lose access immediately."
        >
          Remove
        </ActionButton>
      ) : null}
    </div>
  );
}
