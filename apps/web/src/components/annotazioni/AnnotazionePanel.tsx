"use client";

import { useEffect, useRef } from "react";
import { useQuery, useSubscription } from "@apollo/client";
import { GET_ANNOTAZIONI } from "@/graphql/queries";
import { NUOVA_ANNOTAZIONE } from "@/graphql/subscriptions";
import AnnotazioneForm from "./AnnotazioneForm";
import { safeDate } from "@/lib/dateUtils";

interface Annotazione {
  id: string;
  testo: string;
  x: number;
  y: number;
  autore: {
    id: string;
    nome: string;
    cognome: string;
  };
  createdAt: string;
}

interface AnnotazionePanelProps {
  foto360Id: string;
}

export default function AnnotazionePanel({ foto360Id }: AnnotazionePanelProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const { data, loading } = useQuery(GET_ANNOTAZIONI, {
    variables: { foto360Id },
  });

  useSubscription(NUOVA_ANNOTAZIONE, {
    variables: { foto360Id },
    onData: ({ client, data: subData }) => {
      const nuova = subData.data?.nuovaAnnotazione;
      if (!nuova) return;

      const existing = client.readQuery<{ annotazioni: Annotazione[] }>({
        query: GET_ANNOTAZIONI,
        variables: { foto360Id },
      });

      if (existing && !existing.annotazioni.some((a) => a.id === nuova.id)) {
        client.writeQuery({
          query: GET_ANNOTAZIONI,
          variables: { foto360Id },
          data: {
            annotazioni: [...existing.annotazioni, nuova],
          },
        });
      }
    },
  });

  const annotazioni: Annotazione[] = data?.annotazioni ?? [];

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [annotazioni.length]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h3 className="font-semibold text-sm" style={{ color: "var(--text)" }}>Annotazioni</h3>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          {annotazioni.length} annotazion{annotazioni.length === 1 ? "e" : "i"}
        </p>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
          </div>
        ) : annotazioni.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            Nessuna annotazione
          </p>
        ) : (
          annotazioni.map((annotazione) => (
            <div
              key={annotazione.id}
              className="rounded-xl p-3"
              style={{ background: "var(--surface-hover)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {annotazione.autore.nome} {annotazione.autore.cognome}
                </span>
                <span className="text-xs" style={{ color: "var(--text-subtle)" }}>
                  {safeDate(annotazione.createdAt).toLocaleTimeString("it-IT", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{annotazione.testo}</p>
            </div>
          ))
        )}
      </div>

      <div className="p-4" style={{ borderTop: "1px solid var(--border)" }}>
        <AnnotazioneForm foto360Id={foto360Id} />
      </div>
    </div>
  );
}
