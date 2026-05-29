"use client";

/**
 * Pre-Flight Score-Pille pro Variante (Doc 3.8).
 *
 * Farben:
 *  - grün >= 80  → solider Output, ready-to-ship
 *  - gelb 60–79  → ok, könnte besser sein
 *  - rot < 60    → trotz Retry-Loop schwach, Tooltip zeigt issues
 */
export function ScoreBadge({
  score,
  issues = [],
}: {
  score: number | undefined;
  issues?: string[];
}) {
  if (score === undefined || score < 0) return null;

  const tone =
    score >= 80
      ? "bg-green-100 text-green-900 ring-green-300"
      : score >= 60
        ? "bg-amber-100 text-amber-900 ring-amber-300"
        : "bg-red-100 text-red-900 ring-red-300";

  const title =
    issues.length > 0
      ? `Score ${score}/100 — Probleme: ${issues.join("; ")}`
      : `Score ${score}/100 — clean`;

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${tone}`}
    >
      ★ {score}/100
    </span>
  );
}
