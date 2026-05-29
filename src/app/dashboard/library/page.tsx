import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/icon";
import { adCopyLooseSchema } from "../generate/schema";
import { LibraryList, type LibraryItem } from "./library-list";

type Row = {
  id: string;
  prompt: string;
  output: string | null;
  status: string;
  created_at: string;
  project_id: string | null;
};

function parseOutput(raw: string | null) {
  if (!raw) return null;
  try {
    const parsed = adCopyLooseSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export default async function LibraryPage() {
  const supabase = await createClient();
  const [
    { data, error },
    { data: projectRows },
    { count: assignedCount },
  ] = await Promise.all([
    supabase
      .from("creatives")
      .select("id, prompt, output, status, created_at, project_id")
      // LB1 — nur unzugeordnete Creatives (project_id IS NULL).
      // Zugeordnete sind unter /dashboard/projects/<id> sichtbar.
      .is("project_id", null)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("projects")
      .select("id, name")
      .order("name", { ascending: true }),
    supabase
      .from("creatives")
      .select("id", { count: "exact", head: true })
      .not("project_id", "is", null),
  ]);

  const creatives = (data ?? []) as Row[];
  const projectMap = new Map<string, string>(
    (projectRows ?? []).map((p) => [p.id as string, p.name as string]),
  );
  const projectsList = (projectRows ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
  }));

  // Gemeinsamer Round-Trip für Bilder und Renders aller gelisteten Creatives.
  const imagesByCreative = new Map<string, number[]>();
  const rendersByCreative = new Map<string, number[]>();
  const renderFormatsByCreative = new Map<string, Set<string>>();
  const firstImageUrl = new Map<string, string>();
  const firstRenderUrl = new Map<string, string>();

  if (creatives.length > 0) {
    const ids = creatives.map((c) => c.id);
    const [{ data: imageRows }, { data: renderRows }] = await Promise.all([
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

    (imageRows ?? []).forEach((row) => {
      const cid = row.creative_id as string;
      const vi = row.variant_index as number;
      const arr = imagesByCreative.get(cid) ?? [];
      arr.push(vi);
      imagesByCreative.set(cid, arr);
      if (!firstImageUrl.has(cid)) firstImageUrl.set(cid, row.image_url as string);
    });

    (renderRows ?? []).forEach((row) => {
      const cid = row.creative_id as string;
      const vi = row.variant_index as number;
      const tk = row.template_kind as string;
      const url = row.output_url as string | null;

      const arr = rendersByCreative.get(cid) ?? [];
      if (!arr.includes(vi)) arr.push(vi);
      rendersByCreative.set(cid, arr);

      const formats = renderFormatsByCreative.get(cid) ?? new Set<string>();
      formats.add(tk);
      renderFormatsByCreative.set(cid, formats);

      if (url && !firstRenderUrl.has(cid)) firstRenderUrl.set(cid, url);
    });
  }

  const items: LibraryItem[] = creatives.map((c) => ({
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
    projectId: c.project_id ?? null,
    projectName: c.project_id ? (projectMap.get(c.project_id) ?? null) : null,
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
          Library
        </h1>
        <p className="mt-1 text-[14px] text-[var(--color-muted)]">
          Creatives ohne Projekt-Zuordnung. Hier kannst du sie nachträglich
          einem Projekt zuweisen.
        </p>
      </header>

      {(assignedCount ?? 0) > 0 && (
        <Link
          href="/dashboard/projects"
          className="mb-4 flex items-center justify-between rounded-xl border border-[var(--color-line)] bg-white px-4 py-3 text-[13px] text-[var(--foreground)] transition-colors hover:bg-[var(--color-surface)]"
        >
          <span className="flex items-center gap-2">
            <Icon name="folder" className="size-4 text-[var(--color-muted)]" />
            <span>
              {assignedCount} weitere Creative
              {assignedCount === 1 ? "" : "s"} sind Projekten zugeordnet
            </span>
          </span>
          <span className="flex items-center gap-1 text-[var(--color-muted)]">
            Projekte ansehen
            <Icon name="chevron-right" className="size-3.5" />
          </span>
        </Link>
      )}

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      <LibraryList items={items} projects={projectsList} />
    </div>
  );
}
