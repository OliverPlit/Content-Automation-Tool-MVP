import { createClient } from "@/lib/supabase/server";

import { adCopyLooseSchema } from "../generate/schema";
import { CreativesColumn, type CreativeRow } from "./creatives-column";
import {
  ProjectTree,
  type StudioFolder,
  type StudioProject,
} from "./project-tree";

type CreativeDbRow = {
  id: string;
  prompt: string;
  output: string | null;
  status: string;
  created_at: string;
  project_id: string | null;
  folder_id: string | null;
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

/**
 * Studio = 3-Spalten-Split-View:
 *
 *   ┌─────────────┬───────────────────┬──────────────────────────────┐
 *   │ ProjectTree │ CreativesColumn   │ children (Empty / Workspace) │
 *   │ (220px)     │ (300px)           │ (flex)                       │
 *   └─────────────┴───────────────────┴──────────────────────────────┘
 *
 * Layout lädt die Daten:
 *   - Alle Projekte + Folders + Counts (für Tree)
 *   - Alle Creatives + erstes Bild (für Liste, max 500)
 *
 * Filterung der Liste (project/folder) passiert in CreativesColumn (Client,
 * weil Layouts in Next.js KEINE searchParams bekommen).
 */
export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // ── Creatives (max 500) ──────────────────────────────────────────────
  const { data: creativeRows } = await supabase
    .from("creatives")
    .select(
      "id, prompt, output, status, created_at, project_id, folder_id",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  const creatives = (creativeRows ?? []) as CreativeDbRow[];

  // Erstes Bild pro Creative für Thumb
  const ids = creatives.map((c) => c.id);
  const firstImage = new Map<string, string>();
  if (ids.length > 0) {
    const { data: imgRows } = await supabase
      .from("creative_images")
      .select("creative_id, image_url, variant_index")
      .in("creative_id", ids)
      .order("variant_index", { ascending: true });
    (imgRows ?? []).forEach((r) => {
      const cid = r.creative_id as string;
      if (!firstImage.has(cid)) firstImage.set(cid, r.image_url as string);
    });
  }

  const creativeList: CreativeRow[] = creatives.map((c) => {
    const parsed = parseOutput(c.output);
    return {
      id: c.id,
      headline: parsed?.headline ?? c.prompt.slice(0, 40),
      subline: parsed?.subline ?? "",
      thumb: firstImage.get(c.id) ?? null,
      createdAt: c.created_at,
      projectId: c.project_id,
      folderId: c.folder_id,
    };
  });

  // ── Projekte + Folders + Counts ──────────────────────────────────────
  const [{ data: projectRows }, { data: folderRows }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name")
      .order("name", { ascending: true }),
    supabase
      .from("project_folders")
      .select("id, name, project_id, position")
      .order("position", { ascending: true }),
  ]);

  // Counts pro Projekt (total) + pro Folder
  const countByProject = new Map<string, number>();
  const countNoFolderInProject = new Map<string, number>();
  const countByFolder = new Map<string, number>();
  let countOrphans = 0;
  for (const c of creatives) {
    if (c.project_id) {
      countByProject.set(
        c.project_id,
        (countByProject.get(c.project_id) ?? 0) + 1,
      );
      if (c.folder_id) {
        countByFolder.set(
          c.folder_id,
          (countByFolder.get(c.folder_id) ?? 0) + 1,
        );
      } else {
        countNoFolderInProject.set(
          c.project_id,
          (countNoFolderInProject.get(c.project_id) ?? 0) + 1,
        );
      }
    } else {
      countOrphans += 1;
    }
  }

  const foldersByProject = new Map<string, StudioFolder[]>();
  for (const f of folderRows ?? []) {
    const pid = (f as { project_id: string }).project_id;
    const arr = foldersByProject.get(pid) ?? [];
    arr.push({
      id: (f as { id: string }).id,
      name: (f as { name: string }).name,
      count: countByFolder.get((f as { id: string }).id) ?? 0,
    });
    foldersByProject.set(pid, arr);
  }

  const projectTree: StudioProject[] = (projectRows ?? []).map((p) => {
    const pid = (p as { id: string }).id;
    return {
      id: pid,
      name: (p as { name: string }).name,
      totalCount: countByProject.get(pid) ?? 0,
      countNoFolder: countNoFolderInProject.get(pid) ?? 0,
      folders: foldersByProject.get(pid) ?? [],
    };
  });

  return (
    <div className="-mx-8 -my-8 flex h-[calc(100vh-64px)] flex-1 overflow-hidden">
      {/* Spalte 1 — Project Tree */}
      <aside className="w-[220px] shrink-0 border-r border-[var(--color-line)]">
        <ProjectTree
          projects={projectTree}
          countAll={creatives.length}
          countOrphans={countOrphans}
        />
      </aside>

      {/* Spalte 2 — Creatives-Liste (gefiltert via URL) */}
      <aside className="w-[300px] shrink-0 border-r border-[var(--color-line)]">
        <CreativesColumn
          creatives={creativeList}
          projects={projectTree.map((p) => ({ id: p.id, name: p.name }))}
        />
      </aside>

      {/* Spalte 3 — Workspace / Empty */}
      <main className="flex-1 overflow-y-auto bg-[var(--color-surface)] px-8 py-8">
        {children}
      </main>
    </div>
  );
}
