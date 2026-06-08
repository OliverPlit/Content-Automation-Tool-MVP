"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

/**
 * MIME-artiger Datentyp im DataTransfer. Verwenden wir hier UND in der
 * Folder-Sidebar (Drop-Targets), damit nur unsere Creative-Drags akzeptiert
 * werden — fremde Drops (Dateien, Text, Bilder) werden ignoriert.
 */
export const CREATIVE_DRAG_TYPE = "application/x-content-tool-creative";

/**
 * Inline-Studio-Item für die Creatives-Sektion auf der Projekt-Detail-Seite.
 *
 * Im Gegensatz zur Sub-Route-Variante (projects/[id]/edit/[cid]) bleibt der
 * Klick auf der gleichen Seite und setzt nur den `?creative=<id>` Search-Param.
 * Existierende Params (z.B. `?folder=…`, `?focus=…`) werden bewusst übernommen,
 * damit der Render-Plan-Board-Focus oben nicht verloren geht.
 *
 * Drag-and-Drop: Das Item ist draggable. Beim Start setzen wir die Creative-ID
 * in den DataTransfer (eigener MIME-Type) — die Folder-Sidebar-Rows greifen den
 * Drop ab und rufen `moveCreative` direkt auf.
 */
export function InlineStudioItem({
  id,
  headline,
  subline,
  thumb,
  createdAt,
}: {
  /**
   * projectId wird derzeit nicht im Component selbst gebraucht (der Link
   * baut sich aus pathname + searchParams). Bleibt absichtlich aus der
   * Signatur draußen, damit kein toter Code rumliegt.
   */
  id: string;
  headline: string;
  subline: string;
  thumb: string | null;
  createdAt: string;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const active = search.get("creative") === id;
  const [dragging, setDragging] = useState(false);

  // Bestehende Params übernehmen, nur `creative` überschreiben.
  const next = new URLSearchParams(search.toString());
  next.set("creative", id);
  const href = `${pathname}?${next.toString()}`;

  const date = new Date(createdAt).toLocaleDateString("de-DE", {
    day: "numeric",
    month: "short",
  });

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(CREATIVE_DRAG_TYPE, id);
        // Fallback für Browser die nur "text/plain" sniffen.
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      className={dragging ? "opacity-40" : ""}
    >
      <Link
        href={href}
        scroll={false}
        className={
          "flex cursor-grab items-start gap-3 border-b border-[var(--color-line)] px-3 py-2.5 transition-colors active:cursor-grabbing " +
          (active
            ? "bg-[var(--color-surface)]"
            : "hover:bg-[var(--color-surface)]")
        }
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            className="h-10 w-10 shrink-0 rounded border border-[var(--color-line)] object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] text-[9px] text-[var(--color-muted)]">
            —
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-[var(--foreground)]">
            {headline}
          </p>
          {subline && (
            <p className="truncate text-[11px] text-[var(--color-muted)]">
              {subline}
            </p>
          )}
          <p className="mt-0.5 text-[10px] tabular-nums text-[var(--color-muted)]">
            {date}
          </p>
        </div>
      </Link>
    </li>
  );
}
