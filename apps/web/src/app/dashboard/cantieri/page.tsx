"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, Camera, MapPin, Plus, Archive, RotateCcw, Search, X, Clock } from "lucide-react";
import { safeDate } from "@/lib/dateUtils";
import { GET_CANTIERI } from "@/graphql/queries";
import { ARCHIVIA_CANTIERE, RIATTIVA_CANTIERE } from "@/graphql/mutations";

interface Piantina {
  id: string;
  fileUrl?: string;
}

interface Cantiere {
  id: string;
  nome: string;
  indirizzo: string;
  stato: "ATTIVO" | "ARCHIVIATO";
  thumbnailUrl?: string;
  piantine: Piantina[];
  createdAt: string;
  ultimoCaricamento?: string | null;
}

export default function CantieriPage() {
  const [vista, setVista] = useState<"ATTIVO" | "ARCHIVIATO">("ATTIVO");
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  const { data, loading, refetch } = useQuery(GET_CANTIERI, {
    variables: { includiArchiviati: true },
  });

  const [archivia] = useMutation(ARCHIVIA_CANTIERE, { onCompleted: () => refetch() });
  const [riattiva] = useMutation(RIATTIVA_CANTIERE, { onCompleted: () => refetch() });

  const allCantieri: Cantiere[] = data?.cantieri ?? [];

  // Filtro: prima per stato, poi per query di ricerca (nome OR indirizzo).
  // Match case-insensitive. La query viene trimmata per ignorare spazi accidentali.
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const cantieri = allCantieri
    .filter((c) => c.stato === vista)
    .filter((c) => {
      if (!trimmedQuery) return true;
      return (
        c.nome.toLowerCase().includes(trimmedQuery) ||
        c.indirizzo.toLowerCase().includes(trimmedQuery)
      );
    })
    // Ordine per ultimo caricamento (più recente prima); senza caricamenti in fondo.
    .slice()
    .sort((a, b) => {
      const ta = a.ultimoCaricamento ? new Date(a.ultimoCaricamento).getTime() : 0;
      const tb = b.ultimoCaricamento ? new Date(b.ultimoCaricamento).getTime() : 0;
      return tb - ta;
    });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
        <div className="flex-shrink-0">
          <h1 className="text-2xl font-bold">Cantieri</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            {allCantieri.filter((c) => c.stato === "ATTIVO").length} attivi · {allCantieri.filter((c) => c.stato === "ARCHIVIATO").length} archiviati
          </p>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 flex-1 sm:flex-initial sm:justify-end">
          {/* Search bar */}
          <div
            className="relative flex-1 sm:flex-initial"
            style={{ maxWidth: 360 }}
          >
            <Search
              className="w-4 h-4 absolute pointer-events-none"
              style={{
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cerca cantiere…"
              aria-label="Cerca cantiere per nome o indirizzo"
              className="w-full text-sm transition-colors"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "8px 36px 8px 36px",
                color: "var(--text)",
                outline: "none",
              }}
              onFocus={(e) => {
                (e.currentTarget as HTMLInputElement).style.borderColor =
                  "var(--accent)";
                (e.currentTarget as HTMLInputElement).style.boxShadow =
                  "0 0 0 3px rgba(17,24,39,0.08)";
              }}
              onBlur={(e) => {
                (e.currentTarget as HTMLInputElement).style.borderColor =
                  "var(--border)";
                (e.currentTarget as HTMLInputElement).style.boxShadow = "none";
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                aria-label="Cancella ricerca"
                className="absolute flex items-center justify-center"
                style={{
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  background: "var(--surface-hover)",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                }}
                title="Cancella ricerca"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Switch Attivi / Archiviati */}
          <div
            className="flex items-center flex-shrink-0 rounded-xl p-0.5"
            style={{ background: "var(--surface-hover)", border: "1px solid var(--border)" }}
          >
            {(["ATTIVO", "ARCHIVIATO"] as const).map((v) => {
              const active = vista === v;
              return (
                <button
                  key={v}
                  onClick={() => setVista(v)}
                  className="text-sm font-medium whitespace-nowrap transition-colors"
                  style={{
                    padding: "6px 14px",
                    borderRadius: 10,
                    background: active ? "var(--surface)" : "transparent",
                    color: active ? "var(--text)" : "var(--text-muted)",
                    boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  {v === "ATTIVO" ? "Attivi" : "Archiviati"}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2"
            style={{ borderColor: "var(--accent)" }}
          />
        </div>
      ) : cantieri.length === 0 ? (
        trimmedQuery ? (
          <div className="card flex flex-col items-center justify-center py-16 text-center">
            <Search className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-medium text-lg">Nessun risultato</p>
            <p className="text-sm mt-1 mb-5" style={{ color: "var(--text-muted)" }}>
              Nessun cantiere corrisponde a “{searchQuery}”
            </p>
            <button onClick={() => setSearchQuery("")} className="btn-secondary">
              <X className="w-4 h-4" />
              Cancella ricerca
            </button>
          </div>
        ) : vista === "ARCHIVIATO" ? (
          <div className="card flex flex-col items-center justify-center py-20 text-center">
            <Archive className="w-16 h-16 mb-4 opacity-20" />
            <p className="font-medium text-lg">Nessun cantiere archiviato</p>
            <p className="text-sm mt-1 mb-6" style={{ color: "var(--text-muted)" }}>
              I cantieri archiviati compariranno qui
            </p>
            <button onClick={() => setVista("ATTIVO")} className="btn-secondary">
              Vedi i cantieri attivi
            </button>
          </div>
        ) : (
          <div className="card flex flex-col items-center justify-center py-20 text-center">
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
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cantieri.map((cantiere) => (
            <div
              key={cantiere.id}
              className="rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 group"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
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
              {/* Thumbnail */}
              <div
                className="relative h-40 flex items-center justify-center"
                style={{ background: "var(--surface-hover)" }}
              >
                {(() => {
                  const previewUrl = cantiere.thumbnailUrl ?? cantiere.piantine[0]?.fileUrl ?? null;
                  return previewUrl ? (
                    <img src={previewUrl} alt={cantiere.nome} className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-10 h-10" style={{ color: "var(--border-strong)" }} />
                  );
                })()}
                <div className="absolute top-3 right-3">
                  {cantiere.stato === "ATTIVO" ? (
                    <span className="badge-attivo">● Attivo</span>
                  ) : (
                    <span className="badge-archiviato">Archiviato</span>
                  )}
                </div>
                <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  {cantiere.stato === "ATTIVO" ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); archivia({ variables: { id: cantiere.id } }); }}
                      className="btn-ghost text-xs px-2 py-1 rounded-lg"
                      style={{ background: "rgba(0,0,0,0.6)" }}
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); riattiva({ variables: { id: cantiere.id } }); }}
                      className="btn-ghost text-xs px-2 py-1 rounded-lg"
                      style={{ background: "rgba(0,0,0,0.6)" }}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <h3 className="font-semibold text-base truncate">{cantiere.nome}</h3>
                <p className="text-sm mt-1 flex items-center gap-1 truncate" style={{ color: "var(--text-muted)" }}>
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  {cantiere.indirizzo}
                </p>
                <div
                  className="flex items-center gap-3 mt-3 pt-3 text-xs"
                  style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}
                >
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" />
                    {cantiere.piantine.length} piante
                  </span>
                  <span className="ml-auto text-right leading-tight" title="Data di scatto della foto più recente">
                    <span
                      className="block"
                      style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-subtle)" }}
                    >
                      Ultima foto
                    </span>
                    <span className="flex items-center gap-1 justify-end">
                      <Clock className="w-3 h-3" />
                      {cantiere.ultimoCaricamento
                        ? safeDate(cantiere.ultimoCaricamento).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })
                        : "—"}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
