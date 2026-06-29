# Import ZIP HoloBuilder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Permettere a un admin di importare un export HoloBuilder (ZIP) dalla web app, creando cantiere + piantine + punti + foto, con anteprima, avanzamento live e report errori robusto.

**Architecture:** Server-side. Un endpoint REST riceve lo ZIP, lo estrae in temp, ne analizza la struttura e restituisce un manifest (fase 1). Una mutation GraphQL conferma e crea i record pubblicando l'avanzamento via PubSub/subscription; rollback del cantiere su errore fatale (fase 2). UI in `/admin`.

**Tech Stack:** Express + multer (REST), Apollo Server 4 + graphql-subscriptions (`pubsub`), Prisma, `unzipper` (nuova dep), Next.js 15 + Apollo Client (web), `tsx` per i test delle funzioni pure.

## Global Constraints
- Solo **ADMIN** può importare (endpoint REST e mutation entrambi protetti).
- Niente lettura dimensioni immagine: `Piantina.larghezza/altezza` = placeholder `1000`. Marker in coordinate **% (0–100)**.
- Non modificare: `/upload`, mutation esistenti, mobile, schema Prisma, `parseDateFromFilename` web.
- Uploads dir server: `path.resolve(__dirname, "../uploads")`; URL pubblico `/uploads/<uuid>.<ext>`.
- PubSub condiviso: `apps/server/src/pubsub.ts` (`pubsub`), pattern `asyncIterator([topic])`.
- Schema GraphQL: aggiungere `import` all'array `graphqlFiles` in `schema/index.ts` e registrare i resolver.
- Mesi IT: `gen feb mar apr mag giu lug ago set ott nov dic`.

---

### Task 1: Dipendenza `unzipper`

**Files:** Modify `apps/server/package.json`

- [ ] `npm install unzipper @types/unzipper -w apps/server`
- [ ] Verifica: `node -e "require('unzipper')"` dalla root → nessun errore
- [ ] Commit: `chore(server): aggiunge unzipper per import ZIP`

---

### Task 2: Funzioni pure di parsing (`holobuilderImport.ts`)

**Files:**
- Create: `apps/server/src/lib/holobuilderImport.ts`
- Test: `apps/server/src/lib/holobuilderImport.test.ts`

**Produces:**
- `parseExportDate(filename: string): Date | null`
- `parseFloorLevel(name: string, fallbackIndex: number): number`
- `gridPosition(index: number, total: number): { x: number; y: number }`
- `IMAGE_EXTS: Set<string>`
- `analyzeStructure(relPaths: string[]): { cantiereName: string; floors: ParsedFloor[]; issues: ImportIssue[]; totalePunti: number; totaleFoto: number }`
- Tipi: `ImportIssue { severita: "error"|"warning"; categoria: string; percorso: string; messaggio: string; azione: string }`, `ParsedFloor { name; livello; floorPlanRel: string|null; points: ParsedPoint[] }`, `ParsedPoint { name; photos: ParsedPhoto[] }`, `ParsedPhoto { rel: string; originalName: string; timestamp: Date | null }`

- [ ] **Step 1:** Implementa il modulo (codice sotto)

