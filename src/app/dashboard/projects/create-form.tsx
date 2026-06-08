"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/icon";
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
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-line)] bg-white px-4 py-3 text-[13px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--color-surface)]"
      >
        <Icon name="plus" className="size-4" />
        Neues Projekt anlegen
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-xl border border-[var(--color-line)] bg-white p-5"
    >
      <p className="text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
        Neues Projekt
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
            Name *
          </label>
          <input
            name="name"
            type="text"
            required
            maxLength={120}
            placeholder="z.B. Sommer-Kampagne 2026"
            className="mt-1 block w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-[13px] focus:border-[var(--foreground)] focus:outline-none"
            autoFocus
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
            placeholder="optional"
            className="mt-1 block w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-[13px] focus:border-[var(--foreground)] focus:outline-none"
          />
        </div>
      </div>

      {state.error && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
          <Icon name="check" className="size-3.5" /> {state.message}
        </p>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full border border-[var(--color-line)] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[var(--foreground)] hover:bg-[var(--color-surface)]"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-[var(--foreground)] px-4 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Erstelle…" : "Projekt erstellen"}
        </button>
      </div>
    </form>
  );
}
