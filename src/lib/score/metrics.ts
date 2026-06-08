/**
 * Self-Learning · Phase 5 — Lern-KPIs fürs Insights-Dashboard.
 *
 * Aggregiert die vorhandenen Bausteine (Priors, Top-Performer, Fatigue) zu
 * einem kompakten Kennzahlen-Set: misst, ob der Generator „nach oben" lernt.
 */
import type { createClient } from "@/lib/supabase/server";
import {
  getPerformancePriors,
  type AxisPriors,
  type SourceFilter,
} from "./priors";
import { getTopPerformers } from "./winners";
import { getFatigueCandidates } from "./fatigue";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type LeaderRow = { value: string; ctr: number; n: number };

export type LearningMetrics = {
  coverage: {
    creativesWithFeatures: number;
    outcomes: number;
    totalImpressions: number;
  };
  account: {
    medianCtr: number; // %
    p95Ctr: number; // %
    qualifyingCount: number;
    winners: number;
    hitRate: number; // 0..1 — Anteil Über-P95 an signifikanten Creatives
    baselineCtr: number; // %
  };
  leaderboards: {
    hook: LeaderRow[];
    imageStyle: LeaderRow[];
    framework: LeaderRow[];
  };
  fatigueCount: number;
};

function leaderboard(axis: AxisPriors, top = 5): LeaderRow[] {
  return Array.from(axis.entries())
    .filter(([, s]) => s.n > 0)
    .map(([value, s]) => ({ value, ctr: s.mean * 100, n: Math.round(s.n) }))
    .sort((a, b) => b.ctr - a.ctr)
    .slice(0, top);
}

export async function getLearningMetrics(
  supabase: SupabaseServerClient,
  userId: string,
  source: SourceFilter = "all",
): Promise<LearningMetrics> {
  let outcomeQuery = supabase
    .from("creative_outcomes")
    .select("impressions")
    .eq("user_id", userId);
  if (source !== "all") outcomeQuery = outcomeQuery.eq("source", source);

  const [priors, winnerSel, fatigue, featCount, outcomeAgg] = await Promise.all([
    getPerformancePriors(supabase, userId, source),
    getTopPerformers(supabase, userId, { source }),
    getFatigueCandidates(supabase, userId, { source }),
    supabase
      .from("creative_features")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    outcomeQuery,
  ]);

  const outcomeRows = (outcomeAgg.data ?? []) as { impressions: number | null }[];
  const totalImpressions = outcomeRows.reduce(
    (sum, r) => sum + Number(r.impressions ?? 0),
    0,
  );

  const winners = winnerSel.winners.length;
  const hitRate =
    winnerSel.qualifyingCount > 0 ? winners / winnerSel.qualifyingCount : 0;

  return {
    coverage: {
      creativesWithFeatures: featCount.count ?? 0,
      outcomes: outcomeRows.length,
      totalImpressions,
    },
    account: {
      medianCtr: winnerSel.medianCtr,
      p95Ctr: winnerSel.p95Ctr,
      qualifyingCount: winnerSel.qualifyingCount,
      winners,
      hitRate,
      baselineCtr: priors.baselineCtr * 100,
    },
    leaderboards: {
      hook: leaderboard(priors.hook),
      imageStyle: leaderboard(priors.imageStyle),
      framework: leaderboard(priors.framework),
    },
    fatigueCount: fatigue.length,
  };
}
