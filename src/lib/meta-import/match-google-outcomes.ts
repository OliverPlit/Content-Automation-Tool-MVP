/**
 * Self-Learning · Phase C — Google-Ads → echte Outcomes je Feature.
 *
 * Strukturelle Besonderheit gegenüber Meta-Ads:
 * Eine Google Responsive Search Ad (RSA) hat bis zu 15 Headline-Komponenten
 * + 4 Description-Texte. Es gibt keine eine Headline pro Ad. Strategie:
 *
 *   1. Pro Ad alle Anzeigentitel-Komponenten einsammeln.
 *   2. Jede normalisiert exakt gegen creative_features.headline matchen.
 *   3. Wenn ≥ 1 Treffer: Performance (Impr/Klicks/CTR) wird ANTEILIG auf alle
 *      gefundenen Creatives verteilt (1/n je Treffer) → keine Doppel-Zählung.
 *   4. Wenn 0 Treffer: Outcome wird trotzdem geschrieben (creative_id = NULL,
 *      ad_group_name + Anzeigentitel-1 als ad_name) → fliesst als Konto-
 *      Baseline in die Priors ein.
 *
 * source = 'google_ads' — Phase B isoliert die Plattformen sauber.
 */
import type { createClient } from "@/lib/supabase/server";
import { pick, toNumber } from "./csv";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type GoogleMatchResult = {
  /** Ads mit ≥ 1 Headline-Treffer auf gespeicherte Creatives. */
  matched: number;
  /** Ads ohne Treffer — als Konto-Baseline geschrieben. */
  baseline: number;
  /** Ads ohne Impressions (übersprungen). */
  skipped: number;
  total: number;
};

type OutcomeInsert = {
  user_id: string;
  render_id: string | null;
  creative_id: string | null;
  variant_index: number | null;
  ad_name: string;
  ad_group_name: string | null;
  effectiveness_rating: string | null;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  spend: number | null;
  conversions: number | null;
  cpa: number | null;
  source_import_id: string;
  fetched_at: string | null;
  source: "google_ads";
};

function normHeadline(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?…]+$/u, "");
}

