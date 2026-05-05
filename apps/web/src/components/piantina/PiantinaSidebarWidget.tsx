"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@apollo/client";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import PiantinaCanvas from "./PiantinaCanvas";
import DateDropdown from "./DateDropdown";
import { GET_PIANTINA } from "@/graphql/queries";
import {
  ELIMINA_PUNTO_DI_SCATTO,
  RINOMINA_PUNTO_DI_SCATTO,
  ELIMINA_FOTO360,
} from "@/graphql/mutations";
import { safeDate } from "@/lib/dateUtils";

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

function sortFotoDesc(fotos: Foto[]): Foto[] {
  return [...fotos].sort((a, b) => {
    const diff = safeDate(b.timestamp).getTime() - safeDate(a.timestamp).getTime();
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
}

interface PiantinaSidebarWidgetProps {
  cantiereId: string;
  piantinaId: string;
}

export default function PiantinaSidebarWidget({
  cantiereId,
  piantinaId,
}: PiantinaSidebarWidgetProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── URL-driven state (single source of truth) ─────────────────────────────
  const selectedPuntoId = searchParams.get("punto");
  const selectedFotoIndex = parseInt(searchParams.get("foto") ?? "0", 10) || 0;

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

  // ── Local UI state ────────────────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data, refetch } = useQuery(GET_PIANTINA, { variables: { id: piantinaId } });
  const piantina = data?.piantina;
  const punti: Punto[] = piantina?.puntiDiScatto ?? [];

  const selectedPunto = useMemo(
    () => punti.find((p) => p.id === selectedPuntoId) ?? null,
    [punti, selectedPuntoId]
  );

  const sortedFoto = useMemo(
    () => (selectedPunto ? sortFotoDesc(selectedPunto.foto360) : []),
    [selectedPunto]
  );

  const currentFoto = sortedFoto[selectedFotoIndex] ?? null;

  // ── Date status map (per coloring marker) ─────────────────────────────────
  const dateStatusByPuntoId = useMemo<Record<string, "same" | "before" | "after">>(() => {
    if (!currentFoto) return {};
    const ref = safeDate(currentFoto.timestamp);
    const refKey = `${ref.getFullYear()}-${ref.getMonth()}-${ref.getDate()}`;
    const result: Record<string, "same" | "before" | "after"> = {};
    for (const p of punti) {
      if (p.foto360.length === 0) continue;
      let hasSame = false, hasBefore = false, hasAfter = false;
      for (const f of p.foto360) {
        const d = safeDate(f.timestamp);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (key === refKey) hasSame = true;
        else if (d.getTime() < ref.getTime()) hasBefore = true;
        else hasAfter = true;
      }
      if (hasSame) result[p.id] = "same";
      else if (hasAfter) result[p.id] = "after";
      else if (hasBefore) result[p.id] = "before";
    }
    return result;
  }, [punti, currentFoto]);

  // ── Auto-select most recent punto with photos on mount ────────────────────
  useEffect(() => {
    if (selectedPuntoId || punti.length === 0) return;
    let bestPunto: Punto | null = null;
    let bestTime = -Infinity;
    for (const p of punti) {
      for (const f of p.foto360) {
        const t = safeDate(f.timestamp).getTime();
        if (t > bestTime) { bestTime = t; bestPunto = p; }
      }
    }
    const target = bestPunto ?? punti[0];
    if (target) updateParams({ punto: target.id, foto: "0" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [punti.length]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const [eliminaPunto] = useMutation(ELIMINA_PUNTO_DI_SCATTO, {
    onCompleted: () => {
      refetch();
      if (selectedPuntoId === confirmDeleteId) {
        updateParams({ punto: null, foto: null });
      }
      setConfirmDeleteId(null);
    },
  });
  const [rinominaPunto] = useMutation(RINOMINA_PUNTO_DI_SCATTO, {
    onCompleted: () => { refetch(); setRenaming(false); },
  });
  const [eliminaFoto] = useMutation(ELIMINA_FOTO360, {
    onCompleted: () => refetch(),
  });

  const handleDeleteFoto = useCallback((fotoId: string) => {
    eliminaFoto({ variables: { id: fotoId } });
  }, [eliminaFoto]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handlePuntoClick = useCallback((puntoId: string) => {
    if (puntoId === selectedPuntoId) return;
    // Smart date following: pick closest foto to current
    const punto = punti.find((p) => p.id === puntoId);
    let nextFotoIdx = 0;
    if (punto && punto.foto360.length > 0 && currentFoto) {
      const refTime = safeDate(currentFoto.timestamp).getTime();
      const sorted = sortFotoDesc(punto.foto360);
      let bestIdx = 0;
      let bestDiff = Infinity;
      sorted.forEach((f, i) => {
        const d = Math.abs(safeDate(f.timestamp).getTime() - refTime);
        if (d < bestDiff) { bestDiff = d; bestIdx = i; }
      });
      nextFotoIdx = bestIdx;
    }
    updateParams({ punto: puntoId, foto: String(nextFotoIdx) });
  }, [selectedPuntoId, punti, currentFoto, updateParams]);

  const handleOpenFullScreen = useCallback(() => {
    updateParams({ map: "1" });
  }, [updateParams]);

  if (!piantina) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{
          background: "var(--surface)",
          borderBottom: collapsed ? "none" : "1px solid var(--border)",
        }}
      >
        <Link
          href={`/dashboard/cantieri/${cantiereId}`}
          className="flex items-center gap-2 min-w-0"
          style={{
            color: "var(--text)",
            textDecoration: "none",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <ArrowLeft className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{piantina.nome}</span>
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 2,
            display: "flex",
            alignItems: "center",
            color: "var(--text-muted)",
          }}
        >
          {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* ── Mini-map (clickable to open full-screen) ────────────────── */}
          <div
            className="relative group cursor-pointer"
            onClick={(e) => {
              // Only open full-screen if click hits the canvas background, not a marker
              const target = e.target as HTMLElement;
              if (!target.closest("[data-marker]")) handleOpenFullScreen();
            }}
            style={{
              width: "100%",
              aspectRatio: "1 / 1",
              overflow: "hidden",
              position: "relative",
              borderBottom: "1px solid var(--border)",
            }}
            title="Click per ingrandire"
          >
            <PiantinaCanvas
              piantinaId={piantinaId}
              fileUrl={piantina.fileUrl}
              larghezza={piantina.larghezza}
              altezza={piantina.altezza}
              puntiDiScatto={punti}
              selectedPuntoId={selectedPuntoId}
              onPuntoDragEnd={() => { /* no drag in mini-map */ }}
              onCanvasClick={() => handleOpenFullScreen()}
              onPuntoClick={handlePuntoClick}
              dateStatusByPuntoId={dateStatusByPuntoId}
            />

            {/* Hover hint overlay */}
            <div
              className="absolute inset-0 pointer-events-none flex items-end justify-end p-2 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                background: "linear-gradient(to top, rgba(0,0,0,0.15), transparent 40%)",
              }}
            >
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium"
                style={{
                  background: "rgba(17,24,39,0.85)",
                  color: "#fff",
                  backdropFilter: "blur(4px)",
                }}
              >
                <Maximize2 className="w-3 h-3" />
                Ingrandisci
              </div>
            </div>
          </div>

          {/* ── Selected punto info + actions ───────────────────────────── */}
          {selectedPunto ? (
            <div className="px-4 py-2.5" style={{ background: "var(--surface)" }}>
              {/* Punto name row */}
              <div className="flex items-center gap-2 mb-2">
                {renaming ? (
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && renameValue.trim()) {
                          rinominaPunto({ variables: { id: selectedPunto.id, nome: renameValue.trim() } });
                        }
                        if (e.key === "Escape") setRenaming(false);
                      }}
                      className="flex-1 min-w-0"
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        padding: "2px 6px",
                        outline: "none",
                      }}
                    />
                    <button
                      onClick={() => {
                        if (renameValue.trim())
                          rinominaPunto({ variables: { id: selectedPunto.id, nome: renameValue.trim() } });
                      }}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex" }}
                    >
                      <Check className="w-3.5 h-3.5" style={{ color: "#22c55e" }} />
                    </button>
                    <button
                      onClick={() => setRenaming(false)}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex" }}
                    >
                      <X className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="text-xs font-semibold truncate flex-1" style={{ color: "var(--text)" }}>
                      {selectedPunto.nome}
                    </span>
                    <span className="text-xs flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                      {selectedPunto.foto360.length} foto
                    </span>
                    <div className="flex gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => { setRenaming(true); setRenameValue(selectedPunto.nome); }}
                        title="Rinomina"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 3, display: "flex" }}
                      >
                        <Pencil className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                      </button>
                      {confirmDeleteId === selectedPunto.id ? (
                        <>
                          <button
                            onClick={() => eliminaPunto({ variables: { id: selectedPunto.id } })}
                            title="Conferma elimina"
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 3, display: "flex" }}
                          >
                            <Check className="w-3 h-3" style={{ color: "#ef4444" }} />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 3, display: "flex" }}
                          >
                            <X className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(selectedPunto.id)}
                          title="Elimina punto"
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 3, display: "flex" }}
                        >
                          <Trash2 className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Date dropdown */}
              {sortedFoto.length > 0 && (
                <DateDropdown
                  fotos={sortedFoto}
                  selectedIndex={selectedFotoIndex}
                  onSelect={(idx) => updateParams({ foto: String(idx) })}
                  open={dateOpen}
                  onToggle={() => setDateOpen(!dateOpen)}
                  onDelete={handleDeleteFoto}
                  openUpward
                />
              )}
            </div>
          ) : (
            <div
              className="px-4 py-3 text-xs text-center"
              style={{ color: "var(--text-muted)", background: "var(--surface)" }}
            >
              Seleziona un punto sulla mappa
            </div>
          )}
        </>
      )}
    </div>
  );
}
