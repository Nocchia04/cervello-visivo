# Cervello Visivo — Definition of Done Report

**Progetto:** NRG Gold Ecosystem — Piattaforma documentazione visiva cantieri con foto 360
**Data:** 2026-02-23
**Versione:** 0.1.0

---

## Checklist Funzionale

- [x] **Split View:** scorrimento sincronizzato bidirezionale tra due pannelli Viewer360
- [x] **Annotazioni real-time:** Web → Mobile via GraphQL Subscription (`NUOVA_ANNOTAZIONE_{foto360Id}`)
- [x] **Pipeline Camera→App→Cloud:** Ricoh OSC → Expo FileSystem → UploadQueue → GraphQL Mutation
- [x] **Stato Cantiere:** cantieri ARCHIVIATI invisibili ai CAPO_CANTIERE (forzato nel resolver)
- [x] **Offline Queue:** upload differito con retry (max 3 tentativi), network-aware
- [x] **Time Travel:** slider cronologico con navigazione prev/next su ogni punto di scatto
- [x] **Drag & Drop piantine:** punti di scatto riposizionabili su canvas (`@dnd-kit/core`)
- [x] **JWT Authentication:** ruoli ADMIN vs CAPO_CANTIERE con autorizzazione granulare

---

## Test Coverage Summary

### Server (`apps/server/__tests__/`)

#### `resolvers.test.ts` — 13 test cases

| # | Test Case | Area |
|---|-----------|------|
| 1 | CAPO_CANTIERE riceve solo ATTIVI anche con `includiArchiviati:true` | Cantiere Query |
| 2 | ADMIN riceve ATTIVI + ARCHIVIATI con `includiArchiviati:true` | Cantiere Query |
| 3 | ADMIN senza `includiArchiviati` riceve solo ATTIVI | Cantiere Query |
| 4 | Utente non autenticato → `UNAUTHENTICATED` | Cantiere Query |
| 5 | ADMIN può archiviare un cantiere | archiviaCantiere |
| 6 | CAPO_CANTIERE non può archiviare → `FORBIDDEN` | archiviaCantiere |
| 7 | Solo ADMIN può creare un cantiere | creaCantiere |
| 8 | CAPO_CANTIERE non può creare → `FORBIDDEN` | creaCantiere |
| 9 | Risolve piantine associate al cantiere | Cantiere.piantine |
| 10 | `pubsub.publish` chiamato con `NUOVA_ANNOTAZIONE_{foto360Id}` | creaAnnotazione |
| 11 | `annotazione.create` con parametri corretti e include autore | creaAnnotazione |
| 12 | Foto360 non trovata → `BAD_USER_INPUT` | creaAnnotazione |
| 13 | `asyncIterableIterator` ritorna stream con canale corretto | Subscription |

#### `auth.test.ts` — 10 test cases

| # | Test Case | Area |
|---|-----------|------|
| 1 | `signToken` + `verifyToken` round-trip | JWT |
| 2 | Token contiene claim JWT standard (iat, exp) | JWT |
| 3 | Token ha scadenza di 7 giorni | JWT |
| 4 | Bearer token estratto dall'header Authorization | extractToken |
| 5 | Header assente → `null` | extractToken |
| 6 | Schema non Bearer → `null` | extractToken |
| 7 | Token mancante dopo Bearer → falsy | extractToken |
| 8 | Token valido → payload corretto | getUserFromToken |
| 9 | Token `null` → `null` | getUserFromToken |
| 10 | Token scaduto → `null` | getUserFromToken |

### Web (`apps/web/__tests__/`)

#### `SplitView.test.tsx` — 6 test cases

| # | Test Case | Area |
|---|-----------|------|
| 1 | Renderizza due pannelli Viewer360 con foto diverse | Render |
| 2 | Scroll su pannello sinistro → aggiorna pannello destro | **Sync (DoD)** |
| 3 | Scroll su pannello destro → aggiorna pannello sinistro | **Sync (DoD)** |
| 4 | Disabilita sync → scroll indipendente | Toggle Sync |
| 5 | Messaggio se meno di 2 foto | Edge Case |
| 6 | Selettori data mostrano tutte le foto | UI |

#### `AnnotazionePanel.test.tsx` — 8 test cases

