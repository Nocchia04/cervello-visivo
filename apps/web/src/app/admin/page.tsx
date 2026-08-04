"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import Link from "next/link";
import { Users, Plus, X, Eye, EyeOff, Shield, Building2, Check, UserCheck, UserX, Trash2, KeyRound, FileArchive, Pencil, Search } from "lucide-react";
import { GET_UTENTI, GET_CANTIERI } from "@/graphql/queries";
import { CREA_OPERATORE, ASSEGNA_OPERATORE_CANTIERE, RIMUOVI_OPERATORE_CANTIERE, ELIMINA_OPERATORE, CAMBIA_PASSWORD_OPERATORE, AGGIORNA_OPERATORE } from "@/graphql/mutations";

interface CantiereAssegnato {
  id: string;
  cantiereId: string;
}

interface User {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  emailPersonale?: string | null;
  telefono?: string | null;
  role: string;
  createdAt: string;
  cantieri: CantiereAssegnato[];
}

interface Cantiere {
  id: string;
  nome: string;
  indirizzo: string;
  stato: string;
}

// ── Modal creazione operatore ─────────────────────────────────────────────────

function CreaOperatoreModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ email: "", password: "", nome: "", cognome: "", emailPersonale: "", telefono: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const [creaOperatore, { loading }] = useMutation(CREA_OPERATORE, {
    onCompleted: () => { onSuccess(); onClose(); },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    creaOperatore({ variables: form });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}>
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Nuovo operatore</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-2">Nome</label>
              <input type="text" className="input-field" value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Cognome</label>
              <input type="text" className="input-field" value={form.cognome}
                onChange={(e) => setForm({ ...form, cognome: e.target.value })} required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Email (login)</label>
            <input type="email" className="input-field" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-2">Email personale</label>
              <input type="email" className="input-field" value={form.emailPersonale}
                onChange={(e) => setForm({ ...form, emailPersonale: e.target.value })}
                placeholder="notifiche push" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Telefono</label>
              <input type="tel" className="input-field" value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                placeholder="+39 ..." />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Password temporanea</label>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} className="input-field pr-10"
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                required minLength={6} />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
          <div className="flex gap-3 mt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Annulla</button>
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading ? "Creazione..." : "Crea operatore"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal cambia password operatore ───────────────────────────────────────────

