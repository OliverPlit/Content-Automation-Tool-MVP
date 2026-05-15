"use client";

import { useActionState, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { generateAdCopy, saveCreative } from "./actions";
import {
  ANGLES,
  IMAGE_STYLES,
  MACHINES,
  type AngleValue,
  type GeneratedVariant,
  type GenerateInput,
  type GenerateState,
  type ImageSource,
  type ImageStyleValue,
  type MachineValue,
  type PromptTemplateData,
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

  // Crawler-State
  const [websiteText, setWebsiteText] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [crawlError, setCrawlError] = useState<string | null>(null);

  // Bild-Quelle
  const [imageSource, setImageSource] = useState<ImageSource>("ai");
  const [customImageUrl, setCustomImageUrl] = useState("");
  const [imageSourceError, setImageSourceError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Template-Loader (?template=<id>)
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template");
  const [loadedTemplate, setLoadedTemplate] = useState<{
    id: string;
    name: string;
    data: PromptTemplateData;
  } | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);

  useEffect(() => {
    if (!templateId) return;
    // Diese Effekt-State-Updates sind legitime "Daten aus Fetch in lokalen
    // State spiegeln"-Aufrufe — die React-19-Lint-Regel ist hier zu streng.
    /* eslint-disable react-hooks/set-state-in-effect */
    setTemplateLoading(true);
    setTemplateError(null);
    fetch(`/api/templates/${templateId}`, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json()) as {
          id?: string;
          name?: string;
          data?: PromptTemplateData;
          error?: string;
        };
        if (!res.ok || !json.id || !json.name) {
          setTemplateError(json.error ?? `Fehler ${res.status}`);
          setLoadedTemplate(null);
        } else {
          setLoadedTemplate({
            id: json.id,
            name: json.name,
            data: json.data ?? {},
          });
        }
      })
      .catch((err) => {
        setTemplateError(err instanceof Error ? err.message : "Netzwerk-Fehler.");
      })
      .finally(() => setTemplateLoading(false));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [templateId]);

  // Wenn ein Template geladen ist, übernehmen wir auch den ImageStyle.
  const formKey = loadedTemplate?.id ?? "default";
  const tplData = loadedTemplate?.data;

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Neue Creative generieren
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Inputs links, Ergebnis-Grid rechts. Jede Variante wird parallel
          generiert (eigene Headline, Subline, Body, CTA + Bild).
        </p>
      </header>

      {loadedTemplate && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
          <p className="text-blue-900">
            📋 Vorlage <strong>{loadedTemplate.name}</strong> geladen — Form ist
            vorausgefüllt. Du kannst alles noch anpassen vor dem Generieren.
          </p>
          <a
            href="/dashboard/generate"
            className="text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline"
          >
            Ohne Vorlage starten
          </a>
        </div>
      )}
      {templateLoading && (
        <div className="mb-4 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
          ⏳ Lade Vorlage…
        </div>
      )}
      {templateError && (
        <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          Vorlage konnte nicht geladen werden: {templateError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[360px_1fr]">
        {/* --------- Left column: sticky form --------- */}
        <aside className="md:sticky md:top-6 md:self-start">
          <form
            key={formKey}
            action={generateAction}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-blue-900/5"
          >
            <Field label="Produkt / Service" error={genState.fieldErrors?.product}>
              <CharCountTextarea
                name="product"
                rows={3}
                required
                maxLength={500}
                defaultValue={tplData?.product ?? ""}
                placeholder="z.B. WODOIL Hydrauliköl HLP 46, 200-Liter-Fass"
              />
            </Field>

            <Field label="Zielgruppe" error={genState.fieldErrors?.audience}>
              <CharCountInput
                name="audience"
                type="text"
                required
                maxLength={300}
                defaultValue={tplData?.audience ?? ""}
                placeholder="z.B. Landwirte mit eigener Werkstatt"
              />
            </Field>

            <MachineField
              error={genState.fieldErrors?.machine}
              initialValue={tplData?.machine as MachineValue | undefined}
            />
            <AngleField
              error={genState.fieldErrors?.angle}
              initialValue={tplData?.angle as AngleValue | undefined}
            />
            <ToneField initialValue={tplData?.tone} />

            <WebsiteUrlField
              websiteText={websiteText}
              setWebsiteText={setWebsiteText}
              crawling={crawling}
              setCrawling={setCrawling}
              error={crawlError}
              setError={setCrawlError}
            />
            <input type="hidden" name="websiteText" value={websiteText} />

            <VariantCountField
              error={genState.fieldErrors?.variantCount}
              initialValue={tplData?.variantCount}
            />

            <ImageStyleField initialValue={tplData?.imageStyle as ImageStyleValue | undefined} />

            <ImageSourceField
              source={imageSource}
              setSource={setImageSource}
              customImageUrl={customImageUrl}
              setCustomImageUrl={setCustomImageUrl}
              uploading={uploadingImage}
              setUploading={setUploadingImage}
              error={imageSourceError}
              setError={setImageSourceError}
            />
            <input type="hidden" name="imageSource" value={imageSource} />
            <input
              type="hidden"
              name="customImageUrl"
              value={imageSource === "ai" ? "" : customImageUrl}
            />

            {genState.error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {genState.error}
              </p>
            )}

            <button
              type="submit"
              disabled={generating || uploadingImage}
              className="w-full rounded-lg bg-gradient-to-br from-blue-800 to-blue-950 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-900/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {generating
                ? imageSource === "ai"
                  ? "Generiere Copy + Bilder parallel…"
                  : "Generiere Varianten…"
                : genState.ok
                  ? "Erneut generieren"
                  : "Generieren"}
            </button>
            <p className="text-center text-[10px] text-slate-400">
              Pro Variante: ~0,01 € Text {imageSource === "ai" ? "+ ~4 ¢ Bild" : "(eigenes Bild)"}
            </p>
          </form>
        </aside>

        {/* --------- Right column: variant cards grid --------- */}
        <main>
          {!genState.ok || !genState.variants || genState.variants.length === 0 ? (
            <EmptyState pending={generating} />
          ) : (
            <ResultsGrid variants={genState.variants} input={genState.input!} />
          )}
        </main>
      </div>
    </div>
  );
}

