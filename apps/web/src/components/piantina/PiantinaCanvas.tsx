"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check } from "lucide-react";
import PuntoDiScattoMarker, { type PuntoDateStatus } from "./PuntoDiScattoMarker";

interface Foto {
  id: string;
}

interface Punto {
  id: string;
  nome: string;
  x: number;
  y: number;
  dimensione?: string;
  foto360: Foto[];
}

interface PiantinaCanvasProps {
  piantinaId: string;
  fileUrl: string;
  larghezza: number;
  altezza: number;
  puntiDiScatto: Punto[];
  selectedPuntoId?: string | null;
  onPuntoDragEnd: (puntoId: string, newX: number, newY: number) => void;
  onCanvasClick: (x: number, y: number) => void;
  onPuntoClick?: (puntoId: string) => void;
  leftClickPans?: boolean;
  /** Externally controlled edit mode (overrides internal state) */
  editModeExternal?: boolean;
  onEditModeChange?: (editing: boolean) => void;
  /** Per-punto color hint based on the selected foto's date */
  dateStatusByPuntoId?: Record<string, PuntoDateStatus>;
}

export default function PiantinaCanvas({
  fileUrl,
  larghezza,
  altezza,
  puntiDiScatto,
  selectedPuntoId,
  onPuntoDragEnd,
  onCanvasClick,
  onPuntoClick,
  leftClickPans,
  editModeExternal,
  onEditModeChange,
  dateStatusByPuntoId,
}: PiantinaCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Wrapper interno che ha lo stesso aspect-ratio dell'immagine (letterboxed
  // nel container outer). Tutti i calcoli di click e drag dei marker usano
  // QUESTO rect — i marker sono in % di questo wrapper, non del container.
  const imageWrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const lastPanRef = useRef({ x: 0, y: 0 });

  // Edit mode — use external prop if provided, otherwise internal state
  const [isEditModeInternal, setIsEditModeInternal] = useState(false);
  const isEditMode = editModeExternal !== undefined ? editModeExternal : isEditModeInternal;
  const setIsEditMode = (v: boolean) => {
    setIsEditModeInternal(v);
    onEditModeChange?.(v);
  };

  // Drag tracking
  const dragRef = useRef<{
    puntoId: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    currentX: number;
    currentY: number;
    moved: boolean;
  } | null>(null);
  const [draggingPuntoId, setDraggingPuntoId] = useState<string | null>(null);
  const [livePositions, setLivePositions] = useState<Record<string, { x: number; y: number }>>({});

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((prev) => Math.max(0.3, Math.min(5, prev * delta)));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.altKey || (leftClickPans && e.button === 0 && !dragRef.current)) {
      e.preventDefault();
      isPanningRef.current = true;
      lastPanRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanningRef.current) {
      const dx = e.clientX - lastPanRef.current.x;
      const dy = e.clientY - lastPanRef.current.y;
      setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      lastPanRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (dragRef.current) {
      // Drag relativo all'area effettiva dell'immagine (imageWrapperRef),
      // non al container outer che può avere bande vuote (letterbox).
      const wrapper = imageWrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const dxClient = e.clientX - dragRef.current.startClientX;
      const dyClient = e.clientY - dragRef.current.startClientY;
      const newX = Math.max(0, Math.min(100, dragRef.current.origX + (dxClient / (rect.width * scale)) * 100));
      const newY = Math.max(0, Math.min(100, dragRef.current.origY + (dyClient / (rect.height * scale)) * 100));
      dragRef.current.currentX = newX;
      dragRef.current.currentY = newY;
      dragRef.current.moved = true;
      const puntoId = dragRef.current.puntoId;
      setLivePositions((prev) => ({ ...prev, [puntoId]: { x: newX, y: newY } }));
    }
  };

  const handleMouseUp = () => {
    isPanningRef.current = false;

    if (dragRef.current?.moved) {
      const { puntoId, currentX, currentY } = dragRef.current;
      onPuntoDragEnd(puntoId, currentX, currentY);
      setLivePositions((prev) => {
        const next = { ...prev };
        delete next[puntoId];
        return next;
      });
    }
    dragRef.current = null;
    setDraggingPuntoId(null);
  };

  const handleMarkerMouseDown = useCallback(
    (puntoId: string, e: React.MouseEvent) => {
      if (!isEditMode || e.altKey) return;
      e.stopPropagation();
      e.preventDefault();
      const punto = puntiDiScatto.find((p) => p.id === puntoId);
      if (!punto) return;
      dragRef.current = {
        puntoId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origX: punto.x,
        origY: punto.y,
        currentX: punto.x,
        currentY: punto.y,
        moved: false,
      };
      setDraggingPuntoId(puntoId);
    },
    [isEditMode, puntiDiScatto]
  );

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanningRef.current) return;
    // Coordinate relative all'area effettiva dell'immagine, non al container
    // outer (che può avere letterbox quando widget e piantina hanno aspect
    // ratio diversi).
    const wrapper = imageWrapperRef.current;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    // Click fuori dall'area effettiva dell'immagine → ignora
    if (x < 0 || x > 100 || y < 0 || y > 100) return;
    onCanvasClick(x, y);
  };

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-xl"
      style={{
        ...(leftClickPans
          ? { width: "100%", height: "100%", position: "absolute" as const, inset: 0 }
          : { aspectRatio: `${larghezza} / ${altezza}` }),
        background: "var(--surface)",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: "center center",
          width: "100%",
          height: "100%",
          position: "relative",
        }}
      >
        {/*
          imageWrapperRef: questo div ha esattamente l'aspect-ratio della
          piantina e dimensione massima che entra nel parent (letterbox è
          rappresentato dallo spazio attorno a questo wrapper). I marker sono
          posizionati in % di QUESTO wrapper — restano sempre allineati
          all'immagine indipendentemente dalla dimensione del widget esterno.

          Pattern CSS "absolute + inset:0 + margin:auto" centra l'elemento e
          lo dimensiona al massimo che entra nel parent preservando l'aspect.
        */}
        <div
          ref={imageWrapperRef}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            margin: "auto",
            aspectRatio: `${larghezza} / ${altezza}`,
            maxWidth: "100%",
            maxHeight: "100%",
          }}
        >
          <img
            src={fileUrl}
            alt="Piantina"
            className="block w-full h-full"
            style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }}
            draggable={false}
            onClick={handleCanvasClick}
          />

          {puntiDiScatto.map((punto, index) => {
            const live = livePositions[punto.id];
            return (
              <PuntoDiScattoMarker
                key={punto.id}
                id={punto.id}
                nome={punto.nome}
                x={live?.x ?? punto.x}
                y={live?.y ?? punto.y}
                number={index + 1}
                fotoCount={punto.foto360.length}
                dimensione={punto.dimensione}
                isSelected={selectedPuntoId === punto.id}
                editMode={isEditMode}
                isDragging={draggingPuntoId === punto.id}
                dateStatus={dateStatusByPuntoId?.[punto.id]}
                onClick={() =>
                  onPuntoClick ? onPuntoClick(punto.id) : router.push(`/dashboard/punti/${punto.id}`)
                }
                onMarkerMouseDown={(e) => handleMarkerMouseDown(punto.id, e)}
              />
            );
          })}
        </div>
      </div>

      {/* Edit mode toggle — hidden in minimap mode */}
      {!leftClickPans && <div className="absolute top-3 left-3">
        <button
          onClick={() => setIsEditMode(!isEditMode)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
          style={
            isEditMode
              ? { background: "#6366f1", color: "#fff", boxShadow: "0 2px 8px rgba(99,102,241,0.4)" }
              : { background: "rgba(0,0,0,0.6)", color: "#fff" }
          }
          title={isEditMode ? "Termina modifica posizioni" : "Modifica posizione punti"}
        >
          {isEditMode ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Pencil className="w-3.5 h-3.5" />
          )}
          {isEditMode ? "Fine" : "Modifica"}
        </button>
      </div>}

      {/* Zoom controls — hidden in minimap mode */}
      {!leftClickPans && <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <button
          onClick={() => setScale((s) => Math.min(5, s * 1.2))}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors"
          style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={() => {
            setScale(1);
            setOffset({ x: 0, y: 0 });
          }}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-colors"
          style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
          title="Reset"
        >
          &#8634;
        </button>
        <button
          onClick={() => setScale((s) => Math.max(0.3, s / 1.2))}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors"
          style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
          title="Zoom out"
        >
          &minus;
        </button>
      </div>}
    </div>
  );
}
