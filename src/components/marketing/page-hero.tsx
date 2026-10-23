import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("relative overflow-hidden border-b border-border", className)}>
      <div aria-hidden className="hero-grid absolute inset-0 -z-10 opacity-70" />
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
        ) : null}
        <h1 className="mt-2 max-w-3xl text-[32px] font-semibold leading-[1.1] tracking-tight sm:text-[44px]">{title}</h1>
        {description ? (
          <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-muted-strong sm:text-[15.5px]">{description}</p>
        ) : null}
        {actions ? <div className="mt-7 flex flex-wrap gap-3">{actions}</div> : null}
        {children}
      </div>
    </section>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-5 text-[14px] leading-relaxed text-muted-strong [&_h2]:mt-10 [&_h2]:text-[19px] [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_li]:py-1 [&_a]:font-medium [&_a]:text-accent [&_a]:underline [&_strong]:font-semibold [&_strong]:text-foreground">
      {children}
    </div>
  );
}
