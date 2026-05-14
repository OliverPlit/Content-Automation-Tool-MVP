"use server";

import { experimental_generateImage as generateImage, generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  ANGLES,
  MACHINES,
  TONES,
  adCopySchema,
  type AngleValue,
  type GenerateInput,
  type GenerateState,
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
});

function buildSystemPrompt(
  machine: MachineValue,
  angle: AngleValue,
  websiteText: string | undefined,
  variantCount: number,
): string {
  const machineMeta = MACHINES.find((m) => m.value === machine)!;
  const angleMeta = ANGLES.find((a) => a.value === angle)!;

  const websiteSection = websiteText
    ? `\nZUSATZ-KONTEXT VON DER KUNDEN-WEBSITE (gekürzt, nicht 1:1 zitieren):\n${websiteText.slice(0, 3000)}\n`
    : "";

  return `Du bist Performance-Marketing-Texter für einen österreichischen Schmierstoff-Hersteller mit Direktvertrieb.

BRAND-KERN (subtil einweben, nicht in jedem Text wiederholen):
- Direktkauf vom Hersteller = günstiger, ohne Zwischenhändler
- Made in Austria, Familienunternehmen seit 1946
- Hochwertige Schmierstoffe, Öle, Fette für Maschinen und Fahrzeuge

PFLICHT-SPRACHE:
- Deutsch, Tonfall bodenständig + kompetent, kein Marketing-Geschwätz
- Anrede: bevorzugt "Du", bei Premium/Industrie-Kontext auch "Sie" möglich
- Aktive CTAs im Imperativ: "Jetzt bestellen!", "Direkt sichern!", "Hol dir den Vorteil!"
- KEINE Anglizismen wenn deutsche Wörter genauso gut funktionieren

MASCHINEN-KONTEXT: ${machineMeta.label}
Die Texte adressieren konkret diesen Maschinen-/Einsatz-Kontext.

ANGLE: ${angleMeta.label}
${angleMeta.voiceHint}
${websiteSection}
LÄNGEN-VORGABEN (HARTE GRENZEN):
- headline: max 60 Zeichen, 1 starker Hook, kein Punkt am Ende
- subline: max 120 Zeichen, ergänzt die Headline mit einem konkreten Vorteil
- variants: GENAU ${variantCount} Varianten, jede mit:
  - body: max 300 Zeichen, 1–3 kurze Sätze, kein Marketing-Filler, direkter Nutzen
  - cta: max 30 Zeichen, aktiver Imperativ ("Jetzt kaufen!", "Direkt bestellen!", "Hier sichern!")

Die ${variantCount} Varianten müssen DEUTLICH unterschiedliche Hooks nutzen — z. B. Preis-Hook, Performance-Hook, Tradition-Hook, Dringlichkeit, sozialer Beweis. Keine Variante darf eine andere wiederholen.

BILD-PROMPT (FELD imagePrompt):
Schreibe in ENGLISCH einen detaillierten Bild-Prompt für ein Foto-Modell.
Pflicht-Elemente:
- Szene passend zur Maschine: ${machineMeta.sceneHint}
- Stil: "professional product photography, realistic, dramatic natural lighting, 1:1 square composition"
- Pflicht-Suffix: "no text, no logos, no watermarks, no readable signage"
Halte den Bild-Prompt unter 800 Zeichen. KEIN Brand-Name (kein "WODOIL", kein "ÖMV"), nur generisches "yellow lubricant canister / oil drum".

OUTPUT: ausschließlich im JSON-Schema. Keine Erklärungen, keine Markdown-Codeblöcke.`;
}

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

  const { product, audience, tone, machine, angle, websiteText, variantCount } =
    parsed.data;

  const systemPrompt = buildSystemPrompt(
    machine,
    angle,
    websiteText && websiteText.length > 0 ? websiteText : undefined,
    variantCount,
  );

  const userPrompt = `Produkt / Service: ${product}
Zielgruppe: ${audience}
Ton: ${tone}
Maschinen-Kontext: ${machine}
Angle: ${angle}
Anzahl Varianten: ${variantCount}`;

  // 1) Copy generieren
  let output: z.infer<typeof adCopySchema>;
  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: adCopySchema,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.9,
    });
    // Sicherheitsnetz: falls Modell zu viele/wenige Varianten zurückgibt.
    if (object.variants.length !== variantCount) {
      object.variants = object.variants.slice(0, variantCount);
    }
    output = object;
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Unbekannter Fehler bei der Generierung.";
    return { ok: false, error: message };
  }

  const input: GenerateInput = {
    product,
    audience,
    tone,
    machine,
    angle,
    websiteText: websiteText && websiteText.length > 0 ? websiteText : undefined,
    variantCount,
  };

  // 2) Bild generieren (soft-fail — Copy bleibt auch ohne Bild)
  let imageUrl: string | undefined;
  let imageError: string | undefined;
  try {
    const { image } = await generateImage({
      model: openai.image("gpt-image-1"),
      prompt: output.imagePrompt,
      size: "1024x1024",
    });
    const bytes = image.uint8Array;
    const mediaType = image.mediaType || "image/png";
    const ext = mediaType.includes("png") ? "png" : "jpg";

    // Preview-Pfad: wird beim Save in den finalen Pfad verschoben/kopiert.
    const path = `${user.id}/preview/${Date.now()}.${ext}`;
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
    imageUrl = `${pub.publicUrl}?v=${Date.now()}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Bildfehler.";
    const isQuota = /quota|rate.?limit|429|billing/i.test(msg);
    imageError = isQuota
      ? "Bild konnte nicht erzeugt werden (Limit/Billing). Copy ist trotzdem fertig."
      : `Bild konnte nicht erzeugt werden: ${msg}`;
  }

  return {
    ok: true,
    output,
    input,
    imageUrl,
    imageError,
  };
}

// ---------------------------------------------------------------------------
// Save-Pfad
// ---------------------------------------------------------------------------
const savePayloadSchema = z.object({
  product: z.string().min(1).max(500),
  audience: z.string().min(1).max(300),
  tone: z.enum(TONES),
  machine: z.enum(MACHINES.map((m) => m.value) as [MachineValue, ...MachineValue[]]),
  angle: z.enum(ANGLES.map((a) => a.value) as [AngleValue, ...AngleValue[]]),
  output: adCopySchema,
  previewImageUrl: z.string().url().optional().or(z.literal("")),
  imagePrompt: z.string().max(800).optional().or(z.literal("")),
});

export async function saveCreative(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const rawOutput = formData.get("output");
  if (typeof rawOutput !== "string") {
    return { ok: false, error: "Kein Output zum Speichern." };
  }

  let parsedOutput: unknown;
  try {
    parsedOutput = JSON.parse(rawOutput);
  } catch {
    return { ok: false, error: "Output ist kein gültiges JSON." };
  }

  const parsed = savePayloadSchema.safeParse({
    product: formData.get("product"),
    audience: formData.get("audience"),
    tone: formData.get("tone"),
    machine: formData.get("machine"),
    angle: formData.get("angle"),
    output: parsedOutput,
    previewImageUrl: formData.get("previewImageUrl") ?? "",
    imagePrompt: formData.get("imagePrompt") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: "Speicher-Daten sind unvollständig." };
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
    output,
    previewImageUrl,
    imagePrompt,
  } = parsed.data;

  const promptText = `Produkt: ${product}
Zielgruppe: ${audience}
Ton: ${tone}
Maschine: ${machine}
Angle: ${angle}`;

  // 1) Creative-Row anlegen
  const { data: creativeRow, error: insertErr } = await supabase
    .from("creatives")
    .insert({
      user_id: user.id,
      prompt: promptText,
      output: JSON.stringify(output),
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

  // 2) Preview-Bild übernehmen: vom Preview-Pfad in den Variante-0-Pfad kopieren
  //    Das spart Credits (Bild wurde schon generiert) und initialisiert Variante 0.
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
              image_prompt: imagePrompt || output.imagePrompt,
              provider: "openai",
            },
            { onConflict: "creative_id,variant_index" },
          );
        }
      }
    } catch {
      // Bild-Übernahme ist soft — Creative bleibt trotzdem gespeichert.
    }
  }

  revalidatePath("/dashboard/library");
  return { ok: true, savedId: creativeRow.id };
}
