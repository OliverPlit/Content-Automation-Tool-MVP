/**
 * Self-Learning · Phase 2 — Multi-Armed-Bandit (Thompson Sampling).
 *
 * Wählt Achsen-Werte (Hook, Framework, Bild-Stil) NICHT mehr fix nach
 * Reihenfolge, sondern zieht je Slot eine Stichprobe aus der Beta-Posterior
 * jedes Arms und nimmt den höchsten Zug. Effekt:
 *   - Exploitation: Arme mit hoher gemessener CTR gewinnen häufiger.
 *   - Exploration: unsichere Arme (wenig Daten, breite Verteilung) gewinnen
 *     gelegentlich → das Tool entdeckt neue Top-Muster statt im lokalen
 *     Optimum zu verharren.
 *
 * Reine, DB-freie Funktionen (testbar). Die Beta-Parameter kommen aus
 * `getPerformancePriors` (Phase 1); Arme ohne Messdaten werden über `seedArm`
 * aus dem Heuristik-Signal (Ratings/Ads-Boost) geseedet.
 */

export type BanditArm<T> = { value: T; alpha: number; beta: number };
export type Rng = () => number;

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

/** Standard-normalverteilte Zufallszahl (Box-Muller). */
function gaussian(rng: Rng): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Gamma(shape, 1) für shape >= 1 (Marsaglia-Tsang). */
function sampleGammaGE1(shape: number, rng: Rng): number {
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x = 0;
    let v = 0;
    do {
      x = gaussian(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/**
 * Gamma(shape, 1) für beliebiges shape > 0. Für shape < 1 via Boosting:
 * Gamma(a) = Gamma(a+1) · U^(1/a). Wird gebraucht, weil schwache Cold-Start-
 * Priors auf CTR-Skala alpha/beta < 1 haben können.
 */
function sampleGamma(shape: number, rng: Rng): number {
  if (shape >= 1) return sampleGammaGE1(shape, rng);
  const g = sampleGammaGE1(shape + 1, rng);
  const u = Math.max(rng(), 1e-12);
  return g * Math.pow(u, 1 / shape);
}

/** Zieht aus Beta(alpha, beta) via Gamma-Verhältnis. */
export function sampleBeta(alpha: number, beta: number, rng: Rng = Math.random): number {
  const a = Math.max(alpha, 1e-6);
  const b = Math.max(beta, 1e-6);
  const x = sampleGamma(a, rng);
  const y = sampleGamma(b, rng);
  return x / (x + y);
}

// ---------------------------------------------------------------------------
// Seeding & Selektion
// ---------------------------------------------------------------------------

/** Standard-Mindest-Impressions, ab denen Messdaten den Heuristik-Seed ersetzen. */
export const DEFAULT_GATE = 200;
/** Default-Baseline-CTR (Anteil, nicht %) wenn keine eigene vorliegt (~Meta-Median). */
export const DEFAULT_BASELINE_CTR = 0.015;
/** Pseudo-Impressions des Cold-Start-Priors. Klein → unsicher → exploriert. */
export const DEFAULT_PRIOR_STRENGTH = 8;

/**
 * Baut die Beta-Parameter eines Arms:
 *   - genug Messdaten (n >= gate) → gemessenes alpha/beta (korrekt skaliert).
 *   - sonst → SCHWACHER Prior, zentriert auf die Baseline-CTR und vom
 *     Heuristik-Boost (−1..+1) leicht gekippt. WICHTIG: zentriert auf die
 *     CTR-Skala (~1–3 %), NICHT uniform auf [0,1] — sonst würde ein
 *     ungetesteter Arm (Beta(1,1), Mittel 0.5) jeden bewiesenen Arm
 *     dauerhaft überstrahlen und der Bandit würde nie exploiten.
 */
export function seedArm(
  measured: { alpha: number; beta: number; n: number } | undefined,
  pref = 0,
  opts?: { gate?: number; baseline?: number; strength?: number },
): { alpha: number; beta: number } {
  const gate = opts?.gate ?? DEFAULT_GATE;
  if (measured && measured.n >= gate) {
    return { alpha: measured.alpha, beta: measured.beta };
  }
  const baseline = opts?.baseline ?? DEFAULT_BASELINE_CTR;
  const strength = opts?.strength ?? DEFAULT_PRIOR_STRENGTH;
  const p = Math.max(-1, Math.min(1, pref));
  // Heuristik kippt die Prior-Mitte um bis zu ±60 %.
  const mean = Math.max(0.002, Math.min(0.4, baseline * (1 + 0.6 * p)));
  return { alpha: mean * strength, beta: (1 - mean) * strength };
}

/**
 * Thompson-Reihenfolge: liefert `count` Werte. Pro Slot wird aus jedem noch
 * verfügbaren Arm gezogen und der höchste Zug genommen (Auswahl OHNE
 * Zurücklegen → Diversität über die Varianten). Sind mehr Slots als Arme
 * gefragt, wird der Pool neu aufgefüllt (zyklische Wiederholung).
 */
export function thompsonOrder<T>(
  arms: BanditArm<T>[],
  count: number,
  rng: Rng = Math.random,
): T[] {
  if (arms.length === 0 || count <= 0) return [];
  const result: T[] = [];
  let remaining: BanditArm<T>[] = [];
  for (let slot = 0; slot < count; slot++) {
    if (remaining.length === 0) remaining = [...arms];
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const s = sampleBeta(remaining[i].alpha, remaining[i].beta, rng);
      if (s > bestScore) {
        bestScore = s;
        bestIdx = i;
      }
    }
    result.push(remaining[bestIdx].value);
    remaining.splice(bestIdx, 1);
  }
  return result;
}