```ts
import path from "path";

export interface ImportIssue {
  severita: "error" | "warning";
  categoria:
    | "dataMancante" | "fileIgnorato" | "pianoSenzaPlanimetria"
    | "planimetriaSenzaCartella" | "scenaVuota" | "fuoriStruttura" | "scritturaFallita";
  percorso: string;
  messaggio: string;
  azione: string;
}
export interface ParsedPhoto { rel: string; originalName: string; timestamp: Date | null; }
export interface ParsedPoint { name: string; photos: ParsedPhoto[]; }
export interface ParsedFloor { name: string; livello: number; floorPlanRel: string | null; points: ParsedPoint[]; }

export const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);

const MONTHS_IT: Record<string, number> = {
  gen: 0, feb: 1, mar: 2, apr: 3, mag: 4, giu: 5,
  lug: 6, ago: 7, set: 8, ott: 9, nov: 10, dic: 11,
};
const ORDINALS_IT: Record<string, number> = {
  terra: 0, primo: 1, secondo: 2, terzo: 3, quarto: 4, quinto: 5,
  sesto: 6, settimo: 7, ottavo: 8, nono: 9, decimo: 10,
};

/** "Scene 0 (gen. 03, 2025) (1).jpeg" / "... (gen 3 2025)" → Date | null */
export function parseExportDate(filename: string): Date | null {
  const base = path.basename(filename).replace(/\.[^.]+$/, "");
  // ultima parentesi che contiene mese+giorno+anno
  const re = /\(([a-z]{3})\.?\s+(\d{1,2}),?\s+(\d{4})\)/gi;
  let m: RegExpExecArray | null, last: RegExpExecArray | null = null;
  while ((m = re.exec(base)) !== null) last = m;
  if (!last) return null;
  const month = MONTHS_IT[last[1].toLowerCase()];
  if (month === undefined) return null;
  const day = Number(last[2]); const year = Number(last[3]);
  if (day < 1 || day > 31) return null;
  const d = new Date(year, month, day, 12, 0, 0, 0); // mezzogiorno: evita slittamenti TZ
  return isNaN(d.getTime()) ? null : d;
}

/** "primo piano" → 1, "Piano terra" → 0, altrimenti fallbackIndex+1 */
export function parseFloorLevel(name: string, fallbackIndex: number): number {
  const lower = name.toLowerCase();
  for (const [word, lvl] of Object.entries(ORDINALS_IT)) {
    if (lower.includes(word)) return lvl;
  }
  const num = lower.match(/\b(\d{1,2})\b/);
  if (num) return Number(num[1]);
  return fallbackIndex + 1;
}

/** Distribuisce N punti su una griglia in spazio 0–100 con margini 10–90. */
export function gridPosition(index: number, total: number): { x: number; y: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
  const rows = Math.max(1, Math.ceil(total / cols));
  const col = index % cols;
  const row = Math.floor(index / cols);
  const span = 80; const margin = 10;
  const x = cols === 1 ? 50 : margin + (span * col) / (cols - 1);
  const y = rows === 1 ? 50 : margin + (span * row) / (rows - 1);
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

const FLOOR_PLAN_RE = /^(.*?)\s*\(floor plan\)\.(png|jpg|jpeg|webp)$/i;

/**
 * relPaths: percorsi RELATIVI (file, separatore "/") dentro la cartella estratta,
 * già senza eventuale wrapper radice unico.
 */
export function analyzeStructure(relPaths: string[]) {
  const issues: ImportIssue[] = [];
  // 1. mappa piani via "(floor plan)" + cartelle top-level
  const floorPlans = new Map<string, string>(); // floorName(lower) → rel
  const topDirs = new Set<string>();
  for (const rel of relPaths) {
    const parts = rel.split("/");
    if (parts.length === 1) {
      const fm = parts[0].match(FLOOR_PLAN_RE);
      if (fm) floorPlans.set(fm[1].trim().toLowerCase(), rel);
      else issues.push({ severita: "warning", categoria: "fuoriStruttura", percorso: rel, messaggio: `File radice non riconosciuto: ${parts[0]}`, azione: "ignorato" });
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
      issues.push({ severita: "warning", categoria: "pianoSenzaPlanimetria", percorso: dirName, messaggio: `Il piano "${dirName}" non ha planimetria "(floor plan)"`, azione: "piano saltato" });
      floorPlans.delete(key);
      continue;
    }
    floorPlans.delete(key);
    // scene = sottocartelle dirette
    const sceneMap = new Map<string, ParsedPhoto[]>();
    for (const rel of relPaths) {
      const parts = rel.split("/");
      if (parts[0] !== dirName || parts.length < 3) continue;
      const sceneName = parts[1];
      const ext = path.extname(parts[parts.length - 1]).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) {
        issues.push({ severita: "warning", categoria: "fileIgnorato", percorso: rel, messaggio: `File non immagine in una scena: ${parts[parts.length - 1]}`, azione: "saltato" });
        continue;
      }
      const ts = parseExportDate(parts[parts.length - 1]);
      if (!ts) {
        issues.push({ severita: "warning", categoria: "dataMancante", percorso: rel, messaggio: `Data non riconosciuta nel nome: ${parts[parts.length - 1]}`, azione: "importata con data di oggi (o saltata)" });
      }
      if (!sceneMap.has(sceneName)) sceneMap.set(sceneName, []);
      sceneMap.get(sceneName)!.push({ rel, originalName: parts[parts.length - 1], timestamp: ts });
    }
    const points: ParsedPoint[] = [];
    for (const [name, photos] of Array.from(sceneMap.entries()).sort()) {
      if (photos.length === 0) {
        issues.push({ severita: "warning", categoria: "scenaVuota", percorso: `${dirName}/${name}`, messaggio: `Scena vuota: ${name}`, azione: "saltata" });
        continue;
      }
      points.push({ name, photos });
    }
    floors.push({ name: dirName, livello: parseFloorLevel(dirName, floorIdx), floorPlanRel, points });
    floorIdx++;
  }
  // 3. planimetrie senza cartella
  for (const [key, rel] of floorPlans) {
    issues.push({ severita: "warning", categoria: "planimetriaSenzaCartella", percorso: rel, messaggio: `Planimetria senza cartella piano: ${key}`, azione: "ignorata" });
  }
  const totalePunti = floors.reduce((a, f) => a + f.points.length, 0);
  const totaleFoto = floors.reduce((a, f) => a + f.points.reduce((b, p) => b + p.photos.length, 0), 0);
  return { cantiereName: "", floors, issues, totalePunti, totaleFoto };
}

/** Toglie un eventuale wrapper radice unico (es. "UN/...") dai percorsi. */
export function stripRootWrapper(relPaths: string[]): string[] {
  const tops = new Set(relPaths.map((p) => p.split("/")[0]));
  const files = relPaths.filter((p) => p.split("/").length === 1);
  if (tops.size === 1 && files.length === 0) {
    const root = Array.from(tops)[0] + "/";
    return relPaths.map((p) => p.slice(root.length));
  }
  return relPaths;
}
```

