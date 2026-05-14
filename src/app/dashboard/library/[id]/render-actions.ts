"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { adCopyLooseSchema } from "../../generate/schema";
import { TEMPLATE_META, getTemplateId } from "@/lib/creatomate/templates";

const CREATOMATE_API_BASE = "https://api.creatomate.com/v1";
const ACCENT_COLOR_DEFAULT = "#4F46E5"; // Indigo-600, passt zum übrigen UI

export type RenderState = {
  ok: boolean;
  error?: string;
  renderId?: string; // ID des DB-Eintrags (creative_renders.id), nicht der Creatomate-ID
};

export type PollResult = {
  status: "pending" | "processing" | "succeeded" | "failed" | "missing";
  outputUrl?: string | null;
  errorMessage?: string | null;
};

export type RenderRecord = {
  id: string;
  variantIndex: number;
  templateKind: "staticSquare" | "animatedSquare" | "reelVertical";
  status: "pending" | "processing" | "succeeded" | "failed";
  outputUrl: string | null;
  errorMessage: string | null;
};

const templateKindSchema = z.enum([
  "staticSquare",
  "animatedSquare",
  "reelVertical",
]);

// ---------------------------------------------------------------------------
// startRender
// ---------------------------------------------------------------------------
export async function startRender(
  _prev: RenderState,
  formData: FormData,
): Promise<RenderState> {
  const creativeId = String(formData.get("creativeId") ?? "");
  const variantIndexRaw = Number(formData.get("variantIndex"));
  const variantIndex =
    Number.isInteger(variantIndexRaw) &&
    variantIndexRaw >= 0 &&
    variantIndexRaw < 5
      ? variantIndexRaw
      : -1;
  const templateKindParsed = templateKindSchema.safeParse(
    formData.get("templateKind"),
  );

  if (!creativeId) return { ok: false, error: "Creative-ID fehlt." };
  if (variantIndex < 0)
    return { ok: false, error: "Varianten-Index ungültig." };
  if (!templateKindParsed.success)
    return { ok: false, error: "Template-Typ unbekannt." };

  const templateKind = templateKindParsed.data;
  const template = TEMPLATE_META[templateKind];
  const templateId = getTemplateId(templateKind);

  if (!templateId) {
    return {
      ok: false,
      error: `Template-ID für "${template.label}" fehlt — bitte ${template.envVar} in der Env setzen.`,
    };
  }
  if (!process.env.CREATOMATE_API_KEY) {
    return { ok: false, error: "CREATOMATE_API_KEY fehlt in der Env." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  // 1) Lade Creative + Bild der Variante
  const [{ data: creativeRow, error: creativeErr }, { data: imageRow }] =
    await Promise.all([
      supabase
        .from("creatives")
        .select("id, output")
        .eq("id", creativeId)
        .single(),
      supabase
        .from("creative_images")
        .select("image_url")
        .eq("creative_id", creativeId)
        .eq("variant_index", variantIndex)
        .maybeSingle(),
    ]);
  if (creativeErr || !creativeRow)
    return { ok: false, error: "Creative nicht gefunden." };
  if (!imageRow?.image_url) {
    return {
      ok: false,
      error:
        "Für diese Variante existiert noch kein Bild — generiere zuerst ein Bild.",
    };
  }

  let adCopy: z.infer<typeof adCopyLooseSchema>;
  try {
    const parsed = adCopyLooseSchema.safeParse(JSON.parse(creativeRow.output ?? ""));
    if (!parsed.success)
      return { ok: false, error: "Ad-Copy hat ein unerwartetes Format." };
    adCopy = parsed.data;
  } catch {
    return { ok: false, error: "Ad-Copy konnte nicht geparst werden." };
  }
  const variant = adCopy.variants[variantIndex];
  if (!variant) return { ok: false, error: "Variante existiert nicht." };

  // Cache-Buster aus Supabase-URL für Creatomate entfernen, damit der
  // Downloader auf deren Seite den Fetch sauber cached.
  const imageUrlClean = imageRow.image_url.split("?")[0];

  // 2) DB-Eintrag mit Status "processing" (oder upsert, falls erneut gerendert)
  const { data: renderRow, error: insertErr } = await supabase
    .from("creative_renders")
    .insert({
      user_id: user.id,
      creative_id: creativeId,
      variant_index: variantIndex,
      template_kind: templateKind,
      status: "processing",
    })
    .select("id")
    .single();
  if (insertErr || !renderRow) {
    return { ok: false, error: `DB-Insert fehlgeschlagen: ${insertErr?.message ?? "unbekannt"}` };
  }

  // 3) Creatomate-API: Render starten
  // Send each value in BOTH the short form and the explicit `Element.property`
  // form, and across the two naming conventions we've used in templates
  // ("Background"/"Image-URL" for images, "CTA-Box"/"Accent-Color" for the
  // accent box). Creatomate silently ignores keys that don't match a real
  // element/property, so over-sending is safe.
  const body = {
    template_id: templateId,
    modifications: {
      // Text
      "Headline": adCopy.headline,
      "Headline.text": adCopy.headline,
      "Subline": adCopy.subline,
      "Subline.text": adCopy.subline,
      "CTA": variant.cta,
      "CTA.text": variant.cta,
      // Image source
      "Background": imageUrlClean,
      "Background.source": imageUrlClean,
      "Image-URL": imageUrlClean,
      "Image-URL.source": imageUrlClean,
      // Accent color
      "CTA-Box": ACCENT_COLOR_DEFAULT,
      "CTA-Box.fill_color": ACCENT_COLOR_DEFAULT,
      "Accent-Color": ACCENT_COLOR_DEFAULT,
      "Accent-Color.fill_color": ACCENT_COLOR_DEFAULT,
    },
  };

  try {
    const res = await fetch(`${CREATOMATE_API_BASE}/renders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CREATOMATE_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      await markRenderFailed(supabase, renderRow.id, `Creatomate ${res.status}: ${text.slice(0, 300)}`);
      return { ok: false, error: `Creatomate-Fehler ${res.status}: ${text.slice(0, 200)}` };
    }
    const json = (await res.json()) as Array<{ id: string; status: string; url?: string }> | {
      id: string;
      status: string;
      url?: string;
    };
    // API liefert Array, wenn mehrere Renders entstehen (z. B. mehrere Output-Formate).
    const first = Array.isArray(json) ? json[0] : json;
    if (!first?.id) {
      await markRenderFailed(supabase, renderRow.id, "Antwort enthielt keine Render-ID.");
      return { ok: false, error: "Creatomate hat keine Render-ID geliefert." };
    }

    await supabase
      .from("creative_renders")
      .update({
        creatomate_id: first.id,
        status: first.status === "succeeded" ? "succeeded" : "processing",
        output_url: first.url ?? null,
      })
      .eq("id", renderRow.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Netzwerk-Fehler.";
    await markRenderFailed(supabase, renderRow.id, msg);
    return { ok: false, error: `Render-Start fehlgeschlagen: ${msg}` };
  }

  revalidatePath(`/dashboard/library/${creativeId}`);

  return { ok: true, renderId: renderRow.id };
}

async function markRenderFailed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  renderRowId: string,
  message: string,
) {
  await supabase
    .from("creative_renders")
    .update({ status: "failed", error_message: message })
    .eq("id", renderRowId);
}

// ---------------------------------------------------------------------------
// pollRender (vom Client periodisch aufgerufen, solange status processing)
// ---------------------------------------------------------------------------
export async function pollRender(renderRowId: string): Promise<PollResult> {
  if (!renderRowId) return { status: "missing" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "missing" };

  const { data: row } = await supabase
    .from("creative_renders")
    .select("id, status, creatomate_id, output_url, error_message, creative_id")
    .eq("id", renderRowId)
    .single();
  if (!row) return { status: "missing" };

  // Wenn DB schon final → direkt zurück, kein API-Hit.
  if (row.status === "succeeded" || row.status === "failed") {
    return {
      status: row.status as "succeeded" | "failed",
      outputUrl: row.output_url,
      errorMessage: row.error_message,
    };
  }
  if (!row.creatomate_id) {
    return { status: row.status as "pending" | "processing" };
  }
  if (!process.env.CREATOMATE_API_KEY) {
    return { status: "failed", errorMessage: "CREATOMATE_API_KEY fehlt." };
  }

  // Live-Status bei Creatomate holen
  try {
    const res = await fetch(
      `${CREATOMATE_API_BASE}/renders/${row.creatomate_id}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CREATOMATE_API_KEY}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) {
      const text = await res.text();
      return {
        status: "processing",
        errorMessage: `Creatomate ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as {
      status: string;
      url?: string;
      error_message?: string;
    };

    if (data.status === "succeeded") {
      await supabase
        .from("creative_renders")
        .update({ status: "succeeded", output_url: data.url ?? null })
        .eq("id", row.id);
      revalidatePath(`/dashboard/library/${row.creative_id}`);
      return { status: "succeeded", outputUrl: data.url };
    }
    if (data.status === "failed") {
      await supabase
        .from("creative_renders")
        .update({
          status: "failed",
          error_message: data.error_message ?? "Render fehlgeschlagen.",
        })
        .eq("id", row.id);
      revalidatePath(`/dashboard/library/${row.creative_id}`);
      return {
        status: "failed",
        errorMessage: data.error_message ?? "Render fehlgeschlagen.",
      };
    }

    return { status: "processing" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Netzwerk-Fehler.";
    return { status: "processing", errorMessage: msg };
  }
}

// ---------------------------------------------------------------------------
// deleteRender (entfernt DB-Eintrag; das Creatomate-Asset bleibt dort, aber
// wir verlieren den Pointer — bei 50 Free-Credits kein Drama)
// ---------------------------------------------------------------------------
export async function deleteRender(formData: FormData): Promise<void> {
  const renderRowId = String(formData.get("renderId") ?? "");
  const creativeId = String(formData.get("creativeId") ?? "");
  if (!renderRowId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("creative_renders").delete().eq("id", renderRowId);
  revalidatePath(`/dashboard/library/${creativeId}`);
}