// ===========================================================================
// Results Grid
// ===========================================================================
function ResultsGrid({
  variants,
  input,
}: {
  variants: GeneratedVariant[];
  input: GenerateInput;
}) {
  const imageCount = variants.filter((v) => v.imageUrl).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-blue-900">
          {variants.length} Variante{variants.length === 1 ? "" : "n"} generiert
          {imageCount > 0 && (
            <span className="ml-2 text-xs font-medium text-slate-500">
              ({imageCount} mit Bild)
            </span>
          )}
        </h2>
        {imageCount > 1 && (
          <DownloadAllButton variants={variants} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {variants.map((v) => (
          <VariantCard key={v.index} variant={v} input={input} />
        ))}
      </div>
    </div>
  );
}

function VariantCard({
  variant,
  input,
}: {
  variant: GeneratedVariant;
  input: GenerateInput;
}) {
  const [saveState, saveAction, saving] = useActionState(
    saveCreative,
    initialSave,
  );
  const justSaved = saveState.ok && saveState.savedVariantIndex === variant.index;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-blue-900/5 transition-shadow hover:shadow-lg">
      {/* Bild */}
      <div className="relative aspect-square w-full overflow-hidden bg-slate-100">
        {variant.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={variant.imageUrl}
            alt={`Variante ${variant.index}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-center text-xs text-slate-500">
            {variant.imageError ? (
              <span className="px-4">⚠️ {variant.imageError}</span>
            ) : (
              <span>kein Bild</span>
            )}
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-blue-900/90 px-2.5 py-0.5 text-xs font-bold text-white shadow">
          Variante {variant.index}
        </span>
      </div>

      {/* Text-Block */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Headline
        </p>
        <p className="text-base font-bold text-slate-900">{variant.headline}</p>

        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
          Subline
        </p>
        <p className="text-sm text-slate-700">{variant.subline}</p>

        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
          Ad-Copy
        </p>
        <p className="whitespace-pre-line text-sm text-slate-800">{variant.body}</p>

        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
          CTA
        </p>
        <p className="text-sm font-semibold text-blue-800">{variant.cta}</p>

        {/* Action-Buttons */}
        <div className="mt-auto flex flex-wrap gap-2 pt-3">
          {variant.imageUrl && (
            <DownloadVariantButton
              url={variant.imageUrl}
              filename={`variante-${variant.index}.png`}
            />
          )}
          <form action={saveAction} className="flex-1">
            <input type="hidden" name="product" value={input.product} />
            <input type="hidden" name="audience" value={input.audience} />
            <input type="hidden" name="tone" value={input.tone} />
            <input type="hidden" name="machine" value={input.machine} />
            <input type="hidden" name="angle" value={input.angle} />
            <input type="hidden" name="variantIndex" value={variant.index} />
            <input type="hidden" name="headline" value={variant.headline} />
            <input type="hidden" name="subline" value={variant.subline} />
            <input type="hidden" name="body" value={variant.body} />
            <input type="hidden" name="cta" value={variant.cta} />
            <input type="hidden" name="imagePrompt" value={variant.imagePrompt} />
            <input
              type="hidden"
              name="previewImageUrl"
              value={variant.imageUrl ?? ""}
            />
            <button
              type="submit"
              disabled={saving || justSaved}
              className="w-full rounded-md bg-gradient-to-br from-slate-800 to-slate-950 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {saving
                ? "Speichere…"
                : justSaved
                  ? "✓ Gespeichert"
                  : "In Library speichern"}
            </button>
          </form>
        </div>

        {saveState.error && saveState.savedVariantIndex === undefined && (
          <p className="mt-1 text-xs text-red-700">{saveState.error}</p>
        )}
        {justSaved && saveState.savedId && (
          <a
            href={`/dashboard/library/${saveState.savedId}`}
            className="mt-1 text-xs text-blue-700 hover:text-blue-900"
          >
            → Zum Eintrag in der Library
          </a>
        )}

        <details className="mt-1">
          <summary className="cursor-pointer text-[10px] text-slate-400 hover:text-slate-600">
            🖼️ Verwendeter Bild-Prompt (en)
          </summary>
          <p className="mt-1 text-[10px] text-slate-500">{variant.imagePrompt}</p>
        </details>
      </div>
    </div>
  );
}

// ===========================================================================
// Download helpers (single + ZIP)
// ===========================================================================
function DownloadVariantButton({
  url,
  filename,
}: {
  url: string;
  filename: string;
}) {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    try {
      setBusy(true);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      alert(`Download fehlgeschlagen: ${err instanceof Error ? err.message : "?"}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
    >
      {busy ? "Lade…" : "⬇ Bild"}
    </button>
  );
}

// JSZip per CDN nachladen, nur wenn nötig (kein npm-Bundle-Hit).
declare global {
  var JSZip: undefined | (new () => JSZipInstance);
}

type JSZipInstance = {
  file: (name: string, data: Blob | Uint8Array) => void;
  generateAsync: (opts: { type: "blob" }) => Promise<Blob>;
};

function loadJSZip(): Promise<new () => JSZipInstance> {
  if (typeof window === "undefined")
    return Promise.reject(new Error("Nur im Browser verfügbar."));
  const existing = (window as unknown as { JSZip?: new () => JSZipInstance }).JSZip;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    script.onload = () => {
      const w = window as unknown as { JSZip?: new () => JSZipInstance };
      if (w.JSZip) resolve(w.JSZip);
      else reject(new Error("JSZip wurde geladen, ist aber nicht global verfügbar."));
    };
    script.onerror = () =>
      reject(new Error("JSZip konnte nicht von cdnjs geladen werden."));
    document.head.appendChild(script);
  });
}

