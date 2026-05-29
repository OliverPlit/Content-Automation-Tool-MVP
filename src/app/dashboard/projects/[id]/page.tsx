import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { TEMPLATE_META, type TemplateKind } from "@/lib/creatomate/templates";
import { adCopyLooseSchema } from "../../generate/schema";
import { LibraryList, type LibraryItem } from "../../library/library-list";
import { FolderSidebar, type FolderInfo } from "./folder-sidebar";
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

type SearchParams = Promise<{ folder?: string }>;

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const { folder: folderFilter = "" } = await searchParams;
  const supabase = await createClient();

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, name, description, created_at")
    .eq("id", id)
    .single();
  if (projErr || !project) notFound();

  // F3 — Folders dieses Projekts laden für Sidebar + Filter
  const { data: folderRows } = await supabase
    .from("project_folders")
    .select(
      "id, name, color, description, position, brand_primary_color, brand_accent_color, brand_background_color, brand_text_color, brand_font_family, brand_font_weight",
    )
    .eq("project_id", id)
    .order("position", { ascending: true });
  const folders = (folderRows ?? []) as FolderInfo[];

  // Creatives + ggf. nach folder_id filtern
  let creativeQuery = supabase
    .from("creatives")
    .select("id, prompt, output, status, created_at, folder_id")
    .eq("project_id", id)
    .order("created_at", { ascending: false });
  if (folderFilter === "none") {
    creativeQuery = creativeQuery.is("folder_id", null);
  } else if (folderFilter) {
    creativeQuery = creativeQuery.eq("folder_id", folderFilter);
  }
  const { data: creatives } = await creativeQuery;

  const rows = (creatives ?? []) as Array<{
    id: string;
    prompt: string;
    output: string | null;
    status: string;
    created_at: string;
    folder_id: string | null;
  }>;

  // Count creatives pro Folder (für Sidebar-Badges) — separate Query, weil
  // wir oben evtl. nach Folder gefiltert haben.
  const { data: allCreativeCounts } = await supabase
    .from("creatives")
    .select("folder_id")
    .eq("project_id", id);
  const countsByFolder = new Map<string, number>();
  let countNoFolder = 0;
  for (const r of allCreativeCounts ?? []) {
    const fid = (r as { folder_id: string | null }).folder_id;
    if (fid) countsByFolder.set(fid, (countsByFolder.get(fid) ?? 0) + 1);
    else countNoFolder += 1;
  }
  const totalCreatives = (allCreativeCounts?.length ?? 0);

  // Bilder + Renders pro Creative
  const imagesByCreative = new Map<string, number[]>();
  const rendersByCreative = new Map<string, number[]>();
  const renderFormatsByCreative = new Map<string, Set<string>>();
  const firstImageUrl = new Map<string, string>();
  const firstRenderUrl = new Map<string, string>();

  // Plan-Board: ALLE Renders (mit Status/Plan-Info) für RenderPlanBoard
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
          "id, creative_id, variant_index, template_kind, template_slot, status, output_url, scheduled_at, post_status, target_platform, notes",
        )
        .in("creative_id", cids)
        .order("created_at", { ascending: false }),
    ]);

    // Map: creativeId → parsed adCopy (für Headline/Body-Preview in Plan-Cards)
    const adCopyByCreative = new Map<string, ReturnType<typeof parseOutput>>();
    for (const c of rows) {
      adCopyByCreative.set(c.id, parseOutput(c.output));
    }

    (imgRows ?? []).forEach((row) => {
      const cid = row.creative_id as string;
      const vi = row.variant_index as number;
      const arr = imagesByCreative.get(cid) ?? [];
      arr.push(vi);
      imagesByCreative.set(cid, arr);
      const imageUrl = row.image_url as string;
      if (!firstImageUrl.has(cid)) firstImageUrl.set(cid, imageUrl);

      // CV7 — AI-Bild als Pseudo-Render im Focus-Board.
      // So tauchen Creatives OHNE Creatomate-Renders trotzdem auf und
      // sind klick- und navigierbar.
      const adCopy = adCopyByCreative.get(cid);
      const variant = adCopy?.variants[vi];
      planRenders.push({
        id: `image-${cid}-${vi}`,
        creativeId: cid,
        variantIndex: vi,
        templateKind: "image" as unknown as TemplateKind, // pseudo-kind
        outputUrl: imageUrl,
        status: "succeeded",
        scheduledAt: null,
        postStatus: "draft",
        targetPlatform: null,
        notes: null,
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
      const status = row.status as "pending" | "processing" | "succeeded" | "failed";

      // Existierender Code für Library-List-Aggregation (nur succeeded)
      if (status === "succeeded") {
        const arr = rendersByCreative.get(cid) ?? [];
        if (!arr.includes(vi)) arr.push(vi);
        rendersByCreative.set(cid, arr);
        const fmt = renderFormatsByCreative.get(cid) ?? new Set<string>();
        fmt.add(tk);
        renderFormatsByCreative.set(cid, fmt);
        if (url && !firstRenderUrl.has(cid)) firstRenderUrl.set(cid, url);
      }

      // Plan-Board: alle Renders mit Output, auch failed kann archived werden
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
        creativeHeadline: adCopy?.headline ?? "—",
        creativeBody: variant?.body ?? "—",
        templateLabel: templateMeta?.label ?? tk,
        outputExt: templateMeta?.outputExt ?? "jpg",
        aspectRatio: templateMeta?.aspectRatio ?? "1:1",
      });
    });
  }

  const items: LibraryItem[] = rows.map((c) => ({
    id: c.id,
    prompt: c.prompt,
    status: c.status,
    createdAt: c.created_at,
    output: parseOutput(c.output),
    thumbnailUrl:
      firstRenderUrl.get(c.id) ?? firstImageUrl.get(c.id) ?? null,
    imagesByVariant: imagesByCreative.get(c.id) ?? [],
    rendersByVariant: rendersByCreative.get(c.id) ?? [],
    renderFormats: Array.from(renderFormatsByCreative.get(c.id) ?? []),
    projectId: id,
    projectName: project.name,
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/dashboard/projects"
        className="inline-flex items-center gap-1 text-sm font-medium text-blue-800 transition-colors hover:text-blue-950"
      >
        <span>←</span> Zurück zu allen Projekten
      </Link>

      <ProjectHeader
        id={project.id}
        initialName={project.name}
        initialDescription={project.description ?? ""}
        createdAt={project.created_at}
        creativeCount={items.length}
      />

      {/* Plan-Board: alle Renders mit Status + Scheduling + Meta-Connect */}
      <section className="mt-6">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-blue-900">
            📅 Plan · gerenderte Varianten ({planRenders.length})
          </h2>
        </div>
        <RenderPlanBoard renders={planRenders} metaConnected={false} />
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-blue-900">
            Creatives in diesem Projekt
          </h2>
          <Link
            href="/dashboard/library"
            className="text-xs font-medium text-blue-700 hover:text-blue-900"
          >
            + Weitere zuordnen in der Library →
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
          <FolderSidebar
            projectId={id}
            folders={folders}
            activeFolderId={folderFilter}
            totalCount={totalCreatives}
            countNoFolder={countNoFolder}
            countsByFolder={Object.fromEntries(countsByFolder.entries())}
          />

          <div className="min-w-0">
            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                <p>
                  {folderFilter
                    ? "Keine Creatives in diesem Ordner."
                    : "Noch keine Creatives in diesem Projekt."}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  Generiere ein neues und weise es einem Ordner zu — oder
                  verschiebe bestehende über den Move-Picker.
                </p>
                <Link
                  href="/dashboard/generate"
                  className="mt-4 inline-block rounded-lg bg-gradient-to-br from-blue-800 to-blue-950 px-4 py-2 text-xs font-semibold text-white shadow-md hover:shadow-lg"
                >
                  Neues Creative generieren →
                </Link>
              </div>
            ) : (
              <LibraryList items={items} />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