| # | Test Case | Area |
|---|-----------|------|
| 1 | Mostra annotazioni dalla query | Render |
| 2 | Conteggio corretto (plurale) | UI |
| 3 | Singolare con 1 elemento | UI |
| 4 | `useSubscription` registra `onData` callback | **Real-time (DoD)** |
| 5 | Nuova annotazione via subscription → aggiorna cache Apollo | **Real-time (DoD)** |
| 6 | Annotazione duplicata → NON aggiunta | Deduplica |
| 7 | Loading spinner durante caricamento | UI |
| 8 | "Nessuna annotazione" con lista vuota | Empty State |

#### `TimeTravelSlider.test.tsx` — 10 test cases

| # | Test Case | Area |
|---|-----------|------|
| 1 | Render con 5 foto mostrando indice corretto | Render |
| 2 | Cambio slider → `onIndexChange` con indice corretto | Slider |
| 3 | Next → incrementa indice | Navigation |
| 4 | Prev → decrementa indice | Navigation |
| 5 | Prev disabilitato a indice 0 | Boundary |
| 6 | Next disabilitato all'ultimo indice | Boundary |
| 7 | Prev clampato a 0 | Boundary |
| 8 | Next clampato all'ultimo | Boundary |
| 9 | Thumbnail visibile quando disponibile | Media |
| 10 | Nessuna foto → messaggio vuoto | Empty State |

### Mobile (`apps/mobile/__tests__/`)

#### `RicohClient.test.ts` — 9 test cases

| # | Test Case | Area |
|---|-----------|------|
| 1 | `getInfo`: GET /osc/info + parsing risposta | Camera Info |
| 2 | `getInfo`: errore HTTP → throw | Error |
| 3 | `takePicture`: POST con `camera.takePicture` | **Pipeline (DoD)** |
| 4 | `takePicture`: ritorna fileUrl se done immediato | Capture |
| 5 | `takePicture`: polling fino a stato "done" | **Pipeline (DoD)** |
| 6 | `takePicture`: errore dal comando → throw | Error |
| 7 | `downloadFile`: salva file con expo-file-system | **Pipeline (DoD)** |
| 8 | `downloadFile`: crea directory se non esiste | Filesystem |
| 9 | `downloadFile`: download fallito → throw | Error |

#### `UploadQueue.test.ts` — 10 test cases

| # | Test Case | Area |
|---|-----------|------|
| 1 | `addToQueue`: item salvato in AsyncStorage | **Offline (DoD)** |
| 2 | `addToQueue`: se online, processamento immediato | Online |
| 3 | `processQueue`: item processato e rimosso se successo | **Pipeline (DoD)** |
| 4 | `processQueue`: retry su errore (incrementa retryCount) | **Retry (DoD)** |
| 5 | `processQueue`: dopo max retry → status "failed" | **Retry (DoD)** |
| 6 | `processQueue`: offline → item NON processato | **Offline (DoD)** |
| 7 | `processQueue`: GraphQL mutation con variabili corrette | Integration |
| 8 | `getPendingCount`: conta solo non-permanently-failed | Count |
| 9 | `clearCompleted`: rimuove item permanently failed | Cleanup |
| 10 | `retryFailed`: riporta a pending item sotto max retry | Retry |

---

## Totale Test Cases: 56

| Modulo | File | Test Cases |
|--------|------|:----------:|
| Server | `resolvers.test.ts` | 13 |
| Server | `auth.test.ts` | 10 |
| Web | `SplitView.test.tsx` | 6 |
| Web | `AnnotazionePanel.test.tsx` | 8 |
| Web | `TimeTravelSlider.test.tsx` | 10 |
| Mobile | `RicohClient.test.ts` | 9 |
| Mobile | `UploadQueue.test.ts` | 10 |
| **Totale** | | **56** |

---

## Copertura DoD Critica

| Requisito DoD | Coperto da | Status |
|---------------|------------|:------:|
| Split View sync bidirezionale | `SplitView.test.tsx` #2, #3, #4 | PASS |
| Annotazioni real-time (subscription) | `AnnotazionePanel.test.tsx` #4, #5 + `resolvers.test.ts` #10, #13 | PASS |
| Pipeline Camera→App→Cloud | `RicohClient.test.ts` #3-7 + `UploadQueue.test.ts` #3, #7 | PASS |
| Stato Cantiere (archiviati) | `resolvers.test.ts` #1, #2, #5, #6 | PASS |
| Offline Queue con retry | `UploadQueue.test.ts` #1, #4, #5, #6 | PASS |

