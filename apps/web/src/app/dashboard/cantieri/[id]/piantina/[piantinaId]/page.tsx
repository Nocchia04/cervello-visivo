"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Upload,
  Camera,
  Columns2,
  ChevronDown,
  ChevronUp,
  Check,
  MapPin,
} from "lucide-react";
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

const EmbeddedViewer360 = dynamic(
  () => import("@/components/foto360/EmbeddedViewer360"),
  { ssr: false }
);

const SyncedViewer360 = dynamic(
  () => import("@/components/foto360/SyncedViewer360"),
  { ssr: false }
);

// ─── Types ─────────────────────────────────────────────────────────────────────

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

interface SyncedViewer360Handle {
  setCamera(lon: number, lat: number): void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function findClosestFotoIndex(fotos: Foto[], referenceTs: string): number {
  if (fotos.length === 0) return -1;
  const refTime = safeDate(referenceTs).getTime();
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < fotos.length; i++) {
    const diff = Math.abs(safeDate(fotos[i].timestamp).getTime() - refTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function sortFotoDesc(fotos: Foto[]): Foto[] {
  return [...fotos].sort(
    (a, b) =>
      safeDate(b.timestamp).getTime() - safeDate(a.timestamp).getTime()
  );
}

// ─── Upload Foto Button (floating pill style) ─────────────────────────────────

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
    onCompleted: () => {
      setUploading(false);
      onDone();
    },
    onError: (err) => {
      setError(err.message);
      setUploading(false);
    },
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
    <>
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
        style={{
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          border: "none",
          borderRadius: 999,
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: uploading ? "wait" : "pointer",
          backdropFilter: "blur(8px)",
          whiteSpace: "nowrap",
        }}
      >
        {uploading ? (
          <span className="flex items-center gap-2">
            <span
              className="animate-spin rounded-full h-4 w-4 border-b-2"
              style={{ borderColor: "#fff" }}
            />
            Caricamento...
          </span>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            Carica foto
          </>
        )}
      </button>
      {error && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            background: "rgba(220,38,38,0.9)",
            color: "#fff",
            padding: "4px 10px",
            borderRadius: 8,
            fontSize: 11,
            whiteSpace: "nowrap",
            backdropFilter: "blur(8px)",
          }}
        >
          {error}
        </div>
      )}
    </>
  );
}

// ─── Date Dropdown ─────────────────────────────────────────────────────────────

