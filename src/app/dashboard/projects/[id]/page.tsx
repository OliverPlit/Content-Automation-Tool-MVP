import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { TEMPLATE_META, type TemplateKind } from "@/lib/creatomate/templates";
import { adCopyLooseSchema } from "../../generate/schema";
import { PostsKanban } from "./posts-kanban";
import { ProjectCalendar } from "./project-calendar";
import { ProjectHeader } from "./project-header";
import {
  RenderPlanBoard,
  type ProjectRender,
} from "./render-plan-board";
import type { PostStatus } from "./schedule-constants";

type Params = Promise<{ id: string }>;

function parseOutput(raw: string | null) {
  if (!raw) return null;
  try {
    const parsed = adCopyLooseSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Projekt-Detail = reiner Planning-Hub.
 *
 * Was hier nicht (mehr) ist:
 *   - Folder-Sidebar  → ist ins Studio gewandert (/dashboard/library)
 *   - Creatives-Liste → ist ins Studio gewandert
 *   - Inline-Workspace → ist ins Studio gewandert
 *
 * Was hier ist:
 *   - Posts-Kanban (Draft/Review/Approved/Scheduled/Live) für Workflow
 *   - Plan-Detail (Calendar + Focus + Variant-Tabs) eingeklappt für
 *     Tastatur-Navigation und Heat-Map.
 *
 * Editieren der Creatives passiert im Studio mit Projekt-Filter.
 */
export default async function ProjectDetailPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, name, description, created_at")
    .eq("id", id)
    .single();
  if (projErr || !project) notFound();

  // Alle Creatives dieses Projekts (für Plan-Daten + Count im Header)
  const { data: creatives } = await supabase
    .from("creatives")
    .select("id, prompt, output, status, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  const rows = (creatives ?? []) as Array<{
    id: string;
    prompt: string;
    output: string | null;
    status: string;
    created_at: string;
  }>;

  // Plan-Daten zusammenbauen (Renders + AI-Bild-Pseudos für Plan-Board).
  const planRenders: ProjectRender[] = [];

  if (rows.length > 0) {
    const cids = rows.map((r) => r.id);
    const [{ data: imgRows }, { data: rndRows }] = await Promise.all([
      supabase
        .from("creative_images")
        .select("creative_id, variant_index, image_url")
        .in("creative_id", cids)
        .order("variant_index", { ascending: true }),
      supabase
        .from("creative_renders")
        .select(
          "id, creative_id, variant_index, template_kind, template_slot, status, output_url, scheduled_at, post_status, target_platform, notes, saved_at",
        )
        .in("creative_id", cids)
        .order("created_at", { ascending: false }),
    ]);

    const adCopyByCreative = new Map<string, ReturnType<typeof parseOutput>>();
    for (const c of rows) adCopyByCreative.set(c.id, parseOutput(c.output));

    (imgRows ?? []).forEach((row) => {
      const cid = row.creative_id as string;
      const vi = row.variant_index as number;
      const imageUrl = row.image_url as string;
      const adCopy = adCopyByCreative.get(cid);
      const variant = adCopy?.variants[vi];
      planRenders.push({
        id: `image-${cid}-${vi}`,
        creativeId: cid,
        variantIndex: vi,
        templateKind: "image" as unknown as TemplateKind,
        outputUrl: imageUrl,
        status: "succeeded",
        scheduledAt: null,
        postStatus: "draft",
        targetPlatform: null,
        notes: null,
        // AI-Pseudo-Renders gehören nicht ins Posts-Kanban → savedAt null,
        // posts-kanban filtert sie ohnehin per id-Prefix raus.
        savedAt: null,
        creativeHeadline: adCopy?.headline ?? "—",
        creativeBody: variant?.body ?? "—",
        templateLabel: "AI-Szene",
        outputExt: "jpg",
        aspectRatio: "1:1",
      });
    });

    (rndRows ?? []).forEach((row) => {
      const cid = row.creative_id as string;
      const vi = row.variant_index as number;
      const tk = row.template_kind as TemplateKind;
      const url = row.output_url as string | null;
      const status = row.status as
        | "pending"
        | "processing"
        | "succeeded"
        | "failed";
      const adCopy = adCopyByCreative.get(cid);
      const variant = adCopy?.variants[vi];
      const templateMeta = TEMPLATE_META[tk];
      planRenders.push({
        id: row.id as string,
        creativeId: cid,
        variantIndex: vi,
        templateKind: tk,
        outputUrl: url,
        status,
        scheduledAt: row.scheduled_at as string | null,
        postStatus: (row.post_status as PostStatus) ?? "draft",
        targetPlatform: row.target_platform as string | null,
        notes: row.notes as string | null,
        savedAt: (row.saved_at as string | null) ?? null,
        creativeHeadline: adCopy?.headline ?? "—",
        creativeBody: variant?.body ?? "—",
        templateLabel: templateMeta?.label ?? tk,
        outputExt: templateMeta?.outputExt ?? "jpg",
        aspectRatio: templateMeta?.aspectRatio ?? "1:1",
      });
    });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/dashboard/projects"
        className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--foreground)]"
      >
        ← Zurück zu allen Projekten
      </Link>

      <ProjectHeader
        id={project.id}
        initialName={project.name}
        initialDescription={project.description ?? ""}
        createdAt={project.created_at}
        creativeCount={rows.length}
      />

      {/* Direktlink ins Studio mit Projekt-Filter — dort wird editiert. */}
      <div className="mt-4">
        <Link
          href={`/dashboard/library?project=${id}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--foreground)] px-4 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
        >
          Im Studio öffnen
        </Link>
      </div>

      {/* Kalender pro Projekt — geplante Posts im Monatsraster. */}
      <section className="mt-6">
        <ProjectCalendar renders={planRenders} />
      </section>

      {/* Posts-Workflow Kanban — Drag-and-Drop zwischen Status-Spalten. */}
      <section className="mt-6">
        <PostsKanban renders={planRenders} projectId={id} />
      </section>

      {/* Detail-Ansicht: Calendar-Heat-Map + Focus-View + Variant-Tabs.
          Eingeklappt — wer den Power-User-Workflow will, klappt auf. */}
      <section className="mt-6">
        <details>
          <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)] hover:text-[var(--foreground)]">
            Detail-Ansicht · Kalender + Variant-Tabs ({planRenders.length})
          </summary>
          <div className="mt-3">
            <RenderPlanBoard renders={planRenders} metaConnected={false} />
          </div>
        </details>
      </section>
    </div>
  );
}
