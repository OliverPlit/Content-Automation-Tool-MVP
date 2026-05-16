"use client";

import { useActionState, useState } from "react";

import type { AdCopy } from "../../generate/schema";
import {
  type UpdateState,
  deleteCreative,
  updateHeader,
  updateVariant,
} from "../actions";
import type { VariantImage } from "./image-actions";
import { VariantImageBlock } from "./variant-image-block";
import { VariantRendersBlock } from "./variant-renders-block";
import type { RenderRecord } from "./render-actions";
import type { TemplateKind } from "@/lib/creatomate/templates";

const initialUpdate: UpdateState = { ok: false };

export function CreativeWorkspace({
  id,
  initial,
  images,
  renders,
  createdAt,
  promptText,
  templateAvailability,
}: {
  id: string;
  initial: AdCopy;
  images: VariantImage[];
  renders: RenderRecord[];
  createdAt: string;
  promptText: string;
  templateAvailability: Record<TemplateKind, boolean>;
}) {
  const imageByVariant = new Map<number, VariantImage>();
  images.forEach((img) => imageByVariant.set(img.variantIndex, img));

  const rendersByVariant = new Map<number, RenderRecord[]>();
  renders.forEach((r) => {
    const arr = rendersByVariant.get(r.variantIndex) ?? [];
    arr.push(r);
    rendersByVariant.set(r.variantIndex, arr);
  });

  return (
    <div className="space-y-4">
      <HeaderCard
        id={id}
        headline={initial.headline}
        subline={initial.subline}
        createdAt={createdAt}
        promptText={promptText}
      />

      <VariantAccordion
        creativeId={id}
        variants={initial.variants}
        imageByVariant={imageByVariant}
        rendersByVariant={rendersByVariant}
        templateAvailability={templateAvailability}
      />

      <DangerZone id={id} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header card — Headline + Subline editable, with the original prompt collapsed
// ---------------------------------------------------------------------------
function HeaderCard({
  id,
  headline,
  subline,
  createdAt,
  promptText,
}: {
  id: string;
  headline: string;
  subline: string;
  createdAt: string;
  promptText: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(updateHeader, initialUpdate);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-blue-900/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <form action={formAction} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Headline
                </label>
                <input
                  name="headline"
                  type="text"
                  required
                  maxLength={120}
                  defaultValue={headline}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Subline
                </label>
                <input
                  name="subline"
                  type="text"
                  required
                  maxLength={200}
                  defaultValue={subline}
                  className={inputCls}
                />
              </div>
              {state.error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                  {state.error}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-gradient-to-br from-blue-800 to-blue-950 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-900/30 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {pending ? "Speichere…" : "Speichern"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          ) : (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Headline
              </p>
              <p className="mt-0.5 text-xl font-semibold text-slate-900">
                {headline}
              </p>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Subline
              </p>
              <p className="mt-0.5 text-sm text-slate-700">{subline}</p>
            </>
          )}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            ✏️ Bearbeiten
          </button>
        )}
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
          Ursprünglicher Prompt · Erstellt am{" "}
          {new Date(createdAt).toLocaleString("de-DE")}
        </summary>
        <pre className="mt-2 whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-sans text-xs text-slate-600">
          {promptText}
        </pre>
      </details>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Variant tabs
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// VariantAccordion — Alle Varianten als kollabierbare Karten.
// Default: V1 offen, andere zu. Mehrere können gleichzeitig offen sein.
// ---------------------------------------------------------------------------
function VariantAccordion({
  creativeId,
  variants,
  imageByVariant,
  rendersByVariant,
  templateAvailability,
}: {
  creativeId: string;
  variants: AdCopy["variants"];
  imageByVariant: Map<number, VariantImage>;
  rendersByVariant: Map<number, RenderRecord[]>;
  templateAvailability: Record<TemplateKind, boolean>;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0]));

  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const expandAll = () =>
    setExpanded(new Set(variants.map((_, i) => i)));
  const collapseAll = () => setExpanded(new Set());

  const openCount = expanded.size;
  const allOpen = openCount === variants.length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-blue-900">
          Varianten ({variants.length})
        </h2>
        <button
          type="button"
          onClick={allOpen ? collapseAll : expandAll}
          className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {allOpen ? "⊟ Alle einklappen" : "⊞ Alle aufklappen"}
        </button>
      </div>

      <div className="space-y-2">
        {variants.map((v, i) => (
          <AccordionItem
            key={i}
            creativeId={creativeId}
            index={i}
            body={v.body}
            cta={v.cta}
            image={imageByVariant.get(i) ?? null}
            renders={rendersByVariant.get(i) ?? []}
            templateAvailability={templateAvailability}
            isOpen={expanded.has(i)}
            onToggle={() => toggle(i)}
          />
        ))}
      </div>
    </section>
  );
}

