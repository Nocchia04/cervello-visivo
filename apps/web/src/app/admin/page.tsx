"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { Users, Plus, X, Eye, EyeOff, Shield, Building2 } from "lucide-react";
import { GET_UTENTI, GET_CANTIERI } from "@/graphql/queries";
import { CREA_OPERATORE, ASSEGNA_OPERATORE_CANTIERE, RIMUOVI_OPERATORE_CANTIERE } from "@/graphql/mutations";

interface User {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  role: string;
  createdAt: string;
}

interface Cantiere {
  id: string;
  nome: string;
  stato: string;
  utenti?: { userId: string }[];
}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Nuovo operatore</h2>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-2">Nome</label>
              <input
                type="text"
                className="input-field"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Cognome</label>
              <input
                type="text"
                className="input-field"
                value={form.cognome}
                onChange={(e) => setForm({ ...form, cognome: e.target.value })}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <input
              type="email"
              className="input-field"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Password temporanea</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className="input-field pr-10"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--text-muted)" }}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
          )}

          <div className="flex gap-3 mt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Annulla
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading ? "Creazione..." : "Crea operatore"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [showModal, setShowModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  const { data: utentiData, loading: utentiLoading, refetch: refetchUtenti } = useQuery(GET_UTENTI);
  const { data: cantieriData } = useQuery(GET_CANTIERI, { variables: { includiArchiviati: false } });

  const [assegna] = useMutation(ASSEGNA_OPERATORE_CANTIERE, { onCompleted: () => refetchUtenti() });
  const [rimuovi] = useMutation(RIMUOVI_OPERATORE_CANTIERE, { onCompleted: () => refetchUtenti() });

  const utenti: User[] = utentiData?.utenti ?? [];
  const cantieri: Cantiere[] = cantieriData?.cantieri ?? [];
  const operatori = utenti.filter((u) => u.role === "CAPO_CANTIERE");

  return (
    <div>
      {/* Page header */}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Operators list */}
        <div className="lg:col-span-1">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
            <Users className="w-4 h-4" />
            OPERATORI ({operatori.length})
          </h2>
          <div className="flex flex-col gap-2">
            {utentiLoading ? (
              <div className="card flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2" style={{ borderColor: "var(--accent)" }} />
              </div>
            ) : operatori.length === 0 ? (
              <div className="card text-center py-8">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nessun operatore</p>
              </div>
            ) : (
              operatori.map((user) => (
                <button
                  key={user.id}
                  onClick={() => setSelectedUser(user.id === selectedUser ? null : user.id)}
                  className="card text-left transition-all duration-200 p-4"
                  style={{
                    border: selectedUser === user.id ? "1px solid var(--accent)" : "1px solid var(--border)",
                    boxShadow: selectedUser === user.id ? "0 0 0 1px var(--accent)" : "none",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                      style={{ background: "var(--accent-hover)" }}
                    >
                      {user.nome[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{user.nome} {user.cognome}</p>
                      <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{user.email}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Site assignments */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
            <Building2 className="w-4 h-4" />
            ASSEGNAZIONI CANTIERI
          </h2>

          {!selectedUser ? (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <Users className="w-12 h-12 opacity-20 mb-3" />
              <p className="font-medium">Seleziona un operatore</p>
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                per gestire i suoi cantieri assegnati
              </p>
            </div>
          ) : (
            <div className="card">
              <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
                Cantieri assegnati a{" "}
                <span className="text-white font-medium">
                  {operatori.find((u) => u.id === selectedUser)?.nome}
                </span>
              </p>
              <div className="flex flex-col gap-2">
                {cantieri.map((cantiere) => {
                  return (
                    <div
                      key={cantiere.id}
                      className="flex items-center justify-between p-3 rounded-xl"
                      style={{ background: "var(--surface-hover)" }}
                    >
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                        <span className="text-sm font-medium">{cantiere.nome}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => assegna({ variables: { cantiereId: cantiere.id, userId: selectedUser } })}
                          className="btn-secondary text-xs py-1.5 px-3"
                        >
                          Assegna
                        </button>
                        <button
                          onClick={() => rimuovi({ variables: { cantiereId: cantiere.id, userId: selectedUser } })}
                          className="btn-ghost text-xs py-1.5 px-3"
                          style={{ color: "var(--danger)" }}
                        >
                          Rimuovi
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
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
