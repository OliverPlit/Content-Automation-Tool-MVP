"use client";

import { useActionState, useState } from "react";

import {
  POST_STATUSES,
  TARGET_PLATFORMS,
  type PostStatus,
} from "./schedule-constants";
import {
  updateRenderPlan,
  updateRenderStatus,
  type ScheduleState,
} from "./schedule-actions";
import type { FocusNeighbors } from "./use-focus-navigation";
import type { ProjectRender } from "./render-plan-board";

const initial: ScheduleState = { ok: false };

export function RenderFocusView({
  focused,
  neighbors,
  onSelect,
  formatLabel,
}: {
  focused: ProjectRender | null;
  neighbors: FocusNeighbors;
  onSelect: (render: ProjectRender) => void;
  formatLabel: (kind: string) => string;
}) {
  // Form-Dirty-Tracking — beim Wechsel mit unsaved changes Confirm zeigen
  const [dirty, setDirty] = useState(false);
  const [planState, planAction, planPending] = useActionState(
    updateRenderPlan,
    initial,
  );
  const [_statusState, statusAction, statusPending] = useActionState(
    updateRenderStatus,
    initial,
  );
  void _statusState;

  const handleSiblingClick = (r: ProjectRender) => {
    if (
      dirty &&
      !window.confirm(
        "Ungespeicherte Änderungen im Schedule-Form. Trotzdem wechseln?",
      )
    ) {
      return;
    }
    setDirty(false);
    onSelect(r);
  };

  if (!focused) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
        Keine Renders im aktuellen Filter — wähle einen anderen Status oder lege
        einen Render an.
      </div>
    );
  }

  const statusMeta =
    POST_STATUSES.find((s) => s.value === focused.postStatus) ?? POST_STATUSES[0];
  const isVideo = focused.outputExt === "mp4";

  // Datum für <input type="datetime-local"> — inline statt useMemo (trivial)
  let scheduledDefault = "";
  if (focused.scheduledAt) {
    const d = new Date(focused.scheduledAt);
    const pad = (n: number) => String(n).padStart(2, "0");
    scheduledDefault = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const aspectClass =
    focused.aspectRatio === "9:16"
      ? "aspect-[9/16]"
      : focused.aspectRatio === "16:9"
        ? "aspect-[16/9]"
        : focused.aspectRatio === "4:5"
          ? "aspect-[4/5]"
          : "aspect-square";

  return (
    <section className="sticky top-0 z-20 -mx-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-900/5 backdrop-blur-md">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Fokus · ← → Format · ↑ ↓ Variante · 1–7 Status
        </p>
        <p className="text-[10px] text-slate-400">
          V{focused.variantIndex + 1} · {formatLabel(focused.templateKind)}
        </p>
      </div>

      <div className="grid grid-cols-[80px_1fr_80px] gap-3">
        {/* Linke Side-Vorschau — Format prev (←) */}
        <NeighborTile
          render={neighbors.prevFormat}
          direction="←"
          label="Format zurück"
          onClick={handleSiblingClick}
        />

        {/* Mitte: großes Preview + Variant-Strip darüber/darunter */}
        <div className="flex flex-col gap-2">
          {/* Variant-Strip oben (↑) */}
          {neighbors.prevVariant ? (
            <VariantStrip
              renders={[neighbors.prevVariant]}
              direction="↑"
              label={`V${neighbors.prevVariant.variantIndex + 1}`}
              onClick={handleSiblingClick}
            />
          ) : (
            <EmptyStrip label="↑ keine vorige Variante" />
          )}

          {/* Großes Preview */}
          <div className="relative overflow-hidden rounded-xl bg-slate-900">
            {focused.outputUrl ? (
              isVideo ? (
                <video
                  key={focused.id}
                  src={focused.outputUrl}
                  controls
                  playsInline
                  className={`${aspectClass} mx-auto max-h-[420px] w-full object-contain`}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={focused.outputUrl}
                  alt={`Render V${focused.variantIndex + 1}`}
                  className={`${aspectClass} mx-auto max-h-[420px] w-full object-contain`}
                />
              )
            ) : (
              <div
                className={`${aspectClass} mx-auto flex max-h-[420px] w-full items-center justify-center text-xs text-slate-400`}
              >
                {focused.status === "processing"
                  ? "rendert…"
                  : "kein Output"}
              </div>
            )}
            <span
              className={
                "absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow " +
                statusBadgeClasses(statusMeta.color)
              }
            >
              <span>{statusMeta.emoji}</span>
              <span>{statusMeta.label}</span>
            </span>
          </div>

          {/* Variant-Strip unten (↓) */}
          {neighbors.nextVariant ? (
            <VariantStrip
              renders={[neighbors.nextVariant]}
              direction="↓"
              label={`V${neighbors.nextVariant.variantIndex + 1}`}
              onClick={handleSiblingClick}
            />
          ) : (
            <EmptyStrip label="↓ keine nächste Variante" />
          )}
        </div>

        {/* Rechte Side-Vorschau — Format next (→) */}
        <NeighborTile
          render={neighbors.nextFormat}
          direction="→"
          label="Format vor"
          onClick={handleSiblingClick}
        />
      </div>

      {/* Copy-Preview */}
      <div className="mt-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
        <p className="line-clamp-1 font-semibold text-slate-900">
          {focused.creativeHeadline}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-600">
          {focused.creativeBody}
        </p>
      </div>

      {/* Status Quick-Buttons */}
      <div className="mt-2 flex flex-wrap gap-1">
        {(
          ["draft", "review", "approved", "scheduled", "live"] as PostStatus[]
        ).map((s, idx) => {
          const meta = POST_STATUSES.find((p) => p.value === s)!;
          const isCurrent = focused.postStatus === s;
          return (
            <form key={s} action={statusAction}>
              <input type="hidden" name="renderId" value={focused.id} />
              <input type="hidden" name="postStatus" value={s} />
              <button
                type="submit"
                disabled={statusPending || isCurrent}
                className={
                  "rounded-md px-2 py-1 text-[10px] font-semibold transition " +
                  (isCurrent
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-800")
                }
                title={`Status → ${meta.label} (Taste ${idx + 1})`}
              >
                {meta.emoji} {meta.label}
                <kbd className="ml-1 text-[8px] opacity-60">{idx + 1}</kbd>
              </button>
            </form>
          );
        })}
      </div>

      {/* Schedule-Form */}
      <form
        action={planAction}
        onChange={() => setDirty(true)}
        onSubmit={() => setDirty(false)}
        key={focused.id} // Form-Reset bei Item-Wechsel
        className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2"
      >
        <input type="hidden" name="renderId" value={focused.id} />
        <input type="hidden" name="creativeId" value={focused.creativeId} />

        <label className="block">
          <span className="block text-[9px] font-semibold uppercase tracking-wide text-slate-500">
            📅 Datum (Taste D)
          </span>
          <input
            type="datetime-local"
            name="scheduledAt"
            data-focus-key="scheduledAt"
            defaultValue={scheduledDefault}
            className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-700"
          />
        </label>
        <label className="block">
          <span className="block text-[9px] font-semibold uppercase tracking-wide text-slate-500">
            📡 Plattform (Taste P)
          </span>
          <select
            name="targetPlatform"
            data-focus-key="targetPlatform"
            defaultValue={focused.targetPlatform ?? ""}
            className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-700"
          >
            <option value="">— wählen —</option>
            {TARGET_PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.emoji} {p.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={planPending}
          className="self-end rounded-md bg-gradient-to-br from-slate-800 to-slate-950 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow disabled:cursor-not-allowed disabled:opacity-60"
        >
          {planPending ? "…" : "Plan speichern"}
        </button>
        <label className="col-span-3 block">
          <span className="block text-[9px] font-semibold uppercase tracking-wide text-slate-500">
            ✏️ Notizen
          </span>
          <textarea
            name="notes"
            rows={1}
            defaultValue={focused.notes ?? ""}
            placeholder="z. B. „A/B-Test gegen V2, 100 € Budget"
            className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-700"
          />
        </label>
        {planState.error && (
          <p className="col-span-3 rounded bg-slate-50 px-2 py-1 text-[10px] text-slate-700">
            {planState.error}
          </p>
        )}
        {planState.ok && planState.renderId === focused.id && (
          <p className="col-span-3 rounded bg-slate-50 px-2 py-1 text-[10px] text-slate-800">
            ✓ Gespeichert
          </p>
        )}
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// NeighborTile — linke/rechte Side-Vorschau für Format-Wechsel
// ---------------------------------------------------------------------------
function NeighborTile({
  render,
  direction,
  label,
  onClick,
}: {
  render: ProjectRender | null;
  direction: "←" | "→";
  label: string;
  onClick: (r: ProjectRender) => void;
}) {
  if (!render) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-1 py-3 text-center text-[10px] text-slate-400">
        <span className="text-base">{direction}</span>
        <span className="mt-1">— Ende —</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onClick(render)}
      className="flex flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-2 text-center text-[10px] text-slate-600 hover:border-slate-400 hover:bg-slate-50"
      title={`${label} (Pfeiltaste ${direction})`}
    >
      <span className="text-xs">{direction}</span>
      {render.outputUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={render.outputUrl}
          alt=""
          className="h-12 w-12 rounded object-cover"
        />
      ) : (
        <span className="flex h-12 w-12 items-center justify-center rounded bg-slate-100 text-slate-400">
          ?
        </span>
      )}
      <span className="text-[9px] font-semibold">
        V{render.variantIndex + 1}
      </span>
      <span className="text-[8px] uppercase">{render.templateLabel}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// VariantStrip — Top/Bottom-Strip mit Variant-Vorschau
// ---------------------------------------------------------------------------
function VariantStrip({
  renders,
  direction,
  label,
  onClick,
}: {
  renders: (ProjectRender | null)[];
  direction: "↑" | "↓";
  label: string;
  onClick: (r: ProjectRender) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
      <span className="text-[10px] font-semibold text-slate-500">
        {direction} {label}
      </span>
      {renders.map(
        (r, i) =>
          r && (
            <button
              key={r.id + "-" + i}
              type="button"
              onClick={() => onClick(r)}
              title={`V${r.variantIndex + 1} · ${r.templateLabel}`}
              className="h-8 w-8 overflow-hidden rounded border border-slate-200 bg-white hover:border-slate-400"
            >
              {r.outputUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.outputUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[8px] text-slate-400">
                  ?
                </span>
              )}
            </button>
          ),
      )}
    </div>
  );
}

function EmptyStrip({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-400">
      {label}
    </div>
  );
}

function statusBadgeClasses(color: string): string {
  switch (color) {
    case "slate":
      return "bg-slate-700/90 text-white";
    case "amber":
      return "bg-slate-600 text-white";
    case "blue":
      return "bg-slate-700 text-white";
    case "purple":
      return "bg-slate-700 text-white";
    case "emerald":
      return "bg-slate-600 text-white";
    case "orange":
      return "bg-slate-600 text-white";
    case "stone":
      return "bg-stone-600 text-white";
    default:
      return "bg-slate-700 text-white";
  }
}