function DownloadAllButton({ variants }: { variants: GeneratedVariant[] }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const handle = async () => {
    const withImages = variants.filter((v) => v.imageUrl);
    if (withImages.length === 0) {
      alert("Keine Bilder vorhanden zum Bündeln.");
      return;
    }
    try {
      setBusy(true);
      setProgress("Lade JSZip…");
      const JSZipCtor = await loadJSZip();
      const zip = new JSZipCtor();

      for (let i = 0; i < withImages.length; i++) {
        const v = withImages[i];
        setProgress(`Lade Bild ${i + 1}/${withImages.length}…`);
        const res = await fetch(v.imageUrl!, { cache: "no-store" });
        if (!res.ok) throw new Error(`Bild ${v.index}: HTTP ${res.status}`);
        const blob = await res.blob();
        const ext = blob.type.includes("png")
          ? "png"
          : blob.type.includes("webp")
            ? "webp"
            : "jpg";
        zip.file(`variante-${v.index}.${ext}`, blob);
      }

      // Text-Datei mit allen Copies dazu — praktisch fürs Briefing
      const textContent = variants
        .map(
          (v) => `=== Variante ${v.index} ===
Headline: ${v.headline}
Subline: ${v.subline}

Body:
${v.body}

CTA: ${v.cta}

Bild-Prompt (en):
${v.imagePrompt}
`,
        )
        .join("\n");
      zip.file("copies.txt", new Blob([textContent], { type: "text/plain" }));

      setProgress("Erzeuge ZIP…");
      const blob = await zip.generateAsync({ type: "blob" });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `creatives-session-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      setProgress(null);
    } catch (err) {
      alert(`ZIP fehlgeschlagen: ${err instanceof Error ? err.message : "?"}`);
      setProgress(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {progress && (
        <span className="text-[11px] text-slate-500">{progress}</span>
      )}
      <button
        type="button"
        onClick={handle}
        disabled={busy}
        className="rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-800 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-emerald-900/20 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {busy ? "Erstelle ZIP…" : "📦 Alle downloaden (ZIP)"}
      </button>
    </div>
  );
}

// ===========================================================================
// Form-Komponenten (unverändert vom vorigen Stand)
// ===========================================================================
function ToneField({
  initialValue,
}: {
  initialValue?: (typeof TONES)[number]["value"];
}) {
  const [tone, setTone] = useState<(typeof TONES)[number]["value"]>(
    initialValue ?? "professionell",
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
        onChange={(e) => setTone(e.target.value as (typeof TONES)[number]["value"])}
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

function MachineField({
  error,
  initialValue,
}: {
  error?: string;
  initialValue?: MachineValue;
}) {
  const [val, setVal] = useState<MachineValue>(
    initialValue && MACHINES.some((m) => m.value === initialValue)
      ? initialValue
      : MACHINES[0].value,
  );
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

function AngleField({
  error,
  initialValue,
}: {
  error?: string;
  initialValue?: AngleValue;
}) {
  const [val, setVal] = useState<AngleValue>(
    initialValue && ANGLES.some((a) => a.value === initialValue)
      ? initialValue
      : ANGLES[0].value,
  );
  const active = ANGLES.find((a) => a.value === val)!;
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">Werbe-Angle</label>
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
      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{active.voiceHint}</p>
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

function VariantCountField({
  error,
  initialValue,
}: {
  error?: string;
  initialValue?: number;
}) {
  const [count, setCount] = useState(
    initialValue && initialValue >= 1 && initialValue <= 10 ? initialValue : 3,
  );
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
        Default: 3. Jede Variante = 1 API-Call parallel.
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ImageStyleField({
  initialValue,
}: {
  initialValue?: ImageStyleValue;
}) {
  const [val, setVal] = useState<ImageStyleValue>(
    initialValue && IMAGE_STYLES.some((s) => s.value === initialValue)
      ? initialValue
      : "auto",
  );
  const active = IMAGE_STYLES.find((s) => s.value === val)!;
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        Bild-Stil
      </label>
      <select
        name="imageStyle"
        required
        value={val}
        onChange={(e) => setVal(e.target.value as ImageStyleValue)}
        className={`${inputCls} mt-1`}
      >
        {IMAGE_STYLES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-500">{active.hint}</p>
    </div>
  );
}

function ImageSourceField({
  source,
  setSource,
  customImageUrl,
  setCustomImageUrl,
  uploading,
  setUploading,
  error,
  setError,
}: {
  source: ImageSource;
  setSource: (s: ImageSource) => void;
  customImageUrl: string;
  setCustomImageUrl: (s: string) => void;
  uploading: boolean;
  setUploading: (b: boolean) => void;
  error: string | null;
  setError: (s: string | null) => void;
}) {
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload-preview", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? `Upload-Fehler (${res.status})`);
        setCustomImageUrl("");
      } else {
        setCustomImageUrl(json.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Netzwerk-Fehler.");
      setCustomImageUrl("");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        Bild-Quelle
      </label>
      <div className="mt-1 grid grid-cols-3 gap-2">
        <SourceTile
          active={source === "ai"}
          onClick={() => {
            setSource("ai");
            setCustomImageUrl("");
            setError(null);
          }}
          icon="✨"
          label="KI generiert"
          hint="≈ 4 ¢ / Bild"
        />
        <SourceTile
          active={source === "upload"}
          onClick={() => {
            setSource("upload");
            setError(null);
          }}
          icon="📤"
          label="Upload"
          hint="max 5 MB"
        />
        <SourceTile
          active={source === "url"}
          onClick={() => {
            setSource("url");
            setError(null);
          }}
          icon="🔗"
          label="Bild-URL"
          hint="jpg/png/webp"
        />
      </div>

      {source === "upload" && (
        <div className="mt-3">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            disabled={uploading}
            className="block w-full text-xs text-slate-700 file:mr-2 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-blue-800 hover:file:bg-blue-100 disabled:opacity-60"
          />
          {uploading && (
            <p className="mt-1 text-xs text-blue-700">⏳ Lädt hoch…</p>
          )}
          {!uploading && customImageUrl && (
            <div className="mt-2 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={customImageUrl}
                alt="Upload-Preview"
                className="h-16 w-16 rounded-md border border-emerald-300 object-cover"
              />
              <span className="text-xs text-emerald-700">
                ✓ Wird für ALLE Varianten verwendet.
              </span>
            </div>
          )}
        </div>
      )}

      {source === "url" && (
        <div className="mt-3">
          <input
            type="url"
            value={customImageUrl}
            onChange={(e) => setCustomImageUrl(e.target.value)}
            placeholder="https://example.com/image.jpg"
            className={inputCls}
          />
          {customImageUrl && /^https?:\/\//i.test(customImageUrl) && (
            <div className="mt-2 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={customImageUrl}
                alt="URL-Preview"
                className="h-16 w-16 rounded-md border border-emerald-300 object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <span className="text-xs text-slate-500">
                Wird für ALLE Varianten verwendet.
              </span>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function SourceTile({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex flex-col items-center justify-center rounded-lg border px-2 py-3 text-center transition-all duration-150 " +
        (active
          ? "border-blue-700 bg-gradient-to-br from-blue-50 to-white shadow-md shadow-blue-900/10 ring-1 ring-blue-300"
          : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40")
      }
    >
      <span className="text-xl">{icon}</span>
      <span
        className={
          "mt-1 text-xs font-semibold " +
          (active ? "text-blue-900" : "text-slate-700")
        }
      >
        {label}
      </span>
      <span className="mt-0.5 text-[10px] text-slate-500">{hint}</span>
    </button>
  );
}

function EmptyState({ pending }: { pending: boolean }) {
  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      {pending ? (
        <>
          <div className="text-3xl">⏳</div>
          <p className="mt-3 text-sm text-slate-600">
            Varianten werden parallel generiert…
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Je nach Anzahl 15–40 Sekunden.
          </p>
        </>
      ) : (
        <>
          <div className="text-3xl">✨</div>
          <p className="mt-3 text-sm font-medium text-slate-700">
            Fülle das Formular links aus
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Du bekommst N Varianten parallel — jede mit eigener Copy + eigenem Bild.
          </p>
        </>
      )}
    </div>
  );
}

// ===========================================================================
// Small helpers
// ===========================================================================
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
  defaultValue,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { maxLength: number }) {
  const [value, setValue] = useState(
    typeof defaultValue === "string" ? defaultValue : "",
  );
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
          (value.length > maxLength * 0.9 ? "text-amber-600" : "text-slate-400")
        }
      >
        {value.length}/{maxLength}
      </span>
    </div>
  );
}

function CharCountInput({
  maxLength,
  defaultValue,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { maxLength: number }) {
  const [value, setValue] = useState(
    typeof defaultValue === "string" ? defaultValue : "",
  );
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
          (value.length > maxLength * 0.9 ? "text-amber-600" : "text-slate-400")
        }
      >
        {value.length}/{maxLength}
      </span>
    </div>
  );
}

const inputCls =
  "block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700";
