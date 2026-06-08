"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/icon";

import { deleteCreative } from "./actions";
import { moveCreative } from "../projects/[id]/folder-actions";
import type { ProjectOption } from "./creatives-column";

/**
 * Shared MIME-Type für Creative-Drag-Operationen.
 * Wird sowohl im Studio (Library) als auch im Posts-Kanban genutzt — über
 * diesen Constant importiert, damit der Wert nicht an mehreren Stellen
 * sync gehalten werden muss.
 */
export const CREATIVE_DRAG_TYPE = "application/x-content-tool-creative";

/**
 * Studio-Liste-Item.
 *
 * Klick → Detail öffnen. Hat das Creative ein Projekt, öffnet es im
 *   projekt-scoped Editor (/dashboard/projects/<pid>/edit/<cid>), sonst in
 *   der generischen Library-Subroute (/dashboard/library/<id>).
 * Drag → setzt creativeId in DataTransfer → ProjectTree-Drop-Zones moven
 *   das Creative in den getroffenen Folder/Projekt.
 * ⋮-Menü → Verschieben (Projekt-Zuordnung) + Löschen, direkt aus der Leiste.
 */
export function StudioListItem({
  id,
  headline,
  subline,
  thumb,
  createdAt,
  projectId,
  projects,
}: {
  id: string;
  headline: string;
  subline: string;
  thumb: string | null;
  createdAt: string;
  projectId: string | null;
  projects: ProjectOption[];
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const [dragging, setDragging] = useState(false);

  // Bug-Fix: Beim Öffnen eines Creatives müssen die Projekt-/Folder-Filter
  // (`?project=`, `?folder=`) erhalten bleiben — sonst springt die linke
  // Spalte beim Klick zurück auf „Alle Creatives" und der ausgewählte Ordner
  // im Tree verliert das Highlight.
  // Wir hängen alle aktuellen Such-Params an die Detail-Subroute an. Der
  // Detail-Slot ignoriert sie (er liest nur seine Path-Params), aber
  // ProjectTree + CreativesColumn (beide useSearchParams) sehen sie weiter
  // und bleiben im aktuellen Scope.
  const carryParams = (() => {
    const next = new URLSearchParams(search.toString());
    // `creative` ist nur fürs alte ?creative=-Pattern — auf der Detail-
    // Subroute brauchen wir's nicht.
    next.delete("creative");
    const qs = next.toString();
    return qs ? `?${qs}` : "";
  })();

  // Projekt-Zuordnung steuert das Ziel: mit Projekt → projekt-scoped Studio,
  // ohne → generische Library-Subroute (mit erhaltenen Filtern).
  const detailPath = projectId
    ? `/dashboard/projects/${projectId}/edit/${id}`
    : `/dashboard/library/${id}`;
  const href = projectId ? detailPath : `${detailPath}${carryParams}`;
  const active = pathname === detailPath;

  const date = new Date(createdAt).toLocaleDateString("de-DE", {
    day: "numeric",
    month: "short",
  });

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(CREATIVE_DRAG_TYPE, id);
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      className={
        "group/item relative flex items-stretch border-b border-[var(--color-line)] " +
        (dragging ? "opacity-40 " : "") +
        (active ? "bg-[var(--color-surface)]" : "hover:bg-[var(--color-surface)]")
      }
    >
      <Link
        href={href}
        scroll={false}
        className="flex min-w-0 flex-1 cursor-grab items-start gap-3 py-2.5 pl-4 pr-1 transition-colors active:cursor-grabbing"
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            className="h-10 w-10 shrink-0 rounded border border-[var(--color-line)] object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] text-[9px] text-[var(--color-muted)]">
            —
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-[var(--foreground)]">
            {headline}
          </p>
          {subline && (
            <p className="truncate text-[11px] text-[var(--color-muted)]">
              {subline}
            </p>
          )}
          <p className="mt-0.5 text-[10px] tabular-nums text-[var(--color-muted)]">
            {date}
          </p>
        </div>
      </Link>

      <RowMenu
        creativeId={id}
        currentProjectId={projectId}
        projects={projects}
        onMoved={() => router.refresh()}
      />
    </li>
  );
}

// ---------------------------------------------------------------------------
// RowMenu — ⋮-Kebab mit „Verschieben nach …" + „Löschen".
// Das Panel rendert per Portal als position:fixed, damit es nicht vom
// overflow-y-auto der Leiste abgeschnitten wird.
// ---------------------------------------------------------------------------
const MENU_W = 220;
const MENU_MAX_H = 340;

