"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Trash2, X } from "lucide-react";
import { safeDate } from "@/lib/dateUtils";

interface Foto {
  id: string;
  timestamp: string;
}

interface DateDropdownProps {
  fotos: Foto[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  open: boolean;
  onToggle: () => void;
  onDelete?: (fotoId: string) => void;
  openUpward?: boolean;
  darkTheme?: boolean;
}

export default function DateDropdown({
  fotos,
  selectedIndex,
  onSelect,
  open,
  onToggle,
  onDelete,
  openUpward,
  darkTheme,
}: DateDropdownProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentFoto = fotos[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        onToggle();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onToggle]);

  if (fotos.length === 0) return null;

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "8px 10px",
          background: "transparent",
          border: darkTheme ? "1px solid rgba(255,255,255,0.2)" : "1px solid var(--border)",
          borderRadius: 10,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 500,
          color: darkTheme ? "#fff" : "var(--text)",
        }}
      >
        <span style={{ flex: 1, textAlign: "left" }}>
          {currentFoto
            ? `${safeDate(currentFoto.timestamp).toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })} ${safeDate(currentFoto.timestamp).toLocaleTimeString("it-IT", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })} (#${selectedIndex + 1})`
            : "Seleziona data"}
        </span>
        <ChevronDown
          className="w-3.5 h-3.5"
          style={{
            color: darkTheme ? "rgba(255,255,255,0.6)" : "var(--text-muted)",
            transition: "transform 0.15s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            ...(openUpward
              ? { bottom: "100%", marginBottom: 4 }
              : { top: "100%", marginTop: 4 }),
            left: 0,
            right: 0,
            background: "rgba(255,255,255,0.98)",
            backdropFilter: "blur(12px)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            maxHeight: 240,
            overflowY: "auto",
            zIndex: 60,
          }}
        >
          {fotos.map((foto, idx) => (
            <div
              key={foto.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                width: "100%",
                padding: "6px 10px",
                background:
                  idx === selectedIndex ? "var(--surface-hover)" : "transparent",
                borderBottom:
                  idx < fotos.length - 1
                    ? "1px solid var(--border)"
                    : "none",
                fontSize: 12,
                color: "var(--text)",
              }}
            >
              <button
                onClick={() => {
                  onSelect(idx);
                  onToggle();
                }}
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "var(--text)",
                  textAlign: "left",
                  padding: 0,
                }}
              >
                <span style={{ color: "var(--text-muted)", marginRight: 4, minWidth: 18, display: "inline-block" }}>
                  #{idx + 1}
                </span>
                {safeDate(foto.timestamp).toLocaleDateString("it-IT", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
                {" "}
                <span style={{ color: "var(--text-muted)" }}>
                  {safeDate(foto.timestamp).toLocaleTimeString("it-IT", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              </button>
              {idx === selectedIndex && (
                <Check className="w-3 h-3 flex-shrink-0" style={{ color: "#6366f1" }} />
              )}
              {onDelete && (
                confirmDeleteId === foto.id ? (
                  <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(foto.id); setConfirmDeleteId(null); }}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex" }}
                      title="Conferma"
                    >
                      <Check className="w-3 h-3" style={{ color: "#ef4444" }} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex" }}
                      title="Annulla"
                    >
                      <X className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(foto.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", flexShrink: 0, opacity: 0.4 }}
                    title="Elimina foto"
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.4"; }}
                  >
                    <Trash2 className="w-3 h-3" style={{ color: "#ef4444" }} />
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
