/**
 * Variant-Plan-Generator (Doc 3.7)
 *
 * Statt 3 zufälliger LLM-Würfe mit hoher Temperatur generieren wir einen
 * deterministischen, orthogonal diversifizierten Plan: Variante 1 kriegt
 * Hook A + Framework X + Lever I, Variante 2 Hook B + Framework Y + Lever II.
 *
 * Damit decken N Varianten ECHTE strukturelle Achsen ab, nicht nur stilistische
 * Umformulierungen.
 */
import {
  FRAMEWORKS,
  HOOKS,
  type AwarenessValue,
  type FrameworkValue,
  type HookValue,
  type PersuasionLeverValue,
} from "./schema";

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
  // Stufe-1 Lernschleife: User-Hook-Präferenzen (avg Rating −1..+1).
  // Hooks mit positivem Score rücken nach vorne, negative ans Ende.
  hookPreferences?: Map<HookValue, number>,
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

  // User-Präferenz-Sort: Hooks mit höherem Avg-Rating zuerst.
  // Tie-Breaker: ursprüngliche Reihenfolge erhalten (stable sort).
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
    hookPool = withIndex.map((x) => x.hook);
  }

  // Framework-Pool: fixedFramework hat Vorrang, plus alle die zur Awareness passen
  // (für orthogonale Rotation falls count > 1).
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

  return Array.from({ length: count }, (_, i) => ({
    index: i,
    hook: hookPool[i % hookPool.length],
    framework: frameworkPool[i % frameworkPool.length],
    lever: safeLevers[i % safeLevers.length],
  }));
}
