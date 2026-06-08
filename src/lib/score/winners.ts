/**
 * Self-Learning · Phase 4 — Top-1–5-%-Selektion.
 *
 * Definiert „Top-Performer" messbar (vorher: Bauchgefühl): ein Creative ist
 * Top-Tier, wenn seine CTR im gewählten Zeitfenster
 *   - >= P95 der eigenen Outcome-Historie   ODER
 *   - >= 2 × Konto-Median
 * liegt — jeweils erst ab einer Mindest-Impression-Zahl (statistische
 * Signifikanz). Diese Gewinner werden zu Seeds fürs nächste Generieren
 * (siehe getWinnerSeeds in actions.ts → genetische Iteration).
 */
import type { createClient } from "@/lib/supabase/server";
import type { SourceFilter } from "./priors";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TopPerformer = {
  creativeId: string;
  variantIndex: number;
  headline: string;
  ctr: number; // in Prozent
  impressions: number;
  hook: string | null;
  framework: string | null;
  imageStyle: string | null;
  awareness: number | null;
  platform: string | null;
  product: string | null;
  audienceSegment: string | null;
  audienceText: string | null;
};

export type WinnerSelection = {
  winners: TopPerformer[];
  medianCtr: number;
  p95Ctr: number;
  qualifyingCount: number;
};

export const WINNER_MIN_IMPRESSIONS = 1000;
export const WINNER_WINDOW_DAYS = 90;
const MAX_WINNERS = 8;

/** Linear interpoliertes Perzentil (p ∈ [0,1]) eines aufsteigend sortierten Arrays. */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

export async function getTopPerformers(
  supabase: SupabaseServerClient,
  userId: string,
  opts?: {
    minImpressions?: number;
    windowDays?: number;
    /** Phase B: nach Plattform-Quelle filtern (Default: alle). */
    source?: SourceFilter;
  },
): Promise<WinnerSelection> {
  const minImpr = opts?.minImpressions ?? WINNER_MIN_IMPRESSIONS;
  const windowDays = opts?.windowDays ?? WINNER_WINDOW_DAYS;
  const source = opts?.source ?? "all";
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();

  let q = supabase
    .from("creative_outcomes")
    .select("creative_id, variant_index, ctr, impressions, fetched_at")
    .eq("user_id", userId)
    .gte("impressions", minImpr);
  if (source !== "all") q = q.eq("source", source);
  const { data: rows } = await q;

  // Signifikanz-Gate + Zeitfenster (fetched_at fehlend → mitnehmen).
  const qualifying = (rows ?? []).filter((o) => {
    const ctr = Number(o.ctr ?? 0);
    if (!(ctr > 0)) return false;
    const fa = o.fetched_at as string | null;
    return !fa || fa >= since;
  });

  if (qualifying.length === 0) {
    return { winners: [], medianCtr: 0, p95Ctr: 0, qualifyingCount: 0 };
  }

  const ctrs = qualifying.map((o) => Number(o.ctr)).sort((a, b) => a - b);
  const medianCtr = percentile(ctrs, 0.5);
  const p95Ctr = percentile(ctrs, 0.95);

  // Top-Tier: >= P95 ODER >= 2 × Median.
  const isTop = (ctr: number) => ctr >= p95Ctr || ctr >= medianCtr * 2;
  const topRows = qualifying
    .filter((o) => isTop(Number(o.ctr)))
    .sort((a, b) => Number(b.ctr) - Number(a.ctr))
    .slice(0, MAX_WINNERS);

  if (topRows.length === 0) {
    return { winners: [], medianCtr, p95Ctr, qualifyingCount: qualifying.length };
  }

  // Features der Gewinner nachladen (für Seed + Anzeige).
  const ids = Array.from(new Set(topRows.map((o) => o.creative_id as string)));
  const { data: feats } = await supabase
    .from("creative_features")
    .select(
      "creative_id, variant_index, hook, framework, image_style, awareness, platform, product, audience_segment, audience_text, headline",
    )
    .eq("user_id", userId)
    .in("creative_id", ids);

  const featByKey = new Map<string, Record<string, unknown>>();
  for (const f of feats ?? []) {
    featByKey.set(`${f.creative_id}|${f.variant_index}`, f);
  }

  const winners: TopPerformer[] = topRows.map((o) => {
    const f = featByKey.get(`${o.creative_id}|${o.variant_index}`) ?? {};
    return {
      creativeId: o.creative_id as string,
      variantIndex: o.variant_index as number,
      headline: (f.headline as string) ?? "(ohne Headline)",
      ctr: Number(o.ctr),
      impressions: Number(o.impressions ?? 0),
      hook: (f.hook as string) ?? null,
      framework: (f.framework as string) ?? null,
      imageStyle: (f.image_style as string) ?? null,
      awareness: f.awareness != null ? Number(f.awareness) : null,
      platform: (f.platform as string) ?? null,
      product: (f.product as string) ?? null,
      audienceSegment: (f.audience_segment as string) ?? null,
      audienceText: (f.audience_text as string) ?? null,
    };
  });

  return { winners, medianCtr, p95Ctr, qualifyingCount: qualifying.length };
}
