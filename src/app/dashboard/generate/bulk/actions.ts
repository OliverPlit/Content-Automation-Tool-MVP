"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  EMPTY_PRODUCT_FACTS,
  type ProductFacts,
  type PlatformValue,
  type AwarenessValue,
  type AddressingValue,
  type FrameValue,
  type FrameworkValue,
  type ImageStyleValue,
  type AngleValue,
  PERSONAS,
  PLATFORMS,
} from "../schema";
import { generateAdCopy } from "../actions";
import type { ProductRow } from "@/lib/meta-import/insights";

export type BulkState = {
  ok: boolean;
  error?: string;
  startedCount?: number;
  failedCount?: number;
  errors?: string[];
  projectId?: string;
};

const inputSchema = z.object({
  importId: z.string().uuid(),
  projectId: z.string().uuid().optional().or(z.literal("")),
  persona: z.string().min(1).max(60),
  platform: z.string().min(1).max(40),
  variantCount: z.coerce.number().int().min(1).max(5).default(2),
  maxProducts: z.coerce.number().int().min(1).max(50).default(10),
});

export async function startBulkGenerate(
  _prev: BulkState,
  formData: FormData,
): Promise<BulkState> {
  const parsed = inputSchema.safeParse({
    importId: formData.get("importId"),
    projectId: formData.get("projectId") ?? "",
    persona: formData.get("persona") ?? "",
    platform: formData.get("platform") ?? "universal",
    variantCount: formData.get("variantCount") ?? "2",
    maxProducts: formData.get("maxProducts") ?? "10",
  });
  if (!parsed.success) {
    return { ok: false, error: "Ungültige Eingabe für Bulk-Generate." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const { importId, projectId, persona, platform, variantCount, maxProducts } =
    parsed.data;

  // 1) Import laden
  const { data: imp, error: impErr } = await supabase
    .from("meta_imports")
    .select("kind, insights, parsed_json")
    .eq("id", importId)
    .eq("user_id", user.id)
    .single();
  if (impErr || !imp) {
    return { ok: false, error: "Import nicht gefunden." };
  }
  if (imp.kind !== "products") {
    return { ok: false, error: "Import ist kein Produktkatalog." };
  }

  const insightsRows = ((imp.insights as { rows?: ProductRow[] })?.rows ?? []) as ProductRow[];
  const rows = insightsRows.slice(0, maxProducts);
  if (rows.length === 0) {
    return { ok: false, error: "Keine Produkt-Rows im Import." };
  }

  // 2) Persona-Defaults raussuchen
  const personaMeta = PERSONAS.find((p) => p.value === persona);
  if (!personaMeta) return { ok: false, error: "Persona unbekannt." };
  const platformMeta = PLATFORMS.find((p) => p.value === platform);
  if (!platformMeta) return { ok: false, error: "Plattform unbekannt." };

  // 3) Pro Produkt: FormData bauen und generateAdCopy aufrufen.
  //    Wir nutzen die existierende Server-Action — gleiche Logik, gleiche Score-
  //    Checks, gleiche Lernschleife.
  let startedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  // Sequentiell, NICHT parallel — OpenAI/Gemini-Rate-Limits respektieren.
  for (const product of rows) {
    const productFacts: ProductFacts = {
      ...EMPTY_PRODUCT_FACTS,
      name: product.title,
      price: product.price,
      usps: product.description
        ? product.description.split(/[.;\n]/).slice(0, 3).map((s) => s.trim()).filter(Boolean)
        : [],
    };

    const fd = new FormData();
    fd.set("product", product.title);
    fd.set("audience", personaMeta.audience);
    fd.set("tone", personaMeta.tone as string);
    fd.set("machine", personaMeta.machine as string);
    fd.set("angle", "direkt" as AngleValue);
    fd.set("variantCount", String(variantCount));
    fd.set("imageSource", "ai");
    fd.set("customImageUrl", "");
    fd.set("imageStyle", "ugc_phone" as ImageStyleValue);
    fd.set("awareness", String(personaMeta.awareness as AwarenessValue));
    fd.set("framework", "PAS" as FrameworkValue);
    fd.set("hookHint", "");
    fd.set("frame", "neutral" as FrameValue);
    fd.set("persona", persona);
    fd.set("addressing", personaMeta.addressing as AddressingValue);
    fd.set("platform", platform as PlatformValue);
    fd.set("imageVariantCount", "1");
    fd.set("urgency", "");
    fd.set("productFacts", JSON.stringify(productFacts));
    fd.set("websiteText", "");

    try {
      const result = await generateAdCopy({ ok: false }, fd);
      if (result.ok && result.variants && result.variants.length > 0) {
        // Erste Variante automatisch in die Library speichern (ins Projekt).
        const v = result.variants[0];
        const promptText = `Bulk · ${product.title} (Persona: ${persona}, Plattform: ${platform})`;
        const adCopy = {
          headline: v.headline,
          subline: v.subline,
          variants: result.variants.map((va) => ({ body: va.body, cta: va.cta })),
          imagePrompt: v.imagePrompt,
        };
        const { data: creativeRow, error: creativeErr } = await supabase
          .from("creatives")
          .insert({
            user_id: user.id,
            project_id: projectId || null,
            prompt: promptText,
            output: JSON.stringify(adCopy),
            status: "completed",
          })
          .select("id")
          .single();
        if (creativeErr || !creativeRow) {
          failedCount += 1;
          errors.push(`${product.title}: DB-Insert ${creativeErr?.message ?? "?"}`);
          continue;
        }
        // Bilder pro Variante speichern
        for (const va of result.variants) {
          if (!va.imageUrl) continue;
          await supabase.from("creative_images").upsert(
            {
              creative_id: creativeRow.id,
              variant_index: va.index - 1,
              image_url: va.imageUrl,
              image_prompt: va.imagePrompt,
              product_image_url: va.productImageUrl ?? null,
            },
            { onConflict: "creative_id,variant_index" },
          );
        }
        startedCount += 1;
      } else {
        failedCount += 1;
        errors.push(`${product.title}: ${result.error ?? "kein Variant"}`);
      }
    } catch (err) {
      failedCount += 1;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${product.title}: ${msg}`);
    }
  }

  if (projectId) revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/dashboard/library`);

  return {
    ok: startedCount > 0,
    startedCount,
    failedCount,
    errors: errors.slice(0, 5),
    projectId: projectId || undefined,
    error:
      startedCount === 0
        ? `Alle ${failedCount} Generations fehlgeschlagen.`
        : failedCount > 0
          ? `${startedCount} erstellt, ${failedCount} fehlgeschlagen.`
          : undefined,
  };
}
