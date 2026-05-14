"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { adCopySchema } from "../generate/schema";

export type UpdateState = {
  ok: boolean;
  error?: string;
  message?: string;
};

// Bewusst etwas großzügigere Limits als adCopySchema, damit auch Legacy-Rows
// editiert werden können (vor dem MACHINES/ANGLES-Refactor waren die Felder
// länger). Beim Schreiben validiert writeAdCopy mit dem aktuellen Schema.
const updateAllSchema = z.object({
  id: z.string().uuid(),
  headline: z.string().min(1).max(120),
  subline: z.string().min(1).max(200),
  variants: z.array(
    z.object({
      body: z.string().min(1).max(600),
      cta: z.string().min(1).max(60),
    }),
  ).min(1).max(10),
});

const headerSchema = z.object({
  id: z.string().uuid(),
  headline: z.string().min(1).max(120),
  subline: z.string().min(1).max(200),
});

const variantSchema = z.object({
  id: z.string().uuid(),
  variantIndex: z.number().int().min(0).max(9),
  body: z.string().min(1).max(600),
  cta: z.string().min(1).max(60),
});

async function loadAdCopy(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data, error } = await supabase
    .from("creatives")
    .select("output")
    .eq("id", id)
    .single();
  if (error || !data) return { ok: false as const, error: "Creative nicht gefunden." };
  try {
    const parsed = adCopySchema.safeParse(JSON.parse(data.output ?? ""));
    if (!parsed.success)
      return { ok: false as const, error: "Bestehender Output hat falsches Format." };
    return { ok: true as const, output: parsed.data };
  } catch {
    return { ok: false as const, error: "Bestehender Output konnte nicht geparst werden." };
  }
}

async function writeAdCopy(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  output: z.infer<typeof adCopySchema>,
) {
  const safe = adCopySchema.safeParse(output);
  if (!safe.success) return { ok: false as const, error: "Neuer Output entspricht nicht dem Schema." };
  const { error } = await supabase
    .from("creatives")
    .update({ output: JSON.stringify(safe.data) })
    .eq("id", id);
  if (error) return { ok: false as const, error: `DB-Fehler: ${error.message}` };
  revalidatePath("/dashboard/library");
  revalidatePath(`/dashboard/library/${id}`);
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// updateCreative — kompletter Roundtrip (Legacy, falls jemand alles auf einmal speichern will)
// ---------------------------------------------------------------------------
export async function updateCreative(
  _prev: UpdateState,
  formData: FormData,
): Promise<UpdateState> {
  const id = formData.get("id");
  const headline = formData.get("headline");
  const subline = formData.get("subline");
  const variants: { body: string; cta: string }[] = [];
  for (let i = 0; i < 5; i++) {
    variants.push({
      body: String(formData.get(`variant_${i}_body`) ?? ""),
      cta: String(formData.get(`variant_${i}_cta`) ?? ""),
    });
  }
  const parsed = updateAllSchema.safeParse({ id, headline, subline, variants });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "Eingaben unvollständig oder zu lang. " +
        parsed.error.issues.slice(0, 2).map((i) => i.message).join("; "),
    };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const { id: cid, ...output } = parsed.data;
  // Bestehenden Output laden, um imagePrompt nicht zu verlieren.
  const current = await loadAdCopy(supabase, cid);
  if (!current.ok) return { ok: false, error: current.error };

  const result = await writeAdCopy(supabase, cid, {
    ...current.output,
    headline: output.headline,
    subline: output.subline,
    variants: output.variants,
  });
  return result.ok
    ? { ok: true, message: "Änderungen gespeichert." }
    : { ok: false, error: result.error };
}

// ---------------------------------------------------------------------------
// updateHeader — speichert nur Headline + Subline
// ---------------------------------------------------------------------------
export async function updateHeader(
  _prev: UpdateState,
  formData: FormData,
): Promise<UpdateState> {
  const parsed = headerSchema.safeParse({
    id: formData.get("id"),
    headline: formData.get("headline"),
    subline: formData.get("subline"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "Headline/Subline ungültig. " +
        parsed.error.issues.slice(0, 2).map((i) => i.message).join("; "),
    };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const current = await loadAdCopy(supabase, parsed.data.id);
  if (!current.ok) return { ok: false, error: current.error };

  const result = await writeAdCopy(supabase, parsed.data.id, {
    ...current.output,
    headline: parsed.data.headline,
    subline: parsed.data.subline,
  });
  return result.ok
    ? { ok: true, message: "Headline & Subline gespeichert." }
    : { ok: false, error: result.error };
}

// ---------------------------------------------------------------------------
// updateVariant — speichert nur eine Variante (Body + CTA)
// ---------------------------------------------------------------------------
export async function updateVariant(
  _prev: UpdateState,
  formData: FormData,
): Promise<UpdateState> {
  const parsed = variantSchema.safeParse({
    id: formData.get("id"),
    variantIndex: Number(formData.get("variantIndex")),
    body: formData.get("body"),
    cta: formData.get("cta"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "Varianten-Daten ungültig. " +
        parsed.error.issues.slice(0, 2).map((i) => i.message).join("; "),
    };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const current = await loadAdCopy(supabase, parsed.data.id);
  if (!current.ok) return { ok: false, error: current.error };

  const variants = current.output.variants.map((v, i) =>
    i === parsed.data.variantIndex
      ? { body: parsed.data.body, cta: parsed.data.cta }
      : v,
  );

  const result = await writeAdCopy(supabase, parsed.data.id, {
    ...current.output,
    variants,
  });
  return result.ok
    ? { ok: true, message: `Variante ${parsed.data.variantIndex + 1} gespeichert.` }
    : { ok: false, error: result.error };
}

// ---------------------------------------------------------------------------
// deleteCreative — kompletter Eintrag löschen
// ---------------------------------------------------------------------------
export async function deleteCreative(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("creatives").delete().eq("id", id);
  revalidatePath("/dashboard/library");
  redirect("/dashboard/library");
}
