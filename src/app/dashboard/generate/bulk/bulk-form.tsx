"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PERSONAS, PLATFORMS } from "../schema";
import { MetaImportZone } from "../meta-import-zone";
import { startBulkGenerate, type BulkState } from "./actions";

type ProductImport = {
  id: string;
  filename: string | null;
  row_count: number;
  created_at: string;
  insights: { rows?: Array<{ title: string; price: string }> } | null;
};

type Project = { id: string; name: string };

const initial: BulkState = { ok: false };

export function BulkForm({
  imports,
  projects,
}: {
  imports: ProductImport[];
  projects: Project[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(startBulkGenerate, initial);
  const [selectedImport, setSelectedImport] = useState<string>(
    imports[0]?.id ?? "",
  );
  // ID des frisch hochgeladenen Imports — sobald die Server-Liste nach refresh
  // den Eintrag enthält, springt die Auswahl darauf.
  const [pendingImportId, setPendingImportId] = useState<string | null>(null);

  useEffect(() => {
    // Legitimer "Daten aus Server-Refresh in lokalen State spiegeln"-Sync —
    // der frisch hochgeladene Import muss aktiv werden, sobald die Server-Liste
    // ihn nachzieht. Kein cascading render (genau eine Übernahme pro ID).
    /* eslint-disable react-hooks/set-state-in-effect */
    if (pendingImportId && imports.some((i) => i.id === pendingImportId)) {
      setSelectedImport(pendingImportId);
      setPendingImportId(null);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [imports, pendingImportId]);

  const handleProductsImport = (importId: string) => {
    setPendingImportId(importId);
    // Server-Liste neu laden, damit der frische Import in der Dropdown erscheint
    router.refresh();
  };

  const activeImport = imports.find((i) => i.id === selectedImport);
  const previewRows = activeImport?.insights?.rows ?? [];

  return (
    <div className="space-y-4">
      {/* Inline-Upload: direkt im Bulk-Modus eine Produkt-CSV hochladen.
          Der frisch hochgeladene Import wird automatisch ausgewählt. */}
      <MetaImportZone onProductsImport={handleProductsImport} />

      {imports.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-900">
          <p className="font-semibold">Noch kein Produktkatalog importiert.</p>
          <p className="mt-1 text-xs">
            Lade oben eine Produkt-CSV im Meta-Catalog-Format hoch (Spalten:
            <code className="ml-1 rounded bg-white px-1">
              id, title, description, price, image_link, link
            </code>
            ).
          </p>
        </div>
      ) : (
        <BulkFormBody
          state={state}
          action={action}
          pending={pending}
          imports={imports}
          projects={projects}
          selectedImport={selectedImport}
          setSelectedImport={setSelectedImport}
          previewRows={previewRows}
        />
      )}
    </div>
  );
}

function BulkFormBody({
  state,
  action,
  pending,
  imports,
  projects,
  selectedImport,
  setSelectedImport,
  previewRows,
}: {
  state: BulkState;
  action: (formData: FormData) => void;
  pending: boolean;
  imports: ProductImport[];
  projects: Project[];
  selectedImport: string;
  setSelectedImport: (id: string) => void;
  previewRows: Array<{ title: string; price: string }>;
}) {
  return (
    <form action={action} className="space-y-4">
      {/* Import-Auswahl */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium text-slate-700">
          Produktkatalog (zuletzt importiert)
        </label>
        <select
          name="importId"
          value={selectedImport}
          onChange={(e) => setSelectedImport(e.target.value)}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-700"
        >
          {imports.map((imp) => (
            <option key={imp.id} value={imp.id}>
              {imp.filename ?? "unbenannt"} · {imp.row_count} Produkte ·{" "}
              {new Date(imp.created_at).toLocaleDateString("de-DE")}
            </option>
          ))}
        </select>

        {previewRows.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
              Vorschau der ersten {Math.min(previewRows.length, 10)} Produkte
            </summary>
            <ul className="mt-2 space-y-0.5 text-xs">
              {previewRows.slice(0, 10).map((r, i) => (
                <li key={i} className="flex justify-between gap-2 text-slate-700">
                  <span className="truncate">• {r.title}</span>
                  <span className="shrink-0 text-slate-500">{r.price}</span>
                </li>
              ))}
              {previewRows.length > 10 && (
                <li className="text-slate-400">… und {previewRows.length - 10} weitere</li>
              )}
            </ul>
          </details>
        )}
      </div>

      {/* Persona */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium text-slate-700">
          Persona für ALLE Produkte
        </label>
        <p className="text-xs text-slate-500">
          Setzt Tonalität, Awareness, Anrede automatisch.
        </p>
        <select
          name="persona"
          required
          defaultValue="franz_landwirt"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-700"
        >
          {PERSONAS.filter((p) => p.value !== "custom").map((p) => (
            <option key={p.value} value={p.value}>
              {p.emoji} {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Plattform */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium text-slate-700">Plattform</label>
        <select
          name="platform"
          required
          defaultValue="meta_feed"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-700"
        >
          {PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.emoji} {p.label} ({p.aspectRatio})
            </option>
          ))}
        </select>
      </div>

      {/* Projekt */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium text-slate-700">
          Speichern in Projekt <span className="text-slate-400">(optional)</span>
        </label>
        <select
          name="projectId"
          defaultValue=""
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-700"
        >
          <option value="">— Kein Projekt —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <label className="block text-sm font-medium text-slate-700">
            Varianten pro Produkt
          </label>
          <input
            type="number"
            name="variantCount"
            min="1"
            max="5"
            defaultValue="2"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-700"
          />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <label className="block text-sm font-medium text-slate-700">
            Max. Produkte (Run)
          </label>
          <input
            type="number"
            name="maxProducts"
            min="1"
            max="50"
            defaultValue="10"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-700"
          />
        </div>
      </div>

      {/* Status */}
      {state.error && (
        <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {state.error}
        </div>
      )}
      {state.ok && state.startedCount && state.startedCount > 0 && (
        <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-800">
          ✓ {state.startedCount} Creative{state.startedCount === 1 ? "" : "s"} angelegt
          {state.failedCount ? ` · ${state.failedCount} fehlgeschlagen` : ""}.
          {state.projectId && (
            <Link
              href={`/dashboard/projects/${state.projectId}`}
              className="ml-2 underline hover:text-slate-950"
            >
              → Zum Projekt
            </Link>
          )}
          {!state.projectId && (
            <Link
              href="/dashboard/library"
              className="ml-2 underline hover:text-slate-950"
            >
              → In der Library ansehen
            </Link>
          )}
        </div>
      )}
      {state.errors && state.errors.length > 0 && (
        <details className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-900">
          <summary className="cursor-pointer font-semibold">
            Details zu Fehlern ({state.errors.length})
          </summary>
          <ul className="mt-1 space-y-0.5">
            {state.errors.map((e, i) => (
              <li key={i}>• {e}</li>
            ))}
          </ul>
        </details>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-gradient-to-br from-slate-800 to-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/30 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-900/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {pending
          ? "⏳ Generiere parallel… (kann 1-3 min dauern)"
          : "⚡ Bulk-Generate starten"}
      </button>
      <p className="text-center text-[10px] text-slate-400">
        ~0,01 € Text + ~4 ¢ KI-Szene pro Produkt × Varianten
      </p>
    </form>
  );
}
