"use client";

import { useEffect, useMemo, useState } from "react";

import { CreativeTabs } from "./creative-tabs";
import { RenderFocusView } from "./render-focus-view";
import {
  FOCUS_KIND_ORDER_LIBRARY,
  useFocusNavigation,
} from "./use-focus-navigation";
import { VariantTabs } from "./variant-tabs";
import {
  POST_STATUSES,
  type PostStatus,
} from "./schedule-constants";
import { updateRenderStatus } from "./schedule-actions";

export type ProjectRender = {
  id: string;
  creativeId: string;
  variantIndex: number;
  templateKind: "staticSquare" | "animatedSquare" | "reelVertical";
  outputUrl: string | null;
  status: "pending" | "processing" | "succeeded" | "failed";
  scheduledAt: string | null;
  postStatus: PostStatus;
  targetPlatform: string | null;
  notes: string | null;
  // Display-Hints
  creativeHeadline: string;
  creativeBody: string;
  templateLabel: string;
  outputExt: "jpg" | "png" | "mp4";
  aspectRatio: string;
};

export function RenderPlanBoard({
  renders,
  metaConnected,
}: {
  renders: ProjectRender[];
  metaConnected: boolean;
}) {
  const [filter, setFilter] = useState<PostStatus | "all">("all");

  // URL-Param ?focus=<id> als initialer Focus-State
  const [focusedId, setFocusedId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const url = new URL(window.location.href);
    return url.searchParams.get("focus");
  });

  // Gefilterte Liste (Pfeiltasten + FocusView nutzen nur diese)
  const filtered = useMemo(
    () => (filter === "all" ? renders : renders.filter((r) => r.postStatus === filter)),
    [renders, filter],
  );

  // Wenn der gewählte Focus nicht im gefilterten Set ist → auf erstes Element
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (filtered.length === 0) {
      setFocusedId(null);
      return;
    }
    if (!focusedId || !filtered.some((r) => r.id === focusedId)) {
      setFocusedId(filtered[0].id);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [filtered, focusedId]);

  // URL-Sync ohne History-Spam
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (focusedId) url.searchParams.set("focus", focusedId);
    else url.searchParams.delete("focus");
    window.history.replaceState(null, "", url.toString());
  }, [focusedId]);

  // CreativeId nur fürs UI (Highlight, Tab-Anzeige) — die NAVIGATION
  // läuft jetzt projektweit mit wrap-around: V1 von Creative A → V1 von
  // Creative B endlos durchklickbar.
  const focusedCreativeId = useMemo(() => {
    if (!focusedId) return filtered[0]?.creativeId ?? null;
    const r = filtered.find((x) => x.id === focusedId);
    return r?.creativeId ?? filtered[0]?.creativeId ?? null;
  }, [focusedId, filtered]);

  const filteredForCreative = useMemo(
    () =>
      focusedCreativeId
        ? filtered.filter((r) => r.creativeId === focusedCreativeId)
        : filtered,
    [filtered, focusedCreativeId],
  );

  // Navigation projektweit, gruppiert nach (creativeId, variantIndex).
  // Spalten: image, staticSquare, animatedSquare, reelVertical — damit
  // Creatives OHNE Renders durch die AI-Bild-Pseudo-Spalte angeklickt werden.
  const { focused, neighbors } = useFocusNavigation(
    filtered,
    focusedId,
    FOCUS_KIND_ORDER_LIBRARY,
    {
      rowKey: (r) => `${r.creativeId}:${r.variantIndex}`,
      wrap: true,
    },
  );

  // Globale Keyboard-Handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Pausieren wenn ein Input-Element den Focus hat
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          // Sondertaste Esc: alles unfokussieren
          if (e.key === "Escape") {
            (target as HTMLElement).blur();
          }
          return;
        }
      }

      // Pfeiltasten
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        let target: ProjectRender | null = null;
        if (e.key === "ArrowLeft") target = neighbors.prevFormat;
        else if (e.key === "ArrowRight") target = neighbors.nextFormat;
        else if (e.key === "ArrowUp") target = neighbors.prevVariant;
        else if (e.key === "ArrowDown") target = neighbors.nextVariant;
        if (target) {
          e.preventDefault();
          setFocusedId(target.id);
        }
        return;
      }

      // 1-7 = Status (im Schnellzugriff)
      if (focused && /^[1-7]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const status = POST_STATUSES[idx]?.value;
        if (!status) return;
        e.preventDefault();
        const fd = new FormData();
        fd.set("renderId", focused.id);
        fd.set("postStatus", status);
        void updateRenderStatus({ ok: false }, fd);
        return;
      }

      // Enter → Library-Detail
      if (focused && e.key === "Enter") {
        e.preventDefault();
        window.open(`/dashboard/library/${focused.creativeId}`, "_blank");
        return;
      }

      // D / P → Form-Felder fokussieren
      if (focused && (e.key === "d" || e.key === "D")) {
        const el = document.querySelector<HTMLInputElement>(
          'input[data-focus-key="scheduledAt"]',
        );
        if (el) {
          e.preventDefault();
          el.focus();
        }
        return;
      }
      if (focused && (e.key === "p" || e.key === "P")) {
        const el = document.querySelector<HTMLSelectElement>(
          'select[data-focus-key="targetPlatform"]',
        );
        if (el) {
          e.preventDefault();
          el.focus();
        }
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focused, neighbors]);

  // Counts pro Status für Filter-Pills
  const counts = useMemo(() => {
    const c: Record<PostStatus | "all", number> = {
      all: renders.length,
      draft: 0,
      review: 0,
      approved: 0,
      scheduled: 0,
      live: 0,
      paused: 0,
      archived: 0,
    };
    for (const r of renders) c[r.postStatus] += 1;
    return c;
  }, [renders]);

  if (renders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
        <p>Noch keine gerenderten Varianten in diesem Projekt.</p>
        <p className="mt-2 text-xs text-slate-400">
          Gehe in die Library, öffne ein Creative dieses Projekts und renderer
          die Format-Varianten (Static / Animated / Reel).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Meta-Connect-Stub */}
      <MetaConnectStub metaConnected={metaConnected} />

      {/* Kalender-Strip */}
      <CalendarStrip renders={renders} />

      {/* Status-Filter-Pills */}
      <div className="flex flex-wrap gap-1.5">
        <FilterPill
          label="Alle"
          emoji="🗂"
          count={counts.all}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        {POST_STATUSES.map((s) => (
          <FilterPill
            key={s.value}
            label={s.label}
            emoji={s.emoji}
            count={counts[s.value]}
            active={filter === s.value}
            onClick={() => setFilter(s.value)}
          />
        ))}
      </div>

      {/* Creative-Tabs — click-through zwischen Creatives im Projekt */}
      <CreativeTabs
        items={filtered}
        currentCreativeId={focusedCreativeId}
        onSelect={(r) => setFocusedId(r.id)}
      />

      {/* Variant-Tabs — click-through Varianten INNERHALB des Creatives */}
      <VariantTabs
        items={filteredForCreative}
        currentVariantIndex={focused?.variantIndex ?? null}
        onSelect={(r) => setFocusedId(r.id)}
        label="Varianten"
      />

      {/* Focus-View oben */}
      <RenderFocusView
        focused={focused}
        neighbors={neighbors}
        onSelect={(r) => setFocusedId(r.id)}
        formatLabel={(kind) => {
          const r = renders.find((x) => x.templateKind === kind);
          return r?.templateLabel ?? kind;
        }}
      />

      {/* Kompaktes Grid darunter — projektweit (zeigt alle Creatives) */}
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Alle ({filtered.length}) — Klick fokussiert auch andere Creatives
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
          {filtered.map((r) => (
            <RenderCardMini
              key={r.id}
              render={r}
              active={r.id === focused?.id}
              creativeBoundary={r.creativeId !== focusedCreativeId}
              onClick={() => setFocusedId(r.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Render-Card kompakt — nur Thumbnail + Mini-Badges
// ---------------------------------------------------------------------------
function RenderCardMini({
  render,
  active,
  creativeBoundary,
  onClick,
}: {
  render: ProjectRender;
  active: boolean;
  creativeBoundary?: boolean;
  onClick: () => void;
}) {
  const statusMeta =
    POST_STATUSES.find((s) => s.value === render.postStatus) ?? POST_STATUSES[0];
  const isVideo = render.outputExt === "mp4";

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "group relative overflow-hidden rounded-lg border bg-white text-left shadow-sm transition " +
        (active
          ? "border-blue-700 ring-2 ring-blue-300"
          : creativeBoundary
            ? "border-amber-200 opacity-70 hover:border-amber-400 hover:opacity-100"
            : "border-slate-200 hover:border-blue-400")
      }
      title={creativeBoundary ? "Anderes Creative — klick zum Wechseln" : undefined}
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
            {render.status === "processing" ? "rendert…" : "—"}
          </div>
        )}
        <span
          className={
            "absolute left-1 top-1 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide shadow " +
            statusBadgeClasses(statusMeta.color)
          }
        >
          {statusMeta.emoji}
        </span>
        {isVideo && (
          <span className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[8px] font-bold text-white">
            ▶
          </span>
        )}
      </div>
      <div className="px-1.5 py-1 text-[9px]">
        <p className="font-semibold text-slate-800">
          V{render.variantIndex + 1}
        </p>
        <p className="truncate text-slate-500">{render.templateLabel}</p>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Meta Connect Placeholder
// ---------------------------------------------------------------------------
function MetaConnectStub({ metaConnected }: { metaConnected: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4">
      <div>
        <p className="text-sm font-semibold text-blue-900">
          {metaConnected ? "✓ Mit Meta verbunden" : "Mit Meta verbinden (bald)"}
        </p>
        <p className="mt-0.5 text-xs text-blue-800/80">
          {metaConnected
            ? "Geplante Posts werden automatisch zu Meta gepusht."
            : "Bald: OAuth mit Meta. Bis dahin nutzt du den Plan als Briefing."}
        </p>
      </div>
      <button
        type="button"
        disabled
        className="cursor-not-allowed rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 opacity-60"
        title="In Roadmap"
      >
        🔗 Verbinden
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar Strip
// ---------------------------------------------------------------------------
function CalendarStrip({ renders }: { renders: ProjectRender[] }) {
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const days = useMemo(() => {
    const arr: { date: Date; key: string; count: number }[] = [];
    for (let i = 0; i < 28; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      arr.push({ date: d, key, count: 0 });
    }
    const byKey = new Map(arr.map((a) => [a.key, a]));
    for (const r of renders) {
      if (!r.scheduledAt) continue;
      const k = new Date(r.scheduledAt).toISOString().slice(0, 10);
      const entry = byKey.get(k);
      if (entry) entry.count += 1;
    }
    return arr;
  }, [renders, today]);

  const maxCount = Math.max(1, ...days.map((d) => d.count));

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Nächste 4 Wochen
        </p>
        <p className="text-[10px] text-slate-400">
          {renders.filter((r) => r.scheduledAt).length} geplant
        </p>
      </div>
      <div className="grid grid-cols-7 gap-1 rounded-xl border border-slate-200 bg-white p-2 text-center">
        {days.map((d) => {
          const isToday = d.date.getTime() === today.getTime();
          const dayLabel = d.date.toLocaleDateString("de-DE", {
            day: "numeric",
            month: "short",
          });
          const weekday = d.date.toLocaleDateString("de-DE", {
            weekday: "short",
          });
          const heat = d.count > 0 ? d.count / maxCount : 0;
          const bgIntensity = Math.floor(heat * 4);
          const bgClass = [
            "bg-slate-50",
            "bg-blue-100",
            "bg-blue-200",
            "bg-blue-400",
            "bg-blue-700",
          ][bgIntensity];
          const textClass = bgIntensity >= 3 ? "text-white" : "text-slate-700";
          return (
            <div
              key={d.key}
              className={`flex flex-col items-center justify-center rounded-md px-1 py-1.5 text-[10px] ${bgClass} ${textClass} ${
                isToday ? "ring-2 ring-emerald-500" : ""
              }`}
              title={
                d.count > 0 ? `${d.count} Posts geplant am ${dayLabel}` : dayLabel
              }
            >
              <span className="opacity-70">{weekday}</span>
              <span className="font-semibold">{d.date.getDate()}</span>
              {d.count > 0 && (
                <span className="mt-0.5 rounded-full bg-white/40 px-1.5 text-[9px] font-bold">
                  {d.count}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterPill({
  label,
  emoji,
  count,
  active,
  onClick,
}: {
  label: string;
  emoji: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition " +
        (active
          ? "bg-blue-700 text-white ring-blue-700"
          : "bg-white text-slate-700 ring-slate-300 hover:bg-blue-50")
      }
    >
      <span>{emoji}</span>
      <span>{label}</span>
      <span
        className={
          "rounded-full px-1.5 text-[10px] font-bold " +
          (active ? "bg-blue-900 text-white" : "bg-slate-100 text-slate-600")
        }
      >
        {count}
      </span>
    </button>
  );
}

function statusBadgeClasses(color: string): string {
  switch (color) {
    case "slate":
      return "bg-slate-700/90 text-white";
    case "amber":
      return "bg-amber-600 text-white";
    case "blue":
      return "bg-blue-700 text-white";
    case "purple":
      return "bg-purple-700 text-white";
    case "emerald":
      return "bg-emerald-600 text-white";
    case "orange":
      return "bg-orange-600 text-white";
    case "stone":
      return "bg-stone-600 text-white";
    default:
      return "bg-slate-700 text-white";
  }
}
