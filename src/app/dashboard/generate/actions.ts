"use server";

import { experimental_generateImage as generateImage, generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  ANGLES,
  IMAGE_SOURCES,
  IMAGE_STYLES,
  MACHINES,
  TONES,
  adCopySchema,
  generatedVariantSchema,
  type AngleValue,
  type GeneratedVariant,
  type GenerateInput,
  type GenerateState,
  type ImageStyleValue,
  type MachineValue,
  type SaveState,
} from "./schema";

const STORAGE_BUCKET = "creative-images";

const inputSchema = z.object({
  product: z
    .string()
    .trim()
    .min(3, "Produkt muss mind. 3 Zeichen haben.")
    .max(500),
  audience: z
    .string()
    .trim()
    .min(3, "Zielgruppe muss mind. 3 Zeichen haben.")
    .max(300),
  tone: z.enum(TONES),
  machine: z.enum(MACHINES.map((m) => m.value) as [MachineValue, ...MachineValue[]]),
  angle: z.enum(ANGLES.map((a) => a.value) as [AngleValue, ...AngleValue[]]),
  websiteText: z.string().max(3000).optional().or(z.literal("")),
  variantCount: z.coerce.number().int().min(1).max(10).default(3),
  imageSource: z.enum(IMAGE_SOURCES).default("ai"),
  customImageUrl: z.string().url().optional().or(z.literal("")),
  imageStyle: z
    .enum(IMAGE_STYLES.map((s) => s.value) as [ImageStyleValue, ...ImageStyleValue[]])
    .default("auto"),
});

function buildSystemPrompt(
  machine: MachineValue,
  angle: AngleValue,
  websiteText: string | undefined,
  variantNumber: number,
  variantTotal: number,
  imageStyle: ImageStyleValue,
): string {
  const machineMeta = MACHINES.find((m) => m.value === machine)!;
  const angleMeta = ANGLES.find((a) => a.value === angle)!;
  const styleMeta = IMAGE_STYLES.find((s) => s.value === imageStyle)!;
  const styleLine = styleMeta.promptSuffix
    ? `\n- Pflicht-Style-Suffix: "${styleMeta.promptSuffix}"`
    : "";

  const websiteSection = websiteText
    ? `\nZUSATZ-KONTEXT VON DER KUNDEN-WEBSITE (gekürzt, nicht 1:1 zitieren):\n${websiteText.slice(0, 3000)}\n`
    : "";

  return `Du bist Performance-Marketing-Texter für einen österreichischen Schmierstoff-Hersteller mit Direktvertrieb.

BRAND-KERN (subtil einweben, nicht in jedem Text wiederholen):
- Direktkauf vom Hersteller = günstiger, ohne Zwischenhändler
- Made in Austria, Familienunternehmen seit 1946
- Hochwertige Schmierstoffe, Öle, Fette für Maschinen und Fahrzeuge

PFLICHT-SPRACHE:
- Deutsch, bodenständig + kompetent, kein Marketing-Geschwätz
- Anrede bevorzugt "Du", bei Premium/Industrie auch "Sie" möglich
- Aktive CTAs im Imperativ: "Jetzt bestellen!", "Direkt sichern!"
- Keine Anglizismen ohne Grund

MASCHINEN-KONTEXT: ${machineMeta.label}
ANGLE: ${angleMeta.label}
${angleMeta.voiceHint}
${websiteSection}
Du generierst gerade VARIANTE ${variantNumber} von ${variantTotal}. Diese
Variante muss sich von den anderen Varianten in HOOK und FORMULIERUNG
deutlich unterscheiden — gleiches Produkt, anderer Ansatz.

LÄNGEN-VORGABEN (HART):
- headline: max 60 Zeichen, 1 starker Hook, kein Punkt am Ende
- subline: max 120 Zeichen, ergänzt mit konkretem Vorteil
- body: max 300 Zeichen, 1–3 kurze Sätze, direkter Nutzen
- cta: max 30 Zeichen, aktiver Imperativ
- imagePrompt: ENGLISCH, max 800 Zeichen.
  Pflicht-Elemente:
   - Szene: ${machineMeta.sceneHint}
   - Stil-Basis: "professional product photography, realistic, dramatic natural lighting, 1:1 square composition"${styleLine}
   - Pflicht-Suffix: "no text, no logos, no watermarks, no readable signage"
  Kein Brand-Name (kein "WODOIL"), nur generisches "yellow lubricant canister / oil drum".

OUTPUT: ausschließlich im JSON-Schema. Keine Erklärungen, keine Markdown-Codeblöcke.`;
}

