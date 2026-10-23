import type { ReactNode } from "react";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div>
      <h1 className="text-[24px] font-semibold tracking-tight text-foreground">{title}</h1>
      {description ? <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{description}</p> : null}
      <div className="mt-6">{children}</div>
      {footer ? <div className="mt-6 text-[13px] text-muted">{footer}</div> : null}
    </div>
  );
}
