"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@apollo/client";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
  Check,
  X,
  Plus,
} from "lucide-react";
import PiantinaCanvas from "./PiantinaCanvas";
import DateDropdown from "./DateDropdown";
import ConfirmDialog from "@/components/ConfirmDialog";
import { GET_PIANTINA, ME } from "@/graphql/queries";
import {
  ELIMINA_PUNTO_DI_SCATTO,
  RINOMINA_PUNTO_DI_SCATTO,
  ELIMINA_FOTO360,
  AGGIUNGI_PUNTO_DI_SCATTO,
  SPOSTA_PUNTO_DI_SCATTO,
  AGGIORNA_DATA_FOTO360,
  AGGIORNA_DATA_PUNTO_DI_SCATTO,
  AGGIORNA_DIMENSIONE_PUNTO,
  IMPOSTA_DIMENSIONE_TUTTI_PUNTI,
} from "@/graphql/mutations";
import { safeDate } from "@/lib/dateUtils";
import { useIsReadOnly } from "@/lib/readOnly";

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
  dimensione?: string;
  createdAt?: string;
  foto360: Foto[];
}

const DIMENSIONI_PUNTO: { key: string; label: string }[] = [
  { key: "PICCOLO", label: "Piccolo" },
  { key: "MEDIO", label: "Medio" },
  { key: "GRANDE", label: "Grande" },
  { key: "XL", label: "XL" },
];

