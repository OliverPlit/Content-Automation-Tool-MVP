"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/icon";

const nav: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Übersicht", icon: "rectangle-grid" },
  { href: "/dashboard/generate", label: "Generate", icon: "sparkle" },
  { href: "/dashboard/library", label: "Library", icon: "rectangle-stack" },
  { href: "/dashboard/gallery", label: "Galerie", icon: "image" },
  { href: "/dashboard/images/new", label: "Bild generieren", icon: "palette" },
  { href: "/dashboard/projects", label: "Projekte", icon: "folder" },
  { href: "/dashboard/templates", label: "Templates", icon: "file" },
];

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(href);

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-[var(--color-line)] bg-white px-4 py-6 text-[var(--foreground)]">
      <div className="mb-10 flex items-center gap-2.5 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--foreground)] text-base font-semibold text-white">
          C
        </div>
        <div>
          <div className="text-[15px] font-semibold tracking-tight">
            Content
          </div>
          <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
            Creative Studio
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5">
        {nav.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors " +
                (active
                  ? "bg-[var(--color-surface)] text-[var(--foreground)]"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--foreground)]")
              }
            >
              <Icon
                name={item.icon}
                className={
                  "size-[18px] " + (active ? "text-[var(--foreground)]" : "")
                }
                strokeWidth={1.6}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3 text-[11px] text-[var(--color-muted)]">
        <p className="font-medium text-[var(--foreground)]">Tipp</p>
        <p className="mt-1 leading-relaxed">
          Speichere deine Generierungen in der Library — dort kannst du Bilder
          und Videos rendern.
        </p>
      </div>
    </aside>
  );
}
