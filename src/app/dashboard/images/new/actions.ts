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
import { IMAGE_STYLES } from "../../generate/schema";

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
});

export async function generateStandaloneImages(
  _prev: StandaloneImageState,
  formData: FormData,
): Promise<StandaloneImageState> {
  const parsed = inputSchema.safeParse({
    prompt: formData.get("prompt"),
    format: formData.get("format"),
    count: formData.get("count"),
    style: formData.get("style"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
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

  // Style-Suffix anhängen
  const style = IMAGE_STYLES.find((s) => s.value === input.style);
  const finalPrompt = style?.promptSuffix
    ? `${input.prompt.trim()} — ${style.promptSuffix}`
    : input.prompt.trim();

  const format: ImageFormat = input.format;

  const urls: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < input.count; i++) {
    try {
      const img = await generateOneImage({ prompt: finalPrompt, format });
      const ext = inferExt(img.mediaType);
      const path = `${user.id}/standalone/${Date.now()}_${i}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, img.bytes, {
          contentType: img.mediaType,
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
        width: img.width,
        height: img.height,
        provider: "gemini",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bild-Fehler.";
      errors.push(classifyImageError(msg));
    }
  }

  revalidatePath("/dashboard/gallery");

  if (urls.length === 0) {
    return { ok: false, error: errors.join(" / ") || "Generierung fehlgeschlagen." };
  }
  return {
    ok: true,
    urls,
    error: errors.length > 0 ? `Teilweise erfolgreich: ${errors.join(" / ")}` : undefined,
  };
}
