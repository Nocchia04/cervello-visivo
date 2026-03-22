"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";
import { MapPin, Check, X, ChevronLeft, ChevronRight, Clock, Trash2 } from "lucide-react";
import { useQuery, useMutation, useSubscription } from "@apollo/client";
import { safeDate } from "@/lib/dateUtils";
import { GET_ANNOTAZIONI, ME } from "@/graphql/queries";
import { CREA_ANNOTAZIONE, ELIMINA_ANNOTAZIONE } from "@/graphql/mutations";
import { NUOVA_ANNOTAZIONE } from "@/graphql/subscriptions";

interface Foto {
  id: string;
  url: string;
  thumbnailUrl?: string | null;
  timestamp: string;
}

interface Annotazione {
  id: string;
  testo: string;
  x: number;
  y: number;
  autore: { id: string; nome: string; cognome: string };
  createdAt: string;
}

interface EmbeddedViewer360Props {
  foto: Foto[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
}

export default function EmbeddedViewer360({
  foto,
  currentIndex,
  onIndexChange,
}: EmbeddedViewer360Props) {
  const containerRef = useRef<HTMLDivElement>(null);
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
  const updateAnnotPositionsRef = useRef<() => void>(() => {});

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

  const annotDivsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const annotationsRef = useRef<Annotazione[]>([]);

  const currentFoto = foto[currentIndex];
  const currentFotoId = currentFoto?.id;

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
    onCompleted: () => {
      setConfirmDeleteId(null);
      setExpandedId(null);
    },
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

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  useEffect(() => {
    setPendingNote(null);
    setNoteText("");
    setExpandedId(null);
    setConfirmDeleteId(null);
  }, [currentIndex]);

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

  // Load texture when currentIndex changes
  useEffect(() => {
    if (currentFoto) loadTexture(currentFoto.url);
  }, [currentIndex, currentFoto, loadTexture]);

  // ── Three.js init ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const w = container.offsetWidth;
    const h = container.offsetHeight;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    rendererRef.current = renderer;

    const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 2000);
    cameraRef.current = camera;

    const scene = new THREE.Scene();
    const geometry = new THREE.SphereGeometry(500, 64, 32);
    geometry.scale(-1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    materialRef.current = material;
    scene.add(new THREE.Mesh(geometry, material));

    if (foto[0]) loadTexture(foto[0].url);

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const phi = THREE.MathUtils.degToRad(90 - latRef.current);
      const theta = THREE.MathUtils.degToRad(lonRef.current);
      const target = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
      camera.lookAt(target);
      renderer.render(scene, camera);
      updateAnnotPositionsRef.current();
    };
    animate();

    const observer = new ResizeObserver(() => {
      const nw = container.offsetWidth;
      const nh = container.offsetHeight;
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    });
    observer.observe(container);

    return () => {
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
      renderer.dispose();
      material.dispose();
      geometry.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Annotation position update (every frame) ─────────────────────────────
  useEffect(() => {
    updateAnnotPositionsRef.current = () => {
      const camera = cameraRef.current;
      const container = containerRef.current;
      if (!camera || !container) return;
      const w = container.offsetWidth;
      const h = container.offsetHeight;

      const camPhi = THREE.MathUtils.degToRad(90 - latRef.current);
      const camTheta = THREE.MathUtils.degToRad(lonRef.current);
      const camDir = new THREE.Vector3().setFromSphericalCoords(1, camPhi, camTheta);

      for (const annot of annotationsRef.current) {
        const div = annotDivsRef.current.get(annot.id);
        if (!div) continue;

        const annPhi = THREE.MathUtils.degToRad(90 - annot.y);
        const annTheta = THREE.MathUtils.degToRad(annot.x);
        const worldPos = new THREE.Vector3().setFromSphericalCoords(500, annPhi, annTheta);
        const dot = camDir.dot(worldPos.clone().normalize());

        if (dot < 0.15) {
          div.style.opacity = "0";
          div.style.pointerEvents = "none";
          continue;
        }

        const projected = worldPos.clone().project(camera);
        const sx = ((projected.x + 1) / 2) * w;
        const sy = ((-projected.y + 1) / 2) * h;

        div.style.opacity = String(Math.min(1, (dot - 0.15) / 0.25 + 0.3));
        div.style.pointerEvents = dot > 0.35 ? "auto" : "none";
        div.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
      }
    };
  }, [annotations]);

  // ── Mouse drag + click ────────────────────────────────────────────────────
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
    latRef.current = Math.max(-85, Math.min(85, latRef.current - dy * 0.3));
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = () => { isDraggingRef.current = false; };

  const onCanvasClick = (e: React.MouseEvent) => {
    if (dragMovedRef.current || !addingNote || !cameraRef.current || pendingNote) return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const ndcX = ((e.clientX - rect.left) / w) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / h) * 2 + 1;

    const vec = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(cameraRef.current);
    const dir = vec.sub(cameraRef.current.position).normalize();

    const lat = Math.asin(Math.max(-1, Math.min(1, dir.y))) * (180 / Math.PI);
    const lon = Math.atan2(dir.x, dir.z) * (180 / Math.PI);

    const rect2 = container.getBoundingClientRect();
    setPendingNote({
      lon,
      lat,
      sx: e.clientX - rect2.left,
      sy: e.clientY - rect2.top,
    });
  };

