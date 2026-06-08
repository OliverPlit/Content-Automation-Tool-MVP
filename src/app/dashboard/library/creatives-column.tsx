"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Icon } from "@/components/icon";
import { StudioListItem } from "./studio-list-item";

export type CreativeRow = {
  id: string;
  headline: string;
  subline: string;
  thumb: string | null;
  createdAt: string;
  projectId: string | null;
  folderId: string | null;
};

/**
 * Studio-Mid-Column: gefilterte Creative-Liste.
 *
 * Client-Component, weil sie aus den URL-Params (?project, ?folder)
 * den aktuellen Filter lebt — diese sind im Server-Layout nicht
 * verfügbar (Next.js gibt Layouts keine searchParams).
 *
 * Optionaler Suchfilter oben (in-Memory, kein Server-Roundtrip).
 */
export type ProjectOption = { id: string; name: string };

export function CreativesColumn({
  creatives,
  projects,
}: {
  creatives: CreativeRow[];
  projects: ProjectOption[];
}) {
  const search = useSearchParams();
  const projectFilter = search.get("project") ?? "";
  const folderFilter = search.get("folder") ?? "";
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    let list = creatives;

    if (projectFilter === "none") {
      list = list.filter((c) => !c.projectId);
    } else if (projectFilter) {
      list = list.filter((c) => c.projectId === projectFilter);
    }

    if (folderFilter === "none") {
      list = list.filter((c) => !c.folderId);
    } else if (folderFilter) {
      list = list.filter((c) => c.folderId === folderFilter);
    }

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((c) =>
        (c.headline + " " + c.subline).toLowerCase().includes(q),
      );
    }
    return list;
  }, [creatives, projectFilter, folderFilter, query]);

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-[var(--color-line)] px-3 py-3">
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
            Creatives
          </p>
          <p className="text-[10px] tabular-nums text-[var(--color-muted)]">
            {filtered.length}
          </p>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suchen…"
          className="mt-2 block w-full rounded-md border border-[var(--color-line)] bg-white px-2 py-1 text-[12px] focus:border-[var(--foreground)] focus:outline-none"
        />
      </div>

      <nav className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-5 text-center text-[12px] text-[var(--color-muted)]">
            {creatives.length === 0 ? (
              <>
                <p>Noch keine Creatives.</p>
                <Link
                  href="/dashboard/generate"
                  className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--foreground)] underline hover:opacity-70"
                >
                  Jetzt erstellen
                  <Icon name="chevron-right" className="size-3" />
                </Link>
              </>
            ) : (
              <p>Keine Treffer im aktuellen Filter.</p>
            )}
          </div>
        ) : (
          <ul>
            {filtered.map((c) => (
              <StudioListItem
                key={c.id}
                id={c.id}
                headline={c.headline}
                subline={c.subline}
                thumb={c.thumb}
                createdAt={c.createdAt}
                projectId={c.projectId}
                projects={projects}
              />
            ))}
          </ul>
        )}
      </nav>
    </div>
  );
}
