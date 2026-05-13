"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  type ProjectActionState,
  createProject,
} from "./actions";

const initial: ProjectActionState = { ok: false };

export function CreateProjectForm() {
  const [state, formAction, pending] = useActionState(createProject, initial);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Nach erfolgreichem Anlegen: Form zurücksetzen + einklappen.
  const seen = useRef(false);
  useEffect(() => {
    if (state.ok && !seen.current) {
      seen.current = true;
      formRef.current?.reset();
      setTimeout(() => setOpen(false), 1200);
    }
    if (!state.ok) seen.current = false;
  }, [state.ok]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-800 hover:shadow"
      >
        <span className="text-lg">＋</span>
        Neues Projekt anlegen
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-blue-900/5"
    >
      <p className="text-sm font-semibold text-slate-900">Neues Projekt</p>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Name *
          </label>
          <input
            name="name"
            type="text"
            required
            maxLength={120}
            placeholder="z.B. Sommer-Kampagne 2026"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Beschreibung
          </label>
          <input
            name="description"
            type="text"
            maxLength={500}
            placeholder="optional"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
          />
        </div>
      </div>

      {state.error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          ✓ {state.message}
        </p>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-gradient-to-br from-blue-800 to-blue-950 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-900/30 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {pending ? "Erstelle…" : "Projekt erstellen"}
        </button>
      </div>
    </form>
  );
}
