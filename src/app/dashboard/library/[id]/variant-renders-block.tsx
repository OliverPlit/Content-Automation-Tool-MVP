"use client";

import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import { Icon } from "@/components/icon";
import {
  TEMPLATE_META,
  type TemplateKind,
  type TemplateOption,
} from "@/lib/creatomate/templates";
import {
  PLATFORM_FORMAT_PRESETS,
  PLATFORM_LABELS,
  type RenderPlatform,
} from "@/lib/creatomate/platform-presets";
import {
  type RenderRecord,
  type RenderState,
  deleteRender,
  pollRender,
  startRender,
} from "./render-actions";
import {
  POST_STATUSES,
  TARGET_PLATFORMS,
  type PostStatus,
} from "@/app/dashboard/projects/[id]/schedule-constants";
import {
  updateRenderPlan,
  updateRenderStatus,
  type ScheduleState,
} from "@/app/dashboard/projects/[id]/schedule-actions";

const initial: RenderState = { ok: false };
const initialSchedule: ScheduleState = { ok: false };

const TEMPLATE_ORDER: TemplateKind[] = [
  "static_1x1",
  "static_4x5",
  "staticSquare",
  "static_16x9",
  "animatedSquare",
  "reel_1x1",
  "reelVertical",
  "reel_16x9",
];

type Tab = "render" | "drafts" | "ready";

