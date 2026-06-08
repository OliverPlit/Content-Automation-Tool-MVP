"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/icon";
import {
  type ProjectActionState,
  deleteProject,
  updateProject,
} from "../actions";

const initial: ProjectActionState = { ok: false };

export function ProjectHeader({
  id,
  initialName,
  initialDescription,
  createdAt,
  creativeCount,
}: {
  id: string;
  initialName: string;
  initialDescription: string;
  createdAt: string;
  creativeCount: number;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(updateProject, initial);

  const [localName, setLocalName] = useState(initialName);
  const [localDesc, setLocalDesc] = useState(initialDescription);

  const seen = useRef(false);
  useEffect(() => {
    if (state.ok && !seen.current) {
      seen.current = true;
      setEditing(false);
    }
    if (!state.ok) seen.current = false;
  }, [state.ok]);

  return (
    <section className="mt-4">
      <div className="rounded-xl border border-[var(--color-line)] bg-white px-6 py-5">
        {editing ? (
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="id" value={id} />
            <div>
              <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
                Projekt-Name
              </label>
              <input
                name="name"
                type="text"
                required
                maxLength={120}
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                autoFocus
                className="mt-1 block w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-[15px] font-semibold tracking-tight text-[var(--foreground)] focus:border-[var(--foreground)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
                Beschreibung
              </label>
              <input
                name="description"
                type="text"
                maxLength={500}
                value={localDesc}
                onChange={(e) => setLocalDesc(e.target.value)}
                placeholder="optional"
                className="mt-1 block w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-[13px] text-[var(--foreground)] focus:border-[var(--foreground)] focus:outline-none"
              />
            </div>
            {state.error && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
                {state.error}
              </p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={pending}
                className="rounded-full bg-[var(--foreground)] px-3.5 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Speichere…" : "Speichern"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLocalName(initialName);
                  setLocalDesc(initialDescription);
                  setEditing(false);
                }}
                className="rounded-full border border-[var(--color-line)] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[var(--foreground)] hover:bg-[var(--color-surface)]"
              >
                Abbrechen
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
                {initialName}
              </h1>
              {initialDescription ? (
                <p className="mt-1 max-w-2xl text-[14px] text-[var(--color-muted)]">
                  {initialDescription}
                </p>
              ) : (
                <p className="mt-1 text-[14px] italic text-[var(--color-muted)]">
                  Keine Beschreibung
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-[var(--color-muted)]">
                <span className="rounded-full bg-[var(--color-surface)] px-2.5 py-0.5 font-medium text-[var(--foreground)]">
                  {creativeCount} Creative{creativeCount === 1 ? "" : "s"}
                </span>
                <span>
                  Angelegt am {new Date(createdAt).toLocaleDateString("de-DE")}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[var(--foreground)] hover:bg-[var(--color-surface)]"
            >
              <Icon name="pencil" className="size-3.5" />
              Bearbeiten
            </button>
          </div>
        )}
      </div>

      <DangerZone id={id} creativeCount={creativeCount} />
    </section>
  );
}

function DangerZone({
  id,
  creativeCount,
}: {
  id: string;
  creativeCount: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [mode, setMode] = useState<"keep" | "cascade">("keep");

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-slate-900">Gefahrenzone</p>
          <p className="text-[12px] text-slate-700/90">
            Projekt löschen entfernt die Zuordnung — die Creatives bleiben
            standardmäßig erhalten und landen in &bdquo;Ohne Projekt&ldquo;.
          </p>
        </div>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
          >
            Projekt löschen
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "keep" | "cascade")}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[12px] text-slate-900"
            >
              <option value="keep">Creatives behalten (empfohlen)</option>
              <option value="cascade">
                {creativeCount > 0
                  ? `Creatives MITLÖSCHEN (${creativeCount})`
                  : "Cascade-Delete"}
              </option>
            </select>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-full border border-[var(--color-line)] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[var(--foreground)] hover:bg-[var(--color-surface)]"
            >
              Abbrechen
            </button>
            <form action={deleteProject}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="mode" value={mode} />
              <button
                type="submit"
                className="rounded-full bg-slate-600 px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-slate-500"
              >
                Endgültig löschen
              </button>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}
