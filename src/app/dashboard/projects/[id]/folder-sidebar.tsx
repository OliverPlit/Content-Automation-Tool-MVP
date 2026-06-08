"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";

import { Icon, type IconName } from "@/components/icon";

import { BrandEditor } from "./brand-editor";
import {
  createFolder,
  deleteFolder,
  moveCreative,
  renameFolder,
  type FolderActionState,
} from "./folder-actions";
import { CREATIVE_DRAG_TYPE } from "./inline-studio-item";

export type FolderInfo = {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  position: number;
  brand_primary_color?: string | null;
  brand_accent_color?: string | null;
  brand_background_color?: string | null;
  brand_text_color?: string | null;
  brand_font_family?: string | null;
  brand_font_weight?: string | null;
};

const initial: FolderActionState = { ok: false };

export function FolderSidebar({
  projectId,
  folders,
  activeFolderId,
  totalCount,
  countNoFolder,
  countsByFolder,
}: {
  projectId: string;
  folders: FolderInfo[];
  activeFolderId: string;
  totalCount: number;
  countNoFolder: number;
  countsByFolder: Record<string, number>;
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createState, createAction, createPending] = useActionState(
    createFolder,
    initial,
  );
  const [renameState, renameAction, renamePending] = useActionState(
    renameFolder,
    initial,
  );

  // ─── Drag-and-Drop: Creative → Folder ─────────────────────────────────
  // Drop-Target merkt sich, ob der aktuelle Drag erlaubt ist (eigener MIME).
  const router = useRouter();
  const [movePending, startMove] = useTransition();
  const [hoverTarget, setHoverTarget] = useState<string | null>(null); // "" = Kein Ordner

  const moveTo = (creativeId: string, folderId: string) => {
    startMove(async () => {
      const fd = new FormData();
      fd.set("creativeId", creativeId);
      fd.set("folderId", folderId); // "" = aus Ordner rausnehmen
      fd.set("projectId", projectId);
      fd.set("redirectPath", `/dashboard/projects/${projectId}`);
      const res = await moveCreative({ ok: false }, fd);
      if (res.ok) router.refresh();
      // Fehler: bewusst still — der nächste Drop kann es nochmal versuchen.
      // Wenn wir hier laut werden wollen, lieber Toast statt Inline-Error
      // in der Sidebar.
    });
  };

  return (
    <aside className="rounded-xl border border-[var(--color-line)] bg-white p-2.5 text-[13px]">
      <p className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
        Kampagnen / Ordner
      </p>

      <nav className="space-y-0.5">
        <FolderLink
          href={`/dashboard/projects/${projectId}`}
          label="Alle"
          icon="rectangle-grid"
          active={!activeFolderId}
          count={totalCount}
        />
        <DropZone
          targetFolderId=""
          hoverTarget={hoverTarget}
          setHoverTarget={setHoverTarget}
          onDrop={(cid) => moveTo(cid, "")}
          pending={movePending}
        >
          <FolderLink
            href={`/dashboard/projects/${projectId}?folder=none`}
            label="Kein Ordner"
            icon="folder-open"
            active={activeFolderId === "none"}
            count={countNoFolder}
          />
        </DropZone>
        {folders.map((f) => {
          const isEditing = editingId === f.id;
          return (
            <DropZone
              key={f.id}
              targetFolderId={f.id}
              hoverTarget={hoverTarget}
              setHoverTarget={setHoverTarget}
              onDrop={(cid) => moveTo(cid, f.id)}
              pending={movePending}
            >
              <FolderRow
                folder={f}
                projectId={projectId}
                isActive={activeFolderId === f.id}
                count={countsByFolder[f.id] ?? 0}
                isEditing={isEditing}
                onStartEdit={() => setEditingId(f.id)}
                onCancelEdit={() => setEditingId(null)}
                renameAction={renameAction}
                renamePending={renamePending}
              />
            </DropZone>
          );
        })}

        {renameState.error && (
          <p className="mt-1 px-2 text-[10px] text-slate-700">
            {renameState.error}
          </p>
        )}
      </nav>

      <div className="mt-3 border-t border-[var(--color-line)] pt-2">
        {creating ? (
          <form
            action={createAction}
            onSubmit={() => setCreating(false)}
            className="space-y-1"
          >
            <input type="hidden" name="projectId" value={projectId} />
            <input
              type="text"
              name="name"
              required
              autoFocus
              placeholder="z. B. Frühjahr 2026"
              className="block w-full rounded-md border border-[var(--color-line)] px-2 py-1 text-[12px] focus:border-[var(--foreground)] focus:outline-none"
            />
            <div className="flex gap-1">
              <button
                type="submit"
                disabled={createPending}
                className="flex-1 rounded-full bg-[var(--foreground)] px-2 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {createPending ? "Lege an…" : "Anlegen"}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-full border border-[var(--color-line)] px-2 py-1 text-[11px] text-[var(--foreground)] hover:bg-[var(--color-surface)]"
              >
                Abbrechen
              </button>
            </div>
            {createState.error && (
              <p className="text-[10px] text-slate-700">{createState.error}</p>
            )}
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[var(--color-line)] px-2 py-2 text-[11px] font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--foreground)]"
          >
            <Icon name="plus" className="size-3" />
            Neuer Ordner
          </button>
        )}
      </div>
    </aside>
  );
}

