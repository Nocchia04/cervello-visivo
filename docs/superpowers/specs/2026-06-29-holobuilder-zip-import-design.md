# Import ZIP HoloBuilder — design

**Data:** 2026-06-29
**Stato:** approvazione design in corso
**Ambito:** web app (admin) + server. Nessuna modifica a mobile, modello Prisma, endpoint `/upload` esistente.

## Obiettivo

Permettere a un **admin** di importare in blocco un export HoloBuilder (uno ZIP di foto 360° organizzate per piano → scena → storico) creando automaticamente un nuovo cantiere con piantine, punti di scatto e foto, con barra di avanzamento e in modo sicuro (anteprima prima di scrivere nel DB, rollback in caso di errore grave).

## Struttura logica dell'export (astratta)

L'importer ragiona sulla **struttura**, non su nomi fissi:

```
ZIP (eventuale cartella radice wrapper, es. "UN/")
├── <nome piano> (floor plan).<img>      → Piantina (planimetria)
├── <nome piano>/
│   └── <nome scena>/                    → PuntoDiScatto
│       └── <nome scena> (data).<img>    → Foto360 (timestamp = data)
└── ... (altri piani)
```

Mappatura:

| Elemento ZIP | Entità | Note |
|---|---|---|
| coppia `<piano> (floor plan).png` + cartella `<piano>/` | **Piantina** | `fileUrl` = planimetria copiata in `/uploads`; `livello` = ordinale IT ("primo"→1, "secondo"→2, fallback indice); `larghezza`/`altezza` = placeholder (vedi sotto) |
| sottocartella `<scena>/` | **PuntoDiScatto** | `nome` = nome cartella; `x`/`y` assegnati a **griglia** |
| immagine dentro la scena | **Foto360** | `url` = file copiato in `/uploads`; `timestamp` = data dal nome; `metadata` = `{ source: "holobuilder-import", originalName }` |

Riferimento reale (export "UN"): 2 piani → 2 piantine, 17 scene → 17 punti, 137 jpeg → 137 foto, foto 5376×2688.

## Decisioni di design (concordate con l'utente)

1. **Elaborazione server-side (batch).** Lo ZIP sale al server, che lo scompatta e crea i record via Prisma. (No elaborazione nel browser.)
2. **Sempre nuovo cantiere.** Ogni import crea un cantiere nuovo; nome precompilato dal nome ZIP, **indirizzo** inserito dall'admin (campo obbligatorio nel modello).
3. **Marker a griglia.** L'export non contiene coordinate dei marker → punti disposti a griglia ordinata; l'admin li riposiziona poi col canvas esistente.
4. **Niente lettura delle dimensioni immagine** lato server. `Piantina.larghezza/altezza` salvate come placeholder; i marker usano coordinate **percentuali (0–100)**, indipendenti dai pixel reali. Il canvas web renderizza la planimetria alla dimensione naturale dell'immagine.

## Flusso a due fasi (sicurezza)

### Fase 1 — Upload + analisi (nessuna scrittura nel DB)
1. Admin trascina lo ZIP nella dropzone (pagina/modal in `/admin`).
2. Upload al server con **barra di avanzamento sui byte** (XHR `upload.onprogress`, ~550 MB).
3. Il server estrae lo ZIP in una **cartella temporanea**, ne legge la struttura e risponde con un **manifest**:
   - nome cantiere proposto (dal nome ZIP)
   - n. piani, n. punti, n. foto
   - elenco file **scartati** o **senza data valida** (per trasparenza)
4. Il temporaneo resta in attesa di conferma associato a un `jobId`.

### Fase 2 — Conferma + creazione (con avanzamento live)
1. Admin vede l'anteprima del manifest, compila **indirizzo**, conferma.
2. Mutation `confermaImportHolobuilder(jobId, nome, indirizzo)`:
   - `creaCantiere` (riusa la logica admin-only esistente, oppure crea via Prisma con check ruolo)
   - per ogni piano: copia planimetria in `/uploads` → crea `Piantina`
   - per ogni scena: crea `PuntoDiScatto` con x/y a griglia
   - per ogni foto: copia file in `/uploads` → crea `Foto360` con `timestamp`
   - emette avanzamento su PubSub `IMPORT_PROGRESS_${jobId}` (stesso pattern delle annotazioni real-time)
