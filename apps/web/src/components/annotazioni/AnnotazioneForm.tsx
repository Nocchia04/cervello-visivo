"use client";

import { useState } from "react";
import { useMutation } from "@apollo/client";
import { CREA_ANNOTAZIONE } from "@/graphql/mutations";

interface AnnotazioneFormProps {
  foto360Id: string;
}

export default function AnnotazioneForm({ foto360Id }: AnnotazioneFormProps) {
  const [testo, setTesto] = useState("");

  const [creaAnnotazione, { loading }] = useMutation(CREA_ANNOTAZIONE, {
    onCompleted: () => setTesto(""),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testo.trim()) return;
    creaAnnotazione({
      variables: {
        foto360Id,
        testo: testo.trim(),
        x: 0,
        y: 0,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={testo}
        onChange={(e) => setTesto(e.target.value)}
        placeholder="Scrivi un'annotazione..."
        className="input-field flex-1 text-sm"
      />
      <button
        type="submit"
        disabled={loading || !testo.trim()}
        className="btn-primary text-sm whitespace-nowrap"
      >
        Invia
      </button>
    </form>
  );
}
