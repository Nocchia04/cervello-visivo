"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";
import { X, ChevronLeft, ChevronRight, MapPin, Check, Pencil, Trash2 } from "lucide-react";
import { useQuery, useMutation, useSubscription } from "@apollo/client";
import { safeDate } from "@/lib/dateUtils";
import { GET_ANNOTAZIONI, ME } from "@/graphql/queries";
import { CREA_ANNOTAZIONE, ELIMINA_ANNOTAZIONE, AGGIORNA_ANNOTAZIONE } from "@/graphql/mutations";
import { NUOVA_ANNOTAZIONE } from "@/graphql/subscriptions";

interface Foto {
  id: string;
  url: string;
  thumbnailUrl?: string;
  timestamp: string;
}

interface Annotazione {
  id: string;
  testo: string;
  x: number; // longitude (degrees)
  y: number; // latitude (degrees)
  autore: { id: string; nome: string; cognome: string };
  createdAt: string;
}

interface Viewer360Props {
  foto: Foto[];
  initialIndex?: number;
  onClose: () => void;
}

export default function Viewer360({
  foto,
  initialIndex = 0,
  onClose,
}: Viewer360Props) {
  // ── Three.js refs ────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const isDraggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const lonRef = useRef(0);
  const latRef = useRef(0);
  const rafRef = useRef<number>(0);
  const currentIdxRef = useRef(initialIndex);
  // Called every frame to reproject annotation divs — updated via useEffect
  const updateAnnotPositionsRef = useRef<() => void>(() => {});

  // ── React state ──────────────────────────────────────────────────────────
  const [currentIdx, setCurrentIdx] = useState(initialIndex);
  const [loading, setLoading] = useState(true);
  const [addingNote, setAddingNote] = useState(false);
  const [pendingNote, setPendingNote] = useState<{
    lon: number;
    lat: number;
    sx: number;
    sy: number;
  } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  // ── Annotation div refs (id → DOM element) ───────────────────────────────
  const annotDivsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const annotationsRef = useRef<Annotazione[]>([]);

  const currentFotoId = foto[currentIdx]?.id;

  // ── GraphQL ──────────────────────────────────────────────────────────────
  const { data: meData } = useQuery(ME);
  const isAdmin = meData?.me?.role === "ADMIN";

  const { data: annotData } = useQuery(GET_ANNOTAZIONI, {
    variables: { foto360Id: currentFotoId },
    skip: !currentFotoId,
    fetchPolicy: "cache-and-network",
  });

  const [creaAnnotazione] = useMutation(CREA_ANNOTAZIONE, {
    onCompleted: () => {
      setPendingNote(null);
      setNoteText("");
      setAddingNote(false);
    },
  });

  const [aggiornaAnnotazione] = useMutation(AGGIORNA_ANNOTAZIONE, {
    update(cache, { data }) {
      const updated = data?.aggiornaAnnotazione;
      if (!updated || !currentFotoId) return;
      cache.updateQuery(
        { query: GET_ANNOTAZIONI, variables: { foto360Id: currentFotoId } },
        (existing) =>
          existing
            ? { annotazioni: existing.annotazioni.map((a: Annotazione) => a.id === updated.id ? { ...a, testo: updated.testo } : a) }
            : existing
      );
    },
    onCompleted: () => { setEditingId(null); setEditText(""); },
  });

  const [eliminaAnnotazione] = useMutation(ELIMINA_ANNOTAZIONE, {
    update(cache, { data }) {
      const deletedId = data?.eliminaAnnotazione?.id;
      const fotoId = data?.eliminaAnnotazione?.foto360Id;
      if (!deletedId || !fotoId) return;
      cache.updateQuery(
        { query: GET_ANNOTAZIONI, variables: { foto360Id: fotoId } },
        (existing) =>
          existing
            ? { annotazioni: existing.annotazioni.filter((a: Annotazione) => a.id !== deletedId) }
            : existing
      );
    },
    onCompleted: () => { setConfirmDeleteId(null); setExpandedId(null); },
  });

  useSubscription(NUOVA_ANNOTAZIONE, {
    variables: { foto360Id: currentFotoId },
    skip: !currentFotoId,
    onData: ({ client, data: subData }) => {
      const nuova = subData.data?.nuovaAnnotazione;
      if (!nuova) return;
      const existing = client.readQuery<{ annotazioni: Annotazione[] }>({
        query: GET_ANNOTAZIONI,
        variables: { foto360Id: currentFotoId },
      });
      if (existing && !existing.annotazioni.some((a) => a.id === nuova.id)) {
        client.writeQuery({
          query: GET_ANNOTAZIONI,
          variables: { foto360Id: currentFotoId },
          data: { annotazioni: [...existing.annotazioni, nuova] },
        });
      }
    },
  });

  const annotations: Annotazione[] = annotData?.annotazioni ?? [];

  // Keep annotationsRef in sync so the animation loop can read it without stale closure
  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  // Reset UI when switching foto
  useEffect(() => {
    setPendingNote(null);
    setNoteText("");
    setExpandedId(null);
    setConfirmDeleteId(null);
    setEditingId(null);
    setEditText("");
  }, [currentIdx]);

  // ── Load texture ─────────────────────────────────────────────────────────
  const loadTexture = useCallback((url: string) => {
    if (!materialRef.current) return;
    setLoading(true);
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        if (materialRef.current) {
          materialRef.current.map = texture;
          materialRef.current.needsUpdate = true;
        }
        setLoading(false);
      },
      undefined,
      () => setLoading(false)
    );
  }, []);

  // ── Three.js init (runs once on mount) ───────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    rendererRef.current = renderer;

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
    cameraRef.current = camera;

    const scene = new THREE.Scene();
    const geometry = new THREE.SphereGeometry(500, 64, 32);
    geometry.scale(-1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    materialRef.current = material;
    scene.add(new THREE.Mesh(geometry, material));

    loadTexture(foto[initialIndex].url);

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const phi = THREE.MathUtils.degToRad(90 - latRef.current);
      const theta = THREE.MathUtils.degToRad(lonRef.current);
      const target = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
      camera.lookAt(target);
      renderer.render(scene, camera);
      // Update annotation overlay positions every frame
      updateAnnotPositionsRef.current();
    };
    animate();

    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      material.dispose();
      geometry.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update annotation div positions (called every animation frame) ───────
  useEffect(() => {
    updateAnnotPositionsRef.current = () => {
      const camera = cameraRef.current;
      if (!camera) return;
      const w = window.innerWidth;
      const h = window.innerHeight;

      // Camera forward direction in world space
      const camPhi = THREE.MathUtils.degToRad(90 - latRef.current);
      const camTheta = THREE.MathUtils.degToRad(lonRef.current);
      const camDir = new THREE.Vector3().setFromSphericalCoords(1, camPhi, camTheta);

      for (const annot of annotationsRef.current) {
        const div = annotDivsRef.current.get(annot.id);
        if (!div) continue;

        // World position of this annotation on the sphere
        const annPhi = THREE.MathUtils.degToRad(90 - annot.y);
        const annTheta = THREE.MathUtils.degToRad(annot.x);
        const worldPos = new THREE.Vector3().setFromSphericalCoords(500, annPhi, annTheta);

        // Visibility: dot product > 0 = same hemisphere as camera
        const dot = camDir.dot(worldPos.clone().normalize());

        if (dot < 0.15) {
          div.style.opacity = "0";
          div.style.pointerEvents = "none";
          continue;
        }

        // Project to screen
        const projected = worldPos.clone().project(camera);
        const sx = ((projected.x + 1) / 2) * w;
        const sy = ((-projected.y + 1) / 2) * h;

        const opacity = Math.min(1, (dot - 0.15) / 0.25 + 0.3);
        div.style.opacity = String(opacity);
        div.style.pointerEvents = dot > 0.35 ? "auto" : "none";
        div.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
      }
    };
  }, [annotations]);

  // ── Navigate ─────────────────────────────────────────────────────────────
  const navigateTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(foto.length - 1, index));
      currentIdxRef.current = clamped;
      setCurrentIdx(clamped);
      loadTexture(foto[clamped].url);
    },
    [foto, loadTexture]
  );

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") navigateTo(currentIdxRef.current + 1);
      if (e.key === "ArrowLeft") navigateTo(currentIdxRef.current - 1);
      if (e.key === "Escape") {
        if (pendingNote) {
          setPendingNote(null);
          setNoteText("");
        } else if (addingNote) {
          setAddingNote(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigateTo, onClose, pendingNote, addingNote]);

  // ── Mouse drag ────────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    dragMovedRef.current = false;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMovedRef.current = true;
    lonRef.current += dx * 0.3;
    latRef.current = Math.max(
      -85,
      Math.min(85, latRef.current + dy * 0.3)
    );
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = () => {
    isDraggingRef.current = false;
  };

  // Click on canvas to place annotation pin
  const onCanvasClick = (e: React.MouseEvent) => {
    if (dragMovedRef.current) return;
    if (!addingNote || !cameraRef.current || pendingNote) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const ndcX = (e.clientX / w) * 2 - 1;
    const ndcY = -(e.clientY / h) * 2 + 1;

    // Unproject click to world-space direction
    const vec = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(cameraRef.current);
    const dir = vec.sub(cameraRef.current.position).normalize();

    // Convert direction to lon/lat (matching setFromSphericalCoords convention)
    const lat = Math.asin(Math.max(-1, Math.min(1, dir.y))) * (180 / Math.PI);
    const lon = Math.atan2(dir.x, dir.z) * (180 / Math.PI);

    setPendingNote({ lon, lat, sx: e.clientX, sy: e.clientY });
  };

  // ── Touch drag ────────────────────────────────────────────────────────────
  const lastTouchRef = useRef({ x: 0, y: 0 });
  const onTouchStart = (e: React.TouchEvent) => {
    lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    lonRef.current -= (e.touches[0].clientX - lastTouchRef.current.x) * 0.3;
    latRef.current = Math.max(
      -85,
      Math.min(
        85,
        latRef.current + (e.touches[0].clientY - lastTouchRef.current.y) * 0.3
      )
    );
    lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  // ── Submit annotation ─────────────────────────────────────────────────────
  const submitNote = () => {
    if (!pendingNote || !noteText.trim() || !currentFotoId) return;
    creaAnnotazione({
      variables: {
        foto360Id: currentFotoId,
        testo: noteText.trim(),
        x: pendingNote.lon,
        y: pendingNote.lat,
      },
    });
  };

  const currentFoto = foto[currentIdx];

  return (
    <div
      className="fixed inset-0 z-[100] bg-black select-none"
      style={{
        cursor: isDraggingRef.current
          ? "grabbing"
          : addingNote
          ? "crosshair"
          : "grab",
      }}
    >
      {/* Three.js canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={onCanvasClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onMouseUp}
      />

      {/* ── Annotation pins overlay ────────────────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{ pointerEvents: "none", zIndex: 10 }}
      >
        {annotations.map((annot) => (
          <div
            key={annot.id}
            ref={(el) => {
              if (el) annotDivsRef.current.set(annot.id, el);
              else annotDivsRef.current.delete(annot.id);
            }}
            className="absolute"
            style={{
              left: 0,
              top: 0,
              opacity: 0,
              pointerEvents: "none",
              willChange: "transform",
            }}
          >
            {/* Pin circle */}
            <div
              role="button"
              tabIndex={0}
              onClick={() =>
                setExpandedId(expandedId === annot.id ? null : annot.id)
              }
              title={`${annot.autore.nome}: ${annot.testo}`}
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "#f59e0b",
                border: "2.5px solid #fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 700,
                color: "#1a1a1a",
                cursor: "pointer",
                boxShadow: "0 2px 12px rgba(0,0,0,0.7)",
                userSelect: "none",
                outline: "none",
              }}
            >
              {(annot.autore.nome[0] ?? "?").toUpperCase()}
            </div>

            {/* Speech bubble */}
            {expandedId === annot.id && (
              <div
                style={{
                  position: "absolute",
                  bottom: 44,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "#fffde7",
                  color: "#1a1a1a",
                  padding: "10px 12px 8px",
                  borderRadius: 10,
                  width: 230,
                  boxShadow: "0 6px 24px rgba(0,0,0,0.55)",
                  fontSize: 12,
                  zIndex: 20,
                  pointerEvents: "auto",
                }}
              >
                {/* Bubble arrow */}
                <div style={{ position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: "8px solid #fffde7" }} />

                {confirmDeleteId === annot.id ? (
                  /* ── Confirm delete ── */
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 12, marginBottom: 10, color: "#c0392b" }}>Eliminare questa nota?</p>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={(e) => { e.stopPropagation(); eliminaAnnotazione({ variables: { id: annot.id } }); }} style={{ flex: 1, background: "#c0392b", color: "#fff", border: "none", borderRadius: 6, padding: "6px 0", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Sì, elimina</button>
                      <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }} style={{ flex: 1, background: "rgba(0,0,0,0.08)", color: "#333", border: "none", borderRadius: 6, padding: "6px 0", fontSize: 12, cursor: "pointer" }}>Annulla</button>
                    </div>
                  </div>
                ) : editingId === annot.id ? (
                  /* ── Edit ── */
                  <div>
                    <textarea
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") { setEditingId(null); setEditText(""); }
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (editText.trim()) aggiornaAnnotazione({ variables: { id: annot.id, testo: editText } }); }
                      }}
                      style={{ width: "100%", minHeight: 64, background: "rgba(0,0,0,0.04)", border: "1px solid #d0d0d0", borderRadius: 6, padding: "6px 8px", fontSize: 12, resize: "vertical", outline: "none", marginBottom: 8, fontFamily: "inherit" }}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={(e) => { e.stopPropagation(); if (editText.trim()) aggiornaAnnotazione({ variables: { id: annot.id, testo: editText } }); }} disabled={!editText.trim()} style={{ flex: 1, background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, padding: "6px 0", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Salva</button>
                      <button onClick={(e) => { e.stopPropagation(); setEditingId(null); setEditText(""); }} style={{ flex: 1, background: "rgba(0,0,0,0.08)", color: "#333", border: "none", borderRadius: 6, padding: "6px 0", fontSize: 12, cursor: "pointer" }}>Annulla</button>
                    </div>
                  </div>
                ) : (
                  /* ── Normal ── */
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 11, color: "#555" }}>{annot.autore.nome} {annot.autore.cognome}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, paddingLeft: 8 }}>
                        {isAdmin && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); setEditingId(annot.id); setEditText(annot.testo); setConfirmDeleteId(null); }} title="Modifica nota" style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#6366f1", display: "flex", alignItems: "center" }}>
                              <Pencil size={13} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(annot.id); }} title="Elimina nota" style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#c0392b", display: "flex", alignItems: "center" }}>
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); setExpandedId(null); }} style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 0 4px", fontSize: 16, lineHeight: 1, color: "#999" }}>×</button>
                      </div>
                    </div>
                    <div style={{ lineHeight: 1.45, marginBottom: 6, whiteSpace: "pre-wrap" }}>{annot.testo}</div>
                    <div style={{ fontSize: 10, color: "#aaa" }}>
                      {safeDate(annot.createdAt).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Pending note pulse pin ─────────────────────────────────────────── */}
      {pendingNote && (
        <div
          className="absolute pointer-events-none animate-pulse"
          style={{
            left: pendingNote.sx,
            top: pendingNote.sy,
            transform: "translate(-50%, -50%)",
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "#6366f1",
            border: "3px solid #fff",
            zIndex: 20,
            boxShadow: "0 0 20px rgba(99,102,241,0.8)",
          }}
        />
      )}

      {/* ── Note input bar (appears when pending pin placed) ─────────────── */}
      {pendingNote && (
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            bottom: 108,
            zIndex: 30,
            width: "min(480px, calc(100vw - 32px))",
          }}
        >
          <div
            style={{
              background: "rgba(15,15,26,0.95)",
              border: "1px solid rgba(99,102,241,0.5)",
              borderRadius: 16,
              padding: "14px 16px",
              backdropFilter: "blur(12px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
            }}
          >
            <p
              className="text-xs mb-3"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              📍 Aggiungi nota su questo punto
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitNote();
                  if (e.key === "Escape") {
                    setPendingNote(null);
                    setNoteText("");
                  }
                }}
                placeholder="Scrivi la tua nota..."
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.08)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  fontSize: 13,
                  outline: "none",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(99,102,241,0.7)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor =
                    "rgba(255,255,255,0.12)")
                }
              />
              <button
                onClick={submitNote}
                disabled={!noteText.trim()}
                style={{
                  background: noteText.trim()
                    ? "#6366f1"
                    : "rgba(99,102,241,0.25)",
                  border: "none",
                  borderRadius: 10,
                  width: 44,
                  cursor: noteText.trim() ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Check className="w-4 h-4 text-white" />
              </button>
              <button
                onClick={() => {
                  setPendingNote(null);
                  setNoteText("");
                }}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "none",
                  borderRadius: 10,
                  width: 44,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <X className="w-4 h-4" style={{ color: "rgba(255,255,255,0.5)" }} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Loading spinner ────────────────────────────────────────────────── */}
      {loading && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ zIndex: 15 }}
        >
          <div
            className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{
              borderColor: "rgba(255,255,255,0.2)",
              borderTopColor: "rgba(255,255,255,0.8)",
            }}
          />
        </div>
      )}

      {/* ── Date label (top center) ───────────────────────────────────────── */}
      {currentFoto && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm text-white pointer-events-none"
          style={{ background: "rgba(0,0,0,0.6)", zIndex: 15 }}
        >
          {safeDate(currentFoto.timestamp).toLocaleDateString("it-IT", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </div>
      )}

      {/* ── Add note toggle button ────────────────────────────────────────── */}
      <button
        onClick={() => {
          if (addingNote) {
            setAddingNote(false);
            setPendingNote(null);
            setNoteText("");
          } else {
            setAddingNote(true);
            setExpandedId(null);
          }
        }}
        className="absolute top-4 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-colors"
        style={{
          right: 60,
          background: addingNote ? "#6366f1" : "rgba(0,0,0,0.6)",
          color: "#fff",
          zIndex: 15,
          border: "none",
          cursor: "pointer",
        }}
        title={addingNote ? "Annulla" : "Aggiungi nota"}
      >
        <MapPin className="w-4 h-4" />
        {addingNote ? "Annulla" : `Nota${annotations.length > 0 ? ` (${annotations.length})` : ""}`}
      </button>

      {/* ── Close button ─────────────────────────────────────────────────── */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white"
        style={{ background: "rgba(0,0,0,0.6)", zIndex: 15 }}
      >
        <X className="w-5 h-5" />
      </button>

      {/* ── "Click to place note" hint ────────────────────────────────────── */}
      {addingNote && !pendingNote && (
        <div
          className="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm pointer-events-none"
          style={{
            background: "rgba(99,102,241,0.8)",
            color: "#fff",
            zIndex: 15,
          }}
        >
          Clicca sulla foto per posizionare la nota
        </div>
      )}

      {/* ── Prev / Next arrows ───────────────────────────────────────────── */}
      {foto.length > 1 && (
        <>
          <button
            onClick={() => navigateTo(currentIdx - 1)}
            disabled={currentIdx === 0}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-white disabled:opacity-30"
            style={{ background: "rgba(0,0,0,0.6)", zIndex: 15 }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => navigateTo(currentIdx + 1)}
            disabled={currentIdx === foto.length - 1}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-white disabled:opacity-30"
            style={{ background: "rgba(0,0,0,0.6)", zIndex: 15 }}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}

      {/* ── Bottom thumbnail strip ────────────────────────────────────────── */}
      {foto.length > 1 && (
        <div
          className="absolute bottom-0 left-0 right-0 p-4"
          style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.85), transparent)",
            zIndex: 15,
          }}
        >
          <div className="flex gap-2 overflow-x-auto justify-center pb-1">
            {foto.map((f, i) => (
              <button
                key={f.id}
                onClick={() => navigateTo(i)}
                className="flex-shrink-0 rounded-lg overflow-hidden transition-all duration-200 relative"
                style={{
                  width: 80,
                  height: 52,
                  background: "#0f0f1a",
                  border:
                    i === currentIdx
                      ? "2px solid #6366f1"
                      : "2px solid transparent",
                  opacity: i === currentIdx ? 1 : 0.6,
                }}
              >
                {f.thumbnailUrl ? (
                  <img
                    src={f.thumbnailUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-white"
                    style={{ fontSize: 9 }}
                  >
                    {safeDate(f.timestamp).toLocaleDateString("it-IT", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Bottom hint ───────────────────────────────────────────────────── */}
      {!addingNote && !pendingNote && (
        <div
          className="absolute bottom-24 left-1/2 -translate-x-1/2 text-xs pointer-events-none"
          style={{ color: "rgba(255,255,255,0.35)", zIndex: 15 }}
        >
          Trascina per guardarsi intorno · ESC per chiudere
        </div>
      )}
    </div>
  );
}
