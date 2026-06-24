"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Upload, Columns2, Maximize2, Minimize2 } from "lucide-react";
import dynamic from "next/dynamic";
import { GET_FOTO360 } from "@/graphql/queries";
import { UPLOAD_FOTO360 } from "@/graphql/mutations";
import SplitView from "@/components/foto360/SplitView";
import { uploadFile } from "@/lib/upload";
import { safeDate } from "@/lib/dateUtils";

const EmbeddedViewer360 = dynamic(
  () => import("@/components/foto360/EmbeddedViewer360"),
  { ssr: false }
);

type ViewMode = "single" | "split";

interface Foto {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  timestamp: string;
  uploadedBy: { id: string; nome: string; cognome: string };
}

// ─── Upload Button ─────────────────────────────────────────────────────────────

function UploadButton({ puntoId, onDone }: { puntoId: string; onDone: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const [uploadFoto360] = useMutation(UPLOAD_FOTO360, { onCompleted: () => onDone() });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    setUploading(true);
    setProgress(0);
    try {
      for (let i = 0; i < arr.length; i++) {
        const url = await uploadFile(arr[i]);
        await uploadFoto360({ variables: { puntoDiScattoId: puntoId, url } });
        setProgress(Math.round(((i + 1) / arr.length) * 100));
      }
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-secondary">
        {uploading ? (
          <span className="flex items-center gap-2">
            <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2" style={{ borderColor: "var(--accent)" }} />
            {progress > 0 ? `${progress}%` : "Caricamento..."}
          </span>
        ) : (
          <>
            <Upload className="w-3.5 h-3.5" />
            Aggiungi foto
          </>
        )}
      </button>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PuntoDettaglioPage() {
  const params = useParams();
  const router = useRouter();
  const puntoId = params.id as string;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, loading, refetch } = useQuery(GET_FOTO360, { variables: { puntoId } });

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  const fotoList: Foto[] = data?.foto360 ?? [];
  const sortedFoto = [...fotoList].sort(
    (a, b) => safeDate(a.timestamp).getTime() - safeDate(b.timestamp).getTime()
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2" style={{ borderColor: "var(--accent)" }} />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col"
      style={{
        height: isFullscreen ? "100vh" : "calc(100vh - 80px)",
        background: "var(--bg)",
        padding: isFullscreen ? "20px" : undefined,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="btn-ghost p-2">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold leading-tight">Punto di scatto</h1>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {sortedFoto.length} foto · time travel attivo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <UploadButton puntoId={puntoId} onDone={refetch} />

          {/* Confronta toggle */}
          <button
            onClick={() => setViewMode(viewMode === "split" ? "single" : "split")}
            className={viewMode === "split" ? "btn-primary" : "btn-secondary"}
          >
            <Columns2 className="w-3.5 h-3.5" />
            Confronta
          </button>

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="btn-ghost p-2"
            title={isFullscreen ? "Esci da schermo intero" : "Schermo intero"}
          >
            {isFullscreen
              ? <Minimize2 className="w-4 h-4" />
              : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── Viewer area (fills remaining height) ───────────────────────── */}
      {sortedFoto.length === 0 ? (
        <div className="flex-1 card flex flex-col items-center justify-center text-center">
          <Upload className="w-12 h-12 mb-4" style={{ color: "var(--border-strong)" }} />
          <p className="font-semibold">Nessuna foto 360°</p>
          <p className="text-sm mt-1 mb-5" style={{ color: "var(--text-muted)" }}>
            Carica le foto equirettangolari per questo punto
          </p>
          <UploadButton puntoId={puntoId} onDone={refetch} />
        </div>
      ) : viewMode === "split" ? (
        <div className="flex-1 rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <SplitView foto360List={sortedFoto} />
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <EmbeddedViewer360
            foto={sortedFoto}
            currentIndex={currentIndex}
            onIndexChange={setCurrentIndex}
          />
        </div>
      )}
    </div>
  );
}