function AccordionItem({
  creativeId,
  index,
  body,
  cta,
  image,
  renders,
  templateAvailability,
  isOpen,
  onToggle,
}: {
  creativeId: string;
  index: number;
  body: string;
  cta: string;
  image: VariantImage | null;
  renders: RenderRecord[];
  templateAvailability: Record<TemplateKind, boolean>;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const hasImage = !!image;
  const hasRender = renders.some((r) => r.status === "succeeded");
  const renderCount = renders.filter((r) => r.status === "succeeded").length;
  const dotColor = hasRender ? "indigo" : hasImage ? "emerald" : "gray";

  return (
    <article
      className={
        "overflow-hidden rounded-2xl border bg-white shadow-md shadow-blue-900/5 transition-all " +
        (isOpen
          ? "border-blue-300 ring-1 ring-blue-200"
          : "border-slate-200 hover:border-blue-200")
      }
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-blue-50/40"
      >
        <span
          className={
            "inline-flex h-5 w-5 shrink-0 items-center justify-center text-sm text-slate-400 transition-transform " +
            (isOpen ? "rotate-90 text-blue-700" : "")
          }
          aria-hidden
        >
          ▶
        </span>
        <Dot color={dotColor} />
        <span className="font-bold text-slate-900">V{index + 1}</span>
        <span className="truncate text-sm font-semibold text-blue-800">
          {cta || <em className="text-slate-400">kein CTA</em>}
        </span>
        <span className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          {hasImage && (
            <span
              title="Bild vorhanden"
              className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 ring-1 ring-emerald-200"
            >
              🖼️ Bild
            </span>
          )}
          {renderCount > 0 && (
            <span
              title={`${renderCount} Render${renderCount === 1 ? "" : "s"}`}
              className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-800 ring-1 ring-blue-200"
            >
              🎬 {renderCount}
            </span>
          )}
        </span>
      </button>

      {isOpen && (
        <div className="space-y-4 border-t border-slate-200 bg-gradient-to-b from-slate-50/60 to-white p-4">
          <VariantEditCard
            creativeId={creativeId}
            index={index}
            body={body}
            cta={cta}
          />
          <VariantImageBlock
            creativeId={creativeId}
            variantIndex={index}
            image={image}
          />
          <VariantRendersBlock
            creativeId={creativeId}
            variantIndex={index}
            renders={renders}
            hasImage={hasImage}
            templateAvailability={templateAvailability}
          />
        </div>
      )}
    </article>
  );
}

function Dot({ color }: { color: "indigo" | "emerald" | "gray" }) {
  const cls =
    color === "indigo"
      ? "bg-sky-400 ring-2 ring-sky-200"
      : color === "emerald"
        ? "bg-emerald-500"
        : "bg-slate-300";
  return <span className={`block h-2 w-2 rounded-full ${cls}`} />;
}

function VariantEditCard({
  creativeId,
  index,
  body,
  cta,
}: {
  creativeId: string;
  index: number;
  body: string;
  cta: string;
}) {
  const [state, formAction, pending] = useActionState(updateVariant, initialUpdate);

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-blue-900/5"
    >
      <input type="hidden" name="id" value={creativeId} />
      <input type="hidden" name="variantIndex" value={index} />

      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          Variante {index + 1}
        </h2>
        <span className="text-xs text-slate-500">{cta}</span>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Body
          </label>
          <textarea
            name="body"
            rows={4}
            required
            maxLength={600}
            defaultValue={body}
            className={inputCls + " mt-1"}
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            CTA
          </label>
          <input
            name="cta"
            type="text"
            required
            maxLength={60}
            defaultValue={cta}
            className={inputCls + " mt-1"}
          />
        </div>
      </div>

      {state.error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
          {state.message}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-gradient-to-br from-blue-800 to-blue-950 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-900/30 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {pending ? "Speichere…" : "Variante speichern"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Danger zone — delete entire creative
// ---------------------------------------------------------------------------
function DangerZone({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="rounded-xl border border-red-200 bg-red-50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-red-900">Gefahrenzone</p>
          <p className="text-xs text-red-700">
            Löschen entfernt das Creative inkl. aller Varianten, Bilder und
            Renders.
          </p>
        </div>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            Creative löschen
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Abbrechen
            </button>
            <form action={deleteCreative}>
              <input type="hidden" name="id" value={id} />
              <button
                type="submit"
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
              >
                Endgültig löschen
              </button>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}

const inputCls =
  "block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700";
