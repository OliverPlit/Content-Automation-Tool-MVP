import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { openai } from "@/lib/ai/openai-client";
import { createClient } from "@/lib/supabase/server";
import { MACHINES, ANGLES, TONES } from "@/app/dashboard/generate/schema";
import { extractBrandColors, normalizeHex, type BrandColors } from "@/lib/scrape/brand-colors";
import { detectLogoFromHtml, extractThemeColor } from "@/lib/scrape/logo-detect";

const MAX_CHARS = 3000;
const TIMEOUT_MS = 5000;
const IMAGE_TIMEOUT_MS = 8000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const STORAGE_BUCKET = "creative-images";

// LLM-basierte Inference: analysiert den gecrawlten Text und liefert
// strukturierte Vorschläge für Produkt-Titel, Zielgruppe, Maschinen-Kontext,
// Werbe-Angle und Ton. Fail-safe: wenn das LLM fehlschlägt, geben wir leere
// Vorschläge zurück und der Crawl-Response liefert nur Title/Description.
async function inferFormFields(
  text: string,
  title: string,
  description: string,
): Promise<{
  product?: string;
  audience?: string;
  machine?: (typeof MACHINES)[number]["value"];
  angle?: (typeof ANGLES)[number]["value"];
  tone?: (typeof TONES)[number];
  // Phase B (Doc 6.2) — strukturierte Produktfakten
  price?: string;
  gebinde?: string;
  specs?: string[];
  oemApprovals?: string[];
  usps?: string[];
  compatibleMachines?: string[];
} | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const machineValues = MACHINES.map((m) => m.value) as [string, ...string[]];
  const angleValues = ANGLES.map((a) => a.value) as [string, ...string[]];

  const schema = z.object({
    product: z
      .string()
      .max(200)
      .describe(
        "Klarer Produktname inkl. Spec (z. B. Viskositätsklasse) — max 200 Zeichen",
      ),
    audience: z
      .string()
      .max(200)
      .describe(
        "Wer kauft das? Konkret: z. B. 'Landwirte mit eigener Werkstatt' oder 'KFZ-Werkstätten mit BMW-Fokus' — max 200 Zeichen",
      ),
    machine: z.enum(machineValues),
    angle: z.enum(angleValues),
    tone: z.enum(TONES),
    // Phase B Produktfakten — bei Unklarheit LEER zurückgeben, NIE erfinden
    price: z
      .string()
      .max(80)
      .describe(
        "Preis mit Einheit, z.B. '89,90 € / 60L'. Leer wenn nicht auf der Seite.",
      ),
    gebinde: z
      .string()
      .max(80)
      .describe(
        "Gebindegröße, z.B. '60L Fass', '5L Kanister', '200L Fass'. Leer wenn unklar.",
      ),
    specs: z
      .array(z.string().max(80))
      .max(6)
      .describe(
        "Technische Norm-Bezeichnungen wie 'DIN 51524-2', 'ISO VG 46'. Keine Marketing-Floskeln. Leer-Array wenn keine.",
      ),
    oemApprovals: z
      .array(z.string().max(80))
      .max(6)
      .describe(
        "OEM-Freigaben/Approvals wie 'Bosch-Rexroth', 'MAN M3477', 'MB 228.51'. Niemals erfinden. Leer-Array wenn keine genannt.",
      ),
    usps: z
      .array(z.string().max(120))
      .max(4)
      .describe(
        "2-4 konkrete USPs in kurzer Form wie 'Direkt vom Hersteller', 'Made in Austria seit 1946'. Keine Floskeln wie 'bewährt' oder 'premium'.",
      ),
    compatibleMachines: z
      .array(z.string().max(60))
      .max(6)
      .describe(
        "Maschinen-Kategorien, mit denen das Produkt kompatibel ist: 'Traktor', 'Bagger', 'LKW', 'Hydraulikaggregat'. Leer-Array wenn unklar.",
      ),
  });

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema,
      system: `Du bist ein Performance-Marketing-Analyst. Aus einem Produkt-Webseiten-Text extrahierst Du die passenden Form-Felder für ein Ad-Creative-Tool.

Branchen-Quick-Pick (machine) — der Default ist "auto" (Szene wird aus dem Produkt selbst hergeleitet). Wähle NUR dann einen der spezifischen Werte (landwirtschaft, werkstatt, lkw, industrie, motorrad, bau, winterdienst), wenn das Produkt eindeutig in eine dieser Schmieröl-/Industrie-Branchen passt. Für ALLE anderen Branchen (Kosmetik, Lebensmittel, SaaS, Mode, Pflege, Reinigung, etc.) IMMER "auto" wählen — sonst wird ein falscher Branchen-Bias erzeugt:
${MACHINES.map((m) => `- ${m.value}: ${m.label}`).join("\n")}

Werbe-Angle (angle) — was passt zur Produktseite?
${ANGLES.map((a) => `- ${a.value}: ${a.label} — ${a.voiceHint}`).join("\n")}

Tonfall (tone) — passend zur Zielgruppe:
- professionell: B2B, Industrie, Einkäufer
- locker: Handwerker, Landwirte
- verspielt: junge Zielgruppe, Hobby
- premium: hochwertige Produkte, Industrie
- direkt: Preis-fokussiert, Sale

REGEL für Produktfakten (price, gebinde, specs, oemApprovals, usps, compatibleMachines):
- NUR was auf der Seite tatsächlich steht. KEINE Erfindungen.
- Bei Unklarheit: leeren String / leeres Array.
- specs sind NUR technische Norm-Codes (DIN xxxx, ISO xxx). KEINE Marketing-Wörter.
- usps sind konkret und prüfbar. KEINE 'hochwertig', 'bewährt', 'premium', 'innovativ'.

Output ist Pflicht JSON. Wenn unklar bei Soft-Feldern (machine/angle/tone), wähle plausibelsten Default.`,
      prompt: `Webseiten-Titel: ${title}
Meta-Description: ${description}

Inhalt (gestrippt, gekürzt):
${text.slice(0, 2500)}`,
      temperature: 0.2,
    });
    return object as Awaited<ReturnType<typeof inferFormFields>>;
  } catch {
    return null;
  }
}

