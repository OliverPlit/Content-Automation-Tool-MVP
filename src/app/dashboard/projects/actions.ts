"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type ProjectActionState = {
  ok: boolean;
  error?: string;
  message?: string;
  createdId?: string;
};

const createSchema = z.object({
  name: z.string().trim().min(2, "Mind. 2 Zeichen").max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

const assignSchema = z.object({
  creativeId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
});

// ---------------------------------------------------------------------------
// createProject
// ---------------------------------------------------------------------------
export async function createProject(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `DB-Fehler: ${error.message}` };

  revalidatePath("/dashboard/projects");
  revalidatePath("/dashboard/library");
  revalidatePath("/dashboard");
  return { ok: true, message: "Projekt angelegt.", createdId: data.id };
}

// ---------------------------------------------------------------------------
// updateProject (Name / Description)
// ---------------------------------------------------------------------------
export async function updateProject(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const { error } = await supabase
    .from("projects")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
    })
    .eq("id", parsed.data.id);
  if (error) return { ok: false, error: `DB-Fehler: ${error.message}` };

  revalidatePath("/dashboard/projects");
  revalidatePath(`/dashboard/projects/${parsed.data.id}`);
  return { ok: true, message: "Projekt aktualisiert." };
}

// ---------------------------------------------------------------------------
// deleteProject — default: Creatives behalten (project_id = NULL).
//                 mode="cascade" löscht Creatives mit.
// ---------------------------------------------------------------------------
export async function deleteProject(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const mode = String(formData.get("mode") ?? "keep");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  if (mode === "keep") {
    // Erst Creatives lösen, dann Projekt löschen.
    await supabase
      .from("creatives")
      .update({ project_id: null })
      .eq("project_id", id);
  }
  await supabase.from("projects").delete().eq("id", id);

  revalidatePath("/dashboard/projects");
  revalidatePath("/dashboard/library");
  revalidatePath("/dashboard");
  redirect("/dashboard/projects");
}

// ---------------------------------------------------------------------------
// assignCreativeToProject — Creative <-> Projekt verknüpfen (oder lösen)
// ---------------------------------------------------------------------------
export async function assignCreativeToProject(
  formData: FormData,
): Promise<void> {
  const creativeId = String(formData.get("creativeId") ?? "");
  const projectIdRaw = String(formData.get("projectId") ?? "");
  const folderIdRaw = String(formData.get("folderId") ?? "");
  const projectId = projectIdRaw && projectIdRaw !== "none" ? projectIdRaw : null;
  // Folder nur wenn auch Projekt — ein Folder ohne Projekt macht keinen Sinn.
  const folderId =
    projectId && folderIdRaw && folderIdRaw !== "none" ? folderIdRaw : null;

  const parsed = assignSchema.safeParse({ creativeId, projectId });
  if (!parsed.success) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("creatives")
    .update({
      project_id: parsed.data.projectId,
      folder_id: folderId,
    })
    .eq("id", parsed.data.creativeId);

  revalidatePath("/dashboard/library");
  revalidatePath(`/dashboard/library/${creativeId}`);
  revalidatePath("/dashboard/projects");
  if (parsed.data.projectId)
    revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
}
