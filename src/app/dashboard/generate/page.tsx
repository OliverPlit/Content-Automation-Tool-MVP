"use client";

import { useActionState, useState } from "react";

import { generateAdCopy, saveCreative } from "./actions";
import {
  ANGLES,
  MACHINES,
  type AdCopy,
  type AngleValue,
  type GenerateInput,
  type GenerateState,
  type MachineValue,
  type SaveState,
} from "./schema";

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

  // Crawler-State lebt im Parent, damit websiteText als hidden input mitläuft.
  const [websiteText, setWebsiteText] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [crawlError, setCrawlError] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Neue Creative generieren
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Eingaben links, Ergebnis rechts — inklusive Bild-Preview, das du
          beim Speichern direkt als Default-Bild übernimmst.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[360px_1fr]">
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
              <CharCountTextarea
                name="product"
                rows={3}
                required
                maxLength={500}
                placeholder="z.B. WODOIL Hydrauliköl HLP 46, 200-Liter-Fass"
              />
            </Field>

            <Field label="Zielgruppe" error={genState.fieldErrors?.audience}>
              <CharCountInput
                name="audience"
                type="text"
                required
                maxLength={300}
                placeholder="z.B. Landwirte mit eigener Werkstatt"
              />
            </Field>

            <MachineField error={genState.fieldErrors?.machine} />
            <AngleField error={genState.fieldErrors?.angle} />
            <ToneField />

            <WebsiteUrlField
              websiteText={websiteText}
              setWebsiteText={setWebsiteText}
              crawling={crawling}
              setCrawling={setCrawling}
              error={crawlError}
              setError={setCrawlError}
            />
            <input type="hidden" name="websiteText" value={websiteText} />

            <VariantCountField error={genState.fieldErrors?.variantCount} />

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
                ? "Generiere Copy + Bild…"
                : genState.ok
                  ? "Erneut generieren"
                  : "Generieren (Copy + Bild)"}
            </button>
            <p className="text-center text-[10px] text-slate-400">
              ≈ 0,03 € Text + 4 ¢ Bild
            </p>
          </form>

          {genState.ok && genState.output && genState.input && (
            <SavePanel
              output={genState.output}
              input={genState.input}
              previewImageUrl={genState.imageUrl}
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
            <ResultsPanel
              output={genState.output}
              imageUrl={genState.imageUrl}
              imageError={genState.imageError}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form-Komponenten
// ---------------------------------------------------------------------------
function ToneField() {
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
    </div>
  );
}

function MachineField({ error }: { error?: string }) {
  const [val, setVal] = useState<MachineValue>(MACHINES[0].value);
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        Maschinen-Kontext
      </label>
      <select
        name="machine"
        required
        value={val}
        onChange={(e) => setVal(e.target.value as MachineValue)}
        className={`${inputCls} mt-1`}
      >
        {MACHINES.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-500">
        Bestimmt Bild-Szene + Texter-Kontext.
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function AngleField({ error }: { error?: string }) {
  const [val, setVal] = useState<AngleValue>(ANGLES[0].value);
  const active = ANGLES.find((a) => a.value === val)!;
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        Werbe-Angle
      </label>
      <select
        name="angle"
        required
        value={val}
        onChange={(e) => setVal(e.target.value as AngleValue)}
        className={`${inputCls} mt-1`}
      >
        {ANGLES.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>
      <p className="mt-1 line-clamp-2 text-xs text-slate-500">
        {active.voiceHint}
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function WebsiteUrlField({
  websiteText,
  setWebsiteText,
  crawling,
  setCrawling,
  error,
  setError,
}: {
  websiteText: string;
  setWebsiteText: (s: string) => void;
  crawling: boolean;
  setCrawling: (b: boolean) => void;
  error: string | null;
  setError: (s: string | null) => void;
}) {
  const [url, setUrl] = useState("");

  const handleCrawl = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setWebsiteText("");
      setError(null);
      return;
    }
    setCrawling(true);
    setError(null);
    try {
      const res = await fetch("/api/crawl-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const json = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !json.text) {
        setError(json.error ?? `Fehler (${res.status})`);
        setWebsiteText("");
      } else {
        setWebsiteText(json.text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Netzwerk-Fehler.");
      setWebsiteText("");
    } finally {
      setCrawling(false);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        Website-URL <span className="font-normal text-slate-400">(optional)</span>
      </label>
      <div className="relative mt-1">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={handleCrawl}
          placeholder="https://wodoil.at/..."
          className={inputCls}
        />
        {crawling && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-700">
            ⏳ Crawlt…
          </span>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {websiteText && !crawling && (
        <details className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs">
          <summary className="cursor-pointer font-medium text-emerald-800">
            ✓ {websiteText.length} Zeichen geladen — Vorschau
          </summary>
          <p className="mt-1 max-h-32 overflow-y-auto text-emerald-900/80">
            {websiteText}
          </p>
        </details>
      )}
    </div>
  );
}

function VariantCountField({ error }: { error?: string }) {
  const [count, setCount] = useState(3);
  const PRESETS = [1, 3, 5, 10];
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        Anzahl Varianten
      </label>
      <input type="hidden" name="variantCount" value={count} />
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setCount((c) => Math.max(1, c - 1))}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
        >
          −
        </button>
        <span className="inline-flex h-8 w-12 items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-semibold tabular-nums">
          {count}
        </span>
        <button
          type="button"
          onClick={() => setCount((c) => Math.min(10, c + 1))}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
        >
          +
        </button>
        <div className="ml-2 flex gap-1">
          {PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              className={
                "rounded-md px-2 py-1 text-xs font-medium transition " +
                (count === n
                  ? "bg-blue-800 text-white shadow"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200")
              }
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Default: 3. Maximal 10 (verbraucht mehr Tokens).
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Save + Results
// ---------------------------------------------------------------------------
function SavePanel({
  output,
  input,
  previewImageUrl,
  saveAction,
  saving,
  saveState,
}: {
  output: AdCopy;
  input: GenerateInput;
  previewImageUrl?: string;
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
      <input type="hidden" name="machine" value={input.machine} />
      <input type="hidden" name="angle" value={input.angle} />
      <input type="hidden" name="output" value={JSON.stringify(output)} />
      <input
        type="hidden"
        name="previewImageUrl"
        value={previewImageUrl ?? ""}
      />
      <input type="hidden" name="imagePrompt" value={output.imagePrompt} />

      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Speichern
      </p>
      <p className="mt-1 text-xs text-slate-600">
        Speichert Headline, Subline + alle Varianten in deine Library. Das
        Preview-Bild wird als Variante-0-Bild übernommen.
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
          className="mt-2 inline-block text-xs text-blue-700 hover:text-blue-900"
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
            GPT-4o-mini schreibt + gpt-image-1 generiert ein Bild…
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Dauert insgesamt etwa 15–30 Sekunden.
          </p>
        </>
      ) : (
        <>
          <div className="text-3xl">✨</div>
          <p className="mt-3 text-sm font-medium text-slate-700">
            Fülle das Formular links aus
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Du bekommst 1 Headline, 1 Subline, Ad-Copy-Varianten + ein passendes
            Bild.
          </p>
        </>
      )}
    </div>
  );
}

function ResultsPanel({
  output,
  imageUrl,
  imageError,
}: {
  output: AdCopy;
  imageUrl?: string;
  imageError?: string;
}) {
  return (
    <div className="space-y-4">
      {imageUrl ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-blue-900/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Generierte Bild-Vorschau"
            className="aspect-square w-full object-cover"
          />
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">Bild-Preview</span>
            {" — "}
            wird beim Speichern als Variante 0 übernommen.
          </div>
        </div>
      ) : imageError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          ⚠️ {imageError}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-blue-900/5">
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
            {output.variants.length} Ad-Copy-Variante
            {output.variants.length === 1 ? "" : "n"}
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

      <details className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <summary className="cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-800">
          🖼️ Verwendeter Bild-Prompt (en) anzeigen
        </summary>
        <p className="mt-2 whitespace-pre-line text-xs text-slate-600">
          {output.imagePrompt}
        </p>
      </details>
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

function CharCountTextarea({
  maxLength,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { maxLength: number }) {
  const [value, setValue] = useState("");
  return (
    <div className="relative">
      <textarea
        {...rest}
        maxLength={maxLength}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={inputCls}
      />
      <span
        className={
          "absolute bottom-1.5 right-2 text-[10px] tabular-nums " +
          (value.length > maxLength * 0.9
            ? "text-amber-600"
            : "text-slate-400")
        }
      >
        {value.length}/{maxLength}
      </span>
    </div>
  );
}

function CharCountInput({
  maxLength,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { maxLength: number }) {
  const [value, setValue] = useState("");
  return (
    <div className="relative">
      <input
        {...rest}
        maxLength={maxLength}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={inputCls}
      />
      <span
        className={
          "pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] tabular-nums " +
          (value.length > maxLength * 0.9
            ? "text-amber-600"
            : "text-slate-400")
        }
      >
        {value.length}/{maxLength}
      </span>
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
    : "text-xs text-blue-700 hover:text-blue-900";
  return (
    <button type="button" onClick={handle} className={base}>
      {copied ? "✓" : label}
    </button>
  );
}

const inputCls =
  "block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700";
