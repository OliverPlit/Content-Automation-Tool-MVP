"use client";

import { Icon } from "@/components/icon";

import type { ProjectRender } from "./render-plan-board";

/**
 * Creative-Tabs für Project-Board.
 *
 * Ein Projekt enthält N Creatives, jeweils mit M Varianten × K Formate.
 * Die Variant-Tabs unten dürfen sich also nicht über mehrere Creatives
 * mischen — sonst landet „V1" von Creative A und „V1" von Creative B in
 * derselben Spalte (Bug!).
 *
 * Diese Tabs scopen den Focus-Bereich auf EIN Creative. Klick wechselt.
 */
export function CreativeTabs({
  items,
  currentCreativeId,
  onSelect,
}: {
  items: ProjectRender[];
  currentCreativeId: string | null;
  onSelect: (firstItemOfCreative: ProjectRender) => void;
}) {
  // Eindeutige Creatives in der gefilterten Item-Liste
  // (Reihenfolge: nach erster Occurrence beibehalten — meist neueste zuerst)
  const seen = new Set<string>();
  const creatives: { id: string; headline: string; count: number }[] = [];
  for (const r of items) {
    if (seen.has(r.creativeId)) {
      const existing = creatives.find((c) => c.id === r.creativeId);
      if (existing) existing.count += 1;
      continue;
    }
    seen.add(r.creativeId);
    creatives.push({
      id: r.creativeId,
      headline: r.creativeHeadline,
      count: 1,
    });
  }
  // Counts korrigieren (zweite Pass für klare Logik)
  for (const c of creatives) {
    c.count = items.filter((i) => i.creativeId === c.id).length;
  }

  if (creatives.length <= 1) return null;

  const currentIdx = currentCreativeId
    ? creatives.findIndex((c) => c.id === currentCreativeId)
    : -1;
  const prev = currentIdx > 0 ? creatives[currentIdx - 1] : null;
  const next =
    currentIdx >= 0 && currentIdx < creatives.length - 1
      ? creatives[currentIdx + 1]
      : null;

  const goToCreative = (cid: string) => {
    const firstItem = items.find((r) => r.creativeId === cid);
    if (firstItem) onSelect(firstItem);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-2.5 py-1.5">
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
        Creatives
      </span>

      <button
        type="button"
        onClick={() => prev && goToCreative(prev.id)}
        disabled={!prev}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-line)] bg-white text-[var(--foreground)] transition-colors hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-30"
        title="Voriges Creative"
      >
        <Icon name="chevron-left" className="size-3.5" />
      </button>

      <div className="flex max-w-[60%] flex-wrap gap-1 overflow-hidden">
        {creatives.map((c) => {
          const isCurrent = c.id === currentCreativeId;
          const shortHeadline =
            c.headline.length > 24
              ? c.headline.slice(0, 22) + "…"
              : c.headline;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => goToCreative(c.id)}
              className={
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors " +
                (isCurrent
                  ? "bg-[var(--foreground)] text-white"
                  : "bg-[var(--color-surface)] text-[var(--foreground)] hover:bg-[var(--color-line)]")
              }
              title={c.headline}
            >
              {shortHeadline}
              <span
                className={
                  "rounded-full px-1.5 text-[10px] font-medium tabular-nums " +
                  (isCurrent
                    ? "bg-white/15 text-white"
                    : "bg-white text-[var(--color-muted)]")
                }
              >
                {c.count}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => next && goToCreative(next.id)}
        disabled={!next}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-line)] bg-white text-[var(--foreground)] transition-colors hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-30"
        title="Nächstes Creative"
      >
        <Icon name="chevron-right" className="size-3.5" />
      </button>

      {currentIdx >= 0 && (
        <span className="ml-auto text-[10px] tabular-nums text-[var(--color-muted)]">
          {currentIdx + 1} / {creatives.length}
        </span>
      )}
    </div>
  );
}
