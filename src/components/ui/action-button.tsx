"use client";

import { useState, useTransition } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import type { ActionResult } from "@/lib/actions";

/**
 * Runs a server action from a button and shows its result inline.
 * The action is passed already bound from a server component.
 */
export function ActionButton({
  action,
  children,
  variant = "secondary",
  size = "sm",
  confirm,
  className,
  hideMessage,
  disabled,
}: {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  confirm?: string;
  className?: string;
  hideMessage?: boolean;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <div className={className}>
      <Button
        type="button"
        variant={variant}
        size={size}
        loading={pending}
        disabled={disabled}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          startTransition(async () => {
            const outcome = await action();
            setResult(outcome);
          });
        }}
      >
        {children}
      </Button>
      {!hideMessage && result ? (
        <div className="mt-2">
          <Alert tone={result.ok ? "success" : "danger"} className="text-[12px]">
            {result.message}
          </Alert>
        </div>
      ) : null}
    </div>
  );
}
