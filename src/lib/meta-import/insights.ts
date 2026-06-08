/**
 * Distilliert aus geparsten Meta-CSV-Rows die Insights, die später in den
 * Generate-Prompt oder die Lernschleife fließen.
 *
 * Vier Kinds, vier Extractoren — je nach Quelle unterschiedliche Heuristiken.
 */
import { HOOKS, type HookValue } from "@/app/dashboard/generate/schema";
import { matchesHookPattern } from "@/lib/score/creative";
import { pick, toNumber } from "./csv";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type PostsInsights = {
  totalPosts: number;
  topHooks: Array<{
    hook: HookValue;
    label: string;
    count: number;
    example: string;
    avgEngagement: number;
  }>;
  topPhrases: string[]; // erste-Sätze der besten 5 Posts
};

export type AdsPerfInsights = {
  totalAds: number;
  hookCtrMap: Array<{
    hook: HookValue;
    label: string;
    avgCtr: number;
    n: number;
  }>;
  topAds: Array<{ name: string; headline: string; ctr: number; spend: number }>;
  bottomAds: Array<{ name: string; headline: string; ctr: number }>;
};

export type AudienceInsights = {
  topAgeRange: string;
  topGender: string;
  topInterests: string[];
  topLocations: string[];
  topJobs: string[];
};

export type ProductRow = {
  id: string;
  title: string;
  description: string;
  price: string;
  imageUrl: string;
  link: string;
  brand: string;
  availability: string;
};

export type ProductsInsights = {
  totalProducts: number;
  rows: ProductRow[];
};

export type GoogleAdsInsights = {
  totalAds: number;
  /** Konto-CTR über alle ausgewerteten Anzeigen, in Prozent. */
  accountCtr: number;
  hookCtrMap: Array<{
    hook: HookValue;
    label: string;
    avgCtr: number;
    n: number;
  }>;
  topAds: Array<{
    adGroup: string;
    headline: string;
    ctr: number;
    impressions: number;
    cost: number;
    effectiveness: string;
  }>;
  bottomAds: Array<{ adGroup: string; headline: string; ctr: number }>;
  effectivenessCounts: Record<string, number>;
};

export type AnyInsights =
  | { kind: "posts"; data: PostsInsights }
  | { kind: "ads_performance"; data: AdsPerfInsights }
  | { kind: "audience"; data: AudienceInsights }
  | { kind: "products"; data: ProductsInsights }
  | { kind: "google_ads"; data: GoogleAdsInsights };

// ---------------------------------------------------------------------------
// Hook-Classifier — testet einen Text gegen alle 12 Hook-Pattern und gibt
// den ersten passenden zurück. Wenn keiner matched: null.
// ---------------------------------------------------------------------------
export function classifyHook(text: string): HookValue | null {
  if (!text) return null;
  // Wir testen nur die erste „Headline" (= erster Satz oder erste 80 Zeichen)
  const head = firstSentence(text).slice(0, 120);
  // Reihenfolge: spezifischste zuerst, damit „question" nicht alle Frages-Hooks frisst
  const order: HookValue[] = [
    "number",
    "negation",
    "comparison",
    "implication",
    "secret",
    "ifThen",
    "counter",
    "season",
    "avatar",
    "mechanism",
    "proof",
    "question",
  ];
  for (const hook of order) {
    if (matchesHookPattern(head, hook)) return hook;
  }
  return null;
}

function firstSentence(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  const m = trimmed.match(/^[^.!?\n]+[.!?]/);
  if (m) return m[0];
  return trimmed.slice(0, 120);
}