function DateDropdown({
  fotos,
  selectedIndex,
  onSelect,
  open,
  onToggle,
}: {
  fotos: Foto[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentFoto = fotos[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        onToggle();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onToggle]);

  if (fotos.length === 0) return null;

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "8px 10px",
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: 10,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 500,
          color: "var(--text)",
        }}
      >
        <span style={{ flex: 1, textAlign: "left" }}>
          {currentFoto
            ? safeDate(currentFoto.timestamp).toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
            : "Seleziona data"}
        </span>
        <ChevronDown
          className="w-3.5 h-3.5"
          style={{
            color: "var(--text-muted)",
            transition: "transform 0.15s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            background: "rgba(255,255,255,0.98)",
            backdropFilter: "blur(12px)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            maxHeight: 200,
            overflowY: "auto",
            zIndex: 50,
          }}
        >
          {fotos.map((foto, idx) => (
            <button
              key={foto.id}
              onClick={() => {
                onSelect(idx);
                onToggle();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 10px",
                background:
                  idx === selectedIndex ? "var(--surface-hover)" : "transparent",
                border: "none",
                borderBottom:
                  idx < fotos.length - 1
                    ? "1px solid var(--border)"
                    : "none",
                cursor: "pointer",
                fontSize: 12,
                color: "var(--text)",
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                if (idx !== selectedIndex) {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "var(--surface-hover)";
                }
              }}
              onMouseLeave={(e) => {
                if (idx !== selectedIndex) {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "transparent";
                }
              }}
            >
              <span style={{ flex: 1 }}>
                {safeDate(foto.timestamp).toLocaleDateString("it-IT", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
                {" "}
                <span style={{ color: "var(--text-muted)" }}>
                  {safeDate(foto.timestamp).toLocaleTimeString("it-IT", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </span>
              {idx === selectedIndex && (
                <Check className="w-3.5 h-3.5" style={{ color: "#6366f1" }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PiantinaPage() {
  const params = useParams();
  const piantinaId = params.piantinaId as string;
  const cantiereId = params.id as string;

  // ── Core viewer state ──────────────────────────────────────────────────────
  const [selectedPuntoId, setSelectedPuntoId] = useState<string | null>(null);
  const [selectedFotoIndex, setSelectedFotoIndex] = useState(0);

  // ── Compare mode ───────────────────────────────────────────────────────────
  const [compareMode, setCompareMode] = useState(false);
  const [comparePuntoId, setComparePuntoId] = useState<string | null>(null);
  const [compareFotoIndex, setCompareFotoIndex] = useState(0);
  const [selectingCompare, setSelectingCompare] = useState(false);

  // ── Add punto flow ─────────────────────────────────────────────────────────
  const [addingPunto, setAddingPunto] = useState(false);
  const [nuovoPuntoNome, setNuovoPuntoNome] = useState("");
  const [pendingCoords, setPendingCoords] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [minimapCollapsed, setMinimapCollapsed] = useState(false);
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [compareDateDropdownOpen, setCompareDateDropdownOpen] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [annotationCount, setAnnotationCount] = useState(0);

  // ── Compare rotation sync refs ─────────────────────────────────────────────
  const leftViewerRef = useRef<SyncedViewer360Handle>(null);
  const rightViewerRef = useRef<SyncedViewer360Handle>(null);

  // ── Tracks whether we've done auto-select already ──────────────────────────
  const autoSelectedRef = useRef(false);

  // ── GraphQL ────────────────────────────────────────────────────────────────
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

  // ── Derived data ───────────────────────────────────────────────────────────
  const selectedPunto = useMemo(
    () => puntiDiScatto.find((p) => p.id === selectedPuntoId) ?? null,
    [puntiDiScatto, selectedPuntoId]
  );

  const selectedFotoSorted = useMemo(
    () => (selectedPunto ? sortFotoDesc(selectedPunto.foto360) : []),
    [selectedPunto]
  );

  const comparePunto = useMemo(
    () => puntiDiScatto.find((p) => p.id === comparePuntoId) ?? null,
    [puntiDiScatto, comparePuntoId]
  );

  const compareFotoSorted = useMemo(
    () => (comparePunto ? sortFotoDesc(comparePunto.foto360) : []),
    [comparePunto]
  );

  const currentFoto = selectedFotoSorted[selectedFotoIndex] ?? null;
  const currentCompareFoto = compareFotoSorted[compareFotoIndex] ?? null;

  // ── Auto-select on open: find punto with most recent foto360 ──────────────
  useEffect(() => {
    if (autoSelectedRef.current || puntiDiScatto.length === 0) return;

    let bestPunto: Punto | null = null;
    let bestTime = -Infinity;

    for (const punto of puntiDiScatto) {
      for (const foto of punto.foto360) {
        const t = safeDate(foto.timestamp).getTime();
        if (t > bestTime) {
          bestTime = t;
          bestPunto = punto;
        }
      }
    }

    if (bestPunto && bestPunto.foto360.length > 0) {
      setSelectedPuntoId(bestPunto.id);
      setSelectedFotoIndex(0); // newest first (sortFotoDesc is used in the memo)
      autoSelectedRef.current = true;
    } else {
      // No photos at all — just select the first punto
      setSelectedPuntoId(puntiDiScatto[0].id);
      autoSelectedRef.current = true;
    }
  }, [puntiDiScatto]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleCanvasClick = useCallback(
    (x: number, y: number) => {
      if (addingPunto) {
        setPendingCoords({ x, y });
      }
    },
    [addingPunto]
  );

  const handlePuntoClick = useCallback(
    (puntoId: string) => {
      // If in compare-selecting mode, set compare punto
      if (selectingCompare) {
        const punto = puntiDiScatto.find((p) => p.id === puntoId);
        if (punto && punto.foto360.length > 0) {
          setComparePuntoId(puntoId);
          // Find closest date to current foto
          if (currentFoto) {
            const sorted = sortFotoDesc(punto.foto360);
            const idx = findClosestFotoIndex(sorted, currentFoto.timestamp);
            setCompareFotoIndex(idx >= 0 ? idx : 0);
          } else {
            setCompareFotoIndex(0);
          }
        }
        setSelectingCompare(false);
        return;
      }

      // If adding punto, cancel and select instead
      if (addingPunto) {
        setAddingPunto(false);
        setPendingCoords(null);
      }

      // Smart date following: when switching punto, find closest date
      if (puntoId !== selectedPuntoId) {
        const punto = puntiDiScatto.find((p) => p.id === puntoId);
        if (punto && punto.foto360.length > 0 && currentFoto) {
          const sorted = sortFotoDesc(punto.foto360);
          const idx = findClosestFotoIndex(sorted, currentFoto.timestamp);
          setSelectedFotoIndex(idx >= 0 ? idx : 0);
        } else {
          setSelectedFotoIndex(0);
        }
        setSelectedPuntoId(puntoId);
      }
    },
    [
      selectingCompare,
      addingPunto,
      selectedPuntoId,
      currentFoto,
      puntiDiScatto,
    ]
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

  const handleToggleCompare = () => {
    if (compareMode) {
      // Exit compare mode
      setCompareMode(false);
      setComparePuntoId(null);
      setCompareFotoIndex(0);
      setSelectingCompare(false);
    } else {
      // Enter compare mode — ask user to click a punto
      setCompareMode(true);
      setSelectingCompare(true);
      setComparePuntoId(null);
    }
  };

  // Sync rotation: left drives right
  const handleLeftRotate = useCallback(
    (lon: number, lat: number) => {
      rightViewerRef.current?.setCamera(lon, lat);
    },
    []
  );

  // Sync rotation: right drives left
  const handleRightRotate = useCallback(
    (lon: number, lat: number) => {
      leftViewerRef.current?.setCamera(lon, lat);
    },
    []
  );

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: "100vh", margin: "-40px", background: "#000" }}>
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

  // ── Determine if we're in compare split view ───────────────────────────────
  const isCompareSplit = compareMode && comparePuntoId && currentCompareFoto;
  const hasCurrentFoto = !!currentFoto;

  return (
    <div
      style={{
        position: "relative",
        height: "100vh",
        width: "calc(100% + 80px)",
        overflow: "hidden",
        background: "#000",
        margin: "-40px -40px -40px -40px",
      }}
    >
      {/* ═══════════════════════════════════════════════════════════════════════
          360 Viewer Area — fills entire container
          ═══════════════════════════════════════════════════════════════════ */}

      {hasCurrentFoto && !isCompareSplit && (
        <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
          <EmbeddedViewer360
            foto={selectedFotoSorted}
            currentIndex={selectedFotoIndex}
            onIndexChange={setSelectedFotoIndex}
            hideTimeTravelPanel
            hideNoteButton
            addingNoteExternal={addingNote}
            onAddingNoteChange={setAddingNote}
            onAnnotationCount={setAnnotationCount}
          />
        </div>
      )}

      {/* Compare split view */}
      {isCompareSplit && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            display: "flex",
          }}
        >
          {/* Left viewer */}
          <div style={{ flex: 1, position: "relative", borderRight: "2px solid rgba(255,255,255,0.2)" }}>
            <SyncedViewer360
              ref={leftViewerRef}
              url={currentFoto!.url}
              onRotate={handleLeftRotate}
            />
            {/* Left label */}
            <div
              style={{
                position: "absolute",
                bottom: 16,
                left: 16,
                zIndex: 20,
                background: "rgba(0,0,0,0.6)",
                backdropFilter: "blur(8px)",
                borderRadius: 10,
                padding: "8px 12px",
                color: "#fff",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 2 }}>
                {selectedPunto?.nome}
              </div>
              <DateDropdown
                fotos={selectedFotoSorted}
                selectedIndex={selectedFotoIndex}
                onSelect={setSelectedFotoIndex}
                open={dateDropdownOpen}
                onToggle={() => setDateDropdownOpen(!dateDropdownOpen)}
              />
            </div>
          </div>

          {/* Right viewer */}
          <div style={{ flex: 1, position: "relative" }}>
            <SyncedViewer360
              ref={rightViewerRef}
              url={currentCompareFoto!.url}
              onRotate={handleRightRotate}
            />
            {/* Right label */}
            <div
              style={{
                position: "absolute",
                bottom: 16,
                right: 16,
                zIndex: 20,
                background: "rgba(0,0,0,0.6)",
                backdropFilter: "blur(8px)",
                borderRadius: 10,
                padding: "8px 12px",
                color: "#fff",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 2 }}>
                {comparePunto?.nome}
              </div>
              <DateDropdown
                fotos={compareFotoSorted}
                selectedIndex={compareFotoIndex}
                onSelect={setCompareFotoIndex}
                open={compareDateDropdownOpen}
                onToggle={() =>
                  setCompareDateDropdownOpen(!compareDateDropdownOpen)
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* Empty state — no foto selected */}
      {!hasCurrentFoto && !isCompareSplit && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#111",
          }}
        >
          <Camera
            className="w-16 h-16"
            style={{ color: "rgba(255,255,255,0.15)", marginBottom: 16 }}
          />
          <p
            style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: 16,
              fontWeight: 500,
              marginBottom: 4,
            }}
          >
            Nessuna foto 360 disponibile
          </p>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
            Seleziona un punto con foto o carica una nuova foto
          </p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          Floating Minimap Panel — top left
          ═══════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 30,
          width: 220,
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(12px)",
          borderRadius: 10,
          boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
        }}
      >
        {/* Minimap header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 10px",
            borderBottom: minimapCollapsed
              ? "none"
              : "1px solid var(--border)",
            borderRadius: minimapCollapsed ? 10 : "10px 10px 0 0",
            background: "rgba(255,255,255,0.95)",
          }}
        >
          <Link
            href={`/dashboard/cantieri/${cantiereId}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "var(--text)",
              textDecoration: "none",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            {piantina.nome}
          </Link>
          <button
            onClick={() => setMinimapCollapsed(!minimapCollapsed)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              alignItems: "center",
              color: "var(--text-muted)",
            }}
          >
            {minimapCollapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
        </div>

        {!minimapCollapsed && (
          <>
            {/* Piantina minimap */}
            <div
              style={{
                maxHeight: 150,
                overflow: "hidden",
                borderBottom: "1px solid var(--border)",
              }}
            >
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
                leftClickPans
              />
            </div>

            {/* Selected punto info + date dropdown */}
            {selectedPunto && (
              <div style={{ padding: "6px 10px", borderRadius: "0 0 10px 10px", background: "rgba(255,255,255,0.95)" }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--text)",
                    marginBottom: 4,
                  }}
                >
                  {selectedPunto.nome}
                  <span
                    style={{
                      fontWeight: 400,
                      color: "var(--text-muted)",
                      marginLeft: 6,
                    }}
                  >
                    {selectedPunto.foto360.length} foto
                  </span>
                </div>
                {selectedFotoSorted.length > 0 && (
                  <DateDropdown
                    fotos={selectedFotoSorted}
                    selectedIndex={selectedFotoIndex}
                    onSelect={setSelectedFotoIndex}
                    open={dateDropdownOpen && !isCompareSplit}
                    onToggle={() =>
                      setDateDropdownOpen(!dateDropdownOpen)
                    }
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Floating Toolbar — top right
          ═══════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 30,
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
        }}
      >
        {/* Note button */}
        {hasCurrentFoto && !isCompareSplit && (
          <button
            onClick={() => setAddingNote(!addingNote)}
            style={{
              background: addingNote ? "#6366f1" : "rgba(0,0,0,0.6)",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              backdropFilter: "blur(8px)",
              whiteSpace: "nowrap",
            }}
          >
            <MapPin className="w-4 h-4" />
            {addingNote ? "Annulla" : `Note${annotationCount > 0 ? ` (${annotationCount})` : ""}`}
          </button>
        )}

        {/* Confronta button */}
        <button
          onClick={handleToggleCompare}
          disabled={!hasCurrentFoto}
          style={{
            background: compareMode ? "#6366f1" : "rgba(0,0,0,0.6)",
            color: "#fff",
            border: "none",
            borderRadius: 999,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: hasCurrentFoto ? "pointer" : "not-allowed",
            backdropFilter: "blur(8px)",
            opacity: hasCurrentFoto ? 1 : 0.4,
            whiteSpace: "nowrap",
          }}
        >
          <Columns2 className="w-4 h-4" />
          {compareMode ? "Esci confronto" : "Confronta"}
        </button>

        {/* Add punto button */}
        <button
          onClick={() => {
            setAddingPunto(!addingPunto);
            setPendingCoords(null);
            if (addingPunto) {
              // Cancel
            } else {
              setCompareMode(false);
              setSelectingCompare(false);
              setComparePuntoId(null);
            }
          }}
          style={{
            background: addingPunto ? "#6366f1" : "rgba(0,0,0,0.6)",
            color: "#fff",
            border: "none",
            borderRadius: 999,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            backdropFilter: "blur(8px)",
            whiteSpace: "nowrap",
          }}
        >
          <Plus className="w-4 h-4" />
          Aggiungi punto
        </button>

        {/* Upload foto button */}
        {selectedPuntoId && (
          <div style={{ position: "relative" }}>
            <UploadFotoButton puntoId={selectedPuntoId} onDone={() => refetch()} />
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Hint banners — centered top
          ═══════════════════════════════════════════════════════════════════ */}

      {/* Compare selecting hint */}
      {selectingCompare && (
        <div
          style={{
            position: "absolute",
            top: 60,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 40,
            background: "rgba(99,102,241,0.9)",
            backdropFilter: "blur(8px)",
            borderRadius: 999,
            padding: "8px 20px",
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 8,
            whiteSpace: "nowrap",
          }}
        >
          <Columns2 className="w-4 h-4" />
          Clicca un punto sulla piantina per confrontare
          <button
            onClick={() => {
              setSelectingCompare(false);
              setCompareMode(false);
            }}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              borderRadius: 999,
              padding: "2px 8px",
              color: "#fff",
              fontSize: 11,
              cursor: "pointer",
              marginLeft: 4,
            }}
          >
            Annulla
          </button>
        </div>
      )}

      {/* Adding punto hint */}
      {addingPunto && !pendingCoords && (
        <div
          style={{
            position: "absolute",
            top: 60,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 40,
            background: "rgba(99,102,241,0.9)",
            backdropFilter: "blur(8px)",
            borderRadius: 999,
            padding: "8px 20px",
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 8,
            whiteSpace: "nowrap",
          }}
        >
          <Plus className="w-4 h-4" />
          Clicca sulla piantina per posizionare il punto
          <button
            onClick={() => {
              setAddingPunto(false);
              setPendingCoords(null);
            }}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              borderRadius: 999,
              padding: "2px 8px",
              color: "#fff",
              fontSize: 11,
              cursor: "pointer",
              marginLeft: 4,
            }}
          >
            Annulla
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          Add punto dialog
          ═══════════════════════════════════════════════════════════════════ */}
      {addingPunto && pendingCoords && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
        >
          <div className="card w-full max-w-sm">
            <h3 className="font-semibold mb-4">Nuovo punto di scatto</h3>
            <p
              className="text-sm mb-4"
              style={{ color: "var(--text-muted)" }}
            >
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
    </div>
  );
}
