/**
 * Self-Learning · Phase 0 — Feature-Persistenz.
 *
 * Schreibt die strukturierten Achsen-Features je gespeicherter Variante in
 * die Tabelle `creative_features`. Voraussetzung dafür, dass die spätere
 * Lernschleife (Outcomes → Priors) pro Feature lernen kann.
 *
 * Bewusst ein eigenes Modul (kein "use server"), damit es sowohl die
 * Generate-Actions als auch der Bulk-Pfad direkt importieren können, ohne
 * den Server-Action-Export-Zwang.
 */
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Run-weite Metadaten (für alle Varianten gleich). */
export type FeatureRunMeta = {
  awareness?: number | null;
  platform?: string | null;
  product?: string | null;
  /** Strukturiertes Persona/Avatar. */
  audienceSegment?: string | null;
  /** Freier Zielgruppen-Text. */
  audienceText?: string | null;
};

/** Pro-Varianten-Features. */
export type FeatureVariant = {
  /** 0-basierter variant_index (== creative_images.variant_index). */
  index: number;
  hook?: string | null;
  framework?: string | null;
  lever?: string | null;
  imageStyle?: string | null;
  headline?: string | null;
};

/**
 * Upsert je Variante in creative_features. Soft: wirft nicht — ein Fehler
 * hier darf den Save des Creatives nicht scheitern lassen.
 */
export async function persistCreativeFeatures(
  supabase: SupabaseServerClient,
  userId: string,
  creativeId: string,
  run: FeatureRunMeta,
  variants: FeatureVariant[],
): Promise<void> {
  if (variants.length === 0) return;
  const rows = variants.map((v) => ({
    user_id: userId,
    creative_id: creativeId,
    variant_index: v.index,
    hook: v.hook ?? null,
    framework: v.framework ?? null,
    lever: v.lever ?? null,
    image_style: v.imageStyle ?? null,
    awareness: run.awareness ?? null,
    platform: run.platform ?? null,
    product: run.product ?? null,
    audience_segment: run.audienceSegment ?? null,
    audience_text: run.audienceText ?? null,
    headline: v.headline ?? null,
  }));
  try {
    await supabase
      .from("creative_features")
      .upsert(rows, { onConflict: "creative_id,variant_index" });
  } catch {
    // soft-fail: Feature-Tracking darf den Save nie blockieren.
  }
}
