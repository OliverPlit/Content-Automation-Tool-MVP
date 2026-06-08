import { createClient } from "@/lib/supabase/server";
import { getLearningMetrics } from "@/lib/score/metrics";
import { getFatigueCandidates } from "@/lib/score/fatigue";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
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

  const [metrics, fatigue] = await Promise.all([
    getLearningMetrics(supabase, user.id),
    getFatigueCandidates(supabase, user.id),
  ]);

  const hasData =
    metrics.coverage.outcomes > 0 || metrics.coverage.creativesWithFeatures > 0;
  const pct = (n: number) => `${n.toFixed(1)}%`;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
          Lern-Insights
        </h1>
        <p className="mt-1 text-[13px] text-[var(--color-muted)]">
          Misst, ob der Generator „nach oben“ lernt — aus deinen importierten
          Meta-Daten. Werte werden mit Recency-Decay gewichtet (neuere zählen
          mehr).
        </p>
      </header>

      {!hasData ? (
        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6 text-[13px] text-[var(--color-muted)]">
          <p className="font-medium text-[var(--foreground)]">
            Noch keine Lern-Daten.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Migrationen in Supabase anwenden (Self-Learning-Tabellen).</li>
            <li>Creatives generieren &amp; speichern (Features werden erfasst).</li>
            <li>
              Eine Meta <code>ads_performance</code>-CSV importieren — sobald die
              Headlines matchen, erscheinen hier echte Zahlen.
            </li>
          </ol>
        </div>
      ) : (
        <div className="space-y-6">
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
            {metrics.coverage.totalImpressions.toLocaleString("de-DE")} Impressions.
          </p>

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

function Leaderboard({ title, rows }: { title: string; rows: { value: string; ctr: number; n: number }[] }) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-white p-4">
      <h3 className="text-[13px] font-semibold text-[var(--foreground)]">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-[12px] text-[var(--color-muted)]">Noch keine Daten.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {rows.map((r) => (
            <li key={r.value} className="flex items-center justify-between gap-2 text-[12px]">
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
