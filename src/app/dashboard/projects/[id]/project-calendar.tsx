"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { POST_STATUSES, TARGET_PLATFORMS } from "./schedule-constants";
import type { ProjectRender } from "./render-plan-board";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTH_NAMES = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

// Lokales Y-M-D (kein toISOString, sonst Off-by-one am Abend in CET/CEST).
function ymdLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Monats-Kalender pro Projekt.
 *
 * Zeigt alle geplanten Renders (scheduled_at gesetzt) als anklickbare Chips
 * auf ihrem Tag. Navigation vor/zurück + „Heute". AI-Bild-Pseudos
 * (scheduledAt === null) erscheinen nie.
 */
export function ProjectCalendar({ renders }: { renders: ProjectRender[] }) {
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const [view, setView] = useState<{ y: number; m: number }>(() => ({
    y: today.getFullYear(),
    m: today.getMonth(),
  }));

  const scheduled = useMemo(
    () => renders.filter((r) => r.scheduledAt),
    [renders],
  );

  // Tag-Bucket (lokal), pro Tag zeitlich sortiert.
  const byDay = useMemo(() => {
    const map = new Map<string, ProjectRender[]>();
    for (const r of scheduled) {
      if (!r.scheduledAt) continue;
      const key = ymdLocal(new Date(r.scheduledAt));
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    for (const arr of map.values()) {
      arr.sort(
        (a, b) =>
          new Date(a.scheduledAt as string).getTime() -
          new Date(b.scheduledAt as string).getTime(),
      );
    }
    return map;
  }, [scheduled]);

  // Grid des Ansichts-Monats — Montag-first, auf volle Wochen aufgefüllt.
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const firstWeekday = (first.getDay() + 6) % 7; // So=0 → Mo=0
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    const arr: Array<Date | null> = [];
    for (let i = 0; i < firstWeekday; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(view.y, view.m, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [view]);

  const monthCount = useMemo(
    () =>
      scheduled.filter((r) => {
        const d = new Date(r.scheduledAt as string);
        return d.getFullYear() === view.y && d.getMonth() === view.m;
      }).length,
    [scheduled, view],
  );

  const goPrev = () =>
    setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }));
  const goNext = () =>
    setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }));
  const goToday = () =>
    setView({ y: today.getFullYear(), m: today.getMonth() });

  const isCurrentMonth =
    view.y === today.getFullYear() && view.m === today.getMonth();

  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-white p-4">
      {/* Kopf: Monat + Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
            {MONTH_NAMES[view.m]} {view.y}
          </h3>
          <span className="text-[11px] text-[var(--color-muted)]">
            {monthCount} geplant
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            aria-label="Vorheriger Monat"
            className="rounded-md border border-[var(--color-line)] bg-white px-2 py-1 text-[12px] font-medium text-[var(--foreground)] hover:bg-[var(--color-surface)]"
          >
            ←
          </button>
          <button
            type="button"
            onClick={goToday}
            disabled={isCurrentMonth}
            className="rounded-md border border-[var(--color-line)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--foreground)] hover:bg-[var(--color-surface)] disabled:opacity-40"
          >
            Heute
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Nächster Monat"
            className="rounded-md border border-[var(--color-line)] bg-white px-2 py-1 text-[12px] font-medium text-[var(--foreground)] hover:bg-[var(--color-surface)]"
          >
            →
          </button>
        </div>
      </div>

      {/* Wochentag-Header */}
      <div className="mt-3 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="pb-1 text-center text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--color-muted)]"
          >
            {w}
          </div>
        ))}
      </div>

      {/* Tage-Grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) {
            return (
              <div
                key={`empty-${i}`}
                className="min-h-[84px] rounded-lg bg-[var(--color-surface)]/40"
              />
            );
          }
          const key = ymdLocal(date);
          const posts = byDay.get(key) ?? [];
          const isToday = date.getTime() === today.getTime();
          return (
            <div
              key={key}
              className={
                "min-h-[84px] rounded-lg border p-1 " +
                (isToday
                  ? "border-[var(--foreground)] bg-[var(--color-surface)]/60"
                  : "border-[var(--color-line)] bg-white")
              }
            >
              <div className="mb-0.5 flex items-center justify-between px-0.5">
                <span
                  className={
                    "text-[11px] font-semibold tabular-nums " +
                    (isToday
                      ? "text-[var(--foreground)]"
                      : "text-[var(--color-muted)]")
                  }
                >
                  {date.getDate()}
                </span>
                {posts.length > 0 && (
                  <span className="rounded-full bg-[var(--foreground)] px-1.5 text-[9px] font-bold text-white tabular-nums">
                    {posts.length}
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                {posts.slice(0, 3).map((r) => (
                  <CalendarChip key={r.id} render={r} />
                ))}
                {posts.length > 3 && (
                  <p className="px-1 text-[9px] font-medium text-[var(--color-muted)]">
                    +{posts.length - 3} mehr
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {scheduled.length === 0 && (
        <p className="mt-3 rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-3 text-center text-[11px] text-[var(--color-muted)]">
          Noch keine Posts geplant. Im Studio einen Render auf „Approve“ setzen
          und im Tab „Bereit zum Posten“ ein Datum vergeben.
        </p>
      )}
    </div>
  );
}

function CalendarChip({ render }: { render: ProjectRender }) {
  const statusMeta =
    POST_STATUSES.find((s) => s.value === render.postStatus) ?? POST_STATUSES[0];
  const platformMeta = TARGET_PLATFORMS.find(
    (p) => p.value === render.targetPlatform,
  );
  const time = render.scheduledAt ? hhmm(render.scheduledAt) : "";

  return (
    <Link
      href={`/dashboard/library/${render.creativeId}`}
      title={`${time} · V${render.variantIndex + 1} · ${render.templateLabel}${
        platformMeta ? ` · ${platformMeta.label}` : ""
      } · ${statusMeta.label}`}
      className="flex items-center gap-1 overflow-hidden rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1 py-0.5 hover:bg-white"
    >
      <span className="text-[9px]">{statusMeta.emoji}</span>
      <span className="truncate text-[9px] font-medium text-[var(--foreground)]">
        {time} V{render.variantIndex + 1}
      </span>
    </Link>
  );
}