export function VariantRendersBlock({
  creativeId,
  projectId = null,
  variantIndex,
  renders,
  hasImage,
  previewImageUrl,
  headline,
  subline,
  cta,
  templateAvailability: _templateAvailability,
  templatePools,
}: {
  creativeId: string;
  /** Projekt-Zuordnung des Creatives — steuert, ob im „Bereit zum Posten"-Tab
   *  der Plan (Datum/Plattform) angezeigt wird. */
  projectId?: string | null;
  variantIndex: number;
  renders: RenderRecord[];
  hasImage: boolean;
  previewImageUrl?: string | null;
  headline?: string;
  subline?: string;
  cta?: string;
  templateAvailability: Record<TemplateKind, boolean>;
  templatePools: Record<TemplateKind, TemplateOption[]>;
}) {
  void _templateAvailability;
  const [tab, setTab] = useState<Tab>("render");

  // CLIENT-SEITIGE Live-State: der Server-`renders`-Prop refresht nach einem
  // Render NICHT zuverlässig (router.refresh hängt im Turbopack-dev). Darum
  // sammeln wir die frisch fertig gerenderten Records (aus dem Slot-Polling)
  // hier — damit der Drafts-Tab SOFORT aktualisiert, ohne Page-Reload.
  const [liveRenders, setLiveRenders] = useState<Map<string, RenderRecord>>(
    () => new Map(),
  );
  // IDs, die der User gerade gelöscht hat → sofort aus der Ansicht entfernen,
  // ohne auf einen (im Turbopack-dev unzuverlässigen) Server-Refresh zu warten.
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());

  const handleLiveRender = useCallback((rec: RenderRecord) => {
    setLiveRenders((prev) => {
      const next = new Map(prev);
      next.set(rec.id, rec);
      return next;
    });
  }, []);

  const handleRemove = useCallback((renderId: string) => {
    setRemovedIds((prev) => {
      if (prev.has(renderId)) return prev;
      const next = new Set(prev);
      next.add(renderId);
      return next;
    });
  }, []);

  // Optimistische Patches für Workflow-Aktionen (Approve, Schedule, Live, …).
  // Der Server-`renders`-Prop zieht im Turbopack-dev nicht zuverlässig nach,
  // also halten wir die letzten Status-/Plan-Änderungen client-seitig.
  const [patches, setPatches] = useState<Map<string, Partial<RenderRecord>>>(
    () => new Map(),
  );
  const handlePatch = useCallback(
    (renderId: string, patch: Partial<RenderRecord>) => {
      setPatches((prev) => {
        const next = new Map(prev);
        next.set(renderId, { ...(prev.get(renderId) ?? {}), ...patch });
        return next;
      });
    },
    [],
  );

  // Globale Notiz-Leiste für Workflow-Aktionen (Approve, Live setzen, …).
  // Liegt BEWUSST im Parent: Wenn der Status-Wechsel die Karte in einen anderen
  // Tab schiebt, unmountet die Karte — eine kartenlokale Fehler-/Erfolgsmeldung
  // wäre dann sofort weg. Im Parent bleibt sie sichtbar.
  const [notice, setNotice] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);

  // Server-Renders + Live-Renders gemerged (Server gewinnt bei gleicher ID,
  // da es die Source-of-Truth ist sobald es nachzieht), danach optimistische
  // Patches drübergelegt.
  const allRenders = useMemo(() => {
    const byId = new Map<string, RenderRecord>();
    renders.forEach((r) => byId.set(r.id, r));
    liveRenders.forEach((r, id) => {
      if (!byId.has(id)) byId.set(id, r);
    });
    let merged = Array.from(byId.values());
    if (removedIds.size > 0) {
      merged = merged.filter((r) => !removedIds.has(r.id));
    }
    if (patches.size === 0) return merged;
    return merged.map((r) => {
      const p = patches.get(r.id);
      return p ? { ...r, ...p } : r;
    });
  }, [renders, liveRenders, patches, removedIds]);

  // Renders nach Kind, in stabiler Reihenfolge (Server liefert ASC nach
  // created_at). Slot i picks recordsOfKind[i-tes-Vorkommen-dieses-Kinds],
  // damit zwei Slots mit demselben Format (z. B. beide static_1x1) parallel
  // arbeiten — Slot 0 zeigt den ältesten 1x1-Render, Slot 1 den nächsten usw.
  // WICHTIG: removedIds wird hier NICHT gefiltert. Sonst würde beim Löschen
  // eines Slots der nächste Render nach vorne rutschen („Slot 1 zeigt jetzt
  // was vorher in Slot 2 war"). Stattdessen wird die Löschung erst beim
  // Slot-Picking unten berücksichtigt: ist der gepickte Record gelöscht,
  // bekommt der Slot `null` (= leer + neu renderbar), die anderen Slots
  // bleiben unverändert.
  const byKind = useMemo(() => {
    const m = new Map<TemplateKind, RenderRecord[]>();
    renders.forEach((r) => {
      const list = m.get(r.templateKind) ?? [];
      list.push(r);
      m.set(r.templateKind, list);
    });
    return m;
  }, [renders]);

  const succeededRenders = useMemo(
    () => allRenders.filter((r) => r.status === "succeeded" && r.outputUrl),
    [allRenders],
  );

  // Jeder fertige Render IST automatisch ein Draft und bleibt als
  // creative_renders-Row in der DB gespeichert, bis der User ihn explizit
  // löscht. Kein separater „In Drafts speichern"-Schritt mehr — das war
  // fragil (saved_at-Migration / PostgREST-Schema-Cache). Drafts hängen jetzt
  // nur noch an post_status (zuverlässig vorhanden seit der Scheduling-Migration).
  const drafts = useMemo(
    () =>
      succeededRenders.filter(
        (r) =>
          (r.postStatus ?? "draft") === "draft" || r.postStatus === "review",
      ),
    [succeededRenders],
  );
  const ready = useMemo(
    () =>
      succeededRenders.filter(
        (r) =>
          r.postStatus === "approved" ||
          r.postStatus === "scheduled" ||
          r.postStatus === "live",
      ),
    [succeededRenders],
  );

  return (
    <section className="rounded-xl border border-[var(--color-line)] bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
            Renders
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--color-muted)]">
            Format auswählen · rendern · in Draft bearbeiten · zum Posten freigeben
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        <TabPill
          label="Auswahl & Render"
          count={TEMPLATE_ORDER.length}
          active={tab === "render"}
          onClick={() => setTab("render")}
        />
        <TabPill
          label="Drafts"
          count={drafts.length}
          active={tab === "drafts"}
          onClick={() => setTab("drafts")}
        />
        <TabPill
          label="Bereit zum Posten"
          count={ready.length}
          active={tab === "ready"}
          onClick={() => setTab("ready")}
        />
      </div>

      {notice && (
        <div
          className={
            "mt-4 flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-[12px] " +
            (notice.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700")
          }
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Meldung schließen"
            className="shrink-0 rounded px-1 text-[12px] font-medium leading-none opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      <div className="mt-5">
        {tab === "render" && (
          <RenderTab
            creativeId={creativeId}
            variantIndex={variantIndex}
            byKind={byKind}
            removedIds={removedIds}
            hasImage={hasImage}
            previewImageUrl={previewImageUrl ?? null}
            headline={headline ?? ""}
            subline={subline ?? ""}
            cta={cta ?? ""}
            templatePools={templatePools}
            onLiveRender={handleLiveRender}
            onRemove={handleRemove}
          />
        )}
        {tab === "drafts" && (
          <DraftsTab
            creativeId={creativeId}
            drafts={drafts}
            onPatch={handlePatch}
            onRemove={handleRemove}
            onNotice={setNotice}
          />
        )}
        {tab === "ready" && (
          <ReadyTab
            creativeId={creativeId}
            projectId={projectId}
            ready={ready}
            onPatch={handlePatch}
            onRemove={handleRemove}
            onNotice={setNotice}
          />
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// TabPill
// ---------------------------------------------------------------------------
function TabPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors " +
        (active
          ? "bg-[var(--foreground)] text-white"
          : "bg-[var(--color-surface)] text-[var(--foreground)] hover:bg-[var(--color-line)]")
      }
    >
      <span>{label}</span>
      <span
        className={
          "rounded-full px-1.5 text-[10px] font-medium tabular-nums " +
          (active ? "bg-white/15 text-white" : "bg-white text-[var(--color-muted)]")
        }
      >
        {count}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// TAB 1 — Auswahl & Render
// 3 fixe Slots immer sichtbar. Pro Slot wählt der User aus einem Dropdown
// das gewünschte Format (z.B. Static 1:1 → Reel 9:16). Die Vorschau passt
// sich live an das gewählte Aspect-Ratio an.
// ---------------------------------------------------------------------------
const DEFAULT_KINDS_3: TemplateKind[] = [
  "static_1x1",
  "static_4x5",
  "reelVertical",
];

function RenderTab({
  creativeId,
  variantIndex,
  byKind,
  removedIds,
  hasImage,
  previewImageUrl,
  headline,
  subline,
  cta,
  templatePools,
  onLiveRender,
  onRemove,
}: {
  creativeId: string;
  variantIndex: number;
  byKind: Map<TemplateKind, RenderRecord[]>;
  removedIds: Set<string>;
  hasImage: boolean;
  previewImageUrl: string | null;
  headline: string;
  subline: string;
  cta: string;
  templatePools: Record<TemplateKind, TemplateOption[]>;
  onLiveRender: (rec: RenderRecord) => void;
  onRemove: (renderId: string) => void;
}) {
  const router = useRouter();
  // STRUKTUR-ÄNDERUNG: useActionState wandert in jeden Slot (RenderSlot
  // hat eigene useActionState). So weiß jeder Slot SELBST ob er gerade
  // einen Render gestartet hat, kann optimistisch „Rendert…" zeigen und
  // selbst polling triggern — ohne auf Server-Refresh zu warten.
  // RenderTab muss nur noch slot-übergreifenden State (slotKinds, platform)
  // verwalten.

  // State pro Slot: welcher Format-Kind ist gerade gewählt
  const [slotKinds, setSlotKinds] = useState<TemplateKind[]>(DEFAULT_KINDS_3);
  // Aktuelle Plattform — wenn gesetzt, sind die Slots von ihr abgeleitet.
  // Manueller Slot-Wechsel setzt den Plattform-Status auf "custom".
  const [platform, setPlatform] = useState<RenderPlatform | "custom">(
    "custom",
  );

  const setSlotKind = (idx: number, kind: TemplateKind) => {
    setSlotKinds((prev) => prev.map((k, i) => (i === idx ? kind : k)));
    setPlatform("custom"); // Manueller Eingriff → Plattform-Preset gilt nicht mehr.
  };

  const applyPlatform = (p: RenderPlatform) => {
    setPlatform(p);
    setSlotKinds([...PLATFORM_FORMAT_PRESETS[p]]);
  };

  const handleRenderAll = async () => {
    for (const kind of slotKinds) {
      const fd = new FormData();
      fd.set("creativeId", creativeId);
      fd.set("variantIndex", String(variantIndex));
      fd.set("templateKind", kind);
      const slot = templatePools[kind]?.find((p) => p.available)?.slot;
      if (slot) fd.set("templateSlot", slot);
      await startRender({ ok: false }, fd);
    }
    router.refresh();
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label
            htmlFor="platform-picker"
            className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]"
          >
            Plattform
          </label>
          <select
            id="platform-picker"
            value={platform}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "custom") setPlatform("custom");
              else applyPlatform(v as RenderPlatform);
            }}
            className="rounded-md border border-[var(--color-line)] bg-white px-2 py-1 text-[12px] focus:border-[var(--foreground)] focus:outline-none"
            title="Wähle eine Plattform — die 3 Format-Slots werden automatisch passend gesetzt"
          >
            <option value="custom">— eigene Auswahl —</option>
            {(Object.keys(PLATFORM_LABELS) as RenderPlatform[]).map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-[var(--color-muted)]">
            {platform === "custom"
              ? "3 Slots manuell"
              : "Slots automatisch gesetzt — pro Slot änderbar"}
          </span>
        </div>
        {hasImage && (
          <button
            type="button"
            onClick={handleRenderAll}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--foreground)] px-3.5 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <Icon name="play" className="size-3" fill="currentColor" />
            Alle 3 rendern
          </button>
        )}
      </div>

      {/* Fehler-Display wandert in jeden Slot (jeder hat eigenen state) */}
      {!hasImage && (
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-800">
          Generiere zuerst ein Bild für diese Variante.
        </p>
      )}

      {/* 3 fixe Slots — Format pro Slot via Dropdown wählbar. Mehrere Slots
          mit demselben Kind sind unabhängig: Slot 1 nimmt Render Nr. 0,
          Slot 2 mit gleichem Kind den Nr. 1 usw. So lässt sich dasselbe
          Format parallel rendern. */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {slotKinds.map((kind, idx) => {
          const tpl = TEMPLATE_META[kind];
          const recordsOfKind = byKind.get(kind) ?? [];
          const nthInKind = (() => {
            let n = 0;
            for (let i = 0; i < idx; i++) if (slotKinds[i] === kind) n++;
            return n;
          })();
          const candidate = recordsOfKind[nthInKind] ?? null;
          // Gelöschte Records → Slot leer lassen, OHNE nachfolgende Slots
          // nach vorne zu schieben. So bleibt das Slot↔Render-Mapping stabil.
          const record =
            candidate && removedIds.has(candidate.id) ? null : candidate;
          return (
            <RenderSlot
              key={`slot-${idx}`}
              slotIndex={idx + 1}
              creativeId={creativeId}
              variantIndex={variantIndex}
              templateKind={kind}
              onKindChange={(k) => setSlotKind(idx, k)}
              templateLabel={tpl.label}
              templateDescription={tpl.description}
              platformHint={tpl.platforms}
              outputExt={tpl.outputExt}
              aspectRatio={tpl.aspectRatio}
              record={record}
              disabled={!hasImage}
              pool={templatePools[kind] ?? []}
              previewImageUrl={previewImageUrl}
              headline={headline}
              subline={subline}
              cta={cta}
              onLiveRender={onLiveRender}
              onRemove={onRemove}
            />
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// TAB 2 — Drafts
// ---------------------------------------------------------------------------
function DraftsTab({
  creativeId,
  drafts,
  onPatch,
  onRemove,
  onNotice,
}: {
  creativeId: string;
  drafts: RenderRecord[];
  onPatch: (renderId: string, patch: Partial<RenderRecord>) => void;
  onRemove: (renderId: string) => void;
  onNotice: (n: { kind: "ok" | "err"; text: string } | null) => void;
}) {
  if (drafts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-10 text-center text-[13px] text-[var(--color-muted)]">
        <p>Keine Drafts.</p>
        <p className="mt-1 text-[11px]">
          Im Auswahl-Tab ein Format rendern — fertige Renders landen automatisch
          hier und bleiben gespeichert, bis du sie löschst.
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {drafts.map((r) => (
        <DraftCard
          key={r.id}
          record={r}
          creativeId={creativeId}
          onPatch={onPatch}
          onRemove={onRemove}
          onNotice={onNotice}
        />
      ))}
    </div>
  );
}

function DraftCard({
  record,
  creativeId,
  onPatch,
  onRemove,
  onNotice,
}: {
  record: RenderRecord;
  creativeId: string;
  onPatch: (renderId: string, patch: Partial<RenderRecord>) => void;
  onRemove: (renderId: string) => void;
  onNotice: (n: { kind: "ok" | "err"; text: string } | null) => void;
}) {
  const [notesState, notesAction, notesPending] = useActionState(
    updateRenderPlan,
    initialSchedule,
  );

  const currentStatus: PostStatus = record.postStatus ?? "draft";
  const tpl = TEMPLATE_META[record.templateKind];
  const isVideo = tpl?.outputExt === "mp4";
  const aspectClass =
    tpl?.aspectRatio === "9:16"
      ? "aspect-[9/16]"
      : tpl?.aspectRatio === "16:9"
        ? "aspect-[16/9]"
        : tpl?.aspectRatio === "4:5"
          ? "aspect-[4/5]"
          : "aspect-square";

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-line)] bg-white">
      <div className="px-3 pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[13px] font-semibold text-[var(--foreground)]">
            {tpl?.label ?? record.templateKind}
          </p>
          <span className="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--foreground)]">
            {record.postStatus === "review" ? "Review" : "Draft"}
          </span>
        </div>
      </div>

      {record.outputUrl && (
        <div className="mt-2 px-3">
          <div className={"overflow-hidden rounded-lg border border-[var(--color-line)] " + aspectClass}>
            {isVideo ? (
              <video src={record.outputUrl} controls playsInline className="h-full w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={record.outputUrl} alt="" className="h-full w-full object-cover" />
            )}
          </div>
        </div>
      )}

      {/* Notizen */}
      <form action={notesAction} className="p-3 pt-2">
        <input type="hidden" name="renderId" value={record.id} />
        <input type="hidden" name="creativeId" value={creativeId} />
        <input type="hidden" name="scheduledAt" value="" />
        <input type="hidden" name="postStatus" value={record.postStatus ?? "draft"} />
        <label className="block text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
          Notizen / Briefing
        </label>
        <textarea
          name="notes"
          rows={2}
          defaultValue={record.notes ?? ""}
          placeholder="z. B. Headline anpassen, Farbe ändern, A/B-Test gegen V2"
          className="mt-1 block w-full rounded-md border border-[var(--color-line)] px-2 py-1 text-[11px] focus:border-[var(--foreground)] focus:outline-none"
        />
        <button
          type="submit"
          disabled={notesPending}
          className="mt-2 inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--foreground)] hover:bg-[var(--color-surface)] disabled:opacity-50"
        >
          <Icon name="check" className="size-3" />
          Notiz speichern
        </button>
        {notesState.ok && notesState.renderId === record.id && (
          <span className="ml-2 text-[10px] text-[var(--color-muted)]">✓</span>
        )}
      </form>

      {/* Status-Wechsel */}
      <div className="flex flex-wrap items-center gap-1 border-t border-[var(--color-line)] bg-[var(--color-surface)]/40 px-3 py-2">
        {record.postStatus !== "review" && (
          <WorkflowButton
            renderId={record.id}
            newStatus="review"
            currentStatus={currentStatus}
            label="Zu Review"
            onPatch={onPatch}
            onNotice={onNotice}
            successText="Auf „Review“ gesetzt."
          />
        )}
        <WorkflowButton
          renderId={record.id}
          newStatus="approved"
          currentStatus={currentStatus}
          label="Approve"
          primary
          onPatch={onPatch}
          onNotice={onNotice}
          successText="Genehmigt — jetzt im Tab „Bereit zum Posten“."
        />
        <span className="ml-auto">
          <DeleteRenderButton
            renderId={record.id}
            creativeId={creativeId}
            onRemove={onRemove}
            label="Löschen"
          />
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB 3 — Bereit zum Posten
// ---------------------------------------------------------------------------
function ReadyTab({
  creativeId,
  projectId,
  ready,
  onPatch,
  onRemove,
  onNotice,
}: {
  creativeId: string;
  projectId: string | null;
  ready: RenderRecord[];
  onPatch: (renderId: string, patch: Partial<RenderRecord>) => void;
  onRemove: (renderId: string) => void;
  onNotice: (n: { kind: "ok" | "err"; text: string } | null) => void;
}) {
  if (ready.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-10 text-center text-[13px] text-[var(--color-muted)]">
        <p>Noch nichts bereit zum Posten.</p>
        <p className="mt-1 text-[11px]">
          Im Drafts-Tab auf „Approve“ klicken — dann erscheint das Item hier mit
          Datum + Plattform-Wahl.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {/* Briefing-Hinweis: aktuell kein Auto-Post — der Plan dient als Briefing. */}
      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[11px] leading-snug text-[var(--color-muted)]">
        <span className="font-medium text-[var(--foreground)]">Plan = Briefing.</span>{" "}
        Datum + Plattform festlegen und den Plan speichern. Auto-Posting zu Meta
        ist noch nicht aktiv — nach dem manuellen Posten auf der Plattform hier
        auf „Live setzen“ klicken.
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ready.map((r) => (
          <ReadyCard
            key={r.id}
            record={r}
            creativeId={creativeId}
            projectId={projectId}
            onPatch={onPatch}
            onRemove={onRemove}
            onNotice={onNotice}
          />
        ))}
      </div>
    </div>
  );
}

function ReadyCard({
  record,
  creativeId,
  projectId,
  onPatch,
  onRemove,
  onNotice,
}: {
  record: RenderRecord;
  creativeId: string;
  /** Projekt-Zuordnung des Creatives. Plan (Datum/Plattform) nur sichtbar,
   *  wenn gesetzt — sonst landet der Plan in keinem Projekt-Kalender. */
  projectId: string | null;
  onPatch: (renderId: string, patch: Partial<RenderRecord>) => void;
  onRemove: (renderId: string) => void;
  onNotice: (n: { kind: "ok" | "err"; text: string } | null) => void;
}) {
  const [planState, planAction, planPending] = useActionState(
    updateRenderPlan,
    initialSchedule,
  );

  // Plan-Änderungen optimistisch hochreichen (Status-Wechsel laufen über
  // WorkflowButton, der direkt + optimistisch patcht).
  const onPatchRef = useRef(onPatch);
  useEffect(() => {
    onPatchRef.current = onPatch;
  });
  useEffect(() => {
    if (planState.ok && planState.renderId === record.id) {
      onPatchRef.current(record.id, {
        scheduledAt: planState.scheduledAt ?? null,
        targetPlatform: planState.targetPlatform ?? null,
        ...(planState.postStatus ? { postStatus: planState.postStatus } : {}),
      });
    }
  }, [
    planState.ok,
    planState.renderId,
    planState.scheduledAt,
    planState.targetPlatform,
    planState.postStatus,
    record.id,
  ]);

  const currentStatus: PostStatus = record.postStatus ?? "approved";
  const tpl = TEMPLATE_META[record.templateKind];
  const isVideo = tpl?.outputExt === "mp4";
  const aspectClass =
    tpl?.aspectRatio === "9:16"
      ? "aspect-[9/16]"
      : tpl?.aspectRatio === "16:9"
        ? "aspect-[16/9]"
        : tpl?.aspectRatio === "4:5"
          ? "aspect-[4/5]"
          : "aspect-square";

  let scheduledDefault = "";
  if (record.scheduledAt) {
    const d = new Date(record.scheduledAt);
    const pad = (n: number) => String(n).padStart(2, "0");
    scheduledDefault = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-line)] bg-white">
      <div className="grid grid-cols-[120px_1fr]">
        <div
          className={
            "overflow-hidden border-r border-[var(--color-line)] " + aspectClass
          }
        >
          {record.outputUrl ? (
            isVideo ? (
              <video src={record.outputUrl} muted className="h-full w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={record.outputUrl} alt="" className="h-full w-full object-cover" />
            )
          ) : null}
        </div>
        <div className="p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[13px] font-semibold text-[var(--foreground)]">
              {tpl?.label ?? record.templateKind}
            </p>
            <PostStatusBadge status={record.postStatus ?? "approved"} />
          </div>

          {projectId ? (
            <form action={planAction} className="mt-2 space-y-2">
              <input type="hidden" name="renderId" value={record.id} />
              <input type="hidden" name="creativeId" value={creativeId} />
              <input
                type="hidden"
                name="notes"
                value={record.notes ?? ""}
              />
              <div className="grid grid-cols-2 gap-1.5">
                <label className="block">
                  <span className="block text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
                    Datum
                  </span>
                  <input
                    type="datetime-local"
                    name="scheduledAt"
                    defaultValue={scheduledDefault}
                    className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] px-1.5 py-1 text-[11px] focus:border-[var(--foreground)] focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="block text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
                    Plattform
                  </span>
                  <select
                    name="targetPlatform"
                    defaultValue={record.targetPlatform ?? ""}
                    className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] px-1.5 py-1 text-[11px] focus:border-[var(--foreground)] focus:outline-none"
                  >
                    <option value="">—</option>
                    {TARGET_PLATFORMS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="submit"
                disabled={planPending}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--foreground)] hover:bg-[var(--color-surface)] disabled:opacity-50"
              >
                <Icon name="calendar" className="size-3" />
                {planPending ? "Speichere…" : "Plan speichern"}
              </button>
              {planState.ok && planState.renderId === record.id && (
                <span className="ml-1 text-[10px] text-[var(--color-muted)]">✓</span>
              )}
            </form>
          ) : (
            // Ohne Projekt-Zuordnung gibt es keinen Kalender, in dem der Plan
            // erscheinen könnte → Plan ausblenden und stattdessen erklären.
            <div className="mt-2 rounded-md border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-2 text-[11px] leading-snug text-[var(--color-muted)]">
              Plan (Datum + Plattform) erscheint, sobald dieses Creative oben
              einem Projekt zugeordnet ist.
            </div>
          )}

          <div className="mt-2 flex flex-wrap gap-1 border-t border-[var(--color-line)] pt-2">
            <WorkflowButton
              renderId={record.id}
              newStatus="live"
              currentStatus={currentStatus}
              label="Live setzen"
              primary
              onPatch={onPatch}
              onNotice={onNotice}
              successText="Auf „Live“ gesetzt."
            />
            <WorkflowButton
              renderId={record.id}
              newStatus="paused"
              currentStatus={currentStatus}
              label="Pausieren"
              onPatch={onPatch}
              onNotice={onNotice}
              successText="Pausiert."
            />
            <WorkflowButton
              renderId={record.id}
              newStatus="draft"
              currentStatus={currentStatus}
              label="Zurück zu Draft"
              onPatch={onPatch}
              onNotice={onNotice}
              successText="Zurück in „Drafts“ verschoben."
            />
            {record.outputUrl && (
              <a
                href={`/api/download?url=${encodeURIComponent(
                  record.outputUrl,
                )}&name=${encodeURIComponent(
                  `${record.templateKind}_v${record.variantIndex + 1}.${tpl?.outputExt ?? "jpg"}`,
                )}`}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--foreground)] hover:bg-[var(--color-surface)]"
              >
                <Icon name="download" className="size-3" />
                Download
              </a>
            )}
            <span className="ml-auto">
              <DeleteRenderButton
                renderId={record.id}
                creativeId={creativeId}
                onRemove={onRemove}
                label="Löschen"
              />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// WorkflowButton — Status-Wechsel (Approve, Live setzen, Pausieren, …).
