/**
 * Produkt-Scraper: holt eine URL, extrahiert Marketing-relevante Infos
 * via Cheerio (HTML) + Open Graph + JSON-LD + Microdata. Anschließend
 * verfeinert ein LLM die Felder zu sauberen Generate-Form-Vorbelegungen.
 */
import { generateObject } from "ai";
import * as cheerio from "cheerio";
import { z } from "zod";

import { openai } from "@/lib/ai/openai-client";

// Doc 6.2 — strukturierte Produktfakten als verbindlicher Prompt-Kontext.
// Pflicht: name + mindestens eines aus {price, specs, oemApprovals}.
export const scrapedProductSchema = z.object({
  name: z.string().max(200),
  keyMessage: z.string().max(300),
  audience: z.string().max(200),
  productHint: z.string().max(300),
  // Phase B (Doc 6.2) — strukturierte Produktfakten
  price: z.string().max(80).default(""),
  gebinde: z.string().max(80).default(""),
  specs: z.array(z.string().max(80)).max(8).default([]),
  oemApprovals: z.array(z.string().max(80)).max(8).default([]),
  usps: z.array(z.string().max(120)).max(6).default([]),
  compatibleMachines: z.array(z.string().max(60)).max(8).default([]),
  imageUrls: z.array(z.string()).max(8),
});
export type ScrapedProduct = z.infer<typeof scrapedProductSchema>;

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

  // LLM-Veredelung
  const emptyFacts = {
    price: "",
    gebinde: "",
    specs: [] as string[],
    oemApprovals: [] as string[],
    usps: [] as string[],
    compatibleMachines: [] as string[],
  };

  if (!process.env.OPENAI_API_KEY) {
    // Fallback ohne LLM
    return {
      ok: true,
      data: {
        name: title.trim().slice(0, 200),
        keyMessage: description.trim().slice(0, 300),
        audience: "",
        productHint: "",
        ...emptyFacts,
        imageUrls: [...imageUrls].slice(0, 8),
      },
    };
  }

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: scrapedProductSchema,
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
    return { ok: true, data: object };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM-Fehler.";
    // Fallback bei LLM-Fehler
    return {
      ok: true,
      data: {
        name: title.trim().slice(0, 200),
        keyMessage: (description || msg).trim().slice(0, 300),
        audience: "",
        productHint: "",
        ...emptyFacts,
        imageUrls: [...imageUrls].slice(0, 8),
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
