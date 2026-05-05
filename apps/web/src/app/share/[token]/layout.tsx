"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@apollo/client";
import { useParams, useRouter } from "next/navigation";
import { Camera, Eye, AlertCircle } from "lucide-react";
import { ReadOnlyProvider } from "@/lib/readOnly";
import { GET_LINK_CONDIVISIONE } from "@/graphql/queries";

function ShareValidationGate({ children }: { children: ReactNode }) {
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();

  const { data, loading, error } = useQuery(GET_LINK_CONDIVISIONE, {
    variables: { token },
  });

  useEffect(() => {
    // Auto-redirect se il token è invalido (no link or revoked)
    if (!loading && !error && data && !data.linkCondivisione) {
      // resta in pagina di errore
    }
  }, [loading, error, data]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ height: "100vh", background: "var(--bg)" }}
      >
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2"
          style={{ borderColor: "var(--accent)" }}
        />
      </div>
    );
  }

  const link = data?.linkCondivisione;
  const invalid = !link || link.revocato || link.isExpired;

  if (invalid) {
    return (
      <div
        className="flex items-center justify-center p-6"
        style={{ minHeight: "100vh", background: "var(--bg)" }}
      >
        <div className="card max-w-md w-full text-center py-10">
          <div
            className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ background: "rgba(239,68,68,0.12)" }}
          >
            <AlertCircle className="w-7 h-7" style={{ color: "#ef4444" }} />
          </div>
          <h1 className="text-lg font-semibold mb-2">Link non valido</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {link?.revocato
              ? "Questo link è stato revocato dall'amministratore."
              : link?.isExpired
              ? "Questo link è scaduto."
              : "Il link richiesto non esiste o è stato rimosso."}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="btn-primary mt-6"
          >
            Vai al login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Top bar minimal */}
      <header
        className="sticky top-0 z-30 px-4 sm:px-6 h-14 flex items-center justify-between"
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--accent)" }}
          >
            <Camera className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0 hidden sm:block">
            <p className="text-sm font-bold truncate">SiteLens</p>
            <p
              className="text-xs truncate"
              style={{ color: "var(--text-muted)" }}
            >
              {link.cantiere.nome}
            </p>
          </div>
          <div className="min-w-0 sm:hidden">
            <p className="text-sm font-semibold truncate">{link.cantiere.nome}</p>
          </div>
        </div>

        <div
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
          style={{
            background: "rgba(99,102,241,0.1)",
            color: "#6366f1",
          }}
        >
          <Eye className="w-3 h-3" />
          <span className="hidden sm:inline">Sola visualizzazione</span>
          <span className="sm:hidden">Read-only</span>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}

export default function ShareLayout({ children }: { children: ReactNode }) {
  // Defer rendering until mounted lato client, così l'apollo-client legge
  // il token dal pathname (window.location) e invia l'header ShareLink
  // anziché un Bearer assente. Evita flash di "Not authenticated".
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <ReadOnlyProvider value>
      <ShareValidationGate>{children}</ShareValidationGate>
    </ReadOnlyProvider>
  );
}
