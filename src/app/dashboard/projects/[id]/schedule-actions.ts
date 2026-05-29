"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
// Konstanten + Types liegen in schedule-constants.ts, weil "use server"
// nur async Funktionen + Types als Exporte erlaubt.

export type ScheduleState = {
  ok: boolean;
  error?: string;
  renderId?: string;
};

const planInputSchema = z.object({
  renderId: z.string().uuid(),
  scheduledAt: z.string().optional().or(z.literal("")),
  postStatus: z
    .enum(["draft","review","approved","scheduled","live","paused","archived"])
    .optional(),
  targetPlatform: z.string().max(40).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
  creativeId: z.string().uuid().optional().or(z.literal("")),
});

export async function updateRenderPlan(
  _prev: ScheduleState,
  formData: FormData,
): Promise<ScheduleState> {
  const parsed = planInputSchema.safeParse({
    renderId: formData.get("renderId"),
    scheduledAt: formData.get("scheduledAt") ?? "",
    postStatus: formData.get("postStatus") || undefined,
    targetPlatform: formData.get("targetPlatform") ?? "",
    notes: formData.get("notes") ?? "",
    creativeId: formData.get("creativeId") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: "Ungültige Eingabe." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const { renderId, scheduledAt, postStatus, targetPlatform, notes, creativeId } =
    parsed.data;

  // Datum normalisieren: leerer String → NULL, sonst zu ISO.
  let scheduledIso: string | null = null;
  if (scheduledAt && scheduledAt.trim().length > 0) {
    const d = new Date(scheduledAt);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, error: "Datum konnte nicht gelesen werden." };
    }
    scheduledIso = d.toISOString();
  }

  // Auto-Logik: wenn scheduledAt gesetzt und Status noch draft/review/approved
  // → automatisch auf "scheduled" hochsetzen. Sonst Status wie übergeben.
  let finalStatus = postStatus;
  if (
    !finalStatus &&
    scheduledIso &&
    scheduledIso.length > 0
  ) {
    finalStatus = "scheduled";
  }

  const patch: Record<string, unknown> = {
    scheduled_at: scheduledIso,
  };
  if (finalStatus) patch.post_status = finalStatus;
  if (targetPlatform !== undefined) {
    patch.target_platform = targetPlatform && targetPlatform.length > 0 ? targetPlatform : null;
  }
  if (notes !== undefined) {
    patch.notes = notes && notes.length > 0 ? notes : null;
  }

  const { error: updErr } = await supabase
    .from("creative_renders")
    .update(patch)
    .eq("id", renderId)
    .eq("user_id", user.id);

  if (updErr) {
    return { ok: false, error: `Update fehlgeschlagen: ${updErr.message}` };
  }

  if (creativeId) revalidatePath(`/dashboard/library/${creativeId}`);
  return { ok: true, renderId };
}

// Schnell-Aktion: nur Status ändern (z. B. Card-Klick „Genehmigen")
const statusOnlySchema = z.object({
  renderId: z.string().uuid(),
  postStatus: z.enum([
    "draft","review","approved","scheduled","live","paused","archived",
  ]),
});

export async function updateRenderStatus(
  _prev: ScheduleState,
  formData: FormData,
): Promise<ScheduleState> {
  const parsed = statusOnlySchema.safeParse({
    renderId: formData.get("renderId"),
    postStatus: formData.get("postStatus"),
  });
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const { error } = await supabase
    .from("creative_renders")
    .update({ post_status: parsed.data.postStatus })
    .eq("id", parsed.data.renderId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, renderId: parsed.data.renderId };
}
