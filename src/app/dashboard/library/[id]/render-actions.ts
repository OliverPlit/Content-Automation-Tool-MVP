"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { adCopyLooseSchema } from "../../generate/schema";
import {
  TEMPLATE_META,
  diagnoseSlot,
  findSharedTemplateIds,
  getDefaultSlot,
  getEnvVarsForKind,
  getTemplateBySlot,
  type TemplateKind,
} from "@/lib/creatomate/templates";

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
  templateKind: import("@/lib/creatomate/templates").TemplateKind;
  templateSlot: string | null;
  status: "pending" | "processing" | "succeeded" | "failed";
  outputUrl: string | null;
  errorMessage: string | null;
  // Workflow-Felder (auch in /projects/[id] Plan-Board genutzt)
  postStatus?:
    | "draft"
    | "review"
    | "approved"
    | "scheduled"
    | "live"
    | "paused"
    | "archived";
  scheduledAt?: string | null;
  targetPlatform?: string | null;
  notes?: string | null;
  /** SV-1: null = nicht in Drafts. Timestamp = User hat aktiv „Speichern" geklickt. */
  savedAt?: string | null;
};

export type SaveRenderState = {
  ok: boolean;
  error?: string;
};

// Source of Truth = TEMPLATE_META. Sobald ein neuer Kind dort dazukommt
// (z.B. RF1 → static_1x1, static_4x5, static_16x9, reel_1x1, reel_16x9),
// akzeptiert ihn dieses Schema automatisch. Vorher: hartes Enum mit nur 3
// Kinds → User wählte einen neuen Kind im Dropdown, Server rejected mit
// "Template-Typ unbekannt." und der Render-Insert kam nie an.
const TEMPLATE_KIND_VALUES = Object.keys(TEMPLATE_META) as [
  TemplateKind,
  ...TemplateKind[],
];
const templateKindSchema = z.enum(TEMPLATE_KIND_VALUES);

// ---------------------------------------------------------------------------
// startRender
// ---------------------------------------------------------------------------
// Diagnose-Helper. Schreibt prefixed in den Server-Terminal (npm run dev)
// damit man sofort sieht WO genau es bricht — und gibt das Error-Objekt
// zurück, das die UI dann anzeigt.
const log = (msg: string) => console.log(`[startRender] ${msg}`);
const fail = (reason: string) => {
  console.error(`[startRender] FAIL — ${reason}`);
  return { ok: false as const, error: reason };
};

