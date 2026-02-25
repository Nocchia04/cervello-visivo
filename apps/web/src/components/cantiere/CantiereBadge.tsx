interface CantiereBadgeProps {
  stato: "ATTIVO" | "ARCHIVIATO";
}

export default function CantiereBadge({ stato }: CantiereBadgeProps) {
  if (stato === "ATTIVO") {
    return <span className="badge-attivo">● Attivo</span>;
  }
  return <span className="badge-archiviato">Archiviato</span>;
}
