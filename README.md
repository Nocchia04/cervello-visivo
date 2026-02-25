# Cervello Visivo - NRG Gold Ecosystem

Piattaforma di documentazione visiva per cantieri con foto 360°. Permette di caricare piantine multi-livello, posizionare punti di scatto e associare foto panoramiche con annotazioni.

## Architettura

Monorepo con npm workspaces:

```
cervello-visivo/
├── apps/
│   ├── web/          # Next.js 14 (App Router) - Dashboard web
│   ├── mobile/       # React Native + Expo - App mobile
│   └── server/       # Node.js + Express + Apollo GraphQL - API
├── packages/
│   ├── db/           # Prisma ORM - Schema e client database
│   └── shared/       # TypeScript types e utilities condivise
```

### Stack Tecnologico

| Layer      | Tecnologia                        |
|------------|-----------------------------------|
| Frontend   | Next.js 14, React 18              |
| Mobile     | React Native, Expo                 |
| API        | Express, Apollo Server, GraphQL    |
| Database   | PostgreSQL, Prisma ORM             |
| Auth       | JWT, bcrypt                        |

### Modelli Dati

- **User** - Utenti con ruoli (Admin, Capo Cantiere)
- **Cantiere** - Siti di costruzione con stato attivo/archiviato
- **Piantina** - Piante dei livelli di un cantiere
- **PuntoDiScatto** - Coordinate (x, y) sulla piantina per le foto
- **Foto360** - Foto panoramiche equirettangolari con metadati
- **Annotazione** - Note testuali posizionate sulle foto 360

## Setup

### Prerequisiti

- Node.js >= 18
- PostgreSQL
- npm >= 9

### Installazione

```bash
# 1. Clona il repository
git clone <repo-url>
cd cervello-visivo

# 2. Copia e configura le variabili d'ambiente
cp .env.example .env
# Modifica .env con le credenziali del tuo database

# 3. Installa le dipendenze
npm install

# 4. Genera il client Prisma e applica lo schema
npm run db:generate
npm run db:push
```

### Avvio in sviluppo

```bash
# Avvia il server GraphQL (porta 4000)
npm run dev:server

# Avvia la web app Next.js (porta 3000)
npm run dev:web

# Avvia l'app mobile Expo
npm run dev:mobile

# Apri Prisma Studio per gestire i dati
npm run db:studio
```

## Struttura Workspaces

| Workspace              | Nome pacchetto           | Descrizione                    |
|------------------------|--------------------------|--------------------------------|
| `apps/web`             | @cervello-visivo/web     | Dashboard web Next.js          |
| `apps/mobile`          | @cervello-visivo/mobile  | App mobile React Native        |
| `apps/server`          | @cervello-visivo/server  | API GraphQL                    |
| `packages/db`          | @cervello-visivo/db      | Schema Prisma e client DB      |
| `packages/shared`      | @cervello-visivo/shared  | Types TypeScript condivisi     |
