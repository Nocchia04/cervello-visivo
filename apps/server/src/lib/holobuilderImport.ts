import path from "path";

/**
 * Parsing della struttura di un export HoloBuilder e dei nomi file.
 *
 * Struttura attesa (astratta):
 *   <piano> (floor plan).png        → planimetria del piano
 *   <piano>/<scena>/<scena> (data).jpeg
 *
 * Tutto è "best-effort": i problemi diventano ImportIssue (warning) e non
 * bloccano l'import; solo i problemi davvero fatali (gestiti altrove) fermano.
 */

export interface ImportIssue {
  severita: "error" | "warning";
  categoria:
    | "dataMancante"
    | "fileIgnorato"
    | "pianoSenzaPlanimetria"
    | "planimetriaSenzaCartella"
    | "scenaVuota"
    | "fuoriStruttura"
    | "scritturaFallita";
  percorso: string;
  messaggio: string;
  azione: string;
}

export interface ParsedPhoto {
  rel: string;
  originalName: string;
  timestamp: Date | null;
}
export interface ParsedPoint {
  name: string;
  photos: ParsedPhoto[];
}
export interface ParsedFloor {
  name: string;
  livello: number;
  floorPlanRel: string | null;
  points: ParsedPoint[];
}
export interface AnalyzeResult {
  cantiereName: string;
  floors: ParsedFloor[];
  issues: ImportIssue[];
  totalePunti: number;
  totaleFoto: number;
}

export const IMAGE_EXTS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".tif",
  ".tiff",
]);

const MONTHS_IT: Record<string, number> = {
  gen: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  mag: 4,
  giu: 5,
  lug: 6,
  ago: 7,
  set: 8,
  ott: 9,
  nov: 10,
  dic: 11,
};

const ORDINALS_IT: Record<string, number> = {
  terra: 0,
  primo: 1,
  secondo: 2,
  terzo: 3,
  quarto: 4,
  quinto: 5,
  sesto: 6,
  settimo: 7,
  ottavo: 8,
  nono: 9,
  decimo: 10,
};

/**
 * Estrae la data di scatto dal nome file dell'export HoloBuilder italiano.
 *   "Scene 0 (apr. 01, 2025).jpeg"        → 2025-04-01
 *   "Scene 5 (gen 3 2025).jpeg"           → 2025-01-03 (senza punti/virgola)
 *   "Scene 0 (gen. 03, 2025) (2).jpeg"    → 2025-01-03 (ignora il suffisso (2))
 *   "Scene 2.jpeg"                        → null
 */
