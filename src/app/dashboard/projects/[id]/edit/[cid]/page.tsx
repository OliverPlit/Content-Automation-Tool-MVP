import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  getAllTemplatePools,
  getTemplateAvailability,
  type TemplateKind,
} from "@/lib/creatomate/templates";
import { adCopyLooseSchema, type AdCopy } from "../../../../generate/schema";
import { CreativeWorkspace } from "../../../../library/[id]/creative-workspace";
import type {
  ImageProvider,
  VariantImage,
} from "../../../../library/[id]/image-actions";
import type { RenderRecord } from "../../../../library/[id]/render-actions";
import {
  ProjectPicker,
  type ProjectOption,
} from "../../../../library/[id]/project-picker";

type Params = Promise<{ id: string; cid: string }>;

/**
 * Project-Studio Detail — gleicher Workspace wie /dashboard/library/[id],
 * aber:
 *   • Nur erreichbar wenn das Creative wirklich zu diesem Projekt gehört
 *     (sonst 404 → Schutz gegen URL-Manipulation).
 *   • Liste links bleibt projekt-scoped (kommt aus dem Edit-Layout).
 */
export default async function ProjectStudioDetailPage({
  params,
}: {
  params: Params;
}) {
  const { id: projectId, cid } = await params;

  const supabase = await createClient();
  const [
    { data, error },
    { data: imageRows },
    { data: renderRows },
    { data: projectRows },
  ] = await Promise.all([
    supabase
      .from("creatives")
      .select(
        "id, prompt, output, status, created_at, project_id, folder_id",
      )
      .eq("id", cid)
      .single(),
    supabase
      .from("creative_images")
      .select("variant_index, image_url, image_prompt, provider, product_image_url")
      .eq("creative_id", cid),
    supabase
      .from("creative_renders")
      .select(
        "id, variant_index, template_kind, template_slot, status, output_url, error_message, scheduled_at, post_status, target_platform, notes",
      )
      .eq("creative_id", cid)
      .order("created_at", { ascending: false }),
    supabase
      .from("projects")
      .select("id, name")
      .order("name", { ascending: true }),
  ]);

  if (error || !data) notFound();

  // Schutz: Creative muss zu diesem Projekt gehören.
  // Wenn nicht → zurück zur Edit-Empty-Page (statt kryptischem 404).
  if (data.project_id !== projectId) {
    redirect(`/dashboard/projects/${projectId}/edit`);
  }

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
      postStatus: (r.post_status as RenderRecord["postStatus"]) ?? "draft",
      scheduledAt: (r.scheduled_at as string | null) ?? null,
      targetPlatform: (r.target_platform as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
    });
  });

  const projects: ProjectOption[] = (projectRows ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
  }));

  return (
    <div className="mx-auto max-w-3xl">
      {parsed ? (
        <div className="space-y-4">
          <ProjectPicker
            creativeId={data.id}
            currentProjectId={(data.project_id as string | null) ?? null}
            currentFolderId={(data.folder_id as string | null) ?? null}
            projects={projects}
          />

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
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
          Output konnte nicht im erwarteten Format geparst werden. Dieser
          Eintrag stammt vermutlich aus einer früheren Version und ist nicht
          editierbar.
        </div>
      )}
    </div>
  );
}
