"use client";

import { useActionState, useState } from "react";

import {
  type ImageProvider,
  type ImageState,
  type VariantImage,
  deleteCreativeImage,
  generateCreativeImage,
} from "./image-actions";

const initial: ImageState = { ok: false };

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

  // Optimistic merge of action result over server-rendered image.
  const live: VariantImage | null =
    state.ok && state.imageUrl !== undefined && state.variantIndex === variantIndex
      ? {
          variantIndex,
          imageUrl: state.imageUrl,
          imagePrompt: state.imagePrompt ?? null,
          provider: state.provider ?? null,
        }
      : image;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-blue-900/5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Bild</h2>
        <span className="text-xs text-slate-500">
          1:1 · 1024×1024 · Prompt automatisch via OpenAI gpt-4o-mini
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
          <div>
            <label
              htmlFor={`provider-${variantIndex}`}
              className="block text-xs font-medium uppercase tracking-wide text-slate-500"
            >
              Anbieter
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

          {live?.imagePrompt && (
            <details>
              <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
                Verwendeter Bild-Prompt anzeigen
              </summary>
              <p className="mt-1 text-xs text-slate-600">{live.imagePrompt}</p>
            </details>
          )}

          <div className="mt-auto flex flex-wrap gap-2">
            <form action={formAction}>
              <input type="hidden" name="id" value={creativeId} />
              <input type="hidden" name="variantIndex" value={variantIndex} />
              <input type="hidden" name="provider" value={provider} />
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-gradient-to-br from-blue-800 to-blue-950 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-900/30 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {pending
                  ? "Generiere… (10–20 Sek)"
                  : live
                    ? "Neu generieren"
                    : "Bild generieren"}
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
    </section>
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