  // ── Touch ────────────────────────────────────────────────────────────────
  const lastTouchRef = useRef({ x: 0, y: 0 });
  const onTouchStart = (e: React.TouchEvent) => {
    lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    lonRef.current -= (e.touches[0].clientX - lastTouchRef.current.x) * 0.3;
    latRef.current = Math.max(-85, Math.min(85, latRef.current + (e.touches[0].clientY - lastTouchRef.current.y) * 0.3));
    lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

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

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden rounded-2xl bg-black"
      style={{
        cursor: isDraggingRef.current ? "grabbing" : addingNote ? "crosshair" : "grab",
      }}
    >
      {/* Three.js canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
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
      <div className="absolute inset-0" style={{ pointerEvents: "none", zIndex: 10 }}>
        {annotations.map((annot) => (
          <div
            key={annot.id}
            ref={(el) => {
              if (el) annotDivsRef.current.set(annot.id, el);
              else annotDivsRef.current.delete(annot.id);
            }}
            className="absolute"
            style={{ left: 0, top: 0, opacity: 0, pointerEvents: "none", willChange: "transform" }}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => setExpandedId(expandedId === annot.id ? null : annot.id)}
              title={`${annot.autore.nome}: ${annot.testo}`}
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "#f59e0b",
                border: "2px solid #fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                color: "#1a1a1a",
                cursor: "pointer",
                boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
                userSelect: "none",
                outline: "none",
              }}
            >
              {(annot.autore.nome[0] ?? "?").toUpperCase()}
            </div>
            {expandedId === annot.id && (
              <div style={{
                position: "absolute",
                bottom: 42,
                left: "50%",
                transform: "translateX(-50%)",
                background: "#fffde7",
                color: "#1a1a1a",
                padding: "10px 12px 8px",
                borderRadius: 10,
                width: 220,
                boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
                fontSize: 12,
                zIndex: 20,
                pointerEvents: "auto",
              }}>
                {/* Caret */}
                <div style={{ position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: "8px solid #fffde7" }} />

                {confirmDeleteId === annot.id ? (
                  /* ── Confirm delete state ─────────────────────── */
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 12, marginBottom: 10, color: "#c0392b" }}>
                      Eliminare questa nota?
                    </p>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          eliminaAnnotazione({ variables: { id: annot.id } });
                        }}
                        style={{ flex: 1, background: "#c0392b", color: "#fff", border: "none", borderRadius: 6, padding: "6px 0", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                      >
                        Sì, elimina
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                        style={{ flex: 1, background: "rgba(0,0,0,0.08)", color: "#333", border: "none", borderRadius: 6, padding: "6px 0", fontSize: 12, cursor: "pointer" }}
                      >
                        Annulla
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Normal state ─────────────────────────────── */
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 5 }}>
                      <span style={{ fontWeight: 700, fontSize: 11, color: "#555" }}>{annot.autore.nome} {annot.autore.cognome}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, paddingLeft: 8 }}>
                        {isAdmin && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(annot.id); }}
                            title="Elimina nota"
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#c0392b", display: "flex", alignItems: "center" }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpandedId(null); }}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 2, fontSize: 16, color: "#aaa", lineHeight: 1 }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div style={{ lineHeight: 1.4, marginBottom: 5 }}>{annot.testo}</div>
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

      {/* ── Pending note pin ─────────────────────────────────────────────── */}
      {pendingNote && (
        <div
          className="absolute pointer-events-none animate-pulse"
          style={{ left: pendingNote.sx, top: pendingNote.sy, transform: "translate(-50%,-50%)", width: 28, height: 28, borderRadius: "50%", background: "#6366f1", border: "2px solid #fff", zIndex: 20, boxShadow: "0 0 16px rgba(99,102,241,0.7)" }}
        />
      )}

      {/* ── Note input bar ────────────────────────────────────────────────── */}
      {pendingNote && (
        <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: 20, zIndex: 30, width: "min(420px,calc(100% - 32px))" }}>
          <div style={{ background: "rgba(15,15,26,0.96)", border: "1px solid rgba(99,102,241,0.4)", borderRadius: 14, padding: "12px 14px", backdropFilter: "blur(12px)" }}>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginBottom: 10 }}>📍 Aggiungi nota su questo punto</p>
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitNote(); if (e.key === "Escape") { setPendingNote(null); setNoteText(""); } }}
                placeholder="Scrivi la tua nota..."
                style={{ flex: 1, background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none" }}
              />
              <button onClick={submitNote} disabled={!noteText.trim()} style={{ background: noteText.trim() ? "#6366f1" : "rgba(99,102,241,0.25)", border: "none", borderRadius: 8, width: 38, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Check className="w-4 h-4 text-white" />
              </button>
              <button onClick={() => { setPendingNote(null); setNoteText(""); }} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, width: 38, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X className="w-4 h-4" style={{ color: "rgba(255,255,255,0.4)" }} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Loading spinner ───────────────────────────────────────────────── */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 5 }}>
          <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(255,255,255,0.15)", borderTopColor: "rgba(255,255,255,0.7)" }} />
        </div>
      )}

      {/* ── Add note button (top right) ───────────────────────────────────── */}
      <button
        onClick={() => { setAddingNote(!addingNote); if (addingNote) { setPendingNote(null); setNoteText(""); } }}
        style={{
          position: "absolute", top: 14, right: 14, zIndex: 20,
          background: addingNote ? "#6366f1" : "rgba(0,0,0,0.55)",
          border: "none", borderRadius: 999, padding: "7px 14px",
          color: "#fff", fontSize: 12, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
          backdropFilter: "blur(8px)",
        }}
      >
        <MapPin className="w-3.5 h-3.5" />
        {addingNote ? "Annulla" : `Note${annotations.length > 0 ? ` (${annotations.length})` : ""}`}
      </button>

      {/* ── "Click to place" hint ─────────────────────────────────────────── */}
      {addingNote && !pendingNote && (
        <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 20, background: "rgba(99,102,241,0.85)", borderRadius: 999, padding: "6px 16px", color: "#fff", fontSize: 12, pointerEvents: "none" }}>
          Clicca sulla foto per posizionare la nota
        </div>
      )}

      {/* ── Floating time travel panel (bottom-left) ─────────────────────── */}
      {foto.length > 0 && !pendingNote && (
        <div
          style={{
            position: "absolute", bottom: 16, left: 16, zIndex: 20,
            background: "rgba(255,255,255,0.97)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 16,
            padding: "12px 14px",
            width: 300,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          }}
        >
          {/* Current date */}
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-3.5 h-3.5" style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>
              {currentFoto
                ? safeDate(currentFoto.timestamp).toLocaleString("it-IT", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
                : "—"}
            </span>
            <span className="ml-auto text-xs" style={{ color: "var(--text-muted)" }}>
              {currentIndex + 1}/{foto.length}
            </span>
          </div>

          {/* Thumbnail strip */}
          <div className="flex gap-1.5 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
            {foto.map((f, i) => (
              <button
                key={f.id}
                onClick={() => onIndexChange(i)}
                style={{
                  flexShrink: 0,
                  width: 52,
                  height: 36,
                  borderRadius: 8,
                  overflow: "hidden",
                  background: "var(--surface-hover)",
                  border: i === currentIndex ? "2px solid var(--accent)" : "2px solid transparent",
                  opacity: i === currentIndex ? 1 : 0.55,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  padding: 0,
                }}
              >
                {f.thumbnailUrl ? (
                  <img src={f.thumbnailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 8, color: "var(--text-subtle)" }}>
                      {safeDate(f.timestamp).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Prev / next + slider */}
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => onIndexChange(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, opacity: currentIndex === 0 ? 0.3 : 1 }}
            >
              <ChevronLeft className="w-4 h-4" style={{ color: "var(--text)" }} />
            </button>
            <input
              type="range"
              min={0}
              max={foto.length - 1}
              value={currentIndex}
              onChange={(e) => onIndexChange(Number(e.target.value))}
              style={{ flex: 1, accentColor: "var(--accent)", height: 4, cursor: "pointer" }}
            />
            <button
              onClick={() => onIndexChange(Math.min(foto.length - 1, currentIndex + 1))}
              disabled={currentIndex === foto.length - 1}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, opacity: currentIndex === foto.length - 1 ? 0.3 : 1 }}
            >
              <ChevronRight className="w-4 h-4" style={{ color: "var(--text)" }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
