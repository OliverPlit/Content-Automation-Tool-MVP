"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useState, useTransition } from "react";

import { Icon } from "@/components/icon";

import { createProject } from "../projects/actions";
import {
  createFolder,
  moveCreative,
  type FolderActionState,
} from "../projects/[id]/folder-actions";
import { CREATIVE_DRAG_TYPE } from "./studio-list-item";

export type StudioFolder = {
  id: string;
  name: string;
  count: number;
};

export type StudioProject = {
  id: string;
  name: string;
  totalCount: number;
  countNoFolder: number;
  folders: StudioFolder[];
};

const initialFolderState: FolderActionState = { ok: false };

/**
 * Project-Tree für das Studio.
 *
 * Liste links der 3-Spalten-Studio-Ansicht. Filtert die Creatives-Mid-Column
 * via ?project=&folder= Searchparams. Erlaubt Folder-CRUD inline.
 *
 * Drop-Targets:
 *   - Projekt-Header        → setzt project_id, folder_id = NULL
 *   - Folder-Row            → setzt project_id (= folder.project_id) + folder_id
 *   - „Kein Projekt"-Pseudo → setzt project_id = NULL + folder_id = NULL
 */
export function ProjectTree({
  projects,
  countAll,
  countOrphans,
}: {
  projects: StudioProject[];
  countAll: number;
  countOrphans: number;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();

  const activeProject = search.get("project") ?? "";
  const activeFolder = search.get("folder") ?? "";
  const noProjectFilter = !activeProject;

  // Welche Projekte sind expanded? Default: das aktive Projekt offen.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(activeProject ? [activeProject] : []),
  );
  const toggle = (pid: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });

  // URL bauen: Projekt + Folder setzen oder löschen, andere Params (z.B.
  // einen geöffneten Creative-Detail-Param) übernehmen wir NICHT, weil das
  // Detail an die /<id>-Subroute gebunden ist. Wenn wir auf einer Subroute
  // sind, springt der Klick auf einen Folder zurück zur Hauptseite.
  const makeHref = (project: string | null, folder: string | null) => {
    const params = new URLSearchParams();
    if (project) params.set("project", project);
    if (folder) params.set("folder", folder);
    const qs = params.toString();
    return qs ? `/dashboard/library?${qs}` : "/dashboard/library";
  };

  // ─── Drag-and-Drop ────────────────────────────────────────────────────
  const [movePending, startMove] = useTransition();
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);

  const moveTo = (creativeId: string, projectId: string, folderId: string) => {
    startMove(async () => {
      const fd = new FormData();
      fd.set("creativeId", creativeId);
      fd.set("projectId", projectId); // "" = aus Projekt nehmen
      fd.set("folderId", folderId); // "" = kein Folder
      fd.set("redirectPath", "/dashboard/library");
      const res = await moveCreative({ ok: false }, fd);
      if (res.ok) router.refresh();
    });
  };

  return (
    <div className="flex h-full flex-col bg-white text-[13px]">
      <div className="border-b border-[var(--color-line)] px-3 py-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
          Projekte
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {/* Alle Creatives */}
        <TreeRow
          href={makeHref(null, null)}
          icon="rectangle-grid"
          label="Alle Creatives"
          count={countAll}
          active={noProjectFilter}
        />

        {/* Kein Projekt (Drop-Target: project=NULL, folder=NULL) */}
        <DropZone
          targetKey="orphans"
          hoverTarget={hoverTarget}
          setHoverTarget={setHoverTarget}
          onDrop={(cid) => moveTo(cid, "", "")}
          pending={movePending}
        >
          <TreeRow
            href={makeHref("none", null)}
            icon="folder-open"
            label="Kein Projekt"
            count={countOrphans}
            active={activeProject === "none"}
          />
        </DropZone>

        <div className="my-1 border-t border-[var(--color-line)]" />

        {/* Projekte */}
        {projects.map((p) => {
          const isOpen = expanded.has(p.id);
          const isActiveP =
            activeProject === p.id && !activeFolder;

          return (
            <div key={p.id}>
              {/* Projekt-Header: Drop = move to project (folder=null) */}
              <DropZone
                targetKey={`p:${p.id}`}
                hoverTarget={hoverTarget}
                setHoverTarget={setHoverTarget}
                onDrop={(cid) => moveTo(cid, p.id, "")}
                pending={movePending}
              >
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--foreground)]"
                    aria-label={isOpen ? "Einklappen" : "Ausklappen"}
                  >
                    <Icon
                      name={isOpen ? "chevron-down" : "chevron-right"}
                      className="size-3"
                    />
                  </button>
                  <TreeRow
                    href={makeHref(p.id, null)}
                    icon="folder"
                    label={p.name}
                    count={p.totalCount}
                    active={isActiveP}
                    className="flex-1"
                  />
                </div>
              </DropZone>

              {isOpen && (
                <div className="ml-5 mt-0.5 space-y-0.5 border-l border-[var(--color-line)] pl-1.5">
                  {/* Kein Ordner innerhalb des Projekts */}
                  <DropZone
                    targetKey={`p:${p.id}:none`}
                    hoverTarget={hoverTarget}
                    setHoverTarget={setHoverTarget}
                    onDrop={(cid) => moveTo(cid, p.id, "")}
                    pending={movePending}
                  >
                    <TreeRow
                      href={makeHref(p.id, "none")}
                      icon="folder-open"
                      label="Kein Ordner"
                      count={p.countNoFolder}
                      active={activeProject === p.id && activeFolder === "none"}
                      small
                    />
                  </DropZone>

                  {p.folders.map((f) => (
                    <DropZone
                      key={f.id}
                      targetKey={`f:${f.id}`}
                      hoverTarget={hoverTarget}
                      setHoverTarget={setHoverTarget}
                      onDrop={(cid) => moveTo(cid, p.id, f.id)}
                      pending={movePending}
                    >
                      <TreeRow
                        href={makeHref(p.id, f.id)}
                        icon="folder"
                        label={f.name}
                        count={f.count}
                        active={
                          activeProject === p.id && activeFolder === f.id
                        }
                        small
                      />
                    </DropZone>
                  ))}

                  <NewFolderInline projectId={p.id} />
                </div>
              )}
            </div>
          );
        })}

        <div className="mt-2 border-t border-[var(--color-line)] pt-2">
          <NewProjectInline />
        </div>

        {/* Pathname-Anker, damit React-Hook lint nicht meckert wenn nicht
            verwendet. Wert wird tatsächlich oben für nichts gebraucht; lassen
            wir das hier als sichtbare Notiz, falls wir später Pfad-basiertes
            Active-Highlight brauchen. */}
        <span hidden data-pathname={pathname ?? ""} />
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree-Row
// ---------------------------------------------------------------------------

