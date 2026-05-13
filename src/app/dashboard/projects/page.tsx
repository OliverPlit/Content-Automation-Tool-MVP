import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { CreateProjectForm } from "./create-form";

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, description, created_at")
    .order("created_at", { ascending: false });

  const list = (projects ?? []) as ProjectRow[];
  const ids = list.map((p) => p.id);

  // Counts pro Projekt + Thumbnails (jüngste 3 Creatives je Projekt)
  const countByProject = new Map<string, number>();
  const thumbsByProject = new Map<string, string[]>();

  if (ids.length > 0) {
    const { data: creatives } = await supabase
      .from("creatives")
      .select("id, project_id, created_at")
      .in("project_id", ids)
      .order("created_at", { ascending: false });

    (creatives ?? []).forEach((c) => {
      const pid = c.project_id as string;
      countByProject.set(pid, (countByProject.get(pid) ?? 0) + 1);
    });

    const recentCreativeIds = (creatives ?? []).map((c) => c.id) as string[];
    if (recentCreativeIds.length > 0) {
      const { data: imgRows } = await supabase
        .from("creative_images")
        .select("creative_id, image_url, variant_index")
        .in("creative_id", recentCreativeIds)
        .order("variant_index", { ascending: true });

      // Map creative -> first image
      const firstByCreative = new Map<string, string>();
      (imgRows ?? []).forEach((row) => {
        const cid = row.creative_id as string;
        if (!firstByCreative.has(cid))
          firstByCreative.set(cid, row.image_url as string);
      });

      // Build thumb array per project (max 3)
      (creatives ?? []).forEach((c) => {
        const pid = c.project_id as string;
        const url = firstByCreative.get(c.id as string);
        if (!url) return;
        const arr = thumbsByProject.get(pid) ?? [];
        if (arr.length < 3) arr.push(url);
        thumbsByProject.set(pid, arr);
      });
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 rounded-2xl bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 px-6 py-7 text-white shadow-xl shadow-blue-900/20">
        <h1 className="text-3xl font-bold tracking-tight">Projekte</h1>
        <p className="mt-1 max-w-xl text-sm text-blue-100">
          Bündele Creatives nach Kampagne, Kunde oder Kanal. Ein Creative kann
          zu höchstens einem Projekt gehören.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      <CreateProjectForm />

      <section className="mt-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-blue-900">
          Deine Projekte ({list.length})
        </h2>

        {list.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
            Noch keine Projekte. Lege oben das erste an.
          </div>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => (
              <li key={p.id}>
                <ProjectCard
                  project={p}
                  creativeCount={countByProject.get(p.id) ?? 0}
                  thumbs={thumbsByProject.get(p.id) ?? []}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ProjectCard({
  project,
  creativeCount,
  thumbs,
}: {
  project: ProjectRow;
  creativeCount: number;
  thumbs: string[];
}) {
  return (
    <Link
      href={`/dashboard/projects/${project.id}`}
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-blue-900/5 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-xl hover:shadow-blue-900/10"
    >
      <div className="grid h-32 grid-cols-3 gap-0.5 bg-slate-100">
        {[0, 1, 2].map((i) => {
          const url = thumbs[i];
          return url ? (
            <div key={i} className="overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div
              key={i}
              className="flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-[10px] text-slate-400"
            >
              {i === 0 && thumbs.length === 0 ? "leer" : ""}
            </div>
          );
        })}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="truncate text-base font-bold text-slate-900">
          {project.name}
        </p>
        {project.description ? (
          <p className="mt-1 line-clamp-2 text-xs text-slate-600">
            {project.description}
          </p>
        ) : (
          <p className="mt-1 text-xs italic text-slate-400">
            Keine Beschreibung
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3 text-xs">
          <span className="font-semibold text-blue-800">
            {creativeCount} Creative{creativeCount === 1 ? "" : "s"}
          </span>
          <span className="text-slate-400">
            {new Date(project.created_at).toLocaleDateString("de-DE")}
          </span>
        </div>
      </div>
    </Link>
  );
}
