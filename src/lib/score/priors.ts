/**
 * Self-Learning · Phase 1 — mehrdimensionale Performance-Priors.
 *
 * Aggregiert die echten Outcomes (`creative_outcomes`) je Achsen-Wert
 * (Hook, Framework, Bild-Stil, Awareness, Plattform, Segment) zu einem
 * Bayes-Schätzer (Beta-Verteilung) mit Unsicherheit. Fundament für:
 *   - Phase 1: Hook-Achse fließt in buildVariantPlan (siehe actions.ts).
 *   - Phase 2/3: Bandit-Auswahl + Predictive Score über alle Achsen.
 *
 * Join Outcome ↔ Feature passiert in JS über (creative_id, variant_index),
 * weil supabase-js ohne deklarierte FK-Beziehung nicht implizit joint.
 */
import type { createClient } from "@/lib/supabase/server";
import type { HookValue } from "@/app/dashboard/generate/schema";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Phase B: Quellen-Filter. Default = beide Plattformen, damit das Lernen
 * cold-start-schnell ist. Spätere Phasen können explizit nur Meta oder nur
 * Google ziehen (z. B. wenn der Generator gezielt Meta-Creatives bauen soll).
 */
export type SourceFilter = "all" | "meta" | "google_ads";

/** Beta-Posterior eines Achsen-Arms. mean = erwartete CTR (0..1). */
export type AxisStat = { alpha: number; beta: number; mean: number; n: number };
export type AxisPriors = Map<string, AxisStat>;

export type PerformancePriors = {
  hook: AxisPriors;
  framework: AxisPriors;
  imageStyle: AxisPriors;
  awareness: AxisPriors;
  platform: AxisPriors;
  segment: AxisPriors;
  /** Konto-weite Baseline-CTR (Anteil 0..1) — Mitte für Cold-Start-Priors. */
  baselineCtr: number;
};

/** Default-Baseline-CTR, wenn noch keine eigenen Outcomes vorliegen (~Meta-Median). */
export const DEFAULT_BASELINE_CTR = 0.015;

/**
 * Recency-Decay (Phase 5 Guardrail): ältere Outcomes zählen weniger, weil sich
 * der Markt ändert. Halbwertszeit in Tagen — nach `HALF_LIFE_DAYS` zählt ein
 * Outcome nur noch halb. Gewicht = 0.5^(alter/halbwertszeit), nach unten
 * gekappt, damit alte Daten nicht komplett verschwinden.
 */
export const HALF_LIFE_DAYS = 45;
const MIN_DECAY_WEIGHT = 0.05;

export function decayWeight(fetchedAt: string | null, now = Date.now()): number {
  if (!fetchedAt) return 1; // unbekanntes Datum → nicht abwerten
  const ts = Date.parse(fetchedAt);
  if (Number.isNaN(ts)) return 1;
  const ageDays = Math.max(0, (now - ts) / 86_400_000);
  return Math.max(MIN_DECAY_WEIGHT, Math.pow(0.5, ageDays / HALF_LIFE_DAYS));
}

/** Mindest-Impressions je Arm, bevor wir ihn fürs Lernen gewichten (Guardrail). */
export const MIN_ARM_IMPRESSIONS = 200;

type Axis =
  | "hook"
  | "framework"
  | "imageStyle"
  | "awareness"
  | "platform"
  | "segment";

function emptyPriors(): PerformancePriors {
  return {
    hook: new Map(),
    framework: new Map(),
    imageStyle: new Map(),
    awareness: new Map(),
    platform: new Map(),
    segment: new Map(),
    baselineCtr: DEFAULT_BASELINE_CTR,
  };
}

type Accum = Map<string, { clicks: number; impressions: number }>;

function bump(acc: Accum, value: string | null, clicks: number, impressions: number) {
  if (!value) return;
  const cur = acc.get(value) ?? { clicks: 0, impressions: 0 };
  cur.clicks += clicks;
  cur.impressions += impressions;
  acc.set(value, cur);
}

function toAxisPriors(acc: Accum): AxisPriors {
  const out: AxisPriors = new Map();
  for (const [value, { clicks, impressions }] of acc) {
    const alpha = clicks + 1;
    const beta = Math.max(impressions - clicks, 0) + 1;
    out.set(value, {
      alpha,
      beta,
      mean: alpha / (alpha + beta),
      n: impressions,
    });
  }
  return out;
}

