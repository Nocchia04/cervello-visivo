# Navigazione punti & foto sulla piantina — Analisi e bug

> Documento di reverse-engineering della logica di navigazione tra punti di scatto e foto 360°
> nell'app web. Identifica i bug riscontrati e propone fix mirati.

---

## 1. Architettura attuale

### Componenti coinvolti

```
┌────────────────────────────────────────────────────────────────────┐
│  /dashboard/cantieri/[id]/piantina/[piantinaId]/page.tsx          │
│  (e specchio readonly: /share/[token]/piantina/[piantinaId])      │
│                                                                    │
│   ┌──────────────────────────────────┐ ┌─────────────────────────┐│
│   │  <EmbeddedViewer360>             │ │ <PiantinaSidebarWidget> ││
│   │  oppure                          │ │                         ││
│   │  <SyncedViewer360 × 2> (compare) │ │  ┌──────────────────┐   ││
│   │                                  │ │  │ <PiantinaCanvas> │   ││
│   │  - texture Three.js              │ │  │   markers,       │   ││
│   │  - annotations overlay           │ │  │   pan/zoom       │   ││
│   │  - sphere render                 │ │  └──────────────────┘   ││
│   └──────────────────────────────────┘ │  + DateDropdown         ││
│                                        └─────────────────────────┘│
└────────────────────────────────────────────────────────────────────┘
```

### Single source of truth: URL search params

Tutto lo stato della navigazione è in **URL search params**.
Il widget sidebar scrive, la page legge:

| Param        | Significato                                |
|--------------|--------------------------------------------|
| `?punto=<id>` | Punto di scatto selezionato               |
| `?foto=<idx>` | Indice della foto del punto selezionato   |
| `?addP=1`     | Modalità "aggiungi punto" attiva          |
| `?edit=1`     | Modalità "modifica posizioni" attiva      |
| `?cmp=1`      | Compare mode attivo                       |
| `?cmpFoto=N`  | Indice foto destra (compare)              |
| `?lockL=1` / `?lockR=1` | Lock indipendenti dei due viewer |

### Apollo cache come source data

`GET_PIANTINA` viene chiamata da:
- La page piantina (per `selectedFotoSorted`)
- Il widget sidebar (per i marker)
- Apollo dedup la richiesta → singolo network call

---

## 2. Flusso di un click su un marker — atteso vs reale

### Sequenza attesa (fluida)

```
1. utente click su marker B sulla mini-mappa del widget
2. PuntoDiScattoMarker → onClick → PiantinaCanvas → onPuntoClick(B)
3. PiantinaSidebarWidget.handlePuntoClick(B):
   - smart-date-follow: cerca la foto del punto B con timestamp
     più vicino alla `currentFoto` del punto A
   - chiama updateParams({ punto: B, foto: <nextIdx> })
4. router.replace("?punto=B&foto=N", { scroll: false })
5. page rilegge searchParams → selectedPuntoId = B
6. useMemo ricomputa: selectedPunto = punto_B
7. useMemo ricomputa: selectedFotoSorted = sortFotoDesc(B.foto360)
8. EmbeddedViewer360 riceve nuove props: foto, currentIndex
9. currentFoto = foto[currentIndex] = nuova reference
10. useEffect [currentIndex, currentFoto, loadTexture] triggers
11. loadTexture(currentFoto.url) → THREE.TextureLoader carica
12. material.map = nuova texture → sphere mostra nuova vista
```

### Punti fragili nel flusso

#### A. useEffect dependency su `currentFoto` (oggetto)
In `EmbeddedViewer360.tsx` riga 215-218:

```ts
useEffect(() => {
  if (currentFoto) loadTexture(currentFoto.url);
}, [currentIndex, currentFoto, loadTexture]);
```

`currentFoto` è un **oggetto** ricavato da `foto[currentIndex]`. React confronta dependencies con `Object.is`. Se Apollo cache normalizza i nodi `Foto360` per id, una stessa foto può tornare con **stessa reference** in chiamate diverse. Se invece le ridiscende come oggetti nuovi (cache-and-network refetch), la reference cambia.

