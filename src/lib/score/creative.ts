/**
 * Pre-Flight Quality-Score für generierte Creatives (Doc 3.8).
 *
 * Score 0–100. Bei <60 löst der Retry-Loop in actions.ts einen neuen Versuch
 * mit explizitem Feedback aus.
 */
import {
  FORBIDDEN_WORDS,
  type HookValue,
  type ProductFacts,
} from "@/app/dashboard/generate/schema";

export type ScoreInput = {
  headline: string;
  subline: string;
  body: string;
  cta: string;
  imagePrompt: string;
};

export type ScoreResult = { score: number; issues: string[] };

export type ScoreContext = {
  visualCues?: string;
  productFacts?: ProductFacts | null;
};

export function scoreCreative(
  v: ScoreInput,
  hook: HookValue,
  ctx?: ScoreContext | string,
): ScoreResult {
  // Backwards-compat: alter dritter Parameter war ein string mit visualCues
  const context: ScoreContext =
    typeof ctx === "string" ? { visualCues: ctx } : ctx ?? {};
  const { visualCues, productFacts } = context;

  let s = 0;
  const issues: string[] = [];

  // Headline-Checks
  if (/\d/.test(v.headline)) s += 12;
  else issues.push("Headline ohne Zahl/Fakt");

  if (v.headline.length <= 40) s += 8;
  else issues.push("Headline zu lang (> 40 Zeichen)");

  if (!v.headline.trimEnd().endsWith(".")) s += 3;

  if (matchesHookPattern(v.headline, hook)) s += 15;
  else issues.push(`Hook-Pattern '${hook}' nicht erfüllt`);

  // Forbidden Words
  const lower = `${v.headline} ${v.subline} ${v.body}`.toLowerCase();
  const banned = FORBIDDEN_WORDS.filter((w) => lower.includes(w.toLowerCase()));
  if (banned.length === 0) s += 10;
  else issues.push(`Verbotene Wörter: ${banned.join(", ")}`);

  // Subline messbarer Nutzen
  if (/\d+\s*(h|%|EUR|€|grad|°|l\b|kg|km|bh)/i.test(v.subline)) s += 10;
  else issues.push("Subline ohne messbare Einheit (h/%/EUR/Grad/L/kg/km/Bh)");

  // CTA
  const firstWord = v.cta.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (firstWord && !["der", "die", "das", "ein", "eine"].includes(firstWord)) {
    s += 8;
  } else {
    issues.push("CTA beginnt nicht mit Imperativ-Verb");
  }
  if (/\b(jetzt|direkt|sofort|gleich|heute|ab\s|nur\s|noch)\b/i.test(v.cta)) s += 5;

  // C4 — First-Person-CTA (Doc 5.1 · Unbounce 2024: +90 % CTR vs. "Klick hier").
  // Erkennt Phrasen wie "Zeig mir", "Ich will", "Mein Preis", "Lass mich".
  if (/\b(zeig\s+mir|ich\s+will|ich\s+brauch|lass\s+mich|gib\s+mir|mein[ee]?\s+\w+|hol(?:'s)?\s+mir)\b/i.test(v.cta)) {
    s += 5;
  }

  // Image-Prompt
  if (visualCues && v.imagePrompt.toLowerCase().includes(visualCues.toLowerCase())) {
    s += 10;
  }
  if (v.imagePrompt.length > 0) s += 5;

  // Phase B (Doc 6.5) — Produktfakten-Match
  if (productFacts) {
    const hl = v.headline.toLowerCase();
    const sub = v.subline.toLowerCase();
    const bodyL = v.body.toLowerCase();
    const productName = productFacts.name.trim().toLowerCase();

    // +10: Produktname (oder sinnvolle Kurzform) in der Headline
    if (productName) {
      const tokens = productName.split(/\s+/).filter((t) => t.length >= 3);
      const tokenHits = tokens.filter((t) => hl.includes(t)).length;
      if (tokenHits >= Math.min(2, tokens.length)) {
        s += 10;
      } else {
        issues.push(`Headline enthält den Produktnamen nicht ('${productFacts.name}')`);
      }
    }

    // +6: Preis-Zahl oder Spec in Subline
    const priceHasNumber = /\d/.test(productFacts.price);
    const priceTokens = productFacts.price
      .toLowerCase()
      .split(/[^\d.,]/)
      .filter((t) => /\d/.test(t));
    const subHasFactNumber =
      (priceHasNumber && priceTokens.some((t) => sub.includes(t))) ||
      productFacts.specs.some((sp) => sub.includes(sp.toLowerCase()));
    if (subHasFactNumber) {
      s += 6;
    } else if (priceHasNumber || productFacts.specs.length > 0) {
      issues.push("Subline ohne Preis-Zahl / Spec aus Produktfakten");
    }

    // +4: OEM-Freigabe oder Spec im Body
    const bodyHasAuthority =
      productFacts.oemApprovals.some((o) => bodyL.includes(o.toLowerCase())) ||
      productFacts.specs.some((sp) => bodyL.includes(sp.toLowerCase()));
    if (bodyHasAuthority) {
      s += 4;
    } else if (
      productFacts.oemApprovals.length > 0 ||
      productFacts.specs.length > 0
    ) {
      issues.push("Body nennt keine OEM-Freigabe / DIN aus Produktfakten");
    }
  }

  return { score: Math.min(100, s), issues };
}

export function matchesHookPattern(headline: string, hook: HookValue): boolean {
  const h = headline.trim();
  switch (hook) {
    case "question":
      return (
        h.endsWith("?") ||
        /^(wann|warum|wie|was|wer|welche?|wieso|weißt|kennst|hast)\b/i.test(h)
      );
    case "number":
      return /\d/.test(h);
    case "ifThen":
      return /\b(wenn|falls|sobald|nur wenn)\b/i.test(h);
    case "comparison":
      return /\bvs\.?\b|gegen|statt|anstatt|im vergleich|günstiger|teurer|besser als/i.test(h);
    case "negation":
      return /\b(mach\s*(?:diesen|den)?\s*nicht|nicht|niemals|kein|stopp?|hör auf|verschwende|kauf nie)\b/i.test(h);
    case "implication":
      return /\b(EUR|€|stunden|tage|kosten|kostet|verlierst|verlieren|verlust|schaden|ausfall|stillstand)\b/i.test(h);
    case "secret":
      return /\b(geheim|geheimnis|verschweigt|nicht sagen|insider|niemand|trick|wahrheit|verraten)\b/i.test(h);
    case "avatar":
      return /\bfür\b/i.test(h) || /\b(landwirte?|werkstätten?|bauern?|fahrer|chefs?|unternehmer)\b/i.test(h);
    case "season":
      return /\b(vor|nach|während|jetzt|heute|ernte|winter|sommer|frühjahr|herbst|saison|aktion|bis\s+\w+)\b/i.test(h);
    case "counter":
      return /\b(teuer|billig|umgekehrt|gegenteil|überraschend|trotzdem|obwohl|paradox|widerspruch|tatsächlich|in wahrheit)\b/i.test(h);
    case "proof":
      return /\d/.test(h) || /\b(jahre|kunden|werkstätten|bauern|seit|mehr als|über)\b/i.test(h);
    case "mechanism":
      return /^(so|wie|warum)\b/i.test(h) || /\b(durch|dank|weil|funktioniert)\b/i.test(h);
    default:
      return h.length > 0;
  }
}