---

## Rischi e Note Tecniche

### Dipendenze Critiche

| Dipendenza | Versione | Rischio |
|------------|----------|---------|
| `@prisma/client` | ^5.22 | Aggiornamenti major potrebbero cambiare API |
| `graphql-subscriptions` PubSub | In-memory | Non adatto a multi-instance in produzione (usare Redis PubSub) |
| `expo-file-system` | Expo SDK | Vincolato all'ecosistema Expo per il mobile |
| `expo-network` | Expo SDK | Network detection dipende da API native |
| `jsonwebtoken` | latest | Secret deve essere configurato via env in produzione |

### Workaround Noti

1. **PubSub in-memory:** L'attuale implementazione usa `graphql-subscriptions` PubSub che non supporta il multi-server deployment. Per produzione, sostituire con `graphql-redis-subscriptions` o equivalente.

2. **Upload Pipeline (localUri):** Attualmente l'`UploadQueue` passa il `localUri` direttamente alla mutation GraphQL. In produzione, il flusso deve essere: localUri → upload a S3/GCS → cloud URL → mutation.

3. **Camera IP fissa:** Il `RicohClient` usa `192.168.1.1` come IP della camera (standard Ricoh Theta WiFi AP). In ambienti con rete diversa, l'IP potrebbe variare.

4. **JWT Secret:** Il fallback `"cervello-visivo-dev-secret"` è solo per sviluppo. In produzione, `JWT_SECRET` deve essere una stringa criptograficamente sicura settata via environment variable.

5. **File Upload Limit:** Il limite di 100MB per file potrebbe non essere sufficiente per foto 360 ad alta risoluzione. Considerare upload chunked per file > 50MB.

### Note di Architettura

- **Monorepo npm workspaces:** Il progetto è organizzato come monorepo con `apps/` (server, web, mobile) e `packages/` (db, shared).
- **Database:** PostgreSQL con Prisma ORM. Schema con 7 modelli relazionali.
- **Auth:** JWT stateless con 2 ruoli (ADMIN, CAPO_CANTIERE). Token valido 7 giorni.
- **Real-time:** WebSocket via `graphql-ws` per subscription (Apollo Server + Apollo Client).
- **Mobile Camera:** OSC Protocol 2.0 (Ricoh Theta SC2) con polling per comandi asincroni.

---

## Setup & Avvio

### Prerequisiti

- Node.js >= 18.0.0
- PostgreSQL (locale o Docker)
- Expo CLI (`npx expo`)
- Ricoh Theta SC2 (per funzionalità camera mobile)

### 1. Installazione

```bash
# Clone e install
cd HoloBuilder-Clone
npm install
```

### 2. Database

```bash
# Crea file .env con DATABASE_URL
echo 'DATABASE_URL="postgresql://user:password@localhost:5432/cervello_visivo"' > apps/server/.env

# Genera client Prisma
npm run db:generate

# Applica migrazioni
npm run db:migrate

# (Opzionale) Apri Prisma Studio
npm run db:studio
```

### 3. Variabili d'Ambiente

**Server** (`apps/server/.env`):
```env
DATABASE_URL="postgresql://user:password@localhost:5432/cervello_visivo"
JWT_SECRET="your-secure-secret-here"
PORT=4000
CORS_ORIGIN="http://localhost:3000"
```

### 4. Avvio Development

```bash
# Terminal 1: Server GraphQL
npm run dev:server

# Terminal 2: Web Dashboard
npm run dev:web

# Terminal 3: Mobile App
npm run dev:mobile
```

### 5. Esecuzione Test

```bash
# Server tests
cd apps/server && npx jest

# Web tests
cd apps/web && npx jest

# Mobile tests
cd apps/mobile && npx jest
```

### URL di Sviluppo

| Servizio | URL |
|----------|-----|
| GraphQL Playground | http://localhost:4000/graphql |
| WebSocket Subscriptions | ws://localhost:4000/graphql |
| Web Dashboard | http://localhost:3000 |
| Mobile (Expo) | exp://localhost:8081 |

---

*Report generato automaticamente dal QA Engineer — Cervello Visivo v0.1.0*