//
// WICHTIG (das war der „Approve tut nichts"-Bug): Früher hing der sichtbare
// Effekt davon ab, dass der Server `{ ok: true }` zurückgab UND ein useEffect
// danach optimistisch patchte. Schlug der Server-Call still fehl, passierte
// GAR NICHTS — keine Bewegung, keine Fehlermeldung.
//
// Jetzt:
//   1. Sofort optimistisch patchen → Karte wandert unmittelbar in den Ziel-Tab.
//   2. Server-Action DIREKT aufrufen (kein verstecktes <form>), Ergebnis prüfen.
//   3. Erfolg → grüne Notiz. Fehler → Patch zurückrollen + roter Klartext-Fehler.
// Die Notiz lebt im Parent, bleibt also sichtbar, auch wenn die Karte den Tab
// wechselt und damit unmountet.
function WorkflowButton({
  renderId,
  newStatus,
  currentStatus,
  label,
  primary = false,
  onPatch,
  onNotice,
  successText,
}: {
  renderId: string;
  newStatus: PostStatus;
  currentStatus: PostStatus;
  label: string;
  primary?: boolean;
  onPatch: (renderId: string, patch: Partial<RenderRecord>) => void;
  onNotice: (n: { kind: "ok" | "err"; text: string } | null) => void;
  successText?: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending || newStatus === currentStatus}
      onClick={() => {
        onNotice(null);
        // 1) Optimistisch — Karte bewegt sich sofort.
        onPatch(renderId, { postStatus: newStatus });
        const fd = new FormData();
        fd.set("renderId", renderId);
        fd.set("postStatus", newStatus);
        // 2) Server bestätigen lassen.
        startTransition(async () => {
          try {
            const res = await updateRenderStatus({ ok: false }, fd);
            if (res.ok) {
              onNotice({ kind: "ok", text: successText ?? "Gespeichert." });
            } else {
              // 3a) Fehler → zurückrollen + Klartext zeigen.
              onPatch(renderId, { postStatus: currentStatus });
              onNotice({
                kind: "err",
                text:
                  (res.error ?? "Status-Änderung fehlgeschlagen.") +
                  " (Status wurde zurückgesetzt.)",
              });
            }
          } catch (err) {
            onPatch(renderId, { postStatus: currentStatus });
            onNotice({
              kind: "err",
              text:
                "Status-Änderung fehlgeschlagen: " +
                (err instanceof Error ? err.message : String(err)) +
                " (Status wurde zurückgesetzt.)",
            });
          }
        });
      }}
      className={
        "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 " +
        (primary
          ? "bg-[var(--foreground)] text-white hover:opacity-90"
          : "border border-[var(--color-line)] bg-white text-[var(--foreground)] hover:bg-[var(--color-surface)]")
      }
    >
      {pending ? "…" : label}
    </button>
  );
}

