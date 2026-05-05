"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@apollo/client";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Camera,
  Columns2,
  Maximize2,
  ArrowLeft,
  Lock,
  Unlock,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import DateDropdown from "@/components/piantina/DateDropdown";
import PiantinaSidebarWidget from "@/components/piantina/PiantinaSidebarWidget";
import { GET_PIANTINA } from "@/graphql/queries";
import { safeDate } from "@/lib/dateUtils";

const EmbeddedViewer360 = dynamic(
  () => import("@/components/foto360/EmbeddedViewer360"),
  { ssr: false }
);
const SyncedViewer360 = dynamic(
  () => import("@/components/foto360/SyncedViewer360"),
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
interface SyncedViewer360Handle {
  setCamera(lon: number, lat: number): void;
  getCamera(): { lon: number; lat: number };
}

function sortFotoDesc(fotos: Foto[]): Foto[] {
  return [...fotos].sort((a, b) => {
    const diff = safeDate(b.timestamp).getTime() - safeDate(a.timestamp).getTime();
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
}

export default function SharePiantinaPage() {
  const params = useParams();
  const piantinaId = params.piantinaId as string;
  const token = params.token as string;
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedPuntoId = searchParams.get("punto");
  const selectedFotoIndex = parseInt(searchParams.get("foto") ?? "0", 10) || 0;
  const compareMode = searchParams.get("cmp") === "1";
  const compareFotoIndex = parseInt(searchParams.get("cmpFoto") ?? "0", 10) || 0;
  const leftLocked = searchParams.get("lockL") === "1";
  const rightLocked = searchParams.get("lockR") === "1";

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) sp.delete(key);
        else sp.set(key, value);
      }
      const qs = sp.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams]
  );

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [compareDateDropdownOpen, setCompareDateDropdownOpen] = useState(false);
  const [dateDropdownOpenLeft, setDateDropdownOpenLeft] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const leftViewerRef = useRef<SyncedViewer360Handle>(null);
  const rightViewerRef = useRef<SyncedViewer360Handle>(null);

  const { data, loading } = useQuery(GET_PIANTINA, { variables: { id: piantinaId } });
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

  // Auto-select più recente
  useEffect(() => {
    if (selectedPuntoId || puntiDiScatto.length === 0) return;
    let bestPunto: Punto | null = null;
    let bestTime = -Infinity;
    for (const p of puntiDiScatto) {
      for (const f of p.foto360) {
        const t = safeDate(f.timestamp).getTime();
        if (t > bestTime) { bestTime = t; bestPunto = p; }
      }
    }
    const target = bestPunto ?? puntiDiScatto[0];
    if (target) updateParams({ punto: target.id, foto: "0" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puntiDiScatto.length]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
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

  const leftLockedRef = useRef(false);
  const rightLockedRef = useRef(false);
  useEffect(() => { leftLockedRef.current = leftLocked; }, [leftLocked]);
  useEffect(() => { rightLockedRef.current = rightLocked; }, [rightLocked]);

  const lastLeftPosRef = useRef({ lon: 0, lat: 0 });
  const lastRightPosRef = useRef({ lon: 0, lat: 0 });

  const handleLeftRotate = useCallback((lon: number, lat: number) => {
    const dLon = lon - lastLeftPosRef.current.lon;
    const dLat = lat - lastLeftPosRef.current.lat;
    lastLeftPosRef.current = { lon, lat };
    if (rightLockedRef.current) return;
    const rc = rightViewerRef.current?.getCamera() ?? lastRightPosRef.current;
    const newLon = rc.lon + dLon;
    const newLat = Math.max(-85, Math.min(85, rc.lat + dLat));
    rightViewerRef.current?.setCamera(newLon, newLat);
    lastRightPosRef.current = { lon: newLon, lat: newLat };
  }, []);

  const handleRightRotate = useCallback((lon: number, lat: number) => {
    const dLon = lon - lastRightPosRef.current.lon;
    const dLat = lat - lastRightPosRef.current.lat;
    lastRightPosRef.current = { lon, lat };
    if (leftLockedRef.current) return;
    const lc = leftViewerRef.current?.getCamera() ?? lastLeftPosRef.current;
    const newLon = lc.lon + dLon;
    const newLat = Math.max(-85, Math.min(85, lc.lat + dLat));
    leftViewerRef.current?.setCamera(newLon, newLat);
    lastLeftPosRef.current = { lon: newLon, lat: newLat };
  }, []);

  const toggleLockPreservingPositions = useCallback((side: "left" | "right") => {
    const ln = leftViewerRef.current?.getCamera() ?? lastLeftPosRef.current;
    const rn = rightViewerRef.current?.getCamera() ?? lastRightPosRef.current;
    lastLeftPosRef.current = ln;
    lastRightPosRef.current = rn;
    if (side === "left") updateParams({ lockL: leftLocked ? null : "1" });
    else updateParams({ lockR: rightLocked ? null : "1" });
    requestAnimationFrame(() => {
      leftViewerRef.current?.setCamera(ln.lon, ln.lat);
      rightViewerRef.current?.setCamera(rn.lon, rn.lat);
    });
  }, [leftLocked, rightLocked, updateParams]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ height: "calc(100vh - 56px)", background: "#000" }}
      >
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: "var(--accent)" }} />
      </div>
    );
  }
  if (!piantina) {
    return <div className="card mx-4 mt-6">Piantina non trovata</div>;
  }

  const isCompareSplit = compareMode && currentFoto && currentCompareFoto;
  const hasCurrentFoto = !!currentFoto;
  const cantiereId = piantina.cantiereId;

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        height: "calc(100vh - 56px)",
        width: "100%",
        overflow: "hidden",
        background: "#000",
      }}
    >
      {/* Back to share home */}
      <Link
        href={`/share/${token}`}
        className="absolute z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity"
        style={{
          top: 12,
          left: 12,
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          backdropFilter: "blur(8px)",
          textDecoration: "none",
        }}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Cantiere
      </Link>

      {hasCurrentFoto && !isCompareSplit && (
        <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
          <EmbeddedViewer360
            foto={selectedFotoSorted}
            currentIndex={selectedFotoIndex}
            onIndexChange={(idx) => updateParams({ foto: String(idx) })}
            hideTimeTravelPanel
            hideNoteButton
          />
        </div>
      )}

      {isCompareSplit && (
        <div style={{ position: "absolute", inset: 0, zIndex: 1, display: "flex" }}>
          <div style={{ flex: 1, position: "relative", borderRight: "2px solid rgba(255,255,255,0.2)" }}>
            <SyncedViewer360 ref={leftViewerRef} url={currentFoto!.url} onRotate={handleLeftRotate} locked={leftLocked} />
            <div style={{ position: "absolute", bottom: 16, left: 16, zIndex: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <button
                onClick={() => toggleLockPreservingPositions("left")}
                style={{
                  background: leftLocked ? "#6366f1" : "rgba(0,0,0,0.6)",
                  border: "none", borderRadius: 999, padding: "6px 12px", color: "#fff",
                  fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                  backdropFilter: "blur(8px)",
                }}
              >
                {leftLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                {leftLocked ? "Bloccato" : "Blocca"}
              </button>
              <div style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", borderRadius: 10, padding: "8px 12px", color: "#fff", fontSize: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>{selectedPunto?.nome}</div>
                <DateDropdown
                  fotos={selectedFotoSorted}
                  selectedIndex={selectedFotoIndex}
                  onSelect={(idx) => updateParams({ foto: String(idx) })}
                  open={dateDropdownOpenLeft}
                  onToggle={() => setDateDropdownOpenLeft(!dateDropdownOpenLeft)}
                  openUpward
                  darkTheme
                />
              </div>
            </div>
          </div>
          <div style={{ flex: 1, position: "relative" }}>
            <SyncedViewer360 ref={rightViewerRef} url={currentCompareFoto!.url} onRotate={handleRightRotate} locked={rightLocked} />
            <div style={{ position: "absolute", bottom: 16, right: 16, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <button
                onClick={() => toggleLockPreservingPositions("right")}
                style={{
                  background: rightLocked ? "#6366f1" : "rgba(0,0,0,0.6)",
                  border: "none", borderRadius: 999, padding: "6px 12px", color: "#fff",
                  fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                  backdropFilter: "blur(8px)",
                }}
              >
                {rightLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                {rightLocked ? "Bloccato" : "Blocca"}
              </button>
              <div style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", borderRadius: 10, padding: "8px 12px", color: "#fff", fontSize: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>{selectedPunto?.nome}</div>
                <DateDropdown
                  fotos={selectedFotoSorted}
                  selectedIndex={compareFotoIndex}
                  onSelect={(idx) => updateParams({ cmpFoto: String(idx) })}
                  open={compareDateDropdownOpen}
                  onToggle={() => setCompareDateDropdownOpen(!compareDateDropdownOpen)}
                  openUpward
                  darkTheme
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {!hasCurrentFoto && !isCompareSplit && (
        <div
          style={{
            position: "absolute", inset: 0, zIndex: 1, display: "flex",
            flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#111",
          }}
        >
          <Camera className="w-16 h-16" style={{ color: "rgba(255,255,255,0.15)", marginBottom: 16 }} />
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 16, fontWeight: 500, marginBottom: 4 }}>
            Nessuna foto 360 disponibile
          </p>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
            Seleziona un punto dalla mappa
          </p>
        </div>
      )}

      {/* Toolbar topright (solo Confronta + Fullscreen — niente Note/Upload in readonly) */}
      <div
        style={{
          position: "absolute", top: 12, right: 12, zIndex: 30,
          display: "flex", gap: 8, alignItems: "flex-start",
        }}
      >
        <button
          onClick={handleToggleCompare}
          disabled={selectedFotoSorted.length < 2}
          style={{
            background: compareMode ? "#6366f1" : "rgba(0,0,0,0.6)", color: "#fff",
            border: "none", borderRadius: 999, padding: "8px 16px",
            fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
            cursor: selectedFotoSorted.length >= 2 ? "pointer" : "not-allowed",
            backdropFilter: "blur(8px)", opacity: selectedFotoSorted.length >= 2 ? 1 : 0.4,
            whiteSpace: "nowrap",
          }}
        >
          <Columns2 className="w-4 h-4" />
          {compareMode ? "Esci confronto" : "Confronta"}
        </button>
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? "Esci fullscreen" : "Schermo intero"}
          style={{
            background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 999,
            width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "#fff", backdropFilter: "blur(8px)",
          }}
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {compareMode && selectedFotoSorted.length < 2 && (
        <div
          style={{
            position: "absolute", top: 60, left: "50%", transform: "translateX(-50%)", zIndex: 40,
            background: "rgba(239,68,68,0.9)", backdropFilter: "blur(8px)", borderRadius: 999,
            padding: "8px 20px", color: "#fff", fontSize: 13, fontWeight: 500,
          }}
        >
          Servono almeno 2 foto per confrontare
        </div>
      )}

      {/* Widget piantina sidebar — funziona in readonly grazie al ReadOnlyContext */}
      <PiantinaSidebarWidget cantiereId={cantiereId} piantinaId={piantinaId} />
    </div>
  );
}
