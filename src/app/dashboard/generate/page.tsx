"use client";

import { useActionState, useState } from "react";

import { generateAdCopy, saveCreative } from "./actions";
import type { AdCopy, GenerateState, SaveState } from "./schema";

const TONES = [
  { value: "professionell", label: "Professionell", hint: "Sachlich, kompetent" },
  { value: "locker", label: "Locker", hint: "Casual, freundlich" },
  { value: "verspielt", label: "Verspielt", hint: "Mit Humor & Emoji" },
  { value: "premium", label: "Premium", hint: "Elegant, hochwertig" },
  { value: "direkt", label: "Direkt", hint: "Klare Botschaft, Push" },
] as const;

const initialGenerate: GenerateState = { ok: false };
const initialSave: SaveState = { ok: false };

export default function GeneratePage() {
  const [genState, generateAction, generating] = useActionState(
    generateAdCopy,
    initialGenerate,
  );
  const [saveState, saveAction, saving] = useActionState(
    saveCreative,
    initialSave,
  );

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Neue Creative generieren
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Eingaben links, Ergebnis rechts — Inputs bleiben editierbar, Save ist
          immer erreichbar.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[340px_1fr]">
        {/* --------- Left column: sticky form + save --------- */}
        <aside className="md:sticky md:top-6 md:self-start">
          <form
            action={generateAction}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-blue-900/5 transition-shadow hover:shadow-lg"
          >
            <Field
              label="Produkt / Service"
              error={genState.fieldErrors?.product}
            >
              <textarea
                name="product"
                rows={3}
                required
                placeholder="z.B. nachhaltige Sneaker aus recyceltem Ozeanplastik"
                className={inputCls}
              />
            </Field>

            <Field label="Zielgruppe" error={genState.fieldErrors?.audience}>
              <input
                name="audience"
                type="text"
                required
                placeholder="z.B. umweltbewusste Berufstätige, 25–40"
                className={inputCls}
              />
            </Field>

            <ToneField error={genState.fieldErrors?.tone} />

            {genState.error && !genState.fieldErrors && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {genState.error}
              </p>
            )}

            <button
              type="submit"
              disabled={generating}
              className="w-full rounded-lg bg-gradient-to-br from-blue-800 to-blue-950 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-900/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {generating
                ? "Generiere…"
                : genState.ok
                  ? "Erneut generieren"
                  : "Generieren"}
            </button>
          </form>

          {genState.ok && genState.output && genState.input && (
            <SavePanel
              output={genState.output}
              input={genState.input}
              saveAction={saveAction}
              saving={saving}
              saveState={saveState}
            />
          )}
        </aside>

        {/* --------- Right column: results --------- */}
        <main>
          {!genState.ok || !genState.output ? (
            <EmptyState pending={generating} />
          ) : (
            <ResultsPanel output={genState.output} />
          )}
        </main>
      </div>
    </div>
  );
}

function ToneField({ error }: { error?: string }) {
  const [tone, setTone] = useState<(typeof TONES)[number]["value"]>(
    "professionell",
  );
  const active = TONES.find((t) => t.value === tone)!;

  return (
    <div>
      <label htmlFor="tone" className="block text-sm font-medium text-slate-700">
        Ton
      </label>
      <select
        id="tone"
        name="tone"
        required
        value={tone}
        onChange={(e) =>
          setTone(e.target.value as (typeof TONES)[number]["value"])
        }
        className={`${inputCls} mt-1`}
      >
        {TONES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-500">{active.hint}</p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function SavePanel({
  output,
  input,
  saveAction,
  saving,
  saveState,
}: {
  output: AdCopy;
  input: { product: string; audience: string; tone: string };
  saveAction: (formData: FormData) => void;
  saving: boolean;
  saveState: SaveState;
}) {
  return (
    <form
      action={saveAction}
      className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-md shadow-blue-900/5 hover:shadow-lg"
    >
      <input type="hidden" name="product" value={input.product} />
      <input type="hidden" name="audience" value={input.audience} />
      <input type="hidden" name="tone" value={input.tone} />
      <input type="hidden" name="output" value={JSON.stringify(output)} />

      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Speichern
      </p>
      <p className="mt-1 text-xs text-slate-600">
        Schreibt Headline, Subline + alle 5 Varianten in deine Library — danach
        kannst du dort Bilder generieren.
      </p>

      <button
        type="submit"
        disabled={saving || saveState.ok}
        className="mt-3 w-full rounded-lg bg-gradient-to-br from-slate-800 to-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {saving
          ? "Speichere…"
          : saveState.ok
            ? "✓ Gespeichert"
            : "In Library speichern"}
      </button>

      {saveState.error && (
        <p className="mt-2 text-xs text-red-700">{saveState.error}</p>
      )}
      {saveState.ok && saveState.savedId && (
        <a
          href={`/dashboard/library/${saveState.savedId}`}
          className="mt-2 inline-block text-xs text-blue-800 hover:text-blue-700"
        >
          → Zum Eintrag in der Library
        </a>
      )}
    </form>
  );
}

function EmptyState({ pending }: { pending: boolean }) {
  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      {pending ? (
        <>
          <div className="text-3xl">⏳</div>
          <p className="mt-3 text-sm text-slate-600">
            GPT-4o-mini schreibt 5 Varianten…
          </p>
        </>
      ) : (
        <>
          <div className="text-3xl">✨</div>
          <p className="mt-3 text-sm font-medium text-slate-700">
            Fülle das Formular links aus
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Du bekommst 1 Headline, 1 Subline und 5 Ad-Copy-Varianten zum
            A/B-Testen.
          </p>
        </>
      )}
    </div>
  );
}

function ResultsPanel({ output }: { output: AdCopy }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-blue-900/5 transition-shadow hover:shadow-lg">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Headline
          </p>
          <CopyButton value={output.headline} />
        </div>
        <p className="mt-1 text-xl font-semibold text-slate-900">
          {output.headline}
        </p>

        <div className="mt-4 flex items-baseline justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Subline
          </p>
          <CopyButton value={output.subline} />
        </div>
        <p className="mt-1 text-sm text-slate-700">{output.subline}</p>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            5 Ad-Copy-Varianten
          </h2>
          <span className="text-xs text-slate-400">
            Verschiedene Hooks zum A/B-Testen
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {output.variants.map((v, i) => (
            <VariantCard
              key={i}
              index={i + 1}
              body={v.body}
              cta={v.cta}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function VariantCard({
  index,
  body,
  cta,
}: {
  index: number;
  body: string;
  cta: string;
}) {
  return (
    <div className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-md shadow-blue-900/5 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-900/10">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Variante {index}
        </p>
        <span className="truncate text-xs font-semibold text-blue-800">
          {cta}
        </span>
      </div>

      <p className="mt-2 whitespace-pre-line text-sm text-slate-800">{body}</p>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
        <p className="text-xs text-slate-500">
          CTA: <span className="text-slate-700">{cta}</span>
        </p>
        <div className="flex gap-1">
          <CopyButton value={body} label="Body" tiny />
          <CopyButton value={cta} label="CTA" tiny />
          <CopyButton value={`${body}\n\n${cta}`} label="Beides" tiny />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <div className="mt-1">{children}</div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function CopyButton({
  value,
  label = "Kopieren",
  tiny = false,
}: {
  value: string;
  label?: string;
  tiny?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const base = tiny
    ? "rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
    : "text-xs text-blue-800 hover:text-blue-700";
  return (
    <button type="button" onClick={handle} className={base}>
      {copied ? "✓" : label}
    </button>
  );
}

const inputCls =
  "block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700";