- [ ] **Step 2:** Scrivi il test (assert nativi, eseguibile con tsx)

```ts
import assert from "assert";
import { parseExportDate, parseFloorLevel, gridPosition, analyzeStructure, stripRootWrapper } from "./holobuilderImport.js";

// parseExportDate
assert.strictEqual(parseExportDate("Scene 0 (apr. 01, 2025).jpeg")!.getMonth(), 3);
assert.strictEqual(parseExportDate("Scene 0 (apr. 01, 2025).jpeg")!.getDate(), 1);
assert.strictEqual(parseExportDate("Scene 5 (gen 3 2025).jpeg")!.getMonth(), 0);
assert.strictEqual(parseExportDate("Scene 0 (gen. 03, 2025) (2).jpeg")!.getDate(), 3);
assert.strictEqual(parseExportDate("Scene 2.jpeg"), null);
// parseFloorLevel
assert.strictEqual(parseFloorLevel("primo piano", 0), 1);
assert.strictEqual(parseFloorLevel("secondo piano", 1), 2);
assert.strictEqual(parseFloorLevel("Mezzanino", 5), 6);
// gridPosition
const g = gridPosition(0, 4); assert.ok(g.x >= 0 && g.x <= 100 && g.y >= 0 && g.y <= 100);
// stripRootWrapper
assert.deepStrictEqual(stripRootWrapper(["UN/a/b.jpg", "UN/c.png"]), ["a/b.jpg", "c.png"]);
// analyzeStructure
const r = analyzeStructure([
  "primo piano (floor plan).png",
  "primo piano/scena 0/Scene 0 (apr. 01, 2025).jpeg",
  "primo piano/scena 0/Scene 0 (mar. 07, 2025).jpeg",
  "primo piano/scena 1/note.txt",
]);
assert.strictEqual(r.floors.length, 1);
assert.strictEqual(r.floors[0].points.length, 1); // scena 0 (scena 1 ha solo txt → scenaVuota)
assert.strictEqual(r.totaleFoto, 2);
assert.ok(r.issues.some((i) => i.categoria === "fileIgnorato"));
console.log("OK holobuilderImport");
```

