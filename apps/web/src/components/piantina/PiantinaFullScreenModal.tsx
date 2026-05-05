"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@apollo/client";
import { X, Plus, Pencil, Check } from "lucide-react";
import PiantinaCanvas from "./PiantinaCanvas";
import { GET_PIANTINA } from "@/graphql/queries";
import {
  AGGIUNGI_PUNTO_DI_SCATTO,
  SPOSTA_PUNTO_DI_SCATTO,
} from "@/graphql/mutations";
import { safeDate } from "@/lib/dateUtils";

interface Foto {
  id: string;
  timestamp: string;
}

interface Punto {
  id: string;
  nome: string;
  x: number;
  y: number;
  foto360: Foto[];
}

interface PiantinaFullScreenModalProps {
  piantinaId: string;
}

export default function PiantinaFullScreenModal({
  piantinaId,
}: PiantinaFullScreenModalProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const isOpen = searchParams.get("map") === "1";
  const selectedPuntoId = searchParams.get("punto");
  const selectedFotoIndex = parseInt(searchParams.get("foto") ?? "0", 10) || 0;
  const editingPositions = searchParams.get("edit") === "1";

  const [addingPunto, setAddingPunto] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{ x: number; y: number } | null>(null);
  const [nuovoPuntoNome, setNuovoPuntoNome] = useState("");

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams]
  );

  const close = useCallback(() => {
    setAddingPunto(false);
    setPendingCoords(null);
    setNuovoPuntoNome("");
    updateParams({ map: null, edit: null });
  }, [updateParams]);

  const { data, refetch } = useQuery(GET_PIANTINA, {
    variables: { id: piantinaId },
    skip: !isOpen,
  });
  const piantina = data?.piantina;
  const punti: Punto[] = piantina?.puntiDiScatto ?? [];

  const [aggiungiPuntoMutation] = useMutation(AGGIUNGI_PUNTO_DI_SCATTO, {
    onCompleted: () => {
      refetch();
      setAddingPunto(false);
      setPendingCoords(null);
      setNuovoPuntoNome("");
    },
  });

  const [spostaPunto] = useMutation(SPOSTA_PUNTO_DI_SCATTO, {
    onCompleted: () => refetch(),
  });

  // Date status map for marker coloring (same logic as widget)
  const currentFoto = useMemo(() => {
    const punto = punti.find((p) => p.id === selectedPuntoId);
    if (!punto) return null;
    const sorted = [...punto.foto360].sort(
      (a, b) => safeDate(b.timestamp).getTime() - safeDate(a.timestamp).getTime()
    );
    return sorted[selectedFotoIndex] ?? null;
  }, [punti, selectedPuntoId, selectedFotoIndex]);

  const dateStatusByPuntoId = useMemo<Record<string, "same" | "before" | "after">>(() => {
    if (!currentFoto) return {};
    const ref = safeDate(currentFoto.timestamp);
    const refKey = `${ref.getFullYear()}-${ref.getMonth()}-${ref.getDate()}`;
    const result: Record<string, "same" | "before" | "after"> = {};
    for (const p of punti) {
      if (p.foto360.length === 0) continue;
      let hasSame = false, hasBefore = false, hasAfter = false;
      for (const f of p.foto360) {
        const d = safeDate(f.timestamp);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (key === refKey) hasSame = true;
        else if (d.getTime() < ref.getTime()) hasBefore = true;
        else hasAfter = true;
      }
      if (hasSame) result[p.id] = "same";
      else if (hasAfter) result[p.id] = "after";
      else if (hasBefore) result[p.id] = "before";
    }
    return result;
  }, [punti, currentFoto]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCanvasClick = useCallback((x: number, y: number) => {
    if (addingPunto) {
      setPendingCoords({ x, y });
    }
  }, [addingPunto]);

  const handlePuntoClick = useCallback((puntoId: string) => {
    if (addingPunto) {
      setAddingPunto(false);
      setPendingCoords(null);
      return;
    }
    updateParams({ punto: puntoId, foto: "0" });
  }, [addingPunto, updateParams]);

  const handleDragEnd = useCallback((puntoId: string, x: number, y: number) => {
    spostaPunto({ variables: { id: puntoId, x, y } });
  }, [spostaPunto]);

  const handleAddPunto = () => {
    if (!pendingCoords || !nuovoPuntoNome.trim()) return;
    aggiungiPuntoMutation({
      variables: {
        piantinaId,
        nome: nuovoPuntoNome.trim(),
        x: pendingCoords.x,
        y: pendingCoords.y,
      },
    });
  };

  if (!isOpen || !piantina) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-6 py-4 flex-shrink-0"
        style={{ background: "rgba(0,0,0,0.4)" }}
      >
        <div>
          <h2 className="text-lg font-bold" style={{ color: "#fff" }}>
            {piantina.nome}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>
            {punti.length} punti di scatto · {editingPositions ? "Modalità modifica posizioni" : "Visualizzazione"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Edit positions toggle */}
          <button
            onClick={() => updateParams({ edit: editingPositions ? null : "1" })}
            style={{
              background: editingPositions ? "#6366f1" : "rgba(255,255,255,0.1)",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
            }}
          >
            <Pencil className="w-3.5 h-3.5" />
            {editingPositions ? "Fine modifica" : "Modifica posizioni"}
          </button>

          {/* Add punto */}
          <button
            onClick={() => {
              setAddingPunto(!addingPunto);
              setPendingCoords(null);
            }}
            style={{
              background: addingPunto ? "#6366f1" : "rgba(255,255,255,0.1)",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            {addingPunto ? "Annulla" : "Aggiungi punto"}
          </button>

          {/* Close */}
          <button
            onClick={close}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "none",
              borderRadius: 999,
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#fff",
            }}
            title="Chiudi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Hint banner ────────────────────────────────────────────────── */}
      {addingPunto && !pendingCoords && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10"
          style={{
            top: 80,
            background: "rgba(99,102,241,0.95)",
            color: "#fff",
            borderRadius: 999,
            padding: "8px 20px",
            fontSize: 13,
            fontWeight: 500,
            backdropFilter: "blur(8px)",
          }}
        >
          Clicca sulla piantina per posizionare il nuovo punto
        </div>
      )}

      {/* ── Canvas (full-screen, contained) ─────────────────────────────── */}
      <div className="flex-1 min-h-0 px-6 pb-6">
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "rgba(255,255,255,0.95)",
            borderRadius: 16,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <PiantinaCanvas
            piantinaId={piantinaId}
            fileUrl={piantina.fileUrl}
            larghezza={piantina.larghezza}
            altezza={piantina.altezza}
            puntiDiScatto={punti}
            selectedPuntoId={selectedPuntoId}
            onPuntoDragEnd={handleDragEnd}
            onCanvasClick={handleCanvasClick}
            onPuntoClick={handlePuntoClick}
            editModeExternal={editingPositions}
            dateStatusByPuntoId={dateStatusByPuntoId}
          />
        </div>
      </div>

      {/* ── Add punto dialog ───────────────────────────────────────────── */}
      {addingPunto && pendingCoords && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
        >
          <div className="card w-full max-w-sm">
            <h3 className="font-semibold mb-4">Nuovo punto di scatto</h3>
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
              Posizione: {pendingCoords.x.toFixed(1)}%, {pendingCoords.y.toFixed(1)}%
            </p>
            <input
              type="text"
              className="input-field mb-4"
              placeholder="Nome del punto (es. Cucina, Salone...)"
              value={nuovoPuntoNome}
              onChange={(e) => setNuovoPuntoNome(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddPunto();
                if (e.key === "Escape") {
                  setPendingCoords(null);
                  setAddingPunto(false);
                  setNuovoPuntoNome("");
                }
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setPendingCoords(null);
                  setAddingPunto(false);
                  setNuovoPuntoNome("");
                }}
                className="btn-secondary flex-1"
              >
                Annulla
              </button>
              <button
                onClick={handleAddPunto}
                className="btn-primary flex-1"
                disabled={!nuovoPuntoNome.trim()}
              >
                <Check className="w-4 h-4" />
                Aggiungi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
