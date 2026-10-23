import type { z } from "zod";
import { toErrorResponse } from "@/lib/errors";

/** Maps Zod issues to a field -> messages map usable by forms. */
export function fieldErrorsApp(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    out[key] = [...(out[key] ?? []), issue.message];
  }
  return out;
}

export type ActionResult = { ok: boolean; message: string; errors?: Record<string, string[]> };

export { toErrorResponse };