3. Web mostra avanzamento live via subscription `importProgress(jobId)` (_"punto 5/17 · foto 80/137"_).
4. A fine import: cleanup della cartella temporanea; esito con link al cantiere creato.

### Rollback
Se l'elaborazione fallisce in modo grave dopo aver creato il cantiere, il server **elimina il cantiere** creato (cascade delete → piantine, punti, foto) per non lasciare scarti. Gli errori per-foto non fatali (singolo file illeggibile) non bloccano: vengono raccolti e riportati nell'esito finale (continue-on-error). Vedi sezione **Gestione errori e reporting**.

## Gestione errori e reporting

Principio cardine: **un problema su un singolo file non interrompe mai l'import**. Gli errori sono classificati, raccolti e mostrati dalla UI; solo i problemi davvero bloccanti fermano tutto.

### Due livelli di severità

- **`error` (fatale)** → l'import non parte, o se già in corso fa **rollback** del cantiere. Casi:
  - ZIP corrotto / non apribile / Zip Slip rilevato
  - struttura completamente non riconosciuta (nessun piano valido)
  - errore irrecuperabile di disco/DB
  - `indirizzo` mancante in fase di conferma

- **`warning` (non bloccante)** → l'elemento viene gestito con una **azione di fallback** e l'import prosegue. Casi:
  - **`dataMancante`** — nome file non parsabile (es. *"nome file sbagliato"*) → foto importata con `timestamp = now()` (default), oppure saltata se l'admin sceglie così
  - **`fileIgnorato`** — file non-immagine / estensione non supportata dentro una cartella scena → saltato
  - **`pianoSenzaPlanimetria`** — cartella piano senza il corrispondente `(floor plan)` → piano saltato (i suoi punti non vengono creati)
  - **`planimetriaSenzaCartella`** — `(floor plan)` senza cartella piano → planimetria ignorata
  - **`scenaVuota`** — sottocartella scena senza immagini → punto creato comunque (vuoto) o saltato (default: saltato, segnalato)
  - **`fuoriStruttura`** — file/cartella che non rientra nello schema piano/scena → ignorato

### Modello dati del problema

Ogni problema è un record strutturato, uniforme tra anteprima ed esito:

```
ImportIssue {
  severita: "error" | "warning"
  categoria: "dataMancante" | "fileIgnorato" | "pianoSenzaPlanimetria"
           | "planimetriaSenzaCartella" | "scenaVuota" | "fuoriStruttura" | "scritturaFallita"
  percorso: String        # path del file/cartella dentro lo ZIP
  messaggio: String        # descrizione leggibile in italiano
  azione: String           # cosa è successo: "importata con data di oggi" | "saltata" | ...
}
```

### Dove emergono gli errori

- **Fase 1 (analisi)** — il manifest include `issues: [ImportIssue]` con TUTTI i problemi rilevabili a freddo (nomi, struttura, estensioni). L'admin li vede **prima** di scrivere nel DB e decide se procedere.
- **Fase 2 (creazione)** — problemi che emergono solo scrivendo (es. **`scritturaFallita`**: copia file o insert DB fallita per la singola foto) vengono raccolti senza bloccare; il contatore `erroriCount`/`avvisiCount` avanza live via subscription.
- **Esito finale** — `{ stato: "completato" | "completatoConAvvisi" | "fallito", creati: {piantine, punti, foto}, issues: [ImportIssue], cantiereId? }`.

### UI

- **Anteprima**: riga riassuntiva (es. *"✓ 137 foto · ⚠ 3 avvisi"*) + sezione espandibile con i problemi **raggruppati per categoria**, ciascuno con percorso e azione di fallback. Opzionale: toggle *"Salta le foto senza data"* (default OFF → importate con data di oggi).
- **Durante l'import**: la barra prosegue anche con errori per-item; contatore avvisi/errori visibile.
- **Esito**: riepilogo *"135 importate · 3 avvisi · 2 errori"* + lista copiabile dei problemi + link al cantiere. Solo warning ⇒ stato "completato con avvisi" (cantiere valido). Errore fatale ⇒ "fallito" con motivo e rollback già eseguito.

