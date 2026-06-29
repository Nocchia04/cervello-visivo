"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Upload,
  Camera,
  Columns2,
  Maximize2,
  MapPin,
  Lock,
  Unlock,
} from "lucide-react";
import dynamic from "next/dynamic";
import PiantinaSidebarWidget from "@/components/piantina/PiantinaSidebarWidget";
import DateDropdown from "@/components/piantina/DateDropdown";
import { GET_PIANTINA, GET_CANTIERE } from "@/graphql/queries";
import { UPLOAD_FOTO360, ELIMINA_FOTO360 } from "@/graphql/mutations";
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
  getCamera(): { lon: number; lat: number };
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
  return [...fotos].sort((a, b) => {
    const diff = safeDate(b.timestamp).getTime() - safeDate(a.timestamp).getTime();
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
}

// ─── Upload Foto Button ─────────────────────────────────────────────────────────

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

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PiantinaPage() {
  const params = useParams();
  const piantinaId = params.piantinaId as string;
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── URL-driven state (single source of truth, shared with sidebar widget) ──
  const selectedPuntoId = searchParams.get("punto");
  const selectedFotoIndex = parseInt(searchParams.get("foto") ?? "0", 10) || 0;
  const compareMode = searchParams.get("cmp") === "1";
  const compareFotoIndex = parseInt(searchParams.get("cmpFoto") ?? "0", 10) || 0;
  const leftLocked = searchParams.get("lockL") === "1";
  const rightLocked = searchParams.get("lockR") === "1";

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams]
  );

  // ── Local UI state (transient, no need in URL) ────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [annotationCount, setAnnotationCount] = useState(0);
  const [compareDateDropdownOpen, setCompareDateDropdownOpen] = useState(false);
  const [dateDropdownOpenLeft, setDateDropdownOpenLeft] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Compare rotation sync refs ─────────────────────────────────────────────
  const leftViewerRef = useRef<SyncedViewer360Handle>(null);
  const rightViewerRef = useRef<SyncedViewer360Handle>(null);

  // ── GraphQL ────────────────────────────────────────────────────────────────
  const { data, loading, refetch } = useQuery(GET_PIANTINA, {
    variables: { id: piantinaId },
  });

  // Nome cantiere per l'etichetta fluttuante in alto a sinistra.
  const { data: cantiereData } = useQuery(GET_CANTIERE, {
    variables: { id: params.id as string },
    skip: !params.id,
  });
  const cantiereNome: string | undefined = cantiereData?.cantiere?.nome;

  const [eliminaFoto] = useMutation(ELIMINA_FOTO360, {
    onCompleted: () => refetch(),
  });

  const handleDeleteFoto = useCallback(
    (fotoId: string) => {
      eliminaFoto({ variables: { id: fotoId } });
    },
    [eliminaFoto]
  );

  const piantina = data?.piantina;
  const puntiDiScatto: Punto[] = piantina?.puntiDiScatto ?? [];

  const selectedPunto = useMemo(
    () => puntiDiScatto.find((p) => p.id === selectedPuntoId) ?? null,
    [puntiDiScatto, selectedPuntoId]
  );

  const selectedFotoSorted = useMemo(
    () => (selectedPunto ? sortFotoDesc(selectedPunto.foto360) : []),
    [selectedPunto]
  );

  const currentFoto = selectedFotoSorted[selectedFotoIndex] ?? null;
  const currentCompareFoto = selectedFotoSorted[compareFotoIndex] ?? null;

  // ── Auto-select most recent punto with photos on mount (if none selected) ─
  useEffect(() => {
    if (selectedPuntoId || puntiDiScatto.length === 0) return;
    let bestPunto: Punto | null = null;
    let bestTime = -Infinity;
    for (const p of puntiDiScatto) {
      for (const f of p.foto360) {
        const t = safeDate(f.timestamp).getTime();
        if (t > bestTime) {
          bestTime = t;
          bestPunto = p;
        }
      }
    }
    const target = bestPunto ?? puntiDiScatto[0];
    if (target) updateParams({ punto: target.id, foto: "0" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puntiDiScatto.length]);

  // ── Fullscreen toggle ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  const handleToggleCompare = () => {
    if (compareMode) {
      updateParams({ cmp: null, cmpFoto: null, lockL: null, lockR: null });
    } else {
      const nextIdx = selectedFotoIndex === 0 ? 1 : 0;
      const newCmpIdx = selectedFotoSorted.length > 1 ? nextIdx : 0;
      updateParams({ cmp: "1", cmpFoto: String(newCmpIdx) });
    }
  };

  // ── Compare locks: keep last-known position in refs ───────────────────────
  const leftLockedRef = useRef(false);
  const rightLockedRef = useRef(false);
  useEffect(() => { leftLockedRef.current = leftLocked; }, [leftLocked]);
  useEffect(() => { rightLockedRef.current = rightLocked; }, [rightLocked]);

  const lastLeftPosRef = useRef({ lon: 0, lat: 0 });
  const lastRightPosRef = useRef({ lon: 0, lat: 0 });

  const handleLeftRotate = useCallback((lon: number, lat: number) => {
    const deltaLon = lon - lastLeftPosRef.current.lon;
    const deltaLat = lat - lastLeftPosRef.current.lat;
    lastLeftPosRef.current = { lon, lat };
    if (rightLockedRef.current) return;
    const rightCurrent = rightViewerRef.current?.getCamera() ?? lastRightPosRef.current;
    const newRightLon = rightCurrent.lon + deltaLon;
    const newRightLat = Math.max(-85, Math.min(85, rightCurrent.lat + deltaLat));
    rightViewerRef.current?.setCamera(newRightLon, newRightLat);
    lastRightPosRef.current = { lon: newRightLon, lat: newRightLat };
  }, []);

  const handleRightRotate = useCallback((lon: number, lat: number) => {
    const deltaLon = lon - lastRightPosRef.current.lon;
    const deltaLat = lat - lastRightPosRef.current.lat;
    lastRightPosRef.current = { lon, lat };
    if (leftLockedRef.current) return;
    const leftCurrent = leftViewerRef.current?.getCamera() ?? lastLeftPosRef.current;
    const newLeftLon = leftCurrent.lon + deltaLon;
    const newLeftLat = Math.max(-85, Math.min(85, leftCurrent.lat + deltaLat));
    leftViewerRef.current?.setCamera(newLeftLon, newLeftLat);
    lastLeftPosRef.current = { lon: newLeftLon, lat: newLeftLat };
  }, []);

  const toggleLockPreservingPositions = useCallback((side: "left" | "right") => {
    const leftNow = leftViewerRef.current?.getCamera() ?? lastLeftPosRef.current;
    const rightNow = rightViewerRef.current?.getCamera() ?? lastRightPosRef.current;
    lastLeftPosRef.current = leftNow;
    lastRightPosRef.current = rightNow;
    if (side === "left") updateParams({ lockL: leftLocked ? null : "1" });
    else updateParams({ lockR: rightLocked ? null : "1" });
    requestAnimationFrame(() => {
      leftViewerRef.current?.setCamera(leftNow.lon, leftNow.lat);
      rightViewerRef.current?.setCamera(rightNow.lon, rightNow.lat);
    });
  }, [leftLocked, rightLocked, updateParams]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ height: "100vh", margin: "-40px", background: "#000" }}
      >
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
  const isCompareSplit = compareMode && currentFoto && currentCompareFoto;
  const hasCurrentFoto = !!currentFoto;

  return (
    <div
      ref={containerRef}
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
          360 Viewer Area — full container
          ═══════════════════════════════════════════════════════════════════ */}

      {hasCurrentFoto && !isCompareSplit && (
        <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
          <EmbeddedViewer360
            foto={selectedFotoSorted}
            currentIndex={selectedFotoIndex}
            onIndexChange={(idx) => updateParams({ foto: String(idx) })}
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
              locked={leftLocked}
            />
            <div
              style={{
                position: "absolute",
                bottom: 16,
                left: 16,
                zIndex: 20,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 6,
              }}
            >
              <button
                onClick={() => toggleLockPreservingPositions("left")}
                title={leftLocked ? "Sblocca vista sinistra" : "Blocca vista sinistra"}
                style={{
                  background: leftLocked ? "#6366f1" : "rgba(0,0,0,0.6)",
                  backdropFilter: "blur(8px)",
                  border: "none",
                  borderRadius: 999,
                  padding: "6px 12px",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                }}
              >
                {leftLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                {leftLocked ? "Bloccato" : "Blocca"}
              </button>

              <div
                style={{
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
                  onSelect={(idx) => updateParams({ foto: String(idx) })}
                  open={dateDropdownOpenLeft}
                  onToggle={() => setDateDropdownOpenLeft(!dateDropdownOpenLeft)}
                  onDelete={handleDeleteFoto}
                  openUpward
                  darkTheme
                />
              </div>
            </div>
          </div>

          {/* Right viewer */}
          <div style={{ flex: 1, position: "relative" }}>
            <SyncedViewer360
              ref={rightViewerRef}
              url={currentCompareFoto!.url}
              onRotate={handleRightRotate}
              locked={rightLocked}
            />
            <div
              style={{
                position: "absolute",
                bottom: 16,
                right: 16,
                zIndex: 20,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 6,
              }}
            >
              <button
                onClick={() => toggleLockPreservingPositions("right")}
                title={rightLocked ? "Sblocca vista destra" : "Blocca vista destra"}
                style={{
                  background: rightLocked ? "#6366f1" : "rgba(0,0,0,0.6)",
                  backdropFilter: "blur(8px)",
                  border: "none",
                  borderRadius: 999,
                  padding: "6px 12px",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                }}
              >
                {rightLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                {rightLocked ? "Bloccato" : "Blocca"}
              </button>

              <div
                style={{
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
                  selectedIndex={compareFotoIndex}
                  onSelect={(idx) => updateParams({ cmpFoto: String(idx) })}
                  open={compareDateDropdownOpen}
                  onToggle={() => setCompareDateDropdownOpen(!compareDateDropdownOpen)}
                  onDelete={handleDeleteFoto}
                  openUpward
                  darkTheme
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
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
            Seleziona un punto dalla mappa o carica una nuova foto
          </p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          Etichetta cantiere + piantina — fluttuante in alto a sinistra
          ═══════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 30,
          maxWidth: "55%",
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(8px)",
          borderRadius: 12,
          padding: "8px 14px",
          color: "#fff",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {cantiereNome ?? "Cantiere"}
        </div>
        {piantina?.nome && (
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              opacity: 0.75,
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {piantina.nome}
          </div>
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
          disabled={selectedFotoSorted.length < 2}
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
            cursor: selectedFotoSorted.length >= 2 ? "pointer" : "not-allowed",
            backdropFilter: "blur(8px)",
            opacity: selectedFotoSorted.length >= 2 ? 1 : 0.4,
            whiteSpace: "nowrap",
          }}
        >
          <Columns2 className="w-4 h-4" />
          {compareMode ? "Esci confronto" : "Confronta"}
        </button>

        {/* Upload foto */}
        {selectedPuntoId && (
          <div style={{ position: "relative" }}>
            <UploadFotoButton puntoId={selectedPuntoId} onDone={() => refetch()} />
          </div>
        )}

        {/* Fullscreen toggle */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? "Esci fullscreen" : "Schermo intero"}
          style={{
            background: "rgba(0,0,0,0.6)",
            border: "none",
            borderRadius: 999,
            width: 36,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#fff",
            backdropFilter: "blur(8px)",
          }}
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Hint banners
          ═══════════════════════════════════════════════════════════════════ */}

      {/* Compare mode needs at least 2 photos hint */}
      {compareMode && selectedFotoSorted.length < 2 && (
        <div
          style={{
            position: "absolute",
            top: 60,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 40,
            background: "rgba(239,68,68,0.9)",
            backdropFilter: "blur(8px)",
            borderRadius: 999,
            padding: "8px 20px",
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          Servono almeno 2 foto per confrontare
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          Piantina dockable widget — fixed, ridimensionabile, sopra "Esci"
          ═══════════════════════════════════════════════════════════════════ */}
      <PiantinaSidebarWidget cantiereId={params.id as string} piantinaId={piantinaId} />
    </div>
  );
}
