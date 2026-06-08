/**
 * HTML → Logo-URL Detection. Nutzt cheerio + JSON-LD-Traversal.
 *
 * Probiert in dieser Reihenfolge:
 *   1. JSON-LD Organization.logo
 *   2. <img> im <header> mit class/alt/id "logo"
 *   3. <link rel="icon"|"apple-touch-icon"> mit größter Größe
 *   4. og:image als letztes Fallback
 *
 * Wird von /api/crawl-website (Generate-Hot-Path) und scrapeProductPage
 * gleichermaßen verwendet — eine Implementierung, zwei Aufrufer.
 */
import * as cheerio from "cheerio";

export function detectLogoFromHtml(html: string, baseUrl: string): string {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return "";
  }

  const $ = cheerio.load(html);

  // 1) JSON-LD Organization.logo
  const jsonLdLogos: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).contents().text();
    if (!txt) return;
    try {
      const parsed = JSON.parse(txt) as unknown;
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const c of candidates) {
        const logo = extractJsonLdLogo(c);
        if (logo) jsonLdLogos.push(logo);
      }
    } catch {
      // ignore
    }
  });
  if (jsonLdLogos[0]) return toAbs(jsonLdLogos[0], base);

  // 2) <img> mit Klasse/Alt/ID "logo" — bevorzugt im Header
  const logoImg = $(
    'header img[src*="logo" i], header img[alt*="logo" i], header img[class*="logo" i], header img[id*="logo" i], img[src*="logo" i][src*=".svg" i], img[alt*="logo" i]',
  ).first();
  const logoSrc =
    logoImg.attr("src") ||
    logoImg.attr("data-src") ||
    logoImg.attr("srcset")?.split(",")[0]?.trim().split(" ")[0];
  if (logoSrc && !logoSrc.startsWith("data:")) return toAbs(logoSrc, base);

  // 3) link rel=icon — größtes auswählen
  let bestIcon: { src: string; size: number } | null = null;
  $('link[rel*="icon" i], link[rel*="apple-touch-icon" i]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("data:")) return;
    const sizes = $(el).attr("sizes") ?? "";
    const sizeNum = parseInt(sizes.split("x")[0] ?? "0", 10) || 0;
    if (!bestIcon || sizeNum > bestIcon.size) {
      bestIcon = { src: href, size: sizeNum };
    }
  });
  if (bestIcon) return toAbs((bestIcon as { src: string }).src, base);

  // 4) og:image
  const ogImage =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content") ||
    "";
  if (ogImage) return toAbs(ogImage, base);

  return "";
}

export function extractThemeColor(html: string): string {
  const $ = cheerio.load(html);
  return ($('meta[name="theme-color"]').attr("content") ?? "").trim();
}

function toAbs(src: string, base: URL): string {
  try {
    return new URL(src, base).toString();
  } catch {
    return src;
  }
}

function extractJsonLdLogo(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  if (typeof obj.logo === "string") return obj.logo;
  if (obj.logo && typeof obj.logo === "object") {
    const logoObj = obj.logo as Record<string, unknown>;
    if (typeof logoObj.url === "string") return logoObj.url;
    if (typeof logoObj["@id"] === "string") return logoObj["@id"];
  }
  if (Array.isArray(obj["@graph"])) {
    for (const g of obj["@graph"]) {
      const inner = extractJsonLdLogo(g);
      if (inner) return inner;
    }
  }
  return null;
}
