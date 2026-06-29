import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import unzipper from "unzipper";
import {
  analyzeStructure,
  type AnalyzeResult,
  type ImportIssue,
} from "./holobuilderImport.js";

/** True per gli artefatti macOS che non vanno importati. */
function isJunkPath(p: string): boolean {
  if (p.startsWith("__MACOSX/")) return true;
  return p.split("/").some((seg) => seg === ".DS_Store" || seg.startsWith("._"));
}

/** Prefisso del wrapper radice unico (es. "UN/"), o "" se non c'è. */
function detectRootPrefix(paths: string[]): string {
  const tops = new Set(paths.map((p) => p.split("/")[0]));
  const rootFiles = paths.filter((p) => !p.includes("/"));
  if (tops.size === 1 && rootFiles.length === 0) {
    return Array.from(tops)[0] + "/";
  }
  return "";
}

export interface ImportManifestFloor {
  nome: string;
  livello: number;
  hasPlanimetria: boolean;
  puntiCount: number;
  fotoCount: number;
}
export interface ImportManifest {
  jobId: string;
  nomeCantiere: string;
  floors: ImportManifestFloor[];
  totalePunti: number;
  totaleFoto: number;
  issues: ImportIssue[];
}
export interface ImportJob {
  tempDir: string;
  structure: AnalyzeResult;
  manifest: ImportManifest;
  createdAt: number;
}

const jobs = new Map<string, ImportJob>();
const JOB_TTL_MS = 60 * 60 * 1000; // 60 minuti

/**
 * Risolve `entryPath` dentro `baseDir` proteggendo da Zip Slip (path traversal).
 * Lancia se il path risultante esce da baseDir. Esportata per i test.
 */
export function resolveSafe(baseDir: string, entryPath: string): string {
  const target = path.resolve(baseDir, entryPath);
  const baseWithSep = baseDir.endsWith(path.sep) ? baseDir : baseDir + path.sep;
  if (target !== baseDir && !target.startsWith(baseWithSep)) {
    throw new Error(`Percorso non sicuro nello ZIP (zip slip): ${entryPath}`);
  }
  return target;
}

function streamToFile(
  file: { stream: () => NodeJS.ReadableStream },
  dest: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    file
      .stream()
      .on("error", reject)
      .pipe(out)
      .on("error", reject)
      .on("finish", () => resolve());
  });
}

/**
 * Estrae lo ZIP in una cartella temporanea, ne analizza la struttura e
 * registra un job. Ritorna { jobId, manifest }. NON cancella lo zip sorgente.
 */
export async function createImportJob(
  zipPath: string,
  originalZipName: string
): Promise<{ jobId: string; manifest: ImportManifest }> {
  const jobId = randomUUID();
  const tempDir = path.join(os.tmpdir(), `hb-import-${jobId}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const directory = await unzipper.Open.file(zipPath);
  // Solo file reali, niente artefatti macOS (__MACOSX, .DS_Store, ._*).
  const fileEntries = directory.files.filter(
    (f) => f.type === "File" && !f.path.endsWith("/") && !isJunkPath(f.path)
  );
  // Prefisso wrapper radice (es. "UN/"): calcolato sui path grezzi così i file
  // vengono scritti su disco GIÀ senza il wrapper → combaciano con la struttura.
  const rootPrefix = detectRootPrefix(fileEntries.map((f) => f.path));

  const relPaths: string[] = [];
  for (const file of fileEntries) {
    const rel = file.path.slice(rootPrefix.length);
    if (!rel) continue;
    const dest = resolveSafe(tempDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await streamToFile(
      file as unknown as { stream: () => NodeJS.ReadableStream },
      dest
    );
    relPaths.push(rel);
  }

  const structure = analyzeStructure(relPaths);
  const cantiereName = path
    .basename(originalZipName)
    .replace(/\.[^.]+$/, "")
    .trim();
  structure.cantiereName = cantiereName;

  const manifest: ImportManifest = {
    jobId,
    nomeCantiere: cantiereName,
    floors: structure.floors.map((f) => ({
      nome: f.name,
      livello: f.livello,
      hasPlanimetria: f.floorPlanRel !== null,
      puntiCount: f.points.length,
      fotoCount: f.points.reduce((a, p) => a + p.photos.length, 0),
    })),
    totalePunti: structure.totalePunti,
    totaleFoto: structure.totaleFoto,
    issues: structure.issues,
  };

  jobs.set(jobId, { tempDir, structure, manifest, createdAt: Date.now() });
  return { jobId, manifest };
}

export function getImportJob(jobId: string): ImportJob | undefined {
  return jobs.get(jobId);
}

/** Rimuove il job dalla mappa (i file su disco restano per la creazione). */
export function consumeImportJob(jobId: string): ImportJob | undefined {
  const job = jobs.get(jobId);
  if (job) jobs.delete(jobId);
  return job;
}

/** Cancella la cartella temporanea del job (chiamare a fine import). */
export function cleanupImportJob(tempDir: string): void {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

// Pulizia periodica dei job orfani (utente che abbandona dopo l'anteprima).
const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      cleanupImportJob(job.tempDir);
      jobs.delete(id);
    }
  }
}, 15 * 60 * 1000);
sweepTimer.unref?.();
