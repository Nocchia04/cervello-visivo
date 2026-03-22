"use client";

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
  onClick: () => void;
  onMarkerMouseDown?: (e: React.MouseEvent) => void;
}

export default function PuntoDiScattoMarker({
  nome,
  x,
  y,
  number,
  fotoCount,
  isSelected,
  editMode,
  isDragging,
  onClick,
  onMarkerMouseDown,
}: PuntoDiScattoMarkerProps) {
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
        className="relative flex items-center justify-center w-8 h-8 rounded-full transition-all duration-150"
        style={{
          background: isSelected ? "#6366f1" : fotoCount > 0 ? "#22c55e" : "#8888aa",
          boxShadow: isSelected
            ? "0 0 0 3px rgba(99,102,241,0.4), 0 4px 12px rgba(0,0,0,0.4)"
            : "0 2px 8px rgba(0,0,0,0.4)",
          transform: isDragging ? "scale(1.2)" : "scale(1)",
          outline: editMode ? "2px dashed rgba(255,255,255,0.5)" : "none",
          outlineOffset: "2px",
        }}
      >
        <span className="text-white font-bold leading-none" style={{ fontSize: 13 }}>
          {number}
        </span>
        {fotoCount > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-white flex items-center justify-center font-bold"
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