function RowMenu({
  creativeId,
  currentProjectId,
  projects,
  onMoved,
}: {
  creativeId: string;
  currentProjectId: string | null;
  projects: ProjectOption[];
  onMoved: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startMove] = useTransition();

  const openMenu = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) {
      // Nach unten öffnen; bei zu wenig Platz nach oben kippen.
      const top =
        r.bottom + 4 + MENU_MAX_H > window.innerHeight
          ? Math.max(8, r.top - 4 - MENU_MAX_H)
          : r.bottom + 4;
      const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8));
      setPos({ top, left });
    }
    setConfirmDelete(false);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setConfirmDelete(false);
  };

  // Schließen bei Escape, Scroll und Resize (Position würde sonst veralten).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onScrollOrResize = () => close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open]);

  const move = (targetProjectId: string) => {
    if (targetProjectId === (currentProjectId ?? "")) {
      close();
      return;
    }
    startMove(async () => {
      const fd = new FormData();
      fd.set("creativeId", creativeId);
      fd.set("projectId", targetProjectId); // "" = aus Projekt nehmen
      fd.set("folderId", ""); // Ordner-genau bleibt Drag&Drop
      fd.set("redirectPath", "/dashboard/library");
      const res = await moveCreative({ ok: false }, fd);
      if (res.ok) {
        close();
        onMoved();
      }
    });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Aktionen"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) close();
          else openMenu();
        }}
        className={
          "mr-1.5 my-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-muted)] transition-colors hover:bg-[var(--color-line)] hover:text-[var(--foreground)] focus:outline-none focus-visible:bg-[var(--color-line)] " +
          (open ? "bg-[var(--color-line)] text-[var(--foreground)]" : "opacity-0 group-hover/item:opacity-100")
        }
      >
        <Icon name="ellipsis-vertical" className="size-4" fill="currentColor" />
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            {/* Backdrop — Klick außerhalb schließt */}
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              onClick={close}
              className="fixed inset-0 z-40 cursor-default"
            />
            <div
              role="menu"
              style={{ top: pos.top, left: pos.left, width: MENU_W, maxHeight: MENU_MAX_H }}
              className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-white shadow-lg shadow-slate-900/10"
            >
              <p className="px-3 pt-2.5 pb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
                Verschieben nach
              </p>
              <div className="max-h-[200px] overflow-y-auto pb-1">
                <MoveOption
                  label="Kein Projekt"
                  icon="folder-open"
                  selected={!currentProjectId}
                  disabled={pending}
                  onClick={() => move("")}
                />
                {projects.map((p) => (
                  <MoveOption
                    key={p.id}
                    label={p.name}
                    icon="folder"
                    selected={currentProjectId === p.id}
                    disabled={pending}
                    onClick={() => move(p.id)}
                  />
                ))}
                {projects.length === 0 && (
                  <p className="px-3 py-1.5 text-[11px] italic text-[var(--color-muted)]">
                    Noch keine Projekte.
                  </p>
                )}
              </div>

              <div className="border-t border-[var(--color-line)]" />

              {confirmDelete ? (
                <form action={deleteCreative} className="flex items-center gap-1 p-2">
                  <input type="hidden" name="id" value={creativeId} />
                  <button
                    type="submit"
                    className="flex-1 rounded-md bg-red-600 px-2 py-1.5 text-[12px] font-medium text-white hover:bg-red-500"
                  >
                    Wirklich löschen
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-md border border-[var(--color-line)] px-2 py-1.5 text-[12px] font-medium text-[var(--foreground)] hover:bg-[var(--color-surface)]"
                  >
                    Abbrechen
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 px-3 py-2 text-left text-[12px] font-medium text-red-600 hover:bg-red-50"
                >
                  <Icon name="trash" className="size-3.5" />
                  Löschen
                </button>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

function MoveOption({
  label,
  icon,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  icon: "folder" | "folder-open";
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] transition-colors disabled:opacity-50 " +
        (selected
          ? "font-medium text-[var(--foreground)]"
          : "text-[var(--foreground)] hover:bg-[var(--color-surface)]")
      }
    >
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        <Icon name={icon} className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      {selected && <Icon name="check" className="size-3.5 shrink-0" />}
    </button>
  );
}