export function parseExportDate(filename: string): Date | null {
  const base = path.basename(filename).replace(/\.[^.]+$/, "");
  // Cerca l'ULTIMA parentesi contenente mese(3 lett)+giorno+anno.
  const re = /\(([a-z]{3})\.?\s+(\d{1,2}),?\s+(\d{4})\)/gi;
  let m: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((m = re.exec(base)) !== null) last = m;
  if (!last) return null;
  const month = MONTHS_IT[last[1].toLowerCase()];
  if (month === undefined) return null;
  const day = Number(last[2]);
  const year = Number(last[3]);
  if (day < 1 || day > 31) return null;
  // Mezzogiorno locale: evita slittamenti di giorno per fuso orario.
  const d = new Date(year, month, day, 12, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

/** "primo piano" → 1, "Piano terra" → 0, "Mezzanino" → fallbackIndex+1. */
export function parseFloorLevel(name: string, fallbackIndex: number): number {
  const lower = name.toLowerCase();
  for (const [word, lvl] of Object.entries(ORDINALS_IT)) {
    if (lower.includes(word)) return lvl;
  }
  const num = lower.match(/\b(\d{1,2})\b/);
  if (num) return Number(num[1]);
  return fallbackIndex + 1;
}

/** Distribuisce N punti su una griglia in spazio 0–100 (margini 10–90). */
export function gridPosition(
  index: number,
  total: number
): { x: number; y: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
  const rows = Math.max(1, Math.ceil(total / cols));
  const col = index % cols;
  const row = Math.floor(index / cols);
  const span = 80;
  const margin = 10;
  const x = cols === 1 ? 50 : margin + (span * col) / (cols - 1);
  const y = rows === 1 ? 50 : margin + (span * row) / (rows - 1);
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

const FLOOR_PLAN_RE = /^(.*?)\s*\(floor plan\)\.(png|jpg|jpeg|webp)$/i;

/** Toglie un eventuale wrapper radice unico (es. "UN/...") dai percorsi. */
export function stripRootWrapper(relPaths: string[]): string[] {
  const tops = new Set(relPaths.map((p) => p.split("/")[0]));
  const rootFiles = relPaths.filter((p) => p.split("/").length === 1);
  if (tops.size === 1 && rootFiles.length === 0) {
    const root = Array.from(tops)[0] + "/";
    return relPaths.map((p) => p.slice(root.length)).filter((p) => p.length > 0);
  }
  return relPaths;
}

/**
 * Analizza i percorsi RELATIVI (file, separatore "/") già senza wrapper radice
 * e costruisce piani → scene(punti) → foto, raccogliendo gli ImportIssue.
 */
export function analyzeStructure(relPaths: string[]): AnalyzeResult {
  const issues: ImportIssue[] = [];

  // 1. planimetrie (file top-level "(floor plan)") + cartelle top-level
  const floorPlans = new Map<string, string>(); // floorName(lower) → rel
  const topDirs = new Set<string>();
  for (const rel of relPaths) {
    const parts = rel.split("/");
    if (parts.length === 1) {
      const fm = parts[0].match(FLOOR_PLAN_RE);
      if (fm) {
        floorPlans.set(fm[1].trim().toLowerCase(), rel);
      } else {
        issues.push({
          severita: "warning",
          categoria: "fuoriStruttura",
          percorso: rel,
          messaggio: `File alla radice non riconosciuto: ${parts[0]}`,
          azione: "ignorato",
        });
      }
    } else {
      topDirs.add(parts[0]);
    }
  }

  // 2. costruisci i piani dalle cartelle top-level
  const floors: ParsedFloor[] = [];
  let floorIdx = 0;
  for (const dirName of Array.from(topDirs).sort()) {
    const key = dirName.trim().toLowerCase();
    const floorPlanRel = floorPlans.get(key) ?? null;
    if (!floorPlanRel) {
      issues.push({
        severita: "warning",
        categoria: "pianoSenzaPlanimetria",
        percorso: dirName,
        messaggio: `Il piano "${dirName}" non ha una planimetria "(floor plan)"`,
        azione: "piano saltato",
      });
      continue;
    }
    floorPlans.delete(key);

    // scene = sottocartelle dirette del piano. Raccogliamo PRIMA i nomi di
    // tutte le scene (così una scena con soli file non-immagine viene comunque
    // rilevata e segnalata come vuota, invece di sparire silenziosamente).
    const sceneNames = new Set<string>();
    const sceneMap = new Map<string, ParsedPhoto[]>();
    for (const rel of relPaths) {
      const parts = rel.split("/");
      if (parts[0] !== dirName || parts.length < 3) continue;
      const sceneName = parts[1];
      sceneNames.add(sceneName);
      const fileName = parts[parts.length - 1];
      const ext = path.extname(fileName).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) {
        issues.push({
          severita: "warning",
          categoria: "fileIgnorato",
          percorso: rel,
          messaggio: `File non immagine in una scena: ${fileName}`,
          azione: "saltato",
        });
        continue;
      }
      const ts = parseExportDate(fileName);
      if (!ts) {
        issues.push({
          severita: "warning",
          categoria: "dataMancante",
          percorso: rel,
          messaggio: `Data non riconosciuta nel nome: ${fileName}`,
          azione: "importata con data di oggi (o saltata)",
        });
      }
      if (!sceneMap.has(sceneName)) sceneMap.set(sceneName, []);
      sceneMap.get(sceneName)!.push({ rel, originalName: fileName, timestamp: ts });
    }

    const points: ParsedPoint[] = [];
    for (const name of Array.from(sceneNames).sort()) {
      const photos = sceneMap.get(name) ?? [];
      if (photos.length === 0) {
        issues.push({
          severita: "warning",
          categoria: "scenaVuota",
          percorso: `${dirName}/${name}`,
          messaggio: `Scena senza immagini valide: ${name}`,
          azione: "saltata",
        });
        continue;
      }
      points.push({ name, photos });
    }

    floors.push({
      name: dirName,
      livello: parseFloorLevel(dirName, floorIdx),
      floorPlanRel,
      points,
    });
    floorIdx++;
  }

  // 3. planimetrie rimaste senza cartella piano
  for (const [key, rel] of floorPlans) {
    issues.push({
      severita: "warning",
      categoria: "planimetriaSenzaCartella",
      percorso: rel,
      messaggio: `Planimetria senza cartella piano corrispondente: ${key}`,
      azione: "ignorata",
    });
  }

  const totalePunti = floors.reduce((a, f) => a + f.points.length, 0);
  const totaleFoto = floors.reduce(
    (a, f) => a + f.points.reduce((b, p) => b + p.photos.length, 0),
    0
  );
  return { cantiereName: "", floors, issues, totalePunti, totaleFoto };
}
