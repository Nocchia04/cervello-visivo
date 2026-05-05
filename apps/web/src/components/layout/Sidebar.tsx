"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@apollo/client";
import { LayoutDashboard, Building2, ShieldCheck, LogOut, Camera } from "lucide-react";
import { ME } from "@/graphql/queries";
import { removeToken } from "@/lib/auth";
import PiantinaSidebarWidget from "@/components/piantina/PiantinaSidebarWidget";

// Match: /dashboard/cantieri/<cantiereId>/piantina/<piantinaId>
const PIANTINA_PATH_RE = /^\/dashboard\/cantieri\/([^/]+)\/piantina\/([^/]+)\/?$/;

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/dashboard/cantieri", icon: Building2, label: "Cantieri" },
];

const adminItem = { href: "/admin", icon: ShieldCheck, label: "Admin" };

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useQuery(ME);
  const user = data?.me;
  const isAdmin = user?.role === "ADMIN";

  const items = isAdmin ? [...navItems, adminItem] : navItems;

  // Detect if we're inside a piantina detail page → show widget
  const piantinaMatch = pathname.match(PIANTINA_PATH_RE);
  const piantinaContext = piantinaMatch
    ? { cantiereId: piantinaMatch[1], piantinaId: piantinaMatch[2] }
    : null;

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const handleLogout = () => {
    removeToken();
    router.push("/login");
  };

  return (
    <aside
      className="fixed top-0 left-0 h-screen flex flex-col z-40"
      style={{
        width: "var(--sidebar-width)",
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-5 h-16 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--accent)" }}
        >
          <Camera className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-base" style={{ color: "var(--text)" }}>
          SiteLens
        </span>
      </div>

      {/* User greeting */}
      {user && (
        <div className="px-5 py-4 flex-shrink-0">
          <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
            Bentornato,
          </p>
          <p className="font-semibold text-sm mt-0.5" style={{ color: "var(--text)" }}>
            {user.nome} {user.cognome}
          </p>
        </div>
      )}

      {/* Nav + (optional) piantina widget — single scrollable region */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        <nav className="px-3 pt-1 flex-shrink-0">
          <p className="section-label px-2 mb-2">Navigazione</p>
          <ul className="flex flex-col gap-0.5">
            {items.map(({ href, icon: Icon, label }) => {
              const active = isActive(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
                    style={{
                      background: active ? "var(--surface-hover)" : "transparent",
                      color: active ? "var(--text)" : "var(--text-muted)",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Spacer to push the widget to the bottom of the sidebar when present.
            Without context, this just absorbs free space. */}
        <div className="flex-1" />

        {/* Piantina widget — only rendered when navigating inside a piantina */}
        {piantinaContext && (
          <PiantinaSidebarWidget
            cantiereId={piantinaContext.cantiereId}
            piantinaId={piantinaContext.piantinaId}
          />
        )}
      </div>

      {/* Footer */}
      <div
        className="px-3 py-4 flex-shrink-0"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-all duration-150"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-hover)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
          }}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          Esci
        </button>
      </div>
    </aside>
  );
}