// ---------------------------------------------------------------------------
// Pro-Variante: 1× Copy + 1× Bild (je nach Source)
// ---------------------------------------------------------------------------
async function generateOneVariant(args: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  variantNumber: number; // 1-basiert
  variantTotal: number;
  product: string;
  audience: string;
  tone: string;
  machine: MachineValue;
  angle: AngleValue;
  websiteText: string | undefined;
  imageSource: "ai" | "upload" | "url";
  imageStyle: ImageStyleValue;
  sharedImageUrl: string | undefined; // bei upload/url für alle gleich
}): Promise<GeneratedVariant> {
  const {
    supabase,
    userId,
    variantNumber,
    variantTotal,
    product,
    audience,
    tone,
    machine,
    angle,
    websiteText,
    imageSource,
    imageStyle,
    sharedImageUrl,
  } = args;

  // 1) Copy
  const systemPrompt = buildSystemPrompt(
    machine,
    angle,
    websiteText,
    variantNumber,
    variantTotal,
    imageStyle,
  );
  const userPrompt = `Produkt / Service: ${product}
Zielgruppe: ${audience}
Ton: ${tone}
Maschinen-Kontext: ${machine}
Angle: ${angle}
Du bist Variante ${variantNumber} von ${variantTotal}.`;

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: generatedVariantSchema,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.95, // höher → divergentere Varianten
  });

  // 2) Bild — je nach Source
  let imageUrl: string | undefined;
  let imageError: string | undefined;

  if (imageSource === "ai") {
    const result = await generateAiImage(supabase, userId, object.imagePrompt);
    if (result.ok) imageUrl = result.url;
    else imageError = result.error;
  } else if (sharedImageUrl) {
    imageUrl = sharedImageUrl;
  } else {
    imageError = "Keine Bild-Quelle übergeben.";
  }

  return {
    ...object,
    index: variantNumber,
    imageUrl,
    imageError,
  };
}

