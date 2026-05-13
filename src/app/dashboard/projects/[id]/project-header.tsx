"use client";

import { useActionState, useEffect, useRef, useState } from "react";

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
      <div className="rounded-2xl bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 px-6 py-7 text-white shadow-xl shadow-blue-900/20">
        {editing ? (
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="id" value={id} />
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-blue-200">
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
                className="mt-1 block w-full rounded-md border border-blue-700 bg-blue-950/40 px-3 py-2 text-base font-semibold text-white placeholder-blue-300 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-blue-200">
                Beschreibung
              </label>
              <input
                name="description"
                type="text"
                maxLength={500}
                value={localDesc}
                onChange={(e) => setLocalDesc(e.target.value)}
                placeholder="optional"
                className="mt-1 block w-full rounded-md border border-blue-700 bg-blue-950/40 px-3 py-2 text-sm text-white placeholder-blue-300 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
              />
            </div>
            {state.error && (
              <p className="rounded-md bg-red-100/10 px-3 py-2 text-xs text-red-200">
                {state.error}
              </p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 shadow hover:shadow-md disabled:opacity-60"
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
                className="rounded-md border border-blue-300/40 bg-transparent px-3 py-1.5 text-xs font-medium text-blue-100 hover:bg-white/10"
              >
                Abbrechen
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold tracking-tight">
                {initialName}
              </h1>
              {initialDescription ? (
                <p className="mt-1 max-w-2xl text-sm text-blue-100">
                  {initialDescription}
                </p>
              ) : (
                <p className="mt-1 text-sm italic text-blue-200/70">
                  Keine Beschreibung
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-blue-100">
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-semibold">
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
              className="shrink-0 rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
            >
              ✏️ Bearbeiten
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
    <section className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-red-900">Gefahrenzone</p>
          <p className="text-xs text-red-700">
            Projekt löschen entfernt die Zuordnung — die Creatives bleiben
            standardmäßig erhalten und landen in &bdquo;Ohne Projekt&ldquo;.
          </p>
        </div>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            Projekt löschen
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "keep" | "cascade")}
              className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs text-red-800"
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
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Abbrechen
            </button>
            <form action={deleteProject}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="mode" value={mode} />
              <button
                type="submit"
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
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
