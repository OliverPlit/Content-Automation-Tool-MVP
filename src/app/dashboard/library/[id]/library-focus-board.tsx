"use client";

import { useEffect, useMemo, useState } from "react";

import type { ProjectRender } from "@/app/dashboard/projects/[id]/render-plan-board";
import {
  FOCUS_KIND_ORDER_LIBRARY,
  useFocusNavigation,
} from "@/app/dashboard/projects/[id]/use-focus-navigation";
import { VariantTabs } from "@/app/dashboard/projects/[id]/variant-tabs";

/**
 * Library-Variante des Focus-Boards: 2D-Navigation durch Varianten × Formate
 * + zusätzliche „image"-Spalte für die AI-Szene der Variante.
 *
 * Kein Schedule-Form, keine Status-Filter, kein Calendar — fokussiert auf
 * schnelles Durchblättern.
 */
export function LibraryFocusBoard({
  items,
}: {
  items: ProjectRender[];
}) {
  const [focusedId, setFocusedId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URL(window.location.href).searchParams.get("focus");
  });

  // URL-Sync
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (focusedId) url.searchParams.set("focus", focusedId);
    else url.searchParams.delete("focus");
    window.history.replaceState(null, "", url.toString());
  }, [focusedId]);

  // Fallback: wenn focusedId leer/ungültig → erstes Item
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (items.length === 0) {
      setFocusedId(null);
      return;
    }
    if (!focusedId || !items.some((r) => r.id === focusedId)) {
      setFocusedId(items[0].id);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [items, focusedId]);

  const { focused, neighbors } = useFocusNavigation(
    items,
    focusedId,
    FOCUS_KIND_ORDER_LIBRARY,
  );

  // Globaler Keyboard-Handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          if (e.key === "Escape") (target as HTMLElement).blur();
          return;
        }
      }

      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        let next: ProjectRender | null = null;
        if (e.key === "ArrowLeft") next = neighbors.prevFormat;
        else if (e.key === "ArrowRight") next = neighbors.nextFormat;
        else if (e.key === "ArrowUp") next = neighbors.prevVariant;
        else if (e.key === "ArrowDown") next = neighbors.nextVariant;
        if (next) {
          e.preventDefault();
          setFocusedId(next.id);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [neighbors]);

  const variantCount = useMemo(
    () => new Set(items.map((i) => i.variantIndex)).size,
    [items],
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-md shadow-slate-900/5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
          🎯 Schnell-Übersicht ({variantCount} Var. × {FOCUS_KIND_ORDER_LIBRARY.length} Formate)
        </h2>
        <p className="text-[10px] text-slate-500">
          ← → Format · ↑ ↓ Variante
        </p>
      </div>

      {/* Variant-Tabs — click-through Navigation zwischen Varianten */}
      <div className="mb-3">
        <VariantTabs
          items={items}
          currentVariantIndex={focused?.variantIndex ?? null}
          onSelect={(r) => setFocusedId(r.id)}
        />
      </div>

      {focused ? (
        <FocusTiles
          focused={focused}
          neighbors={neighbors}
          onSelect={setFocusedId}
        />
      ) : (
        <p className="text-xs text-slate-500">Kein Item zum Fokussieren.</p>
      )}

      {/* Kompakter Mini-Grid darunter */}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Alle ({items.length}) — Klick fokussiert
        </p>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8 xl:grid-cols-10">
          {items.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setFocusedId(r.id)}
              className={
                "group relative aspect-[4/5] overflow-hidden rounded-md border bg-slate-900 transition " +
                (r.id === focused?.id
                  ? "border-slate-700 ring-2 ring-slate-300"
                  : "border-slate-200 hover:border-slate-400")
              }
              title={`V${r.variantIndex + 1} · ${r.templateLabel}`}
            >
              {r.outputUrl ? (
                r.outputExt === "mp4" ? (
                  <video
                    src={r.outputUrl}
                    muted
                    className="h-full w-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.outputUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[8px] text-slate-500">
                  —
                </span>
              )}
              <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-0.5 text-[8px] font-semibold text-white">
                V{r.variantIndex + 1} · {r.templateLabel}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FocusTiles — Layout: 4 Nachbar-Thumbs + großes Preview Mitte
// ---------------------------------------------------------------------------
function FocusTiles({
  focused,
  neighbors,
  onSelect,
}: {
  focused: ProjectRender;
  neighbors: {
    prevFormat: ProjectRender | null;
    nextFormat: ProjectRender | null;
    prevVariant: ProjectRender | null;
    nextVariant: ProjectRender | null;
  };
  onSelect: (id: string) => void;
}) {
  const isVideo = focused.outputExt === "mp4";
  const aspectClass =
    focused.aspectRatio === "9:16"
      ? "aspect-[9/16]"
      : focused.aspectRatio === "16:9"
        ? "aspect-[16/9]"
        : focused.aspectRatio === "4:5"
          ? "aspect-[4/5]"
          : "aspect-square";

  return (
    <div className="grid grid-cols-[70px_1fr_70px] gap-2">
      <NeighborTile
        render={neighbors.prevFormat}
        dir="←"
        onSelect={onSelect}
      />

      <div className="flex flex-col items-center gap-2">
        {neighbors.prevVariant ? (
          <VariantBar
            render={neighbors.prevVariant}
            dir="↑"
            onSelect={onSelect}
          />
        ) : (
          <EmptyBar dir="↑" />
        )}

        <div className="relative overflow-hidden rounded-xl bg-slate-900 w-full">
          {focused.outputUrl ? (
            isVideo ? (
              <video
                key={focused.id}
                src={focused.outputUrl}
                controls
                playsInline
                className={`${aspectClass} mx-auto max-h-[340px] w-full object-contain`}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={focused.outputUrl}
                alt={`V${focused.variantIndex + 1} · ${focused.templateLabel}`}
                className={`${aspectClass} mx-auto max-h-[340px] w-full object-contain`}
              />
            )
          ) : (
            <div
              className={`${aspectClass} mx-auto flex max-h-[340px] w-full items-center justify-center text-xs text-slate-400`}
            >
              {focused.status === "processing" ? "rendert…" : "kein Output"}
            </div>
          )}
          <span className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-slate-700 shadow ring-1 ring-slate-200">
            V{focused.variantIndex + 1} · {focused.templateLabel}
          </span>
        </div>

        {neighbors.nextVariant ? (
          <VariantBar
            render={neighbors.nextVariant}
            dir="↓"
            onSelect={onSelect}
          />
        ) : (
          <EmptyBar dir="↓" />
        )}

        {/* Copy-Preview */}
        <div className="w-full rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs">
          <p className="line-clamp-1 font-semibold text-slate-900">
            {focused.creativeHeadline}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-600">
            {focused.creativeBody}
          </p>
        </div>
      </div>

      <NeighborTile
        render={neighbors.nextFormat}
        dir="→"
        onSelect={onSelect}
      />
    </div>
  );
}

function NeighborTile({
  render,
  dir,
  onSelect,
}: {
  render: ProjectRender | null;
  dir: "←" | "→";
  onSelect: (id: string) => void;
}) {
  if (!render) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-1 py-3 text-center text-[10px] text-slate-400">
        <span className="text-base">{dir}</span>
        <span className="mt-1">— Ende —</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(render.id)}
      className="flex flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-2 hover:border-slate-400 hover:bg-slate-50"
      title={`V${render.variantIndex + 1} · ${render.templateLabel}`}
    >
      <span className="text-xs text-slate-500">{dir}</span>
      {render.outputUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={render.outputUrl}
          alt=""
          className="h-10 w-10 rounded object-cover"
        />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-slate-400 text-[9px]">
          —
        </span>
      )}
      <span className="text-[8px] font-semibold text-slate-700">
        V{render.variantIndex + 1}
      </span>
      <span className="text-[7px] uppercase text-slate-500">
        {render.templateLabel}
      </span>
    </button>
  );
}

function VariantBar({
  render,
  dir,
  onSelect,
}: {
  render: ProjectRender;
  dir: "↑" | "↓";
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(render.id)}
      className="flex w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 hover:border-slate-400 hover:bg-slate-50"
    >
      <span className="text-[10px] font-semibold text-slate-500">{dir}</span>
      <span className="text-[10px] font-semibold text-slate-700">
        V{render.variantIndex + 1}
      </span>
      {render.outputUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={render.outputUrl}
          alt=""
          className="h-6 w-6 rounded object-cover"
        />
      )}
      <span className="text-[9px] text-slate-500">{render.templateLabel}</span>
    </button>
  );
}

function EmptyBar({ dir }: { dir: "↑" | "↓" }) {
  return (
    <div className="w-full rounded-md border border-dashed border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-400">
      {dir} keine {dir === "↑" ? "vorige" : "nächste"} Variante
    </div>
  );
}
