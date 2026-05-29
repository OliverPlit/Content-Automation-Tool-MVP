/**
 * RFC-4180-konformer CSV-Parser. Robust für:
 *  - Quoted fields mit Kommas + Newlines
 *  - Escaped Quotes ("" innerhalb von "...")
 *  - Trailing-Commas
 *  - CRLF + LF
 *
 * Stripped down auf das Wesentliche — wir brauchen keine Excel-Spezialfälle.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // BOM entfernen
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\r") {
      // ignore — wir nehmen \n als Zeilenende
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Leere Zeilen entfernen
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/**
 * Erzeugt Records (Spalten-Name → Wert) aus geparsten Rows.
 * Erste Row = Header.
 */
export function csvToRecords(rows: string[][]): Record<string, string>[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((row) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h] = (row[i] ?? "").trim();
    });
    return rec;
  });
}

// ---------------------------------------------------------------------------
// Kind-Detection — wir entscheiden anhand der Header welcher Meta-CSV-Typ.
// ---------------------------------------------------------------------------
export type MetaImportKind =
  | "posts"
  | "ads_performance"
  | "audience"
  | "products";

// Wir erkennen Meta, Google Ads, LinkedIn — deutsche und englische Spalten.
// Jede Signatur-Gruppe = ein Sub-Muster. Mehr getroffene Sub-Muster = höherer Score.
const KIND_SIGNATURES: Record<MetaImportKind, RegExp[]> = {
  // Posts / organische Beiträge mit Engagement
  posts: [
    /\b(post[\s_-]?id|permalink|publish[\s_-]?time|veröffentlicht|published)\b/i,
    /\b(caption|message|beitrag|post[\s_-]?text|content|inhalt|titel|title)\b/i,
    /\b(reach|reichweite|impressions?|impressionen|engagements?|interaktionen|likes|reactions|reaktionen)\b/i,
  ],
  // Ads-Performance: Meta Ads Manager + Google Ads + LinkedIn Campaign Manager
  ads_performance: [
    /\b(ad[\s_-]?name|anzeige|anzeigenname|campaign[\s_-]?name|kampagne|kampagnen[\s_-]?name|adset|anzeigengruppe|ad[\s_-]?group)\b/i,
    /\b(ctr|cpm|cpc|spend|cost|kosten|amount[\s_-]?spent|ausgaben|conversion|conversions|reach)\b/i,
    /\b(clicks?|klicks?|impressions?|impressionen|impr\.?)\b/i,
  ],
  // Audience Insights — Demographics
  audience: [
    /\b(age|alter|age[\s_-]?range|gender|geschlecht|location|standort|country|land|city|stadt)\b/i,
    /\b(interests?|interessen|top[\s_-]?categories|kategorien|job[\s_-]?titles?|berufe?|demographics?|demografie|property)\b/i,
  ],
  // Produktkatalog: Meta Commerce, Google Merchant, Shopify, generisch
  products: [
    /\b(id|product[\s_-]?id|sku|artikel[\s_-]?nr|item[\s_-]?id)\b/i,
    /\b(title|titel|name|produkt(?:name)?|product[\s_-]?name)\b/i,
    /\b(price|preis|availability|verfügbarkeit|image[\s_-]?link|bild[\s_-]?url|product[\s_-]?link|produkt[\s_-]?url|brand|marke)\b/i,
  ],
};

const MIN_CONFIDENCE = 0.34; // mindestens 1 von 3 Sub-Mustern muss matchen

export function detectKind(headerRow: string[]): {
  kind: MetaImportKind | null;
  confidence: number;
  scores: Record<MetaImportKind, number>;
} {
  const joined = headerRow.join(" | ").toLowerCase();
  const scores = {} as Record<MetaImportKind, number>;
  for (const kind of Object.keys(KIND_SIGNATURES) as MetaImportKind[]) {
    const sigs = KIND_SIGNATURES[kind];
    let hits = 0;
    for (const re of sigs) if (re.test(joined)) hits++;
    scores[kind] = hits / sigs.length;
  }
  // Pick highest
  const entries = Object.entries(scores) as [MetaImportKind, number][];
  entries.sort((a, b) => b[1] - a[1]);
  const [topKind, topScore] = entries[0];
  if (topScore < MIN_CONFIDENCE) {
    return { kind: null, confidence: topScore, scores };
  }
  return { kind: topKind, confidence: topScore, scores };
}

// Util: zahlentolerantes Parsen ("1.234,56 €" → 1234.56, "12.5%" → 12.5)
export function toNumber(s: string | undefined): number {
  if (!s) return 0;
  const cleaned = String(s)
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "") // Tausender-Punkt weg
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// Util: case-insensitive Header-Lookup
export function pick(rec: Record<string, string>, ...keys: string[]): string {
  const lower = Object.fromEntries(
    Object.entries(rec).map(([k, v]) => [k.toLowerCase(), v]),
  );
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v && v.trim().length > 0) return v.trim();
  }
  return "";
}
