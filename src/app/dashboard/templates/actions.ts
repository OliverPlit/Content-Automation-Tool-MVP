"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  promptTemplateDataSchema,
  type PromptTemplateData,
} from "../generate/schema";

export type TemplateActionState = {
  ok: boolean;
  error?: string;
  message?: string;
  createdId?: string;
};

const baseSchema = z.object({
  name: z.string().trim().min(2, "Mind. 2 Zeichen").max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

const createSchema = baseSchema;
const updateSchema = baseSchema.extend({
  id: z.string().uuid(),
});

function parseDataFromForm(formData: FormData) {
  // Übernimmt Generate-Form-Felder, die mitsenden — alle optional.
  const raw = {
    product: formData.get("data_product") ?? "",
    audience: formData.get("data_audience") ?? "",
    tone: formData.get("data_tone") ?? undefined,
    machine: formData.get("data_machine") ?? "",
    angle: formData.get("data_angle") ?? "",
    variantCount: formData.get("data_variantCount") ?? undefined,
    imageStyle: formData.get("data_imageStyle") ?? "",
  };
  // Leere Strings rauswerfen, sonst zod meckert bei .enum()-Feldern
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === "" || v === undefined || v === null) continue;
    cleaned[k] = v;
  }
  const parsed = promptTemplateDataSchema.safeParse(cleaned);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// createTemplate
// ---------------------------------------------------------------------------
export async function createTemplate(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
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

  const data = parseDataFromForm(formData) ?? {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const { data: row, error } = await supabase
    .from("templates")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      prompt_template: "", // Legacy-Feld, bleibt leer
      template_data: data,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `DB-Fehler: ${error.message}` };

  revalidatePath("/dashboard/settings/templates");
  revalidatePath("/dashboard/templates");
  revalidatePath("/dashboard");
  return { ok: true, message: "Vorlage angelegt.", createdId: row.id };
}

// ---------------------------------------------------------------------------
// saveGenerateTemplate — speichert den AKTUELLEN Generate-Form-Zustand als
// Vorlage. Wird direkt (nicht via useActionState) aus dem Generate-Form
// aufgerufen, damit der „Als Vorlage speichern"-Klick NICHT den Generate-
// Submit auslöst. Erwartet:
//   - name:         Anzeigename der Vorlage
//   - templateData: JSON-String der PromptTemplateData (im Client gebaut)
// ---------------------------------------------------------------------------
export async function saveGenerateTemplate(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; id?: string; name?: string }> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) {
    return { ok: false, error: "Name muss mind. 2 Zeichen haben." };
  }
  if (name.length > 120) {
    return { ok: false, error: "Name zu lang (max. 120 Zeichen)." };
  }

  // templateData defensiv parsen — kaputtes JSON ⇒ leere Vorlage statt Crash.
  let data: PromptTemplateData = {};
  const raw = formData.get("templateData");
  if (typeof raw === "string" && raw.trim().length > 0) {
    try {
      const parsed = promptTemplateDataSchema.safeParse(JSON.parse(raw));
      if (parsed.success) data = parsed.data;
    } catch {
      // ignorieren — Vorlage wird trotzdem mit Name (leeres Daten-Set) angelegt
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const { data: row, error } = await supabase
    .from("templates")
    .insert({
      user_id: user.id,
      name,
      description: null,
      prompt_template: "", // Legacy-Feld, bleibt leer
      template_data: data,
    })
    .select("id, name")
    .single();
  if (error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("template_data") &&
      (msg.includes("does not exist") || msg.includes("schema cache"))
    ) {
      return {
        ok: false,
        error:
          "Migration fehlt — bitte im Supabase SQL Editor ausführen: " +
          "alter table public.templates add column if not exists template_data jsonb;",
      };
    }
    return { ok: false, error: `DB-Fehler: ${error.message}` };
  }

  revalidatePath("/dashboard/settings/templates");
  revalidatePath("/dashboard/templates");
  revalidatePath("/dashboard");
  return { ok: true, id: row.id, name: row.name };
}

// ---------------------------------------------------------------------------
// updateTemplate
// ---------------------------------------------------------------------------
export async function updateTemplate(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
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

  const data = parseDataFromForm(formData) ?? {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const { error } = await supabase
    .from("templates")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      template_data: data,
    })
    .eq("id", parsed.data.id);
  if (error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("template_data") &&
      (msg.includes("does not exist") || msg.includes("schema cache"))
    ) {
      return {
        ok: false,
        error:
          "Migration fehlt — bitte im Supabase SQL Editor ausführen:\n\nalter table public.templates add column if not exists template_data jsonb;",
      };
    }
    return { ok: false, error: `DB-Fehler: ${error.message}` };
  }

  revalidatePath("/dashboard/settings/templates");
  revalidatePath("/dashboard/templates");
  return { ok: true, message: "Vorlage aktualisiert." };
}

// ---------------------------------------------------------------------------
// deleteAllTemplates — löscht ALLE eigenen Vorlagen des aktuellen Users.
// RLS erlaubt nur das Löschen eigener Zeilen (user_id = auth.uid()); System-
// Vorlagen (user_id = null) bleiben unberührt. Wird direkt aus dem Client
// aufgerufen (nicht via useActionState) und liefert eine Zähl-Rückmeldung.
// ---------------------------------------------------------------------------
export async function deleteAllTemplates(): Promise<{
  ok: boolean;
  error?: string;
  deleted?: number;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const { data, error } = await supabase
    .from("templates")
    .delete()
    .eq("user_id", user.id)
    .select("id");
  if (error) return { ok: false, error: `DB-Fehler: ${error.message}` };

  revalidatePath("/dashboard/settings/templates");
  revalidatePath("/dashboard/templates");
  revalidatePath("/dashboard");
  return { ok: true, deleted: data?.length ?? 0 };
}

// ---------------------------------------------------------------------------
// deleteTemplate
// ---------------------------------------------------------------------------
export async function deleteTemplate(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("templates").delete().eq("id", id);
  revalidatePath("/dashboard/settings/templates");
  revalidatePath("/dashboard/templates");
  revalidatePath("/dashboard");
  redirect("/dashboard/settings/templates");
}
