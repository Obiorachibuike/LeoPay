/**
 * Typed application errors. Services throw AppError; route handlers and server
 * actions convert them into safe client responses without leaking internals.
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYMENT_ERROR"
  | "PROVIDER_ERROR"
  | "PROVIDER_NOT_CONFIGURED"
  | "CONFIGURATION_ERROR"
  | "UNSAFE_OPERATION"
  | "UNSUPPORTED"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, string[] | string>;
  readonly expose: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { status?: number; details?: Record<string, string[] | string>; expose?: boolean },
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = options?.status ?? defaultStatus(code);
    this.details = options?.details;
    this.expose = options?.expose ?? true;
  }
}

function defaultStatus(code: ErrorCode): number {
  switch (code) {
    case "VALIDATION_ERROR":
      return 422;
    case "UNAUTHENTICATED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
    case "UNSAFE_OPERATION":
      return 409;
    case "UNSUPPORTED":
      return 422;
    case "RATE_LIMITED":
      return 429;
    case "PAYMENT_ERROR":
      return 402;
    case "PROVIDER_ERROR":
      return 502;
    case "PROVIDER_NOT_CONFIGURED":
    case "CONFIGURATION_ERROR":
      return 503;
    default:
      return 500;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export const notFound = (what = "Resource") => new AppError("NOT_FOUND", `${what} not found`);
export const forbidden = (message = "You do not have permission to perform this action") =>
  new AppError("FORBIDDEN", message);
export const unauthenticated = (message = "Authentication required") =>
  new AppError("UNAUTHENTICATED", message);
export const validationError = (message: string, details?: Record<string, string[] | string>) =>
  new AppError("VALIDATION_ERROR", message, { details });

/** Normalises any thrown value into a safe {code,message,details} shape. */
export type FieldErrors = Record<string, string[]>;

/** Flattens AppError details into the string[] shape forms consume. */
function normaliseDetails(details?: Record<string, string[] | string>): FieldErrors | undefined {
  if (!details) return undefined;
  const out: FieldErrors = {};
  for (const [key, value] of Object.entries(details)) {
    out[key] = Array.isArray(value) ? value : [value];
  }
  return out;
}

export function toErrorResponse(error: unknown): {
  code: ErrorCode;
  message: string;
  details?: FieldErrors;
  status: number;
} {
  if (isAppError(error)) {
    return {
      code: error.code,
      message: error.expose ? error.message : "Something went wrong. Please try again.",
      details: error.expose ? normaliseDetails(error.details) : undefined,
      status: error.status,
    };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "Something went wrong. Please try again.",
    status: 500,
  };
}
