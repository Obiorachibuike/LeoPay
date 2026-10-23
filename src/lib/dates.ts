/** UTC-safe date helpers. Instants are stored in UTC; display uses the app timezone. */
export const APP_TIMEZONE = "Africa/Lagos";

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeZone: APP_TIMEZONE }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TIMEZONE,
  }).format(date);
}

export type RangeKey = "today" | "7d" | "30d" | "90d" | "custom";

export function resolveRange(key: RangeKey, from?: string, to?: string): { from: Date; to: Date } {
  const now = new Date();
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(now);

  switch (key) {
    case "today":
      start.setUTCHours(0, 0, 0, 0);
      return { from: start, to: end };
    case "7d":
      start.setUTCDate(start.getUTCDate() - 6);
      start.setUTCHours(0, 0, 0, 0);
      return { from: start, to: end };
    case "30d":
      start.setUTCDate(start.getUTCDate() - 29);
      start.setUTCHours(0, 0, 0, 0);
      return { from: start, to: end };
    case "90d":
      start.setUTCDate(start.getUTCDate() - 89);
      start.setUTCHours(0, 0, 0, 0);
      return { from: start, to: end };
    case "custom": {
      const customFrom = from ? new Date(from) : new Date(start.setUTCDate(start.getUTCDate() - 29));
      const customTo = to ? new Date(to) : end;
      customTo.setUTCHours(23, 59, 59, 999);
      if (Number.isNaN(customFrom.getTime()) || Number.isNaN(customTo.getTime())) {
        const fallback = new Date();
        fallback.setUTCDate(fallback.getUTCDate() - 29);
        fallback.setUTCHours(0, 0, 0, 0);
        return { from: fallback, to: end };
      }
      if (customFrom > customTo) return { from: customTo, to: customFrom };
      return { from: customFrom, to: customTo };
    }
    default:
      start.setUTCDate(start.getUTCDate() - 29);
      start.setUTCHours(0, 0, 0, 0);
      return { from: start, to: end };
  }
}

export function timeAgo(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}
