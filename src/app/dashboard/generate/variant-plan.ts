/**
 * Variant-Plan-Generator (Doc 3.7 + Self-Learning Phase 2)
 *
 * Statt 3 zufälliger LLM-Würfe mit hoher Temperatur generieren wir einen
 * deterministisch diversifizierten Plan: jede Variante deckt eine andere
 * Hook × Framework × Lever-Kombination ab — echte strukturelle Achsen, nicht
 * nur stilistische Umformulierungen.
 *
 * Reihenfolge der Achsen-Werte:
 *   - OHNE Priors (Phase 0/1): Hooks nach Heuristik-Score sortiert, dann
 *     orthogonale Round-Robin-Rotation (Legacy-Verhalten).
 *   - MIT Priors (Phase 2): Hook + Framework werden per Thompson Sampling aus
 *     den Beta-Posteriors gezogen — gemessene Gewinner häufiger, unsichere
 *     Arme gelegentlich (Exploration). Variante 0 behält das vom User gewählte
 *     Framework.
 */
import {
  FRAMEWORKS,
  HOOKS,
  type AwarenessValue,
  type FrameworkValue,
  type HookValue,
  type PersuasionLeverValue,
} from "./schema";
import { seedArm, thompsonOrder, type Rng } from "./variant-bandit";
import type { PerformancePriors } from "@/lib/score/priors";

export type VariantPlan = {
  index: number;
  hook: (typeof HOOKS)[number];
  framework: (typeof FRAMEWORKS)[number];
  lever: PersuasionLeverValue | null;
};

export function buildVariantPlan(
  count: number,
  awareness: AwarenessValue,
  fixedFramework: FrameworkValue,
  levers: PersuasionLeverValue[],
  forcedHook?: HookValue,
  // Stufe-1 Lernschleife: User-Hook-Präferenzen (avg Rating −1..+1) +
  // Ads-/Prior-Boost. Dient als Sortierung (Legacy) bzw. als Cold-Start-Seed
  // für den Bandit.
  hookPreferences?: Map<HookValue, number>,
  // Phase 2: gemessene Beta-Posteriors je Achse. Wenn gesetzt → Thompson
  // Sampling statt fixer Reihenfolge.
  priors?: PerformancePriors,
  // Optional injizierbarer RNG (für deterministische Tests).
  rng: Rng = Math.random,
): VariantPlan[] {
  // Hook-Pool: bei forcedHook nur dieser, sonst alle die zur Awareness passen.
  // Fallback: wenn Pool leer (extreme Kombi), alle Hooks.
  let hookPool: readonly (typeof HOOKS)[number][];
  if (forcedHook) {
    const forced = HOOKS.filter((h) => h.value === forcedHook);
    hookPool = forced.length > 0 ? forced : HOOKS;
  } else {
    const filtered = HOOKS.filter((h) =>
      (h.awarenessFit as readonly number[]).includes(awareness),
    );
    hookPool = filtered.length > 0 ? filtered : HOOKS;
  }

  // Framework-Pool: fixedFramework hat Vorrang, plus alle die zur Awareness
  // passen (für orthogonale Rotation falls count > 1).
  const fixedF = FRAMEWORKS.find((f) => f.value === fixedFramework);
  const otherF = FRAMEWORKS.filter(
    (f) =>
      f.value !== fixedFramework &&
      (f.awarenessFit as readonly number[]).includes(awareness),
  );
  const frameworkPool: readonly (typeof FRAMEWORKS)[number][] = fixedF
    ? [fixedF, ...otherF]
    : otherF.length > 0
      ? otherF
      : FRAMEWORKS;

  const safeLevers: (PersuasionLeverValue | null)[] =
    levers.length > 0 ? [...levers] : [null];

  // ─── Hook-Reihenfolge je Variante ──────────────────────────────────────
  let hookForVariant: (typeof HOOKS)[number][];
  let frameworkForVariant: (typeof FRAMEWORKS)[number][];

  if (priors) {
    // Phase 2 — Thompson Sampling.
    const seedOpts = { baseline: priors.baselineCtr };
    const hookArms = hookPool.map((h) => ({
      value: h,
      ...seedArm(
        priors.hook.get(h.value),
        hookPreferences?.get(h.value) ?? 0,
        seedOpts,
      ),
    }));
    hookForVariant = thompsonOrder(hookArms, count, rng);

    const fwArms = frameworkPool.map((f) => ({
      value: f,
      ...seedArm(priors.framework.get(f.value), 0, seedOpts),
    }));
    frameworkForVariant = thompsonOrder(fwArms, count, rng);
    // User-Wahl respektieren: Variante 0 bekommt das gewählte Framework.
    if (fixedF && frameworkForVariant.length > 0) frameworkForVariant[0] = fixedF;
  } else {
    // Legacy (Phase 0/1) — Heuristik-Sortierung + Round-Robin.
    let sortedHookPool = hookPool;
    if (hookPreferences && hookPreferences.size > 0 && !forcedHook) {
      const withIndex = hookPool.map((h, i) => ({
        hook: h,
        origIndex: i,
        score: hookPreferences.get(h.value) ?? 0,
      }));
      withIndex.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.origIndex - b.origIndex;
      });
      sortedHookPool = withIndex.map((x) => x.hook);
    }
    hookForVariant = Array.from(
      { length: count },
      (_, i) => sortedHookPool[i % sortedHookPool.length],
    );
    frameworkForVariant = Array.from(
      { length: count },
      (_, i) => frameworkPool[i % frameworkPool.length],
    );
  }

  return Array.from({ length: count }, (_, i) => ({
    index: i,
    hook: hookForVariant[i],
    framework: frameworkForVariant[i],
    lever: safeLevers[i % safeLevers.length],
  }));
}
