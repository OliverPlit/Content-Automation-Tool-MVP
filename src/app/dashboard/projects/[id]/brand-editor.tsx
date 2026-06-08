"use client";

import { useActionState, useState } from "react";

import {
  COLOR_PRESETS,
  FONT_OPTIONS,
  WEIGHT_OPTIONS,
} from "./brand-constants";
import { updateFolderBrand, type FolderActionState } from "./folder-actions";
import type { FolderInfo } from "./folder-sidebar";

const initial: FolderActionState = { ok: false };

export function BrandEditor({
  folder,
  projectId,
}: {
  folder: FolderInfo;
  projectId: string;
}) {
  const [state, action, pending] = useActionState(updateFolderBrand, initial);
  const [primary, setPrimary] = useState(folder.brand_primary_color ?? "");
  const [accent, setAccent] = useState(folder.brand_accent_color ?? "");
  const [bg, setBg] = useState(folder.brand_background_color ?? "");
  const [text, setText] = useState(folder.brand_text_color ?? "");
  const [font, setFont] = useState(folder.brand_font_family ?? "");
  const [weight, setWeight] = useState(folder.brand_font_weight ?? "");

  const applyPreset = (p: (typeof COLOR_PRESETS)[number]) => {
    setPrimary(p.primaryColor);
    setAccent(p.accentColor);
    setBg(p.backgroundColor);
    setText(p.textColor);
  };

  return (
    <form
      action={action}
      className="mt-1 space-y-2 rounded-md border border-slate-200 bg-slate-50/40 p-2"
    >
      <input type="hidden" name="folderId" value={folder.id} />
      <input type="hidden" name="projectId" value={projectId} />

      {/* Live-Preview-Tile */}
      <div
        className="flex items-center justify-center rounded-md border border-slate-200 px-2 py-3 text-center"
        style={{
          backgroundColor: bg || "#FFFFFF",
          color: text || "#0F172A",
          fontFamily: font || undefined,
          fontWeight: (weight as React.CSSProperties["fontWeight"]) || undefined,
        }}
      >
        <div className="text-xs">
          <p style={{ fontSize: 14 }}>Headline-Beispiel</p>
          <p style={{ fontSize: 9, marginTop: 2, opacity: 0.7 }}>
            Subline mit Zahl/Spec
          </p>
          <p
            className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[9px]"
            style={{
              backgroundColor: primary || "#0F172A",
              color: text || "#FFFFFF",
            }}
          >
            JETZT KAUFEN
          </p>
        </div>
      </div>

      {/* Presets */}
      <div>
        <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-900/80">
          Quick-Start
        </p>
        <div className="flex flex-wrap gap-1">
          {COLOR_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => applyPreset(p)}
              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] hover:border-slate-400"
              title={p.name}
            >
              <span
                className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                style={{ backgroundColor: p.primaryColor }}
              />
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-1.5">
        <ColorInput
          name="primaryColor"
          label="Primary"
          value={primary}
          onChange={setPrimary}
        />
        <ColorInput
          name="accentColor"
          label="Accent"
          value={accent}
          onChange={setAccent}
        />
        <ColorInput
          name="backgroundColor"
          label="Background"
          value={bg}
          onChange={setBg}
        />
        <ColorInput
          name="textColor"
          label="Text"
          value={text}
          onChange={setText}
        />
      </div>

      {/* Font */}
      <div>
        <label className="block text-[9px] font-semibold uppercase tracking-wide text-slate-900/80">
          Schriftart
        </label>
        <select
          name="fontFamily"
          value={font}
          onChange={(e) => setFont(e.target.value)}
          className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1 text-[11px] focus:border-slate-700 focus:outline-none"
        >
          <option value="">— Template-Default —</option>
          {FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label} · {f.preview}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[9px] font-semibold uppercase tracking-wide text-slate-900/80">
          Gewicht
        </label>
        <select
          name="fontWeight"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1 text-[11px] focus:border-slate-700 focus:outline-none"
        >
          <option value="">— Template-Default —</option>
          {WEIGHT_OPTIONS.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
      </div>

      {state.error && (
        <p className="rounded bg-slate-50 px-2 py-0.5 text-[10px] text-slate-700">
          {state.error}
        </p>
      )}
      {state.ok && state.folderId === folder.id && (
        <p className="rounded bg-slate-50 px-2 py-0.5 text-[10px] text-slate-800">
          ✓ Gespeichert · gilt für neue Renders
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-slate-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Speichere…" : "Brand speichern"}
      </button>
    </form>
  );
}

function ColorInput({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[9px] font-semibold uppercase tracking-wide text-slate-900/80">
        {label}
      </span>
      <div className="mt-0.5 flex items-center gap-1">
        <input
          type="color"
          value={value && value.startsWith("#") ? value : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-7 w-7 cursor-pointer rounded border border-slate-300 bg-white"
        />
        <input
          type="text"
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#0F172A"
          className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-[10px] focus:border-slate-700 focus:outline-none"
        />
      </div>
    </label>
  );
}
