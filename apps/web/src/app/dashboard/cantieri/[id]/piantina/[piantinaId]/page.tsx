"use client";

import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useParams } from "next/navigation";
import { ArrowLeft, X, Camera, Plus, Upload, Trash2 } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import PiantinaCanvas from "@/components/piantina/PiantinaCanvas";
import { GET_PIANTINA } from "@/graphql/queries";
import {
  AGGIUNGI_PUNTO_DI_SCATTO,
  SPOSTA_PUNTO_DI_SCATTO,
  UPLOAD_FOTO360,
} from "@/graphql/mutations";
import { uploadFile } from "@/lib/upload";
import { safeDate } from "@/lib/dateUtils";

const Viewer360 = dynamic(
  () => import("@/components/foto360/Viewer360"),
  { ssr: false }
);

interface Foto {
  id: string;
  url: string;
  thumbnailUrl?: string;
  timestamp: string;
}

interface Punto {
  id: string;
  nome: string;
  x: number;
  y: number;
  foto360: Foto[];
}

// ─── Upload Foto Button ───────────────────────────────────────────────────────

function UploadFotoButton({
  puntoId,
  onDone,
}: {
  puntoId: string;
  onDone: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const [uploadFoto360] = useMutation(UPLOAD_FOTO360, {
    onCompleted: () => { setUploading(false); onDone(); },
    onError: (err) => { setError(err.message); setUploading(false); },
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const url = await uploadFile(file);
        await uploadFoto360({ variables: { puntoDiScattoId: puntoId, url } });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload fallito");
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="btn-primary w-full text-sm"
      >
        {uploading ? (
          <span className="flex items-center gap-2 justify-center">
            <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            Caricamento...
          </span>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            Carica foto 360°
          </>
        )}
      </button>
      {error && (
        <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Right Panel ──────────────────────────────────────────────────────────────

function PuntoPanel({
  punto,
  onClose,
  onOpenViewer,
  onRefetch,
}: {
  punto: Punto;
  onClose: () => void;
  onOpenViewer: (foto: Foto[], index: number) => void;
  onRefetch: () => void;
}) {
  const sortedFoto = [...punto.foto360].sort(
    (a, b) => safeDate(b.timestamp).getTime() - safeDate(a.timestamp).getTime()
  );

  return (
    <div
      className="w-80 flex-shrink-0 flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        maxHeight: "calc(100vh - 12rem)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div>
          <h3 className="font-semibold">{punto.nome}</h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {punto.foto360.length} foto
          </p>
        </div>
        <button onClick={onClose} className="btn-ghost p-1.5">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Upload button */}
      <div className="p-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <UploadFotoButton puntoId={punto.id} onDone={onRefetch} />
      </div>

      {/* Photos grid — scrollable */}
      <div className="flex-1 overflow-y-auto p-3">
        {sortedFoto.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Camera className="w-10 h-10 opacity-20 mb-3" />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Nessuna foto ancora
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Usa il bottone sopra per caricare
            </p>
          </div>
        ) : (
          <>
            {/* Timeline label */}
            <p
              className="text-xs font-semibold mb-2 uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Cronologia
            </p>
            <div className="flex flex-col gap-2">
              {sortedFoto.map((foto, index) => (
                <button
                  key={foto.id}
                  onClick={() => onOpenViewer(sortedFoto, index)}
                  className="flex items-center gap-3 p-2 rounded-xl text-left transition-colors w-full group"
                  style={{ background: "var(--surface-hover)" }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.background =
                      "var(--surface-hover)")
                  }
                >
                  {/* Thumbnail */}
                  <div
                    className="w-16 h-12 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center"
                    style={{ background: "var(--surface-hover)" }}
                  >
                    {foto.thumbnailUrl ? (
                      <img
                        src={foto.thumbnailUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Camera className="w-5 h-5 opacity-30" />
                    )}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">
                      {safeDate(foto.timestamp).toLocaleDateString("it-IT", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {safeDate(foto.timestamp).toLocaleTimeString("it-IT", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  {/* Open hint */}
                  <span
                    className="text-xs opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    style={{ color: "var(--accent)" }}
                  >
                    360°
                  </span>
                </button>
              ))}
            </div>

            <Link
              href={`/dashboard/punti/${punto.id}`}
              className="btn-ghost w-full mt-3 text-sm justify-center"
            >
              Time travel & annotazioni →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PiantinaPage() {
  const params = useParams();
  const piantinaId = params.piantinaId as string;
  const cantiereId = params.id as string;

  const [selectedPuntoId, setSelectedPuntoId] = useState<string | null>(null);
  const [viewerFoto, setViewerFoto] = useState<Foto[] | null>(null);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);
  const [addingPunto, setAddingPunto] = useState(false);
  const [nuovoPuntoNome, setNuovoPuntoNome] = useState("");
  const [pendingCoords, setPendingCoords] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const { data, loading, refetch } = useQuery(GET_PIANTINA, {
    variables: { id: piantinaId },
  });

  const [aggiungiPunto] = useMutation(AGGIUNGI_PUNTO_DI_SCATTO, {
    onCompleted: () => {
      refetch();
      setPendingCoords(null);
      setNuovoPuntoNome("");
      setAddingPunto(false);
    },
  });

  const [spostaPunto] = useMutation(SPOSTA_PUNTO_DI_SCATTO, {
    onCompleted: () => refetch(),
  });

  const piantina = data?.piantina;
  const puntiDiScatto: Punto[] = piantina?.puntiDiScatto ?? [];
  const selectedPunto = puntiDiScatto.find((p) => p.id === selectedPuntoId);

  const handleCanvasClick = useCallback(
    (x: number, y: number) => {
      if (addingPunto) {
        setPendingCoords({ x, y });
      } else {
        setSelectedPuntoId(null);
      }
    },
    [addingPunto]
  );

  const handlePuntoClick = useCallback(
    (puntoId: string) => {
      setAddingPunto(false);
      setPendingCoords(null);
      setSelectedPuntoId(puntoId === selectedPuntoId ? null : puntoId);
    },
    [selectedPuntoId]
  );

  const handleDragEnd = useCallback(
    (puntoId: string, newX: number, newY: number) => {
      spostaPunto({ variables: { id: puntoId, x: newX, y: newY } });
    },
    [spostaPunto]
  );

  const handleAddPunto = () => {
    if (!pendingCoords || !nuovoPuntoNome.trim()) return;
    aggiungiPunto({
      variables: {
        piantinaId,
        nome: nuovoPuntoNome.trim(),
        x: pendingCoords.x,
        y: pendingCoords.y,
      },
    });
  };

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

  if (!piantina) {
    return <div className="card">Piantina non trovata</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/dashboard/cantieri/${cantiereId}`}
          className="btn-ghost p-2"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">{piantina.nome}</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Livello {piantina.livello} &middot; {puntiDiScatto.length} punti
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => {
              setAddingPunto(!addingPunto);
              setPendingCoords(null);
              if (!addingPunto) setSelectedPuntoId(null);
            }}
            className={addingPunto ? "btn-primary" : "btn-secondary"}
          >
            <Plus className="w-4 h-4" />
            {addingPunto ? "Clicca sulla mappa" : "Aggiungi punto"}
          </button>
        </div>
      </div>

      {/* Hint bar when adding */}
      {addingPunto && (
        <div
          className="mb-4 px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"
          style={{
            background: "rgba(99,102,241,0.1)",
            border: "1px solid rgba(99,102,241,0.3)",
            color: "var(--accent)",
          }}
        >
          <span>🎯</span>
          Clicca sulla piantina per posizionare il nuovo punto di scatto
          <button
            onClick={() => { setAddingPunto(false); setPendingCoords(null); }}
            className="ml-auto btn-ghost py-1"
            style={{ color: "var(--text-muted)" }}
          >
            Annulla
          </button>
        </div>
      )}

      {/* Main layout */}
      <div className="flex gap-4 items-start">
        {/* Canvas */}
        <div className="flex-1 min-w-0">
          <PiantinaCanvas
            piantinaId={piantinaId}
            fileUrl={piantina.fileUrl}
            larghezza={piantina.larghezza}
            altezza={piantina.altezza}
            puntiDiScatto={puntiDiScatto}
            selectedPuntoId={selectedPuntoId}
            onPuntoDragEnd={handleDragEnd}
            onCanvasClick={handleCanvasClick}
            onPuntoClick={handlePuntoClick}
          />
          <p
            className="text-xs mt-2 text-center"
            style={{ color: "var(--text-muted)" }}
          >
            Scroll per zoom · Alt+drag per pan · Trascina i marker per spostarli
          </p>
        </div>

        {/* Right panel */}
        {selectedPunto && (
          <PuntoPanel
            punto={selectedPunto}
            onClose={() => setSelectedPuntoId(null)}
            onOpenViewer={(foto, index) => {
              setViewerFoto(foto);
              setViewerInitialIndex(index);
            }}
            onRefetch={refetch}
          />
        )}
      </div>

      {/* Add punto dialog */}
      {addingPunto && pendingCoords && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
        >
          <div className="card w-full max-w-sm">
            <h3 className="font-semibold mb-4">Nuovo punto di scatto</h3>
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
              Posizione: {pendingCoords.x.toFixed(1)}%,{" "}
              {pendingCoords.y.toFixed(1)}%
            </p>
            <input
              type="text"
              className="input-field mb-4"
              placeholder="Nome del punto (es. Cucina, Salone...)"
              value={nuovoPuntoNome}
              onChange={(e) => setNuovoPuntoNome(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddPunto();
                if (e.key === "Escape") {
                  setPendingCoords(null);
                  setAddingPunto(false);
                }
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setPendingCoords(null);
                  setAddingPunto(false);
                }}
                className="btn-secondary flex-1"
              >
                Annulla
              </button>
              <button
                onClick={handleAddPunto}
                className="btn-primary flex-1"
                disabled={!nuovoPuntoNome.trim()}
              >
                <Plus className="w-4 h-4" />
                Aggiungi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 360° Viewer overlay */}
      {viewerFoto && (
        <Viewer360
          foto={viewerFoto}
          initialIndex={viewerInitialIndex}
          onClose={() => setViewerFoto(null)}
        />
      )}
    </div>
  );
}