export async function getPerformancePriors(
  supabase: SupabaseServerClient,
  userId: string,
  source: SourceFilter = "all",
): Promise<PerformancePriors> {
  // 1) Outcomes mit Klicks/Impressions.
  let q = supabase
    .from("creative_outcomes")
    .select("creative_id, variant_index, clicks, impressions, fetched_at")
    .eq("user_id", userId);
  if (source !== "all") q = q.eq("source", source);
  const { data: outcomes } = await q;
  if (!outcomes || outcomes.length === 0) return emptyPriors();

  // 2) Features dieser Creatives.
  const creativeIds = Array.from(
    new Set(outcomes.map((o) => o.creative_id as string).filter(Boolean)),
  );
  if (creativeIds.length === 0) return emptyPriors();

  const { data: feats } = await supabase
    .from("creative_features")
    .select(
      "creative_id, variant_index, hook, framework, image_style, awareness, platform, audience_segment",
    )
    .eq("user_id", userId)
    .in("creative_id", creativeIds);

  const featByKey = new Map<string, Record<string, unknown>>();
  for (const f of feats ?? []) {
    featByKey.set(`${f.creative_id}|${f.variant_index}`, f);
  }

  // 3) Join in JS + pro Achse akkumulieren.
  const accs: Record<Axis, Accum> = {
    hook: new Map(),
    framework: new Map(),
    imageStyle: new Map(),
    awareness: new Map(),
    platform: new Map(),
    segment: new Map(),
  };

  let totalClicks = 0;
  let totalImpressions = 0;
  const now = Date.now();
  for (const o of outcomes) {
    const f = featByKey.get(`${o.creative_id}|${o.variant_index}`);
    if (!f) continue;
    const rawImpr = Number(o.impressions ?? 0);
    if (rawImpr <= 0) continue;
    // Phase 5: Recency-Decay — ältere Outcomes zählen weniger.
    const w = decayWeight((o.fetched_at as string | null) ?? null, now);
    const impressions = rawImpr * w;
    const clicks = Number(o.clicks ?? 0) * w;
    totalClicks += clicks;
    totalImpressions += impressions;

    bump(accs.hook, (f.hook as string) ?? null, clicks, impressions);
    bump(accs.framework, (f.framework as string) ?? null, clicks, impressions);
    bump(accs.imageStyle, (f.image_style as string) ?? null, clicks, impressions);
    bump(
      accs.awareness,
      f.awareness != null ? String(f.awareness) : null,
      clicks,
      impressions,
    );
    bump(accs.platform, (f.platform as string) ?? null, clicks, impressions);
    bump(accs.segment, (f.audience_segment as string) ?? null, clicks, impressions);
  }

  const baselineCtr =
    totalImpressions > 0
      ? Math.max(0.001, Math.min(0.5, totalClicks / totalImpressions))
      : DEFAULT_BASELINE_CTR;

  return {
    hook: toAxisPriors(accs.hook),
    framework: toAxisPriors(accs.framework),
    imageStyle: toAxisPriors(accs.imageStyle),
    awareness: toAxisPriors(accs.awareness),
    platform: toAxisPriors(accs.platform),
    segment: toAxisPriors(accs.segment),
    baselineCtr,
  };
}

/**
 * Wandelt eine Achse in einen −1..+1-Boost je Wert (CTR-Lift gegenüber dem
 * Achsen-Mittel), nur für Arme mit ausreichend Impressions. Gleiche Skala wie
 * der bestehende `adsHookBoost`, damit sich beides in `mergeHookPreferences`
 * sauber addiert.
 */
export function axisBoost(
  axis: AxisPriors,
  minImpressions = MIN_ARM_IMPRESSIONS,
): Map<string, number> {
  const arms = Array.from(axis.entries()).filter(
    ([, s]) => s.n >= minImpressions,
  );
  const out = new Map<string, number>();
  if (arms.length < 2) return out; // ohne Vergleich kein sinnvoller Boost
  const means = arms.map(([, s]) => s.mean);
  const mean = means.reduce((a, b) => a + b, 0) / means.length;
  const max = Math.max(...means, mean + 1e-9);
  const min = Math.min(...means, mean - 1e-9);
  for (const [value, s] of arms) {
    const range = s.mean >= mean ? max - mean : mean - min;
    out.set(value, range > 0 ? (s.mean - mean) / range : 0);
  }
  return out;
}

/** Hook-Achse als HookValue-Boost-Map (für buildVariantPlan). */
export function hookBoostFromPriors(
  priors: PerformancePriors,
): Map<HookValue, number> {
  const out = new Map<HookValue, number>();
  for (const [value, boost] of axisBoost(priors.hook)) {
    out.set(value as HookValue, boost);
  }
  return out;
}
