import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ children, className, id, as: Tag = "div" }: { children: ReactNode; className?: string; id?: string; as?: "div" | "section" | "article" }) {
  return <Tag id={id} className={cn("surface-card scroll-mt-24", className)}>{children}</Tag>;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
        {description ? <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("border-t border-border bg-surface-2/50 px-5 py-3", className)}>{children}</div>;
}
