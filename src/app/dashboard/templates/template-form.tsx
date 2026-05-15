"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  ANGLES,
  IMAGE_STYLES,
  MACHINES,
  TONES,
  type PromptTemplateData,
} from "../generate/schema";
import {
  type TemplateActionState,
  createTemplate,
  updateTemplate,
} from "./actions";

const initial: TemplateActionState = { ok: false };

export function TemplateForm({
  mode,
  template,
  onClose,
}: {
  mode: "create" | "edit";
  template?: {
    id: string;
    name: string;
    description: string | null;
    template_data: PromptTemplateData | null;
  };
  onClose?: () => void;
}) {
  const isEdit = mode === "edit";
  const [state, formAction, pending] = useActionState(
    isEdit ? updateTemplate : createTemplate,
    initial,
  );

  const [open, setOpen] = useState(isEdit);
  const formRef = useRef<HTMLFormElement>(null);

  // Auto-close after successful save
  const seen = useRef(false);
  useEffect(() => {
    if (state.ok && !seen.current) {
      seen.current = true;
      if (!isEdit) {
        formRef.current?.reset();
        setTimeout(() => setOpen(false), 800);
      } else if (onClose) {
        setTimeout(onClose, 600);
      }
    }
    if (!state.ok) seen.current = false;
  }, [state.ok, isEdit, onClose]);

  // Defaults aus template laden (Edit-Modus)
  const d = template?.template_data ?? null;

  if (!isEdit && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-800 hover:shadow"
      >
        <span className="text-lg">＋</span>
        Neue Vorlage anlegen
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-blue-900/5"
    >
      {isEdit && template && (
        <input type="hidden" name="id" value={template.id} />
      )}

      <p className="text-sm font-semibold text-slate-900">
        {isEdit ? "Vorlage bearbeiten" : "Neue Vorlage"}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Vorlagen-Name *
          </label>
          <input
            name="name"
            type="text"
            required
            maxLength={120}
            defaultValue={template?.name ?? ""}
            placeholder="z.B. Sommer-Aktion Landwirte"
            className={inputCls}
            autoFocus={!isEdit}
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Kurzbeschreibung
          </label>
          <input
            name="description"
            type="text"
            maxLength={500}
            defaultValue={template?.description ?? ""}
            placeholder="optional"
            className={inputCls}
          />
        </div>
      </div>

      {/* Vorbelegte Generate-Felder */}
      <p className="mt-5 text-xs font-medium uppercase tracking-wide text-slate-500">
        Vor-Befüllung fürs Generate-Form (alles optional)
      </p>
      <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className={labelCls}>Produkt / Service</label>
          <textarea
            name="data_product"
            rows={2}
            maxLength={500}
            defaultValue={d?.product ?? ""}
            placeholder="z.B. WODOIL Hydrauliköl HLP 46"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Zielgruppe</label>
          <input
            name="data_audience"
            type="text"
            maxLength={300}
            defaultValue={d?.audience ?? ""}
            placeholder="z.B. Landwirte mit Werkstatt"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Ton</label>
          <select name="data_tone" defaultValue={d?.tone ?? ""} className={inputCls}>
            <option value="">— nicht vorbelegen —</option>
            {TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Maschinen-Kontext</label>
          <select
            name="data_machine"
            defaultValue={d?.machine ?? ""}
            className={inputCls}
          >
            <option value="">— nicht vorbelegen —</option>
            {MACHINES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Werbe-Angle</label>
          <select
            name="data_angle"
            defaultValue={d?.angle ?? ""}
            className={inputCls}
          >
            <option value="">— nicht vorbelegen —</option>
            {ANGLES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Bild-Stil</label>
          <select
            name="data_imageStyle"
            defaultValue={d?.imageStyle ?? ""}
            className={inputCls}
          >
            <option value="">— nicht vorbelegen —</option>
            {IMAGE_STYLES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Anzahl Varianten</label>
          <input
            name="data_variantCount"
            type="number"
            min={1}
            max={10}
            defaultValue={d?.variantCount ?? ""}
            placeholder="leer = Default 3"
            className={inputCls}
          />
        </div>
      </div>

      {state.error && (
        <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-md bg-red-50 px-3 py-2 font-sans text-xs text-red-700">
          {state.error}
        </pre>
      )}
      {state.ok && state.message && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          ✓ {state.message}
        </p>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        {!isEdit && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Abbrechen
          </button>
        )}
        {isEdit && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Abbrechen
          </button>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-gradient-to-br from-blue-800 to-blue-950 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-900/30 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {pending
            ? "Speichere…"
            : isEdit
              ? "Änderungen speichern"
              : "Vorlage erstellen"}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700";
const labelCls =
  "block text-[10px] font-semibold uppercase tracking-wide text-slate-500";