- [ ] **Step 3:** Esegui: `cd apps/server && npx tsx src/lib/holobuilderImport.test.ts` → stampa `OK holobuilderImport`
- [ ] **Step 4:** Smoke reale contro l'export: script temporaneo che fa `fs.readdirSync` ricorsivo di `upload/UN`, passa i path relativi a `stripRootWrapper`+`analyzeStructure`, stampa `floors/punti/foto/issues`. Atteso: 2 piani, 17 punti, 137 foto, 0 issue gravi.
- [ ] **Step 5:** Commit: `feat(server): parser struttura/data export HoloBuilder + test`

---

### Task 3: Job store + estrazione ZIP (`importJobs.ts`)

**Files:** Create `apps/server/src/lib/importJobs.ts`

**Consumes:** `analyzeStructure`, `stripRootWrapper` (Task 2)
**Produces:**
- `createImportJob(zipPath: string): Promise<{ jobId: string; manifest: ImportManifest; }>`
- `getImportJob(jobId: string): ImportJob | undefined`
- `consumeImportJob(jobId: string): ImportJob | undefined` (rimuove dalla mappa, NON cancella i file)
- `cleanupImportJob(jobId: string): void` (rimuove la temp dir)
- Tipi `ImportJob { tempDir; structure; manifest; createdAt }`, `ImportManifest { jobId; nomeCantiere; floors:[{nome,livello,hasPlanimetria,puntiCount,fotoCount}]; totalePunti; totaleFoto; issues }`

- [ ] **Step 1:** Implementa: estrai con `unzipper.Open.file(zipPath)` → per ogni entry `type==="File"`, valida path (zip-slip: `path.normalize` deve restare dentro tempDir), scrivi su `tempDir/<rel>`. Raccogli i rel, `stripRootWrapper`, `analyzeStructure`. `cantiereName` = nome base dello zip. Genera `jobId = randomUUID()`. TTL: `setInterval` ogni 15min cancella job + tempDir più vecchi di 60min.
- [ ] **Step 2:** Verifica zip-slip: unit test con un entry `../evil.txt` → deve lanciare/scartare. Esegui con tsx.
- [ ] **Step 3:** Commit: `feat(server): job store + estrazione sicura ZIP import`

---

### Task 4: GraphQL typeDefs + resolver import

**Files:**
- Create `apps/server/src/schema/typeDefs/import.graphql`
- Create `apps/server/src/schema/resolvers/import.ts`
- Modify `apps/server/src/schema/index.ts` (registra `import` in `graphqlFiles` + `importResolvers` nel deepMerge)

**Consumes:** `getImportJob/consumeImportJob/cleanupImportJob` (Task 3), `pubsub`, `requireAdmin`
**Produces:** Mutation `confermaImportHolobuilder(jobId, nome, indirizzo, skipFotoSenzaData)`, Subscription `importProgress(jobId)`

- [ ] **Step 1:** `import.graphql`:

```graphql
type ImportIssue { severita: String!, categoria: String!, percorso: String!, messaggio: String!, azione: String! }
type ImportProgress { fase: String!, correnti: Int!, totali: Int!, messaggio: String!, avvisiCount: Int!, erroriCount: Int!, completato: Boolean!, errore: String, cantiereId: ID }
type ImportResult { stato: String!, cantiereId: ID, piantineCreate: Int!, puntiCreati: Int!, fotoCreate: Int!, issues: [ImportIssue!]! }
extend type Mutation { confermaImportHolobuilder(jobId: ID!, nome: String!, indirizzo: String!, skipFotoSenzaData: Boolean): ImportResult! }
extend type Subscription { importProgress(jobId: ID!): ImportProgress! }
```

- [ ] **Step 2:** `import.ts` resolver:
  - `Mutation.confermaImportHolobuilder`: `requireAdmin(ctx)`; `job = consumeImportJob(jobId)` (404 se assente); `cantiere = prisma.cantiere.create({nome, indirizzo})`; **try**: per ogni floor → copia `floorPlanRel` in uploads (uuid) → `prisma.piantina.create({cantiereId, nome, livello, fileUrl, larghezza:1000, altezza:1000})`; per ogni punto (indice/total per `gridPosition`) → `prisma.puntoDiScatto.create({piantinaId, nome, x, y})`; per ogni foto → se `timestamp===null && skipFotoSenzaData` salta (issue) → copia in uploads → `prisma.foto360.create({puntoDiScattoId, url, timestamp?, metadata:{source:"holobuilder-import", originalName}})`; `pubsub.publish(\`IMPORT_PROGRESS_${jobId}\`, {importProgress:{...}})` a ogni foto; **catch**(fatale): `prisma.cantiere.delete({where:{id}})` (cascade), publish errore, throw; **finally**: `cleanupImportJob(jobId)`. Ritorna `ImportResult`.
  - `Subscription.importProgress.subscribe`: `pubsub.asyncIterator([\`IMPORT_PROGRESS_${jobId}\`])`.
  - Copia file helper locale `copyToUploads(srcAbs): string` → uuid+ext, ritorna `/uploads/<file>`.
- [ ] **Step 3:** `schema/index.ts`: aggiungi `"import"` all'array `graphqlFiles`; importa `importResolvers` e aggiungilo a `deepMergeResolvers(...)`.
- [ ] **Step 4:** `cd apps/server && npm run typecheck` → nessun nuovo errore (ignorando i pre-esistenti noti).
- [ ] **Step 5:** Commit: `feat(server): mutation+subscription import HoloBuilder`

---

### Task 5: Endpoint REST `POST /import/holobuilder`

**Files:**
- Create `apps/server/src/importRoute.ts` (router + multer zip)
- Modify `apps/server/src/index.ts` (monta il router prima di `/uploads` static)

**Consumes:** `createImportJob` (Task 3), `extractAuthHeader`/`getUserFromToken` (auth)

- [ ] **Step 1:** `importRoute.ts`: multer diskStorage in `os.tmpdir()`, `limits.fileSize = 2GB`, `fileFilter` accetta `application/zip`/`application/x-zip-compressed`/`.zip`. Handler `POST /import/holobuilder`: estrai bearer → `getUserFromToken` → 401 se non admin; `const { jobId, manifest } = await createImportJob(req.file.path)`; cancella lo zip temporaneo caricato; `res.json({ jobId, manifest })`. Gestione errori → 400/500 con `{error}`.
- [ ] **Step 2:** `index.ts`: `import { importRouter } from "./importRoute.js"` e `app.use(importRouter)` dopo il blocco `/upload`.
- [ ] **Step 3:** `npm run typecheck` pulito.
- [ ] **Step 4:** Commit: `feat(server): endpoint REST import ZIP admin-only`

---

### Task 6: Web — upload helper + documenti gql

**Files:**
- Create `apps/web/src/lib/importUpload.ts`
- Modify `apps/web/src/graphql/mutations.ts` (+`CONFERMA_IMPORT_HOLOBUILDER`)
- Create `apps/web/src/graphql/subscriptions.ts` (+`IMPORT_PROGRESS_SUBSCRIPTION`) — o aggiungi a file esistente se presente

