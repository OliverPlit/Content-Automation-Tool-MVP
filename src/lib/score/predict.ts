/**
 * Self-Learning · Phase 3 — Predictive Score (erwartete CTR).
 *
 * Schätzt vor dem Rendern die erwartete CTR einer Variante, damit das
 * Render-Budget in die aussichtsreichsten Varianten fließt.
 *
 * Start (heute): gewichtete Heuristik —
 *     erwartete_CTR = baseline × gemessener_Lift × heuristik_Faktor
 *   - baseline    = konto-weite CTR (priors.baselineCtr)
 *   - Lift        = gewichteter Mittelwert der Achsen-Lifts (Hook, Framework,
 *                   Stil, Awareness, Plattform, Segment), jeweils per Bayes-
 *                   Shrinkage Richtung baseline gezogen (wenig Daten → nahe 1).
 *   - heuristik   = der bestehende scoreCreative (0..1) als schwacher Faktor.
 * Später ersetzbar durch ein gelerntes Modell (logistische Regression /
 * Gradient Boosting) auf (Features → tatsächliche CTR) — gleiche Signatur.
 */
import type { PerformancePriors } from "./priors";

export type PredictFeatures = {
  hook?: string | null;
  framework?: string | null;
  imageStyle?: string | null;
  awareness?: number | null;
  platform?: string | null;
  segment?: string | null;
};

export type Prediction = {
  /** Erwartete CTR als Anteil (0..1). */
  ctr: number;
  /** 0..1 — wie stark die Schätzung auf echten Daten beruht (vs. Heuristik). */
  confidence: number;
};

// Relatives Gewicht der Achsen (Hook dominiert; Awareness/Plattform schwächer).
const AXIS_WEIGHT = {
  hook: 1.0,
  framework: 0.6,
  imageStyle: 0.6,
  awareness: 0.4,
  platform: 0.4,
  segment: 0.5,
} as const;

// Pseudo-Impressions, mit denen ein Achsen-Mittel Richtung baseline geschrumpft
// wird (Bayes-Shrinkage) — verhindert Überreaktion auf kleine Stichproben.
const SHRINK_K = 300;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function predictCtr(
  features: PredictFeatures,
  priors: PerformancePriors,
  heuristicScore01 = 0.6,
): Prediction {
  const baseline = priors.baselineCtr > 0 ? priors.baselineCtr : 0.015;

  const axisVals: Array<[keyof typeof AXIS_WEIGHT, string | undefined]> = [
    ["hook", features.hook ?? undefined],
    ["framework", features.framework ?? undefined],
    ["imageStyle", features.imageStyle ?? undefined],
    ["awareness", features.awareness != null ? String(features.awareness) : undefined],
    ["platform", features.platform ?? undefined],
    ["segment", features.segment ?? undefined],
  ];

  let weightSum = 0;
  let liftSum = 0;
  let nTotal = 0;
  for (const [axis, value] of axisVals) {
    if (!value) continue;
    const stat = priors[axis].get(value);
    if (!stat || stat.n <= 0) continue;
    // Bayes-Shrinkage des Achsen-Mittels Richtung baseline.
    const shrunk = (stat.mean * stat.n + baseline * SHRINK_K) / (stat.n + SHRINK_K);
    const lift = shrunk / baseline; // 1 == baseline
    const w = AXIS_WEIGHT[axis];
    liftSum += lift * w;
    weightSum += w;
    nTotal += stat.n;
  }

  const priorLift = weightSum > 0 ? liftSum / weightSum : 1;
  // Heuristik (Regelkonformität) als schwacher Faktor 0.8..1.2.
  const heuristicFactor = 0.8 + 0.4 * clamp(heuristicScore01, 0, 1);

  const ctr = clamp(baseline * priorLift * heuristicFactor, 0.0005, 0.5);
  const confidence = weightSum > 0 ? nTotal / (nTotal + 1000) : 0;

  return { ctr, confidence };
}
