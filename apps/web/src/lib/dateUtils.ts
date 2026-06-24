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

/**
 * Estrae la data/ora di scatto dal nome di un file scaricato da HoloBuilder, nel
 * formato generato in fase di download:
 *   <scena>_GG-MM-AAAA_HHMM.jpeg   → es. "Piscina 5_13-06-2020_0746.jpeg"
 *   <scena>_GG-MM-AAAA.jpeg        → es. "salone_05-10-2020.jpeg" (senza ora)
 * Gestisce anche l'eventuale suffisso dei duplicati ("_2", " (1)").
 *
 * La data è interpretata come ora locale. Ritorna `null` se il nome non contiene
 * una data valida nel formato atteso (in tal caso il chiamante lascia il default
 * lato server = ora di caricamento).
 */
export function parseDateFromFilename(filename: string): Date | null {
  if (!filename) return null;
  // togli l'estensione
  const base = filename.replace(/\.[^.]+$/, "");
  // GG-MM-AAAA con HHMM opzionale, ancorato in fondo (ignora suffisso duplicati)
  const m = base.match(
    /(\d{2})-(\d{2})-(\d{4})(?:[_-](\d{2})(\d{2}))?(?:[ _]\(?\d+\)?)?$/
  );
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const hour = m[4] !== undefined ? Number(m[4]) : 0;
  const minute = m[5] !== undefined ? Number(m[5]) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;
  const d = new Date(year, month - 1, day, hour, minute, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}