**Produces:** `uploadHolobuilderZip(file, onProgress): Promise<{jobId, manifest}>`

- [ ] **Step 1:** `importUpload.ts`: usa `XMLHttpRequest` (per `upload.onprogress` → `onProgress(0..100)`), `POST ${SERVER_URL}/import/holobuilder`, header `Authorization: Bearer ${getToken()}`, body `FormData{file}`. Risolvi con `JSON.parse(xhr.responseText)`. (`SERVER_URL` e `getToken` esistono.)
- [ ] **Step 2:** mutation + subscription gql (campi come da Task 4).
- [ ] **Step 3:** `cd apps/web && npx tsc --noEmit` → nessun nuovo errore.
- [ ] **Step 4:** Commit: `feat(web): client upload ZIP import + documenti gql`

---

### Task 7: Web — UI pagina `/admin/importa`

**Files:**
- Create `apps/web/src/app/admin/importa/page.tsx`
- Modify `apps/web/src/app/admin/page.tsx` (bottone/link "Importa da HoloBuilder" → `/admin/importa`)

**Consumes:** `uploadHolobuilderZip`, `CONFERMA_IMPORT_HOLOBUILDER`, `IMPORT_PROGRESS_SUBSCRIPTION`

- [ ] **Step 1:** Pagina con macchina a stati: `idle → uploading(%) → preview(manifest) → importing(progress sub) → done(result)|error`. Dropzone (riusa pattern `CaricaPiantinaModal`). Anteprima: riepilogo conteggi + lista issue raggruppata per `categoria` con percorso+azione; input `indirizzo` (obbligatorio), `nome` precompilato da `manifest.nomeCantiere`, toggle "Salta foto senza data". Bottone "Importa" → mutation + `useSubscription(IMPORT_PROGRESS)` per la barra. `done`: riepilogo `stato` + conteggi + issue + link `/dashboard/cantieri/${cantiereId}`.
- [ ] **Step 2:** In `admin/page.tsx` header: `<Link href="/admin/importa" className="btn-secondary">Importa da HoloBuilder</Link>`.
- [ ] **Step 3:** `npx tsc --noEmit` (web) pulito.
- [ ] **Step 4:** Commit: `feat(web): UI import HoloBuilder in /admin`

---

### Task 8: Verifica end-to-end + canvas

- [ ] **Step 1:** Avvia stack locale (`docker:up`, `db:migrate`, `dev:server`, `dev:web`) se DB disponibile; altrimenti documenta che la verifica e2e richiede ambiente con Postgres.
- [ ] **Step 2:** Login admin → `/admin/importa` → carica `upload/UN.zip` → verifica manifest (2 piani, 17 punti, 137 foto) → importa → verifica barra avanzamento → apri il cantiere creato.
- [ ] **Step 3:** Verifica che `PiantinaCanvas` renderizzi i marker a griglia con `larghezza/altezza=1000` placeholder (coordinate %). Se i marker risultano disallineati per via delle dimensioni placeholder, fix: nel canvas usare le dimensioni naturali dell'immagine renderizzata invece degli interi salvati.
- [ ] **Step 4:** Commit eventuali fix: `fix(web): allineamento marker piantina importata`.

## Self-Review
- **Spec coverage:** flusso 2 fasi (Task 5+4), elaborazione server (3-5), nuovo cantiere (4), griglia (2/4), no image-size (4 placeholder), progresso live (4/7), sistema errori 2 livelli + report (2/4/7), zip-slip (3), rollback (4), cleanup/TTL (3), parser data IT (2). ✓
- **Placeholder scan:** nessun TODO; codice reale nelle funzioni pure (Task 2) e interfacce esplicite per le altre.
- **Type consistency:** `ImportIssue`/`ParsedFloor`/`ParsedPhoto` definiti in Task 2 e riusati; `ImportManifest` in Task 3; nomi mutation/subscription coerenti tra Task 4, 6, 7.
