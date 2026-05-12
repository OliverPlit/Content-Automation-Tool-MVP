"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/dashboard", label: "Übersicht", icon: "◉" },
  { href: "/dashboard/generate", label: "Generate", icon: "✨" },
  { href: "/dashboard/library", label: "Library", icon: "📂" },
  { href: "/dashboard/projects", label: "Projekte", icon: "🗂️" },
  { href: "/dashboard/templates", label: "Templates", icon: "📐" },
];

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(href);

  return (
    <aside className="flex h-screen w-60 flex-col bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900 px-4 py-6 text-slate-100 shadow-xl">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 text-base font-bold shadow-md shadow-blue-900/50">
          C
        </div>
        <div>
          <div className="text-base font-semibold tracking-tight">
            Content-Tool
          </div>
          <div className="text-[10px] uppercase tracking-wider text-blue-300">
            Creative Studio
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {nav.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 " +
                (active
                  ? "bg-blue-700/40 text-white shadow-inner ring-1 ring-blue-500/30"
                  : "text-slate-300 hover:bg-blue-800/40 hover:text-white hover:translate-x-0.5")
              }
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-lg border border-blue-800/50 bg-blue-950/40 p-3 text-xs text-blue-200">
        <p className="font-medium text-white">Tipp</p>
        <p className="mt-1 text-blue-200/80">
          Speichere deine Generierungen in der Library — dort kannst du Bilder
          und Videos rendern.
        </p>
      </div>
    </aside>
  );
}
