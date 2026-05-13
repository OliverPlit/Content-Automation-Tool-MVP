"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { TEMPLATE_META, type TemplateKind } from "@/lib/creatomate/templates";
import {
  type RenderRecord,
  type RenderState,
  deleteRender,
  pollRender,
  startRender,
} from "./render-actions";

const initial: RenderState = { ok: false };

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
}: {
  creativeId: string;
  variantIndex: number;
  renders: RenderRecord[];
  hasImage: boolean;
  templateAvailability: Record<TemplateKind, boolean>;
}) {
  const [state, formAction] = useActionState(startRender, initial);

  const byKind = new Map<TemplateKind, RenderRecord>();
  renders.forEach((r) => byKind.set(r.templateKind, r));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-blue-900/5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">Renders</h2>
        <span className="text-xs text-slate-500">
          Creatomate · 3 Formate · je 1 Credit
        </span>
      </div>

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
              record={record}
              disabled={!hasImage}
              startAction={formAction}
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
  record,
  disabled,
  startAction,
}: {
  creativeId: string;
  variantIndex: number;
  templateKind: TemplateKind;
  templateLabel: string;
  templateDescription: string;
  hasTemplateId: boolean;
  outputExt: "jpg" | "png" | "mp4";
  record: RenderRecord | null;
  disabled: boolean;
  startAction: (formData: FormData) => void;
}) {
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

  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">{templateLabel}</p>
        <span className="text-[10px] uppercase tracking-wide text-slate-400">
          .{outputExt}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{templateDescription}</p>

      <div className="mt-3">
        {isDone && liveUrl && (
          <div className="space-y-2">
            {isVideo ? (
              <video
                src={liveUrl}
                controls
                playsInline
                className="aspect-square w-full rounded-md border border-slate-200 bg-white object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={liveUrl}
                alt={`${templateLabel} Render`}
                className="aspect-square w-full rounded-md border border-slate-200 object-cover"
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
          <form action={startAction}>
            <input type="hidden" name="creativeId" value={creativeId} />
            <input type="hidden" name="variantIndex" value={variantIndex} />
            <input type="hidden" name="templateKind" value={templateKind} />
            <button
              type="submit"
              disabled={disabled || !hasTemplateId}
              className="w-full rounded-lg bg-gradient-to-br from-blue-800 to-blue-950 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-blue-900/30 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              title={
                !hasTemplateId
                  ? "Template-ID fehlt in der Env"
                  : disabled
                    ? "Bild fehlt"
                    : undefined
              }
            >
              {isFailed
                ? "Erneut rendern"
                : !hasTemplateId
                  ? "Template-ID fehlt"
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
