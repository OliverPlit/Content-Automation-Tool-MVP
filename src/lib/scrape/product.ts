/**
 * Produkt-Scraper: holt eine URL, extrahiert Marketing-relevante Infos
 * via Cheerio (HTML) + Open Graph + JSON-LD + Microdata. Anschließend
 * verfeinert ein LLM die Felder zu sauberen Generate-Form-Vorbelegungen.
 */
import { generateObject } from "ai";
import * as cheerio from "cheerio";
import { z } from "zod";

import { openai } from "@/lib/ai/openai-client";
import { extractBrandColors, normalizeHex, type BrandColors } from "./brand-colors";
import { detectLogoFromHtml } from "./logo-detect";

// Doc 6.2 — strukturierte Produktfakten als verbindlicher Prompt-Kontext.
// Pflicht: name + mindestens eines aus {price, specs, oemApprovals}.
// Erweitert um Brand-Style-Felder (Logo + Farben), die aus dem Logo der
// gecrawlten Seite extrahiert werden und ins Render-Theme einfließen.
export const brandColorsSchema = z.object({
  primary: z.string(),
  accent: z.string(),
  background: z.string(),
  text: z.string(),
});

// LLM-Output-Schema (OpenAI Structured Outputs verlangt alle Felder
// required + keine .nullable() — daher kein logoUrl/brandColors hier).
const llmScrapedSchema = z.object({
  name: z.string().max(200),
  keyMessage: z.string().max(300),
  audience: z.string().max(200),
  productHint: z.string().max(300),
  price: z.string().max(80).default(""),
  gebinde: z.string().max(80).default(""),
  specs: z.array(z.string().max(80)).max(8).default([]),
  oemApprovals: z.array(z.string().max(80)).max(8).default([]),
  usps: z.array(z.string().max(120)).max(6).default([]),
  compatibleMachines: z.array(z.string().max(60)).max(8).default([]),
  imageUrls: z.array(z.string()).max(8),
});

// Public-Schema (LLM-Felder + Brand-Style, das wir nach dem LLM-Call
// serverseitig anreichern).
export const scrapedProductSchema = llmScrapedSchema.extend({
  logoUrl: z.string().default(""),
  brandColors: brandColorsSchema.nullable().default(null),
});
export type ScrapedProduct = z.infer<typeof scrapedProductSchema>;
export type { BrandColors };

const PRIVATE_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
];

const PRIVATE_RANGES = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^169\.254\./,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
];

function isSafeUrl(u: URL): boolean {
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = u.hostname.toLowerCase();
  if (PRIVATE_HOSTS.includes(host)) return false;
  if (PRIVATE_RANGES.some((r) => r.test(host))) return false;
  return true;
}