function FolderRow({
  folder,
  projectId,
  isActive,
  count,
  isEditing,
  onStartEdit,
  onCancelEdit,
  renameAction,
  renamePending,
}: {
  folder: FolderInfo;
  projectId: string;
  isActive: boolean;
  count: number;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  renameAction: (formData: FormData) => void;
  renamePending: boolean;
}) {
  const [brandOpen, setBrandOpen] = useState(false);
  const hasBrand = Boolean(
    folder.brand_primary_color ||
      folder.brand_accent_color ||
      folder.brand_background_color ||
      folder.brand_text_color ||
      folder.brand_font_family,
  );

  return (
    <div className={"group rounded-md " + (isEditing ? "bg-slate-50 px-1.5 py-0.5" : "")}>
      {isEditing ? (
        <form
          action={renameAction}
          className="flex items-center gap-1"
          onSubmit={onCancelEdit}
        >
          <input type="hidden" name="folderId" value={folder.id} />
          <input type="hidden" name="projectId" value={projectId} />
          <input
            type="text"
            name="name"
            defaultValue={folder.name}
            autoFocus
            className="flex-1 rounded-md border border-[var(--foreground)] px-2 py-0.5 text-xs focus:outline-none"
          />
          <button
            type="submit"
            disabled={renamePending}
            className="text-[var(--foreground)] hover:opacity-70"
            title="Speichern"
          >
            <Icon name="check" className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            className="text-[var(--color-muted)] hover:text-[var(--foreground)]"
            title="Abbrechen"
          >
            <Icon name="x" className="size-3.5" />
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-1">
          <FolderLink
            href={`/dashboard/projects/${projectId}?folder=${folder.id}`}
            label={folder.name}
            icon="folder"
            active={isActive}
            count={count}
            className="flex-1"
          />
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={() => setBrandOpen((v) => !v)}
              className={
                "p-1 " +
                (hasBrand
                  ? "text-[var(--foreground)] hover:opacity-70"
                  : "text-[var(--color-muted)] hover:text-[var(--foreground)]")
              }
              title="Brand-Stil (Farben + Schrift)"
            >
              <Icon name="palette" className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={onStartEdit}
              className="p-1 text-[var(--color-muted)] hover:text-[var(--foreground)]"
              title="Umbenennen"
            >
              <Icon name="pencil" className="size-3.5" />
            </button>
            <form action={deleteFolder} className="inline">
              <input type="hidden" name="folderId" value={folder.id} />
              <input type="hidden" name="projectId" value={projectId} />
              <button
                type="submit"
                onClick={(e) => {
                  if (
                    !window.confirm(
                      `Ordner „${folder.name}" löschen? Creatives darin verlieren ihre Ordner-Zuordnung (bleiben aber im Projekt).`,
                    )
                  ) {
                    e.preventDefault();
                  }
                }}
                className="p-1 text-[var(--color-muted)] hover:text-slate-600"
                title="Löschen"
              >
                <Icon name="trash" className="size-3.5" />
              </button>
            </form>
          </div>
        </div>
      )}

      {brandOpen && !isEditing && (
        <BrandEditor folder={folder} projectId={projectId} />
      )}
    </div>
  );
}

/**
 * DropZone — umschließt eine Folder-Row und nimmt Creative-Drops entgegen.
 *
 * Akzeptiert nur Drags mit unserem eigenen MIME-Type `CREATIVE_DRAG_TYPE`.
 * Hover-Highlight via shared `hoverTarget`-State (so kann immer nur EINE
 * Row gleichzeitig leuchten).
 *
 * `targetFolderId === ""` bedeutet „aus Ordner rausnehmen" (Drop auf „Kein
 * Ordner").
 */
function DropZone({
  targetFolderId,
  hoverTarget,
  setHoverTarget,
  onDrop,
  pending,
  children,
}: {
  targetFolderId: string;
  hoverTarget: string | null;
  setHoverTarget: (v: string | null) => void;
  onDrop: (creativeId: string) => void;
  pending: boolean;
  children: React.ReactNode;
}) {
  // dataTransfer.types ist ein DOMStringList — `.includes` gibt's nicht,
  // aber `.contains`. Wir holen uns Array.from für Safety.
  const isOurType = (e: React.DragEvent) =>
    Array.from(e.dataTransfer.types).includes(CREATIVE_DRAG_TYPE);

  const active = hoverTarget === targetFolderId;

  return (
    <div
      onDragOver={(e) => {
        if (!isOurType(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (hoverTarget !== targetFolderId) setHoverTarget(targetFolderId);
      }}
      onDragLeave={(e) => {
        // Nur entkürzen wenn der Cursor wirklich raus aus dem Drop-Container ist
        // (sonst feuern Kinder-Elemente DragLeave und wir flackern).
        if (
          e.currentTarget.contains(e.relatedTarget as Node | null) === false &&
          hoverTarget === targetFolderId
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
        "rounded-md transition-all " +
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

function FolderLink({
  href,
  label,
  icon,
  active,
  count,
  className,
}: {
  href: string;
  label: string;
  icon: IconName;
  active: boolean;
  count: number;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={
        "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors " +
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
          (active ? "bg-white/15 text-white" : "bg-[var(--color-surface)] text-[var(--color-muted)]")
        }
      >
        {count}
      </span>
    </Link>
  );
}