export async function startRender(
  _prev: RenderState,
  formData: FormData,
): Promise<RenderState> {
  try {
    return await startRenderInner(formData);
  } catch (err) {
    // Unhandled Exceptions sichtbar machen — sonst landen sie als
    // generischer Next-500-Stack in den Server-Logs ohne UI-Feedback.
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[startRender] UNCAUGHT EXCEPTION:`, err);
    return { ok: false, error: `Unerwarteter Fehler: ${msg}` };
  }
}

async function startRenderInner(formData: FormData): Promise<RenderState> {
  const creativeId = String(formData.get("creativeId") ?? "");
  const variantIndexRaw = Number(formData.get("variantIndex"));
  const variantIndex =
    Number.isInteger(variantIndexRaw) &&
    variantIndexRaw >= 0 &&
    variantIndexRaw < 5
      ? variantIndexRaw
      : -1;
  const templateKindRaw = formData.get("templateKind");
  const templateKindParsed = templateKindSchema.safeParse(templateKindRaw);
  const templateSlotInput = String(formData.get("templateSlot") ?? "").trim();

  log(
    `incoming: creativeId=${creativeId.slice(0, 8)} variantIndex=${variantIndex} ` +
      `templateKind=${String(templateKindRaw)} templateSlot=${templateSlotInput || "(empty)"}`,
  );

  if (!creativeId) return fail("Creative-ID fehlt.");
  if (variantIndex < 0)
    return fail(`Varianten-Index ungültig (raw=${variantIndexRaw}).`);
  if (!templateKindParsed.success)
    return fail(
      `Template-Typ unbekannt: "${String(templateKindRaw)}". ` +
        `Erlaubt: ${TEMPLATE_KIND_VALUES.join(", ")}.`,
    );

  const templateKind = templateKindParsed.data;
  const template = TEMPLATE_META[templateKind];

  // Slot bestimmen: explizite User-Wahl > Default des Kinds.
  const slot = templateSlotInput || getDefaultSlot(templateKind);
  log(`resolved slot=${slot ?? "(null)"}`);
  if (!slot) {
    const envVars = getEnvVarsForKind(templateKind);
    return fail(
      `Kein Template für "${template.label}" konfiguriert — keine der ` +
        `Env-Vars ist gesetzt: ${envVars.join(", ")}. ` +
        `Trage in .env.local (und Vercel) eine Creatomate-Template-UUID ein, ` +
        `z.B.: ${envVars[0]}=<UUID aus Creatomate-Dashboard>`,
    );
  }
  const resolved = getTemplateBySlot(slot);
  if (!resolved) {
    const diag = diagnoseSlot(slot);
    return fail(diag.hint);
  }
  if (resolved.kind !== templateKind) {
    return fail(
      `Template-Slot "${slot}" gehört zu Kind "${resolved.kind}", nicht zu "${templateKind}". Wahrscheinlich aus dem falschen Dropdown gewählt.`,
    );
  }
  const templateId = resolved.creatomateId;
  log(`template_id=${templateId.slice(0, 8)}… kind-OK`);

  // Info-Logging: dieselbe UUID in mehreren Env-Vars ist verdächtig, aber
  // OK fürs Testen mit einem einzigen Creatomate-Template. Nur warnen,
  // nicht blockieren.
  const shared = findSharedTemplateIds().find((g) => g.uuid === templateId);
  if (shared && shared.slots.length > 1) {
    const otherEnvVars = shared.slots
      .filter((s) => s.slot !== slot)
      .map((s) => s.envVar);
    console.warn(
      `[startRender] HINWEIS: Diese UUID wird auch von ${shared.slots.length - 1} anderen ` +
        `Env-Vars genutzt (${otherEnvVars.slice(0, 3).join(", ")}${otherEnvVars.length > 3 ? ", …" : ""}). ` +
        `Beim Rendern eines anderen Formats kommt deshalb DASSELBE Bild raus. ` +
        `Für echte Format-Unterschiede pro Format ein eigenes Creatomate-Template anlegen.`,
    );
  }

  if (!process.env.CREATOMATE_API_KEY) {
    return fail("CREATOMATE_API_KEY fehlt in der Env.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Nicht eingeloggt.");

  // 1) Lade Creative + Bild der Variante
  const [{ data: creativeRow, error: creativeErr }, { data: imageRow }] =
    await Promise.all([
      supabase
        .from("creatives")
        .select(
          "id, output, folder_id, brand_primary_color, brand_accent_color, brand_background_color, brand_text_color",
        )
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
    return fail(`Creative nicht gefunden. ${creativeErr?.message ?? ""}`);

  // Brand-Style — drei Quellen mit klarer Priorität:
  //   1. Direkt am Creative gespeichert (aus saveCreative/saveAllVariants,
  //      auch wenn KEIN Folder zugewiesen ist) — höchste Priorität, weil das
  //      die Wahl beim Speichern war.
  //   2. Folder-Brand (project_folders) — falls Creative einem Folder zugehört.
  //   3. Default-Indigo (ACCENT_COLOR_DEFAULT) — wenn nichts gesetzt.
  // Font-Family/Weight gibt es nur am Folder.
  type FolderBrandRow = {
    brand_primary_color: string | null;
    brand_accent_color: string | null;
    brand_background_color: string | null;
    brand_text_color: string | null;
    brand_font_family: string | null;
    brand_font_weight: string | null;
  };
  type CreativeBrand = {
    brand_primary_color: string | null;
    brand_accent_color: string | null;
    brand_background_color: string | null;
    brand_text_color: string | null;
  };
  const creativeBrand = creativeRow as CreativeBrand & { folder_id: string | null };
  let folderBrand: FolderBrandRow | null = null;
  const folderId = creativeBrand.folder_id;
  if (folderId) {
    const { data: folderRow } = await supabase
      .from("project_folders")
      .select(
        "brand_primary_color, brand_accent_color, brand_background_color, brand_text_color, brand_font_family, brand_font_weight",
      )
      .eq("id", folderId)
      .single();
    if (folderRow) folderBrand = folderRow as FolderBrandRow;
  }
  // Gemerged: Creative-Brand gewinnt; sonst Folder-Brand; sonst NULL.
  const brand: FolderBrandRow = {
    brand_primary_color:
      creativeBrand.brand_primary_color ?? folderBrand?.brand_primary_color ?? null,
    brand_accent_color:
      creativeBrand.brand_accent_color ?? folderBrand?.brand_accent_color ?? null,
    brand_background_color:
      creativeBrand.brand_background_color ??
      folderBrand?.brand_background_color ??
      null,
    brand_text_color:
      creativeBrand.brand_text_color ?? folderBrand?.brand_text_color ?? null,
    brand_font_family: folderBrand?.brand_font_family ?? null,
    brand_font_weight: folderBrand?.brand_font_weight ?? null,
  };
  if (!imageRow?.image_url) {
    return fail(
      "Für diese Variante existiert noch kein Bild — generiere zuerst ein Bild.",
    );
  }
  log(`image+adcopy OK — proceed to insert`);

  let adCopy: z.infer<typeof adCopyLooseSchema>;
  try {
    const parsed = adCopyLooseSchema.safeParse(JSON.parse(creativeRow.output ?? ""));
    if (!parsed.success) {
      return fail(
        `Ad-Copy hat ein unerwartetes Format. Zod-Issues: ${parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}=${i.message}`)
          .join("; ")}`,
      );
    }
    adCopy = parsed.data;
  } catch (e) {
    return fail(
      `Ad-Copy JSON-Parse fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const variant = adCopy.variants[variantIndex];
  if (!variant)
    return fail(
      `Variante ${variantIndex} existiert nicht (es gibt nur ${adCopy.variants.length}).`,
    );

  // UV-3 — Per-Variant-Texte mit Fallback auf root.
  // Wenn die Variante eigene headline/subline hat, gewinnen die — sonst
  // nimmt der Render die geteilten (Legacy-Verhalten).
  const renderHeadline =
    (variant as { headline?: string }).headline ?? adCopy.headline;
  const renderSubline =
    (variant as { subline?: string }).subline ?? adCopy.subline;

  // Cache-Buster aus Supabase-URL für Creatomate entfernen, damit der
  // Downloader auf deren Seite den Fetch sauber cached.
  // WICHTIG: Cache-Buster (?v=...) bleibt drin — sonst sieht Creatomate
  // immer dieselbe URL und liefert das alte gecachte Bild aus, auch wenn wir
  // im Supabase-Storage neue Bytes drüber-uploaded haben. Mit Cache-Buster
  // ändert sich die URL bei jedem Upload → Creatomate fetcht frisch.
  const imageUrlClean = imageRow.image_url as string;

  // 2) DB-Eintrag mit Status "processing" (oder upsert, falls erneut gerendert)
  log(
    `inserting creative_renders row: template_kind=${templateKind} template_slot=${slot}`,
  );
  // ACHTUNG: `post_status` wird BEWUSST NICHT explizit gesetzt — der
  // DB-Default ('draft' aus Migration 20260530_000001_renders_scheduling)
  // übernimmt das. Wenn wir es explizit reinpacken, knallt's mit
  // „Could not find the 'post_status' column in schema cache" sobald
  // PostgREST's gecachtes Schema die Migration noch nicht gesehen hat
  // (häufig nach Schema-Änderungen in Supabase).
  const { data: renderRow, error: insertErr } = await supabase
    .from("creative_renders")
    .insert({
      user_id: user.id,
      creative_id: creativeId,
      variant_index: variantIndex,
      template_kind: templateKind,
      template_slot: slot,
      creatomate_template_id: templateId,
      status: "processing",
    })
    .select("id, creative_id")
    .single();
  if (insertErr || !renderRow) {
    // Häufigster Fehler: CHECK-Constraint auf template_kind ist noch alt
    // (nur die 3 ursprünglichen Werte). Migration 20260601 muss laufen.
    const hint =
      insertErr?.message?.includes("template_kind") ||
      insertErr?.message?.includes("check constraint")
        ? ` — HINWEIS: das ist die alte CHECK-Constraint. ` +
          `Lass die Migration 20260601_000001_renders_kinds_expand.sql laufen.`
        : "";
    return fail(`DB-Insert fehlgeschlagen: ${insertErr?.message ?? "unbekannt"}${hint}`);
  }
  log(`insert OK — renderRow.id=${renderRow.id}, calling Creatomate next`);

  // 3) Creatomate-API: Render starten
  // Send each value in BOTH the short form and the explicit `Element.property`
  // form, and across the two naming conventions we've used in templates
  // ("Background"/"Image-URL" for images, "CTA-Box"/"Accent-Color" for the
  // accent box). Creatomate silently ignores keys that don't match a real
  // element/property, so over-sending is safe.
  //
  // Brand-Werte: wenn im Folder gesetzt, überschreiben sie die Defaults.
  // Sonst Template-Default (kein Send).
  const primaryColor = brand?.brand_primary_color ?? ACCENT_COLOR_DEFAULT;
  const accentColor = brand?.brand_accent_color ?? primaryColor;
  const bgColor = brand?.brand_background_color ?? null;
  const textColor = brand?.brand_text_color ?? null;
  const fontFamily = brand?.brand_font_family ?? null;
  const fontWeight = brand?.brand_font_weight ?? null;

  const modifications: Record<string, string> = {
    // Text (UV-3: per-variant Werte mit Fallback)
    Headline: renderHeadline,
    "Headline.text": renderHeadline,
    Subline: renderSubline,
    "Subline.text": renderSubline,
    CTA: variant.cta,
    "CTA.text": variant.cta,
    // Background image
    Background: imageUrlClean,
    "Background.source": imageUrlClean,
    "Image-URL": imageUrlClean,
    "Image-URL.source": imageUrlClean,
    // Primary/Accent (CTA-Box-Hintergrund + Akzent-Shape)
    "CTA-Box": primaryColor,
    "CTA-Box.fill_color": primaryColor,
    "Primary-Color": primaryColor,
    "Primary-Color.fill_color": primaryColor,
    "Accent-Color": accentColor,
    "Accent-Color.fill_color": accentColor,
  };

  // Brand-Text-Color (Headline + Subline)
  if (textColor) {
    modifications["Headline.fill_color"] = textColor;
    modifications["Subline.fill_color"] = textColor;
    modifications["Text-Color"] = textColor;
    modifications["Text-Color.fill_color"] = textColor;
  }
  // Brand-CTA-Text-Color (kontrastiert auf Button-BG)
  if (textColor) {
    modifications["CTA.fill_color"] = textColor;
  }

  // Brand-Background-Color (komplett-Hintergrund / „fill_color" des Canvas)
  if (bgColor) {
    modifications["Background-Color"] = bgColor;
    modifications["Background-Color.fill_color"] = bgColor;
    modifications["Canvas.fill_color"] = bgColor;
  }

  // Brand-Font: auf alle Text-Elemente anwenden
  if (fontFamily) {
    modifications["Headline.font_family"] = fontFamily;
    modifications["Subline.font_family"] = fontFamily;
    modifications["CTA.font_family"] = fontFamily;
    modifications["Body.font_family"] = fontFamily;
    modifications["Font-Family"] = fontFamily;
  }
  if (fontWeight) {
    modifications["Headline.font_weight"] = fontWeight;
    modifications["CTA.font_weight"] = fontWeight;
    modifications["Font-Weight"] = fontWeight;
  }

  // Kein separates Produktbild-Overlay mehr: Das Produkt ist bereits in das
  // KI-generierte Background-Bild komponiert. Ein zweites „ProductImage"-Element
  // würde das Produkt doppelt zeigen — daher bewusst nicht mehr gesendet.

  const body = { template_id: templateId, modifications };

  try {
    log(`POST → ${CREATOMATE_API_BASE}/renders (template=${templateId.slice(0, 8)}…)`);
    const res = await fetch(`${CREATOMATE_API_BASE}/renders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CREATOMATE_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    log(`Creatomate response HTTP ${res.status}`);
    if (!res.ok) {
      const text = await res.text();
      await markRenderFailed(supabase, renderRow.id, `Creatomate ${res.status}: ${text.slice(0, 300)}`);
      return fail(`Creatomate-Fehler ${res.status}: ${text.slice(0, 200)}`);
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
      return fail("Creatomate hat keine Render-ID geliefert.");
    }

    log(`Creatomate accepted: creatomate_id=${first.id}, status=${first.status}`);

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
    return fail(`Render-Start fehlgeschlagen: ${msg}`);
  }

  revalidatePath(`/dashboard/library/${creativeId}`);
  log(`done. renderRow.id=${renderRow.id}`);
  return { ok: true, renderId: renderRow.id };
}

