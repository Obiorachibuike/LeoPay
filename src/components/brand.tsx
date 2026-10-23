import { cn } from "@/lib/utils";

/**
 * LeoPay mark: an original geometric lion shield. Six mane segments frame an
 * abstract "L" cut, using the brand's ink and emerald accents.
 */
export function LeoMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="LeoPay"
      className={cn("shrink-0", className)}
      fill="none"
    >
      <rect width="32" height="32" rx="9" fill="var(--brand)" className="dark:fill-[#10B981]" />
      <path
        d="M10 8.5h4.4v9.2h7.1v4.3H10V8.5Z"
        fill="var(--brand-foreground)"
        className="dark:fill-[#04110B]"
      />
      <path
        d="M20.4 8.5c2.2 1.6 3.6 4 3.8 6.8-.3 1.8-1.2 3.3-2.5 4.4v-4.3l-1.3-1.2V8.5Z"
        fill="var(--accent)"
        className="dark:fill-[#04110B]/70"
      />
      <circle cx="24.2" cy="11.2" r="1.5" fill="var(--accent)" className="dark:fill-[#04110B]/70" />
    </svg>
  );
}

export function Logo({
  className,
  href,
  showTagline = false,
  size = 28,
}: {
  className?: string;
  href?: string;
  showTagline?: boolean;
  size?: number;
}) {
  const content = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LeoMark size={size} />
      <span className="flex flex-col leading-none">
        <span className="text-[17px] font-semibold tracking-tight text-foreground">LeoPay</span>
        {showTagline ? (
          <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
            Your money. Your momentum.
          </span>
        ) : null}
      </span>
    </span>
  );
  if (href) {
    return (
      <a href={href} className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4">
        {content}
      </a>
    );
  }
  return content;
}
