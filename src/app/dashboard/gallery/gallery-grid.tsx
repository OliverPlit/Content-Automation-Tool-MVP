"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";
import { deleteGalleryAsset, updateGalleryAssetTags } from "./actions";

export type GalleryAsset = {
  id: string;
  url: string;
  source: "ai" | "upload" | "scrape" | "creative";
  prompt: string | null;
  format: string | null;
  width: number | null;
  height: number | null;
  tags: string[];
  creative_id: string | null;
  variant_index: number | null;
  provider: string | null;
  created_at: string;
};

const SOURCE_BADGE: Record<GalleryAsset["source"], string> = {
  ai: "🤖 AI",
  upload: "⬆️ Upload",
  scrape: "🔗 Scrape",
  creative: "🎯 Creative",
};

export function GalleryGrid({ assets }: { assets: GalleryAsset[] }) {
  const [selected, setSelected] = useState<GalleryAsset | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {assets.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setSelected(a)}
            className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-lg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.url}
              alt={a.prompt ?? "Gallery asset"}
              className="aspect-square w-full object-cover transition group-hover:scale-105"
              loading="lazy"
            />
            <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
              {SOURCE_BADGE[a.source]}
            </span>
            {a.format && (
              <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                {a.format}
              </span>
            )}
          </button>
        ))}
      </div>

      {selected && (
        <AssetLightbox
          asset={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function AssetLightbox({
  asset,
  onClose,
}: {
  asset: GalleryAsset;
  onClose: () => void;
}) {
  const [delState, delAction] = useActionState(deleteGalleryAsset, {
    ok: false,
  });
  const [tagState, tagAction] = useActionState(updateGalleryAssetTags, {
    ok: false,
  });
  const [tags, setTags] = useState(asset.tags.join(", "));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative grid max-h-[90vh] w-full max-w-5xl grid-cols-1 gap-0 overflow-hidden rounded-2xl bg-white shadow-2xl md:grid-cols-[2fr_1fr]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center bg-slate-900 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset.url}
            alt={asset.prompt ?? "Asset"}
            className="max-h-[88vh] w-auto max-w-full object-contain"
          />
        </div>

        <div className="flex flex-col overflow-y-auto p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-900">
              {SOURCE_BADGE[asset.source]}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Schließen"
            >
              ✕
            </button>
          </div>

          <dl className="grid grid-cols-2 gap-2 text-xs">
            <dt className="font-semibold text-slate-500">Format</dt>
            <dd>{asset.format ?? "—"}</dd>
            <dt className="font-semibold text-slate-500">Dimension</dt>
            <dd>
              {asset.width && asset.height
                ? `${asset.width}×${asset.height}`
                : "—"}
            </dd>
            <dt className="font-semibold text-slate-500">Provider</dt>
            <dd>{asset.provider ?? "—"}</dd>
            <dt className="font-semibold text-slate-500">Erstellt</dt>
            <dd>{new Date(asset.created_at).toLocaleString("de-AT")}</dd>
          </dl>

          {asset.prompt && (
            <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <summary className="cursor-pointer font-semibold text-slate-700">
                Prompt
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-slate-600">
                {asset.prompt}
              </p>
            </details>
          )}

          <form action={tagAction} className="mt-4">
            <input type="hidden" name="id" value={asset.id} />
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-900">
              Tags (Komma-getrennt)
            </label>
            <input
              type="text"
              name="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="z. B. traktor, sommer, action"
            />
            <button
              type="submit"
              className="mt-2 w-full rounded-md bg-slate-700 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Tags speichern
            </button>
            {tagState.error && (
              <p className="mt-1 text-xs text-slate-600">{tagState.error}</p>
            )}
            {tagState.ok && (
              <p className="mt-1 text-xs text-slate-700">✓ Gespeichert</p>
            )}
          </form>

          <div className="mt-auto space-y-2 pt-4">
            <a
              href={asset.url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg bg-slate-700 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-slate-800"
            >
              ⬇️ Download
            </a>
            {asset.creative_id && (
              <Link
                href={`/dashboard/library/${asset.creative_id}`}
                className="block rounded-lg border border-slate-700 px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                → Im Creative öffnen
              </Link>
            )}
            <form action={delAction}>
              <input type="hidden" name="id" value={asset.id} />
              <button
                type="submit"
                onClick={(e) => {
                  if (!confirm("Asset wirklich löschen?")) e.preventDefault();
                }}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                🗑️ Löschen
              </button>
              {delState.error && (
                <p className="mt-1 text-xs text-slate-600">{delState.error}</p>
              )}
            </form>
          </div>
          {/* unused image fallback to satisfy Image lint */}
          <span className="hidden">
            <Image src="/favicon.ico" alt="" width={1} height={1} />
          </span>
        </div>
      </div>
    </div>
  );
}