// ---------------------------------------------------------------------------
// A — Posts: aus Caption/Engagement → Top-Hooks + Top-Phrasen
// ---------------------------------------------------------------------------
export function extractPostsInsights(
  records: Record<string, string>[],
): PostsInsights {
  type Row = { caption: string; engagement: number; hook: HookValue | null };
  const rows: Row[] = records.map((r) => {
    const caption = pick(
      r,
      "Caption",
      "Message",
      "Description",
      "Post message",
      "Post Caption",
      "Headline",
    );
    const engagement =
      toNumber(pick(r, "Engagements", "Engagement", "Total Engagement")) ||
      toNumber(pick(r, "Reactions", "Likes")) +
        toNumber(pick(r, "Comments")) +
        toNumber(pick(r, "Shares")) +
        toNumber(pick(r, "Saves"));
    return { caption, engagement, hook: classifyHook(caption) };
  });

  // Sort by engagement desc, take valid ones with caption
  const withCaption = rows
    .filter((r) => r.caption.length > 0)
    .sort((a, b) => b.engagement - a.engagement);

  // Bucket nach Hook, jeweils mit count + bestes Example + avgEng
  const buckets = new Map<HookValue, Row[]>();
  for (const r of withCaption) {
    if (!r.hook) continue;
    const list = buckets.get(r.hook) ?? [];
    list.push(r);
    buckets.set(r.hook, list);
  }
  const topHooks = Array.from(buckets.entries())
    .map(([hook, list]) => {
      const total = list.reduce((acc, r) => acc + r.engagement, 0);
      const avg = list.length > 0 ? total / list.length : 0;
      const best = list[0]; // bereits sortiert
      return {
        hook,
        label: HOOKS.find((h) => h.value === hook)?.label ?? hook,
        count: list.length,
        example: firstSentence(best.caption),
        avgEngagement: Math.round(avg),
      };
    })
    .sort((a, b) => b.avgEngagement - a.avgEngagement || b.count - a.count)
    .slice(0, 5);

  const topPhrases = withCaption
    .slice(0, 5)
    .map((r) => firstSentence(r.caption));

  return {
    totalPosts: withCaption.length,
    topHooks,
    topPhrases,
  };
}

// ---------------------------------------------------------------------------
// B — Ads Performance: CTR pro Hook + Top/Bottom-Ads
// ---------------------------------------------------------------------------
export function extractAdsPerfInsights(
  records: Record<string, string>[],
): AdsPerfInsights {
  type Row = {
    name: string;
    headline: string;
    ctr: number;
    spend: number;
    hook: HookValue | null;
  };
  const rows: Row[] = records.map((r) => {
    const name = pick(r, "Ad name", "Ad Name", "Ad");
    const headline =
      pick(r, "Headline", "Ad Headline", "Title") || name;
    const ctrRaw = pick(r, "CTR", "CTR (all)", "Click-through rate", "CTR (link click-through rate)");
    let ctr = toNumber(ctrRaw);
    // CTR oft als „1.25%" oder „1,25%" → toNumber liefert 1.25
    // Falls Wert > 1 und kein „%": eventuell als Dezimal (0.0125)? Unwahrscheinlich, lassen wie es ist.
    if (ctrRaw.includes("%") && ctr > 0) {
      // ist Prozent — passt
    } else if (ctr > 0 && ctr < 1) {
      // wahrscheinlich Dezimal → in %
      ctr = ctr * 100;
    }
    const spend = toNumber(pick(r, "Amount spent", "Spend", "Cost"));
    return {
      name,
      headline,
      ctr,
      spend,
      hook: classifyHook(headline),
    };
  });
  const valid = rows.filter((r) => r.headline.length > 0 && r.ctr > 0);

  // Hook-CTR-Map
  const buckets = new Map<HookValue, { sumCtr: number; n: number }>();
  for (const r of valid) {
    if (!r.hook) continue;
    const b = buckets.get(r.hook) ?? { sumCtr: 0, n: 0 };
    b.sumCtr += r.ctr;
    b.n += 1;
    buckets.set(r.hook, b);
  }
  const hookCtrMap = Array.from(buckets.entries())
    .map(([hook, b]) => ({
      hook,
      label: HOOKS.find((h) => h.value === hook)?.label ?? hook,
      avgCtr: Math.round((b.sumCtr / b.n) * 100) / 100,
      n: b.n,
    }))
    .sort((a, b) => b.avgCtr - a.avgCtr);

  const sortedByCtr = [...valid].sort((a, b) => b.ctr - a.ctr);
  const topAds = sortedByCtr.slice(0, 5).map((r) => ({
    name: r.name,
    headline: r.headline,
    ctr: r.ctr,
    spend: r.spend,
  }));
  const bottomAds = sortedByCtr
    .slice(-3)
    .reverse()
    .map((r) => ({ name: r.name, headline: r.headline, ctr: r.ctr }));

  return { totalAds: valid.length, hookCtrMap, topAds, bottomAds };
}