/**
 * Sucht die project_id des Creatives + revalidated die zugehörige
 * Projekt-Seite (Posts-Kanban). So sieht der User frische Renders sofort
 * in den Drafts-Spalten, ohne F5.
 *
 * NUR die spezifische Projekt-Seite revalidaten — NICHT zusätzlich
 * `/dashboard/projects`, weil das den Turbopack-Worker in Dev unter Last
 * setzt ("Jest worker exceptions exceeding retry limit").
 */
async function revalidateProjectForCreative(
  supabase: Awaited<ReturnType<typeof createClient>>,
  creativeId: string,
) {
  const { data: row } = await supabase
    .from("creatives")
    .select("project_id")
    .eq("id", creativeId)
    .maybeSingle();
  const pid = (row as { project_id: string | null } | null)?.project_id;
  if (pid) revalidatePath(`/dashboard/projects/${pid}`);
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
// startBulkRender — feuert alle 3 Templates (oder optional: alle Varianten ×
// alle Templates) PARALLEL zu Creatomate. Erspart das einzelne Klicken.
// ---------------------------------------------------------------------------
export type BulkRenderState = {
  ok: boolean;
  error?: string;
  startedCount?: number;
  failedCount?: number;
  errors?: string[];
};

export async function startBulkRender(
  _prev: BulkRenderState,
  formData: FormData,
): Promise<BulkRenderState> {
  const creativeId = String(formData.get("creativeId") ?? "");
  const scope = String(formData.get("scope") ?? "variant"); // "variant" | "all"
  const variantIndexRaw = Number(formData.get("variantIndex"));
  const targetVariantIndex =
    Number.isInteger(variantIndexRaw) &&
    variantIndexRaw >= 0 &&
    variantIndexRaw < 10
      ? variantIndexRaw
      : -1;

  if (!creativeId) return { ok: false, error: "Creative-ID fehlt." };
  if (scope === "variant" && targetVariantIndex < 0) {
    return { ok: false, error: "Varianten-Index ungültig." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  // Ermittle welche Varianten Bilder haben (nur die können gerendert werden)
  const { data: images } = await supabase
    .from("creative_images")
    .select("variant_index, image_url")
    .eq("creative_id", creativeId);

  const variantsWithImage = (images ?? [])
    .filter((r) => r.image_url)
    .map((r) => r.variant_index as number);

  const targetVariants =
    scope === "all"
      ? variantsWithImage
      : variantsWithImage.includes(targetVariantIndex)
        ? [targetVariantIndex]
        : [];

  if (targetVariants.length === 0) {
    return {
      ok: false,
      error: "Keine Variante mit Bild gefunden — erst Bilder generieren.",
    };
  }

  const templateKinds: ("staticSquare" | "animatedSquare" | "reelVertical")[] = [
    "staticSquare",
    "animatedSquare",
    "reelVertical",
  ];

  // Cross-Product: variant × template → eine Render-Task pro Kombi.
  // Alle parallel mit Promise.allSettled — Creatomate verarbeitet die parallel.
  const tasks: Array<{ variantIndex: number; templateKind: string }> = [];
  for (const v of targetVariants) {
    for (const t of templateKinds) {
      tasks.push({ variantIndex: v, templateKind: t });
    }
  }

  const results = await Promise.allSettled(
    tasks.map(({ variantIndex, templateKind }) => {
      const fd = new FormData();
      fd.set("creativeId", creativeId);
      fd.set("variantIndex", String(variantIndex));
      fd.set("templateKind", templateKind);
      return startRender({ ok: false }, fd);
    }),
  );

  let startedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];
  results.forEach((r, i) => {
    const task = tasks[i];
    if (r.status === "fulfilled" && r.value.ok) {
      startedCount += 1;
    } else {
      failedCount += 1;
      const msg =
        r.status === "fulfilled"
          ? r.value.error ?? "unbekannter Fehler"
          : r.reason instanceof Error
            ? r.reason.message
            : String(r.reason);
      errors.push(`V${task.variantIndex + 1} ${task.templateKind}: ${msg}`);
    }
  });

  revalidatePath(`/dashboard/library/${creativeId}`);

  return {
    ok: startedCount > 0,
    startedCount,
    failedCount,
    errors: errors.slice(0, 5), // nur die ersten 5 zeigen, sonst UI-Overflow
    error:
      startedCount === 0
        ? `Alle ${failedCount} Renders fehlgeschlagen.`
        : failedCount > 0
          ? `${startedCount} gestartet, ${failedCount} fehlgeschlagen.`
          : undefined,
  };
}

// ---------------------------------------------------------------------------
// pollRender (vom Client periodisch aufgerufen, solange status processing)
// ---------------------------------------------------------------------------
export async function pollRender(renderRowId: string): Promise<PollResult> {
  const plog = (msg: string) => console.log(`[pollRender ${renderRowId.slice(0, 8)}] ${msg}`);

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
  if (!row) {
    plog(`row not found in DB`);
    return { status: "missing" };
  }

  // Wenn DB schon final → direkt zurück, kein API-Hit.
  if (row.status === "succeeded" || row.status === "failed") {
    plog(`DB cached: status=${row.status}, output_url=${row.output_url ? "✓" : "(null)"}`);
    return {
      status: row.status as "succeeded" | "failed",
      outputUrl: row.output_url,
      errorMessage: row.error_message,
    };
  }
  if (!row.creatomate_id) {
    plog(`no creatomate_id yet — staying ${row.status}`);
    return { status: row.status as "pending" | "processing" };
  }
  if (!process.env.CREATOMATE_API_KEY) {
    return { status: "failed", errorMessage: "CREATOMATE_API_KEY fehlt." };
  }

  // Live-Status bei Creatomate holen
  try {
    plog(`GET creatomate/renders/${row.creatomate_id.slice(0, 8)}…`);
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
      plog(`Creatomate HTTP ${res.status}: ${text.slice(0, 150)}`);
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
    plog(`Creatomate status=${data.status} url=${data.url ? "✓" : "(none)"}`);

    if (data.status === "succeeded") {
      const finalUrl = data.url ?? null;
      await supabase
        .from("creative_renders")
        .update({ status: "succeeded", output_url: finalUrl })
        .eq("id", row.id);
      // Library + Posts-Kanban auf der Projekt-Seite revalidaten,
      // damit der neue Render sofort in „Drafts" auftaucht.
      revalidatePath(`/dashboard/library/${row.creative_id}`);
      await revalidateProjectForCreative(supabase, row.creative_id);
      plog(`SUCCEEDED → returning outputUrl=${finalUrl ? finalUrl.slice(0, 60) + "…" : "(null!)"}`);
      return { status: "succeeded", outputUrl: finalUrl };
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
      await revalidateProjectForCreative(supabase, row.creative_id);
      plog(`FAILED → ${data.error_message ?? "kein detail"}`);
      return {
        status: "failed",
        errorMessage: data.error_message ?? "Render fehlgeschlagen.",
      };
    }

    return { status: "processing" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Netzwerk-Fehler.";
    plog(`EXCEPTION: ${msg}`);
    return { status: "processing", errorMessage: msg };
  }
}

// ---------------------------------------------------------------------------
// deleteRender (entfernt DB-Eintrag; das Creatomate-Asset bleibt dort, aber
// wir verlieren den Pointer — bei 50 Free-Credits kein Drama)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// saveRenderToDrafts — User-Klick „In Drafts speichern" setzt saved_at.
// Vorher: Render existiert in DB, ist aber im Posts-Kanban unsichtbar.
// Nachher: Karte erscheint in der Drafts-Spalte.
// ---------------------------------------------------------------------------
export async function saveRenderToDrafts(
  _prev: SaveRenderState,
  formData: FormData,
): Promise<SaveRenderState> {
  const slog = (m: string) => console.log(`[saveRenderToDrafts] ${m}`);
  const renderId = String(formData.get("renderId") ?? "");
  if (!renderId) return { ok: false, error: "Render-ID fehlt." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const ts = new Date().toISOString();
  slog(`updating renderId=${renderId.slice(0, 8)} saved_at=${ts}`);

  const { data: row, error } = await supabase
    .from("creative_renders")
    .update({ saved_at: ts })
    .eq("id", renderId)
    .eq("user_id", user.id)
    .select("id, creative_id, saved_at")
    .single();

  if (error) {
    console.error(`[saveRenderToDrafts] DB-ERROR:`, error);
    return {
      ok: false,
      error: `Speichern fehlgeschlagen: ${error.message}`,
    };
  }
  if (!row) {
    return { ok: false, error: "Render-Row nicht gefunden oder kein Zugriff." };
  }

  // Wenn saved_at zurückkommt aber null/leer → die Spalte existiert in der
  // DB nicht. Häufigster Grund: Migration nicht angewendet ODER PostgREST-
  // Schema-Cache stale.
  if (!row.saved_at) {
    console.error(
      `[saveRenderToDrafts] WARNUNG: Update lief durch, aber saved_at ist ${row.saved_at}. ` +
        `Vermutlich existiert die Spalte noch nicht in der DB oder der ` +
        `PostgREST-Schema-Cache ist stale. Migration 20260601_000002_renders_saved_at.sql ` +
        `anwenden + 'NOTIFY pgrst, "reload schema";' ausführen.`,
    );
    return {
      ok: false,
      error:
        "Spalte saved_at existiert nicht in der DB. " +
        "Migration anwenden + 'NOTIFY pgrst, \"reload schema\";' in Supabase SQL Editor ausführen.",
    };
  }

  slog(`update OK, saved_at=${row.saved_at}`);

  // Library + Posts-Kanban auf der Projekt-Seite revalidaten,
  // damit die Karte sofort in Drafts auftaucht.
  revalidatePath(`/dashboard/library/${row.creative_id}`);
  await revalidateProjectForCreative(supabase, row.creative_id as string);

  return { ok: true };
}

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
