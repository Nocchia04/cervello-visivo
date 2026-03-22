"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, Camera, MapPin, Users, Plus, Archive, RotateCcw } from "lucide-react";
import { safeDate } from "@/lib/dateUtils";
import { GET_CANTIERI } from "@/graphql/queries";
import { ARCHIVIA_CANTIERE, RIATTIVA_CANTIERE } from "@/graphql/mutations";

interface Piantina {
  id: string;
  fileUrl: string;
}

interface Cantiere {
  id: string;
  nome: string;
  indirizzo: string;
  stato: "ATTIVO" | "ARCHIVIATO";
  thumbnailUrl?: string;
  piantine: Piantina[];
  createdAt: string;
}

function BentoCard({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: React.ElementType;
  value: number | string;
  label: string;
  color: string;
}) {
  return (
    <div className="card flex flex-col gap-3">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: `${color}22` }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <div className="text-3xl font-bold">{value}</div>
        <div className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
          {label}
        </div>
      </div>
    </div>
  );
}

function CantiereCard({
  cantiere,
  onArchivia,
  onRiattiva,
}: {
  cantiere: Cantiere;
  onArchivia: (id: string) => void;
  onRiattiva: (id: string) => void;
}) {
  const router = useRouter();
  const isAttivo = cantiere.stato === "ATTIVO";

  return (
    <div
      className="rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 group"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 0 1px var(--accent)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
      onClick={() => router.push(`/dashboard/cantieri/${cantiere.id}`)}
    >
      {/* Thumbnail area */}
      <div
        className="relative h-40 flex items-center justify-center"
        style={{ background: "var(--surface-hover)" }}
      >
        {(() => {
          const previewUrl = cantiere.thumbnailUrl ?? cantiere.piantine[0]?.fileUrl ?? null;
          return previewUrl ? (
            <img
              src={previewUrl}
              alt={cantiere.nome}
              className="w-full h-full object-cover"
            />
          ) : (
            <Camera className="w-10 h-10" style={{ color: "var(--border-strong)" }} />
          );
        })()}
        {/* Badge */}
        <div className="absolute top-3 right-3">
          {isAttivo ? (
            <span className="badge-attivo">● Attivo</span>
          ) : (
            <span className="badge-archiviato">Archiviato</span>
          )}
        </div>
        {/* Action buttons on hover */}
        <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity">
          {isAttivo ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onArchivia(cantiere.id);
              }}
              className="btn-ghost text-xs px-2 py-1 rounded-lg"
              style={{ background: "rgba(0,0,0,0.6)" }}
              title="Archivia"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRiattiva(cantiere.id);
              }}
              className="btn-ghost text-xs px-2 py-1 rounded-lg"
              style={{ background: "rgba(0,0,0,0.6)" }}
              title="Riattiva"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Info area */}
      <div className="p-4">
        <h3 className="font-semibold text-base truncate">{cantiere.nome}</h3>
        <p
          className="text-sm mt-1 flex items-center gap-1 truncate"
          style={{ color: "var(--text-muted)" }}
        >
          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
          {cantiere.indirizzo}
        </p>
        <div
          className="flex items-center gap-3 mt-3 pt-3 text-xs"
          style={{
            color: "var(--text-muted)",
            borderTop: "1px solid var(--border)",
          }}
        >
          <span className="flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" />
            {cantiere.piantine.length} piante
          </span>
          <span className="ml-auto">
            {safeDate(cantiere.createdAt).toLocaleDateString("it-IT", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [mostraArchiviati, setMostraArchiviati] = useState(false);
  const { data, loading, refetch } = useQuery(GET_CANTIERI, {
    variables: { includiArchiviati: true },
  });

  const [archivia] = useMutation(ARCHIVIA_CANTIERE, { onCompleted: () => refetch() });
  const [riattiva] = useMutation(RIATTIVA_CANTIERE, { onCompleted: () => refetch() });

  const allCantieri: Cantiere[] = data?.cantieri ?? [];
  const cantieri = mostraArchiviati
    ? allCantieri
    : allCantieri.filter((c) => c.stato === "ATTIVO");

  const attiviCount = allCantieri.filter((c) => c.stato === "ATTIVO").length;
  const archiviatiCount = allCantieri.filter((c) => c.stato === "ARCHIVIATO").length;
  const piantinaCount = allCantieri.reduce((acc, c) => acc + c.piantine.length, 0);

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Panoramica dei tuoi cantieri
        </p>
      </div>

      {/* Bento stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <BentoCard
          icon={Building2}
          value={attiviCount}
          label="Cantieri attivi"
          color="#6366f1"
        />
        <BentoCard
          icon={Archive}
          value={archiviatiCount}
          label="Archiviati"
          color="#8888aa"
        />
        <BentoCard
          icon={MapPin}
          value={piantinaCount}
          label="Piante caricate"
          color="#22c55e"
        />
        <BentoCard
          icon={Camera}
          value="—"
          label="Foto 360°"
          color="#f59e0b"
        />
      </div>

      {/* Cantieri section */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Cantieri</h2>
        <label
          className="flex items-center gap-2 text-sm cursor-pointer"
          style={{ color: "var(--text-muted)" }}
        >
          <input
            type="checkbox"
            checked={mostraArchiviati}
            onChange={(e) => setMostraArchiviati(e.target.checked)}
            className="rounded"
            style={{ accentColor: "var(--accent)" }}
          />
          Mostra archiviati
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2"
            style={{ borderColor: "var(--accent)" }}
          />
        </div>
      ) : cantieri.length === 0 ? (
        <div
          className="card flex flex-col items-center justify-center py-20 text-center"
        >
          <Building2 className="w-16 h-16 mb-4 opacity-20" />
          <p className="font-medium text-lg">Nessun cantiere</p>
          <p className="text-sm mt-1 mb-6" style={{ color: "var(--text-muted)" }}>
            Inizia creando il tuo primo cantiere
          </p>
          <Link href="/dashboard/cantieri/nuovo" className="btn-primary">
            <Plus className="w-4 h-4" />
            Crea cantiere
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cantieri.map((cantiere) => (
            <CantiereCard
              key={cantiere.id}
              cantiere={cantiere}
              onArchivia={(id) => archivia({ variables: { id } })}
              onRiattiva={(id) => riattiva({ variables: { id } })}
            />
          ))}
        </div>
      )}

      {/* FAB */}
      <Link
        href="/dashboard/cantieri/nuovo"
        className="btn-primary fixed bottom-24 right-6 w-14 h-14 rounded-full shadow-2xl p-0"
        title="Nuovo cantiere"
      >
        <Plus className="w-6 h-6" />
      </Link>
    </div>
  );
}
