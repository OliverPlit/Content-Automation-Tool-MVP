import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GalleryGrid, type GalleryAsset } from "./gallery-grid";

type SearchParams = Promise<{
  source?: string;
  format?: string;
  q?: string;
}>;

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const source = sp.source ?? "all";
  const format = sp.format ?? "all";
  const q = (sp.q ?? "").trim();

  const supabase = await createClient();

  let query = supabase
    .from("gallery_assets")
    .select(
      "id, url, source, prompt, format, width, height, tags, creative_id, variant_index, provider, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (source !== "all") query = query.eq("source", source);
  if (format !== "all") query = query.eq("format", format);
  if (q) query = query.or(`prompt.ilike.%${q}%,tags.cs.{${q}}`);

  const { data, error } = await query;
  const assets = ((data ?? []) as GalleryAsset[]) ?? [];

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-7 text-white shadow-xl shadow-slate-900/20">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">🖼️ Galerie</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-100">
              Alle Bilder an einem Ort — AI-generiert, hochgeladen, gescrapt,
              aus Creatives. Filter, taggen, weiterverwenden.
            </p>
          </div>
          <Link
            href="/dashboard/images/new"
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-md hover:bg-slate-50"
          >
            ✨ Neues Bild
          </Link>
        </div>
      </header>

      {error && (
        <p className="mb-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {error.message}
        </p>
      )}

      <form className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-md shadow-slate-900/5">
        <label className="flex flex-col text-xs font-semibold uppercase tracking-wider text-slate-900">
          Quelle
          <select
            name="source"
            defaultValue={source}
            className="mt-1 min-w-[160px] rounded-md border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
          >
            <option value="all">Alle</option>
            <option value="ai">🤖 AI-generiert</option>
            <option value="upload">⬆️ Upload</option>
            <option value="scrape">🔗 Scrape</option>
            <option value="creative">🎯 Creative</option>
          </select>
        </label>
        <label className="flex flex-col text-xs font-semibold uppercase tracking-wider text-slate-900">
          Format
          <select
            name="format"
            defaultValue={format}
            className="mt-1 min-w-[120px] rounded-md border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
          >
            <option value="all">Alle</option>
            <option value="1:1">1:1</option>
            <option value="9:16">9:16</option>
            <option value="4:5">4:5</option>
            <option value="16:9">16:9</option>
          </select>
        </label>
        <label className="flex flex-1 flex-col text-xs font-semibold uppercase tracking-wider text-slate-900">
          Suche (Prompt / Tag)
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="z. B. tractor, golden hour, ..."
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-slate-800"
        >
          Filtern
        </button>
      </form>

      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-900">
        {assets.length} Asset{assets.length === 1 ? "" : "s"}
      </p>

      {assets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          Noch keine Bilder. Generiere welche im{" "}
          <Link
            href="/dashboard/generate"
            className="font-semibold text-slate-700 hover:text-slate-900"
          >
            Generate
          </Link>{" "}
          oder im{" "}
          <Link
            href="/dashboard/images/new"
            className="font-semibold text-slate-700 hover:text-slate-900"
          >
            Standalone-Generator
          </Link>
          .
        </div>
      ) : (
        <GalleryGrid assets={assets} />
      )}
    </div>
  );
}
