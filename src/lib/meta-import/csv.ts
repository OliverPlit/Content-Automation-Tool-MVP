/**
 * RFC-4180-konformer CSV-Parser. Robust für:
 *  - Quoted fields mit Kommas + Newlines
 *  - Escaped Quotes ("" innerhalb von "...")
 *  - Trailing-Commas
 *  - CRLF + LF
 *  - Auto-Erkennung des Trennzeichens (Komma vs. Semikolon vs. Tab) —
 *    Google-Ads-Exports und deutsche Excel-CSVs nutzen Semikolon.
 *
 * Stripped down auf das Wesentliche — wir brauchen keine Excel-Spezialfälle.
 */
export function parseCsv(text: string, delimiter?: string): string[][] {
  // BOM entfernen
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  // Trennzeichen auto-erkennen: wir prüfen die erste nicht-leere Zeile außerhalb
  // von Quotes und nehmen das Zeichen mit den meisten Vorkommen.
  const sep = delimiter ?? detectDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

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
    if (c === sep) {
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
 * Erkennt das Spaltentrennzeichen anhand der ersten ~5 Zeilen außerhalb von
 * Quotes. Komma > Semikolon > Tab, je nach Vorkommen. Default: Komma.
 */
function detectDelimiter(text: string): string {
  const sample = text.slice(0, 4000);
  let inQuotes = false;
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    if (c === '"') inQuotes = !inQuotes;
    if (inQuotes) continue;
    if (c in counts) counts[c]++;
  }
  // Wir nehmen das Zeichen mit den meisten Vorkommen. Bei Gleichstand: Komma.
  let best = ",";
  let bestN = counts[","];
  if (counts[";"] > bestN) {
    best = ";";
    bestN = counts[";"];
  }
  if (counts["\t"] > bestN) best = "\t";
  return best;
}

/**
 * Findet die echte Header-Zeile, falls die ersten Zeilen Report-Metadaten
 * enthalten (typisch für Google-Ads-Exports: Zeile 1 = "Anzeigenbericht",
 * Zeile 2 = Datumsbereich, Zeile 3 = echter Header). Wir nehmen die erste
 * Zeile, die ≥ 5 nicht-leere Felder hat — Metadaten-Zeilen haben üblicherweise
 * nur 1–2 Felder mit Inhalt.
 */
export function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i];
    const nonEmpty = r.filter((c) => c.trim().length > 0).length;
    if (nonEmpty >= 5) return i;
  }
  return 0;
}

/**
 * Filtert Aggregations-Zeilen am Ende eines Berichts heraus
 * (Google-Ads: "Gesamt: Alle außer entfernte Anzeigen", "Gesamt: Konto", …).
 * Diese erkennen wir an einer ersten Zelle, die mit "Gesamt:" / "Total:" /
 * "Summe:" beginnt.
 */
export function dropTotalsRows(rows: string[][]): string[][] {
  return rows.filter((r) => {
    const first = (r[0] ?? "").trim().toLowerCase();
    return !/^(gesamt|total|summe)\s*[:\-]/i.test(first);
  });
}

/**
 * Erzeugt Records (Spalten-Name → Wert) aus geparsten Rows.
 * Erste Row = Header (oder explizit gesetzter Index für Berichte mit
 * Metadaten-Vorzeilen wie Google-Ads).
 */
export function csvToRecords(
  rows: string[][],
  headerIndex = 0,
): Record<string, string>[] {
  if (rows.length < headerIndex + 2) return [];
  const headers = rows[headerIndex].map((h) => h.trim());
  return rows.slice(headerIndex + 1).map((row) => {
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
  | "products"
  | "google_ads";

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
  // Google Ads — Responsive Suchanzeigen-Bericht (deutsche UI).
  // Eindeutige Marker, die in keinem Meta-Export vorkommen:
  //   "Anzeigentitel 1..15", "Textzeile", "Anzeigeneffektivität",
  //   "Interaktionsrate" (Google-spezifisch statt CTR), "Responsive Suchanzeige".
  google_ads: [
    /\banzeigentitel\s*\d+|\bheadline\s*\d+\b/i,
    /\binteraktionsrate|interaktionen|anzeigeneffektivität|responsive\s+such/i,
    /\b(anzeigengruppe|kampagne|finale\s+url|conv\.-rate|kosten\/conv)\b/i,
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
  // Pick highest. Spezifischere Kinds (kleinere Priority-Zahl) gewinnen bei
  // Score-Gleichstand. Wichtig: ads_performance ist sehr breit und würde sonst
  // Google-Ads-Exports „klauen", obwohl google_ads die spezifischere Signatur
  // hat (Anzeigentitel-N + Interaktionsrate + Anzeigeneffektivität).
  const PRIORITY: Record<MetaImportKind, number> = {
    google_ads: 0,
    products: 1,
    audience: 2,
    posts: 3,
    ads_performance: 4,
  };
  const entries = Object.entries(scores) as [MetaImportKind, number][];
  entries.sort((a, b) => b[1] - a[1] || PRIORITY[a[0]] - PRIORITY[b[0]]);
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
