"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  X,
  Layers,
  ImageIcon,
  Pencil,
  Archive,
  RotateCcw,
} from "lucide-react";
import { GET_CANTIERE } from "@/graphql/queries";
import {
  AGGIORNA_CANTIERE,
  ARCHIVIA_CANTIERE,
  RIATTIVA_CANTIERE,
  CARICA_PIANTINA,
  RINOMINA_PIANTINA,
} from "@/graphql/mutations";
import CantiereBadge from "@/components/cantiere/CantiereBadge";
import { StatoCantiere } from "@cervello-visivo/shared";
import { uploadFile, getImageDimensions } from "@/lib/upload";
import { safeDate } from "@/lib/dateUtils";

// ─── Modal: Carica Piantina ───────────────────────────────────────────────────

function CaricaPiantinaModal({
  cantiereId,
  onClose,
  onSuccess,
}: {
  cantiereId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState("");
  const [livello, setLivello] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const [caricaPiantina] = useMutation(CARICA_PIANTINA, {
    onCompleted: () => {
      onSuccess();
      onClose();
    },
    onError: (err) => {
      setError(err.message);
      setUploading(false);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError("");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) {
      setFile(f);
      setPreview(URL.createObjectURL(f));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setError("Seleziona un file immagine"); return; }
    if (!nome.trim()) { setError("Inserisci il nome della piantina"); return; }
    setUploading(true);
    setError("");
    try {
      const [url, dims] = await Promise.all([
        uploadFile(file),
        getImageDimensions(file),
      ]);
      caricaPiantina({
        variables: {
          cantiereId,
          nome: nome.trim(),
          livello,
          fileUrl: url,
          larghezza: dims.width,
          altezza: dims.height,
        },
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Errore durante l'upload");
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
    >
      <div className="card w-full max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Carica piantina</h2>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Drop zone */}
          <div
            className="relative rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors"
            style={{
              borderColor: file ? "var(--accent)" : "var(--border)",
              minHeight: 160,
              background: "var(--surface-hover)",
            }}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
          >
            {preview ? (
              <img
                src={preview}
                alt="Preview"
                className="max-h-40 max-w-full rounded-lg object-contain"
              />
            ) : (
              <>
                <Upload className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm font-medium">
                  Trascina qui o clicca per selezionare
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  PNG, JPG, WebP — max 100 MB
                </p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium mb-2">
                Nome piantina
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Es. Piano terra"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Livello</label>
              <input
                type="number"
                className="input-field"
                value={livello}
                onChange={(e) => setLivello(Number(e.target.value))}
                min={-5}
                max={99}
              />
            </div>
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

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
              disabled={uploading}
            >
              Annulla
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={uploading || !file}
            >
              {uploading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Caricamento...
                </span>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Carica piantina
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CantiereDettaglioPage() {
  const params = useParams();
  const router = useRouter();
  const cantiereId = params.id as string;

  const [editing, setEditing] = useState(false);
  const [editNome, setEditNome] = useState("");
  const [editIndirizzo, setEditIndirizzo] = useState("");
  const [showCaricaModal, setShowCaricaModal] = useState(false);
  const [renamingPiantinaId, setRenamingPiantinaId] = useState<string | null>(null);
  const [renamingPiantinaValue, setRenamingPiantinaValue] = useState("");

  const { data, loading, refetch } = useQuery(GET_CANTIERE, {
    variables: { id: cantiereId },
  });

  const [aggiorna] = useMutation(AGGIORNA_CANTIERE, {
    onCompleted: () => { setEditing(false); refetch(); },
  });
  const [archivia] = useMutation(ARCHIVIA_CANTIERE, {
    onCompleted: () => refetch(),
  });
  const [riattiva] = useMutation(RIATTIVA_CANTIERE, {
    onCompleted: () => refetch(),
  });
  const [rinominaPiantina] = useMutation(RINOMINA_PIANTINA, {
    onCompleted: () => { refetch(); setRenamingPiantinaId(null); },
  });

  const cantiere = data?.cantiere;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2"
          style={{ borderColor: "var(--accent)" }}
        />
      </div>
    );
  }

  if (!cantiere) {
    return (
      <div className="card text-center py-12" style={{ color: "var(--text-muted)" }}>
        Cantiere non trovato.
      </div>
    );
  }

  const startEditing = () => {
    setEditNome(cantiere.nome);
    setEditIndirizzo(cantiere.indirizzo);
    setEditing(true);
  };

  const saveEdit = () => {
    aggiorna({
      variables: { id: cantiereId, input: { nome: editNome, indirizzo: editIndirizzo } },
    });
  };

  return (
    <div>
      {/* Back */}
      <button
        onClick={() => router.push("/dashboard/cantieri")}
        className="btn-ghost mb-4 -ml-2"
      >
        <ArrowLeft className="w-4 h-4" />
        Cantieri
      </button>

      {/* Cantiere header card */}
      <div className="card mb-6">
        {editing ? (
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={editNome}
              onChange={(e) => setEditNome(e.target.value)}
              className="input-field text-xl font-bold"
              placeholder="Nome cantiere"
            />
            <input
              type="text"
              value={editIndirizzo}
              onChange={(e) => setEditIndirizzo(e.target.value)}
              className="input-field"
              placeholder="Indirizzo"
            />
            <div className="flex gap-2">
              <button onClick={saveEdit} className="btn-primary">
                Salva
              </button>
              <button onClick={() => setEditing(false)} className="btn-secondary">
                Annulla
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold mb-1">{cantiere.nome}</h1>
              <p style={{ color: "var(--text-muted)" }}>{cantiere.indirizzo}</p>
              <p
                className="text-xs mt-2"
                style={{ color: "var(--text-muted)" }}
              >
                Creato il{" "}
                {safeDate(cantiere.createdAt).toLocaleDateString("it-IT", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
              <CantiereBadge stato={cantiere.stato as StatoCantiere} />
              <button onClick={startEditing} className="btn-ghost">
                <Pencil className="w-4 h-4" />
                Modifica
              </button>
              {cantiere.stato === "ATTIVO" ? (
                <button
                  onClick={() => archivia({ variables: { id: cantiereId } })}
                  className="btn-ghost"
                  style={{ color: "var(--danger)" }}
                >
                  <Archive className="w-4 h-4" />
                  Archivia
                </button>
              ) : (
                <button
                  onClick={() => riattiva({ variables: { id: cantiereId } })}
                  className="btn-ghost"
                  style={{ color: "var(--success)" }}
                >
                  <RotateCcw className="w-4 h-4" />
                  Riattiva
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Piantine section */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Layers className="w-5 h-5" style={{ color: "var(--accent)" }} />
          Piantine ({cantiere.piantine.length})
        </h2>
        <button
          onClick={() => setShowCaricaModal(true)}
          className="btn-primary"
        >
          <Upload className="w-4 h-4" />
          Carica piantina
        </button>
      </div>

      {cantiere.piantine.length === 0 ? (
        <div
          className="card flex flex-col items-center justify-center py-16 text-center cursor-pointer transition-all"
          style={{ border: "2px dashed var(--border)" }}
          onClick={() => setShowCaricaModal(true)}
        >
          <ImageIcon className="w-14 h-14 mb-4 opacity-20" />
          <p className="font-medium">Nessuna piantina caricata</p>
          <p className="text-sm mt-1 mb-4" style={{ color: "var(--text-muted)" }}>
            Carica la planimetria del cantiere per iniziare
          </p>
          <span className="btn-secondary text-sm">
            <Upload className="w-4 h-4" />
            Carica piantina
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cantiere.piantine
            .slice()
            .sort(
              (a: { livello: number }, b: { livello: number }) =>
                a.livello - b.livello
            )
            .map(
              (piantina: {
                id: string;
                nome: string;
                livello: number;
                fileUrl: string;
                larghezza: number;
                altezza: number;
              }) => (
                <Link
                  key={piantina.id}
                  href={`/dashboard/cantieri/${cantiereId}/piantina/${piantina.id}`}
                >
                  <div
                    className="card p-0 overflow-hidden cursor-pointer transition-all duration-200 group"
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.borderColor =
                        "var(--accent)";
                      (e.currentTarget as HTMLDivElement).style.boxShadow =
                        "0 0 0 1px var(--accent)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.borderColor =
                        "var(--border)";
                      (e.currentTarget as HTMLDivElement).style.boxShadow =
                        "none";
                    }}
                  >
                    <div
                      className="aspect-video overflow-hidden"
                      style={{ background: "var(--surface-hover)" }}
                    >
                      <img
                        src={piantina.fileUrl}
                        alt={piantina.nome}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-4">
                      {renamingPiantinaId === piantina.id ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
                          <input
                            className="input-field text-sm font-medium py-1 px-2 h-7 flex-1 min-w-0"
                            value={renamingPiantinaValue}
                            onChange={(e) => setRenamingPiantinaValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && renamingPiantinaValue.trim()) {
                                rinominaPiantina({ variables: { id: piantina.id, nome: renamingPiantinaValue.trim() } });
                              }
                              if (e.key === "Escape") setRenamingPiantinaId(null);
                            }}
                            autoFocus
                          />
                          <button
                            onClick={(e) => { e.preventDefault(); if (renamingPiantinaValue.trim()) rinominaPiantina({ variables: { id: piantina.id, nome: renamingPiantinaValue.trim() } }); }}
                            className="btn-ghost p-1"
                          >
                            <Pencil className="w-3 h-3" style={{ color: "var(--accent)" }} />
                          </button>
                          <button onClick={(e) => { e.preventDefault(); setRenamingPiantinaId(null); }} className="btn-ghost p-1">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium">{piantina.nome}</h3>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              setRenamingPiantinaId(piantina.id);
                              setRenamingPiantinaValue(piantina.nome);
                            }}
                            className="btn-ghost p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Rinomina piantina"
                          >
                            <Pencil className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                          </button>
                        </div>
                      )}
                      <p
                        className="text-xs mt-1"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Livello {piantina.livello} &middot; {piantina.larghezza}
                        &times;{piantina.altezza}px
                      </p>
                    </div>
                  </div>
                </Link>
              )
            )}
          {/* Add more tile */}
          <div
            className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors min-h-[180px]"
            style={{ borderColor: "var(--border)" }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLDivElement).style.borderColor =
                "var(--accent)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLDivElement).style.borderColor =
                "var(--border)")
            }
            onClick={() => setShowCaricaModal(true)}
          >
            <Upload className="w-8 h-8 mb-2 opacity-30" />
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              Aggiungi piantina
            </span>
          </div>
        </div>
      )}

      {showCaricaModal && (
        <CaricaPiantinaModal
          cantiereId={cantiereId}
          onClose={() => setShowCaricaModal(false)}
          onSuccess={() => refetch()}
        />
      )}
    </div>
  );
}
