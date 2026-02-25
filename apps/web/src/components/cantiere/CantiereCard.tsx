import Link from "next/link";
import { StatoCantiere } from "@cervello-visivo/shared";
import CantiereBadge from "./CantiereBadge";
import { safeDate } from "@/lib/dateUtils";

interface CantiereCardProps {
  id: string;
  nome: string;
  indirizzo: string;
  stato: StatoCantiere;
  piantinaCount: number;
  createdAt: string;
}

export default function CantiereCard({
  id,
  nome,
  indirizzo,
  stato,
  piantinaCount,
  createdAt,
}: CantiereCardProps) {
  return (
    <Link href={`/dashboard/cantieri/${id}`}>
      <div className="card hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900">{nome}</h3>
          <CantiereBadge stato={stato} />
        </div>
        <p className="text-sm text-gray-500 mb-4">{indirizzo}</p>
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>
            {piantinaCount} piantin{piantinaCount === 1 ? "a" : "e"}
          </span>
          <span>
            Creato il{" "}
            {safeDate(createdAt).toLocaleDateString("it-IT")}
          </span>
        </div>
      </div>
    </Link>
  );
}
