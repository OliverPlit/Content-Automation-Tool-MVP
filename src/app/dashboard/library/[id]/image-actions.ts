"use server";

import { generateImage, generateText } from "ai";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { adCopyLooseSchema } from "../../generate/schema";

export type ImageProvider = "openai" | "gemini";

export type VariantImage = {
  variantIndex: number;
  imageUrl: string;
  imagePrompt: string | null;
  provider: ImageProvider | null;
};

export type ImageState = {
  ok: boolean;
  error?: string;
  // The variant we just generated for — UI uses this to know which slot got updated.
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

  const variantIndexRaw = Number(formData.get("variantIndex"));
  const variantIndex =
    Number.isInteger(variantIndexRaw) &&
    variantIndexRaw >= 0 &&
    variantIndexRaw < 5
      ? variantIndexRaw
      : -1;

  if (!id) return { ok: false, error: "Keine Creative-ID übergeben." };
  if (variantIndex < 0)
    return { ok: false, error: "Ungültiger Varianten-Index." };

  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, error: "OPENAI_API_KEY fehlt (für Prompt-Generierung)." };
  }
  if (provider === "gemini" && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return {
      ok: false,
      error: "GOOGLE_GENERATIVE_AI_API_KEY fehlt — für Gemini erforderlich.",
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

  // 1. OpenAI → Visual Prompt (immer OpenAI, unabhängig vom Bild-Provider)
  let visualPrompt: string;
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
  let bytes: Uint8Array;
  let mediaType: string;
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

  // 3. Upload zu Storage: <userId>/<creativeId>/<variantIndex>.<ext>
  const ext = mediaType.split("/")[1] ?? "png";
  const path = `${user.id}/${id}/${variantIndex}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from("creative-images")
    .upload(path, bytes, {
      contentType: mediaType,
      upsert: true,
      cacheControl: "0",
    });
  if (uploadErr)
    return { ok: false, error: `Upload fehlgeschlagen: ${uploadErr.message}` };

  const { data: pub } = supabase.storage
    .from("creative-images")
    .getPublicUrl(path);
  const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;

  // 4. Upsert in creative_images
  const { error: upsertErr } = await supabase
    .from("creative_images")
    .upsert(
      {
        user_id: user.id,
        creative_id: id,
        variant_index: variantIndex,
        image_url: publicUrl,
        image_prompt: visualPrompt,
        provider,
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
    imagePrompt: visualPrompt,
    provider,
  };
}

export async function deleteCreativeImage(formData: FormData): Promise<void> {
  const creativeId = String(formData.get("id") ?? "");
  const variantIndexRaw = Number(formData.get("variantIndex"));
  const variantIndex =
    Number.isInteger(variantIndexRaw) &&
    variantIndexRaw >= 0 &&
    variantIndexRaw < 5
      ? variantIndexRaw
      : -1;
  if (!creativeId || variantIndex < 0) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Best-effort storage cleanup (any extension)
  await supabase.storage
    .from("creative-images")
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
