import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { adCopySchema } from "../../generate/schema";
import { LibraryList, type LibraryItem } from "../../library/library-list";
import { ProjectHeader } from "./project-header";

type Params = Promise<{ id: string }>;

function parseOutput(raw: string | null) {
  if (!raw) return null;
  try {
    const parsed = adCopySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

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

  // Bilder + Renders pro Creative
  const imagesByCreative = new Map<string, number[]>();
  const rendersByCreative = new Map<string, number[]>();
  const renderFormatsByCreative = new Map<string, Set<string>>();
  const firstImageUrl = new Map<string, string>();
  const firstRenderUrl = new Map<string, string>();

  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const [{ data: imgRows }, { data: rndRows }] = await Promise.all([
      supabase
        .from("creative_images")
        .select("creative_id, variant_index, image_url")
        .in("creative_id", ids)
        .order("variant_index", { ascending: true }),
      supabase
        .from("creative_renders")
        .select("creative_id, variant_index, template_kind, output_url")
        .in("creative_id", ids)
        .eq("status", "succeeded")
        .order("variant_index", { ascending: true }),
    ]);

    (imgRows ?? []).forEach((row) => {
      const cid = row.creative_id as string;
      const vi = row.variant_index as number;
      const arr = imagesByCreative.get(cid) ?? [];
      arr.push(vi);
      imagesByCreative.set(cid, arr);
      if (!firstImageUrl.has(cid))
        firstImageUrl.set(cid, row.image_url as string);
    });

    (rndRows ?? []).forEach((row) => {
      const cid = row.creative_id as string;
      const vi = row.variant_index as number;
      const tk = row.template_kind as string;
      const url = row.output_url as string | null;
      const arr = rendersByCreative.get(cid) ?? [];
      if (!arr.includes(vi)) arr.push(vi);
      rendersByCreative.set(cid, arr);
      const fmt = renderFormatsByCreative.get(cid) ?? new Set<string>();
      fmt.add(tk);
      renderFormatsByCreative.set(cid, fmt);
      if (url && !firstRenderUrl.has(cid)) firstRenderUrl.set(cid, url);
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

      <section className="mt-6">
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

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            <p>Noch keine Creatives in diesem Projekt.</p>
            <p className="mt-2 text-xs text-slate-400">
              Gehe in die Library, öffne ein Creative und ordne es im Header
              diesem Projekt zu — oder generiere ein neues und weise es zu.
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
      </section>
    </div>
  );
}