// ---------------------------------------------------------------------------
// generateAdCopy — Hauptaction, parallelisiert pro Variante
// ---------------------------------------------------------------------------
export async function generateAdCopy(
  _prev: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  const parsed = inputSchema.safeParse({
    product: formData.get("product"),
    audience: formData.get("audience"),
    tone: formData.get("tone"),
    machine: formData.get("machine"),
    angle: formData.get("angle"),
    websiteText: formData.get("websiteText") ?? "",
    variantCount: formData.get("variantCount") ?? "3",
    imageSource: formData.get("imageSource") ?? "ai",
    customImageUrl: formData.get("customImageUrl") ?? "",
    imageStyle: formData.get("imageStyle") ?? "auto",
  });

  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      error: "Bitte fülle alle Felder korrekt aus.",
      fieldErrors: {
        product: flat.product?.[0],
        audience: flat.audience?.[0],
        tone: flat.tone?.[0],
        machine: flat.machine?.[0],
        angle: flat.angle?.[0],
        variantCount: flat.variantCount?.[0],
      },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false,
      error: "OPENAI_API_KEY ist nicht gesetzt (Server-Env-Var fehlt).",
    };
  }

  const {
    product,
    audience,
    tone,
    machine,
    angle,
    websiteText,
    variantCount,
    imageSource,
    customImageUrl,
    imageStyle,
  } = parsed.data;

  const cleanedCustomUrl =
    customImageUrl && customImageUrl.length > 0 ? customImageUrl : undefined;
  const cleanedWebsite =
    websiteText && websiteText.length > 0 ? websiteText : undefined;

  // Shared image bei Upload/URL einmal aufbereiten (für URL: mirroring)
  let sharedImageUrl: string | undefined;
  if (imageSource === "upload") {
    sharedImageUrl = cleanedCustomUrl;
  } else if (imageSource === "url") {
    if (!cleanedCustomUrl) {
      return { ok: false, error: "Bitte gib eine Bild-URL ein." };
    }
    const mirrored = await mirrorExternalImage(
      supabase,
      user.id,
      cleanedCustomUrl,
    );
    if (!mirrored.ok) {
      return { ok: false, error: mirrored.error };
    }
    sharedImageUrl = mirrored.url;
  }

  // Parallel ausführen — jede Variante = 1 Copy-Call + ggf. 1 Bild-Call.
  const settled = await Promise.allSettled(
    Array.from({ length: variantCount }).map((_, i) =>
      generateOneVariant({
        supabase,
        userId: user.id,
        variantNumber: i + 1,
        variantTotal: variantCount,
        product,
        audience,
        tone,
        machine,
        angle,
        websiteText: cleanedWebsite,
        imageSource,
        imageStyle,
        sharedImageUrl,
      }),
    ),
  );

  const variants: GeneratedVariant[] = [];
  const failures: string[] = [];
  settled.forEach((res, idx) => {
    if (res.status === "fulfilled") {
      variants.push(res.value);
    } else {
      const msg = res.reason instanceof Error ? res.reason.message : String(res.reason);
      failures.push(`Variante ${idx + 1}: ${msg}`);
    }
  });

  if (variants.length === 0) {
    return {
      ok: false,
      error: failures.join(" · ") || "Keine Variante konnte generiert werden.",
    };
  }

  const input: GenerateInput = {
    product,
    audience,
    tone,
    machine,
    angle,
    websiteText: cleanedWebsite,
    variantCount,
    imageSource,
    customImageUrl: cleanedCustomUrl,
    imageStyle,
  };

  return {
    ok: true,
    variants: variants.sort((a, b) => a.index - b.index),
    input,
    // Wenn EINIGE Varianten failed: Banner mit Hinweis
    ...(failures.length > 0
      ? { error: `${failures.length} Variante(n) fehlgeschlagen: ${failures.join(" · ")}` }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------
async function generateAiImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  prompt: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const { image } = await generateImage({
      model: openai.image("gpt-image-1"),
      prompt,
      size: "1024x1024",
    });
    const bytes = image.uint8Array;
    const mediaType = image.mediaType || "image/png";
    const ext = mediaType.includes("png") ? "png" : "jpg";
    const path = `${userId}/preview/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, bytes, {
        contentType: mediaType,
        upsert: true,
        cacheControl: "0",
      });
    if (upErr) throw new Error(upErr.message);
    const { data: pub } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path);
    return { ok: true, url: `${pub.publicUrl}?v=${Date.now()}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Bildfehler.";
    const isQuota = /quota|rate.?limit|429|billing/i.test(msg);
    return {
      ok: false,
      error: isQuota
        ? "Bild konnte nicht erzeugt werden (Limit/Billing). Copy ist trotzdem fertig."
        : `Bild konnte nicht erzeugt werden: ${msg}`,
    };
  }
}

async function mirrorExternalImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  url: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "image/*" },
    });
    if (!res.ok) {
      return { ok: false, error: `Bild-Fetch fehlgeschlagen (HTTP ${res.status}).` };
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return {
        ok: false,
        error: `URL liefert kein Bild zurück (Content-Type: ${contentType || "leer"}).`,
      };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > 10 * 1024 * 1024) {
      return { ok: false, error: "Bild zu groß (> 10 MB)." };
    }
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
    const path = `${userId}/preview/url-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, buf, {
        contentType,
        upsert: true,
        cacheControl: "0",
      });
    if (upErr) return { ok: false, error: `Upload-Fehler: ${upErr.message}` };
    const { data: pub } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path);
    return { ok: true, url: `${pub.publicUrl}?v=${Date.now()}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Netzwerk-Fehler.";
    const isTimeout = /aborted|timeout/i.test(msg);
    return {
      ok: false,
      error: isTimeout
        ? "Bild-URL-Fetch hat länger als 5 Sek. gebraucht — abgebrochen."
        : `Bild-URL konnte nicht geladen werden: ${msg}`,
    };
  }
}