## Componenti

### Server (`apps/server`)
- **`POST /import/holobuilder`** — endpoint **admin-only** (verifica JWT + ruolo ADMIN; nota: `/upload` esistente non ha auth, questo invece sì perché crea entità). Multer dedicato che accetta `application/zip` e alza il limite dimensione (no cap 100MB/solo-immagini del `/upload`). Estrae in temp, ritorna `{ jobId, manifest }`.
- **Mutation `confermaImportHolobuilder(jobId: ID!, nome: String!, indirizzo: String!): Cantiere!`** — esegue la creazione dal temporaneo; admin-only; pubblica progresso.
- **Subscription `importProgress(jobId: ID!): ImportProgress!`** — `{ fase, correnti, totali, messaggio, avvisiCount, erroriCount, completato, errore }`.
- **`lib/holobuilderImport.ts`** — parser struttura ZIP + `parseExportDate()` (formato `gen. 03, 2025` e varianti italiane, gestione suffissi duplicati `(k)`) + generatore griglia x/y. Gestisce la cartella radice wrapper.
- **Dipendenza nuova:** `unzipper` (estrazione streaming, evita 550 MB in RAM). Niente `image-size`.

### Web (`apps/web`)
- **UI import in `/admin`** (modal o sotto-pagina): dropzone ZIP → barra upload → schermata anteprima manifest (con file scartati) → form indirizzo → barra progresso elaborazione (subscription) → esito con link al cantiere.
- Riusa: `.card`/`.btn-primary`/`.input-field`, pattern spinner, Apollo client con auth token già iniettato.
- Aggiunge: documenti gql `CONFERMA_IMPORT_HOLOBUILDER` (mutation) + `IMPORT_PROGRESS` (subscription); helper upload ZIP con progress via XHR (l'`uploadFile` esistente usa `fetch` senza progress).

## Parsing della data

Nuovo `parseExportDate(filename)` per il formato dell'export HoloBuilder italiano:
- `<scena> (mmm. GG, AAAA).jpeg` con mesi abbreviati IT (`gen feb mar apr mag giu lug ago set ott nov dic`)
- gestione suffisso duplicati `(k)` → ignorato ai fini della data
- se la data non è estraibile → file segnalato nel manifest come "senza data"; all'import si usa il default server `@default(now())` (comportamento retro-compatibile). _(L'export viene normalizzato a monte: vedi cartella `upload/`.)_

Distinto dal `parseDateFromFilename` esistente (`apps/web/src/lib/dateUtils.ts`), che gestisce solo il formato `GG-MM-AAAA_HHMM` e resta invariato.

## Cosa NON si tocca
- Endpoint `/upload`, mutation esistenti (`caricaPiantina`, `aggiungiPuntoDiScatto`, `uploadFoto360`), app mobile, schema Prisma (si usano i campi esistenti), `parseDateFromFilename` web.
- Tutto additivo, su branch dedicato.

## Rischi e mitigazioni
- **Dimensioni piantina placeholder** → verificare in implementazione che `PiantinaCanvas` renderizzi correttamente con coordinate % senza dimensioni reali (dall'esplorazione calcola già le % sul wrapper dell'immagine). Se un punto del codice dipende dagli interi salvati, valutare backfill lato web al primo render.
- **ZIP grande (550 MB)** → estrazione streaming con `unzipper`; cartella temp su disco, cleanup garantito (anche su errore/timeout job).
- **Import parziale** → flusso anteprima+conferma + rollback del cantiere su errore grave + report errori per-foto non fatali.
- **Job orfani** (utente abbandona dopo fase 1) → TTL/cleanup periodico dei temporanei non confermati.
- **Sicurezza estrazione** → protezione da Zip Slip (path traversal) validando i percorsi estratti dentro la temp dir.
