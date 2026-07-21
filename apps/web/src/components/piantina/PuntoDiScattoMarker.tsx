"use client";

export type PuntoDateStatus = "same" | "before" | "after";

interface PuntoDiScattoMarkerProps {
  id: string;
  nome: string;
  x: number;
  y: number;
  number: number;
  fotoCount: number;
  isSelected?: boolean;
  editMode?: boolean;
  isDragging?: boolean;
  /** Dimensione del cerchietto: PICCOLO | MEDIO | GRANDE | XL */
  dimensione?: string;
  /** Color hint based on selected foto's day. Undefined → fallback green (or grey if empty) */
  dateStatus?: PuntoDateStatus;
  onClick: () => void;
  onMarkerMouseDown?: (e: React.MouseEvent) => void;
}

/** Diametro in px per dimensione del marker. */
export const MARKER_SIZE_PX: Record<string, number> = {
  PICCOLO: 18,
  MEDIO: 24,
  GRANDE: 32,
  XL: 44,
};

export default function PuntoDiScattoMarker({
  nome,
  x,
  y,
  number,
  fotoCount,
  isSelected,
  editMode,
  isDragging,
  dimensione,
  dateStatus,
  onClick,
  onMarkerMouseDown,
}: PuntoDiScattoMarkerProps) {
  const diameter = MARKER_SIZE_PX[dimensione ?? "MEDIO"] ?? 24;
  const numberFont = Math.round(diameter * 0.46);
  const badgeSize = Math.round(diameter * 0.58);
  const badgeFont = Math.max(7, Math.round(diameter * 0.33));
  const bodyColor =
    fotoCount === 0
      ? "#8888aa"
      : dateStatus === "after"
      ? "#60a5fa"
      : dateStatus === "before"
      ? "#f87171"
      : "#22c55e";

  return (
    <div
      className="absolute group"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -50%)",
        zIndex: isDragging ? 50 : isSelected ? 20 : 10,
        cursor: editMode ? (isDragging ? "grabbing" : "grab") : "pointer",
        userSelect: "none",
      }}
      onMouseDown={editMode ? onMarkerMouseDown : undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (!editMode) onClick();
      }}
    >
      {/* Marker pin */}
      <div
        className="relative flex items-center justify-center rounded-full transition-all duration-150"
        style={{
          width: diameter,
          height: diameter,
          background: bodyColor,
          boxShadow: isSelected
            ? "0 0 0 3px rgba(99,102,241,0.45), 0 4px 12px rgba(0,0,0,0.4)"
            : "0 2px 8px rgba(0,0,0,0.4)",
          transform: isDragging ? "scale(1.2)" : "scale(1)",
          outline: editMode ? "2px dashed rgba(255,255,255,0.5)" : "none",
          outlineOffset: "2px",
        }}
      >
        <span className="text-white font-bold leading-none" style={{ fontSize: numberFont }}>
          {number}
        </span>
        {fotoCount > 0 && (
          <span
            className="absolute rounded-full text-white flex items-center justify-center font-bold"
            style={{
              top: -badgeSize / 3,
              right: -badgeSize / 3,
              width: badgeSize,
              height: badgeSize,
              background: "#6366f1",
              fontSize: badgeFont,
            }}
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