// Lädt das gecrawlte Produktbild ins Supabase-Storage des eingeloggten Users.
// Gibt eine Public-URL zurück, die dauerhaft funktioniert (statt der externen
// Quelle, die offline gehen oder CORS-Probleme machen kann).
async function mirrorCrawledImage(
  imageUrl: string,
): Promise<{ ok: true; url: string } | { ok: false }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false };

    const res = await fetch(imageUrl, {
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      headers: { Accept: "image/*" },
      redirect: "follow",
    });
    if (!res.ok) return { ok: false };

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.startsWith("image/")) return { ok: false };

    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_IMAGE_BYTES || buf.byteLength < 200) return { ok: false };

    const ext = ct.includes("png")
      ? "png"
      : ct.includes("webp")
        ? "webp"
        : ct.includes("gif")
          ? "gif"
          : "jpg";
    const path = `${user.id}/crawled/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, buf, { contentType: ct, upsert: false, cacheControl: "3600" });
    if (upErr) return { ok: false };

    const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return { ok: true, url: pub.publicUrl };
  } catch {
    return { ok: false };
  }
}

// Extrahiert den Seiten-Titel — bevorzugt og:title, dann <title>, dann <h1>.
function extractTitle(html: string): string {
  const og = html.match(
    /<meta\s+[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
  );
  if (og?.[1]) return decodeEntities(og[1]).trim().slice(0, 200);

  const tw = html.match(
    /<meta\s+[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i,
  );
  if (tw?.[1]) return decodeEntities(tw[1]).trim().slice(0, 200);

  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t?.[1]) return decodeEntities(t[1]).trim().slice(0, 200);

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1?.[1]) return decodeEntities(h1[1].replace(/<[^>]+>/g, " ")).trim().slice(0, 200);

  return "";
}

// Extrahiert die Seiten-Description — bevorzugt og:description, dann meta description.
function extractDescription(html: string): string {
  const og = html.match(
    /<meta\s+[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
  );
  if (og?.[1]) return decodeEntities(og[1]).trim().slice(0, 300);

  const md = html.match(
    /<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
  );
  if (md?.[1]) return decodeEntities(md[1]).trim().slice(0, 300);

  const tw = html.match(
    /<meta\s+[^>]*name=["']twitter:description["'][^>]*content=["']([^"']+)["']/i,
  );
  if (tw?.[1]) return decodeEntities(tw[1]).trim().slice(0, 300);

  return "";
}

// Extrahiert die Haupt-Bild-URL — bevorzugt og:image, dann twitter:image,
// dann das erste <img> mit absoluter URL (groß genug, kein Logo/Icon).
function extractImageUrl(html: string, baseUrl: string): string {
  const og = html.match(
    /<meta\s+[^>]*property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i,
  );
  if (og?.[1]) return absolutize(og[1].trim(), baseUrl);

  const tw = html.match(
    /<meta\s+[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
  );
  if (tw?.[1]) return absolutize(tw[1].trim(), baseUrl);

  // Fallback: erstes <img> mit src — Filter gegen offensichtliche Icons/Logos/Spacer
  const imgs = html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi);
  for (const m of imgs) {
    const src = m[1];
    if (!src) continue;
    if (/^data:/.test(src)) continue;
    if (/(logo|icon|favicon|sprite|spacer|placeholder|pixel|tracking)/i.test(src)) continue;
    return absolutize(src, baseUrl);
  }
  return "";
}

function absolutize(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return "";
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ");
}

// Sehr simpler HTML → Text Stripper (kein DOM-Parser, nur Regex).
// Reicht für unseren Zweck: Marketing-Kontext für GPT, nicht für strukturiertes Parsing.
function htmlToText(html: string): string {
  return (
    html
      // Komplette Block-Bereiche, die wir nie wollen, ganz entfernen.
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      // Alle übrigen Tags entfernen.
      .replace(/<[^>]+>/g, " ")
      // HTML-Entities grob auflösen (häufigste).
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Whitespace normalisieren.
      .replace(/\s+/g, " ")
      .trim()
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { url?: string };
    const raw = String(body.url ?? "").trim();
    if (!raw) {
      return NextResponse.json(
        { error: "URL fehlt." },
        { status: 400 },
      );
    }

    // URL parsen + Protokoll prüfen
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return NextResponse.json(
        { error: "URL hat ein ungültiges Format." },
        { status: 400 },
      );
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json(
        { error: "Nur http(s)-URLs erlaubt." },
        { status: 400 },
      );
    }

    // Fetch mit Timeout
    const res = await fetch(parsed.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ContentToolBot/1.0; +https://content-tool.local)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Website-Fetch fehlgeschlagen: HTTP ${res.status}` },
        { status: 502 },
      );
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("text")) {
      return NextResponse.json(
        { error: "Inhalt ist kein HTML/Text." },
        { status: 415 },
      );
    }

    const html = await res.text();
    const text = htmlToText(html).slice(0, MAX_CHARS);
    const title = extractTitle(html);
    const description = extractDescription(html);
    const rawImageUrl = extractImageUrl(html, parsed.toString());
    const logoUrl = detectLogoFromHtml(html, parsed.toString());
    const themeColor = normalizeHex(extractThemeColor(html));

    if (!text) {
      return NextResponse.json(
        { error: "Nach dem Strippen kein lesbarer Text mehr übrig." },
        { status: 422 },
      );
    }

    // Bild-Mirror, LLM-Inference UND Brand-Color-Extract PARALLEL.
    // Logo-Pixel-Sampling läuft im Hintergrund; bei Timeout/Fehler null.
    const [mirror, inferred, rawBrandColors] = await Promise.all([
      rawImageUrl ? mirrorCrawledImage(rawImageUrl) : Promise.resolve({ ok: false as const }),
      inferFormFields(text, title, description),
      logoUrl ? extractBrandColors(logoUrl).catch(() => null) : Promise.resolve(null),
    ]);

    let imageUrl = rawImageUrl;
    let imageMirrored = false;
    if (mirror.ok) {
      imageUrl = mirror.url;
      imageMirrored = true;
    }

    // theme-color schlägt Logo-Sampling, weil es vom Brand-Designer
    // bewusst gesetzt ist (z. B. <meta name="theme-color" content="#003B5C">).
    const brandColors: BrandColors | null = rawBrandColors
      ? {
          primary: themeColor ?? rawBrandColors.primary,
          accent: rawBrandColors.accent,
          background: rawBrandColors.background,
          text: rawBrandColors.text,
        }
      : themeColor
        ? { primary: themeColor, accent: themeColor, background: "#FFFFFF", text: "#111111" }
        : null;

    return NextResponse.json({
      text,
      title,
      description,
      imageUrl,
      imageMirrored,
      // RF-Brand: Logo-URL + 4 extrahierte Brand-Farben
      logoUrl,
      brandColors,
      // LLM-Inferred Form-Felder — überschreiben die heuristischen Defaults
      product: inferred?.product ?? title,
      audience: inferred?.audience ?? description,
      machine: inferred?.machine,
      angle: inferred?.angle,
      tone: inferred?.tone,
      // Phase B (Doc 6.2) — strukturierte Produktfakten
      facts: inferred
        ? {
            name: inferred.product ?? title,
            price: inferred.price ?? "",
            gebinde: inferred.gebinde ?? "",
            specs: inferred.specs ?? [],
            oemApprovals: inferred.oemApprovals ?? [],
            usps: inferred.usps ?? [],
            compatibleMachines: inferred.compatibleMachines ?? [],
          }
        : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler.";
    const isTimeout =
      msg.toLowerCase().includes("aborted") ||
      msg.toLowerCase().includes("timeout");
    return NextResponse.json(
      {
        error: isTimeout
          ? "Website-Fetch hat länger als 5 Sek. gebraucht — abgebrochen."
          : `Crawl-Fehler: ${msg}`,
      },
      { status: 500 },
    );
  }
}
