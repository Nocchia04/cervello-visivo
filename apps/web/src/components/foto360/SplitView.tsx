"use client";

import { useState, useRef, useCallback } from "react";
import { safeDate } from "@/lib/dateUtils";
import InlineViewer360, { InlineViewer360Handle } from "./InlineViewer360";

interface Foto {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  timestamp: string;
}

interface SplitViewProps {
  foto360List: Foto[];
}

export default function SplitView({ foto360List }: SplitViewProps) {
  const [leftIndex, setLeftIndex] = useState(0);
  const [rightIndex, setRightIndex] = useState(
    Math.min(1, foto360List.length - 1)
  );
  const [zoom, setZoom] = useState(1);
  const [syncEnabled, setSyncEnabled] = useState(true);

  const leftViewerRef = useRef<InlineViewer360Handle>(null);
  const rightViewerRef = useRef<InlineViewer360Handle>(null);

  const handleLeftScroll = useCallback(
    (scrollLeft: number, scrollTop: number) => {
      if (syncEnabled && rightViewerRef.current) {
        rightViewerRef.current.setScrollPosition(scrollLeft, scrollTop);
      }
    },
    [syncEnabled]
  );

  const handleRightScroll = useCallback(
    (scrollLeft: number, scrollTop: number) => {
      if (syncEnabled && leftViewerRef.current) {
        leftViewerRef.current.setScrollPosition(scrollLeft, scrollTop);
      }
    },
    [syncEnabled]
  );

  if (foto360List.length < 2) {
    return (
      <div className="text-center py-8 text-gray-500">
        Servono almeno 2 foto per la vista comparativa
      </div>
    );
  }

  const formatDate = (ts: string) =>
    safeDate(ts).toLocaleString("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="flex flex-col h-full">
      {/* Controls bar */}
      <div className="flex items-center justify-between px-4 py-2 rounded-t-lg" style={{ background: "var(--surface-hover)", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={syncEnabled}
              onChange={(e) => setSyncEnabled(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            Scroll sincronizzato
          </label>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Zoom:</span>
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            className="w-7 h-7 flex items-center justify-center rounded bg-white border text-gray-600 hover:bg-gray-50 text-sm"
          >
            -
          </button>
          <span className="text-sm text-gray-700 w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
            className="w-7 h-7 flex items-center justify-center rounded bg-white border text-gray-600 hover:bg-gray-50 text-sm"
          >
            +
          </button>
        </div>
      </div>

      {/* Split panels */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel */}
        <div className="flex-1 flex flex-col border-r">
          <div className="flex items-center gap-2 p-2" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
            <select
              value={leftIndex}
              onChange={(e) => setLeftIndex(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded px-2 py-1 flex-1"
            >
              {foto360List.map((foto, i) => (
                <option key={foto.id} value={i}>
                  {formatDate(foto.timestamp)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-h-0">
            <InlineViewer360
              ref={leftViewerRef}
              url={foto360List[leftIndex].url}
              zoom={zoom}
              onScroll={handleLeftScroll}
            />
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center gap-2 p-2" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
            <select
              value={rightIndex}
              onChange={(e) => setRightIndex(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded px-2 py-1 flex-1"
            >
              {foto360List.map((foto, i) => (
                <option key={foto.id} value={i}>
                  {formatDate(foto.timestamp)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-h-0">
            <InlineViewer360
              ref={rightViewerRef}
              url={foto360List[rightIndex].url}
              zoom={zoom}
              onScroll={handleRightScroll}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
