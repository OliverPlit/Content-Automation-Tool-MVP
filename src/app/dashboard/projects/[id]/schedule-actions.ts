"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
// Konstanten + Types liegen in schedule-constants.ts, weil "use server"
// nur async Funktionen + Types als Exporte erlaubt.
import type { PostStatus } from "./schedule-constants";

export type ScheduleState = {
  ok: boolean;
  error?: string;
  renderId?: string;
  // Echo der gesetzten Werte → der Client kann den Render-State optimistisch
  // patchen, ohne auf einen Server-Refresh zu warten (Turbopack-dev hängt).
  postStatus?: PostStatus;
  scheduledAt?: string | null;
  targetPlatform?: string | null;
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
  return {
    ok: true,
    renderId,
    postStatus: finalStatus,
    scheduledAt: scheduledIso,
    targetPlatform:
      targetPlatform && targetPlatform.length > 0 ? targetPlatform : null,
  };
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
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `Ungültige Eingabe (${issues}).` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  // .select() anhängen, damit wir die TATSÄCHLICH geänderten Zeilen sehen.
  // Ohne select liefert ein Update auf 0 Treffer (z. B. user_id-Mismatch oder
  // RLS) trotzdem error=null → der Client glaubt fälschlich an Erfolg, und
  // beim nächsten echten Reload springt der Status zurück. Genau dieses
  // „Approve tut nichts" wollen wir aufdecken.
  const { data: updated, error } = await supabase
    .from("creative_renders")
    .update({ post_status: parsed.data.postStatus })
    .eq("id", parsed.data.renderId)
    .eq("user_id", user.id)
    .select("id, post_status");

  if (error) {
    // Häufigster versteckter Grund: PostgREST-Schema-Cache kennt post_status
    // (noch) nicht. Klartext geben statt nackter PG-Meldung.
    const hint = /post_status|schema cache/i.test(error.message)
      ? " — Die Spalte post_status fehlt im PostgREST-Schema-Cache. " +
        "Migration 20260530_000001_renders_scheduling.sql anwenden und in " +
        "Supabase SQL ausführen: NOTIFY pgrst, 'reload schema';"
      : "";
    console.error(`[updateRenderStatus] DB-ERROR:`, error);
    return { ok: false, error: `Status-Update fehlgeschlagen: ${error.message}${hint}` };
  }
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error:
        "Kein passender Render gefunden (gehört evtl. zu einem anderen Konto " +
        "oder wurde gelöscht). Es wurde nichts geändert.",
    };
  }

  return {
    ok: true,
    renderId: parsed.data.renderId,
    postStatus: parsed.data.postStatus,
  };
}