/** Selettore segmentato per la dimensione del marker. */
function DimensioneSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {DIMENSIONI_PUNTO.map((d) => {
        const active = (value || "MEDIO") === d.key;
        return (
          <button
            key={d.key}
            type="button"
            onClick={() => onChange(d.key)}
            style={{
              flex: 1,
              fontSize: 11,
              fontWeight: 600,
              padding: "5px 4px",
              borderRadius: 8,
              border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
              background: active ? "var(--accent)" : "var(--surface)",
              color: active ? "#fff" : "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
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

// Anchor sopra il bottone Esci del sidebar (~50px Esci + padding)
const BOTTOM_ANCHOR = 70;
const LEFT_ANCHOR = 12;

const PANEL_MIN_W = 240;
const PANEL_MIN_H = 320;
const PANEL_DEFAULT_W = 260;
const PANEL_DEFAULT_H = 440;
const STORAGE_KEY = "piantina-sidebar-widget-size";

export default function PiantinaSidebarWidget({
  cantiereId,
  piantinaId,
}: PiantinaSidebarWidgetProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isReadOnly = useIsReadOnly();

  // Capabilities: edit-anything (add punto, modifica posizioni, rename,
  // delete punto, delete foto) è permesso SOLO agli ADMIN.
  // - share mode (isReadOnly=true) → no
  // - utente CAPO_CANTIERE loggato → no (vede solo, non modifica)
  // - admin loggato → sì
  // La query ME è skip in share mode per evitare errori UNAUTHENTICATED.
  const { data: meData } = useQuery(ME, { skip: isReadOnly });
  const canEdit = !isReadOnly && meData?.me?.role === "ADMIN";

  // ── URL-driven state (single source of truth) ─────────────────────────────
  const selectedPuntoId = searchParams.get("punto");
  const selectedFotoIndex = parseInt(searchParams.get("foto") ?? "0", 10) || 0;
  const addingPunto = canEdit && searchParams.get("addP") === "1";
  const editingPositions = canEdit && searchParams.get("edit") === "1";

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
  const [editingPuntoDate, setEditingPuntoDate] = useState(false);
  const [puntoDateValue, setPuntoDateValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteFotoId, setConfirmDeleteFotoId] = useState<string | null>(null);
  const [pendingCoords, setPendingCoords] = useState<{ x: number; y: number } | null>(null);
  const [nuovoPuntoNome, setNuovoPuntoNome] = useState("");
  const [nuovoPuntoDimensione, setNuovoPuntoDimensione] = useState("MEDIO");

  // ── Resize state (with localStorage hydration) ────────────────────────────
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_W);
  const [panelHeight, setPanelHeight] = useState(PANEL_DEFAULT_H);
  const resizeRef = useRef<{
    mode: "top" | "right" | "corner";
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { w?: number; h?: number };
      if (typeof parsed.w === "number") setPanelWidth(parsed.w);
      if (typeof parsed.h === "number") setPanelHeight(parsed.h);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ w: panelWidth, h: panelHeight })
    );
  }, [panelWidth, panelHeight]);

  const startResize = useCallback(
    (mode: "top" | "right" | "corner") =>
      (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        resizeRef.current = {
          mode,
          startX: e.clientX,
          startY: e.clientY,
          startW: panelWidth,
          startH: panelHeight,
        };

        const onMove = (ev: MouseEvent) => {
          const r = resizeRef.current;
          if (!r) return;
          const maxW = Math.max(PANEL_MIN_W, window.innerWidth - 40);
          // Max height: viewport minus bottom anchor + a bit of top padding
          const maxH = Math.max(PANEL_MIN_H, window.innerHeight - BOTTOM_ANCHOR - 40);
          if (r.mode === "right" || r.mode === "corner") {
            const w = Math.min(maxW, Math.max(PANEL_MIN_W, r.startW + (ev.clientX - r.startX)));
            setPanelWidth(w);
          }
          if (r.mode === "top" || r.mode === "corner") {
            // Crescere verso l'alto = aumentare height (l'ancoraggio è il bottom)
            const h = Math.min(maxH, Math.max(PANEL_MIN_H, r.startH + (r.startY - ev.clientY)));
            setPanelHeight(h);
          }
        };
        const onUp = () => {
          resizeRef.current = null;
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
          document.body.style.userSelect = "";
          document.body.style.cursor = "";
        };
        document.body.style.userSelect = "none";
        document.body.style.cursor =
          mode === "right" ? "ew-resize" : mode === "top" ? "ns-resize" : "nesw-resize";
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      },
    [panelWidth, panelHeight]
  );

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data, refetch } = useQuery(GET_PIANTINA, { variables: { id: piantinaId } });
  const piantina = data?.piantina;
  const punti: Punto[] = piantina?.puntiDiScatto ?? [];

  const selectedPunto = useMemo(
    () => punti.find((p) => p.id === selectedPuntoId) ?? null,
    [punti, selectedPuntoId]
  );

  // Dimensione condivisa da TUTTI i punti (per evidenziarla nel selettore di
  // massa); "" se i punti hanno dimensioni miste.
  const dimensioneComune = useMemo(() => {
    if (punti.length === 0) return "MEDIO";
    const first = punti[0].dimensione ?? "MEDIO";
    return punti.every((p) => (p.dimensione ?? "MEDIO") === first) ? first : "";
  }, [punti]);

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
  const [eliminaPuntoMutation] = useMutation(ELIMINA_PUNTO_DI_SCATTO, {
    onCompleted: () => {
      refetch();
      if (selectedPuntoId === confirmDeleteId) {
        updateParams({ punto: null, foto: null });
      }
      setConfirmDeleteId(null);
    },
  });
  const [rinominaPuntoMutation] = useMutation(RINOMINA_PUNTO_DI_SCATTO, {
    onCompleted: () => { refetch(); setRenaming(false); },
  });
  const [eliminaFoto] = useMutation(ELIMINA_FOTO360, {
    onCompleted: () => refetch(),
  });
  const [aggiungiPuntoMutation] = useMutation(AGGIUNGI_PUNTO_DI_SCATTO, {
    onCompleted: () => {
      refetch();
      setPendingCoords(null);
      setNuovoPuntoNome("");
      setNuovoPuntoDimensione("MEDIO");
      updateParams({ addP: null });
    },
  });
  const [aggiornaDimensione] = useMutation(AGGIORNA_DIMENSIONE_PUNTO, {
    onCompleted: () => refetch(),
  });
  const [impostaDimensioneTutti] = useMutation(IMPOSTA_DIMENSIONE_TUTTI_PUNTI, {
    onCompleted: () => refetch(),
  });
  const [spostaPunto] = useMutation(SPOSTA_PUNTO_DI_SCATTO, {
    onCompleted: () => refetch(),
  });

  const handleDeleteFoto = useCallback((fotoId: string) => {
    setConfirmDeleteFotoId(fotoId); // apre il popup di conferma
  }, []);

  const [aggiornaDataFoto] = useMutation(AGGIORNA_DATA_FOTO360, {
    onCompleted: () => refetch(),
  });
  const handleEditFotoDate = useCallback((fotoId: string, isoDate: string) => {
    aggiornaDataFoto({ variables: { id: fotoId, data: isoDate } });
  }, [aggiornaDataFoto]);

  const [aggiornaDataPunto] = useMutation(AGGIORNA_DATA_PUNTO_DI_SCATTO, {
    onCompleted: () => { refetch(); setEditingPuntoDate(false); },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handlePuntoClick = useCallback((puntoId: string) => {
    if (addingPunto) {
      // exit adding mode and switch to clicked punto
      updateParams({ addP: null, punto: puntoId, foto: "0" });
      setPendingCoords(null);
      return;
    }
    if (puntoId === selectedPuntoId) return;
    // Smart date follow
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
  }, [addingPunto, selectedPuntoId, punti, currentFoto, updateParams]);

  const handleCanvasClick = useCallback((x: number, y: number) => {
    if (addingPunto) {
      setPendingCoords({ x, y });
    }
  }, [addingPunto]);

  const handleDragEnd = useCallback((puntoId: string, x: number, y: number) => {
    spostaPunto({ variables: { id: puntoId, x, y } });
  }, [spostaPunto]);

  const handleAddPunto = () => {
    if (!pendingCoords || !nuovoPuntoNome.trim()) return;
    aggiungiPuntoMutation({
      variables: {
        piantinaId,
        nome: nuovoPuntoNome.trim(),
        x: pendingCoords.x,
        y: pendingCoords.y,
        dimensione: nuovoPuntoDimensione,
      },
    });
  };

  if (!piantina) return null;

  return (
    <>
      <div
        style={{
          position: "fixed",
          bottom: BOTTOM_ANCHOR,
          left: LEFT_ANCHOR,
          width: panelWidth,
          height: collapsed ? undefined : panelHeight,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "0 12px 32px rgba(0,0,0,0.14)",
          display: "flex",
          flexDirection: "column",
          zIndex: 50,
          overflow: "hidden",
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{
            background: "var(--surface)",
            borderBottom: collapsed ? "none" : "1px solid var(--border)",
            flexShrink: 0,
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
            {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {!collapsed && (
          <>
            {/* ── Mini-toolbar (add / edit) — solo per admin ──────────────── */}
            {canEdit && (
              <div
                className="flex items-center gap-1 px-2 py-1.5"
                style={{
                  background: "var(--surface)",
                  borderBottom: "1px solid var(--border)",
                  flexShrink: 0,
                }}
              >
                <button
                  onClick={() => updateParams({ addP: addingPunto ? null : "1", edit: null })}
                  title={addingPunto ? "Annulla aggiunta" : "Aggiungi punto"}
                  style={{
                    flex: 1,
                    background: addingPunto ? "#6366f1" : "transparent",
                    border: addingPunto ? "1px solid #6366f1" : "1px solid var(--border)",
                    color: addingPunto ? "#fff" : "var(--text-muted)",
                    borderRadius: 8,
                    padding: "4px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    cursor: "pointer",
                  }}
                >
                  <Plus className="w-3 h-3" />
                  {addingPunto ? "Annulla" : "Aggiungi"}
                </button>
                <button
                  onClick={() => updateParams({ edit: editingPositions ? null : "1", addP: null })}
                  title={editingPositions ? "Fine modifica" : "Modifica posizioni"}
                  style={{
                    flex: 1,
                    background: editingPositions ? "#6366f1" : "transparent",
                    border: editingPositions ? "1px solid #6366f1" : "1px solid var(--border)",
                    color: editingPositions ? "#fff" : "var(--text-muted)",
                    borderRadius: 8,
                    padding: "4px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    cursor: "pointer",
                  }}
                >
                  <Pencil className="w-3 h-3" />
                  {editingPositions ? "Fine" : "Modifica"}
                </button>
              </div>
            )}

            {/* ── Dimensione di TUTTI i punti (impostazione di massa) ──────── */}
            {canEdit && punti.length > 0 && (
              <div
                className="px-2 py-1.5"
                style={{
                  background: "var(--surface)",
                  borderBottom: "1px solid var(--border)",
                  flexShrink: 0,
                }}
              >
                <div className="section-label" style={{ marginBottom: 4 }}>
                  Dimensione di tutti i punti
                </div>
                <DimensioneSelector
                  value={dimensioneComune}
                  onChange={(v) =>
                    impostaDimensioneTutti({ variables: { piantinaId, dimensione: v } })
                  }
                />
              </div>
            )}

            {/* ── Canvas (flex-grow, supports pan/zoom) ───────────────────── */}
            <div
              style={{
                width: "100%",
                flex: 1,
                minHeight: 0,
                overflow: "hidden",
                borderBottom: "1px solid var(--border)",
                position: "relative",
              }}
            >
              <PiantinaCanvas
                piantinaId={piantinaId}
                fileUrl={piantina.fileUrl}
                larghezza={piantina.larghezza}
                altezza={piantina.altezza}
                puntiDiScatto={punti}
                selectedPuntoId={selectedPuntoId}
                onPuntoDragEnd={handleDragEnd}
                onCanvasClick={handleCanvasClick}
                onPuntoClick={handlePuntoClick}
                leftClickPans
                editModeExternal={editingPositions}
                dateStatusByPuntoId={dateStatusByPuntoId}
              />
              {/* Hint banner per addingPunto */}
              {addingPunto && !pendingCoords && (
                <div
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{
                    bottom: 8,
                    background: "rgba(99,102,241,0.95)",
                    color: "#fff",
                    borderRadius: 999,
                    padding: "4px 12px",
                    fontSize: 11,
                    fontWeight: 500,
                    backdropFilter: "blur(8px)",
                    pointerEvents: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  Click per posizionare
                </div>
              )}
            </div>

            {/* ── Selected punto info + actions ───────────────────────────── */}
            {selectedPunto ? (
              <div
                className="px-3 py-2"
                style={{ background: "var(--surface)", flexShrink: 0 }}
              >
                <div className="flex items-center gap-2 mb-2">
                  {renaming ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && renameValue.trim()) {
                            rinominaPuntoMutation({ variables: { id: selectedPunto.id, nome: renameValue.trim() } });
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
                            rinominaPuntoMutation({ variables: { id: selectedPunto.id, nome: renameValue.trim() } });
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
                      {canEdit && (
                        <div className="flex gap-0.5 flex-shrink-0">
                          <button
                            onClick={() => { setRenaming(true); setRenameValue(selectedPunto.nome); }}
                            title="Rinomina"
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 3, display: "flex" }}
                          >
                            <Pencil className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(selectedPunto.id)}
                            title="Elimina punto"
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 3, display: "flex" }}
                          >
                            <Trash2 className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Data del punto (createdAt) — modificabile dagli editor */}
                {canEdit && (
                  <div className="flex items-center gap-1 mb-2" style={{ fontSize: 11 }}>
                    {editingPuntoDate ? (
                      <>
                        <input
                          type="date"
                          autoFocus
                          value={puntoDateValue}
                          onChange={(e) => setPuntoDateValue(e.target.value)}
                          style={{ fontSize: 11, border: "1px solid var(--border)", borderRadius: 4, padding: "2px 6px" }}
                        />
                        <button
                          onClick={() => {
                            if (puntoDateValue) {
                              const iso = new Date(puntoDateValue).toISOString();
                              if (!isNaN(new Date(puntoDateValue).getTime()))
                                aggiornaDataPunto({ variables: { id: selectedPunto.id, data: iso } });
                            }
                          }}
                          title="Salva data punto"
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex" }}
                        >
                          <Check className="w-3 h-3" style={{ color: "#22c55e" }} />
                        </button>
                        <button
                          onClick={() => setEditingPuntoDate(false)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex" }}
                        >
                          <X className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ color: "var(--text-muted)" }}>
                          Data punto:{" "}
                          {selectedPunto.createdAt
                            ? safeDate(selectedPunto.createdAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })
                            : "—"}
                        </span>
                        <button
                          onClick={() => {
                            setEditingPuntoDate(true);
                            const d = selectedPunto.createdAt ? safeDate(selectedPunto.createdAt) : new Date();
                            const p = (n: number) => String(n).padStart(2, "0");
                            setPuntoDateValue(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
                          }}
                          title="Modifica data punto"
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", opacity: 0.5 }}
                        >
                          <Pencil className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Dimensione del marker del punto */}
                {canEdit && (
                  <div className="mb-2">
                    <div className="section-label" style={{ marginBottom: 4 }}>
                      Dimensione marker
                    </div>
                    <DimensioneSelector
                      value={selectedPunto.dimensione ?? "MEDIO"}
                      onChange={(v) =>
                        aggiornaDimensione({ variables: { id: selectedPunto.id, dimensione: v } })
                      }
                    />
                  </div>
                )}

                {sortedFoto.length > 0 && (
                  <DateDropdown
                    fotos={sortedFoto}
                    selectedIndex={selectedFotoIndex}
                    onSelect={(idx) => updateParams({ foto: String(idx) })}
                    open={dateOpen}
                    onToggle={() => setDateOpen(!dateOpen)}
                    onDelete={canEdit ? handleDeleteFoto : undefined}
                    onEditDate={canEdit ? handleEditFotoDate : undefined}
                    openUpward
                  />
                )}
              </div>
            ) : (
              <div
                className="px-3 py-2 text-xs text-center"
                style={{ color: "var(--text-muted)", background: "var(--surface)", flexShrink: 0 }}
              >
                Seleziona un punto sulla mappa
              </div>
            )}

            {/* ── Resize handles ─────────────────────────────────────────── */}
            {/* Top edge — height only (cresce verso l'alto) */}
            <div
              onMouseDown={startResize("top")}
              title="Trascina per ridimensionare l'altezza"
              style={{
                position: "absolute",
                left: 14,
                right: 14,
                top: -3,
                height: 8,
                cursor: "ns-resize",
                zIndex: 5,
              }}
            />
            {/* Right edge — width only */}
            <div
              onMouseDown={startResize("right")}
              title="Trascina per ridimensionare la larghezza"
              style={{
                position: "absolute",
                top: 14,
                bottom: 6,
                right: -3,
                width: 8,
                cursor: "ew-resize",
                zIndex: 5,
              }}
            />
            {/* Top-right corner — free resize */}
            <div
              onMouseDown={startResize("corner")}
              title="Trascina per ridimensionare liberamente"
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                width: 16,
                height: 16,
                cursor: "nesw-resize",
                zIndex: 6,
                background:
                  "linear-gradient(45deg, transparent 0%, transparent 55%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.25) 65%, transparent 65%, transparent 75%, rgba(0,0,0,0.25) 75%, rgba(0,0,0,0.25) 85%, transparent 85%)",
                borderTopRightRadius: 12,
              }}
            />
          </>
        )}
      </div>

      {/* ── Add punto dialog (modal sopra il widget) ───────────────────── */}
      {addingPunto && pendingCoords && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
        >
          <div className="card w-full max-w-sm">
            <h3 className="font-semibold mb-4">Nuovo punto di scatto</h3>
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
              Posizione: {pendingCoords.x.toFixed(1)}%, {pendingCoords.y.toFixed(1)}%
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
                  setNuovoPuntoNome("");
                }
              }}
            />
            <label className="section-label" style={{ display: "block", marginBottom: 6 }}>
              Dimensione marker
            </label>
            <div className="mb-4">
              <DimensioneSelector value={nuovoPuntoDimensione} onChange={setNuovoPuntoDimensione} />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setPendingCoords(null);
                  setNuovoPuntoNome("");
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
                <Check className="w-4 h-4" />
                Aggiungi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup conferma eliminazione punto */}
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Elimina punto"
        message="Sei sicuro di voler cancellare questo punto? Verranno eliminate anche tutte le sue foto. L'operazione non è reversibile."
        confirmLabel="Sì, confermo"
        cancelLabel="Annulla"
        onConfirm={() => {
          if (confirmDeleteId) eliminaPuntoMutation({ variables: { id: confirmDeleteId } });
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {/* Popup conferma eliminazione scatto */}
      <ConfirmDialog
        open={!!confirmDeleteFotoId}
        title="Elimina scatto"
        message="Sei sicuro di voler cancellare questo scatto? L'operazione non è reversibile."
        confirmLabel="Sì, confermo"
        cancelLabel="Annulla"
        onConfirm={() => {
          if (confirmDeleteFotoId) eliminaFoto({ variables: { id: confirmDeleteFotoId } });
          setConfirmDeleteFotoId(null);
        }}
        onCancel={() => setConfirmDeleteFotoId(null)}
      />
    </>
  );
}
