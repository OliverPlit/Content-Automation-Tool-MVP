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
      ? "bg-slate-100 text-slate-900 ring-slate-300"
      : score >= 60
        ? "bg-slate-100 text-slate-900 ring-slate-300"
        : "bg-slate-100 text-slate-900 ring-slate-300";

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
