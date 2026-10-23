import Link from "next/link";
import { Logo } from "@/components/brand";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/solutions", label: "Solutions" },
      { href: "/pricing", label: "Pricing" },
      { href: "/security", label: "Security" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/developers", label: "Developer platform" },
      { href: "/docs", label: "Documentation" },
      { href: "/docs#webhooks", label: "Webhooks" },
      { href: "/docs#api", label: "API reference" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
      { href: "/help", label: "Help centre" },
      { href: "/status", label: "Status" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/privacy", label: "Privacy policy" },
      { href: "/legal/terms", label: "Terms of service" },
      { href: "/legal/cookies", label: "Cookie policy" },
      { href: "/legal/acceptable-use", label: "Acceptable use" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          <Logo size={28} />
          <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-muted">
            Payments that move your business forward. Collect, invoice, sell and understand your money from one secure
            workspace.
          </p>
          <p className="mt-6 text-[11.5px] leading-relaxed text-muted">
            LeoPay is a software platform, not a bank. Payment processing is provided by licensed payment partners.
          </p>
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{column.title}</h2>
            <ul className="mt-3 space-y-2">
              {column.links.map((link) => (
                <li key={link.href + link.label}>
                  <Link href={link.href} className="text-[13px] text-muted-strong transition-colors hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-5 text-[12px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} LeoPay. All rights reserved.</p>
          <p>Built for Nigerian businesses · NGN first, designed for more markets.</p>
        </div>
      </div>
    </footer>
  );
}
