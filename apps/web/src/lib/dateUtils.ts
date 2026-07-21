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

const MONTHS_IT_ABBR: Record<string, number> = {
  gen: 0, feb: 1, mar: 2, apr: 3, mag: 4, giu: 5,
  lug: 6, ago: 7, set: 8, ott: 9, nov: 10, dic: 11,
};

/**
 * Estrae la data dal nome file dell'export HoloBuilder (visualizzatore web):
 *   "Scene 3 (apr. 03, 2025).jpeg"     → 2025-04-03
 *   "Scene 5 (gen 3 2025).jpeg"        → 2025-01-03 (senza punti/virgola)
 * Ignora l'eventuale suffisso duplicati "(1)". Ritorna null se non trova la data.
 */
export function parseHoloBuilderDate(filename: string): Date | null {
  if (!filename) return null;
  const base = filename.replace(/\.[^.]+$/, "");
  const re = /\(([a-z]{3})\.?\s+(\d{1,2}),?\s+(\d{4})\)/gi;
  let m: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((m = re.exec(base)) !== null) last = m;
  if (!last) return null;
  const month = MONTHS_IT_ABBR[last[1].toLowerCase()];
  if (month === undefined) return null;
  const day = Number(last[2]);
  const year = Number(last[3]);
  if (day < 1 || day > 31) return null;
  const d = new Date(year, month, day, 12, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Prova a ricavare la data di scatto dal nome file, gestendo entrambi i
 * formati noti (export HoloBuilder "Scene N (mmm. GG, AAAA)" e "GG-MM-AAAA").
 * Usata all'upload manuale per non far cadere la data sul giorno di caricamento.
 */
export function parsePhotoDateFromFilename(filename: string): Date | null {
  return parseHoloBuilderDate(filename) ?? parseDateFromFilename(filename);
}