// ---------------------------------------------------------------------------
// C — Audience Insights: Demographics
// Meta exportiert das oft als „long format" (Spalte = Property, Wert = Value).
// Wir versuchen sowohl wide- als auch long-Format zu handhaben.
// ---------------------------------------------------------------------------
export function extractAudienceInsights(
  records: Record<string, string>[],
): AudienceInsights {
  // Wenn jede Row ein „Property"/„Value" Paar ist (long format):
  const isLongFormat =
    records.length > 0 &&
    records[0] &&
    "Property" in records[0] &&
    "Value" in records[0];

  if (isLongFormat) {
    const map = new Map<string, string[]>();
    for (const r of records) {
      const prop = (r.Property ?? "").toLowerCase().trim();
      const val = (r.Value ?? "").trim();
      if (!prop || !val) continue;
      const list = map.get(prop) ?? [];
      list.push(val);
      map.set(prop, list);
    }
    return {
      topAgeRange: map.get("age")?.[0] ?? map.get("age range")?.[0] ?? "",
      topGender: map.get("gender")?.[0] ?? "",
      topInterests: map.get("interests") ?? map.get("interest") ?? [],
      topLocations: map.get("location") ?? map.get("country") ?? [],
      topJobs: map.get("job title") ?? map.get("job titles") ?? [],
    };
  }

  // Wide format: ein Row pro Demographie-Bucket, sortiert nach Reach/%
  const sorted = [...records].sort((a, b) => {
    const pa = toNumber(pick(a, "Percentage", "%", "Reach", "Audience"));
    const pb = toNumber(pick(b, "Percentage", "%", "Reach", "Audience"));
    return pb - pa;
  });
  const topRow = sorted[0] ?? {};
  const ages = uniq(
    sorted.map((r) => pick(r, "Age", "Age range", "Age Range")).filter(Boolean),
  );
  const genders = uniq(
    sorted.map((r) => pick(r, "Gender")).filter(Boolean),
  );
  const interests = uniq(
    sorted
      .flatMap((r) =>
        pick(r, "Interests", "Top interests", "Interest")
          .split(/[,;|]/)
          .map((s) => s.trim()),
      )
      .filter(Boolean),
  ).slice(0, 10);
  const locations = uniq(
    sorted
      .map((r) => pick(r, "Location", "Country", "City"))
      .filter(Boolean),
  ).slice(0, 5);
  const jobs = uniq(
    sorted
      .flatMap((r) =>
        pick(r, "Job titles", "Job title", "Top job titles")
          .split(/[,;|]/)
          .map((s) => s.trim()),
      )
      .filter(Boolean),
  ).slice(0, 10);

  return {
    topAgeRange: ages[0] ?? pick(topRow, "Age", "Age range") ?? "",
    topGender: genders[0] ?? pick(topRow, "Gender") ?? "",
    topInterests: interests,
    topLocations: locations,
    topJobs: jobs,
  };
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

// ---------------------------------------------------------------------------
// D — Produktkatalog: jede Row = ein Produkt für Bulk-Generate
// ---------------------------------------------------------------------------
export function extractProductsInsights(
  records: Record<string, string>[],
): ProductsInsights {
  const rows: ProductRow[] = records
    .map((r) => ({
      id: pick(r, "id", "product_id", "sku", "SKU"),
      title: pick(r, "title", "name", "product_name", "Title"),
      description: pick(r, "description", "Description", "body"),
      price: pick(r, "price", "Price", "sale_price"),
      imageUrl: pick(r, "image_link", "image_url", "image", "Image URL"),
      link: pick(r, "link", "product_link", "url", "URL"),
      brand: pick(r, "brand", "Brand", "manufacturer"),
      availability: pick(r, "availability", "Availability", "stock"),
    }))
    .filter((p) => p.title.length > 0);

  return {
    totalProducts: rows.length,
    rows,
  };
}

// ---------------------------------------------------------------------------
// E — Google Ads (Responsive Suchanzeigen-Bericht, deutsche UI).
//
// Eine Google-Ad hat bis zu 15 Headline-Komponenten (Anzeigentitel 1..15) und
// 4 Description-Texte (Textzeile 1..4 + Beschreibung 3..5). Google mischt diese
// dynamisch — es gibt KEINE eine Headline pro Ad. Für unsere Hook-CTR-Heuristik
// klassifizieren wir deshalb ALLE Komponenten und schreiben die Performance je
// erkanntem Hook anteilig zu (CTR und Impressions verteilt auf alle erkannten
// Hooks dieser Ad). Das ist eine Näherung — saubere 1:1-Zuordnung kommt erst
// mit dem Matching-Adapter in Phase C.
// ---------------------------------------------------------------------------
export function extractGoogleAdsInsights(
  records: Record<string, string>[],
): GoogleAdsInsights {
  type Row = {
    adGroup: string;
    campaign: string;
    impressions: number;
    interactions: number;
    ctr: number; // %
    cost: number;
    effectiveness: string;
    headlines: string[];
  };
  const rows: Row[] = records
    .map((r) => {
      // Alle Anzeigentitel-Spalten einsammeln (1..15) — die genauen Namen
      // variieren leicht ("Anzeigentitel 1" vs. "Headline 1"); wir scannen
      // alle Keys, die mit diesem Muster anfangen.
      const headlines: string[] = [];
      for (const key of Object.keys(r)) {
        if (/^\s*(anzeigentitel|headline)\s*\d+\s*$/i.test(key)) {
          const v = (r[key] ?? "").trim();
          if (v && v !== "--" && !/\{KeyWord/i.test(v)) headlines.push(v);
        }
      }
      const adGroup = pick(r, "Anzeigengruppe", "Ad group", "Ad Group");
      const campaign = pick(r, "Kampagne", "Campaign");
      const impressions = Math.round(
        toNumber(pick(r, "Impressionen", "Impressions", "Impr.")),
      );
      const interactions = Math.round(
        toNumber(pick(r, "Interaktionen", "Interactions", "Clicks", "Klicks")),
      );
      const ctrRaw = pick(
        r,
        "Interaktionsrate",
        "CTR",
        "Klickrate",
        "Click-through rate",
      );
      let ctr = toNumber(ctrRaw);
      if (!ctrRaw.includes("%") && ctr > 0 && ctr < 1) ctr = ctr * 100;
      const cost = toNumber(pick(r, "Kosten", "Cost", "Spend"));
      const effectiveness = pick(
        r,
        "Anzeigeneffektivität",
        "Ad strength",
        "Ad Strength",
      );
      return {
        adGroup,
        campaign,
        impressions,
        interactions,
        ctr,
        cost,
        effectiveness,
        headlines,
      };
    })
    .filter((r) => r.impressions > 0 && r.headlines.length > 0);

  const totalImpr = rows.reduce((s, r) => s + r.impressions, 0);
  const totalInt = rows.reduce((s, r) => s + r.interactions, 0);
  const accountCtr = totalImpr > 0 ? (totalInt / totalImpr) * 100 : 0;

  // Hook-CTR-Map: Performance jeder Ad auf alle erkannten Hooks gleich
  // verteilen (gewichtet mit Impressions).
  const buckets = new Map<HookValue, { sumWeightedCtr: number; n: number }>();
  for (const row of rows) {
    const hits = new Set<HookValue>();
    for (const h of row.headlines) {
      const hook = classifyHook(h);
      if (hook) hits.add(hook);
    }
    if (hits.size === 0) continue;
    for (const hook of hits) {
      const b = buckets.get(hook) ?? { sumWeightedCtr: 0, n: 0 };
      b.sumWeightedCtr += row.ctr * row.impressions;
      b.n += row.impressions;
      buckets.set(hook, b);
    }
  }
  const hookCtrMap = Array.from(buckets.entries())
    .map(([hook, b]) => ({
      hook,
      label: HOOKS.find((h) => h.value === hook)?.label ?? hook,
      avgCtr: b.n > 0 ? Math.round((b.sumWeightedCtr / b.n) * 100) / 100 : 0,
      n: b.n,
    }))
    .sort((a, b) => b.avgCtr - a.avgCtr);

  // Top/Bottom-Ads — nach CTR sortiert, jeweils der erste Headline-Treffer
  // als Anzeige-Label.
  const sortedByCtr = [...rows].sort((a, b) => b.ctr - a.ctr);
  const topAds = sortedByCtr.slice(0, 5).map((r) => ({
    adGroup: r.adGroup,
    headline: r.headlines[0] ?? "",
    ctr: r.ctr,
    impressions: r.impressions,
    cost: r.cost,
    effectiveness: r.effectiveness,
  }));
  const bottomAds = sortedByCtr
    .filter((r) => r.ctr > 0)
    .slice(-3)
    .reverse()
    .map((r) => ({ adGroup: r.adGroup, headline: r.headlines[0] ?? "", ctr: r.ctr }));

  // Effektivitäts-Verteilung (Google bewertet jede Ad mit Sehr gut / Gut / …)
  const effectivenessCounts: Record<string, number> = {};
  for (const r of rows) {
    const key = r.effectiveness || "Unbekannt";
    effectivenessCounts[key] = (effectivenessCounts[key] ?? 0) + 1;
  }

  return {
    totalAds: rows.length,
    accountCtr: Math.round(accountCtr * 100) / 100,
    hookCtrMap,
    topAds,
    bottomAds,
    effectivenessCounts,
  };
}
