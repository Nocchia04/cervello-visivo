// ─── Enums ───────────────────────────────────────────────

export enum UserRole {
  ADMIN = "ADMIN",
  CAPO_CANTIERE = "CAPO_CANTIERE",
}

export enum StatoCantiere {
  ATTIVO = "ATTIVO",
  ARCHIVIATO = "ARCHIVIATO",
}

// ─── Base Interfaces ─────────────────────────────────────

export interface User {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface Cantiere {
  id: string;
  nome: string;
  indirizzo: string;
  stato: StatoCantiere;
  createdAt: Date;
  updatedAt: Date;
}

export interface CantiereUser {
  id: string;
  cantiereId: string;
  userId: string;
  createdAt: Date;
}

export interface Piantina {
  id: string;
  cantiereId: string;
  nome: string;
  livello: number;
  fileUrl: string;
  larghezza: number;
  altezza: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PuntoDiScatto {
  id: string;
  piantinaId: string;
  nome: string;
  x: number;
  y: number;
  createdAt: Date;
}

export interface Foto360 {
  id: string;
  puntoDiScattoId: string;
  url: string;
  thumbnailUrl: string | null;
  timestamp: Date;
  metadata: Record<string, unknown> | null;
  uploadedById: string;
  createdAt: Date;
}

export interface Annotazione {
  id: string;
  foto360Id: string;
  testo: string;
  x: number;
  y: number;
  autoreId: string;
  createdAt: Date;
}

// ─── Input Types (per creazione/aggiornamento) ───────────

export interface CreateUserInput {
  email: string;
  password: string;
  nome: string;
  cognome: string;
  role?: UserRole;
}

export interface CreateCantiereInput {
  nome: string;
  indirizzo: string;
}

export interface UpdateCantiereInput {
  nome?: string;
  indirizzo?: string;
  stato?: StatoCantiere;
}

export interface CreatePiantinaInput {
  cantiereId: string;
  nome: string;
  livello: number;
  fileUrl: string;
  larghezza: number;
  altezza: number;
}

export interface CreatePuntoDiScattoInput {
  piantinaId: string;
  nome: string;
  x: number;
  y: number;
}

export interface CreateFoto360Input {
  puntoDiScattoId: string;
  url: string;
  thumbnailUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateAnnotazioneInput {
  foto360Id: string;
  testo: string;
  x: number;
  y: number;
}

// ─── Relational Types (con entità collegate) ─────────────

export interface CantiereWithPiantine extends Cantiere {
  piantine: Piantina[];
}

export interface PiantinaWithPunti extends Piantina {
  puntiDiScatto: PuntoDiScatto[];
}

export interface PuntoDiScattoWithFoto extends PuntoDiScatto {
  foto360: Foto360[];
}

export interface Foto360WithAnnotazioni extends Foto360 {
  annotazioni: Annotazione[];
  uploadedBy: User;
}

// ─── Auth Types ──────────────────────────────────────────

export interface AuthPayload {
  token: string;
  user: User;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}
