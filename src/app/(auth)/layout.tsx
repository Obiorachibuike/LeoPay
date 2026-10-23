import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0B1220] p-10 text-white lg:flex">
        <div aria-hidden className="absolute inset-0 opacity-[0.18]" style={{
          backgroundImage: "radial-gradient(circle at 25% 20%, #10B981 0, transparent 45%), radial-gradient(circle at 75% 70%, #10B981 0, transparent 40%)",
        }} />
        <div className="relative">
          <Logo size={30} className="[&_span]:text-white" />
        </div>
        <div className="relative max-w-md">
          <h2 className="text-[30px] font-semibold leading-tight tracking-tight">
            Every naira, accounted for.
          </h2>
          <p className="mt-4 text-[14px] leading-relaxed text-slate-300">
            LeoPay keeps collections, provider fees, refunds, invoices and payouts in one workspace — with a ledger and
            audit trail that hold up to scrutiny.
          </p>
          <ul className="mt-8 space-y-3 text-[13px] text-slate-300">
            {[
              "Payments settled only after provider verification",
              "Organization-scoped access with role permissions",
              "Payout approvals with separation of duties",
              "Signed webhooks with retries and replay protection",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[11.5px] leading-relaxed text-slate-500">
          LeoPay is a payments software platform. Payment processing is provided by licensed payment partners.
        </p>
      </div>

      <div className="flex flex-col">
        <header className="flex items-center justify-between px-4 py-4 sm:px-8">
          <div className="lg:hidden">
            <Logo size={26} href="/" />
          </div>
          <Link href="/" className="hidden items-center gap-1.5 text-[12.5px] text-muted hover:text-foreground lg:flex">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to site
          </Link>
          <ThemeToggle compact />
        </header>
        <main id="main" className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
          <div className="w-full max-w-[420px]">{children}</div>
        </main>
        <footer className="px-4 py-6 text-center text-[11.5px] text-muted sm:px-8">
          <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
          <span className="mx-2">·</span>
          <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link>
          <span className="mx-2">·</span>
          <Link href="/help" className="hover:text-foreground">Help</Link>
        </footer>
      </div>
    </div>
  );
}
