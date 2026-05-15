"use client";

import { useActionState, useState } from "react";

import {
  type ImageProvider,
  type ImageState,
  type ProductImageState,
  type VariantImage,
  deleteCreativeImage,
  deleteProductImage,
  generateCreativeImage,
  setProductImage,
} from "./image-actions";

const initial: ImageState = { ok: false };
const initialProduct: ProductImageState = { ok: false };

type SourceMode = "ai" | "upload" | "url";
type ProductSourceMode = "upload" | "url";

const PROVIDERS: { value: ImageProvider; label: string; hint: string }[] = [
  {
    value: "openai",
    label: "OpenAI gpt-image-1",
    hint: "≈ 4 ¢ pro Bild · braucht OpenAI-Billing",
  },
  {
    value: "gemini",
    label: "Google Gemini 2.5 Flash Image",
    hint: "≈ 4 ¢ pro Bild · Free Tier oft eingeschränkt",
  },
];

export function VariantImageBlock({
  creativeId,
  variantIndex,
  image,
}: {
  creativeId: string;
  variantIndex: number;
  image: VariantImage | null;
}) {
  const [state, formAction, pending] = useActionState(
    generateCreativeImage,
    initial,
  );
  const [provider, setProvider] = useState<ImageProvider>("openai");
  const activeProvider = PROVIDERS.find((p) => p.value === provider)!;

  // Bild-Quelle
  const [source, setSource] = useState<SourceMode>("ai");
  const [customImageUrl, setCustomImageUrl] = useState("");
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSourceError(null);
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
        setSourceError(json.error ?? `Upload-Fehler (${res.status})`);
        setCustomImageUrl("");
      } else {
        setCustomImageUrl(json.url);
      }
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : "Netzwerk-Fehler.");
      setCustomImageUrl("");
    } finally {
      setUploading(false);
    }
  };

  // Optimistic merge of action result over server-rendered image.
  const live: VariantImage | null =
    state.ok && state.imageUrl !== undefined && state.variantIndex === variantIndex
      ? {
          variantIndex,
          imageUrl: state.imageUrl,
          imagePrompt: state.imagePrompt ?? null,
          provider: state.provider ?? null,
          productImageUrl: image?.productImageUrl ?? null,
        }
      : image;

  const submitDisabled =
    pending ||
    uploading ||
    ((source === "upload" || source === "url") && !customImageUrl);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-blue-900/5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Bild</h2>
        <span className="text-xs text-slate-500">
          1:1 · 1024×1024 · KI-Prompt via gpt-4o-mini ODER eigenes Bild
        </span>
      </div>

      {state.error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[200px_1fr]">
        <div>
          {live ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={live.imageUrl}
              alt={`Bild zu Variante ${variantIndex + 1}`}
              className="aspect-square w-full rounded-md border border-slate-200 object-cover"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400">
              kein Bild
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {/* ---------- Source Picker ---------- */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
              Bild-Quelle
            </label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              <SourceTile
                active={source === "ai"}
                onClick={() => {
                  setSource("ai");
                  setCustomImageUrl("");
                  setSourceError(null);
                }}
                icon="✨"
                label="KI generiert"
                hint="≈ 4 ¢"
              />
              <SourceTile
                active={source === "upload"}
                onClick={() => {
                  setSource("upload");
                  setSourceError(null);
                }}
                icon="📤"
                label="Upload"
                hint="max 5 MB"
              />
              <SourceTile
                active={source === "url"}
                onClick={() => {
                  setSource("url");
                  setSourceError(null);
                }}
                icon="🔗"
                label="Bild-URL"
                hint="jpg/png/webp"
              />
            </div>
          </div>

          {/* ---------- Source-spezifische Felder ---------- */}
          {source === "ai" && (
            <div>
              <label
                htmlFor={`provider-${variantIndex}`}
                className="block text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                KI-Anbieter
              </label>
              <select
                id={`provider-${variantIndex}`}
                value={provider}
                onChange={(e) => setProvider(e.target.value as ImageProvider)}
                disabled={pending}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700 disabled:opacity-60"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">{activeProvider.hint}</p>
            </div>
          )}

          {source === "upload" && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                Bild hochladen
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                disabled={uploading || pending}
                className="mt-1 block w-full text-xs text-slate-700 file:mr-2 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-blue-800 hover:file:bg-blue-100 disabled:opacity-60"
              />
              {uploading && (
                <p className="mt-1 text-xs text-blue-700">⏳ Lädt hoch…</p>
              )}
              {!uploading && customImageUrl && (
                <p className="mt-1 text-xs text-emerald-700">
                  ✓ Hochgeladen — bereit zum Speichern.
                </p>
              )}
            </div>
          )}

          {source === "url" && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                Bild-URL
              </label>
              <input
                type="url"
                value={customImageUrl}
                onChange={(e) => setCustomImageUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                disabled={pending}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700 disabled:opacity-60"
              />
            </div>
          )}

          {sourceError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {sourceError}
            </p>
          )}

          {live?.imagePrompt && (
            <details>
              <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
                Verwendeter KI-Bild-Prompt anzeigen
              </summary>
              <p className="mt-1 text-xs text-slate-600">{live.imagePrompt}</p>
            </details>
          )}

          {/* ---------- Action-Buttons ---------- */}
          <div className="mt-auto flex flex-wrap gap-2">
            <form action={formAction}>
              <input type="hidden" name="id" value={creativeId} />
              <input type="hidden" name="variantIndex" value={variantIndex} />
              <input type="hidden" name="imageSource" value={source} />
              <input type="hidden" name="provider" value={provider} />
              <input
                type="hidden"
                name="customImageUrl"
                value={source === "ai" ? "" : customImageUrl}
              />
              <button
                type="submit"
                disabled={submitDisabled}
                className="rounded-lg bg-gradient-to-br from-blue-800 to-blue-950 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-900/30 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {pending
                  ? source === "ai"
                    ? "Generiere… (10–20 Sek)"
                    : "Übernehme Bild…"
                  : live
                    ? source === "ai"
                      ? "Neu generieren"
                      : "Bild übernehmen"
                    : source === "ai"
                      ? "Bild generieren"
                      : "Bild übernehmen"}
              </button>
            </form>

            {live && (
              <>
                <DownloadButton
                  url={live.imageUrl}
                  filename={`creative-${creativeId.slice(0, 8)}-v${variantIndex + 1}.png`}
                />
                <form action={deleteCreativeImage}>
                  <input type="hidden" name="id" value={creativeId} />
                  <input type="hidden" name="variantIndex" value={variantIndex} />
                  <button
                    type="submit"
                    className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    Bild löschen
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ---------- Produktbild (separates Overlay-Bild für Creatomate) ---------- */}
      <ProductImageSubBlock
        creativeId={creativeId}
        variantIndex={variantIndex}
        current={image?.productImageUrl ?? null}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// ProductImageSubBlock
// ---------------------------------------------------------------------------
function ProductImageSubBlock({
  creativeId,
  variantIndex,
  current,
}: {
  creativeId: string;
  variantIndex: number;
  current: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    setProductImage,
    initialProduct,
  );
  const [source, setSource] = useState<ProductSourceMode>("upload");
  const [customUrl, setCustomUrl] = useState("");
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Live-Wert: bei erfolgreicher Action das neue Bild, sonst das gespeicherte.
  const liveUrl: string | null =
    state.ok && state.productImageUrl !== undefined && state.variantIndex === variantIndex
      ? state.productImageUrl
      : current;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadErr(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload-preview", { method: "POST", body: fd });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setUploadErr(json.error ?? `Upload-Fehler (${res.status})`);
        setCustomUrl("");
      } else {
        setCustomUrl(json.url);
      }
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : "Netzwerk-Fehler.");
      setCustomUrl("");
    } finally {
      setUploading(false);
    }
  };

  const submitDisabled = pending || uploading || !customUrl;

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Produktbild <span className="font-normal text-slate-500">(optional)</span>
        </h3>
        <span className="text-[10px] text-slate-500">
          Wird im Creatomate-Template als Overlay über dem Hintergrund eingefügt
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[140px_1fr]">
        <div>
          {liveUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={liveUrl}
              alt={`Produktbild Variante ${variantIndex + 1}`}
              className="aspect-square w-full rounded-md border border-slate-200 bg-white object-contain p-2 shadow-sm"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed border-slate-300 bg-white text-xs text-slate-400">
              kein Produktbild
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <TinyTile
              active={source === "upload"}
              onClick={() => {
                setSource("upload");
                setUploadErr(null);
              }}
              icon="📤"
              label="Upload"
            />
            <TinyTile
              active={source === "url"}
              onClick={() => {
                setSource("url");
                setUploadErr(null);
              }}
              icon="🔗"
              label="Bild-URL"
            />
          </div>

          {source === "upload" ? (
            <div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFile}
                disabled={uploading || pending}
                className="block w-full text-xs text-slate-700 file:mr-2 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-blue-800 hover:file:bg-blue-100 disabled:opacity-60"
              />
              {uploading && (
                <p className="mt-1 text-xs text-blue-700">⏳ Lädt hoch…</p>
              )}
              {!uploading && customUrl && (
                <p className="mt-1 text-xs text-emerald-700">✓ Bereit zum Speichern</p>
              )}
            </div>
          ) : (
            <input
              type="url"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="https://example.com/product.png"
              disabled={pending}
              className="block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700 disabled:opacity-60"
            />
          )}

          {uploadErr && (
            <p className="rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700">
              {uploadErr}
            </p>
          )}
          {state.error && (
            <p className="rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700">
              {state.error}
            </p>
          )}

          <div className="mt-auto flex flex-wrap gap-2">
            <form action={formAction}>
              <input type="hidden" name="id" value={creativeId} />
              <input type="hidden" name="variantIndex" value={variantIndex} />
              <input type="hidden" name="imageSource" value={source} />
              <input type="hidden" name="customImageUrl" value={customUrl} />
              <button
                type="submit"
                disabled={submitDisabled}
                className="rounded-md bg-gradient-to-br from-emerald-600 to-emerald-800 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {pending
                  ? "Speichere…"
                  : liveUrl
                    ? "Produktbild ersetzen"
                    : "Produktbild setzen"}
              </button>
            </form>
            {liveUrl && (
              <form action={deleteProductImage}>
                <input type="hidden" name="id" value={creativeId} />
                <input type="hidden" name="variantIndex" value={variantIndex} />
                <button
                  type="submit"
                  className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Entfernen
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TinyTile({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-all duration-150 " +
        (active
          ? "border-emerald-600 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300"
          : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/40")
      }
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
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
        "flex flex-col items-center justify-center rounded-lg border px-2 py-2.5 text-center transition-all duration-150 " +
        (active
          ? "border-blue-700 bg-gradient-to-br from-blue-50 to-white shadow-md shadow-blue-900/10 ring-1 ring-blue-300"
          : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40")
      }
    >
      <span className="text-lg">{icon}</span>
      <span
        className={
          "mt-0.5 text-[11px] font-semibold " +
          (active ? "text-blue-900" : "text-slate-700")
        }
      >
        {label}
      </span>
      <span className="text-[9px] text-slate-500">{hint}</span>
    </button>
  );
}

function DownloadButton({ url, filename }: { url: string; filename: string }) {
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
      alert(
        `Download fehlgeschlagen: ${err instanceof Error ? err.message : "Unbekannter Fehler"}`,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
    >
      {busy ? "Lade…" : "Download"}
    </button>
  );
}
