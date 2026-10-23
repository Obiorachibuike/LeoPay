/**
 * Runs once when the server process starts (Next.js instrumentation hook).
 * Fails fast on unsafe production configuration and starts the optional
 * in-process job runner for single-node deployments.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateRuntimeConfig, checkRuntimeConfig, env } = await import("@/lib/env");
  const { logger } = await import("@/lib/logger");

  try {
    validateRuntimeConfig();
  } catch (error) {
    logger.error("Refusing to start with unsafe configuration", { error: (error as Error).message });
    throw error;
  }

  for (const problem of checkRuntimeConfig()) {
    if (!problem.fatal) {
      logger.warn("Configuration warning", { variable: problem.variable, message: problem.message });
    }
  }

  if (env.enableInlineJobs) {
    const { startInlineJobRunner } = await import("@/services/jobs");
    startInlineJobRunner();
    logger.info("Inline job runner started (development/single-node mode)");
  }
}
