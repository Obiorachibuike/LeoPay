import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand";
import { ShieldCheck } from "lucide-react";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--background)]">
      <header className="border-b border-border bg-surface/80">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-4 sm:px-6">
          <Logo href="/" />
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
            <ShieldCheck className="h-3.5 w-3.5" /> Secured checkout
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-12">{children}</main>
      <footer className="border-t border-border py-5">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-2 px-4 text-[11px] text-muted sm:px-6">
          <span>Payments processed by the merchant&apos;s configured provider.</span>
          <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
        </div>
      </footer>
    </div>
  );
}
