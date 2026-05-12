"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { AdCopy } from "../generate/schema";

const statusStyle: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  processing: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

export type LibraryItem = {
  id: string;
  prompt: string;
  status: string;
  createdAt: string;
  output: AdCopy | null;
  thumbnailUrl: string | null;
  imagesByVariant: number[]; // variant indices that have an image
  rendersByVariant: number[]; // variant indices that have at least one render
};

type SortKey = "newest" | "oldest" | "headline";
type Filter = "all" | "with-image" | "with-render";

export function LibraryList({ items }: { items: LibraryItem[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    let list = items;

    if (filter === "with-image") {
      list = list.filter((i) => i.imagesByVariant.length > 0);
    } else if (filter === "with-render") {
      list = list.filter((i) => i.rendersByVariant.length > 0);
    }

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((i) => {
        const haystack = [
          i.output?.headline ?? "",
          i.output?.subline ?? "",
          i.prompt,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === "newest")
        return +new Date(b.createdAt) - +new Date(a.createdAt);
      if (sort === "oldest")
        return +new Date(a.createdAt) - +new Date(b.createdAt);
      const ha = a.output?.headline ?? a.prompt;
      const hb = b.output?.headline ?? b.prompt;
      return ha.localeCompare(hb, "de");
    });
    return sorted;
  }, [items, query, sort, filter]);

  const counts = useMemo(
    () => ({
      all: items.length,
      withImage: items.filter((i) => i.imagesByVariant.length > 0).length,
      withRender: items.filter((i) => i.rendersByVariant.length > 0).length,
    }),
    [items],
  );

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-2 mb-4 rounded-2xl bg-white/70 px-3 py-3 shadow-sm shadow-blue-900/5 ring-1 ring-slate-200/60 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔍 Suchen in Headline, Subline, Prompt…"
            className="min-w-[240px] flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
          >
            <option value="newest">Neueste zuerst</option>
            <option value="oldest">Älteste zuerst</option>
            <option value="headline">Headline A–Z</option>
          </select>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            Alle ({counts.all})
          </Chip>
          <Chip
            active={filter === "with-image"}
            onClick={() => setFilter("with-image")}
          >
            Mit Bild ({counts.withImage})
          </Chip>
          <Chip
            active={filter === "with-render"}
            onClick={() => setFilter("with-render")}
          >
            Mit Render ({counts.withRender})
          </Chip>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          {items.length === 0
            ? "Noch keine Creatives gespeichert."
            : "Keine Treffer für die aktuellen Filter."}
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((c) => (
            <li key={c.id}>
              <ItemCard item={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full px-3 py-1 text-xs font-semibold transition-all duration-150 " +
        (active
          ? "bg-gradient-to-br from-blue-800 to-blue-950 text-white shadow-md shadow-blue-900/30"
          : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-blue-50 hover:ring-blue-300")
      }
    >
      {children}
    </button>
  );
}

function ItemCard({ item }: { item: LibraryItem }) {
  return (
    <Link
      href={`/dashboard/library/${item.id}`}
      className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-md shadow-blue-900/5 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-xl hover:shadow-blue-900/10"
    >
      <div className="relative shrink-0">
        {item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnailUrl}
            alt=""
            className="h-16 w-16 rounded-md border border-slate-200 object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400">
            kein Bild
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {item.output ? (
          <>
            <p className="truncate text-base font-semibold text-slate-900">
              {item.output.headline}
            </p>
            <p className="mt-0.5 truncate text-sm text-slate-600">
              {item.output.subline}
            </p>
            <div className="mt-2 flex items-center gap-3">
              <VariantDots
                imagesByVariant={item.imagesByVariant}
                rendersByVariant={item.rendersByVariant}
              />
              <span className="text-xs text-slate-400">
                {new Date(item.createdAt).toLocaleDateString("de-DE")}
              </span>
            </div>
          </>
        ) : (
          <>
            <p className="truncate text-sm text-slate-900">{item.prompt}</p>
            <p className="mt-1 text-xs text-slate-500">
              {new Date(item.createdAt).toLocaleString("de-DE")}
            </p>
          </>
        )}
      </div>

      <span
        className={`shrink-0 self-start rounded px-2 py-0.5 text-xs ${
          statusStyle[item.status] ?? statusStyle.pending
        }`}
      >
        {item.status}
      </span>
    </Link>
  );
}

function VariantDots({
  imagesByVariant,
  rendersByVariant,
}: {
  imagesByVariant: number[];
  rendersByVariant: number[];
}) {
  const imageSet = new Set(imagesByVariant);
  const renderSet = new Set(rendersByVariant);
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] uppercase tracking-wide text-slate-400">
        V
      </span>
      {[0, 1, 2, 3, 4].map((i) => {
        const hasImage = imageSet.has(i);
        const hasRender = renderSet.has(i);
        const cls = hasRender
          ? "bg-blue-800 ring-2 ring-blue-200"
          : hasImage
            ? "bg-emerald-500"
            : "bg-slate-200";
        const title = hasRender
          ? `Variante ${i + 1}: Render vorhanden`
          : hasImage
            ? `Variante ${i + 1}: Bild vorhanden`
            : `Variante ${i + 1}: leer`;
        return (
          <span
            key={i}
            title={title}
            className={`block h-2 w-2 rounded-full ${cls}`}
            aria-label={title}
          />
        );
      })}
    </div>
  );
}
