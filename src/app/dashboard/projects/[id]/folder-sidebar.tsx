"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { BrandEditor } from "./brand-editor";
import {
  createFolder,
  deleteFolder,
  renameFolder,
  type FolderActionState,
} from "./folder-actions";

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

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
      <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Kampagnen / Ordner
      </p>

      <nav className="space-y-0.5">
        <FolderLink
          href={`/dashboard/projects/${projectId}`}
          label="Alle"
          emoji="🗂"
          active={!activeFolderId}
          count={totalCount}
        />
        <FolderLink
          href={`/dashboard/projects/${projectId}?folder=none`}
          label="Kein Ordner"
          emoji="📂"
          active={activeFolderId === "none"}
          count={countNoFolder}
        />
        {folders.map((f) => {
          const isEditing = editingId === f.id;
          return (
            <FolderRow
              key={f.id}
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
          );
        })}

        {renameState.error && (
          <p className="mt-1 px-2 text-[10px] text-red-700">
            {renameState.error}
          </p>
        )}
      </nav>

      <div className="mt-3 border-t border-slate-100 pt-2">
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
              className="block w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-blue-700 focus:outline-none"
            />
            <div className="flex gap-1">
              <button
                type="submit"
                disabled={createPending}
                className="flex-1 rounded-md bg-blue-700 px-2 py-1 text-[10px] font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {createPending ? "Lege an…" : "Anlegen"}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-md border border-slate-300 px-2 py-1 text-[10px] text-slate-700 hover:bg-slate-50"
              >
                Abbrechen
              </button>
            </div>
            {createState.error && (
              <p className="text-[10px] text-red-700">{createState.error}</p>
            )}
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="w-full rounded-md border border-dashed border-slate-300 px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:border-blue-400 hover:text-blue-800"
          >
            + Neuer Ordner
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
    <div className={"group rounded-md " + (isEditing ? "bg-blue-50 px-1.5 py-0.5" : "")}>
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
            className="flex-1 rounded-md border border-blue-300 px-2 py-0.5 text-xs focus:border-blue-700 focus:outline-none"
          />
          <button
            type="submit"
            disabled={renamePending}
            className="text-[10px] text-blue-700 hover:text-blue-900"
          >
            ✓
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            className="text-[10px] text-slate-500 hover:text-slate-800"
          >
            ✕
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-1">
          <FolderLink
            href={`/dashboard/projects/${projectId}?folder=${folder.id}`}
            label={folder.name}
            emoji="📁"
            active={isActive}
            count={count}
            className="flex-1"
          />
          <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={() => setBrandOpen((v) => !v)}
              className={
                "px-1 text-[10px] " +
                (hasBrand
                  ? "text-amber-600 hover:text-amber-800"
                  : "text-slate-500 hover:text-amber-700")
              }
              title="Brand-Stil (Farben + Schrift)"
            >
              🎨
            </button>
            <button
              type="button"
              onClick={onStartEdit}
              className="px-1 text-[10px] text-slate-500 hover:text-blue-700"
              title="Umbenennen"
            >
              ✎
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
                className="px-1 text-[10px] text-slate-500 hover:text-red-700"
                title="Löschen"
              >
                🗑
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

function FolderLink({
  href,
  label,
  emoji,
  active,
  count,
  className,
}: {
  href: string;
  label: string;
  emoji: string;
  active: boolean;
  count: number;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={
        "flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs transition " +
        (active
          ? "bg-blue-700 text-white"
          : "text-slate-700 hover:bg-slate-100") +
        (className ? " " + className : "")
      }
    >
      <span className="truncate">
        <span className="mr-1">{emoji}</span>
        {label}
      </span>
      <span
        className={
          "rounded-full px-1.5 text-[10px] font-bold " +
          (active ? "bg-blue-900 text-white" : "bg-slate-100 text-slate-600")
        }
      >
        {count}
      </span>
    </Link>
  );
}