function TreeRow({
  href,
  icon,
  label,
  count,
  active,
  className,
  small,
}: {
  href: string;
  icon: "rectangle-grid" | "folder-open" | "folder";
  label: string;
  count: number;
  active: boolean;
  className?: string;
  small?: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={
        "flex items-center justify-between gap-2 rounded-md px-2 py-1 transition-colors " +
        (small ? "text-[12px] " : "text-[12px] ") +
        (active
          ? "bg-[var(--foreground)] text-white"
          : "text-[var(--foreground)] hover:bg-[var(--color-surface)]") +
        (className ? " " + className : "")
      }
    >
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        <Icon name={icon} className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <span
        className={
          "rounded-full px-1.5 text-[10px] font-medium tabular-nums " +
          (active
            ? "bg-white/15 text-white"
            : "bg-[var(--color-surface)] text-[var(--color-muted)]")
        }
      >
        {count}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// DropZone
// ---------------------------------------------------------------------------

function DropZone({
  targetKey,
  hoverTarget,
  setHoverTarget,
  onDrop,
  pending,
  children,
}: {
  targetKey: string;
  hoverTarget: string | null;
  setHoverTarget: (v: string | null) => void;
  onDrop: (creativeId: string) => void;
  pending: boolean;
  children: React.ReactNode;
}) {
  const isOurType = (e: React.DragEvent) =>
    Array.from(e.dataTransfer.types).includes(CREATIVE_DRAG_TYPE);
  const active = hoverTarget === targetKey;

  return (
    <div
      onDragOver={(e) => {
        if (!isOurType(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (hoverTarget !== targetKey) setHoverTarget(targetKey);
      }}
      onDragLeave={(e) => {
        if (
          e.currentTarget.contains(e.relatedTarget as Node | null) === false &&
          hoverTarget === targetKey
        ) {
          setHoverTarget(null);
        }
      }}
      onDrop={(e) => {
        if (!isOurType(e)) return;
        e.preventDefault();
        const cid = e.dataTransfer.getData(CREATIVE_DRAG_TYPE);
        setHoverTarget(null);
        if (cid) onDrop(cid);
      }}
      className={
        "rounded-md transition " +
        (active
          ? "bg-[var(--color-surface)] ring-2 ring-[var(--foreground)] ring-offset-1"
          : "") +
        (pending && active ? " opacity-60" : "")
      }
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline-Forms: Folder + Projekt
// ---------------------------------------------------------------------------

function NewFolderInline({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(
    createFolder,
    initialFolderState,
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--foreground)]"
      >
        <Icon name="plus" className="size-3" />
        Neuer Ordner
      </button>
    );
  }
  return (
    <form action={action} onSubmit={() => setOpen(false)} className="space-y-1 px-1 py-1">
      <input type="hidden" name="projectId" value={projectId} />
      <input
        type="text"
        name="name"
        required
        autoFocus
        placeholder="Ordner-Name"
        className="block w-full rounded border border-[var(--color-line)] px-2 py-1 text-[11px] focus:border-[var(--foreground)] focus:outline-none"
      />
      <div className="flex gap-1">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-full bg-[var(--foreground)] px-2 py-0.5 text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "…" : "Anlegen"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full border border-[var(--color-line)] px-2 py-0.5 text-[10px] text-[var(--foreground)] hover:bg-[var(--color-surface)]"
        >
          ×
        </button>
      </div>
      {state.error && (
        <p className="text-[10px] text-slate-700">{state.error}</p>
      )}
    </form>
  );
}

function NewProjectInline() {
  const [state, action, pending] = useActionState(createProject, {
    ok: false,
  } as Awaited<ReturnType<typeof createProject>>);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[var(--color-line)] px-2 py-1.5 text-[11px] font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--foreground)]"
      >
        <Icon name="plus" className="size-3" />
        Neues Projekt
      </button>
    );
  }
  return (
    <form
      action={action}
      onSubmit={() => setOpen(false)}
      className="space-y-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] p-2"
    >
      <input
        type="text"
        name="name"
        required
        autoFocus
        placeholder="Projekt-Name"
        className="block w-full rounded border border-[var(--color-line)] bg-white px-2 py-1 text-[11px] focus:border-[var(--foreground)] focus:outline-none"
      />
      <input
        type="text"
        name="description"
        placeholder="Beschreibung (optional)"
        className="block w-full rounded border border-[var(--color-line)] bg-white px-2 py-1 text-[11px] focus:border-[var(--foreground)] focus:outline-none"
      />
      <div className="flex gap-1">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-full bg-[var(--foreground)] px-2 py-0.5 text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Erstelle…" : "Anlegen"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full border border-[var(--color-line)] px-2 py-0.5 text-[10px] text-[var(--foreground)] hover:bg-[var(--color-surface)]"
        >
          ×
        </button>
      </div>
      {state.error && (
        <p className="text-[10px] text-slate-700">{state.error}</p>
      )}
    </form>
  );
}
