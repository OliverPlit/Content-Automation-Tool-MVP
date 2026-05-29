"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  TEMPLATE_META,
  type TemplateKind,
  type TemplateOption,
} from "@/lib/creatomate/templates";
import {
  type BulkRenderState,
  type RenderRecord,
  type RenderState,
  deleteRender,
  pollRender,
  startBulkRender,
  startRender,
} from "./render-actions";

const initial: RenderState = { ok: false };
const initialBulk: BulkRenderState = { ok: false };

const TEMPLATE_ORDER: TemplateKind[] = [
  "staticSquare",
  "animatedSquare",
  "reelVertical",
];

export function VariantRendersBlock({
  creativeId,
  variantIndex,
  renders,
  hasImage,
  templateAvailability,
  templatePools,
}: {
  creativeId: string;
  variantIndex: number;
  renders: RenderRecord[];
  hasImage: boolean;
  templateAvailability: Record<TemplateKind, boolean>;
  templatePools: Record<TemplateKind, TemplateOption[]>;
}) {
  const [state, formAction] = useActionState(startRender, initial);
  const [bulkState, bulkAction, bulkPending] = useActionState(
    startBulkRender,
    initialBulk,
  );

  // Aktive Renders nach Kind: pro Kind zeigen wir den letzten Render (bei
  // mehreren Slots pro Kind könnte es theoretisch mehrere geben — sortiert
  // nach created_at desc liefert die page.tsx, wir nehmen den ersten Match).
  const byKind = new Map<TemplateKind, RenderRecord>();
  renders.forEach((r) => {
    if (!byKind.has(r.templateKind)) byKind.set(r.templateKind, r);
  });

  // Alle 3 Templates schon fertig oder laufen? Dann Bulk-Button ausblenden.
  const allActive = ["staticSquare", "animatedSquare", "reelVertical"].every(
    (k) => {
      const r = byKind.get(k as TemplateKind);
      return r && (r.status === "succeeded" || r.status === "processing" || r.status === "pending");
    },
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-blue-900/5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">Renders</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            Creatomate · 3 Formate · je 1 Credit
          </span>
          {hasImage && !allActive && (
            <form action={bulkAction}>
              <input type="hidden" name="creativeId" value={creativeId} />
              <input type="hidden" name="variantIndex" value={variantIndex} />
              <input type="hidden" name="scope" value="variant" />
              <button
                type="submit"
                disabled={bulkPending}
                className="rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-800 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-emerald-900/30 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bulkPending ? "Starte…" : "⚡ Alle 3 Formate parallel rendern"}
              </button>
            </form>
          )}
        </div>
      </div>
      {bulkState.ok && bulkState.startedCount && bulkState.startedCount > 0 && (
        <p className="mt-2 rounded-md bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
          ✓ {bulkState.startedCount} Render{bulkState.startedCount === 1 ? "" : "s"} parallel gestartet.
          {bulkState.failedCount ? ` (${bulkState.failedCount} fehlgeschlagen)` : ""}
        </p>
      )}
      {bulkState.error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700">
          {bulkState.error}
        </p>
      )}

      {!hasImage && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Generiere oben zuerst ein Bild für diese Variante — sonst kann
          Creatomate nichts rendern.
        </p>
      )}
      {state.error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {TEMPLATE_ORDER.map((kind) => {
          const tpl = TEMPLATE_META[kind];
          const record = byKind.get(kind) ?? null;
          return (
            <RenderSlot
              key={kind}
              creativeId={creativeId}
              variantIndex={variantIndex}
              templateKind={kind}
              templateLabel={tpl.label}
              templateDescription={tpl.description}
              hasTemplateId={templateAvailability[kind]}
              outputExt={tpl.outputExt}
              aspectRatio={tpl.aspectRatio}
              record={record}
              disabled={!hasImage}
              startAction={formAction}
              pool={templatePools[kind] ?? []}
            />
          );
        })}
      </div>
    </section>
  );
}