function PostStatusBadge({ status }: { status: PostStatus }) {
  const meta = POST_STATUSES.find((s) => s.value === status);
  return (
    <span className="shrink-0 rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--foreground)]">
      {meta?.label ?? status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// RenderSlot — 1 Slot mit Format-Dropdown + Mockup-Preview + Render-Action.
// Format-Dropdown lässt User aus allen TEMPLATE_KINDs wählen, Vorschau passt
// sich live ans Aspect-Ratio an.
// ---------------------------------------------------------------------------
function RenderSlot({
  slotIndex,
  creativeId,
  variantIndex,
  templateKind,
  onKindChange,
  templateLabel,
  templateDescription,
  platformHint,
  outputExt,
  aspectRatio,
  record,
  disabled,
  pool,
  previewImageUrl,
  headline,
  subline,
  cta,
  onLiveRender,
  onRemove,
}: {
  slotIndex: number;
  creativeId: string;
  variantIndex: number;
  templateKind: TemplateKind;
  onKindChange: (k: TemplateKind) => void;
  templateLabel: string;
  templateDescription: string;
  platformHint: string;
  outputExt: "jpg" | "png" | "mp4";
  aspectRatio: string;
  record: RenderRecord | null;
  disabled: boolean;
  pool: TemplateOption[];
  previewImageUrl: string | null;
  headline: string;
  subline: string;
  cta: string;
  onLiveRender: (rec: RenderRecord) => void;
  onRemove: (renderId: string) => void;
}) {
  // EIGENE Action-State pro Slot — sonst sehen alle 3 Slots dieselbe
  // state.renderId / state.error.
  const [state, formAction] = useActionState(startRender, initial);

  const firstAvailable = pool.find((p) => p.available)?.slot ?? pool[0]?.slot ?? "";
  const defaultSlot = record?.templateSlot ?? firstAvailable;
  const [selectedSlot, setSelectedSlot] = useState<string>(defaultSlot);
  const activeSlot = pool.some((p) => p.slot === selectedSlot) ? selectedSlot : firstAvailable;
  const activeOption = pool.find((p) => p.slot === activeSlot);
  const activeAvailable = activeOption?.available ?? false;

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

  // EFFEKTIVES Record: bevorzugt das Server-`record` (real DB-Row).
  // Wenn der Server noch nichts liefert (häufig direkt nach dem Klick,
  // weil router.refresh in dev-Mode mit Turbopack hängt), nutzen wir
  // SYNTHETISCHES Record aus `state.renderId` — so kann der Slot SOFORT
  // „Rendert…" anzeigen und das Polling kann sofort starten.
  const effectiveRecord: RenderRecord | null = useMemo(() => {
    if (record) return record;
    if (state.ok && state.renderId) {
      return {
        id: state.renderId,
        variantIndex,
        templateKind,
        templateSlot: activeSlot,
        status: "processing",
        outputUrl: null,
        errorMessage: null,
      };
    }
    return null;
  }, [record, state.ok, state.renderId, variantIndex, templateKind, activeSlot]);

  const liveStatus: RenderRecord["status"] | null =
    override && override.forId === effectiveRecord?.id
      ? override.status
      : (effectiveRecord?.status ?? null);
  const liveUrl: string | null =
    override && override.forId === effectiveRecord?.id
      ? override.outputUrl
      : (effectiveRecord?.outputUrl ?? null);
  const liveErr: string | null =
    override && override.forId === effectiveRecord?.id
      ? override.errorMessage
      : (effectiveRecord?.errorMessage ?? null);

  // Latest-Ref-Pattern: damit der useEffect SEINE Dep-Array-Größe NIE ändert
  // (nur 1 Element: effectiveRecord?.id), die Polling-Logik aber trotzdem
  // immer den aktuellen Status liest.
  const recordRef = useRef(effectiveRecord);
  useEffect(() => {
    recordRef.current = effectiveRecord;
  });

  // onLiveRender via Ref — sonst müsste es in die Dep-Array des Poll-Effekts,
  // was dessen Größe/Identität ändert. Wir wollen den Effekt aber NUR an
  // recordIdForDep hängen.
  const onLiveRenderRef = useRef(onLiveRender);
  useEffect(() => {
    onLiveRenderRef.current = onLiveRender;
  });

  const recordIdForDep = effectiveRecord?.id ?? null;
  useEffect(() => {
    const id = recordRef.current?.id;
    const status = recordRef.current?.status;
    if (!id) return;
    if (status !== "processing" && status !== "pending") return;
    if (pollingRef.current === id) return;
    pollingRef.current = id;

    const renderId = id;
    const started = Date.now();
    const maxMs = 3 * 60 * 1000;
    console.log(`[slot poll] start renderId=${renderId.slice(0, 8)}`);

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (pollingRef.current !== renderId) return;
      const result = await pollRender(renderId);
      console.log(
        `[slot poll] tick result: status=${result.status} url=${result.outputUrl ? "✓" : "(none)"}`,
      );
      if (cancelled) return;
      if (result.status === "succeeded") {
        setOverride({
          forId: renderId,
          status: "succeeded",
          outputUrl: result.outputUrl ?? null,
          errorMessage: null,
        });
        // Fertig gerendertes Record an den Parent hochreichen, damit der
        // Drafts-Tab es kennt (sobald der User „In Drafts speichern" klickt),
        // ohne auf einen Server-Refresh zu warten.
        const base = recordRef.current;
        if (base) {
          onLiveRenderRef.current?.({
            ...base,
            status: "succeeded",
            outputUrl: result.outputUrl ?? null,
            errorMessage: null,
            postStatus: base.postStatus ?? "draft",
          });
        }
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
    const initialTimer = setTimeout(tick, 1500);
    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      if (pollingRef.current === renderId) pollingRef.current = null;
    };
  }, [recordIdForDep]);

  const isRunning = liveStatus === "processing" || liveStatus === "pending";
  const isDone = liveStatus === "succeeded" && liveUrl;
  const isFailed = liveStatus === "failed";
  const isVideo = outputExt === "mp4";

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-line)] bg-white">
      {/* Slot-Header mit Format-Dropdown */}
      <div className="border-b border-[var(--color-line)] px-3 pt-3 pb-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
            Slot {slotIndex}
          </span>
          <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-muted)]">
            {aspectRatio} · .{outputExt}
          </span>
        </div>
        <select
          value={templateKind}
          onChange={(e) => onKindChange(e.target.value as TemplateKind)}
          disabled={!!isDone || isRunning}
          className="mt-1 block w-full rounded-md border border-[var(--color-line)] bg-white px-2 py-1 text-[12px] font-medium text-[var(--foreground)] focus:border-[var(--foreground)] focus:outline-none disabled:opacity-60"
        >
          {TEMPLATE_ORDER.map((k) => {
            const meta = TEMPLATE_META[k];
            if (!meta) return null;
            return (
              <option key={k} value={k}>
                {meta.label}
              </option>
            );
          })}
        </select>
      </div>

      <div className="mt-2 px-3">
        <div className={"relative overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] " + aspectClass}>
          {isDone && liveUrl ? (
            isVideo ? (
              <video src={liveUrl} controls playsInline className="h-full w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={liveUrl} alt={`${templateLabel} Render`} className="h-full w-full object-cover" />
            )
          ) : (
            <MockupPreview
              backgroundUrl={previewImageUrl}
              headline={headline}
              subline={subline}
              cta={cta}
              isVideo={isVideo}
              isRunning={isRunning}
            />
          )}
        </div>
        <p className="mt-1.5 text-[10px] text-[var(--color-muted)]">{templateDescription}</p>
        <p className="mt-0.5 text-[10px] font-medium text-[var(--foreground)]">{platformHint}</p>
      </div>

      <div className="p-3">
        {isFailed && (
          <p className="mb-2 rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
            {liveErr ?? "Fehlgeschlagen."}
          </p>
        )}
        {/* Action-Error pro Slot (z.B. „Env-Var fehlt", „Variante hat kein Bild") */}
        {state.error && (
          <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] leading-tight text-amber-900">
            {state.error}
          </p>
        )}

        {isDone && liveUrl ? (
          <div className="space-y-2">
            {/* Fertige Renders landen automatisch im Drafts-Tab und bleiben dort
                gespeichert (DB-Row), bis sie gelöscht werden. */}
            <div className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--foreground)]">
              <Icon name="check" className="size-3" />
              In Drafts gespeichert
            </div>
            <div className="flex flex-wrap gap-1.5">
              <a
                href={`/api/download?url=${encodeURIComponent(liveUrl)}&name=${encodeURIComponent(
                  `${templateKind}_v${variantIndex + 1}.${outputExt}`,
                )}`}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--foreground)] hover:bg-[var(--color-surface)]"
              >
                <Icon name="download" className="size-3" />
                Download
              </a>
              {effectiveRecord?.id && (
                <DeleteRenderButton
                  renderId={effectiveRecord.id}
                  creativeId={creativeId}
                  onRemove={onRemove}
                  label="Entfernen"
                />
              )}
            </div>
          </div>
        ) : isRunning ? (
          <p className="text-[11px] text-[var(--color-muted)]">Rendert… <span className="animate-pulse">●</span></p>
        ) : (
          <form action={formAction} className="space-y-2">
            <input type="hidden" name="creativeId" value={creativeId} />
            <input type="hidden" name="variantIndex" value={variantIndex} />
            <input type="hidden" name="templateKind" value={templateKind} />
            <input type="hidden" name="templateSlot" value={activeSlot} />
            {pool.length >= 1 && (
              <select
                value={activeSlot}
                onChange={(e) => setSelectedSlot(e.target.value)}
                disabled={disabled}
                className="block w-full rounded-md border border-[var(--color-line)] bg-white px-2 py-1 text-[11px] focus:border-[var(--foreground)] focus:outline-none disabled:opacity-50"
              >
                {pool.map((opt) => (
                  <option key={opt.slot} value={opt.slot} disabled={!opt.available}>
                    {opt.available ? opt.label : `${opt.label} (Env fehlt)`}
                  </option>
                ))}
              </select>
            )}
            {!activeAvailable && activeOption && (
              <p
                className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] leading-tight text-amber-900"
                title="Env-Var nicht gesetzt oder Dev-Server nicht neu gestartet"
              >
                <strong>Env fehlt:</strong>{" "}
                <code className="font-mono">{activeOption.envVar}</code>
                <br />
                Setze die Env-Var in <code>.env.local</code> und{" "}
                <strong>starte den Dev-Server neu</strong>.
              </p>
            )}
            <button
              type="submit"
              disabled={disabled || !activeAvailable}
              title={
                !activeAvailable && activeOption
                  ? `Env-Var ${activeOption.envVar} nicht gesetzt — Dev-Server neustarten`
                  : disabled
                    ? "Erst Bild für diese Variante generieren"
                    : "Render starten"
              }
              className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-[var(--color-line)] bg-white px-3 py-1.5 text-[11px] font-medium text-[var(--foreground)] hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isFailed ? "Erneut rendern" : !activeAvailable ? "Nicht konfiguriert" : "Einzeln rendern"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function MockupPreview({
  backgroundUrl,
  headline,
  cta,
  isVideo,
  isRunning,
}: {
  backgroundUrl: string | null;
  headline: string;
  subline: string;
  cta: string;
  isVideo: boolean;
  isRunning: boolean;
}) {
  if (isRunning) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[10px] text-[var(--color-muted)]">
        Rendert…
      </div>
    );
  }
  if (!backgroundUrl) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[var(--color-muted)]">
        <Icon name="image" className="size-5" />
        <span className="text-[10px]">kein Bild</span>
      </div>
    );
  }
  return (
    <div className="relative h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={backgroundUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />
      {headline && (
        <div className="absolute left-0 right-0 top-0 px-2 pt-2">
          <p
            className="text-center text-[10px] font-bold leading-tight text-white"
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
          >
            {headline.slice(0, 60)}
          </p>
        </div>
      )}
      {cta && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
          <span className="inline-block rounded-full bg-white px-2 py-0.5 text-[9px] font-semibold text-[var(--foreground)]">
            {cta.slice(0, 18)}
          </span>
        </div>
      )}
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-[var(--foreground)] shadow">
            <Icon name="play" className="size-3.5" fill="currentColor" />
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeleteRenderButton — löscht die creative_renders-Row endgültig.
// Optimistisch: ruft sofort onRemove(renderId) auf, damit die Karte aus der
// Ansicht verschwindet, ohne auf einen (im Turbopack-dev unzuverlässigen)
// Server-Refresh zu warten.
// ---------------------------------------------------------------------------
function DeleteRenderButton({
  renderId,
  creativeId,
  onRemove,
  label = "Löschen",
}: {
  renderId: string;
  creativeId: string;
  onRemove?: (renderId: string) => void;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        onRemove?.(renderId); // optimistisch sofort ausblenden
        const fd = new FormData();
        fd.set("renderId", renderId);
        fd.set("creativeId", creativeId);
        startTransition(() => {
          void deleteRender(fd);
        });
      }}
      className="rounded-full border border-[var(--color-line)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--color-muted)] hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
    >
      {pending ? "Löscht…" : label}
    </button>
  );
}
