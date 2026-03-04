"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { Users, Plus, X, Eye, EyeOff, Shield, Building2, Check, UserCheck, UserX } from "lucide-react";
import { GET_UTENTI, GET_CANTIERI } from "@/graphql/queries";
import { CREA_OPERATORE, ASSEGNA_OPERATORE_CANTIERE, RIMUOVI_OPERATORE_CANTIERE } from "@/graphql/mutations";

interface CantiereAssegnato {
  id: string;
  cantiereId: string;
}

interface User {
  id: string;
  email: string;
  nome: string;
  cognome: string;
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
  const [form, setForm] = useState({ email: "", password: "", nome: "", cognome: "" });
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
            <label className="block text-sm font-medium mb-2">Email</label>
            <input type="email" className="input-field" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} required />
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
  const [mutatingId, setMutatingId] = useState<string | null>(null); // cantiereId in mutation

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

  const utenti: User[] = utentiData?.utenti ?? [];
  const cantieri: Cantiere[] = cantieriData?.cantieri ?? [];
  const operatori = utenti.filter((u) => u.role === "CAPO_CANTIERE");

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
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Nuovo operatore
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Lista operatori ── */}
        <div className="lg:col-span-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2"
            style={{ color: "var(--text-muted)" }}>
            <Users className="w-3.5 h-3.5" />
            Operatori ({operatori.length})
          </h2>

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
            ) : (
              operatori.map((user) => {
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
                </div>
                <div className="ml-auto text-right">
                  <p className="text-2xl font-bold" style={{ color: assignedIds.size > 0 ? "#16a34a" : "var(--text-muted)" }}>
                    {assignedIds.size}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {assignedIds.size === 1 ? "cantiere" : "cantieri"} assegnati
                  </p>
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
    </div>
  );
}
