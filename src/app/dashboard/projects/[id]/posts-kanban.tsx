"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Icon } from "@/components/icon";

import type { ProjectRender } from "./render-plan-board";
import {
  POST_STATUSES,
  TARGET_PLATFORMS,
  type PostStatus,
} from "./schedule-constants";
import { updateRenderPlan, updateRenderStatus } from "./schedule-actions";

/**
 * MIME-artiger Type für Render-Drag-Operationen.
 * Eigener Wert, damit der bestehende Creative-→-Folder-DnD aus der
 * Sidebar nicht kollidiert.
 */
const RENDER_DRAG_TYPE = "application/x-content-tool-render";

/**
 * Spalten-Reihenfolge im Kanban. Bewusst NICHT identisch mit POST_STATUSES,
 * weil paused + archived per Default ausgeblendet sind.
 */
const KANBAN_COLUMNS: PostStatus[] = [
  "draft",
  "review",
  "approved",
  "scheduled",
  "live",
];
const ARCHIVED_COLUMNS: PostStatus[] = ["paused", "archived"];

export type KanbanRender = ProjectRender;

export function PostsKanban({
  renders,
}: {
  renders: KanbanRender[];
  /**
   * projectId nehmen wir aktuell nicht im Component-Body — die
   * updateRenderStatus-Action arbeitet nur mit renderId. Falls wir später
   * z.B. revalidatePath(`/dashboard/projects/${projectId}`) explizit
   * triggern wollen, wird der Param wieder reingenommen. router.refresh()
   * reicht erstmal.
   */
  projectId?: string;
}) {
  const router = useRouter();
  const [movePending, startMove] = useTransition();
  const [hoverCol, setHoverCol] = useState<PostStatus | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Gruppieren nach post_status, pseudo + nicht-succeeded raus.
  const grouped = useMemo(() => {
    const map = new Map<PostStatus, KanbanRender[]>();
    for (const r of renders) {
      // AI-Bild-Pseudo-Renders haben id "image-<cid>-<vi>" und templateKind "image"
      if (r.id.startsWith("image-")) continue;
      if (r.status !== "succeeded") continue;
      // Jeder fertige Render ist automatisch ein Draft und bleibt sichtbar,
      // bis er gelöscht wird — kein saved_at-Gate mehr (war fragil wegen
      // Migration / PostgREST-Schema-Cache). post_status steuert die Spalte.
      const arr = map.get(r.postStatus) ?? [];
      arr.push(r);
      map.set(r.postStatus, arr);
    }
    return map;
  }, [renders]);

  const moveTo = (renderId: string, status: PostStatus) => {
    startMove(async () => {
      const fd = new FormData();
      fd.set("renderId", renderId);
      fd.set("postStatus", status);
      const res = await updateRenderStatus({ ok: false }, fd);
      if (res.ok) router.refresh();
    });
  };

  const setSchedule = (renderId: string, isoDate: string) => {
    startMove(async () => {
      const fd = new FormData();
      fd.set("renderId", renderId);
      fd.set("scheduledAt", isoDate);
      // postStatus weglassen → Server-Action hebt automatisch auf "scheduled"
      // wenn vorher draft/review/approved war.
      const res = await updateRenderPlan({ ok: false }, fd);
      if (res.ok) router.refresh();
    });
  };

  const setPlatform = (renderId: string, platform: string) => {
    startMove(async () => {
      const fd = new FormData();
      fd.set("renderId", renderId);
      fd.set("targetPlatform", platform);
      const res = await updateRenderPlan({ ok: false }, fd);
      if (res.ok) router.refresh();
    });
  };

  const totalReal = useMemo(
    () =>
      renders.filter(
        (r) => !r.id.startsWith("image-") && r.status === "succeeded",
      ).length,
    [renders],
  );

  const columns = showArchived
    ? [...KANBAN_COLUMNS, ...ARCHIVED_COLUMNS]
    : KANBAN_COLUMNS;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
          Posts-Workflow · {totalReal} Render{totalReal === 1 ? "" : "s"} bereit
        </p>
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="text-[11px] font-medium text-[var(--color-muted)] underline hover:text-[var(--foreground)]"
        >
          {showArchived
            ? "Paused / Archiv ausblenden"
            : "Paused / Archiv anzeigen"}
        </button>
      </div>

      {totalReal === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-line)] bg-white p-8 text-center text-[12px] text-[var(--color-muted)]">
          <p>Noch keine gerenderten Creatives in diesem Projekt.</p>
          <p className="mt-1 text-[11px]">
            Öffne ein Creative, generiere ein Bild und starte einen Render —
            Output landet hier in der Draft-Spalte.
          </p>
        </div>
      ) : (
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
          }}
        >
          {columns.map((col) => {
            const meta =
              POST_STATUSES.find((s) => s.value === col) ?? POST_STATUSES[0];
            const items = grouped.get(col) ?? [];
            const isHover = hoverCol === col;

            return (
              <KanbanColumn
                key={col}
                col={col}
                meta={meta}
                items={items}
                isHover={isHover}
                isPending={movePending && isHover}
                onDragOver={(e) => {
                  if (!isOurRender(e)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (hoverCol !== col) setHoverCol(col);
                }}
                onDragLeave={(e) => {
                  if (
                    e.currentTarget.contains(
                      e.relatedTarget as Node | null,
                    ) === false
                  ) {
                    setHoverCol(null);
                  }
                }}
                onDrop={(e) => {
                  if (!isOurRender(e)) return;
                  e.preventDefault();
                  const rid = e.dataTransfer.getData(RENDER_DRAG_TYPE);
                  setHoverCol(null);
                  if (rid) moveTo(rid, col);
                }}
                onSetSchedule={setSchedule}
                onSetPlatform={setPlatform}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

function KanbanColumn({
  col,
  meta,
  items,
  isHover,
  isPending,
  onDragOver,
  onDragLeave,
  onDrop,
  onSetSchedule,
  onSetPlatform,
}: {
  col: PostStatus;
  meta: (typeof POST_STATUSES)[number];
  items: KanbanRender[];
  isHover: boolean;
  isPending: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onSetSchedule: (renderId: string, iso: string) => void;
  onSetPlatform: (renderId: string, platform: string) => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={
        "flex min-h-[200px] flex-col overflow-hidden rounded-xl border bg-[var(--color-surface)] transition-all " +
        (isHover
          ? "border-[var(--foreground)] ring-2 ring-[var(--foreground)] ring-offset-1"
          : "border-[var(--color-line)]") +
        (isPending ? " opacity-70" : "")
      }
    >
      <div className="flex items-baseline justify-between border-b border-[var(--color-line)] bg-white px-2.5 py-1.5">
        <p className="text-[11px] font-semibold text-[var(--foreground)]">
          {meta.label}
        </p>
        <span className="rounded-full bg-[var(--color-surface)] px-1.5 text-[10px] font-medium tabular-nums text-[var(--color-muted)]">
          {items.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
        {items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-6 text-center text-[10px] text-[var(--color-muted)]">
            {col === "draft" ? "Renders landen hier" : "—"}
          </div>
        ) : (
          items.map((r) => (
            <KanbanCard
              key={r.id}
              render={r}
              onSetSchedule={onSetSchedule}
              onSetPlatform={onSetPlatform}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function KanbanCard({
  render,
  onSetSchedule,
  onSetPlatform,
}: {
  render: KanbanRender;
  onSetSchedule: (renderId: string, iso: string) => void;
  onSetPlatform: (renderId: string, platform: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const isVideo = render.outputExt === "mp4";

  // Date-Input erwartet "yyyy-MM-ddTHH:mm"
  const scheduledLocal = render.scheduledAt
    ? toLocalInputValue(new Date(render.scheduledAt))
    : "";

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(RENDER_DRAG_TYPE, render.id);
        e.dataTransfer.setData("text/plain", render.id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      className={
        "group cursor-grab overflow-hidden rounded-lg border border-[var(--color-line)] bg-white text-left shadow-sm transition active:cursor-grabbing " +
        (dragging ? "opacity-40" : "hover:border-[var(--foreground)]")
      }
      title={`${render.creativeHeadline} · V${render.variantIndex + 1} · ${render.templateLabel}`}
    >
      <div className="relative aspect-[4/5] bg-slate-900">
        {render.outputUrl ? (
          isVideo ? (
            <video
              src={render.outputUrl}
              muted
              className="h-full w-full object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={render.outputUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
            —
          </div>
        )}
        <span className="absolute left-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white">
          V{render.variantIndex + 1}
        </span>
        {isVideo && (
          <span className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[8px] font-bold text-white">
            ▶
          </span>
        )}
      </div>

      <div className="space-y-1 px-2 py-1.5">
        <p className="truncate text-[10px] font-medium text-[var(--foreground)]">
          {render.creativeHeadline}
        </p>
        <p className="truncate text-[10px] text-[var(--color-muted)]">
          {render.templateLabel}
        </p>

        {/* Inline-Schedule (Datum) */}
        <input
          type="datetime-local"
          value={scheduledLocal}
          onChange={(e) => onSetSchedule(render.id, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onDragStart={(e) => e.preventDefault()}
          draggable={false}
          className="block w-full rounded border border-[var(--color-line)] bg-white px-1 py-0.5 text-[10px] focus:border-[var(--foreground)] focus:outline-none"
          title="Veröffentlichungs-Datum"
        />

        {/* Inline-Plattform */}
        <select
          value={render.targetPlatform ?? ""}
          onChange={(e) => onSetPlatform(render.id, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onDragStart={(e) => e.preventDefault()}
          draggable={false}
          className="block w-full rounded border border-[var(--color-line)] bg-white px-1 py-0.5 text-[10px] focus:border-[var(--foreground)] focus:outline-none"
          title="Plattform"
        >
          <option value="">Plattform…</option>
          {TARGET_PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <a
        href={`/dashboard/library/${render.creativeId}`}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        onDragStart={(e) => e.preventDefault()}
        draggable={false}
        className="block border-t border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-[10px] font-medium text-[var(--foreground)] hover:bg-[var(--color-line)]"
      >
        <span className="inline-flex items-center gap-0.5">
          Öffnen <Icon name="chevron-right" className="size-2.5" />
        </span>
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function isOurRender(e: React.DragEvent) {
  return Array.from(e.dataTransfer.types).includes(RENDER_DRAG_TYPE);
}

function toLocalInputValue(d: Date) {
  // <input type="datetime-local"> braucht "yyyy-MM-ddTHH:mm" in lokaler Zeit.
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
