import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { adCopyLooseSchema } from "./generate/schema";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    { data: recentCreatives, count: creativeCount },
    { count: imageCount },
    { count: renderCount },
    { count: projectCount },
    { count: templateCount },
  ] = await Promise.all([
    supabase
      .from("creatives")
      .select("id, prompt, output, status, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("creative_images")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("creative_renders")
      .select("id", { count: "exact", head: true })
      .eq("status", "succeeded"),
    supabase.from("projects").select("id", { count: "exact", head: true }),
    supabase.from("templates").select("id", { count: "exact", head: true }),
  ]);

  const recentIds = (recentCreatives ?? []).map((c) => c.id);
  const thumbByCreative = new Map<string, string>();
  if (recentIds.length > 0) {
    const { data: imgRows } = await supabase
      .from("creative_images")
      .select("creative_id, image_url, variant_index")
      .in("creative_id", recentIds)
      .order("variant_index", { ascending: true });
    (imgRows ?? []).forEach((r) => {
      const cid = r.creative_id as string;
      if (!thumbByCreative.has(cid))
        thumbByCreative.set(cid, r.image_url as string);
    });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="rounded-2xl bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 px-6 py-8 text-white shadow-xl shadow-blue-900/20">
        <h1 className="text-3xl font-bold tracking-tight">Übersicht</h1>
        <p className="mt-1 max-w-xl text-sm text-blue-100">
          Willkommen im Creative-Tool. Schneller Zugriff auf alle Bereiche und
          die letzten Aktivitäten.
        </p>
      </header>

      {/* ---- Stats ---- */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Creatives"
          value={creativeCount ?? 0}
          href="/dashboard/library"
          accent="blue"
        />
        <StatCard
          label="Bilder"
          value={imageCount ?? 0}
          href="/dashboard/library"
          accent="emerald"
        />
        <StatCard
          label="Renders"
          value={renderCount ?? 0}
          href="/dashboard/library"
          accent="violet"
        />
        <StatCard
          label="Projekte"
          value={projectCount ?? 0}
          href="/dashboard/projects"
          accent="amber"
        />
      </section>

      {/* ---- Quick actions ---- */}
      <section className="mt-10">
        <h2 className="text-sm font-bold uppercase tracking-wider text-blue-900">
          Schnellzugriff
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ActionCard
            href="/dashboard/generate"
            title="Neu generieren"
            description="Headline, Subline und 5 Ad-Copy-Varianten erstellen."
            icon="✨"
            accent="blue"
            primary
          />
          <ActionCard
            href="/dashboard/library"
            title="Library"
            description="Gespeicherte Creatives bearbeiten, Bilder & Videos rendern."
            icon="📂"
            accent="emerald"
          />
          <ActionCard
            href="/dashboard/projects"
            title="Projekte"
            description="Creatives in Kampagnen oder Kunden bündeln."
            icon="🗂️"
            accent="amber"
            badge={projectCount ? `${projectCount}` : "leer"}
          />
          <ActionCard
            href="/dashboard/templates"
            title="Templates"
            description="Wiederverwendbare Prompt-Vorlagen verwalten."
            icon="📐"
            accent="violet"
            badge={templateCount ? `${templateCount}` : "leer"}
          />
        </div>
      </section>

      {/* ---- Recent activity ---- */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-blue-900">
            Zuletzt erstellt
          </h2>
          <Link
            href="/dashboard/library"
            className="text-xs font-medium text-blue-700 hover:text-blue-900"
          >
            Alle in der Library →
          </Link>
        </div>

        {recentCreatives && recentCreatives.length > 0 ? (
          <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-blue-900/5">
            {recentCreatives.map((c) => {
              const parsed = safeParse(c.output);
              const thumb = thumbByCreative.get(c.id);
              return (
                <li key={c.id}>
                  <Link
                    href={`/dashboard/library/${c.id}`}
                    className="flex items-center gap-4 px-5 py-3 transition-all duration-150 hover:bg-blue-50/60"
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 object-cover shadow-sm"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-[10px] text-slate-400">
                        kein Bild
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      {parsed ? (
                        <>
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {parsed.headline}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {parsed.subline}
                          </p>
                        </>
                      ) : (
                        <p className="truncate text-sm text-slate-700">
                          {c.prompt}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">
                      {new Date(c.created_at).toLocaleDateString("de-DE")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-md shadow-blue-900/5">
            <p className="text-sm text-slate-600">
              Noch keine Creatives vorhanden.
            </p>
            <Link
              href="/dashboard/generate"
              className="mt-4 inline-block rounded-lg bg-gradient-to-br from-blue-800 to-blue-950 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-900/40"
            >
              Jetzt erste Creative generieren →
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function safeParse(raw: string | null) {
  if (!raw) return null;
  try {
    const result = adCopyLooseSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

const STAT_ACCENTS: Record<string, { bar: string; text: string }> = {
  blue: { bar: "from-blue-700 to-blue-900", text: "text-blue-900" },
  emerald: { bar: "from-emerald-500 to-emerald-700", text: "text-emerald-700" },
  violet: { bar: "from-violet-500 to-violet-700", text: "text-violet-700" },
  amber: { bar: "from-amber-500 to-amber-700", text: "text-amber-700" },
};

function StatCard({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: number;
  href: string;
  accent: "blue" | "emerald" | "violet" | "amber";
}) {
  const a = STAT_ACCENTS[accent];
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-md shadow-blue-900/5 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-900/10"
    >
      <div
        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${a.bar} opacity-80`}
      />
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className={`mt-2 text-3xl font-bold ${a.text}`}>{value}</p>
    </Link>
  );
}

const ACTION_ACCENTS: Record<
  string,
  { ring: string; iconBg: string; hoverBorder: string }
> = {
  blue: {
    ring: "ring-blue-300/60",
    iconBg: "bg-gradient-to-br from-blue-700 to-blue-950 text-white",
    hoverBorder: "hover:border-blue-400",
  },
  emerald: {
    ring: "ring-emerald-300/60",
    iconBg: "bg-gradient-to-br from-emerald-400 to-emerald-700 text-white",
    hoverBorder: "hover:border-emerald-400",
  },
  amber: {
    ring: "ring-amber-300/60",
    iconBg: "bg-gradient-to-br from-amber-400 to-amber-600 text-white",
    hoverBorder: "hover:border-amber-400",
  },
  violet: {
    ring: "ring-violet-300/60",
    iconBg: "bg-gradient-to-br from-violet-500 to-violet-700 text-white",
    hoverBorder: "hover:border-violet-400",
  },
};

function ActionCard({
  href,
  title,
  description,
  icon,
  accent,
  badge,
  primary = false,
}: {
  href: string;
  title: string;
  description: string;
  icon: string;
  accent: "blue" | "emerald" | "amber" | "violet";
  badge?: string;
  primary?: boolean;
}) {
  const a = ACTION_ACCENTS[accent];
  return (
    <Link
      href={href}
      className={
        "group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-blue-900/5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-900/10 " +
        a.hoverBorder +
        (primary ? " ring-2 " + a.ring : "")
      }
    >
      <div className="flex items-baseline justify-between">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl shadow-md ${a.iconBg}`}
        >
          {icon}
        </div>
        {badge && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-4 text-base font-bold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      <span className="mt-3 text-xs font-semibold text-blue-700 transition-transform group-hover:translate-x-0.5">
        Öffnen →
      </span>
    </Link>
  );
}
