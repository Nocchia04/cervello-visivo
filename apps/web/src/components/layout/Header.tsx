"use client";

import { useQuery } from "@apollo/client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { ME } from "@/graphql/queries";
import { removeToken } from "@/lib/auth";

export default function Header() {
  const router = useRouter();
  const { data } = useQuery(ME);
  const user = data?.me;

  const handleLogout = () => {
    removeToken();
    router.push("/login");
  };

  return (
    <header
      className="glass fixed top-0 left-0 right-0 z-40 h-16 flex items-center justify-between px-6"
    >
      <Link href="/dashboard" className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
          style={{ background: "var(--accent)" }}
        >
          SL
        </div>
        <span className="font-semibold text-sm hidden sm:block">SiteLens</span>
      </Link>

      <div className="flex items-center gap-3">
        {user && (
          <div className="flex items-center gap-2 text-sm">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
              style={{ background: "var(--accent-hover)" }}
            >
              {user.nome?.[0]?.toUpperCase()}
            </div>
            <span className="text-sm hidden sm:block" style={{ color: "var(--text-muted)" }}>
              {user.nome} {user.cognome}
            </span>
          </div>
        )}
        <button onClick={handleLogout} className="btn-ghost" title="Logout">
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
