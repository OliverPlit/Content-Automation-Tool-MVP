/**
 * Self-Learning · Phase 1 — Ads-Import → echte Outcomes je Feature.
 *
 * Ordnet die Rows des neuesten `ads_performance`-Imports unseren gespeicherten
 * Creatives zu (Matching über die in `creative_features` denormalisierte
 * Headline) und schreibt die echte Performance (Impressions/Klicks/CTR/Spend/
 * Conversions) nach `creative_outcomes`. Von dort aggregiert `getPerformance
 * Priors` pro Achse.
 *
 * Matching bewusst nur **exakt** auf normalisierte Headline — lieber ein Ad
 * unzugeordnet als falsch zugeordnet (würde die Priors verfälschen).
 */
import type { createClient } from "@/lib/supabase/server";
import { pick, toNumber } from "./csv";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type MatchResult = { matched: number; unmatched: number; total: number };

type OutcomeInsert = {
  user_id: string;
  render_id: string | null;
  creative_id: string;
  variant_index: number;
  ad_name: string;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  spend: number | null;
  conversions: number | null;
  cpa: number | null;
  source_import_id: string;
  fetched_at: string | null;
  /** Phase B: Plattform-Quelle ('meta' für diesen Matcher). */
  source: "meta" | "google_ads";
};

/** Headline-Normalisierung: case/whitespace/Trailing-Satzzeichen-insensitiv. */
function normHeadline(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?…]+$/u, "");
}

/** CTR aus dem Roh-String ableiten — gleiche Logik wie extractAdsPerfInsights. */
function parseCtr(ctrRaw: string): number {
  let ctr = toNumber(ctrRaw);
  if (ctrRaw.includes("%") && ctr > 0) {
    // bereits Prozent
  } else if (ctr > 0 && ctr < 1) {
    // wahrscheinlich Dezimal (0.0125) → in %
    ctr = ctr * 100;
  }
  return ctr;
}

export async function matchAdsToOutcomes(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<MatchResult> {
  // 1) Neuester ads_performance-Import (rohe Rows in parsed_json).
  const { data: imp } = await supabase
    .from("meta_imports")
    .select("id, parsed_json, created_at")
    .eq("user_id", userId)
    .eq("kind", "ads_performance")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!imp) return { matched: 0, unmatched: 0, total: 0 };

  const rows = Array.isArray(imp.parsed_json)
    ? (imp.parsed_json as Record<string, string>[])
    : [];
  if (rows.length === 0) return { matched: 0, unmatched: 0, total: 0 };

  // 2) Features laden → Map normHeadline → {creative_id, variant_index}.
  const { data: feats } = await supabase
    .from("creative_features")
    .select("creative_id, variant_index, headline")
    .eq("user_id", userId)
    .not("headline", "is", null);

  const featByHeadline = new Map<
    string,
    { creative_id: string; variant_index: number }
  >();
  for (const f of feats ?? []) {
    const key = normHeadline(String(f.headline ?? ""));
    if (key && !featByHeadline.has(key)) {
      featByHeadline.set(key, {
        creative_id: f.creative_id as string,
        variant_index: f.variant_index as number,
      });
    }
  }
  if (featByHeadline.size === 0) {
    return { matched: 0, unmatched: rows.length, total: rows.length };
  }

  // 3) Renders → render_id je (creative_id, variant_index) (neuester zuerst).
  const creativeIds = Array.from(
    new Set((feats ?? []).map((f) => f.creative_id as string)),
  );
  const renderByKey = new Map<string, string>();
  if (creativeIds.length > 0) {
    const { data: renders } = await supabase
      .from("creative_renders")
      .select("id, creative_id, variant_index, created_at")
      .in("creative_id", creativeIds)
      .order("created_at", { ascending: false });
    for (const r of renders ?? []) {
      const key = `${r.creative_id}|${r.variant_index}`;
      if (!renderByKey.has(key)) renderByKey.set(key, r.id as string);
    }
  }

  // 4) Pro Ad-Row matchen + Outcome bauen.
  const outcomes: OutcomeInsert[] = [];
  for (const row of rows) {
    const adName = pick(row, "Ad name", "Ad Name", "Ad");
    const headlineRaw = pick(row, "Headline", "Ad Headline", "Title") || adName;
    const key = normHeadline(headlineRaw);
    const feat = key ? featByHeadline.get(key) : undefined;
    if (!feat) continue;

    const ctr = parseCtr(
      pick(row, "CTR", "CTR (all)", "Click-through rate", "CTR (link click-through rate)"),
    );
    const impressions =
      Math.round(toNumber(pick(row, "Impressions", "Impr.", "Reach"))) || null;
    const clicks =
      Math.round(
        toNumber(pick(row, "Link clicks", "Clicks (all)", "Clicks", "Link Clicks")),
      ) || null;
    const spend = toNumber(pick(row, "Amount spent", "Spend", "Cost")) || null;
    const conversions =
      Math.round(
        toNumber(pick(row, "Results", "Conversions", "Purchases")),
      ) || null;
    const cpa =
      conversions && spend ? Math.round((spend / conversions) * 100) / 100 : null;

    outcomes.push({
      user_id: userId,
      render_id: renderByKey.get(`${feat.creative_id}|${feat.variant_index}`) ?? null,
      creative_id: feat.creative_id,
      variant_index: feat.variant_index,
      ad_name: adName || headlineRaw,
      impressions,
      clicks,
      ctr: ctr || null,
      spend,
      conversions,
      cpa,
      source_import_id: imp.id as string,
      fetched_at: (imp.created_at as string | null) ?? null,
      source: "meta",
    });
  }

  if (outcomes.length > 0) {
    await supabase
      .from("creative_outcomes")
      .upsert(outcomes, { onConflict: "user_id,ad_name,source" });

    // Phase 5: zusätzlich append-only Snapshot je Ad für die Fatigue-Zeitreihe.
    const history = outcomes.map((o) => ({
      user_id: o.user_id,
      creative_id: o.creative_id,
      variant_index: o.variant_index,
      ad_name: o.ad_name,
      ctr: o.ctr,
      impressions: o.impressions,
      clicks: o.clicks,
      spend: o.spend,
      conversions: o.conversions,
      source_import_id: o.source_import_id,
      fetched_at: o.fetched_at,
      source: o.source,
    }));
    await supabase
      .from("creative_outcome_history")
      .upsert(history, {
        onConflict: "user_id,ad_name,source,source_import_id",
      });
  }

  return {
    matched: outcomes.length,
    unmatched: rows.length - outcomes.length,
    total: rows.length,
  };
}
