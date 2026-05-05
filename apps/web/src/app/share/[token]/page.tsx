"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@apollo/client";
import { Layers, MapPin } from "lucide-react";
import { GET_LINK_CONDIVISIONE, GET_CANTIERE } from "@/graphql/queries";
import { safeDate } from "@/lib/dateUtils";

interface Piantina {
  id: string;
  nome: string;
  livello: number;
  fileUrl: string;
  larghezza: number;
  altezza: number;
}

export default function ShareCantierePage() {
  const params = useParams();
  const token = params.token as string;

  const { data: linkData } = useQuery(GET_LINK_CONDIVISIONE, {
    variables: { token },
  });
  const cantiereId = linkData?.linkCondivisione?.cantiereId;

  const { data, loading } = useQuery(GET_CANTIERE, {
    variables: { id: cantiereId ?? "" },
    skip: !cantiereId,
  });

  const cantiere = data?.cantiere;

  if (!cantiereId || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2"
          style={{ borderColor: "var(--accent)" }}
        />
      </div>
    );
  }

  if (!cantiere) {
    return (
      <div
        className="card text-center py-12 mx-auto max-w-2xl"
        style={{ color: "var(--text-muted)", marginTop: 32 }}
      >
        Cantiere non disponibile.
      </div>
    );
  }

  const sortedPiantine: Piantina[] = [...(cantiere.piantine ?? [])].sort(
    (a: Piantina, b: Piantina) => a.livello - b.livello
  );

  return (
    <div className="px-4 sm:px-6 py-6 sm:py-8 max-w-5xl mx-auto">
      {/* Hero card */}
      <div className="card mb-6">
        <div className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--surface-hover)" }}
          >
            <MapPin className="w-6 h-6" style={{ color: "var(--accent)" }} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold truncate">
              {cantiere.nome}
            </h1>
            <p
              className="text-sm mt-1 truncate"
              style={{ color: "var(--text-muted)" }}
            >
              {cantiere.indirizzo}
            </p>
            <p
              className="text-xs mt-2"
              style={{ color: "var(--text-muted)" }}
            >
              Creato il{" "}
              {safeDate(cantiere.createdAt).toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Piantine */}
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <Layers className="w-5 h-5" style={{ color: "var(--accent)" }} />
        Piantine ({sortedPiantine.length})
      </h2>

      {sortedPiantine.length === 0 ? (
        <div
          className="card flex flex-col items-center justify-center py-12 text-center"
          style={{ color: "var(--text-muted)" }}
        >
          <Layers className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">Nessuna piantina disponibile</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedPiantine.map((piantina) => (
            <Link
              key={piantina.id}
              href={`/share/${token}/piantina/${piantina.id}`}
            >
              <div className="card p-0 overflow-hidden cursor-pointer transition-all duration-200 group hover:shadow-md">
                <div
                  className="aspect-video overflow-hidden"
                  style={{ background: "var(--surface-hover)" }}
                >
                  <img
                    src={piantina.fileUrl}
                    alt={piantina.nome}
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                  />
                </div>
                <div className="p-4">
                  <h3 className="font-medium">{piantina.nome}</h3>
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Livello {piantina.livello} · {piantina.larghezza}×{piantina.altezza}px
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
