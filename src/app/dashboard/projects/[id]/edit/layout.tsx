import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/icon";
import { createClient } from "@/lib/supabase/server";
import { adCopyLooseSchema } from "../../../generate/schema";
import { ProjectStudioItem } from "./studio-item";

type Row = {
  id: string;
  prompt: string;
  output: string | null;
  status: string;
  created_at: string;
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

type Params = Promise<{ id: string }>;

/**
 * Project-Studio = Split-View innerhalb eines Projekts.
 *   ┌────────────────┬──────────────────────────────────────┐
 *   │ Creatives in   │ children (Empty-State oder Detail    │
 *   │ DIESEM Projekt │ via /edit/[cid])                     │
 *   └────────────────┴──────────────────────────────────────┘
 * Im Gegensatz zum globalen Studio (/dashboard/library) ist die Liste hier
 * auf das aktuelle Projekt gescoped.
 */
export default async function ProjectStudioLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Params;
}) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .single();
  if (projErr || !project) notFound();

  const { data, error } = await supabase
    .from("creatives")
    .select("id, prompt, output, status, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(500);

  const creatives = (data ?? []) as Row[];
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

  return (
    <div className="-mx-8 -my-8 flex h-[calc(100vh-64px)] flex-1 overflow-hidden">
      {/* Liste links — projekt-scoped */}
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-[var(--color-line)] bg-white">
        <div className="border-b border-[var(--color-line)] px-4 py-3">
          <Link
            href={`/dashboard/projects/${projectId}`}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--foreground)]"
          >
            <Icon name="chevron-left" className="size-3" />
            Zum Projekt-Plan
          </Link>
          <h1 className="mt-1 truncate text-[16px] font-semibold tracking-tight text-[var(--foreground)]">
            {project.name}
          </h1>
          <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
            {creatives.length} Creative{creatives.length === 1 ? "" : "s"}
          </p>
        </div>

        {error && (
          <p className="m-3 rounded-md bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
            {error.message}
          </p>
        )}

        <nav className="flex-1 overflow-y-auto">
          {creatives.length === 0 ? (
            <div className="p-6 text-center text-[12px] text-[var(--color-muted)]">
              <p>Noch keine Creatives in diesem Projekt.</p>
              <Link
                href="/dashboard/generate"
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--foreground)] underline hover:opacity-70"
              >
                Jetzt erstellen
                <Icon name="chevron-right" className="size-3" />
              </Link>
            </div>
          ) : (
            <ul>
              {creatives.map((c) => {
                const parsed = parseOutput(c.output);
                return (
                  <ProjectStudioItem
                    key={c.id}
                    projectId={projectId}
                    id={c.id}
                    headline={parsed?.headline ?? c.prompt.slice(0, 40)}
                    subline={parsed?.subline ?? ""}
                    thumb={firstImage.get(c.id) ?? null}
                    createdAt={c.created_at}
                  />
                );
              })}
            </ul>
          )}
        </nav>
      </aside>

      {/* Detail rechts */}
      <main className="flex-1 overflow-y-auto bg-[var(--color-surface)] px-8 py-8">
        {children}
      </main>
    </div>
  );
}
