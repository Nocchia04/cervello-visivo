"use client";

import { useState, useRef, useCallback } from "react";
import { safeDate } from "@/lib/dateUtils";
import SyncedViewer360, { SyncedViewer360Handle } from "./SyncedViewer360";

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
  const [syncEnabled, setSyncEnabled] = useState(true);

  const leftViewerRef = useRef<SyncedViewer360Handle>(null);
  const rightViewerRef = useRef<SyncedViewer360Handle>(null);
  const syncEnabledRef = useRef(true);

  // Keep syncEnabledRef in sync so drag callbacks don't use stale closure
  const handleSyncToggle = (enabled: boolean) => {
    syncEnabledRef.current = enabled;
    setSyncEnabled(enabled);
  };

  const handleLeftRotate = useCallback((lon: number, lat: number) => {
    if (syncEnabledRef.current) {
      rightViewerRef.current?.setCamera(lon, lat);
    }
  }, []);

  const handleRightRotate = useCallback((lon: number, lat: number) => {
    if (syncEnabledRef.current) {
      leftViewerRef.current?.setCamera(lon, lat);
    }
  }, []);

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
      <div
        className="flex items-center px-4 py-2 rounded-t-lg"
        style={{
          background: "var(--surface-hover)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={syncEnabled}
            onChange={(e) => handleSyncToggle(e.target.checked)}
            className="rounded border-gray-300"
          />
          Rotazione sincronizzata
        </label>
      </div>

      {/* Split panels */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel */}
        <div className="flex-1 flex flex-col border-r" style={{ borderColor: "var(--border)" }}>
          <div
            className="flex items-center gap-2 p-2"
            style={{
              background: "var(--surface)",
              borderBottom: "1px solid var(--border)",
            }}
          >
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
            <SyncedViewer360
              ref={leftViewerRef}
              url={foto360List[leftIndex].url}
              onRotate={handleLeftRotate}
            />
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col">
          <div
            className="flex items-center gap-2 p-2"
            style={{
              background: "var(--surface)",
              borderBottom: "1px solid var(--border)",
            }}
          >
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
            <SyncedViewer360
              ref={rightViewerRef}
              url={foto360List[rightIndex].url}
              onRotate={handleRightRotate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
