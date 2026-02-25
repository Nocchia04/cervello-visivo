"use client";

import { Camera, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { safeDate } from "@/lib/dateUtils";

interface Foto {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  timestamp: string;
}

interface TimeTravelSliderProps {
  foto360List: Foto[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
}

export default function TimeTravelSlider({
  foto360List,
  currentIndex,
  onIndexChange,
}: TimeTravelSliderProps) {
  if (foto360List.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-6 text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        <Camera className="w-6 h-6 mb-2 opacity-40" />
        Nessuna foto disponibile
      </div>
    );
  }

  const currentFoto = foto360List[currentIndex];

  return (
    <div className="flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5"
          style={{ color: "var(--text-muted)" }}
        >
          <Clock className="w-3.5 h-3.5" />
          Time Travel
        </span>
        <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>
          {safeDate(currentFoto.timestamp).toLocaleString("it-IT", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {/* Thumbnail strip */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {foto360List.map((foto, i) => (
          <button
            key={foto.id}
            onClick={() => onIndexChange(i)}
            className="flex-shrink-0 rounded-lg overflow-hidden transition-all duration-150 relative"
            style={{
              width: 72,
              height: 48,
              background: "var(--surface-hover)",
              border:
                i === currentIndex
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
              boxShadow:
                i === currentIndex
                  ? "0 0 8px var(--accent-glow)"
                  : "none",
            }}
            title={safeDate(foto.timestamp).toLocaleDateString("it-IT")}
          >
            {foto.thumbnailUrl ? (
              <img
                src={foto.thumbnailUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Camera className="w-4 h-4 opacity-30" />
              </div>
            )}
            {/* Date label on hover */}
            <div
              className="absolute bottom-0 left-0 right-0 text-center py-0.5"
              style={{
                background: "rgba(0,0,0,0.7)",
                fontSize: 8,
                color: i === currentIndex ? "var(--accent)" : "#fff",
              }}
            >
              {safeDate(foto.timestamp).toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "2-digit",
              })}
            </div>
          </button>
        ))}
      </div>

      {/* Slider + arrows */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onIndexChange(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
          className="btn-ghost p-1.5 flex-shrink-0"
          style={{ opacity: currentIndex === 0 ? 0.3 : 1 }}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex-1 relative">
          <input
            type="range"
            min={0}
            max={foto360List.length - 1}
            value={currentIndex}
            onChange={(e) => onIndexChange(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: "var(--accent)", background: "var(--border)" }}
          />
        </div>

        <button
          onClick={() =>
            onIndexChange(Math.min(foto360List.length - 1, currentIndex + 1))
          }
          disabled={currentIndex === foto360List.length - 1}
          className="btn-ghost p-1.5 flex-shrink-0"
          style={{
            opacity: currentIndex === foto360List.length - 1 ? 0.3 : 1,
          }}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Counter */}
      <p className="text-center text-xs" style={{ color: "var(--text-muted)" }}>
        {currentIndex + 1} / {foto360List.length} foto
      </p>
    </div>
  );
}
