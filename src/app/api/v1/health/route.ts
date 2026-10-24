import { authenticateApiKey } from "@/services/api-keys";
import { apiError, jsonResponse } from "@/lib/api";
import { toErrorResponse } from "@/lib/errors";
import { checkRuntimeConfig } from "@/lib/env";
import { describeDatabase } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated health probe. Returns configuration warnings (never secrets)
 * so integrators can detect a degraded deployment.
 */
export async function GET(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    const warnings = checkRuntimeConfig().map((problem) => ({
      variable: problem.variable,
      message: problem.message,
      fatal: problem.fatal,
    }));
    return jsonResponse({
      data: {
        status: warnings.some((w) => w.fatal) ? "misconfigured" : "ok",
        organization: auth.organizationName,
        environment: auth.environment,
        // Driver only: the database host is never exposed to API clients.
        database: describeDatabase().driver,
        time: new Date().toISOString(),
      },
      warnings,
    });
  } catch (error) {
    const normalized = toErrorResponse(error);
    return apiError(normalized.status, normalized.code, normalized.message);
  }
}
