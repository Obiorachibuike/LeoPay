import type { Permission } from "@/lib/auth/rbac";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  permission?: Permission;
  badgeKey?: "payoutsAwaiting" | "invoicesOverdue";
};

export type NavSection = { title: string; items: NavItem[] };

export const dashboardNav: NavSection[] = [
  {
    title: "Overview",
    items: [{ href: "/dashboard", label: "Overview", icon: "layout-dashboard" }],
  },
  {
    title: "Collect",
    items: [
      { href: "/dashboard/payments", label: "Payments", icon: "credit-card", permission: "payment:read" },
      { href: "/dashboard/payment-links", label: "Payment links", icon: "link", permission: "payment:write" },
      { href: "/dashboard/invoices", label: "Invoices", icon: "file-text", permission: "invoice:read", badgeKey: "invoicesOverdue" },
      { href: "/dashboard/customers", label: "Customers", icon: "users", permission: "customer:read" },
    ],
  },
  {
    title: "Commerce",
    items: [
      { href: "/dashboard/storefront", label: "Storefront", icon: "store", permission: "product:write" },
      { href: "/dashboard/products", label: "Products", icon: "package", permission: "product:read" },
      { href: "/dashboard/orders", label: "Orders", icon: "shopping-bag", permission: "order:read" },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/dashboard/payouts", label: "Payouts", icon: "wallet", permission: "payout:read", badgeKey: "payoutsAwaiting" },
      { href: "/dashboard/beneficiaries", label: "Beneficiaries", icon: "landmark", permission: "payout:read" },
      { href: "/dashboard/transactions", label: "Transactions", icon: "receipt", permission: "payment:read" },
      { href: "/dashboard/analytics", label: "Analytics", icon: "chart", permission: "report:read" },
    ],
  },
  {
    title: "Settings",
    items: [
      { href: "/dashboard/team", label: "Team", icon: "users-round", permission: "member:manage" },
      { href: "/dashboard/developers", label: "Developers", icon: "code", permission: "developer:manage" },
      { href: "/dashboard/settings", label: "Settings", icon: "settings" },
      { href: "/dashboard/help", label: "Help & support", icon: "life-buoy" },
    ],
  },
];
