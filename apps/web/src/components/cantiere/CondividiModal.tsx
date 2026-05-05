"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import {
  X,
  Share2,
  Copy,
  Check,
  Trash2,
  Ban,
  Eye,
  Calendar,
  ExternalLink,
} from "lucide-react";
import {
  GET_LINK_CONDIVISIONE_CANTIERE,
} from "@/graphql/queries";
import {
  CREA_LINK_CONDIVISIONE,
  REVOCA_LINK_CONDIVISIONE,
  ELIMINA_LINK_CONDIVISIONE,
} from "@/graphql/mutations";
import { safeDate } from "@/lib/dateUtils";

interface CondividiModalProps {
  cantiereId: string;
  cantiereNome: string;
  onClose: () => void;
}

type DurataOption = { label: string; days: number | null };

const DURATE: DurataOption[] = [
  { label: "1 giorno", days: 1 },
  { label: "7 giorni", days: 7 },
  { label: "30 giorni", days: 30 },
  { label: "Mai (revocabile)", days: null },
];

interface LinkRow {
  id: string;
  token: string;
  expiresAt: string | null;
  revocato: boolean;
  accessiCount: number;
  isExpired: boolean;
  createdAt: string;
  creatoDa?: { nome: string; cognome: string } | null;
}

function buildShareUrl(token: string): string {
  if (typeof window === "undefined") return `/share/${token}`;
  return `${window.location.origin}/share/${token}`;
}

function formatExpiry(iso: string | null, isExpired: boolean): string {
  if (!iso) return "Permanente";
  const date = safeDate(iso);
  const formatted = date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return isExpired ? `Scaduto · ${formatted}` : formatted;
}

export default function CondividiModal({
  cantiereId,
  cantiereNome,
  onClose,
}: CondividiModalProps) {
  const [durataIdx, setDurataIdx] = useState(1); // default 7 giorni
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data, loading, refetch } = useQuery(GET_LINK_CONDIVISIONE_CANTIERE, {
    variables: { cantiereId },
    fetchPolicy: "network-only",
  });

  const links: LinkRow[] = useMemo(() => data?.linkCondivisioneCantiere ?? [], [data]);

  const [creaLink, { loading: creating }] = useMutation(CREA_LINK_CONDIVISIONE, {
    onCompleted: () => refetch(),
  });
  const [revocaLink] = useMutation(REVOCA_LINK_CONDIVISIONE, {
    onCompleted: () => refetch(),
  });
  const [eliminaLink] = useMutation(ELIMINA_LINK_CONDIVISIONE, {
    onCompleted: () => { refetch(); setConfirmId(null); },
  });

  const handleCrea = () => {
    creaLink({
      variables: {
        cantiereId,
        durataGiorni: DURATE[durataIdx].days,
      },
    });
  };

  const handleCopy = async (token: string, id: string) => {
    const url = buildShareUrl(token);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="card w-full sm:max-w-2xl flex flex-col"
        style={{
          maxHeight: "90vh",
          borderRadius: "20px 20px 0 0",
          padding: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between p-5 sm:p-6"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              <Share2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold truncate">Condividi cantiere</h2>
              <p
                className="text-xs mt-0.5 truncate"
                style={{ color: "var(--text-muted)" }}
              >
                {cantiereNome} · sola visualizzazione
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-2 -mr-2 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Genera nuovo link */}
        <div className="p-5 sm:p-6" style={{ borderBottom: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
            Crea nuovo link
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
                Scadenza
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DURATE.map((opt, i) => (
                  <button
                    key={opt.label}
                    onClick={() => setDurataIdx(i)}
                    className="text-xs font-medium px-3 py-2 rounded-lg transition-all"
                    style={{
                      background: durataIdx === i ? "var(--accent)" : "var(--surface-hover)",
                      color: durataIdx === i ? "#fff" : "var(--text)",
                      border: durataIdx === i
                        ? "1px solid var(--accent)"
                        : "1px solid var(--border)",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex sm:items-end">
              <button
                onClick={handleCrea}
                disabled={creating}
                className="btn-primary w-full sm:w-auto"
              >
                {creating ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                    Creo...
                  </span>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    Genera link
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Lista link */}
        <div
          className="flex-1 overflow-y-auto p-5 sm:p-6"
          style={{ background: "var(--bg)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Link attivi · {links.filter((l) => !l.revocato && !l.isExpired).length}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Totale: {links.length}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div
                className="animate-spin rounded-full h-6 w-6 border-b-2"
                style={{ borderColor: "var(--accent)" }}
              />
            </div>
          ) : links.length === 0 ? (
            <div className="text-center py-10">
              <Share2 className="w-10 h-10 mx-auto mb-3 opacity-25" />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Nessun link generato
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Genera il primo link sopra per condividere questo cantiere.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {links.map((link) => {
                const url = buildShareUrl(link.token);
                const isInvalid = link.revocato || link.isExpired;
                const statusLabel = link.revocato
                  ? "Revocato"
                  : link.isExpired
                  ? "Scaduto"
                  : link.expiresAt
                  ? "Attivo"
                  : "Permanente";
                const statusColor = link.revocato
                  ? "#ef4444"
                  : link.isExpired
                  ? "#f59e0b"
                  : "#22c55e";

                return (
                  <div
                    key={link.id}
                    className="rounded-xl p-3"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      opacity: isInvalid ? 0.6 : 1,
                    }}
                  >
                    {/* Status row */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span
                        className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded"
                        style={{
                          background: `${statusColor}20`,
                          color: statusColor,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: statusColor }}
                        />
                        {statusLabel}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <Calendar className="w-3 h-3" />
                        {formatExpiry(link.expiresAt, link.isExpired)}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <Eye className="w-3 h-3" />
                        {link.accessiCount} {link.accessiCount === 1 ? "accesso" : "accessi"}
                      </span>
                    </div>

                    {/* URL row */}
                    <div className="flex items-center gap-1.5">
                      <div
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-xs font-mono truncate"
                        style={{
                          background: "var(--surface-hover)",
                          border: "1px solid var(--border)",
                          color: "var(--text-muted)",
                        }}
                        title={url}
                      >
                        {url.replace(/^https?:\/\//, "")}
                      </div>

                      <button
                        onClick={() => handleCopy(link.token, link.id)}
                        className="btn-ghost p-2"
                        title="Copia link"
                        disabled={isInvalid}
                      >
                        {copiedId === link.id ? (
                          <Check className="w-4 h-4" style={{ color: "#22c55e" }} />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>

                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost p-2"
                        title="Apri in nuova tab"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>

                      {!link.revocato && !link.isExpired && (
                        <button
                          onClick={() => revocaLink({ variables: { id: link.id } })}
                          className="btn-ghost p-2"
                          title="Revoca link"
                          style={{ color: "#f59e0b" }}
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}

                      {confirmId === link.id ? (
                        <>
                          <button
                            onClick={() => eliminaLink({ variables: { id: link.id } })}
                            className="btn-ghost p-2"
                            title="Conferma eliminazione"
                            style={{ color: "#ef4444" }}
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            className="btn-ghost p-2"
                            title="Annulla"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmId(link.id)}
                          className="btn-ghost p-2"
                          title="Elimina link"
                          style={{ color: "#ef4444" }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
