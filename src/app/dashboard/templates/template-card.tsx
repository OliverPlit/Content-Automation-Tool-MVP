"use client";

import Link from "next/link";
import { useState } from "react";

import {
  ANGLES,
  IMAGE_STYLES,
  MACHINES,
  type PromptTemplateData,
} from "../generate/schema";
import { TemplateForm } from "./template-form";
import { deleteTemplate } from "./actions";

type Row = {
  id: string;
  name: string;
  description: string | null;
  template_data: PromptTemplateData | null;
  user_id: string | null;
  created_at: string;
};

export function TemplateCard({ template }: { template: Row }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const d = template.template_data ?? {};
  const isSystem = template.user_id === null;

  if (editing) {
    return (
      <TemplateForm
        mode="edit"
        template={template}
        onClose={() => setEditing(false)}
      />
    );
  }

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-md shadow-blue-900/5 transition-shadow hover:shadow-lg">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900">{template.name}</h3>
          {template.description && (
            <p className="mt-0.5 text-xs text-slate-600">
              {template.description}
            </p>
          )}
        </div>
        {isSystem && (
          <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800 ring-1 ring-blue-200">
            System
          </span>
        )}
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <FieldPreview
          label="Maschine"
          value={MACHINES.find((m) => m.value === d.machine)?.label}
        />
        <FieldPreview
          label="Angle"
          value={ANGLES.find((a) => a.value === d.angle)?.label}
        />
        <FieldPreview label="Ton" value={d.tone} />
        <FieldPreview
          label="Bild-Stil"
          value={IMAGE_STYLES.find((s) => s.value === d.imageStyle)?.label}
        />
        {d.variantCount && (
          <FieldPreview
            label="Varianten"
            value={String(d.variantCount)}
          />
        )}
        {d.product && (
          <div className="col-span-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Produkt
            </p>
            <p className="line-clamp-2 text-xs text-slate-700">{d.product}</p>
          </div>
        )}
        {d.audience && (
          <div className="col-span-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Zielgruppe
            </p>
            <p className="line-clamp-1 text-xs text-slate-700">{d.audience}</p>
          </div>
        )}
      </dl>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
        <Link
          href={`/dashboard/generate?template=${template.id}`}
          className="rounded-lg bg-gradient-to-br from-blue-800 to-blue-950 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-blue-900/30 transition-all hover:-translate-y-0.5 hover:shadow-lg"
        >
          ▶ Mit Vorlage generieren
        </Link>
        {!isSystem && (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              ✏️ Bearbeiten
            </button>
            {!confirming ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                Löschen
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  Abbrechen
                </button>
                <form action={deleteTemplate}>
                  <input type="hidden" name="id" value={template.id} />
                  <button
                    type="submit"
                    className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-500"
                  >
                    Endgültig
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function FieldPreview({
  label,
  value,
}: {
  label: string;
  value: string | undefined | null;
}) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="truncate text-xs text-slate-700">{value}</p>
    </div>
  );
}
