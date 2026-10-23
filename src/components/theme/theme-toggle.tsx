"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "light" | "dark" | "system";

function apply(mode: Mode) {
  const root = document.documentElement;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = mode === "dark" || (mode === "system" && systemDark);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  root.dataset.theme = dark ? "dark" : "light";
  if (mode === "system") localStorage.removeItem("leopay-theme");
  else localStorage.setItem("leopay-theme", mode);
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("leopay-theme");
    setMode(stored === "light" || stored === "dark" ? stored : "system");
    setMounted(true);
  }, []);

  function change(next: Mode) {
    setMode(next);
    apply(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn("inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5", compact && "scale-95")}
    >
      {(
        [
          { value: "light", icon: Sun, label: "Light" },
          { value: "dark", icon: Moon, label: "Dark" },
          { value: "system", icon: Monitor, label: "System" },
        ] as const
      ).map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mounted ? mode === value : value === "system"}
          aria-label={`${label} theme`}
          title={`${label} theme`}
          onClick={() => change(value)}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:text-foreground",
            mounted && mode === value && "bg-surface-3 text-foreground shadow-[var(--shadow-sm)]",
          )}
        >
          <Icon aria-hidden className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