export async function scrapeProductPage(
  rawUrl: string,
): Promise<{ ok: true; data: ScrapedProduct } | { ok: false; error: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: "URL hat ein ungültiges Format." };
  }
  if (!isSafeUrl(url)) {
    return { ok: false, error: "URL nicht erlaubt (intern/Privat)." };
  }

  let html: string;
  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ContentToolBot/1.0; +https://content-tool.local)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} beim Fetch.` };
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("text")) {
      return { ok: false, error: "Kein HTML/Text-Inhalt." };
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 2 * 1024 * 1024) {
      return { ok: false, error: "Seite > 2 MB — abgebrochen." };
    }
    html = new TextDecoder().decode(buf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Netzwerk-Fehler.";
    return { ok: false, error: `Fetch fehlgeschlagen: ${msg}` };
  }

  const $ = cheerio.load(html);

  // Open Graph + Meta-Tags
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $('meta[name="twitter:title"]').attr("content") ||
    $("title").first().text();
  const description =
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content") ||
    "";
  const ogImage = $('meta[property="og:image"]').attr("content") || "";

  // JSON-LD (oft Produkt-Schema)
  const jsonLdRaw: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).contents().text();
    if (txt) jsonLdRaw.push(txt.slice(0, 5000));
  });

  // Body-Text (gekürzt)
  $("script,style,noscript,svg").remove();
  const bodyText = $("body")
    .text()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);

  // Bilder einsammeln
  const imageUrls = new Set<string>();
  if (ogImage) imageUrls.add(toAbs(ogImage, url));
  $("img").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src");
    if (src && !src.startsWith("data:")) imageUrls.add(toAbs(src, url));
  });

  // Logo-URL detecten: in dieser Reihenfolge ausprobieren:
  //   1. JSON-LD Organization.logo
  //   2. <img class/alt/id="logo"> im <header>
  //   3. <link rel="icon"|"apple-touch-icon"> größtes
  //   4. og:image als Fallback
  // (Implementierung in scrape/logo-detect.ts — wird auch von /api/crawl-website
  //  geteilt, damit beide Routen denselben Brand-Style liefern.)
  const logoUrl = detectLogoFromHtml(html, url.toString());

  // Brand-Colors aus dem Logo extrahieren (parallel zum LLM-Call laufen
  // lassen, weil beide ~1-3 Sek brauchen).
  const brandColorsPromise: Promise<BrandColors | null> = logoUrl
    ? extractBrandColors(logoUrl).catch(() => null)
    : Promise.resolve(null);

  // CSS-Vorab-Scan: <meta name="theme-color"> liefert einen sauberen
  // Brand-Primary, wenn die Seite einen gesetzt hat. Wir nehmen den als
  // Override für `primary` wenn vorhanden — Logo-Pixel-Sampling kann bei
  // mehrfarbigen Logos daneben treffen.
  const themeColorRaw = $('meta[name="theme-color"]').attr("content") ?? "";
  const themeColor = themeColorRaw ? normalizeHex(themeColorRaw) : null;

  // LLM-Veredelung
  const emptyFacts = {
    price: "",
    gebinde: "",
    specs: [] as string[],
    oemApprovals: [] as string[],
    usps: [] as string[],
    compatibleMachines: [] as string[],
  };

  const finalizeBrand = async (): Promise<{
    logoUrl: string;
    brandColors: BrandColors | null;
  }> => {
    const colors = await brandColorsPromise;
    if (!colors) {
      return {
        logoUrl: logoUrl || "",
        brandColors: themeColor
          ? { primary: themeColor, accent: themeColor, background: "#FFFFFF", text: "#111111" }
          : null,
      };
    }
    return {
      logoUrl: logoUrl || "",
      brandColors: {
        primary: themeColor ?? colors.primary,
        accent: colors.accent,
        background: colors.background,
        text: colors.text,
      },
    };
  };

  if (!process.env.OPENAI_API_KEY) {
    // Fallback ohne LLM
    const brand = await finalizeBrand();
    return {
      ok: true,
      data: {
        name: title.trim().slice(0, 200),
        keyMessage: description.trim().slice(0, 300),
        audience: "",
        productHint: "",
        ...emptyFacts,
        imageUrls: [...imageUrls].slice(0, 8),
        ...brand,
      },
    };
  }

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: llmScrapedSchema,
      system: `Du bist Marketing-Analyst. Aus rohen Produktdaten extrahierst du strukturierte Felder für ein Ad-Creative-Tool. Antworten auf Deutsch, kurz und prägnant.

Pflicht-Verhalten:
- name: Produktname exakt (inkl. Sorte/Norm, z.B. "HLP 46 Hydrauliköl").
- price: Preis mit Einheit wie "89,90 € / 60L". Leer lassen wenn nicht klar.
- gebinde: Gebindegröße wie "60L Fass", "5L Kanister", "200L Fass". Leer wenn nicht klar.
- specs: DIN-/ISO-/Norm-Bezeichnungen ("DIN 51524-2", "ISO VG 46"). Keine Werbephrasen.
- oemApprovals: OEM-Freigaben wie "Bosch-Rexroth", "MAN M3477", "MB 228.51". Keine Erfindungen.
- usps: 2-4 kurze Verkaufsargumente in konkreter Form, z.B. "Direkt vom Hersteller", "Made in Austria". Keine Marketing-Floskeln wie "bewährt"/"premium"/"hochwertig".
- compatibleMachines: Maschinen-Kategorien wie "Traktor", "Bagger", "LKW", "Hydraulikaggregat". Allgemein halten.
- imageUrls: max. 4 wahrscheinliche Produkt-Bilder, keine Logos/Icons.

Wenn ein Feld nicht eindeutig aus den Daten ableitbar ist: leeren String oder leeres Array zurückgeben — KEINE Erfindungen.`,
      prompt: `URL: ${url.toString()}
Title: ${title}
Description: ${description}
JSON-LD: ${jsonLdRaw.join("\n---\n").slice(0, 3000)}
Body-Auszug: ${bodyText}
Image-Kandidaten: ${[...imageUrls].slice(0, 12).join("\n")}`,
      temperature: 0.2,
    });
    const brand = await finalizeBrand();
    return { ok: true, data: { ...object, ...brand } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM-Fehler.";
    // Fallback bei LLM-Fehler
    const brand = await finalizeBrand();
    return {
      ok: true,
      data: {
        name: title.trim().slice(0, 200),
        keyMessage: (description || msg).trim().slice(0, 300),
        audience: "",
        productHint: "",
        ...emptyFacts,
        imageUrls: [...imageUrls].slice(0, 8),
        ...brand,
      },
    };
  }
}

function toAbs(src: string, base: URL): string {
  try {
    return new URL(src, base).toString();
  } catch {
    return src;
  }
}

