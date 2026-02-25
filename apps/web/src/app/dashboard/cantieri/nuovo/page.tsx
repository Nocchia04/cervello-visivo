"use client";

import { useState } from "react";
import { useMutation } from "@apollo/client";
import { useRouter } from "next/navigation";
import { CREA_CANTIERE } from "@/graphql/mutations";
import { GET_CANTIERI } from "@/graphql/queries";

export default function NuovoCantiereePage() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [indirizzo, setIndirizzo] = useState("");
  const [error, setError] = useState("");

  const [creaCantiere, { loading }] = useMutation(CREA_CANTIERE, {
    refetchQueries: [{ query: GET_CANTIERI }],
    onCompleted: (data) => {
      router.push(`/dashboard/cantieri/${data.creaCantiere.id}`);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    creaCantiere({ variables: { input: { nome, indirizzo } } });
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Nuovo Cantiere</h1>

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-xl text-sm" style={{ background: "rgba(239,68,68,0.1)", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.2)" }}>
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="nome"
              className="block text-sm font-medium mb-1"
            >
              Nome cantiere
            </label>
            <input
              id="nome"
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="input-field"
              placeholder="Es. Cantiere Via Roma"
              required
            />
          </div>

          <div>
            <label
              htmlFor="indirizzo"
              className="block text-sm font-medium mb-1"
            >
              Indirizzo
            </label>
            <input
              id="indirizzo"
              type="text"
              value={indirizzo}
              onChange={(e) => setIndirizzo(e.target.value)}
              className="input-field"
              placeholder="Es. Via Roma 1, Milano"
              required
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Creazione..." : "Crea cantiere"}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="btn-secondary"
            >
              Annulla
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
