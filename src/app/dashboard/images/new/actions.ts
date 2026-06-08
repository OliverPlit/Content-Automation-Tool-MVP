"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  classifyImageError,
  generateOneImage,
  inferExt,
  type ImageFormat,
} from "@/lib/ai/images";
import { generateSceneWithProduct } from "@/lib/ai/gemini-image";
import { IMAGE_STYLES, PERSONAS, type PersonaValue } from "../../generate/schema";

const BUCKET = "creative-images";

export type StandaloneImageState = {
  ok: boolean;
  error?: string;
  urls?: string[];
};

const inputSchema = z.object({
  prompt: z.string().min(3).max(2000),
  format: z.enum(["1:1", "9:16", "4:5", "16:9"]),
  count: z.coerce.number().int().min(1).max(4),
  style: z.string().max(40).optional(),
  // Generate-Pipeline-Features
  persona: z.string().max(40).optional().or(z.literal("")),
  gebinde: z.string().max(80).optional().or(z.literal("")),
  scene: z.string().max(80).optional().or(z.literal("")),
  productImageUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal("")),
});

// Mapping wie in actions.ts (Generate) — real-hands-Hint pro Persona
const PERSONA_HANDS: Partial<Record<PersonaValue, string>> = {
  franz_landwirt:
    "real weathered hands of a farmer (jacket, dirt under nails) interacting with the product",
  klaus_werkstatt:
    "real grease-stained hands of a mechanic in workshop coveralls interacting with the product",
  gerhard_lohnunternehmer:
    "real working hands of an agricultural contractor handling the product near a tractor",
  thomas_transport:
    "real driver hands holding the product near a truck cab",
  michael_industrie:
    "real engineer hands in industrial setting checking the product",
  andreas_bau:
    "real construction worker hands with dust handling the product on a building site",
};

export async function generateStandaloneImages(
  _prev: StandaloneImageState,
  formData: FormData,
): Promise<StandaloneImageState> {
  const parsed = inputSchema.safeParse({
    prompt: formData.get("prompt"),
    format: formData.get("format"),
    count: formData.get("count"),
    style: formData.get("style"),
    persona: formData.get("persona") ?? "",
    gebinde: formData.get("gebinde") ?? "",
    scene: formData.get("scene") ?? "",
    productImageUrl: formData.get("productImageUrl") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe.",
    };
  }
  const input = parsed.data;

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return { ok: false, error: "GOOGLE_GENERATIVE_AI_API_KEY fehlt." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  // 1) Style-Suffix anhängen
  const style = IMAGE_STYLES.find((s) => s.value === input.style);
  const styleSuffix = style?.promptSuffix ?? "";

  // 2) Persona → real-hands-Constraint
  const personaMeta = input.persona
    ? PERSONAS.find((p) => p.value === input.persona)
    : null;
  const handsHint = personaMeta
    ? PERSONA_HANDS[personaMeta.value as PersonaValue] ?? ""
    : "";

  // 3) Drehort
  const sceneLine = input.scene
    ? `Location: ${input.scene} — verbatim setting, not a generic stock background.`
    : "";

  // 4) QUALITY_SUFFIX (Generate-pipeline-Parität)
  // - mit productImage: natürlich, mit identity-lock-Markern
  // - ohne: identisch zur Generate-no-product-Pfad
  const hasProductImage =
    input.productImageUrl && input.productImageUrl.length > 0;
  const QUALITY_SUFFIX = hasProductImage
    ? "shot on iPhone 15 Pro back camera, natural skin texture with visible pores, candid documentary moment, real-world imperfections, available light only, slight handheld motion, photorealistic, realistic shadows on product matching the scene lighting. NEGATIVE: no text overlays, no captions, no watermarks, no studio polish, no commercial advertising look, no plastic perfect surfaces, no overly symmetric composition, no fake bokeh, no airbrush, no stock-photo cliché, no extra product duplicates, no deformed objects, no AI artifacts, no lowres."
    : "shot on iPhone 15 Pro back camera, natural skin texture with visible pores, candid documentary moment, real-world imperfections, available light only, slight handheld motion, photorealistic. NEGATIVE: no text, no captions, no watermarks, no logos, no readable signage, no studio polish, no commercial advertising look, no plastic perfect surfaces, no overly symmetric composition, no fake bokeh, no airbrush, no stock-photo cliché, no deformed objects, no AI artifacts, no lowres.";

  // 5) Finaler Prompt zusammensetzen
  const promptParts = [
    input.prompt.trim(),
    styleSuffix,
    handsHint ? `Include ${handsHint}.` : "",
    sceneLine,
    QUALITY_SUFFIX,
  ].filter((s) => s.length > 0);
  const finalPrompt = promptParts.join("\n");

  const format: ImageFormat = input.format;

  const urls: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < input.count; i++) {
    try {
      let bytes: Uint8Array;
      let mediaType: string;

      if (hasProductImage) {
        // Multi-Image-Edit-Pfad mit Identity-Lock + Gebinde-Skala
        const result = await generateSceneWithProduct(
          finalPrompt,
          input.productImageUrl!,
          input.gebinde || undefined,
        );
        if (!result.ok) {
          errors.push(result.error);
          continue;
        }
        bytes = result.bytes;
        mediaType = result.mediaType;
      } else {
        // Klassischer Text-zu-Bild-Pfad
        const img = await generateOneImage({ prompt: finalPrompt, format });
        bytes = img.bytes;
        mediaType = img.mediaType;
      }

      const ext = inferExt(mediaType);
      const path = `${user.id}/standalone/${Date.now()}_${i}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, {
          contentType: mediaType,
          upsert: false,
          cacheControl: "3600",
        });
      if (upErr) {
        errors.push(upErr.message);
        continue;
      }
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      urls.push(url);

      await supabase.from("gallery_assets").insert({
        user_id: user.id,
        url,
        source: "ai",
        prompt: finalPrompt,
        format,
        provider: "gemini",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bild-Fehler.";
      errors.push(classifyImageError(msg));
    }
  }

  revalidatePath("/dashboard/gallery");

  if (urls.length === 0) {
    return {
      ok: false,
      error: errors.join(" / ") || "Generierung fehlgeschlagen.",
    };
  }
  return {
    ok: true,
    urls,
    error: errors.length > 0
      ? `Teilweise erfolgreich: ${errors.join(" / ")}`
      : undefined,
  };
}