**Risultato**: il triggering è non deterministico. In particolari casi (es. punti che condividono qualche foto in cache già letta, o navigazione veloce), il useEffect può non riattivare il `loadTexture`.

**Più robusto**: dipendere da `currentFoto?.url` (primitiva string), oppure `currentFoto?.id`.

#### B. Init Three.js carica `foto[0]` con closure stale
In `EmbeddedViewer360.tsx` riga 244 (dentro useEffect mount-only `[]`):

```ts
if (foto[0]) loadTexture(foto[0].url);
```

`foto[0]` è catturato nella closure al mount. Se l'utente naviga in scenari particolari (es. pre-mount foto vuota, post-mount foto popolata), il primo render può caricare la texture sbagliata o nessuna.

**Mitigato**: il useEffect riga 215 di solito copre il caso. Ma su mount con `currentIndex=0` e `currentFoto` undefined → defined può accadere che il primo `loadTexture` non parta affatto.

#### C. Annotation pins non resettati su cambio punto (solo cambio currentIndex)
Riga 185-192:
```ts
useEffect(() => {
  setPendingNote(null);
  setExpandedId(null);
  setConfirmDeleteId(null);
  // ...
}, [currentIndex]);
```

Se l'utente naviga tra punti **mantenendo lo stesso `currentIndex`** (es. da punto A foto 0 → punto B foto 0), questo effect **non triggera**. Eventuali popup di annotation pin del punto A possono restare visibili.

#### D. Rotazione camera (`lonRef`, `latRef`) mantenuta tra punti
Quando si cambia punto, la camera mantiene angolo precedente. **Voluto** (esperienza fluida), ma se l'utente stava guardando in alto in A, in B inizia a guardare in alto — può essere disorientante in alcuni contesti. Non un bug, scelta UX da rivedere se necessario.

#### E. Smart-date-follow può portare a `nextFotoIdx` che NON cambia `selectedFotoIndex`
In `PiantinaSidebarWidget.tsx`:

```ts
const handlePuntoClick = (puntoId) => {
  // ... calcolo nextFotoIdx via timestamp matching
  updateParams({ punto: puntoId, foto: String(nextFotoIdx) });
};
```

Se `nextFotoIdx === selectedFotoIndex` (es. entrambi 0), il param `foto` non cambia letteralmente in URL. **Il param `punto` SI cambia** quindi React re-rende. Ma il useEffect del viewer che dipende SOLO da `currentIndex` non scatterebbe (la dipendenza `currentFoto` lo salva di solito, vedi A).

---

## 3. Bug riscontrato

**Sintomo**: utente clicca punto A, cambia scena (foto del punto A o pan/rotation), poi clicca punto B → la sfera 360° **rimane bloccata sulla foto del punto A** invece di passare alla foto del punto B.

