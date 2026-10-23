/**
 * Role based access control. Permissions are checked server-side on every
 * sensitive operation; UI hiding is only a convenience.
 */
export const ROLES = ["owner", "admin", "finance", "developer", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "org:manage",
  "org:verify",
  "member:manage",
  "payment:read",
  "payment:write",
  "payment:refund",
  "invoice:read",
  "invoice:write",
  "product:read",
  "product:write",
  "order:read",
  "order:write",
  "customer:read",
  "customer:write",
  "payout:read",
  "payout:request",
  "payout:approve",
  "developer:manage",
  "report:read",
  "report:export",
  "audit:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS.filter((p) => p !== "org:verify"),
  finance: [
    "payment:read",
    "payment:refund",
    "invoice:read",
    "invoice:write",
    "customer:read",
    "customer:write",
    "order:read",
    "product:read",
    "payout:read",
    "payout:request",
    "report:read",
    "report:export",
  ],
  developer: [
    "payment:read",
    "invoice:read",
    "product:read",
    "order:read",
    "customer:read",
    "developer:manage",
    "report:read",
    "payout:read",
  ],
  viewer: [
    "payment:read",
    "invoice:read",
    "product:read",
    "order:read",
    "customer:read",
    "payout:read",
    "report:read",
  ],
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function permissionsFor(role: string): readonly Permission[] {
  return isRole(role) ? ROLE_PERMISSIONS[role] : [];
}

export function hasPermission(role: string, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}

export function hasAnyPermission(role: string, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Administrator",
  finance: "Finance",
  developer: "Developer",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Full control of the organization, including billing and members.",
  admin: "Manages business settings, payments and team members.",
  finance: "Handles invoices, refunds and payout requests.",
  developer: "Manages API keys, webhooks and integration settings.",
  viewer: "Read-only access to payments, invoices and reports.",
};

/** API key scopes map onto a restricted subset of permissions. */
export const API_SCOPES = [
  "payment_links:read",
  "payment_links:write",
  "payments:read",
  "payments:write",
  "invoices:read",
  "invoices:write",
  "customers:read",
  "customers:write",
  "payouts:read",
  "payouts:write",
  "products:read",
  "orders:read",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];
