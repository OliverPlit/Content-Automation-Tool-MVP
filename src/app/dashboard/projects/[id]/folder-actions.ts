"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type FolderActionState = {
  ok: boolean;
  error?: string;
  folderId?: string;
};

const createSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(100).trim(),
  color: z.string().max(20).optional().or(z.literal("")),
  description: z.string().max(500).optional().or(z.literal("")),
});

export async function createFolder(
  _prev: FolderActionState,
  formData: FormData,
): Promise<FolderActionState> {
  const parsed = createSchema.safeParse({
    projectId: formData.get("projectId"),
    name: formData.get("name"),
    color: formData.get("color") ?? "",
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: "Name oder Projekt-ID ungültig." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  // Position = nächste freie (Count im selben Projekt)
  const { count } = await supabase
    .from("project_folders")
    .select("id", { count: "exact", head: true })
    .eq("project_id", parsed.data.projectId);

  const { data: row, error } = await supabase
    .from("project_folders")
    .insert({
      user_id: user.id,
      project_id: parsed.data.projectId,
      name: parsed.data.name,
      color: parsed.data.color || null,
      description: parsed.data.description || null,
      position: count ?? 0,
    })
    .select("id")
    .single();

  if (error || !row) {
    return { ok: false, error: `DB-Fehler: ${error?.message ?? "unbekannt"}` };
  }

  revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
  return { ok: true, folderId: row.id };
}

const renameSchema = z.object({
  folderId: z.string().uuid(),
  name: z.string().min(1).max(100).trim(),
  projectId: z.string().uuid(),
});

export async function renameFolder(
  _prev: FolderActionState,
  formData: FormData,
): Promise<FolderActionState> {
  const parsed = renameSchema.safeParse({
    folderId: formData.get("folderId"),
    name: formData.get("name"),
    projectId: formData.get("projectId"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Name leer oder ID ungültig." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const { error } = await supabase
    .from("project_folders")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.folderId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
  return { ok: true, folderId: parsed.data.folderId };
}

const deleteSchema = z.object({
  folderId: z.string().uuid(),
  projectId: z.string().uuid(),
});

export async function deleteFolder(formData: FormData): Promise<void> {
  const parsed = deleteSchema.safeParse({
    folderId: formData.get("folderId"),
    projectId: formData.get("projectId"),
  });
  if (!parsed.success) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Delete: Creatives.folder_id wird durch FK „on delete set null" auf NULL
  await supabase
    .from("project_folders")
    .delete()
    .eq("id", parsed.data.folderId)
    .eq("user_id", user.id);

  revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
}

// ---------------------------------------------------------------------------
// updateFolderBrand — Brand-Farben + Font pro Folder setzen.
// Felder optional: leer-Strings werden als NULL geschrieben (= Template-Default).
// ---------------------------------------------------------------------------
const brandSchema = z.object({
  folderId: z.string().uuid(),
  projectId: z.string().uuid(),
  primaryColor: z.string().max(30).optional().or(z.literal("")),
  accentColor: z.string().max(30).optional().or(z.literal("")),
  backgroundColor: z.string().max(30).optional().or(z.literal("")),
  textColor: z.string().max(30).optional().or(z.literal("")),
  fontFamily: z.string().max(60).optional().or(z.literal("")),
  fontWeight: z.string().max(10).optional().or(z.literal("")),
});

export async function updateFolderBrand(
  _prev: FolderActionState,
  formData: FormData,
): Promise<FolderActionState> {
  const parsed = brandSchema.safeParse({
    folderId: formData.get("folderId"),
    projectId: formData.get("projectId"),
    primaryColor: formData.get("primaryColor") ?? "",
    accentColor: formData.get("accentColor") ?? "",
    backgroundColor: formData.get("backgroundColor") ?? "",
    textColor: formData.get("textColor") ?? "",
    fontFamily: formData.get("fontFamily") ?? "",
    fontWeight: formData.get("fontWeight") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: "Ungültige Brand-Eingabe." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const toNull = (v: string | undefined) =>
    v && v.length > 0 ? v.trim() : null;

  const { error } = await supabase
    .from("project_folders")
    .update({
      brand_primary_color: toNull(parsed.data.primaryColor),
      brand_accent_color: toNull(parsed.data.accentColor),
      brand_background_color: toNull(parsed.data.backgroundColor),
      brand_text_color: toNull(parsed.data.textColor),
      brand_font_family: toNull(parsed.data.fontFamily),
      brand_font_weight: toNull(parsed.data.fontWeight),
    })
    .eq("id", parsed.data.folderId)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
  return { ok: true, folderId: parsed.data.folderId };
}

// ---------------------------------------------------------------------------
// moveCreative — Creative einem (anderen) Folder zuordnen.
// folderId = "" → kein Folder (bleibt im Projekt, aber unkategorisiert).
// projectId optional → wenn gesetzt, wird auch das Projekt umgehängt.
// ---------------------------------------------------------------------------
const moveSchema = z.object({
  creativeId: z.string().uuid(),
  folderId: z.string().uuid().optional().or(z.literal("")),
  projectId: z.string().uuid().optional().or(z.literal("")),
  redirectPath: z.string().max(200).optional().or(z.literal("")),
});

export async function moveCreative(
  _prev: FolderActionState,
  formData: FormData,
): Promise<FolderActionState> {
  const parsed = moveSchema.safeParse({
    creativeId: formData.get("creativeId"),
    folderId: formData.get("folderId") ?? "",
    projectId: formData.get("projectId") ?? "",
    redirectPath: formData.get("redirectPath") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: "Ungültige Eingabe." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const patch: Record<string, string | null> = {
    folder_id:
      parsed.data.folderId && parsed.data.folderId.length > 0
        ? parsed.data.folderId
        : null,
  };
  // Optionales Projekt-Move (z. B. wenn User vorher noch unzugeordnet war)
  if (parsed.data.projectId !== undefined) {
    patch.project_id =
      parsed.data.projectId && parsed.data.projectId.length > 0
        ? parsed.data.projectId
        : null;
  }

  const { error } = await supabase
    .from("creatives")
    .update(patch)
    .eq("id", parsed.data.creativeId)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  if (parsed.data.redirectPath) {
    revalidatePath(parsed.data.redirectPath);
  }
  return { ok: true };
}