/** Anzeigentitel-Komponenten aus einer RSA-Row sammeln (Anzeigentitel 1..15). */
function collectHeadlines(row: Record<string, string>): string[] {
  const out: string[] = [];
  for (const key of Object.keys(row)) {
    if (/^\s*(anzeigentitel|headline)\s*\d+\s*$/i.test(key)) {
      const v = (row[key] ?? "").trim();
      // KeyWord-Platzhalter (Google Dynamic Keyword Insertion) sind keine
      // echten Headlines — überspringen.
      if (v && v !== "--" && !/\{KeyWord/i.test(v)) out.push(v);
    }
  }
  return out;
}

/** CTR aus Roh-String robust ableiten (akzeptiert „1,25 %" und „0.0125"). */
function parseCtr(ctrRaw: string): number {
  let ctr = toNumber(ctrRaw);
  if (!ctrRaw.includes("%") && ctr > 0 && ctr < 1) ctr = ctr * 100;
  return ctr;
}

export async function matchGoogleAdsToOutcomes(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<GoogleMatchResult> {
  // 1) Neuester google_ads-Import (rohe Rows in parsed_json).
  const { data: imp } = await supabase
    .from("meta_imports")
    .select("id, parsed_json, created_at")
    .eq("user_id", userId)
    .eq("kind", "google_ads")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!imp) return { matched: 0, baseline: 0, skipped: 0, total: 0 };

  const rows = Array.isArray(imp.parsed_json)
    ? (imp.parsed_json as Record<string, string>[])
    : [];
  if (rows.length === 0) return { matched: 0, baseline: 0, skipped: 0, total: 0 };

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

  // 3) Renders → render_id je (creative_id, variant_index).
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

  // 4) Pro RSA-Row matchen + Outcomes bauen.
  const outcomes: OutcomeInsert[] = [];
  let matchedAds = 0;
  let baselineAds = 0;
  let skipped = 0;

  for (const row of rows) {
    const impressions = Math.round(
      toNumber(pick(row, "Impressionen", "Impressions", "Impr.")),
    );
    if (impressions <= 0) {
      skipped++;
      continue;
    }

    const headlines = collectHeadlines(row);
    const clicks = Math.round(
      toNumber(pick(row, "Interaktionen", "Interactions", "Clicks", "Klicks")),
    );
    const ctr = parseCtr(
      pick(row, "Interaktionsrate", "CTR", "Klickrate", "Click-through rate"),
    );
    const spend = toNumber(pick(row, "Kosten", "Cost", "Spend"));
    const conversions = Math.round(
      toNumber(pick(row, "Conversions", "Conv.", "Conv")),
    );
    const cpa =
      conversions > 0 && spend > 0
        ? Math.round((spend / conversions) * 100) / 100
        : null;
    const adGroup =
      pick(row, "Anzeigengruppe", "Ad group", "Ad Group") || null;
    const effectiveness =
      pick(row, "Anzeigeneffektivität", "Ad strength", "Ad Strength") || null;

    // Wieviele Creatives matchen diese Ad?
    const hits: { creative_id: string; variant_index: number }[] = [];
    for (const h of headlines) {
      const k = normHeadline(h);
      const feat = k ? featByHeadline.get(k) : undefined;
      if (feat && !hits.some((x) => x.creative_id === feat.creative_id)) {
        hits.push(feat);
      }
    }

    // ad_name eindeutig pro Ad innerhalb des Imports machen — sonst überschreiben
    // wir uns bei mehreren Hits aus derselben Ad (gleicher Anzeigentitel 1).
    const baseAdName =
      headlines[0] ||
      pick(row, "Langer Anzeigentitel", "Long Headline") ||
      adGroup ||
      "(Google Ad)";

    if (hits.length === 0) {
      // Konto-Baseline: kein Creative-Bezug, aber Performance fließt in
      // konto-weite Priors (baselineCtr, Achsen die nicht aus Features kommen).
      outcomes.push({
        user_id: userId,
        render_id: null,
        creative_id: null,
        variant_index: null,
        ad_name: `[baseline] ${baseAdName}`,
        ad_group_name: adGroup,
        effectiveness_rating: effectiveness,
        impressions,
        clicks: clicks || null,
        ctr: ctr || null,
        spend: spend || null,
        conversions: conversions || null,
        cpa,
        source_import_id: imp.id as string,
        fetched_at: (imp.created_at as string | null) ?? null,
        source: "google_ads",
      });
      baselineAds++;
    } else {
      // Performance anteilig auf alle Treffer verteilen.
      const share = 1 / hits.length;
      const sharedImpr = Math.round(impressions * share);
      const sharedClicks = Math.round(clicks * share);
      const sharedSpend = Math.round(spend * share * 100) / 100;
      const sharedConv = Math.round(conversions * share);
      for (const hit of hits) {
        outcomes.push({
          user_id: userId,
          render_id:
            renderByKey.get(`${hit.creative_id}|${hit.variant_index}`) ?? null,
          creative_id: hit.creative_id,
          variant_index: hit.variant_index,
          // ad_name muss eindeutig pro Source sein → suffix wenn mehrere Hits.
          ad_name:
            hits.length === 1
              ? baseAdName
              : `${baseAdName} [c${hit.creative_id.slice(0, 6)}]`,
          ad_group_name: adGroup,
          effectiveness_rating: effectiveness,
          impressions: sharedImpr,
          clicks: sharedClicks || null,
          ctr: ctr || null, // CTR ist eine Rate → bleibt gleich, nicht teilen
          spend: sharedSpend || null,
          conversions: sharedConv || null,
          cpa,
          source_import_id: imp.id as string,
          fetched_at: (imp.created_at as string | null) ?? null,
          source: "google_ads",
        });
      }
      matchedAds++;
    }
  }

  if (outcomes.length > 0) {
    await supabase
      .from("creative_outcomes")
      .upsert(outcomes, { onConflict: "user_id,ad_name,source" });

    // History-Snapshot (Phase 5: Fatigue über Zeit).
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
      ad_group_name: o.ad_group_name,
      effectiveness_rating: o.effectiveness_rating,
    }));
    await supabase
      .from("creative_outcome_history")
      .upsert(history, {
        onConflict: "user_id,ad_name,source,source_import_id",
      });
  }

  return {
    matched: matchedAds,
    baseline: baselineAds,
    skipped,
    total: rows.length,
  };
}
