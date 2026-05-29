"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  classifyImageError,
  generateOneImage,
  inferExt,
} from "@/lib/ai/images";
import { adCopyLooseSchema } from "../../generate/schema";

const BUCKET = "creative-images";

export type AltState = { ok: boolean; error?: string };

const altInput = z.object({
  creativeId: z.string().uuid(),
  variantIndex: z.coerce.number().int().min(0).max(9),
  count: z.coerce.number().int().min(1).max(4),
});

export async function regenerateImageAlternatives(
  _prev: AltState,
  formData: FormData,
): Promise<AltState> {
  const parsed = altInput.safeParse({
    creativeId: formData.get("creativeId"),
    variantIndex: formData.get("variantIndex"),
    count: formData.get("count") ?? "2",
  });
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };
  const { creativeId, variantIndex, count } = parsed.data;
  // Provider ist fix Gemini.
  const provider = "gemini" as const;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const { data: row } = await supabase
    .from("creatives")
    .select("output")
    .eq("id", creativeId)
    .single();
  if (!row) return { ok: false, error: "Creative nicht gefunden." };

  let imagePrompt = "";
  try {
    const parsedAd = adCopyLooseSchema.safeParse(JSON.parse(row.output ?? ""));
    if (parsedAd.success) imagePrompt = parsedAd.data.imagePrompt ?? "";
  } catch {
    /* ignore */
  }

  // Fallback: aktuellen Variant-Prompt aus creative_images lesen
  if (!imagePrompt) {
    const { data: existing } = await supabase
      .from("creative_images")
      .select("image_prompt")
      .eq("creative_id", creativeId)
      .eq("variant_index", variantIndex)
      .limit(1)
      .maybeSingle();
    imagePrompt = existing?.image_prompt ?? "";
  }

  if (!imagePrompt) {
    return {
      ok: false,
      error: "Kein Bild-Prompt vorhanden. Generiere zuerst ein normales Bild.",
    };
  }

  // Höchsten alt_index ermitteln
  const { data: existingAlts } = await supabase
    .from("creative_images")
    .select("alt_index")
    .eq("creative_id", creativeId)
    .eq("variant_index", variantIndex)
    .order("alt_index", { ascending: false })
    .limit(1);
  const startAlt = (existingAlts?.[0]?.alt_index ?? 0) + 1;

  const errors: string[] = [];
  for (let i = 0; i < count; i++) {
    const altIndex = startAlt + i;
    try {
      const img = await generateOneImage({
        prompt: imagePrompt,
        format: "1:1",
      });
      const ext = inferExt(img.mediaType);
      const path = `${user.id}/${creativeId}/${variantIndex}_alt${altIndex}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, img.bytes, {
          contentType: img.mediaType,
          upsert: true,
          cacheControl: "0",
        });
      if (upErr) {
        errors.push(upErr.message);
        continue;
      }
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      await supabase.from("creative_images").insert({
        user_id: user.id,
        creative_id: creativeId,
        variant_index: variantIndex,
        alt_index: altIndex,
        is_active: false,
        image_url: url,
        image_prompt: imagePrompt,
        provider,
      });
      await supabase.from("gallery_assets").insert({
        user_id: user.id,
        url,
        source: "creative",
        prompt: imagePrompt,
        format: "1:1",
        width: img.width,
        height: img.height,
        creative_id: creativeId,
        variant_index: variantIndex,
        provider,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bild-Fehler.";
      errors.push(classifyImageError(msg));
    }
  }

  revalidatePath(`/dashboard/library/${creativeId}`);
  if (errors.length === count) {
    return { ok: false, error: errors.join(" / ") };
  }
  return { ok: true };
}

export async function setActiveImageAlternative(
  _prev: AltState,
  formData: FormData,
): Promise<AltState> {
  const imageId = String(formData.get("imageId") ?? "");
  const creativeId = String(formData.get("creativeId") ?? "");
  const variantIndex = Number(formData.get("variantIndex"));
  if (!imageId || !creativeId || !Number.isInteger(variantIndex)) {
    return { ok: false, error: "Ungültige Eingabe." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  // 1) Alle Alternativen dieser Variante deaktivieren
  const { error: e1 } = await supabase
    .from("creative_images")
    .update({ is_active: false })
    .eq("creative_id", creativeId)
    .eq("variant_index", variantIndex)
    .eq("user_id", user.id);
  if (e1) return { ok: false, error: e1.message };

  // 2) Die gewählte aktivieren
  const { error: e2 } = await supabase
    .from("creative_images")
    .update({ is_active: true })
    .eq("id", imageId)
    .eq("user_id", user.id);
  if (e2) return { ok: false, error: e2.message };

  revalidatePath(`/dashboard/library/${creativeId}`);
  return { ok: true };
}
