"use client";

import { useDraggable } from "@dnd-kit/core";
import { Camera } from "lucide-react";

interface PuntoDiScattoMarkerProps {
  id: string;
  nome: string;
  x: number;
  y: number;
  fotoCount: number;
  isSelected?: boolean;
  onClick: () => void;
}

export default function PuntoDiScattoMarker({
  id,
  nome,
  x,
  y,
  fotoCount,
  isSelected,
  onClick,
}: PuntoDiScattoMarkerProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="absolute group"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -50%)",
        zIndex: isDragging ? 50 : isSelected ? 20 : 10,
        cursor: isDragging ? "grabbing" : "grab",
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {/* Marker pin */}
      <div
        className="relative flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200"
        style={{
          background: isSelected ? "#6366f1" : fotoCount > 0 ? "#22c55e" : "#8888aa",
          boxShadow: isSelected
            ? "0 0 0 3px rgba(99,102,241,0.4), 0 4px 12px rgba(0,0,0,0.4)"
            : "0 2px 8px rgba(0,0,0,0.4)",
          transform: isDragging ? "scale(1.2)" : "scale(1)",
        }}
      >
        <Camera className="w-4 h-4 text-white" />
        {fotoCount > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-white flex items-center justify-center text-xs font-bold"
            style={{ background: "#6366f1", fontSize: 9 }}
          >
            {fotoCount > 9 ? "9+" : fotoCount}
          </span>
        )}
      </div>

      {/* Tooltip */}
      <div
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded-lg text-xs font-medium text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{ background: "rgba(0,0,0,0.8)" }}
      >
        {nome}
      </div>
    </div>
  );
}
