"use client";

import { Icon } from "@/components/icon";

import type { ProjectRender } from "./render-plan-board";

/**
 * Klickbare Variant-Navigation (V1 / V2 / V3 …) mit Prev/Next-Buttons.
 *
 * Wird in beiden Boards eingebunden (Library + Project). Beim Klick auf
 * eine Variante springt der Fokus zum ERSTEN existierenden Render-Item
 * (z.B. zuerst der AI-Szene oder Static) dieser Variante.
 */
export function VariantTabs({
  items,
  currentVariantIndex,
  onSelect,
  label = "Varianten",
}: {
  items: ProjectRender[];
  currentVariantIndex: number | null;
  /** Bekommt das erste Item der gewählten Variant-Spalte */
  onSelect: (firstItemOfVariant: ProjectRender) => void;
  label?: string;
}) {
  // Sortierte unique Variant-Indices
  const variants = Array.from(
    new Set(items.map((r) => r.variantIndex)),
  ).sort((a, b) => a - b);

  if (variants.length <= 1) return null;

  const currentIdx =
    currentVariantIndex !== null ? variants.indexOf(currentVariantIndex) : -1;
  const prev = currentIdx > 0 ? variants[currentIdx - 1] : null;
  const next =
    currentIdx >= 0 && currentIdx < variants.length - 1
      ? variants[currentIdx + 1]
      : null;

  // Helper: Spring zum ersten existierenden Item der Variante
  const goToVariant = (vIdx: number) => {
    const firstItem = items.find((r) => r.variantIndex === vIdx);
    if (firstItem) onSelect(firstItem);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-2.5 py-1.5">
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
        {label}
      </span>

      <button
        type="button"
        onClick={() => prev !== null && goToVariant(prev)}
        disabled={prev === null}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-line)] bg-white text-[var(--foreground)] transition-colors hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-30"
        title="Vorige Variante (↑)"
      >
        <Icon name="chevron-left" className="size-3.5" />
      </button>

      <div className="flex flex-wrap gap-1">
        {variants.map((vIdx) => {
          const isCurrent = vIdx === currentVariantIndex;
          const count = items.filter((r) => r.variantIndex === vIdx).length;
          return (
            <button
              key={vIdx}
              type="button"
              onClick={() => goToVariant(vIdx)}
              className={
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors " +
                (isCurrent
                  ? "bg-[var(--foreground)] text-white"
                  : "bg-[var(--color-surface)] text-[var(--foreground)] hover:bg-[var(--color-line)]")
              }
              title={`Springe zu Variante ${vIdx + 1}`}
            >
              V{vIdx + 1}
              <span
                className={
                  "rounded-full px-1.5 text-[10px] font-medium tabular-nums " +
                  (isCurrent
                    ? "bg-white/15 text-white"
                    : "bg-white text-[var(--color-muted)]")
                }
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => next !== null && goToVariant(next)}
        disabled={next === null}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-line)] bg-white text-[var(--foreground)] transition-colors hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-30"
        title="Nächste Variante (↓)"
      >
        <Icon name="chevron-right" className="size-3.5" />
      </button>

      {currentIdx >= 0 && (
        <span className="ml-auto text-[10px] tabular-nums text-[var(--color-muted)]">
          {currentIdx + 1} / {variants.length}
        </span>
      )}
    </div>
  );
}
