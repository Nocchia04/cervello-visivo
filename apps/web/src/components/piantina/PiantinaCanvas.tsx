"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import PuntoDiScattoMarker from "./PuntoDiScattoMarker";

interface Foto {
  id: string;
}

interface Punto {
  id: string;
  nome: string;
  x: number;
  y: number;
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
}: PiantinaCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const lastPanRef = useRef({ x: 0, y: 0 });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

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
    if (e.button === 1 || e.altKey) {
      e.preventDefault();
      isPanningRef.current = true;
      lastPanRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanningRef.current) return;
    const dx = e.clientX - lastPanRef.current.x;
    const dy = e.clientY - lastPanRef.current.y;
    setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    lastPanRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isPanningRef.current = false;
  };

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, delta } = event;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const deltaXPercent = (delta.x / (rect.width * scale)) * 100;
      const deltaYPercent = (delta.y / (rect.height * scale)) * 100;
      const punto = puntiDiScatto.find((p) => p.id === active.id);
      if (!punto) return;
      const newX = Math.max(0, Math.min(100, punto.x + deltaXPercent));
      const newY = Math.max(0, Math.min(100, punto.y + deltaYPercent));
      onPuntoDragEnd(active.id as string, newX, newY);
    },
    [puntiDiScatto, onPuntoDragEnd, scale]
  );

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanningRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onCanvasClick(x, y);
  };

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-xl"
      style={{ aspectRatio: `${larghezza} / ${altezza}`, background: "var(--surface)" }}
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
        <img
          src={fileUrl}
          alt="Piantina"
          className="absolute inset-0 w-full h-full object-contain"
          draggable={false}
          onClick={handleCanvasClick}
        />

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          {puntiDiScatto.map((punto) => (
            <PuntoDiScattoMarker
              key={punto.id}
              id={punto.id}
              nome={punto.nome}
              x={punto.x}
              y={punto.y}
              fotoCount={punto.foto360.length}
              isSelected={selectedPuntoId === punto.id}
              onClick={() => onPuntoClick ? onPuntoClick(punto.id) : router.push(`/dashboard/punti/${punto.id}`)}
            />
          ))}
        </DndContext>
      </div>

      {/* Zoom controls */}
      <div
        className="absolute bottom-3 right-3 flex flex-col gap-1"
      >
        <button
          onClick={() => setScale((s) => Math.min(5, s * 1.2))}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors"
          style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
          title="Zoom in"
        >+</button>
        <button
          onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-colors"
          style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
          title="Reset"
        >&#8634;</button>
        <button
          onClick={() => setScale((s) => Math.max(0.3, s / 1.2))}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors"
          style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
          title="Zoom out"
        >&minus;</button>
      </div>
    </div>
  );
}
