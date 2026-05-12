import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { adCopySchema, type AdCopy } from "../../generate/schema";
import { CreativeWorkspace } from "./creative-workspace";
import type { ImageProvider, VariantImage } from "./image-actions";
import type { RenderRecord } from "./render-actions";
import type { TemplateKind } from "@/lib/creatomate/templates";

type Params = Promise<{ id: string }>;

export default async function CreativeDetailPage({ params }: { params: Params }) {
  const { id } = await params;

  const supabase = await createClient();
  const [
    { data, error },
    { data: imageRows },
    { data: renderRows },
  ] = await Promise.all([
    supabase
      .from("creatives")
      .select("id, prompt, output, status, created_at")
      .eq("id", id)
      .single(),
    supabase
      .from("creative_images")
      .select("variant_index, image_url, image_prompt, provider")
      .eq("creative_id", id),
    supabase
      .from("creative_renders")
      .select("id, variant_index, template_kind, status, output_url, error_message")
      .eq("creative_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (error || !data) notFound();

  let parsed: AdCopy | null = null;
  if (data.output) {
    try {
      const result = adCopySchema.safeParse(JSON.parse(data.output));
      parsed = result.success ? result.data : null;
    } catch {
      parsed = null;
    }
  }

  const images: VariantImage[] = (imageRows ?? []).map((r) => ({
    variantIndex: r.variant_index as number,
    imageUrl: r.image_url as string,
    imagePrompt: (r.image_prompt as string | null) ?? null,
    provider: (r.provider as ImageProvider | null) ?? null,
  }));

  // Pro (variant, template) nur den neuesten Render behalten.
  const seenRender = new Set<string>();
  const renders: RenderRecord[] = [];
  (renderRows ?? []).forEach((r) => {
    const key = `${r.variant_index}|${r.template_kind}`;
    if (seenRender.has(key)) return;
    seenRender.add(key);
    renders.push({
      id: r.id as string,
      variantIndex: r.variant_index as number,
      templateKind: r.template_kind as TemplateKind,
      status: r.status as RenderRecord["status"],
      outputUrl: (r.output_url as string | null) ?? null,
      errorMessage: (r.error_message as string | null) ?? null,
    });
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard/library"
        className="inline-flex items-center gap-1 text-sm font-medium text-blue-800 transition-colors hover:text-blue-950"
      >
        <span>←</span> Zurück zur Library
      </Link>

      {parsed ? (
        <div className="mt-4">
          <CreativeWorkspace
            id={data.id}
            initial={parsed}
            images={images}
            renders={renders}
            createdAt={data.created_at}
            promptText={data.prompt}
          />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Output konnte nicht im erwarteten Format geparst werden. Dieser
          Eintrag stammt vermutlich aus einer früheren Version und ist nicht
          editierbar.
        </div>
      )}
    </div>
  );
}