// ---------------------------------------------------------------------------
// saveCreative — eine einzelne Variante in die Library packen
// ---------------------------------------------------------------------------
const savePayloadSchema = z.object({
  product: z.string().min(1).max(500),
  audience: z.string().min(1).max(300),
  tone: z.enum(TONES),
  machine: z.enum(MACHINES.map((m) => m.value) as [MachineValue, ...MachineValue[]]),
  angle: z.enum(ANGLES.map((a) => a.value) as [AngleValue, ...AngleValue[]]),
  variantIndex: z.coerce.number().int().min(1).max(10),
  headline: z.string().min(1).max(60),
  subline: z.string().min(1).max(120),
  body: z.string().min(1).max(300),
  cta: z.string().min(1).max(30),
  imagePrompt: z.string().max(800).optional().or(z.literal("")),
  previewImageUrl: z.string().url().optional().or(z.literal("")),
});

export async function saveCreative(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const parsed = savePayloadSchema.safeParse({
    product: formData.get("product"),
    audience: formData.get("audience"),
    tone: formData.get("tone"),
    machine: formData.get("machine"),
    angle: formData.get("angle"),
    variantIndex: formData.get("variantIndex"),
    headline: formData.get("headline"),
    subline: formData.get("subline"),
    body: formData.get("body"),
    cta: formData.get("cta"),
    imagePrompt: formData.get("imagePrompt") ?? "",
    previewImageUrl: formData.get("previewImageUrl") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "Speicher-Daten unvollständig. " +
        parsed.error.issues.slice(0, 2).map((i) => i.message).join("; "),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const {
    product,
    audience,
    tone,
    machine,
    angle,
    variantIndex,
    headline,
    subline,
    body,
    cta,
    imagePrompt,
    previewImageUrl,
  } = parsed.data;

  const adCopy = adCopySchema.parse({
    headline,
    subline,
    variants: [{ body, cta }],
    imagePrompt: imagePrompt || "no-prompt",
  });

  const promptText = `Produkt: ${product}
Zielgruppe: ${audience}
Ton: ${tone}
Maschine: ${machine}
Angle: ${angle}
Variante: ${variantIndex}`;

  const { data: creativeRow, error: insertErr } = await supabase
    .from("creatives")
    .insert({
      user_id: user.id,
      prompt: promptText,
      output: JSON.stringify(adCopy),
      status: "completed",
    })
    .select("id")
    .single();
  if (insertErr || !creativeRow) {
    return {
      ok: false,
      error: `DB-Fehler: ${insertErr?.message ?? "unbekannt"}`,
    };
  }

  // Preview-Bild als Variante-0 in den finalen Pfad kopieren
  if (previewImageUrl) {
    try {
      const res = await fetch(previewImageUrl, { cache: "no-store" });
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        const mediaType = res.headers.get("content-type") ?? "image/png";
        const ext = mediaType.includes("png") ? "png" : "jpg";
        const finalPath = `${user.id}/${creativeRow.id}/0.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(finalPath, buf, {
            contentType: mediaType,
            upsert: true,
            cacheControl: "0",
          });
        if (!upErr) {
          const { data: pub } = supabase.storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(finalPath);
          const finalUrl = `${pub.publicUrl}?v=${Date.now()}`;

          await supabase.from("creative_images").upsert(
            {
              user_id: user.id,
              creative_id: creativeRow.id,
              variant_index: 0,
              image_url: finalUrl,
              image_prompt: imagePrompt || null,
              provider: "openai",
            },
            { onConflict: "creative_id,variant_index" },
          );
        }
      }
    } catch {
      // soft-fail — Creative bleibt trotzdem gespeichert
    }
  }

  revalidatePath("/dashboard/library");
  return {
    ok: true,
    savedId: creativeRow.id,
    savedVariantIndex: variantIndex,
  };
}
