"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import type { AdCopy } from "../generate/schema";
import { type UpdateState, updateHeader } from "./actions";

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
  imagesByVariant: number[];
  rendersByVariant: number[];
  renderFormats: string[]; // staticSquare | animatedSquare | reelVertical
};

type SortKey = "newest" | "oldest" | "headline";
type Filter = "all" | "with-image" | "with-render";
type FormatFilter = "staticSquare" | "animatedSquare" | "reelVertical";
type ViewMode = "list" | "grid";

const initialUpdate: UpdateState = { ok: false };

export function LibraryList({ items }: { items: LibraryItem[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [filter, setFilter] = useState<Filter>("all");
  const [formatFilter, setFormatFilter] = useState<Set<FormatFilter>>(
    new Set(),
  );
  const [view, setView] = useState<ViewMode>("list");

  const toggleFormat = (f: FormatFilter) =>
    setFormatFilter((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  const filtered = useMemo(() => {
    let list = items;

    if (filter === "with-image") {
      list = list.filter((i) => i.imagesByVariant.length > 0);
    } else if (filter === "with-render") {
      list = list.filter((i) => i.rendersByVariant.length > 0);
    }

    if (formatFilter.size > 0) {
      list = list.filter((i) =>
        i.renderFormats.some((f) => formatFilter.has(f as FormatFilter)),
      );
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
  }, [items, query, sort, filter, formatFilter]);

  const counts = useMemo(
    () => ({
      all: items.length,
      withImage: items.filter((i) => i.imagesByVariant.length > 0).length,
      withRender: items.filter((i) => i.rendersByVariant.length > 0).length,
      staticSquare: items.filter((i) =>
        i.renderFormats.includes("staticSquare"),
      ).length,
      animatedSquare: items.filter((i) =>
        i.renderFormats.includes("animatedSquare"),
      ).length,
      reelVertical: items.filter((i) =>
        i.renderFormats.includes("reelVertical"),
      ).length,
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
          <ViewToggle view={view} setView={setView} />
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

          <span className="mx-1 self-center text-slate-300">|</span>

          <Chip
            active={formatFilter.has("staticSquare")}
            onClick={() => toggleFormat("staticSquare")}
            tone="format"
          >
            + Static ({counts.staticSquare})
          </Chip>
          <Chip
            active={formatFilter.has("animatedSquare")}
            onClick={() => toggleFormat("animatedSquare")}
            tone="format"
          >
            + Animated ({counts.animatedSquare})
          </Chip>
          <Chip
            active={formatFilter.has("reelVertical")}
            onClick={() => toggleFormat("reelVertical")}
            tone="format"
          >
            + Reel ({counts.reelVertical})
          </Chip>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          {items.length === 0
            ? "Noch keine Creatives gespeichert."
            : "Keine Treffer für die aktuellen Filter."}
        </div>
      ) : view === "list" ? (
        <ul className="space-y-3">
          {filtered.map((c) => (
            <li key={c.id}>
              <ItemRow item={c} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

function ViewToggle({
  view,
  setView,
}: {
  view: ViewMode;
  setView: (v: ViewMode) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-xs shadow-sm">
      <button
        type="button"
        onClick={() => setView("list")}
        className={
          "rounded px-2.5 py-1 transition " +
          (view === "list"
            ? "bg-slate-900 text-white"
            : "text-slate-600 hover:bg-slate-100")
        }
      >
        ☰ Liste
      </button>
      <button
        type="button"
        onClick={() => setView("grid")}
        className={
          "rounded px-2.5 py-1 transition " +
          (view === "grid"
            ? "bg-slate-900 text-white"
            : "text-slate-600 hover:bg-slate-100")
        }
      >
        ▦ Grid
      </button>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  tone = "default",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "default" | "format";
}) {
  const activeCls =
    tone === "format"
      ? "bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-md shadow-blue-900/20"
      : "bg-gradient-to-br from-blue-800 to-blue-950 text-white shadow-md shadow-blue-900/30";
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full px-3 py-1 text-xs font-semibold transition-all duration-150 " +
        (active
          ? activeCls
          : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-blue-50 hover:ring-blue-300")
      }
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// List row (klassisch breit)
// ---------------------------------------------------------------------------
function ItemRow({ item }: { item: LibraryItem }) {
  return (
    <div className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-md shadow-blue-900/5 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-xl hover:shadow-blue-900/10">
      <Link
        href={`/dashboard/library/${item.id}`}
        className="shrink-0"
        aria-label="Öffnen"
      >
        <Thumbnail url={item.thumbnailUrl} size={64} />
      </Link>

      <div className="min-w-0 flex-1">
        {item.output ? (
          <>
            <QuickEditableHeadline
              id={item.id}
              initialHeadline={item.output.headline}
              initialSubline={item.output.subline}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <VariantDots
                imagesByVariant={item.imagesByVariant}
                rendersByVariant={item.rendersByVariant}
              />
              <FormatPills formats={item.renderFormats} />
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

      <Link
        href={`/dashboard/library/${item.id}`}
        className="shrink-0 self-start"
      >
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            statusStyle[item.status] ?? statusStyle.pending
          }`}
        >
          {item.status}
        </span>
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grid card (großes Thumbnail)
// ---------------------------------------------------------------------------
function ItemCard({ item }: { item: LibraryItem }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-blue-900/5 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-xl hover:shadow-blue-900/10">
      <Link
        href={`/dashboard/library/${item.id}`}
        className="block aspect-square w-full overflow-hidden bg-slate-100"
      >
        {item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
            kein Bild
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-4">
        {item.output ? (
          <>
            <QuickEditableHeadline
              id={item.id}
              initialHeadline={item.output.headline}
              initialSubline={item.output.subline}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <VariantDots
                imagesByVariant={item.imagesByVariant}
                rendersByVariant={item.rendersByVariant}
              />
              <FormatPills formats={item.renderFormats} />
            </div>
            <div className="mt-auto flex items-center justify-between pt-3 text-xs text-slate-400">
              <span>
                {new Date(item.createdAt).toLocaleDateString("de-DE")}
              </span>
              <Link
                href={`/dashboard/library/${item.id}`}
                className="font-medium text-blue-700 hover:text-blue-900"
              >
                Öffnen →
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="truncate text-sm text-slate-900">{item.prompt}</p>
            <Link
              href={`/dashboard/library/${item.id}`}
              className="mt-auto pt-3 text-xs font-medium text-blue-700 hover:text-blue-900"
            >
              Öffnen →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function Thumbnail({ url, size }: { url: string | null; size: number }) {
  const px = `${size}px`;
  if (!url) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400"
        style={{ width: px, height: px }}
      >
        kein Bild
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="rounded-md border border-slate-200 object-cover"
      style={{ width: px, height: px }}
    />
  );
}

// ---------------------------------------------------------------------------
// Quick-Edit headline (inline)
// ---------------------------------------------------------------------------
function QuickEditableHeadline({
  id,
  initialHeadline,
  initialSubline,
}: {
  id: string;
  initialHeadline: string;
  initialSubline: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(updateHeader, initialUpdate);

  // Optimistisch lokal halten; nach Erfolg übernehmen wir die User-Eingabe als
  // sichtbare Wahrheit, bis die Liste sich serverseitig revalidiert.
  const [localHeadline, setLocalHeadline] = useState(initialHeadline);
  const displayHeadline = state.ok ? localHeadline : initialHeadline;

  // Edit-Modus schließen, sobald die Action erfolgreich durch ist.
  const seenOk = useRef(false);
  useEffect(() => {
    if (state.ok && !seenOk.current) {
      seenOk.current = true;
      setEditing(false);
    }
    if (!state.ok) seenOk.current = false;
  }, [state.ok]);

  if (!editing) {
    return (
      <div>
        <div className="flex items-baseline gap-2">
          <p className="truncate text-base font-semibold text-slate-900">
            {displayHeadline}
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEditing(true);
            }}
            className="shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
            aria-label="Headline bearbeiten"
          >
            ✏️ Edit
          </button>
        </div>
        <p className="mt-0.5 truncate text-sm text-slate-600">
          {initialSubline}
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      onClick={(e) => e.stopPropagation()}
      className="space-y-2"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="subline" value={initialSubline} />
      <input
        name="headline"
        type="text"
        required
        maxLength={120}
        value={localHeadline}
        onChange={(e) => setLocalHeadline(e.target.value)}
        autoFocus
        className="block w-full rounded-md border border-blue-400 px-2 py-1 text-sm focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
      />
      {state.error && (
        <p className="text-xs text-red-700">{state.error}</p>
      )}
      <div className="flex items-center gap-2">
        <SubmitButton />
        <button
          type="button"
          onClick={() => {
            setLocalHeadline(initialHeadline);
            setEditing(false);
          }}
          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50"
        >
          Abbrechen
        </button>
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-gradient-to-br from-blue-800 to-blue-950 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm hover:shadow disabled:opacity-60"
    >
      {pending ? "Speichere…" : "Speichern"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Variant Dots + Format Pills
// ---------------------------------------------------------------------------
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

function FormatPills({ formats }: { formats: string[] }) {
  if (formats.length === 0) return null;
  const map: Record<string, { label: string; cls: string }> = {
    staticSquare: {
      label: "Static",
      cls: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
    },
    animatedSquare: {
      label: "Animated",
      cls: "bg-violet-50 text-violet-800 ring-1 ring-violet-200",
    },
    reelVertical: {
      label: "Reel",
      cls: "bg-sky-50 text-sky-800 ring-1 ring-sky-200",
    },
  };
  return (
    <div className="flex flex-wrap gap-1">
      {formats.map((f) => {
        const m = map[f];
        if (!m) return null;
        return (
          <span
            key={f}
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.cls}`}
          >
            {m.label}
          </span>
        );
      })}
    </div>
  );
}
