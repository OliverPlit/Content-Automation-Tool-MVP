"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { assignCreativeToProject } from "../../projects/actions";

export type ProjectOption = { id: string; name: string };

export function ProjectPicker({
  creativeId,
  currentProjectId,
  currentFolderId,
  projects,
}: {
  creativeId: string;
  currentProjectId: string | null;
  currentFolderId?: string | null;
  projects: ProjectOption[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [projectId, setProjectId] = useState<string>(
    currentProjectId ?? "none",
  );
  const [folderId, setFolderId] = useState<string>(currentFolderId ?? "none");
  const [folders, setFolders] = useState<ProjectOption[]>([]);

  const current = projects.find((p) => p.id === currentProjectId) ?? null;

  // Folder laden wenn ein Projekt aktiv ist
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (projectId === "none") {
      setFolders([]);
      return;
    }
    fetch(`/api/projects/${projectId}/folders`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { folders?: ProjectOption[] }) => {
        if (Array.isArray(j.folders)) setFolders(j.folders);
      })
      .catch(() => setFolders([]));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [projectId]);

  const currentFolder = folders.find((f) => f.id === currentFolderId) ?? null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-md shadow-blue-900/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Projekt {currentFolder ? "· Ordner" : ""}
          </p>
          {current ? (
            <Link
              href={`/dashboard/projects/${current.id}${
                currentFolderId ? `?folder=${currentFolderId}` : ""
              }`}
              className="mt-0.5 inline-flex items-center gap-1 text-sm font-semibold text-blue-800 hover:text-blue-950 hover:underline"
            >
              📁 {current.name}
              {currentFolder && (
                <span className="ml-1 text-slate-600">
                  / 📂 {currentFolder.name}
                </span>
              )}
            </Link>
          ) : (
            <p className="mt-0.5 text-sm italic text-slate-500">Kein Projekt</p>
          )}
        </div>

        <form
          ref={formRef}
          action={assignCreativeToProject}
          className="flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="creativeId" value={creativeId} />
          <select
            name="projectId"
            value={projectId}
            onChange={(e) => {
              const v = e.target.value;
              setProjectId(v);
              setFolderId("none"); // bei Projektwechsel Folder zurücksetzen
              // Submit erst nach State-Update via setTimeout, sodass das
              // Folder-Reset im Form-Submit landet.
              setTimeout(() => formRef.current?.requestSubmit(), 0);
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
          >
            <option value="none">— Kein Projekt —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {projectId !== "none" && (
            <select
              name="folderId"
              value={folderId}
              onChange={(e) => {
                setFolderId(e.target.value);
                setTimeout(() => formRef.current?.requestSubmit(), 0);
              }}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
            >
              <option value="none">— Kein Ordner —</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  📂 {f.name}
                </option>
              ))}
            </select>
          )}

          {/* Wenn user folder ändert ohne project zu wechseln, müssen wir
              folderId trotzdem im Form drinnen haben: */}
          {projectId === "none" && (
            <input type="hidden" name="folderId" value="none" />
          )}

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
