import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { adCopyLooseSchema, type AdCopy } from "../../generate/schema";
import { CreativeWorkspace } from "./creative-workspace";
import type { ImageProvider, VariantImage } from "./image-actions";
import type { RenderRecord } from "./render-actions";
import {
  TEMPLATE_META,
  getAllTemplatePools,
  getTemplateAvailability,
  type TemplateKind,
} from "@/lib/creatomate/templates";
import { ProjectPicker, type ProjectOption } from "./project-picker";
import type { ProjectRender } from "@/app/dashboard/projects/[id]/render-plan-board";
import type { PostStatus } from "@/app/dashboard/projects/[id]/schedule-constants";
import { LibraryFocusBoard } from "./library-focus-board";

type Params = Promise<{ id: string }>;

export default async function CreativeDetailPage({ params }: { params: Params }) {
  const { id } = await params;

  const supabase = await createClient();
  const [
    { data, error },
    { data: imageRows },
    { data: renderRows },
    { data: projectRows },
  ] = await Promise.all([
    supabase
      .from("creatives")
      .select("id, prompt, output, status, created_at, project_id, folder_id")
      .eq("id", id)
      .single(),
    supabase
      .from("creative_images")
      .select("variant_index, image_url, image_prompt, provider, product_image_url")
      .eq("creative_id", id),
    supabase
      .from("creative_renders")
      .select(
        "id, variant_index, template_kind, template_slot, status, output_url, error_message, scheduled_at, post_status, target_platform, notes",
      )
      .eq("creative_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("projects")
      .select("id, name")
      .order("name", { ascending: true }),
  ]);

  if (error || !data) notFound();

  let parsed: AdCopy | null = null;
  if (data.output) {
    try {
      const result = adCopyLooseSchema.safeParse(JSON.parse(data.output));
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
    productImageUrl: (r.product_image_url as string | null) ?? null,
  }));

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
      templateSlot: (r.template_slot as string | null) ?? null,
      status: r.status as RenderRecord["status"],
      outputUrl: (r.output_url as string | null) ?? null,
      errorMessage: (r.error_message as string | null) ?? null,
    });
  });

  const projects: ProjectOption[] = (projectRows ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
  }));

  // ProjectRender-Adapter für LibraryFocusBoard: AI-Image als 0te Spalte,
  // gefolgt von allen erfolgreichen Renders pro Variante × Format.
  const focusItems: ProjectRender[] = [];
  const headline = parsed?.headline ?? "—";
  const variantsList = parsed?.variants ?? [];
  // AI-Image-Pseudo-Renders (eine pro Variante)
  for (const img of images) {
    if (!img.imageUrl) continue;
    const v = variantsList[img.variantIndex];
    focusItems.push({
      id: `image-${img.variantIndex}`,
      creativeId: data.id,
      variantIndex: img.variantIndex,
      templateKind: "image" as unknown as TemplateKind, // pseudo
      outputUrl: img.imageUrl,
      status: "succeeded",
      scheduledAt: null,
      postStatus: "draft" as PostStatus,
      targetPlatform: null,
      notes: null,
      creativeHeadline: headline,
      creativeBody: v?.body ?? "",
      templateLabel: "AI-Szene",
      outputExt: "jpg",
      aspectRatio: "1:1",
    });
  }
  // Plus echte Renders (nur succeeded zeigen — failed/processing skippen)
  (renderRows ?? []).forEach((r) => {
    if (r.status !== "succeeded" || !r.output_url) return;
    const tk = r.template_kind as TemplateKind;
    const tplMeta = TEMPLATE_META[tk];
    const v = variantsList[r.variant_index as number];
    focusItems.push({
      id: r.id as string,
      creativeId: data.id,
      variantIndex: r.variant_index as number,
      templateKind: tk,
      outputUrl: r.output_url as string,
      status: r.status as "succeeded",
      scheduledAt: (r.scheduled_at as string | null) ?? null,
      postStatus: ((r.post_status as PostStatus) ?? "draft"),
      targetPlatform: (r.target_platform as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      creativeHeadline: headline,
      creativeBody: v?.body ?? "",
      templateLabel: tplMeta?.label ?? tk,
      outputExt: tplMeta?.outputExt ?? "jpg",
      aspectRatio: tplMeta?.aspectRatio ?? "1:1",
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
        <div className="mt-4 space-y-4">
          <ProjectPicker
            creativeId={data.id}
            currentProjectId={(data.project_id as string | null) ?? null}
            currentFolderId={(data.folder_id as string | null) ?? null}
            projects={projects}
          />

          {focusItems.length > 0 && (
            <LibraryFocusBoard items={focusItems} />
          )}

          <CreativeWorkspace
            id={data.id}
            initial={parsed}
            images={images}
            renders={renders}
            createdAt={data.created_at}
            promptText={data.prompt}
            templateAvailability={getTemplateAvailability()}
            templatePools={getAllTemplatePools()}
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
