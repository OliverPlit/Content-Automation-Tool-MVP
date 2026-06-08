import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/icon";
import { TEMPLATE_META, type TemplateKind } from "@/lib/creatomate/templates";
import {
  TARGET_PLATFORMS,
  type PostStatus,
} from "./[id]/schedule-constants";
import { CreateProjectForm } from "./create-form";

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

type ScheduledRender = {
  id: string;
  creativeId: string;
  scheduledAt: string;
  postStatus: PostStatus;
  templateKind: TemplateKind;
  targetPlatform: string | null;
  outputUrl: string | null;
  projectId: string | null;
  creativeHeadline: string;
};

/**
 * Plan-Page (was: /dashboard/projects).
 * Hauptansicht: Kalender der nächsten 4 Wochen über ALLE Projekte.
 * Sidebar: Projekt-Liste + Schnell-Aktionen.
 */
export default async function PlanPage() {
  const supabase = await createClient();

  // 1) Projekte für Sidebar
  const { data: projectRows } = await supabase
    .from("projects")
    .select("id, name")
    .order("created_at", { ascending: false });
  const projects = (projectRows ?? []) as Pick<ProjectRow, "id" | "name">[];

  // 2) Geplante Renders (mit scheduled_at) — projektübergreifend
  const { data: renderRows } = await supabase
    .from("creative_renders")
    .select(
      "id, creative_id, scheduled_at, post_status, template_kind, target_platform, output_url, status",
    )
    .not("scheduled_at", "is", null)
    .order("scheduled_at", { ascending: true });

  // 3) Creative-Project-Mapping für die geplanten Items
  const creativeIds = Array.from(
    new Set((renderRows ?? []).map((r) => r.creative_id as string)),
  );
  const headlineByCreative = new Map<string, string>();
  const projectByCreative = new Map<string, string | null>();
  if (creativeIds.length > 0) {
    const { data: creatives } = await supabase
      .from("creatives")
      .select("id, output, project_id")
      .in("id", creativeIds);
    (creatives ?? []).forEach((c) => {
      projectByCreative.set(
        c.id as string,
        (c.project_id as string | null) ?? null,
      );
      try {
        const parsed = JSON.parse(c.output ?? "");
        if (parsed?.headline) {
          headlineByCreative.set(c.id as string, String(parsed.headline));
        }
      } catch {
        // ignore
      }
    });
  }

  const scheduled: ScheduledRender[] = (renderRows ?? []).map((r) => ({
    id: r.id as string,
    creativeId: r.creative_id as string,
    scheduledAt: r.scheduled_at as string,
    postStatus: (r.post_status as PostStatus) ?? "draft",
    templateKind: r.template_kind as TemplateKind,
    targetPlatform: (r.target_platform as string | null) ?? null,
    outputUrl: (r.output_url as string | null) ?? null,
    projectId: projectByCreative.get(r.creative_id as string) ?? null,
    creativeHeadline: headlineByCreative.get(r.creative_id as string) ?? "—",
  }));

  // 4) Build 28-day calendar starting today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: {
    date: Date;
    key: string;
    items: ScheduledRender[];
  }[] = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push({
      date: d,
      key: d.toISOString().slice(0, 10),
      items: [],
    });
  }
  const dayByKey = new Map(days.map((d) => [d.key, d]));
  for (const s of scheduled) {
    const k = new Date(s.scheduledAt).toISOString().slice(0, 10);
    const entry = dayByKey.get(k);
    if (entry) entry.items.push(s);
  }

  // Counts pro Status für Kopf
  const counts = {
    total: scheduled.length,
    draft: scheduled.filter((s) => s.postStatus === "draft").length,
    scheduled: scheduled.filter((s) => s.postStatus === "scheduled").length,
    live: scheduled.filter((s) => s.postStatus === "live").length,
  };

  return (
    <div className="-mx-8 -my-8 flex h-[calc(100vh-64px)] flex-1 overflow-hidden">
      {/* Sidebar: Projekte */}
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-[var(--color-line)] bg-white">
        <div className="border-b border-[var(--color-line)] px-4 py-3">
          <h1 className="text-[18px] font-semibold tracking-tight text-[var(--foreground)]">
            Plan
          </h1>
          <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
            {projects.length} Projekt{projects.length === 1 ? "" : "e"} ·{" "}
            {counts.total} geplante Posts
          </p>
        </div>

        <div className="border-b border-[var(--color-line)] p-3">
          <CreateProjectForm />
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
            Projekte
          </p>
          {projects.length === 0 ? (
            <p className="px-2 py-3 text-[12px] text-[var(--color-muted)]">
              Noch keine Projekte.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/dashboard/projects/${p.id}`}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-[12px] text-[var(--foreground)] hover:bg-[var(--color-surface)]"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Icon
                        name="folder"
                        className="size-3.5 text-[var(--color-muted)]"
                      />
                      <span className="truncate">{p.name}</span>
                    </span>
                    <Icon
                      name="chevron-right"
                      className="size-3 text-[var(--color-muted)]"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </nav>
      </aside>

      {/* Main: Kalender */}
      <main className="flex-1 overflow-y-auto bg-[var(--color-surface)] px-8 py-8">
        <div className="mx-auto max-w-5xl">
          <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
                Nächste 4 Wochen
              </p>
              <h2 className="mt-0.5 text-[24px] font-semibold tracking-tight text-[var(--foreground)]">
                Kalender
              </h2>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-[var(--color-muted)]">
              <Stat label="Draft" value={counts.draft} />
              <Stat label="Scheduled" value={counts.scheduled} />
              <Stat label="Live" value={counts.live} />
            </div>
          </header>

          {/* Kalender-Grid */}
          <CalendarGrid days={days} today={today} />

          {/* Items als Liste — direkt unter dem Kalender */}
          {counts.total > 0 ? (
            <section className="mt-8">
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
                Posts der nächsten Tage
              </p>
              <div className="mt-2 space-y-2">
                {scheduled.slice(0, 20).map((s) => (
                  <PostRow key={s.id} item={s} />
                ))}
              </div>
            </section>
          ) : (
            <section className="mt-8 rounded-xl border border-dashed border-[var(--color-line)] bg-white p-10 text-center">
              <h3 className="text-[15px] font-semibold text-[var(--foreground)]">
                Noch nichts geplant
              </h3>
              <p className="mt-1 text-[13px] text-[var(--color-muted)]">
                Im Studio Renders auf „Approve“ setzen, Datum + Plattform
                wählen — dann landen sie hier.
              </p>
              <Link
                href="/dashboard/library"
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--foreground)] px-4 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
              >
                Zum Studio
                <Icon name="chevron-right" className="size-3.5" />
              </Link>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[15px] font-semibold tabular-nums text-[var(--foreground)]">
        {value}
      </span>
      <span className="uppercase tracking-[0.08em]">{label}</span>
    </div>
  );
}

function CalendarGrid({
  days,
  today,
}: {
  days: { date: Date; key: string; items: ScheduledRender[] }[];
  today: Date;
}) {
  const maxItems = Math.max(1, ...days.map((d) => d.items.length));
  const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
        {weekdays.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const isToday = d.date.getTime() === today.getTime();
          const heat = d.items.length / maxItems;
          const intensity = Math.floor(heat * 4); // 0..4
          const bg = [
            "bg-white",
            "bg-[var(--color-surface)]",
            "bg-[var(--color-line)]",
            "bg-[var(--color-muted)]",
            "bg-[var(--foreground)]",
          ][intensity];
          const text =
            intensity >= 3
              ? "text-white"
              : "text-[var(--foreground)]";
          return (
            <div
              key={d.key}
              className={
                "flex aspect-square flex-col rounded-lg border border-[var(--color-line)] p-1.5 " +
                bg +
                " " +
                text +
                (isToday ? " ring-2 ring-[var(--foreground)]" : "")
              }
            >
              <span className="text-[14px] font-semibold tabular-nums leading-none">
                {d.date.getDate()}
              </span>
              {d.items.length > 0 && (
                <span
                  className={
                    "mt-auto text-[10px] tabular-nums " +
                    (intensity >= 3 ? "opacity-90" : "opacity-70")
                  }
                >
                  {d.items.length} Post{d.items.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PostRow({ item }: { item: ScheduledRender }) {
  const tplMeta = TEMPLATE_META[item.templateKind];
  const platformLabel = item.targetPlatform
    ? (TARGET_PLATFORMS.find((p) => p.value === item.targetPlatform)?.label ??
      item.targetPlatform)
    : null;
  const date = new Date(item.scheduledAt);
  const dateLabel = date.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeLabel = date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Link
      href={`/dashboard/library/${item.creativeId}`}
      className="flex items-center gap-3 rounded-xl border border-[var(--color-line)] bg-white px-3 py-2 hover:bg-[var(--color-surface)]"
    >
      {item.outputUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.outputUrl}
          alt=""
          className="h-10 w-10 shrink-0 rounded border border-[var(--color-line)] object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-muted)]">
          <Icon name="image" className="size-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[var(--foreground)]">
          {item.creativeHeadline}
        </p>
        <p className="truncate text-[11px] text-[var(--color-muted)]">
          {tplMeta?.label ?? item.templateKind}
          {platformLabel ? ` · ${platformLabel}` : ""}
        </p>
      </div>
      <div className="shrink-0 text-right text-[11px] tabular-nums text-[var(--color-muted)]">
        <p>{dateLabel}</p>
        <p>{timeLabel}</p>
      </div>
      <span
        className={
          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] " +
          (item.postStatus === "live"
            ? "bg-[var(--foreground)] text-white"
            : "bg-[var(--color-surface)] text-[var(--foreground)]")
        }
      >
        {item.postStatus}
      </span>
    </Link>
  );
}
