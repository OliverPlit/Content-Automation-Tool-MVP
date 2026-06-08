import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getLearningMetrics } from "@/lib/score/metrics";
import { getFatigueCandidates } from "@/lib/score/fatigue";
import type { SourceFilter } from "@/lib/score/priors";

export const dynamic = "force-dynamic";

const TABS: Array<{ value: SourceFilter; label: string }> = [
  { value: "all", label: "Alle" },
  { value: "meta", label: "Meta" },
  { value: "google_ads", label: "Google" },
];

function parseSource(raw: string | undefined): SourceFilter {
  if (raw === "meta" || raw === "google_ads") return raw;
  return "all";
}

type SearchParams = Promise<{ source?: string }>;

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { source: sourceRaw } = await searchParams;
  const source = parseSource(sourceRaw);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-sm text-[var(--color-muted)]">
        Bitte einloggen.
      </div>
    );
  }

  // Aktive Quelle laden + (im All-Tab) zusätzlich beide Einzel-Quellen für die
  // Vergleichszeile. Drei Calls parallel — Supabase-Roundtrip günstig.
  const [metrics, fatigue, metaMetrics, googleMetrics, googleInsights] =
    await Promise.all([
      getLearningMetrics(supabase, user.id, source),
      getFatigueCandidates(supabase, user.id, { source }),
      source === "all"
        ? getLearningMetrics(supabase, user.id, "meta")
        : Promise.resolve(null),
      source === "all"
        ? getLearningMetrics(supabase, user.id, "google_ads")
        : Promise.resolve(null),
      // Phase F: Effectiveness-Counts aus dem neuesten Google-Ads-Import.
      // Nur für Google-Tab und Alle-Tab interessant; bleibt sonst null.
      source === "meta"
        ? Promise.resolve(null)
        : supabase
            .from("meta_imports")
            .select("insights, created_at")
            .eq("user_id", user.id)
            .eq("kind", "google_ads")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);

  const effectivenessCounts =
    (googleInsights?.data?.insights as { effectivenessCounts?: Record<string, number> } | undefined)
      ?.effectivenessCounts ?? null;

  const hasData =
    metrics.coverage.outcomes > 0 || metrics.coverage.creativesWithFeatures > 0;
  const pct = (n: number) => `${n.toFixed(1)}%`;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-4">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
          Lern-Insights
        </h1>
        <p className="mt-1 text-[13px] text-[var(--color-muted)]">
          Misst, ob der Generator „nach oben“ lernt — aus deinen importierten
          Meta- und Google-Ads-Daten. Werte werden mit Recency-Decay gewichtet
          (neuere zählen mehr).
        </p>
      </header>

      {/* Tabs: Quellen-Filter */}
      <nav className="mb-5 flex gap-1 border-b border-[var(--color-line)]">
        {TABS.map((t) => {
          const active = source === t.value;
          const href =
            t.value === "all" ? "/dashboard/insights" : `/dashboard/insights?source=${t.value}`;
          return (
            <Link
              key={t.value}
              href={href}
              className={
                "rounded-t-md px-3 py-1.5 text-[12px] font-medium transition-colors " +
                (active
                  ? "border-b-2 border-[var(--foreground)] text-[var(--foreground)]"
                  : "text-[var(--color-muted)] hover:text-[var(--foreground)]")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {!hasData ? (
        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6 text-[13px] text-[var(--color-muted)]">
          <p className="font-medium text-[var(--foreground)]">
            Noch keine Lern-Daten {source !== "all" ? `für ${labelOf(source)}` : ""}.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Migrationen in Supabase anwenden (Self-Learning-Tabellen).</li>
            <li>Creatives generieren &amp; speichern (Features werden erfasst).</li>
            <li>
              Meta <code>ads_performance</code> ODER Google-Ads-Bericht importieren —
              sobald Headlines matchen, erscheinen hier echte Zahlen.
            </li>
          </ol>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Quellen-Vergleich nur im All-Tab */}
          {source === "all" && metaMetrics && googleMetrics && (
            <SourceCompare
              meta={metaMetrics.account}
              google={googleMetrics.account}
            />
          )}

          {/* KPI-Karten */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Baseline-CTR" value={pct(metrics.account.baselineCtr)} />
            <Kpi label="Median-CTR" value={pct(metrics.account.medianCtr)} />
            <Kpi label="P95-CTR" value={pct(metrics.account.p95Ctr)} />
            <Kpi
              label="Hit-Rate (≥P95)"
              value={pct(metrics.account.hitRate * 100)}
              hint={`${metrics.account.winners}/${metrics.account.qualifyingCount} signifikante`}
            />
            <Kpi label="Gewinner" value={String(metrics.account.winners)} />
            <Kpi
              label="Fatigue-Kandidaten"
              value={String(metrics.fatigueCount)}
              tone={metrics.fatigueCount > 0 ? "warn" : "default"}
            />
          </div>

          <p className="text-[11px] text-[var(--color-muted)]">
            Datenbasis: {metrics.coverage.creativesWithFeatures} Creatives mit
            Features · {metrics.coverage.outcomes} gematchte Ads ·{" "}
            {metrics.coverage.totalImpressions.toLocaleString("de-DE")} Impressions
            {source !== "all" ? ` (Quelle: ${labelOf(source)})` : ""}.
          </p>

          {/* Effectiveness von Google (Phase F) */}
          {effectivenessCounts && Object.keys(effectivenessCounts).length > 0 && (
            <EffectivenessCard counts={effectivenessCounts} />
          )}

          {/* Feature-Leaderboards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Leaderboard title="Beste Hooks" rows={metrics.leaderboards.hook} />
            <Leaderboard title="Beste Bild-Stile" rows={metrics.leaderboards.imageStyle} />
            <Leaderboard title="Beste Frameworks" rows={metrics.leaderboards.framework} />
          </div>

          {/* Fatigue */}
          <section className="rounded-xl border border-[var(--color-line)] bg-white p-4">
            <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
              Auffrischen-Kandidaten (Fatigue)
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
              Creatives, deren CTR ≥ 25 % unter ihren eigenen Peak gefallen ist.
            </p>
            {fatigue.length === 0 ? (
              <p className="mt-3 text-[12px] text-[var(--color-muted)]">
                Keine — noch keine Zeitreihe oder kein signifikanter Abfall.
              </p>
            ) : (
              <table className="mt-3 w-full text-left text-[12px]">
                <thead className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                  <tr>
                    <th className="py-1">Creative</th>
                    <th className="py-1 text-right">Peak</th>
                    <th className="py-1 text-right">Aktuell</th>
                    <th className="py-1 text-right">Abfall</th>
                  </tr>
                </thead>
                <tbody>
                  {fatigue.map((f) => (
                    <tr key={f.adName} className="border-t border-[var(--color-line)]">
                      <td className="max-w-[280px] truncate py-1.5 pr-2 text-[var(--foreground)]">
                        {f.headline ?? f.adName}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{pct(f.peakCtr)}</td>
                      <td className="py-1.5 text-right tabular-nums">{pct(f.latestCtr)}</td>
                      <td className="py-1.5 text-right font-medium tabular-nums text-amber-700">
                        −{(f.declinePct * 100).toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function labelOf(source: SourceFilter): string {
  if (source === "meta") return "Meta";
  if (source === "google_ads") return "Google";
  return "alle Quellen";
}

function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn";
}) {
  return (
    <div
      className={
        "rounded-xl border p-3 " +
        (tone === "warn"
          ? "border-amber-200 bg-amber-50"
          : "border-[var(--color-line)] bg-white")
      }
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-[var(--foreground)]">
        {value}
      </p>
      {hint && <p className="text-[10px] text-[var(--color-muted)]">{hint}</p>}
    </div>
  );
}

function Leaderboard({
  title,
  rows,
}: {
  title: string;
  rows: { value: string; ctr: number; n: number }[];
}) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-white p-4">
      <h3 className="text-[13px] font-semibold text-[var(--foreground)]">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-[12px] text-[var(--color-muted)]">Noch keine Daten.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {rows.map((r) => (
            <li
              key={r.value}
              className="flex items-center justify-between gap-2 text-[12px]"
            >
              <span className="truncate text-[var(--foreground)]">{r.value}</span>
              <span className="shrink-0 tabular-nums text-[var(--color-muted)]">
                {r.ctr.toFixed(2)}% · n={r.n}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Phase F: Vergleichszeile Meta vs. Google im All-Tab. Beide CTR-Werte
// nebeneinander — bewusst getrennt, weil Search- und Browse-Intent
// strukturell unterschiedlich hohe CTRs erzeugen.
function SourceCompare({
  meta,
  google,
}: {
  meta: { medianCtr: number; baselineCtr: number; winners: number };
  google: { medianCtr: number; baselineCtr: number; winners: number };
}) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-white p-4">
      <h3 className="text-[13px] font-semibold text-[var(--foreground)]">
        Plattform-Vergleich
      </h3>
      <p className="text-[11px] text-[var(--color-muted)]">
        Search-Intent (Google) erzeugt naturgemäß höhere CTRs als Browse-Intent
        (Meta) — beide Werte sind für sich aussagekräftig.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <CompareCell label="Meta" {...meta} />
        <CompareCell label="Google" {...google} />
      </div>
    </div>
  );
}

function CompareCell({
  label,
  medianCtr,
  baselineCtr,
  winners,
}: {
  label: string;
  medianCtr: number;
  baselineCtr: number;
  winners: number;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--foreground)]">
        {medianCtr.toFixed(2)}%
      </p>
      <p className="text-[11px] text-[var(--color-muted)]">
        Baseline {baselineCtr.toFixed(2)}% · {winners} Gewinner
      </p>
    </div>
  );
}

// Phase F: Anzeigeneffektivität von Google (Sehr gut / Gut / Ausstehend / …).
function EffectivenessCard({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  if (total === 0) return null;
  const order = ["Sehr gut", "Gut", "Ausstehend", "Schlecht", "Unbekannt"];
  const sorted = Object.entries(counts).sort(
    ([a], [b]) => order.indexOf(a) - order.indexOf(b),
  );
  return (
    <section className="rounded-xl border border-[var(--color-line)] bg-white p-4">
      <h3 className="text-[13px] font-semibold text-[var(--foreground)]">
        Anzeigeneffektivität (Google)
      </h3>
      <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
        Wie Google deine RSA-Komponenten bewertet — höher = mehr Reichweite.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {sorted.map(([key, n]) => (
          <span
            key={key}
            className={
              "rounded-full px-2.5 py-0.5 text-[11px] font-medium tabular-nums " +
              toneFor(key)
            }
          >
            {key}: {n}
          </span>
        ))}
      </div>
    </section>
  );
}

function toneFor(rating: string): string {
  if (rating === "Sehr gut") return "bg-emerald-50 text-emerald-800 border border-emerald-200";
  if (rating === "Gut") return "bg-sky-50 text-sky-800 border border-sky-200";
  if (rating === "Ausstehend") return "bg-amber-50 text-amber-800 border border-amber-200";
  if (rating === "Schlecht") return "bg-red-50 text-red-800 border border-red-200";
  return "bg-slate-50 text-slate-700 border border-slate-200";
}
