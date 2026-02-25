/**
 * Parses a date value that may come from GraphQL as:
 *  - ISO string: "2026-02-23T14:30:00.000Z"
 *  - Numeric string (Prisma Date → graphql-js String scalar): "1740317400000"
 *  - Already a number: 1740317400000
 */
export function safeDate(val: string | number | null | undefined): Date {
  if (val === null || val === undefined || val === "") return new Date(0);
  if (typeof val === "number") return new Date(val);
  // Numeric string (milliseconds since epoch)
  const n = Number(val);
  if (!isNaN(n) && val.trim() !== "") return new Date(n);
  // ISO or locale string fallback
  return new Date(val);
}

export function formatDate(
  val: string | number | null | undefined,
  opts?: Intl.DateTimeFormatOptions
): string {
  const d = safeDate(val);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("it-IT", opts ?? {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(val: string | number | null | undefined): string {
  const d = safeDate(val);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