function CambiaPasswordModal({
  user,
  onClose,
  onSuccess,
}: {
  user: { id: string; nome: string; cognome: string; email: string };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const [cambiaPassword, { loading }] = useMutation(CAMBIA_PASSWORD_OPERATORE, {
    onCompleted: () => {
      onSuccess();
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("La password deve essere lunga almeno 8 caratteri.");
      return;
    }
    if (password !== confirm) {
      setError("Le due password non coincidono.");
      return;
    }
    cambiaPassword({ variables: { id: user.id, nuovaPassword: password } });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              <KeyRound className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold truncate">Modifica password</h2>
              <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                {user.nome} {user.cognome} · {user.email}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 -mt-1 -mr-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Nuova password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className="input-field pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Almeno 8 caratteri"
                required
                minLength={8}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 btn-ghost p-1"
                style={{ color: "var(--text-muted)" }}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Conferma password</label>
            <input
              type={showPassword ? "text" : "password"}
              className="input-field"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              placeholder="Ripeti la nuova password"
              required
              minLength={8}
            />
          </div>

          {error && (
            <p
              className="text-sm px-3 py-2 rounded-lg"
              style={{
                color: "var(--danger)",
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.2)",
              }}
            >
              {error}
            </p>
          )}

          <p
            className="text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            L'operatore dovrà usare questa nuova password al prossimo accesso. Comunicagliela in un canale sicuro.
          </p>

          <div className="flex gap-3 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
              disabled={loading}
            >
              Annulla
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={loading || !password || !confirm}
            >
              {loading ? "Aggiorno..." : "Aggiorna password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal modifica contatti operatore ─────────────────────────────────────────

function ModificaContattiModal({
  user,
  onClose,
  onSuccess,
}: {
  user: { id: string; nome: string; cognome: string; email: string; emailPersonale?: string | null; telefono?: string | null };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [emailPersonale, setEmailPersonale] = useState(user.emailPersonale ?? "");
  const [telefono, setTelefono] = useState(user.telefono ?? "");
  const [error, setError] = useState("");

  const [aggiorna, { loading }] = useMutation(AGGIORNA_OPERATORE, {
    onCompleted: () => { onSuccess(); onClose(); },
    onError: (e) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    aggiorna({ variables: { id: user.id, emailPersonale, telefono } });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--accent)", color: "#fff" }}>
              <Pencil className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold truncate">Modifica contatti</h2>
              <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                {user.nome} {user.cognome} · {user.email}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 -mt-1 -mr-1"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Email personale</label>
            <input type="email" className="input-field" value={emailPersonale}
              onChange={(e) => setEmailPersonale(e.target.value)} placeholder="per le notifiche push" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Telefono</label>
            <input type="tel" className="input-field" value={telefono}
              onChange={(e) => setTelefono(e.target.value)} placeholder="+39 ..." />
          </div>
          {error && (
            <p className="text-sm px-3 py-2 rounded-lg" style={{ color: "var(--danger)", background: "rgba(239,68,68,0.1)" }}>
              {error}
            </p>
          )}
          <div className="flex gap-3 mt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1" disabled={loading}>Annulla</button>
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading ? "Salvo..." : "Salva contatti"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Riga cantiere nel pannello assegnazioni ───────────────────────────────────

function CantiereRow({
  cantiere,
  assegnato,
  userId,
  onAssegna,
  onRimuovi,
  loading,
}: {
  cantiere: Cantiere;
  assegnato: boolean;
  userId: string;
  onAssegna: () => void;
  onRimuovi: () => void;
  loading: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between p-3 rounded-xl transition-colors"
      style={{
        background: assegnato ? "rgba(34,197,94,0.07)" : "var(--surface-hover)",
        border: assegnato ? "1px solid rgba(34,197,94,0.25)" : "1px solid transparent",
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: assegnato ? "rgba(34,197,94,0.15)" : "var(--border)" }}
        >
          {assegnato
            ? <Check className="w-3.5 h-3.5" style={{ color: "#22c55e" }} />
            : <Building2 className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
          }
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{cantiere.nome}</p>
          <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{cantiere.indirizzo}</p>
        </div>
      </div>

      <div className="flex-shrink-0 ml-3">
        {assegnato ? (
          <button
            onClick={onRimuovi}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: "rgba(239,68,68,0.08)",
              color: "var(--danger)",
              border: "1px solid rgba(239,68,68,0.2)",
            }}
          >
            <UserX className="w-3.5 h-3.5" />
            Revoca
          </button>
        ) : (
          <button
            onClick={onAssegna}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: "rgba(99,102,241,0.08)",
              color: "var(--accent)",
              border: "1px solid rgba(99,102,241,0.2)",
            }}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Assegna
          </button>
        )}
      </div>
    </div>
  );
}

// ── Pagina principale ─────────────────────────────────────────────────────────

export default function AdminPage() {
  const [showModal, setShowModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const [passwordUserId, setPasswordUserId] = useState<string | null>(null);
  const [contattiUserId, setContattiUserId] = useState<string | null>(null);
  const [operatoreQuery, setOperatoreQuery] = useState("");

  const { data: utentiData, loading: utentiLoading, refetch: refetchUtenti } = useQuery(GET_UTENTI);
  const { data: cantieriData } = useQuery(GET_CANTIERI, { variables: { includiArchiviati: false } });

  const [assegna] = useMutation(ASSEGNA_OPERATORE_CANTIERE, {
    onCompleted: () => { refetchUtenti(); setMutatingId(null); },
    onError: () => setMutatingId(null),
  });
  const [rimuovi] = useMutation(RIMUOVI_OPERATORE_CANTIERE, {
    onCompleted: () => { refetchUtenti(); setMutatingId(null); },
    onError: () => setMutatingId(null),
  });
  const [eliminaOp, { loading: eliminaLoading }] = useMutation(ELIMINA_OPERATORE, {
    onCompleted: () => { refetchUtenti(); setSelectedUserId(null); setConfirmDeleteUserId(null); },
    onError: () => setConfirmDeleteUserId(null),
  });

  const utenti: User[] = utentiData?.utenti ?? [];
  const cantieri: Cantiere[] = cantieriData?.cantieri ?? [];
  const operatori = utenti.filter((u) => u.role === "CAPO_CANTIERE");

  // Ricerca operatori su tutti i campi (nome, cognome, email, email personale, telefono).
  const oq = operatoreQuery.trim().toLowerCase();
  const operatoriFiltrati = oq
    ? operatori.filter((u) =>
        [u.nome, u.cognome, u.email, u.emailPersonale, u.telefono]
          .some((v) => v && String(v).toLowerCase().includes(oq))
      )
    : operatori;

  const selectedUser = operatori.find((u) => u.id === selectedUserId) ?? null;
  const assignedIds = new Set(selectedUser?.cantieri.map((c) => c.cantiereId) ?? []);

  const handleAssegna = (cantiereId: string) => {
    if (!selectedUserId) return;
    setMutatingId(cantiereId);
    assegna({ variables: { cantiereId, userId: selectedUserId } });
  };

  const handleRimuovi = (cantiereId: string) => {
    if (!selectedUserId) return;
    setMutatingId(cantiereId);
    rimuovi({ variables: { cantiereId, userId: selectedUserId } });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5" style={{ color: "var(--accent)" }} />
            <h1 className="text-2xl font-bold">Pannello Admin</h1>
          </div>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Gestisci operatori e assegnazioni cantieri
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/importa" className="btn-secondary">
            <FileArchive className="w-4 h-4" />
            Importa da HoloBuilder
          </Link>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Nuovo operatore
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Lista operatori ── */}
        <div className="lg:col-span-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2"
            style={{ color: "var(--text-muted)" }}>
            <Users className="w-3.5 h-3.5" />
            Operatori ({operatori.length})
          </h2>

          {/* Ricerca operatori */}
          {operatori.length > 0 && (
            <div className="relative mb-3">
              <Search
                className="w-4 h-4 absolute pointer-events-none"
                style={{ left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
              />
              <input
                type="text"
                value={operatoreQuery}
                onChange={(e) => setOperatoreQuery(e.target.value)}
                placeholder="Cerca per nome, email, telefono..."
                aria-label="Cerca operatore"
                className="input-field w-full"
                style={{ paddingLeft: 36, paddingRight: operatoreQuery ? 36 : undefined }}
              />
              {operatoreQuery && (
                <button
                  onClick={() => setOperatoreQuery("")}
                  className="absolute"
                  style={{ right: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
                  aria-label="Cancella ricerca"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {utentiLoading ? (
              <div className="card flex justify-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2" style={{ borderColor: "var(--accent)" }} />
              </div>
            ) : operatori.length === 0 ? (
              <div className="card text-center py-10">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nessun operatore</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>
                  Crea il primo operatore con il pulsante in alto
                </p>
              </div>
            ) : operatoriFiltrati.length === 0 ? (
              <div className="card text-center py-10">
                <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nessun operatore trovato</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>
                  Nessun risultato per “{operatoreQuery}”
                </p>
              </div>
            ) : (
              operatoriFiltrati.map((user) => {
                const isSelected = selectedUserId === user.id;
                const count = user.cantieri.length;
                return (
                  <button
                    key={user.id}
                    onClick={() => setSelectedUserId(isSelected ? null : user.id)}
                    className="card text-left transition-all duration-150 p-4"
                    style={{
                      border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                      boxShadow: isSelected ? "0 0 0 1px var(--accent)" : undefined,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                        style={{ background: isSelected ? "var(--accent)" : "var(--accent-hover)" }}
                      >
                        {user.nome[0].toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{user.nome} {user.cognome}</p>
                        <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{user.email}</p>
                      </div>
                      {/* Badge cantieri assegnati */}
                      <div
                        className="flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{
                          background: count > 0 ? "rgba(34,197,94,0.12)" : "var(--surface-hover)",
                          color: count > 0 ? "#16a34a" : "var(--text-subtle)",
                        }}
                      >
                        {count} {count === 1 ? "cantiere" : "cantieri"}
                      </div>
                    </div>

                    {/* Chips cantieri assegnati */}
                    {count > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {user.cantieri.slice(0, 3).map((cu) => {
                          const c = cantieri.find((x) => x.id === cu.cantiereId);
                          return c ? (
                            <span
                              key={cu.id}
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: "var(--surface-hover)", color: "var(--text-muted)" }}
                            >
                              {c.nome}
                            </span>
                          ) : null;
                        })}
                        {count > 3 && (
                          <span className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: "var(--surface-hover)", color: "var(--text-muted)" }}>
                            +{count - 3} altri
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Pannello assegnazioni ── */}
        <div className="lg:col-span-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2"
            style={{ color: "var(--text-muted)" }}>
            <Building2 className="w-3.5 h-3.5" />
            Assegnazioni cantieri
            {selectedUser && (
              <span className="normal-case tracking-normal font-normal ml-1">
                — <span style={{ color: "var(--text)" }}>{selectedUser.nome} {selectedUser.cognome}</span>
              </span>
            )}
          </h2>

          {!selectedUser ? (
            <div className="card flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{ background: "var(--surface-hover)" }}>
                <Users className="w-7 h-7 opacity-30" />
              </div>
              <p className="font-medium">Seleziona un operatore</p>
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                Clicca su un operatore a sinistra per gestire i cantieri assegnati
              </p>
            </div>
          ) : (
            <div className="card">
              {/* Riepilogo operatore */}
              <div className="flex items-center gap-3 pb-4 mb-4"
                style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                  style={{ background: "var(--accent)" }}>
                  {selectedUser.nome[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold">{selectedUser.nome} {selectedUser.cognome}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{selectedUser.email}</p>
                  {(selectedUser.emailPersonale || selectedUser.telefono) && (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {selectedUser.emailPersonale && <>✉ {selectedUser.emailPersonale}</>}
                      {selectedUser.emailPersonale && selectedUser.telefono && " · "}
                      {selectedUser.telefono && <>☎ {selectedUser.telefono}</>}
                    </p>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-2xl font-bold" style={{ color: assignedIds.size > 0 ? "#16a34a" : "var(--text-muted)" }}>
                      {assignedIds.size}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {assignedIds.size === 1 ? "cantiere" : "cantieri"} assegnati
                    </p>
                  </div>
                  {confirmDeleteUserId === selectedUser.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => eliminaOp({ variables: { id: selectedUser.id } })}
                        disabled={eliminaLoading}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg"
                        style={{ background: "var(--danger)", color: "#fff" }}
                      >
                        {eliminaLoading ? "..." : "Conferma"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteUserId(null)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg btn-ghost"
                      >
                        Annulla
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setContattiUserId(selectedUser.id)}
                        className="btn-ghost p-2"
                        title="Modifica contatti operatore"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setPasswordUserId(selectedUser.id)}
                        className="btn-ghost p-2"
                        title="Modifica password operatore"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteUserId(selectedUser.id)}
                        className="btn-ghost p-2"
                        title="Elimina operatore"
                        style={{ color: "var(--danger)" }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Lista cantieri */}
              {cantieri.length === 0 ? (
                <div className="text-center py-8">
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nessun cantiere attivo</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {/* Prima i cantieri assegnati */}
                  {cantieri
                    .slice()
                    .sort((a, b) => {
                      const aA = assignedIds.has(a.id);
                      const bA = assignedIds.has(b.id);
                      if (aA && !bA) return -1;
                      if (!aA && bA) return 1;
                      return a.nome.localeCompare(b.nome);
                    })
                    .map((cantiere) => (
                      <CantiereRow
                        key={cantiere.id}
                        cantiere={cantiere}
                        assegnato={assignedIds.has(cantiere.id)}
                        userId={selectedUserId!}
                        onAssegna={() => handleAssegna(cantiere.id)}
                        onRimuovi={() => handleRimuovi(cantiere.id)}
                        loading={mutatingId === cantiere.id}
                      />
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <CreaOperatoreModal
          onClose={() => setShowModal(false)}
          onSuccess={() => refetchUtenti()}
        />
      )}

      {passwordUserId && (() => {
        const target = operatori.find((u) => u.id === passwordUserId);
        if (!target) return null;
        return (
          <CambiaPasswordModal
            user={target}
            onClose={() => setPasswordUserId(null)}
            onSuccess={() => refetchUtenti()}
          />
        );
      })()}

      {contattiUserId && (() => {
        const target = operatori.find((u) => u.id === contattiUserId);
        if (!target) return null;
        return (
          <ModificaContattiModal
            user={target}
            onClose={() => setContattiUserId(null)}
            onSuccess={() => refetchUtenti()}
          />
        );
      })()}
    </div>
  );
}
