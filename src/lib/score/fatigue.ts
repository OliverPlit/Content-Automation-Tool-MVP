/**
 * Self-Learning · Phase 5 — Creative-Fatigue-Erkennung.
 *
 * Liest die Outcome-Zeitreihe (creative_outcome_history) je Ad und erkennt
 * „ermüdete" Creatives: deren aktuelle CTR ist deutlich unter ihren eigenen
 * Peak gefallen → Kandidaten zum Auffrischen/Pausieren. Mindest-Impressions
 * als Signifikanz-Gate (kein Alarm wegen Rauschen).
 */
import type { createClient } from "@/lib/supabase/server";
import type { SourceFilter } from "./priors";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const FATIGUE_MIN_IMPRESSIONS = 500;
export const FATIGUE_DROP = 0.25; // ≥ 25 % Abfall vom Peak

export type FatigueCandidate = {
  adName: string;
  creativeId: string | null;
  variantIndex: number | null;
  headline: string | null;
  peakCtr: number;
  latestCtr: number;
  declinePct: number; // 0..1
  snapshots: number;
  lastSeen: string | null;
};

type HistRow = {
  ad_name: string | null;
  creative_id: string | null;
  variant_index: number | null;
  ctr: number | null;
  impressions: number | null;
  fetched_at: string | null;
};

export async function getFatigueCandidates(
  supabase: SupabaseServerClient,
  userId: string,
  opts?: {
    minImpressions?: number;
    dropThreshold?: number;
    limit?: number;
    /** Phase B: nach Plattform-Quelle filtern (Default: alle). */
    source?: SourceFilter;
  },
): Promise<FatigueCandidate[]> {
  const minImpr = opts?.minImpressions ?? FATIGUE_MIN_IMPRESSIONS;
  const drop = opts?.dropThreshold ?? FATIGUE_DROP;
  const limit = opts?.limit ?? 12;
  const source = opts?.source ?? "all";

  let q = supabase
    .from("creative_outcome_history")
    .select("ad_name, creative_id, variant_index, ctr, impressions, fetched_at")
    .eq("user_id", userId)
    .order("fetched_at", { ascending: true });
  if (source !== "all") q = q.eq("source", source);
  const { data: rows } = await q;
  if (!rows || rows.length === 0) return [];

  // Nach Ad gruppieren (Reihenfolge bleibt aufsteigend nach fetched_at).
  const byAd = new Map<string, HistRow[]>();
  for (const r of rows as HistRow[]) {
    if (!r.ad_name) continue;
    const arr = byAd.get(r.ad_name) ?? [];
    arr.push(r);
    byAd.set(r.ad_name, arr);
  }

  const out: FatigueCandidate[] = [];
  for (const [adName, snaps] of byAd) {
    if (snaps.length < 2) continue; // ohne Verlauf kein Trend
    const peak = Math.max(...snaps.map((s) => Number(s.ctr ?? 0)));
    const latest = snaps[snaps.length - 1];
    const latestCtr = Number(latest.ctr ?? 0);
    const latestImpr = Number(latest.impressions ?? 0);
    if (peak <= 0 || latestImpr < minImpr) continue;
    const declinePct = (peak - latestCtr) / peak;
    if (declinePct < drop) continue;
    out.push({
      adName,
      creativeId: latest.creative_id,
      variantIndex: latest.variant_index,
      headline: null,
      peakCtr: peak,
      latestCtr,
      declinePct,
      snapshots: snaps.length,
      lastSeen: latest.fetched_at,
    });
  }

  // Headlines nachladen.
  const ids = Array.from(
    new Set(out.map((o) => o.creativeId).filter((x): x is string => !!x)),
  );
  if (ids.length > 0) {
    const { data: feats } = await supabase
      .from("creative_features")
      .select("creative_id, variant_index, headline")
      .eq("user_id", userId)
      .in("creative_id", ids);
    const headByKey = new Map<string, string>();
    for (const f of feats ?? []) {
      if (f.headline) headByKey.set(`${f.creative_id}|${f.variant_index}`, f.headline as string);
    }
    for (const o of out) {
      if (o.creativeId != null) {
        o.headline = headByKey.get(`${o.creativeId}|${o.variantIndex}`) ?? null;
      }
    }
  }

  out.sort((a, b) => b.declinePct - a.declinePct);
  return out.slice(0, limit);
}
