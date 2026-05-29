"use client";

import { useCallback, useMemo } from "react";

import type { ProjectRender } from "./render-plan-board";

// Default-Reihenfolge der Format-Kinds (für RenderPlanBoard im Projekt).
// Library nutzt eine erweiterte Liste mit „image" als 0te Spalte.
const KIND_ORDER_DEFAULT = ["staticSquare", "animatedSquare", "reelVertical"] as const;

export type FocusMatrix = {
  /** Sortierte Variant-Indices (z.B. [0,1,2]) */
  variants: number[];
  /** matrix[variantRow][kindCol] = render | null */
  cells: (ProjectRender | null)[][];
};

export type FocusNeighbors = {
  prevFormat: ProjectRender | null; // ← (selbe Variante, voriges Format)
  nextFormat: ProjectRender | null; // → (selbe Variante, nächstes Format)
  prevVariant: ProjectRender | null; // ↑ (selbes Format, vorige Variante)
  nextVariant: ProjectRender | null; // ↓ (selbes Format, nächste Variante)
  /** Die ganze Reihe der selben Variante (für Top-Strip-Vorschau) */
  variantSiblings: (ProjectRender | null)[];
  /** Die ganze Spalte des selben Formats (für Side-Strip) */
  formatSiblings: (ProjectRender | null)[];
};

export type FocusOptions = {
  /**
   * Bestimmt die Matrix-Zeile.
   * Default: `String(r.variantIndex)` — bewährt für Library (1 Creative).
   * Project setzt `(r) => r.creativeId + ":" + r.variantIndex`, damit
   * V1 von Creative A und V1 von Creative B NICHT in derselben Zeile landen.
   */
  rowKey?: (r: ProjectRender) => string;
  /**
   * Wenn true: am Rand der Matrix wird gewrappt (vor erstem → letztes
   * Element, nach letztem → erstes). Ideal für „endlose" Navigation
   * durch alle Creatives im Projekt.
   */
  wrap?: boolean;
};

/**
 * Baut eine 2D-Matrix aus den Renders + bietet Nachbar-Lookup für
 * Pfeiltasten-Navigation. Leere Zellen werden bei Navigation skipped.
 */
export function useFocusNavigation(
  renders: ProjectRender[],
  focusedId: string | null,
  kindOrder: readonly string[] = KIND_ORDER_DEFAULT,
  options: FocusOptions = {},
) {
  const { rowKey = (r) => String(r.variantIndex), wrap = false } = options;

  // 1. Matrix bauen
  // Zeilen-Reihenfolge: nach erster Occurrence im Input-Array
  // (stabil über Sortierung der Page).
  const matrix = useMemo<FocusMatrix>(() => {
    const rowKeys: string[] = [];
    const seenKeys = new Set<string>();
    const variantsByKey = new Map<string, number>();
    for (const r of renders) {
      const k = rowKey(r);
      if (!seenKeys.has(k)) {
        seenKeys.add(k);
        rowKeys.push(k);
        variantsByKey.set(k, r.variantIndex);
      }
    }
    const variants = rowKeys.map((k) => variantsByKey.get(k) ?? 0);

    const cells: (ProjectRender | null)[][] = rowKeys.map((k) =>
      kindOrder.map((kind) => {
        const found = renders.find(
          (r) => rowKey(r) === k && r.templateKind === kind,
        );
        return found ?? null;
      }),
    );
    return { variants, cells };
  }, [renders, kindOrder, rowKey]);

  // 2. Aktuelles Item finden + Koordinaten
  const focused = useMemo(() => {
    if (focusedId) {
      const r = renders.find((x) => x.id === focusedId);
      if (r) return r;
    }
    return renders[0] ?? null;
  }, [renders, focusedId]);

  const coords = useMemo(() => {
    if (!focused) return null;
    const focusedRowKey = rowKey(focused);
    let vIdx = -1;
    let counter = 0;
    const seenKeys = new Set<string>();
    for (const r of renders) {
      const k = rowKey(r);
      if (seenKeys.has(k)) continue;
      seenKeys.add(k);
      if (k === focusedRowKey) {
        vIdx = counter;
        break;
      }
      counter += 1;
    }
    const fIdx = kindOrder.indexOf(focused.templateKind as string);
    if (vIdx < 0 || fIdx < 0) return null;
    return { vIdx, fIdx };
  }, [focused, renders, kindOrder, rowKey]);

  // 3. Nachbarn lookuppen
  const neighbors = useMemo<FocusNeighbors>(() => {
    if (!coords) {
      return {
        prevFormat: null,
        nextFormat: null,
        prevVariant: null,
        nextVariant: null,
        variantSiblings: [],
        formatSiblings: [],
      };
    }
    const { vIdx, fIdx } = coords;
    const variantSiblings = matrix.cells[vIdx] ?? [];
    const formatSiblings = matrix.cells.map((row) => row[fIdx] ?? null);

    // Hilfs-Funktion: nächste nicht-leere Zelle in `cells`, in Richtung `dir`
    // (+1 oder -1), mit optionalem Wrap-around.
    const findNonEmpty = (
      cells: (ProjectRender | null)[],
      startIdx: number,
      dir: 1 | -1,
    ): ProjectRender | null => {
      const N = cells.length;
      if (N === 0) return null;
      let i = startIdx + dir;
      let safety = N + 1;
      while (safety-- > 0) {
        if (i < 0) {
          if (!wrap) return null;
          i = N - 1;
        } else if (i >= N) {
          if (!wrap) return null;
          i = 0;
        }
        if (i === startIdx) return null; // ein voller Umlauf, nichts gefunden
        const cell = cells[i];
        if (cell) return cell;
        i += dir;
      }
      return null;
    };

    return {
      prevFormat: findNonEmpty(variantSiblings, fIdx, -1),
      nextFormat: findNonEmpty(variantSiblings, fIdx, 1),
      prevVariant: findNonEmpty(formatSiblings, vIdx, -1),
      nextVariant: findNonEmpty(formatSiblings, vIdx, 1),
      variantSiblings,
      formatSiblings,
    };
  }, [coords, matrix, wrap]);

  const navigate = useCallback(
    (dir: "left" | "right" | "up" | "down"): ProjectRender | null => {
      switch (dir) {
        case "left":
          return neighbors.prevFormat;
        case "right":
          return neighbors.nextFormat;
        case "up":
          return neighbors.prevVariant;
        case "down":
          return neighbors.nextVariant;
        default:
          return null;
      }
    },
    [neighbors],
  );

  return {
    matrix,
    focused,
    coords,
    neighbors,
    navigate,
  };
}

export const FOCUS_KIND_ORDER = KIND_ORDER_DEFAULT;
export const FOCUS_KIND_ORDER_LIBRARY = [
  "image",
  "staticSquare",
  "animatedSquare",
  "reelVertical",
] as const;