**Causa probabile** (combinazione di fattori):
- **B** (init mount-only carica foto[0]) + **A** (useEffect deps fragili sull'oggetto `currentFoto`)
- In edge case dove Apollo restituisce la stessa reference foto cached, `currentFoto` non triggera l'effect → texture non si aggiorna.

---

## 4. Fix proposti (mirati e non invasivi)

### Fix #1 — Dependency robusta sul URL della texture (RACCOMANDATO)
File: `apps/web/src/components/foto360/EmbeddedViewer360.tsx`

```ts
// PRIMA
useEffect(() => {
  if (currentFoto) loadTexture(currentFoto.url);
}, [currentIndex, currentFoto, loadTexture]);

// DOPO
useEffect(() => {
  if (currentFoto?.url) loadTexture(currentFoto.url);
}, [currentFoto?.url, loadTexture]);
```

Dipendere da `currentFoto?.url` (primitiva string) è deterministico: cambia URL → ricarica. Risolve A.

### Fix #2 — Reset annotation popup quando cambia anche il punto
File: `apps/web/src/components/foto360/EmbeddedViewer360.tsx`

```ts
// PRIMA
useEffect(() => {
  setPendingNote(null);
  // ...
}, [currentIndex]);

// DOPO  
useEffect(() => {
  setPendingNote(null);
  setNoteText("");
  setExpandedId(null);
  setConfirmDeleteId(null);
  setEditingId(null);
  setEditText("");
}, [currentFotoId]);
```

Risolve C.

### Fix #3 — Init Three.js: non chiamare loadTexture mount-only, lascia farlo al useEffect dedicato
File: `apps/web/src/components/foto360/EmbeddedViewer360.tsx`

Rimuovere `if (foto[0]) loadTexture(foto[0].url);` dal useEffect mount-only.
Il useEffect riga 215 (Fix #1) basta — viene eseguito anche al mount perché `currentFoto?.url` cambia da `undefined` a un valore.

Risolve B.

### Fix #4 — `key` defensivo sul viewer in compare mode (già OK, verifica)
In compare mode si renderizzano DUE `<SyncedViewer360>`. Hanno già `ref` distinti (left/right) e props `url` diretto. Quando cambia foto, l'`url` prop cambia → il componente gestisce internamente. Lato URL params è già robusto. Niente da cambiare.

### Fix #5 (opzionale) — Reset rotazione camera quando cambia PUNTO (non foto)
Se vogliamo che cambiare punto resetti la vista al centro (mentre cambiare foto dello stesso punto mantiene rotazione):

```ts
useEffect(() => {
  // Quando cambia il puntoId, resetta la camera
  lonRef.current = 0;
  latRef.current = 0;
}, [puntoIdProp]);  // serve passare puntoId come prop
```

Decisione UX — per ora non lo applichiamo, ma il MD lo segnala come opzione.

---

## 5. Test manuale post-fix

1. Apri `/dashboard/cantieri/<id>/piantina/<id>`
2. Click punto A → la sfera mostra foto del punto A ✅
3. Pan/rotate dentro la sfera, cambia foto del punto A via dropdown date → la sfera cambia ✅
4. Click punto B → **la sfera deve passare alla foto del punto B** ✅ (era il bug)
5. Click punto C → idem ✅
6. Click di nuovo punto A (con foto 1, non 0) → sfera del punto A foto 1 ✅
7. Compare mode con due foto dello stesso punto → entrambi i viewer mostrano foto corrette ✅
8. URL sempre allineato a `?punto=<id>&foto=<idx>` ✅

---

## 6. Cose già funzionanti correttamente (verificate)

- Apollo cache dedup di `GET_PIANTINA` tra widget e page
- Smart-date-follow su cambio punto (cerca timestamp simile)
- Auto-select del punto con foto più recente all'apertura (sia widget che page)
- Compare mode con lock sinistro/destro indipendenti
- Pan + zoom della mappa nel widget
- Marker color-coded per data (same/before/after)
- Edit positions mode con drag-and-drop dei marker
- Add punto via click sulla mappa

---

## 7. File coinvolti

| File | Ruolo |
|------|-------|
| `apps/web/src/app/dashboard/cantieri/[id]/piantina/[piantinaId]/page.tsx` | Page principale, renderizza viewer + widget |
| `apps/web/src/app/share/[token]/piantina/[piantinaId]/page.tsx` | Specchio readonly |
| `apps/web/src/components/piantina/PiantinaSidebarWidget.tsx` | Widget mini-mappa, scrive URL params |
| `apps/web/src/components/piantina/PiantinaCanvas.tsx` | Mappa pan/zoom + marker |
| `apps/web/src/components/piantina/PuntoDiScattoMarker.tsx` | Singolo marker punto |
| `apps/web/src/components/piantina/DateDropdown.tsx` | Dropdown selettore foto/data |
| `apps/web/src/components/foto360/EmbeddedViewer360.tsx` | Viewer Three.js sfera 360 |
| `apps/web/src/components/foto360/SyncedViewer360.tsx` | Viewer per compare mode |
