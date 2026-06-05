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
import type { TemplateKind, TemplateOption } from "@/lib/creatomate/templates";

const initialUpdate: UpdateState = { ok: false };

export function CreativeWorkspace({
  id,
  projectId = null,
  initial,
  images,
  renders,
  createdAt,
  promptText,
  templateAvailability,
  templatePools,
}: {
  id: string;
  /** Projekt-Zuordnung des Creatives — steuert die Plan-Sichtbarkeit im
   *  Renders-Block („Bereit zum Posten"). */
  projectId?: string | null;
  initial: AdCopy;
  images: VariantImage[];
  renders: RenderRecord[];
  createdAt: string;
  promptText: string;
  templateAvailability: Record<TemplateKind, boolean>;
  templatePools: Record<TemplateKind, TemplateOption[]>;
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
        projectId={projectId}
        headline={initial.headline}
        subline={initial.subline}
        variants={initial.variants}
        imageByVariant={imageByVariant}
        rendersByVariant={rendersByVariant}
        templateAvailability={templateAvailability}
        templatePools={templatePools}
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
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-slate-900/5">
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
                <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  {state.error}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-gradient-to-br from-slate-800 to-slate-950 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-slate-900/30 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
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
// VariantAccordion → Variant-Tabs (P2-3).
// Nur EINE Variante voll sichtbar. Tabs [V1] [V2] [V3] oben wechseln.
// Default: V1 aktiv. Markiert ob Bild/Render vorhanden.
// ---------------------------------------------------------------------------
function VariantAccordion({
  creativeId,
  projectId,
  headline,
  subline,
  variants,
  imageByVariant,
  rendersByVariant,
  templateAvailability,
  templatePools,
}: {
  creativeId: string;
  projectId: string | null;
  headline: string;
  subline: string;
  variants: AdCopy["variants"];
  imageByVariant: Map<number, VariantImage>;
  rendersByVariant: Map<number, RenderRecord[]>;
  templateAvailability: Record<TemplateKind, boolean>;
  templatePools: Record<TemplateKind, TemplateOption[]>;
}) {
  const [active, setActive] = useState<number>(0);
  const safeActive = active < variants.length ? active : 0;
  const currentVariant = variants[safeActive];
  const currentImage = imageByVariant.get(safeActive) ?? null;
  const currentRenders = rendersByVariant.get(safeActive) ?? [];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
          Varianten ({variants.length})
        </p>
      </div>

      {/* Variant-Tab-Pills */}
      <div className="flex flex-wrap gap-1.5">
        {variants.map((_, i) => {
          const isActive = i === safeActive;
          const hasImage = imageByVariant.has(i);
          const hasRender = (rendersByVariant.get(i) ?? []).some(
            (r) => r.status === "succeeded",
          );
          return (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors " +
                (isActive
                  ? "bg-[var(--foreground)] text-white"
                  : "bg-[var(--color-surface)] text-[var(--foreground)] hover:bg-[var(--color-line)]")
              }
            >
              V{i + 1}
              <span className="flex items-center gap-0.5">
                <Dot active={hasImage} dim={!isActive} />
                <Dot active={hasRender} dim={!isActive} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Aktive Variante voll sichtbar */}
      {currentVariant && (
        <div className="space-y-4">
          <VariantEditCard
            creativeId={creativeId}
            index={safeActive}
            body={currentVariant.body}
            cta={currentVariant.cta}
            // UV-4: Per-Variant-Texte mit Fallback auf root (Legacy-Creatives)
            headline={
              (currentVariant as { headline?: string }).headline ?? headline
            }
            subline={
              (currentVariant as { subline?: string }).subline ?? subline
            }
            rootHeadline={headline}
            rootSubline={subline}
          />
          <VariantImageBlock
            creativeId={creativeId}
            variantIndex={safeActive}
            image={currentImage}
          />
          <VariantRendersBlock
            creativeId={creativeId}
            projectId={projectId}
            variantIndex={safeActive}
            renders={currentRenders}
            hasImage={!!currentImage}
            previewImageUrl={currentImage?.imageUrl ?? null}
            // Preview im Render-Tab nutzt die per-variant Werte
            headline={
              (currentVariant as { headline?: string }).headline ?? headline
            }
            subline={
              (currentVariant as { subline?: string }).subline ?? subline
            }
            cta={currentVariant.cta}
            templateAvailability={templateAvailability}
            templatePools={templatePools}
          />
        </div>
      )}
    </section>
  );
}

/**
 * Dot — Markiert ob Variante Bild bzw. Render hat.
 * onDark: true für aktiven schwarzen Tab-Pill → weißer Dot
 */
function Dot({ active, dim = false }: { active: boolean; dim?: boolean }) {
  // dim=true bedeutet inaktiver Tab → grau auf hellem Hintergrund
  // dim=false bedeutet aktiver Tab (schwarz) → weiß auf schwarzem Hintergrund
  if (dim) {
    return (
      <span
        className={
          "block h-1.5 w-1.5 rounded-full " +
          (active ? "bg-[var(--foreground)]" : "bg-[var(--color-line)]")
        }
      />
    );
  }
  return (
    <span
      className={
        "block h-1.5 w-1.5 rounded-full " +
        (active ? "bg-white" : "bg-white/30")
      }
    />
  );
}

function VariantEditCard({
  creativeId,
  index,
  body,
  cta,
  headline,
  subline,
  rootHeadline,
  rootSubline,
}: {
  creativeId: string;
  index: number;
  body: string;
  cta: string;
  headline: string;
  subline: string;
  /** Root-Werte (zum Anzeigen, dass es ein Fallback ist wenn variant leer) */
  rootHeadline: string;
  rootSubline: string;
}) {
  const [state, formAction, pending] = useActionState(updateVariant, initialUpdate);

  // UV-4: zeigt der User, ob die aktuellen Texte variant-eigen oder Fallback
  // sind. Hilft beim Verständnis: „warum sind 3 Varianten identisch?" →
  // weil sie alle vom root erben.
  const headlineIsFallback = headline === rootHeadline && !headline;
  const sublineIsFallback = subline === rootSubline && !subline;

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-slate-900/5"
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
            Headline
            {headlineIsFallback && (
              <span className="ml-1 text-[10px] font-normal normal-case text-[var(--color-muted)]">
                · (geteilt mit allen Varianten)
              </span>
            )}
          </label>
          <input
            name="headline"
            type="text"
            maxLength={200}
            defaultValue={headline}
            placeholder={rootHeadline}
            className={inputCls + " mt-1"}
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Subline
            {sublineIsFallback && (
              <span className="ml-1 text-[10px] font-normal normal-case text-[var(--color-muted)]">
                · (geteilt mit allen Varianten)
              </span>
            )}
          </label>
          <input
            name="subline"
            type="text"
            maxLength={300}
            defaultValue={subline}
            placeholder={rootSubline}
            className={inputCls + " mt-1"}
          />
        </div>
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
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
          {state.message}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-gradient-to-br from-slate-800 to-slate-950 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-slate-900/30 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
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
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-900">Gefahrenzone</p>
          <p className="text-xs text-slate-700">
            Löschen entfernt das Creative inkl. aller Varianten, Bilder und
            Renders.
          </p>
        </div>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
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
                className="rounded-md bg-slate-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-500"
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
  "block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-700";
