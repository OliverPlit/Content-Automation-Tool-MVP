"use server";

import { generateImage, generateText } from "ai";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { adCopyLooseSchema } from "../../generate/schema";

export type ImageProvider = "openai" | "gemini";
export type ImageSourceMode = "ai" | "upload" | "url";

const BUCKET = "creative-images";

export type VariantImage = {
  variantIndex: number;
  imageUrl: string;
  imagePrompt: string | null;
  provider: ImageProvider | null;
};

export type ImageState = {
  ok: boolean;
  error?: string;
  variantIndex?: number;
  imageUrl?: string;
  imagePrompt?: string;
  provider?: ImageProvider;
};

const VISUAL_PROMPT_SYSTEM = `You are a senior art director writing image prompts for paid social ads (Meta, TikTok, Google).
Given an ad copy in German, write ONE concise English image prompt (max. 80 words) that describes:
- scene & subject
- lighting & mood
- style (photo, illustration, 3D — pick what fits the brand)
- composition (close-up, wide, eye-level…)

Do NOT include text overlays or words inside the image. Output only the prompt, no explanation.`;

export async function generateCreativeImage(
  _prev: ImageState,
  formData: FormData,
): Promise<ImageState> {
  const id = String(formData.get("id") ?? "");
  const providerInput = String(formData.get("provider") ?? "openai");
  const provider: ImageProvider =
    providerInput === "gemini" ? "gemini" : "openai";

  // Neue Quelle (Default = AI für Backward-Compat)
  const sourceInput = String(formData.get("imageSource") ?? "ai");
  const source: ImageSourceMode =
    sourceInput === "upload" || sourceInput === "url" ? sourceInput : "ai";
  const customImageUrl = String(formData.get("customImageUrl") ?? "").trim();

  const variantIndexRaw = Number(formData.get("variantIndex"));
  const variantIndex =
    Number.isInteger(variantIndexRaw) &&
    variantIndexRaw >= 0 &&
    variantIndexRaw < 10
      ? variantIndexRaw
      : -1;

  if (!id) return { ok: false, error: "Keine Creative-ID übergeben." };
  if (variantIndex < 0)
    return { ok: false, error: "Ungültiger Varianten-Index." };

  // OpenAI-Key nur erforderlich, wenn AI-Pfad gewählt — beim Upload/URL nicht.
  if (source === "ai" && !process.env.OPENAI_API_KEY) {
    return { ok: false, error: "OPENAI_API_KEY fehlt (für Prompt-Generierung)." };
  }
  if (
    source === "ai" &&
    provider === "gemini" &&
    !process.env.GOOGLE_GENERATIVE_AI_API_KEY
  ) {
    return {
      ok: false,
      error: "GOOGLE_GENERATIVE_AI_API_KEY fehlt — für Gemini erforderlich.",
    };
  }
  if ((source === "upload" || source === "url") && !customImageUrl) {
    return {
      ok: false,
      error:
        source === "upload"
          ? "Bitte lade zuerst ein Bild hoch (oben im Source-Picker)."
          : "Bitte gib eine Bild-URL ein.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const { data: row, error: loadErr } = await supabase
    .from("creatives")
    .select("id, output")
    .eq("id", id)
    .single();
  if (loadErr || !row) return { ok: false, error: "Creative nicht gefunden." };

  let adCopy: z.infer<typeof adCopyLooseSchema>;
  try {
    const parsed = adCopyLooseSchema.safeParse(JSON.parse(row.output ?? ""));
    if (!parsed.success)
      return { ok: false, error: "Ad-Copy hat das falsche Format." };
    adCopy = parsed.data;
  } catch {
    return { ok: false, error: "Ad-Copy konnte nicht geparst werden." };
  }

  const variant = adCopy.variants[variantIndex];
  if (!variant)
    return { ok: false, error: "Variante existiert nicht im Creative." };

  // -------------------------------------------------------------------------
  // Bytes besorgen — je nach Quelle
  // -------------------------------------------------------------------------
  let bytes: Uint8Array;
  let mediaType: string;
  let visualPrompt = "";
  let dbProvider: ImageProvider | null = null;

  if (source === "ai") {
    // 1. OpenAI → Visual Prompt
    try {
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        system: VISUAL_PROMPT_SYSTEM,
        prompt: `Headline: ${adCopy.headline}
Subline: ${adCopy.subline}
Body (Variante ${variantIndex + 1}): ${variant.body}
CTA: ${variant.cta}`,
        temperature: 0.7,
      });
      visualPrompt = text.trim();
      if (!visualPrompt)
        return { ok: false, error: "Leerer Bild-Prompt von OpenAI." };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "OpenAI-Fehler.";
      return { ok: false, error: `Prompt-Generierung fehlgeschlagen: ${msg}` };
    }

    // 2. Bild-Modell aufrufen
    try {
      const result =
        provider === "gemini"
          ? await generateImage({
              model: google.image("gemini-2.5-flash-image"),
              prompt: visualPrompt,
              aspectRatio: "1:1",
            })
          : await generateImage({
              model: openai.image("gpt-image-1"),
              prompt: visualPrompt,
              size: "1024x1024",
            });
      bytes = result.image.uint8Array;
      mediaType = result.image.mediaType || "image/png";
      dbProvider = provider;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bild-Fehler.";
      const isQuota = /quota|rate.?limit|429|billing/i.test(msg);
      if (isQuota) {
        return {
          ok: false,
          error:
            provider === "gemini"
              ? "Gemini-Quota/Billing-Problem. In Google AI Studio prüfen."
              : "OpenAI-Limit/Billing-Problem. https://platform.openai.com/usage prüfen.",
        };
      }
      return { ok: false, error: `Bild-Generierung fehlgeschlagen: ${msg}` };
    }
  } else {
    // Upload (Storage-URL aus /api/upload-preview) oder external URL.
    // In beiden Fällen: Bytes über fetch() laden.
    const fetched = await fetchImageBytes(customImageUrl);
    if (!fetched.ok) return { ok: false, error: fetched.error };
    bytes = fetched.bytes;
    mediaType = fetched.mediaType;
    dbProvider = null; // kein Modell beteiligt
    // Kein neuer AI-Prompt für eigenes Bild — der alte (falls vorhanden) bleibt.
    const { data: existing } = await supabase
      .from("creative_images")
      .select("image_prompt")
      .eq("creative_id", id)
      .eq("variant_index", variantIndex)
      .maybeSingle();
    visualPrompt = (existing?.image_prompt as string | null) ?? "";
  }

  // -------------------------------------------------------------------------
  // Upload nach Storage + DB-Upsert (gleich für alle Quellen)
  // -------------------------------------------------------------------------
  const ext = inferExt(mediaType);
  const path = `${user.id}/${id}/${variantIndex}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: mediaType,
      upsert: true,
      cacheControl: "0",
    });
  if (uploadErr)
    return { ok: false, error: `Upload fehlgeschlagen: ${uploadErr.message}` };

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: upsertErr } = await supabase
    .from("creative_images")
    .upsert(
      {
        user_id: user.id,
        creative_id: id,
        variant_index: variantIndex,
        image_url: publicUrl,
        image_prompt: visualPrompt || null,
        provider: dbProvider,
      },
      { onConflict: "creative_id,variant_index" },
    );
  if (upsertErr)
    return { ok: false, error: `DB-Update fehlgeschlagen: ${upsertErr.message}` };

  revalidatePath("/dashboard/library");
  revalidatePath(`/dashboard/library/${id}`);

  return {
    ok: true,
    variantIndex,
    imageUrl: publicUrl,
    imagePrompt: visualPrompt || undefined,
    provider: dbProvider ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function fetchImageBytes(
  url: string,
): Promise<
  | { ok: true; bytes: Uint8Array; mediaType: string }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "image/*" },
      cache: "no-store",
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
    return { ok: true, bytes: buf, mediaType: contentType };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Netzwerk-Fehler.";
    const isTimeout = /aborted|timeout/i.test(msg);
    return {
      ok: false,
      error: isTimeout
        ? "Bild-Fetch hat länger als 8 Sek. gebraucht — abgebrochen."
        : `Bild-Fetch fehlgeschlagen: ${msg}`,
    };
  }
}

function inferExt(mediaType: string): string {
  if (mediaType.includes("png")) return "png";
  if (mediaType.includes("webp")) return "webp";
  if (mediaType.includes("jpeg") || mediaType.includes("jpg")) return "jpg";
  return mediaType.split("/")[1] ?? "png";
}

export async function deleteCreativeImage(formData: FormData): Promise<void> {
  const creativeId = String(formData.get("id") ?? "");
  const variantIndexRaw = Number(formData.get("variantIndex"));
  const variantIndex =
    Number.isInteger(variantIndexRaw) &&
    variantIndexRaw >= 0 &&
    variantIndexRaw < 10
      ? variantIndexRaw
      : -1;
  if (!creativeId || variantIndex < 0) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.storage
    .from(BUCKET)
    .remove([
      `${user.id}/${creativeId}/${variantIndex}.png`,
      `${user.id}/${creativeId}/${variantIndex}.jpg`,
      `${user.id}/${creativeId}/${variantIndex}.jpeg`,
      `${user.id}/${creativeId}/${variantIndex}.webp`,
    ]);

  await supabase
    .from("creative_images")
    .delete()
    .eq("creative_id", creativeId)
    .eq("variant_index", variantIndex);

  revalidatePath("/dashboard/library");
  revalidatePath(`/dashboard/library/${creativeId}`);
}
