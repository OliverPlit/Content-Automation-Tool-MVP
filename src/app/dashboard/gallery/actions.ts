"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type GalleryActionState = { ok: boolean; error?: string };

export async function deleteGalleryAsset(
  _prev: GalleryActionState,
  formData: FormData,
): Promise<GalleryActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Keine ID übergeben." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const { error } = await supabase
    .from("gallery_assets")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/gallery");
  return { ok: true };
}

export async function updateGalleryAssetTags(
  _prev: GalleryActionState,
  formData: FormData,
): Promise<GalleryActionState> {
  const id = String(formData.get("id") ?? "");
  const tagsRaw = String(formData.get("tags") ?? "");
  if (!id) return { ok: false, error: "Keine ID übergeben." };

  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const { error } = await supabase
    .from("gallery_assets")
    .update({ tags })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/gallery");
  return { ok: true };
}
