"use client";

import Link from "next/link";
import { useRef } from "react";

import { assignCreativeToProject } from "../../projects/actions";

export type ProjectOption = { id: string; name: string };

export function ProjectPicker({
  creativeId,
  currentProjectId,
  projects,
}: {
  creativeId: string;
  currentProjectId: string | null;
  projects: ProjectOption[];
}) {
  const formRef = useRef<HTMLFormElement>(null);

  const current = projects.find((p) => p.id === currentProjectId) ?? null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-md shadow-blue-900/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Projekt
          </p>
          {current ? (
            <Link
              href={`/dashboard/projects/${current.id}`}
              className="mt-0.5 inline-flex items-center gap-1 text-sm font-semibold text-blue-800 hover:text-blue-950 hover:underline"
            >
              📁 {current.name}
            </Link>
          ) : (
            <p className="mt-0.5 text-sm italic text-slate-500">Kein Projekt</p>
          )}
        </div>

        <form
          ref={formRef}
          action={assignCreativeToProject}
          className="flex items-center gap-2"
        >
          <input type="hidden" name="creativeId" value={creativeId} />
          <select
            name="projectId"
            defaultValue={currentProjectId ?? "none"}
            onChange={() => formRef.current?.requestSubmit()}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
          >
            <option value="none">— Kein Projekt —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {projects.length === 0 && (
            <Link
              href="/dashboard/projects"
              className="text-xs font-medium text-blue-700 hover:text-blue-900"
            >
              Erst Projekt anlegen →
            </Link>
          )}
        </form>
      </div>
    </section>
  );
}
