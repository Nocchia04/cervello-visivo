# Piantina 360 Viewer Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the piantina page so the 360° viewer is the main content area with a floating minimap overlay, date dropdown, and integrated compare mode — matching HoloBuilder's UX.

**Architecture:** The page becomes a fullscreen 360° viewer with a floating panel (top-left) containing a small interactive piantina minimap and date selector. Compare mode splits the viewer in two, each side showing a different punto. State management centralizes punto selection, date tracking, and smart date-following when switching points.

**Tech Stack:** Next.js 14 App Router, React, Three.js (via existing EmbeddedViewer360/SyncedViewer360), Apollo Client, Tailwind CSS, lucide-react icons.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/src/app/dashboard/cantieri/[id]/piantina/[piantinaId]/page.tsx` | **Rewrite** | Page layout, state management, minimap overlay, date dropdown, compare orchestration |
| `apps/web/src/components/piantina/PiantinaCanvas.tsx` | **Modify** | Add `leftClickPans` prop for minimap panning with left mouse drag |
| `apps/web/src/components/foto360/EmbeddedViewer360.tsx` | **Modify** | Add `hideTimeTravelPanel` prop to suppress built-in date controls |

No new files. All existing components reused.

---

## Task 1: Add `leftClickPans` prop to PiantinaCanvas

**Files:**
- Modify: `apps/web/src/components/piantina/PiantinaCanvas.tsx:20-30` (interface), `:79-85` (handleMouseDown)

The minimap needs left-click-drag to pan (currently requires Alt+drag or middle-click). Add an opt-in prop.

- [ ] **Step 1: Add prop to interface and destructure**

In `PiantinaCanvasProps`, add:
```typescript
leftClickPans?: boolean;
```

Destructure it in the component function params alongside existing props.

- [ ] **Step 2: Modify `handleMouseDown` to support left-click panning**

Change the condition from:
```typescript
if (e.button === 1 || e.altKey) {
```
to:
```typescript
if (e.button === 1 || e.altKey || (leftClickPans && e.button === 0 && !dragRef.current)) {
```

This allows left-click to pan in minimap mode while still allowing marker drag (which sets `dragRef.current` first via `onMarkerMouseDown`).

- [ ] **Step 3: Verify existing pages aren't affected**

Since `leftClickPans` defaults to `undefined`/`false`, the existing piantina page behavior is unchanged. The prop is only passed by the new page layout.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/piantina/PiantinaCanvas.tsx
git commit -m "feat(piantina): add leftClickPans prop for minimap mode"
```

---

## Task 2: Add `hideTimeTravelPanel` prop to EmbeddedViewer360

**Files:**
- Modify: `apps/web/src/components/foto360/EmbeddedViewer360.tsx:28-32` (interface), `:586-672` (time travel panel render)

The new page controls dates externally via a dropdown. The built-in floating time travel panel should be hideable.

- [ ] **Step 1: Add prop to interface**

In `EmbeddedViewer360Props`, add:
```typescript
hideTimeTravelPanel?: boolean;
```

Destructure it in the component function.

- [ ] **Step 2: Conditionally render the time travel panel**

Wrap the existing time travel panel JSX (the `{foto.length > 0 && !pendingNote && (` block at line 587) with:
```typescript
{!hideTimeTravelPanel && foto.length > 0 && !pendingNote && (
```

This hides the floating date panel, slider, and thumbnail strip when the prop is true.

- [ ] **Step 3: Verify punti/[id] page still shows time travel**

The `punti/[id]/page.tsx` doesn't pass `hideTimeTravelPanel`, so it defaults to `false` — existing behavior preserved.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/foto360/EmbeddedViewer360.tsx
git commit -m "feat(viewer360): add hideTimeTravelPanel prop"
```

---

## Task 3: Rewrite piantina page — core layout and state

**Files:**
- Rewrite: `apps/web/src/app/dashboard/cantieri/[id]/piantina/[piantinaId]/page.tsx`

This is the main task. The page becomes a fullscreen 360° viewer with floating minimap overlay.

- [ ] **Step 1: Define types, imports, and state**

```typescript
"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useParams } from "next/navigation";
import {
  ArrowLeft, X, Plus, Upload, Pencil, Check, Camera,
  Columns2, ChevronDown,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import PiantinaCanvas from "@/components/piantina/PiantinaCanvas";
import { GET_PIANTINA } from "@/graphql/queries";
import {
  AGGIUNGI_PUNTO_DI_SCATTO,
  SPOSTA_PUNTO_DI_SCATTO,
  UPLOAD_FOTO360,
  RINOMINA_PUNTO_DI_SCATTO,
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
```

- [ ] **Step 2: Write helper — find closest date in a punto**

```typescript
/** Given a reference timestamp, find the foto in `fotos` with the closest date. */
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

/** Sort foto by timestamp descending (newest first). */
function sortFotoDesc(fotos: Foto[]): Foto[] {
  return [...fotos].sort(
    (a, b) => safeDate(b.timestamp).getTime() - safeDate(a.timestamp).getTime()
  );
}
```

- [ ] **Step 3: Write UploadFotoButton (same as existing)**

Keep the existing `UploadFotoButton` component exactly as-is from the current page. Copy it verbatim — it handles file selection, upload, and mutation. No changes needed.

- [ ] **Step 4: Write the main component — state declarations**

```typescript
export default function PiantinaPage() {
  const params = useParams();
  const piantinaId = params.piantinaId as string;
  const cantiereId = params.id as string;

  // Core viewer state
  const [selectedPuntoId, setSelectedPuntoId] = useState<string | null>(null);
  const [selectedFotoIndex, setSelectedFotoIndex] = useState(0);
  const [compareMode, setCompareMode] = useState(false);
  const [comparePuntoId, setComparePuntoId] = useState<string | null>(null);
  const [compareFotoIndex, setCompareFotoIndex] = useState(0);
  const [selectingCompare, setSelectingCompare] = useState(false);

  // Add punto flow
  const [addingPunto, setAddingPunto] = useState(false);
  const [nuovoPuntoNome, setNuovoPuntoNome] = useState("");
  const [pendingCoords, setPendingCoords] = useState<{ x: number; y: number } | null>(null);

  // Minimap collapsed state
  const [minimapCollapsed, setMinimapCollapsed] = useState(false);

  // Date dropdown open
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [compareDateDropdownOpen, setCompareDateDropdownOpen] = useState(false);

  // Synced rotation refs for compare mode
  const leftViewerRef = useRef<any>(null);
  const rightViewerRef = useRef<any>(null);
  const syncEnabledRef = useRef(true);

  // GraphQL
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
```

- [ ] **Step 5: Derived state and auto-select logic**

```typescript
  // Derived: selected punto and its sorted photos
  const selectedPunto = puntiDiScatto.find((p) => p.id === selectedPuntoId);
  const selectedFotos = useMemo(
    () => (selectedPunto ? sortFotoDesc(selectedPunto.foto360) : []),
    [selectedPunto]
  );
  const currentFoto = selectedFotos[selectedFotoIndex] ?? null;

  // Derived: compare punto
  const comparePunto = puntiDiScatto.find((p) => p.id === comparePuntoId);
  const compareFotos = useMemo(
    () => (comparePunto ? sortFotoDesc(comparePunto.foto360) : []),
    [comparePunto]
  );
  const currentCompareFoto = compareFotos[compareFotoIndex] ?? null;

  // Auto-select first punto with most recent foto on initial load
  useEffect(() => {
    if (selectedPuntoId || puntiDiScatto.length === 0) return;
    // Find punto whose newest foto has the most recent timestamp
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
    // Fallback: first punto with any photos, or just first punto
    if (!bestPunto) {
      bestPunto = puntiDiScatto.find((p) => p.foto360.length > 0) ?? puntiDiScatto[0];
    }
    if (bestPunto) {
      setSelectedPuntoId(bestPunto.id);
      setSelectedFotoIndex(0); // newest first (sorted desc)
    }
  }, [puntiDiScatto, selectedPuntoId]);
```

- [ ] **Step 6: Punto selection handler with smart date following**

```typescript
  const handlePuntoClick = useCallback(
    (puntoId: string) => {
      if (addingPunto) return;

      // In compare mode, if selecting compare punto
      if (selectingCompare) {
        if (puntoId === selectedPuntoId) return; // can't compare with self
        setComparePuntoId(puntoId);
        setSelectingCompare(false);
        // Find closest date to the left side's current foto
        const cPunto = puntiDiScatto.find((p) => p.id === puntoId);
        if (cPunto && currentFoto) {
          const sorted = sortFotoDesc(cPunto.foto360);
          const idx = findClosestFotoIndex(sorted, currentFoto.timestamp);
          setCompareFotoIndex(Math.max(0, idx));
        } else {
          setCompareFotoIndex(0);
        }
        return;
      }

      // Normal mode: select punto, find closest date to current
      const newPunto = puntiDiScatto.find((p) => p.id === puntoId);
      if (newPunto) {
        const sorted = sortFotoDesc(newPunto.foto360);
        if (currentFoto && sorted.length > 0) {
          const idx = findClosestFotoIndex(sorted, currentFoto.timestamp);
          setSelectedFotoIndex(Math.max(0, idx));
        } else {
          setSelectedFotoIndex(0);
        }
      }
      setSelectedPuntoId(puntoId);
    },
    [addingPunto, selectingCompare, selectedPuntoId, puntiDiScatto, currentFoto]
  );
```

- [ ] **Step 7: Canvas and drag handlers**

```typescript
  const handleCanvasClick = useCallback(
    (x: number, y: number) => {
      if (addingPunto) {
        setPendingCoords({ x, y });
      }
    },
    [addingPunto]
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

  // Compare mode synced rotation handlers
  const handleLeftRotate = useCallback((lon: number, lat: number) => {
    if (syncEnabledRef.current) rightViewerRef.current?.setCamera(lon, lat);
  }, []);
  const handleRightRotate = useCallback((lon: number, lat: number) => {
    if (syncEnabledRef.current) leftViewerRef.current?.setCamera(lon, lat);
  }, []);

  // Toggle compare mode
  const toggleCompare = () => {
    if (compareMode) {
      setCompareMode(false);
      setComparePuntoId(null);
      setSelectingCompare(false);
    } else {
      setCompareMode(true);
      setSelectingCompare(true); // user must click a punto for the right side
    }
  };
```

- [ ] **Step 8: Commit core state logic**

```bash
git add apps/web/src/app/dashboard/cantieri/\[id\]/piantina/\[piantinaId\]/page.tsx
git commit -m "feat(piantina): rewrite page state — auto-select, smart date follow, compare mode"
```

---

## Task 4: Rewrite piantina page — JSX layout (single view)

**Files:**
- Continue: `apps/web/src/app/dashboard/cantieri/[id]/piantina/[piantinaId]/page.tsx`

- [ ] **Step 1: Loading and empty states**

```typescript
  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: "calc(100vh - 80px)" }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: "var(--accent)" }} />
      </div>
    );
  }

  if (!piantina) {
    return <div className="card">Piantina non trovata</div>;
  }

  const hasFoto = selectedFotos.length > 0;

  return (
    <div className="relative" style={{ height: "calc(100vh - 80px)" }}>
```

- [ ] **Step 2: Main 360° viewer area**

```tsx
      {/* ── 360° Viewer — fills the entire area ─────────────────────── */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden" style={{ background: "#111" }}>
        {!compareMode ? (
          /* Single view mode */
          hasFoto ? (
            <EmbeddedViewer360
              foto={selectedFotos}
              currentIndex={selectedFotoIndex}
              onIndexChange={setSelectedFotoIndex}
              hideTimeTravelPanel
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Camera className="w-16 h-16 mb-4" style={{ color: "rgba(255,255,255,0.2)" }} />
              <p className="text-white/60 font-medium">
                {selectedPunto ? "Nessuna foto per questo punto" : "Seleziona un punto dalla piantina"}
              </p>
            </div>
          )
        ) : (
          /* Compare mode — two SyncedViewer360 side by side */
          <div className="flex h-full">
            <div className="flex-1 border-r border-white/20">
              {currentFoto ? (
                <SyncedViewer360
                  ref={leftViewerRef}
                  url={currentFoto.url}
                  onRotate={handleLeftRotate}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-white/40">
                  Nessuna foto
                </div>
              )}
            </div>
            <div className="flex-1">
              {currentCompareFoto ? (
                <SyncedViewer360
                  ref={rightViewerRef}
                  url={currentCompareFoto.url}
                  onRotate={handleRightRotate}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-white/40 text-sm">
                  {selectingCompare
                    ? "Clicca un punto sulla piantina"
                    : "Seleziona un punto da confrontare"}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
```

- [ ] **Step 3: Floating minimap panel (top-left)**

```tsx
      {/* ── Floating minimap + date panel (top-left) ─────────────────── */}
      <div
        className="absolute top-4 left-4 z-20 flex flex-col"
        style={{ width: minimapCollapsed ? "auto" : 280 }}
      >
        {/* Header bar */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-t-xl"
          style={{
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(12px)",
            borderBottom: minimapCollapsed ? "none" : "1px solid var(--border)",
            borderRadius: minimapCollapsed ? 12 : undefined,
          }}
        >
          <Link href={`/dashboard/cantieri/${cantiereId}`} className="btn-ghost p-1">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{piantina.nome}</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Livello {piantina.livello} · {puntiDiScatto.length} punti
            </p>
          </div>
          <button
            onClick={() => setMinimapCollapsed(!minimapCollapsed)}
            className="btn-ghost p-1"
            title={minimapCollapsed ? "Espandi mappa" : "Comprimi mappa"}
          >
            <ChevronDown
              className="w-4 h-4 transition-transform"
              style={{ transform: minimapCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
            />
          </button>
        </div>

        {!minimapCollapsed && (
          <>
            {/* Minimap canvas */}
            <div
              style={{
                background: "rgba(255,255,255,0.95)",
                backdropFilter: "blur(12px)",
                maxHeight: 200,
                overflow: "hidden",
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

            {/* Date dropdown for selected punto */}
            {selectedPunto && selectedFotos.length > 0 && (
              <div
                className="relative"
                style={{
                  background: "rgba(255,255,255,0.95)",
                  backdropFilter: "blur(12px)",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <button
                  onClick={() => setDateDropdownOpen(!dateDropdownOpen)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5 transition-colors"
                >
                  <Camera className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
                  <span className="flex-1 truncate font-medium">
                    {selectedPunto.nome} —{" "}
                    {currentFoto
                      ? safeDate(currentFoto.timestamp).toLocaleDateString("it-IT", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </span>
                  <ChevronDown
                    className="w-3.5 h-3.5 flex-shrink-0 transition-transform"
                    style={{
                      color: "var(--text-muted)",
                      transform: dateDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  />
                </button>

                {dateDropdownOpen && (
                  <div
                    className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden shadow-xl"
                    style={{
                      background: "rgba(255,255,255,0.97)",
                      backdropFilter: "blur(16px)",
                      border: "1px solid var(--border)",
                      maxHeight: 240,
                      overflowY: "auto",
                      zIndex: 30,
                    }}
                  >
                    {selectedFotos.map((foto, idx) => (
                      <button
                        key={foto.id}
                        onClick={() => {
                          setSelectedFotoIndex(idx);
                          setDateDropdownOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors"
                        style={{
                          background: idx === selectedFotoIndex ? "var(--surface-hover)" : "transparent",
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        {foto.thumbnailUrl ? (
                          <img
                            src={foto.thumbnailUrl}
                            alt=""
                            className="w-10 h-7 rounded object-cover flex-shrink-0"
                          />
                        ) : (
                          <div
                            className="w-10 h-7 rounded flex items-center justify-center flex-shrink-0"
                            style={{ background: "var(--surface-hover)" }}
                          >
                            <Camera className="w-3 h-3 opacity-30" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">
                            {safeDate(foto.timestamp).toLocaleDateString("it-IT", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {safeDate(foto.timestamp).toLocaleTimeString("it-IT", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        {idx === selectedFotoIndex && (
                          <Check className="w-4 h-4 flex-shrink-0" style={{ color: "#6366f1" }} />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Bottom rounded corner */}
            <div
              className="h-2 rounded-b-xl"
              style={{
                background: "rgba(255,255,255,0.95)",
                backdropFilter: "blur(12px)",
              }}
            />
          </>
        )}
      </div>
```

- [ ] **Step 4: Compare mode date dropdown (top-right, only in compare mode)**

```tsx
      {/* ── Compare date dropdown (right side, visible in compare mode) ── */}
      {compareMode && comparePunto && compareFotos.length > 0 && (
        <div
          className="absolute top-4 right-4 z-20"
          style={{ width: 240 }}
        >
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.95)",
              backdropFilter: "blur(12px)",
              border: "1px solid var(--border)",
            }}
          >
            <button
              onClick={() => setCompareDateDropdownOpen(!compareDateDropdownOpen)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5 transition-colors"
            >
              <Camera className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
              <span className="flex-1 truncate font-medium">
                {comparePunto.nome} —{" "}
                {currentCompareFoto
                  ? safeDate(currentCompareFoto.timestamp).toLocaleDateString("it-IT", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"}
              </span>
              <ChevronDown
                className="w-3.5 h-3.5 flex-shrink-0 transition-transform"
                style={{
                  color: "var(--text-muted)",
                  transform: compareDateDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            </button>

            {compareDateDropdownOpen && (
              <div
                style={{
                  maxHeight: 200,
                  overflowY: "auto",
                  borderTop: "1px solid var(--border)",
                }}
              >
                {compareFotos.map((foto, idx) => (
                  <button
                    key={foto.id}
                    onClick={() => {
                      setCompareFotoIndex(idx);
                      setCompareDateDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors"
                    style={{
                      background: idx === compareFotoIndex ? "var(--surface-hover)" : "transparent",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <span className="flex-1">
                      {safeDate(foto.timestamp).toLocaleDateString("it-IT", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      {safeDate(foto.timestamp).toLocaleTimeString("it-IT", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {idx === compareFotoIndex && (
                      <Check className="w-3 h-3" style={{ color: "#6366f1" }} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 5: Toolbar buttons (top-right)**

```tsx
      {/* ── Toolbar (top center-right) ───────────────────────────────── */}
      <div
        className="absolute top-4 z-20 flex items-center gap-2"
        style={{ right: compareMode && comparePunto ? 260 : 16 }}
      >
        {/* Compare toggle */}
        <button
          onClick={toggleCompare}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-colors"
          style={{
            background: compareMode ? "#6366f1" : "rgba(0,0,0,0.6)",
            color: "#fff",
            backdropFilter: "blur(8px)",
          }}
        >
          <Columns2 className="w-4 h-4" />
          Confronta
        </button>

        {/* Add punto */}
        <button
          onClick={() => {
            setAddingPunto(!addingPunto);
            setPendingCoords(null);
            if (compareMode) {
              setCompareMode(false);
              setComparePuntoId(null);
              setSelectingCompare(false);
            }
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-colors"
          style={{
            background: addingPunto ? "#6366f1" : "rgba(0,0,0,0.6)",
            color: "#fff",
            backdropFilter: "blur(8px)",
          }}
        >
          <Plus className="w-4 h-4" />
          {addingPunto ? "Clicca sulla mappa" : "Aggiungi punto"}
        </button>

        {/* Upload foto */}
        {selectedPunto && (
          <UploadFotoButton puntoId={selectedPunto.id} onDone={refetch} />
        )}
      </div>
```

- [ ] **Step 6: Hints and status bars**

```tsx
      {/* ── Selecting compare hint ──────────────────────────────────── */}
      {selectingCompare && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 px-5 py-2.5 rounded-full text-sm font-medium"
          style={{
            background: "rgba(99,102,241,0.9)",
            color: "#fff",
            backdropFilter: "blur(8px)",
            boxShadow: "0 4px 20px rgba(99,102,241,0.4)",
          }}
        >
          Clicca un punto sulla piantina per confrontare
          <button
            onClick={() => { setSelectingCompare(false); setCompareMode(false); }}
            className="ml-3 opacity-70 hover:opacity-100"
          >
            Annulla
          </button>
        </div>
      )}

      {/* ── Adding punto hint ───────────────────────────────────────── */}
      {addingPunto && !pendingCoords && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 px-5 py-2.5 rounded-full text-sm font-medium"
          style={{
            background: "rgba(99,102,241,0.9)",
            color: "#fff",
            backdropFilter: "blur(8px)",
          }}
        >
          Clicca sulla piantina per posizionare il nuovo punto
          <button
            onClick={() => { setAddingPunto(false); setPendingCoords(null); }}
            className="ml-3 opacity-70 hover:opacity-100"
          >
            Annulla
          </button>
        </div>
      )}
```

- [ ] **Step 7: Add punto dialog (modal)**

```tsx
      {/* ── Add punto dialog ────────────────────────────────────────── */}
      {addingPunto && pendingCoords && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
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
                  setAddingPunto(false);
                }
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setPendingCoords(null); setAddingPunto(false); }}
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
```

- [ ] **Step 8: Adapt UploadFotoButton for floating toolbar style**

The toolbar version of UploadFotoButton needs to look like a pill button (matching the Confronta/Aggiungi buttons), not a full-width primary button:

```tsx
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
        className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-colors"
        style={{
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          backdropFilter: "blur(8px)",
        }}
      >
        {uploading ? (
          <span className="flex items-center gap-1.5">
            <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
            Caricamento...
          </span>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            Carica foto
          </>
        )}
      </button>
    </>
  );
}
```

- [ ] **Step 9: Commit the full page rewrite**

```bash
git add apps/web/src/app/dashboard/cantieri/\[id\]/piantina/\[piantinaId\]/page.tsx
git commit -m "feat(piantina): fullscreen 360 viewer with floating minimap, date dropdown, compare mode"
```

---

## Task 5: Visual verification and polish

- [ ] **Step 1: Start dev server and test**

```bash
cd apps/web && npm run dev
```

Open `http://localhost:3000/dashboard/cantieri/<id>/piantina/<piantinaId>` and verify:

1. Page auto-selects first punto with most recent foto
2. 360° viewer fills the entire page area
3. Minimap visible top-left with interactive markers
4. Left-click drag pans the minimap
5. Clicking a marker switches the 360° viewer to that punto
6. Date dropdown below minimap lists all dates for selected punto
7. Selecting a date changes the 360° viewer photo
8. When switching puntos, the closest date is auto-selected

- [ ] **Step 2: Test compare mode**

1. Click "Confronta" button
2. Hint bar appears "Clicca un punto sulla piantina per confrontare"
3. Click a different punto on minimap
4. View splits in two, right side shows matching date
5. Drag one side — both rotate together (synced)
6. Right-side date dropdown works independently
7. Click "Confronta" again to exit compare mode

- [ ] **Step 3: Test existing features preserved**

1. "Aggiungi punto" — click → minimap → dialog → adds punto
2. Marker edit mode (Modifica button in minimap) — drag markers
3. Annotations (Note button) on single view — add/view/delete notes
4. Navigation back to cantiere via arrow button

- [ ] **Step 4: Fix any issues found during testing**

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "fix(piantina): polish floating minimap layout and interactions"
```