function RenderSlot({
  creativeId,
  variantIndex,
  templateKind,
  templateLabel,
  templateDescription,
  hasTemplateId,
  outputExt,
  aspectRatio,
  record,
  disabled,
  startAction,
  pool,
}: {
  creativeId: string;
  variantIndex: number;
  templateKind: TemplateKind;
  templateLabel: string;
  templateDescription: string;
  hasTemplateId: boolean;
  outputExt: "jpg" | "png" | "mp4";
  aspectRatio: string;
  record: RenderRecord | null;
  disabled: boolean;
  startAction: (formData: FormData) => void;
  pool: TemplateOption[];
}) {
  // Slot-Auswahl: persistent über Re-Renders.
  // Default = bisheriger Slot des Records, sonst erstes VERFÜGBARES Pool-Item,
  // sonst Fallback aufs erste (auch wenn nicht verfügbar).
  const firstAvailable = pool.find((p) => p.available)?.slot ?? pool[0]?.slot ?? "";
  const defaultSlot = record?.templateSlot ?? firstAvailable;
  const [selectedSlot, setSelectedSlot] = useState<string>(defaultSlot);
  const activeSlot = pool.some((p) => p.slot === selectedSlot)
    ? selectedSlot
    : firstAvailable;
  const activeOption = pool.find((p) => p.slot === activeSlot);
  const activeAvailable = activeOption?.available ?? false;
  // Tailwind kann arbitrary aspect-ratios via "aspect-[w/h]" rendern.
  // Wir mappen die Template-Definition auf eine konkrete CSS-Klasse.
  const aspectClass =
    aspectRatio === "9:16"
      ? "aspect-[9/16]"
      : aspectRatio === "16:9"
        ? "aspect-[16/9]"
        : aspectRatio === "4:5"
          ? "aspect-[4/5]"
          : "aspect-square";
  const [override, setOverride] = useState<{
    forId: string;
    status: RenderRecord["status"];
    outputUrl: string | null;
    errorMessage: string | null;
  } | null>(null);
  const pollingRef = useRef<string | null>(null);

  const liveStatus: RenderRecord["status"] | null =
    override && override.forId === record?.id
      ? override.status
      : (record?.status ?? null);
  const liveUrl: string | null =
    override && override.forId === record?.id
      ? override.outputUrl
      : (record?.outputUrl ?? null);
  const liveErr: string | null =
    override && override.forId === record?.id
      ? override.errorMessage
      : (record?.errorMessage ?? null);

  useEffect(() => {
    if (!record) {
      pollingRef.current = null;
      return;
    }
    if (record.status !== "processing" && record.status !== "pending") return;
    if (pollingRef.current === record.id) return;

    pollingRef.current = record.id;
    const renderId = record.id;
    const started = Date.now();
    const maxMs = 3 * 60 * 1000;

    const tick = async () => {
      if (pollingRef.current !== renderId) return;
      const result = await pollRender(renderId);
      if (result.status === "succeeded") {
        setOverride({
          forId: renderId,
          status: "succeeded",
          outputUrl: result.outputUrl ?? null,
          errorMessage: null,
        });
        pollingRef.current = null;
        return;
      }
      if (result.status === "failed" || result.status === "missing") {
        setOverride({
          forId: renderId,
          status: "failed",
          outputUrl: null,
          errorMessage: result.errorMessage ?? "Render fehlgeschlagen.",
        });
        pollingRef.current = null;
        return;
      }
      if (Date.now() - started > maxMs) {
        setOverride({
          forId: renderId,
          status: "failed",
          outputUrl: null,
          errorMessage: "Timeout (>3 Minuten).",
        });
        pollingRef.current = null;
        return;
      }
      setTimeout(tick, 3000);
    };
    setTimeout(tick, 1500);

    return () => {
      if (pollingRef.current === renderId) pollingRef.current = null;
    };
  }, [record]);

  const isRunning = liveStatus === "processing" || liveStatus === "pending";
  const isDone = liveStatus === "succeeded" && liveUrl;
  const isFailed = liveStatus === "failed";
  const isVideo = outputExt === "mp4";

  const recordSlotLabel = record?.templateSlot
    ? pool.find((p) => p.slot === record.templateSlot)?.label ?? null
    : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">{templateLabel}</p>
        <span className="text-[10px] uppercase tracking-wide text-slate-400">
          .{outputExt}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{templateDescription}</p>
      {recordSlotLabel && (
        <p className="mt-0.5 text-[10px] font-medium text-blue-700">
          ▸ {recordSlotLabel}
        </p>
      )}

      <div className="mt-3">
        {isDone && liveUrl && (
          <div className="space-y-2">
            {isVideo ? (
              <video
                src={liveUrl}
                controls
                playsInline
                className={`${aspectClass} mx-auto w-full max-w-[260px] rounded-md border border-slate-200 bg-black object-contain`}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={liveUrl}
                alt={`${templateLabel} Render`}
                className={`${aspectClass} mx-auto w-full max-w-[260px] rounded-md border border-slate-200 object-cover`}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <DownloadButton
                url={liveUrl}
                filename={`creative-v${variantIndex + 1}-${templateKind}.${outputExt}`}
              />
              {record && (
                <form action={deleteRender}>
                  <input type="hidden" name="renderId" value={record.id} />
                  <input type="hidden" name="creativeId" value={creativeId} />
                  <button
                    type="submit"
                    className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    Entfernen
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {isRunning && (
          <p className="text-xs text-slate-500">
            Rendert… <span className="animate-pulse">●</span>
          </p>
        )}

        {isFailed && (
          <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
            {liveErr ?? "Fehlgeschlagen."}
          </p>
        )}

        {!isDone && !isRunning && (
          <form action={startAction} className="space-y-2">
            <input type="hidden" name="creativeId" value={creativeId} />
            <input type="hidden" name="variantIndex" value={variantIndex} />
            <input type="hidden" name="templateKind" value={templateKind} />
            <input type="hidden" name="templateSlot" value={activeSlot} />

            {pool.length >= 1 && (
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Template-Variante
                </label>
                <select
                  value={activeSlot}
                  onChange={(e) => setSelectedSlot(e.target.value)}
                  disabled={disabled}
                  className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700 disabled:opacity-60"
                >
                  {pool.map((opt) => (
                    <option
                      key={opt.slot}
                      value={opt.slot}
                      disabled={!opt.available}
                    >
                      {opt.available ? opt.label : `${opt.label} (Env fehlt)`}
                    </option>
                  ))}
                </select>
                {activeOption?.description && (
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {activeOption.description}
                  </p>
                )}
                {activeOption && !activeOption.available && (
                  <p className="mt-0.5 break-all text-[10px] text-amber-700">
                    ⚠ Setze <code className="rounded bg-amber-100 px-1">{activeOption.envVar}</code> in .env.local
                  </p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={disabled || !activeAvailable}
              className="w-full rounded-lg bg-gradient-to-br from-blue-800 to-blue-950 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-blue-900/30 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              title={
                !activeAvailable
                  ? `Env-Var fehlt: ${activeOption?.envVar ?? "—"}`
                  : disabled
                    ? "Bild fehlt"
                    : undefined
              }
            >
              {isFailed
                ? "Erneut rendern"
                : !activeAvailable
                  ? "Template nicht konfiguriert"
                  : "Rendern (1 Credit)"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function DownloadButton({
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
      className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
    >
      {busy ? "Lade…" : "Download"}
    </button>
  );
}
