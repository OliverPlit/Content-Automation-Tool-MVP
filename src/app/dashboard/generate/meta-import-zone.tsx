"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/icon";

type ImportKind =
  | "posts"
  | "ads_performance"
  | "audience"
  | "products"
  | "google_ads";

type ImportRecord = {
  id: string;
  kind: ImportKind;
  filename: string | null;
  row_count: number;
  insights: Record<string, unknown>;
  created_at: string;
};

const KIND_META: Record<ImportKind, { label: string; emoji: string; hint: string }> = {
  posts: {
    label: "Posts-Export",
    emoji: "📝",
    hint: "Deine Top-Posts werden als Hook-Inspiration in den Prompt eingebaut.",
  },
  ads_performance: {
    label: "Ads Performance",
    emoji: "📊",
    hint: "CTR pro Hook speist die Lernschleife — gewinnende Hooks rücken nach vorn.",
  },
  audience: {
    label: "Audience Insights",
    emoji: "👥",
    hint: "Demografische Daten fließen als Zielgruppen-Hint in den Prompt.",
  },
  products: {
    label: "Produktkatalog",
    emoji: "📦",
    hint: "Für Bulk-Generate: 1 Row → 1 Creative parallel.",
  },
  google_ads: {
    label: "Google Ads",
    emoji: "🔎",
    hint: "Such-Anzeigen-Performance (RSA): Konto-CTR + Hook-Trends fließen in die Lernschleife.",
  },
};

export function MetaImportZone({
  onProductsImport,
}: {
  onProductsImport?: (importId: string, count: number) => void;
}) {
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedHeaders, setDetectedHeaders] = useState<string[] | null>(null);
  const [forceKind, setForceKind] = useState<ImportKind | "">("");
  const [lastSummary, setLastSummary] = useState<{
    kind: ImportKind;
    rowCount: number;
    autoDetected: boolean;
    confidence: number;
    // Phase E: Match-Statistik aus dem Ads-Adapter (Meta oder Google).
    outcomeMatch?: {
      matched: number;
      unmatched?: number;
      baseline?: number;
      skipped?: number;
      total: number;
    } | null;
  } | null>(null);

  useEffect(() => {
    // Lade existierende Imports beim Mount
    fetch("/api/meta-import", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { imports?: ImportRecord[] }) => {
        if (Array.isArray(j.imports)) setImports(j.imports);
      })
      .catch(() => {
        // silent fail — UI bleibt leer
      });
  }, []);

  const handleFile = async (file: File) => {
    setError(null);
    setDetectedHeaders(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (forceKind) fd.append("kind", forceKind);
      const res = await fetch("/api/meta-import", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as {
        ok?: boolean;
        id?: string;
        kind?: ImportKind;
        rowCount?: number;
        insights?: Record<string, unknown>;
        detection?: { autoDetected: boolean; confidence: number };
        outcomeMatch?: {
          matched: number;
          unmatched?: number;
          baseline?: number;
          skipped?: number;
          total: number;
        } | null;
        headers?: string[];
        scores?: Record<string, number>;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.kind) {
        setError(json.error ?? `Fehler ${res.status}`);
        // Falls Server uns die Headers schickte → für UI festhalten
        if (json.headers) setDetectedHeaders(json.headers);
        return;
      }
      const newRecord: ImportRecord = {
        id: json.id!,
        kind: json.kind,
        filename: file.name,
        row_count: json.rowCount ?? 0,
        insights: json.insights ?? {},
        created_at: new Date().toISOString(),
      };
      setImports((prev) => [newRecord, ...prev.filter((p) => p.kind !== json.kind)]);
      setLastSummary({
        kind: json.kind,
        rowCount: json.rowCount ?? 0,
        autoDetected: json.detection?.autoDetected ?? false,
        confidence: json.detection?.confidence ?? 0,
        outcomeMatch: json.outcomeMatch ?? null,
      });

      // Products → trigger bulk-generate callback wenn callback gesetzt
      if (json.kind === "products" && onProductsImport) {
        onProductsImport(json.id!, json.rowCount ?? 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Netzwerk-Fehler.");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) await handleFile(file);
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setError(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/meta-import?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setImports((prev) => prev.filter((p) => p.id !== id));
        setLastSummary(null);
      } else {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Löschen fehlgeschlagen (${res.status}).`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Netzwerk-Fehler.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <details className="rounded-lg border border-[var(--color-line)] bg-white">
      <summary className="cursor-pointer select-none rounded-lg px-3 py-2 text-[12px] font-medium text-[var(--foreground)] hover:bg-[var(--color-surface)]">
        Meta-Daten importieren
        <span className="ml-2 text-[11px] font-normal text-[var(--color-muted)]">
          {imports.length > 0
            ? `${imports.length} aktiv · wirkt auf jeden Generate-Run`
            : "optional"}
        </span>
      </summary>

      <div className="space-y-3 border-t border-slate-200 p-4">
        {/* Upload */}
        <div>
          <label className="block text-xs font-medium text-slate-700">
            CSV / TSV hochladen
          </label>
          <div className="mt-1 flex gap-2">
            <select
              value={forceKind}
              onChange={(e) => setForceKind(e.target.value as ImportKind | "")}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-slate-700 focus:outline-none"
            >
              <option value="">🪄 Typ auto-erkennen</option>
              <option value="posts">📝 Posts-Export</option>
              <option value="ads_performance">📊 Meta Ads Performance</option>
              <option value="google_ads">🔎 Google Ads</option>
              <option value="audience">👥 Audience Insights</option>
              <option value="products">📦 Produktkatalog</option>
            </select>
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="flex flex-1 cursor-pointer items-center justify-center rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
            >
              {uploading ? "⏳ Verarbeite…" : "📂 CSV hierherziehen oder klicken"}
              <input
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                onChange={async (e) => {
                  // Referenz früh festhalten — nach dem await ist
                  // e.currentTarget null (React-Event-Lifecycle).
                  const input = e.currentTarget;
                  const f = input.files?.[0];
                  if (f) await handleFile(f);
                  if (input) input.value = "";
                }}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Last-Upload-Summary */}
        {lastSummary && (
          <div className="space-y-1.5">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900">
              ✓ <strong>{KIND_META[lastSummary.kind].label}</strong> importiert ·{" "}
              {lastSummary.rowCount} Rows
              {lastSummary.autoDetected
                ? ` · auto-erkannt (${lastSummary.confidence}%)`
                : " · manuell"}
            </div>
            {lastSummary.outcomeMatch && <MatchBanner m={lastSummary.outcomeMatch} kind={lastSummary.kind} />}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <p className="font-semibold">{error}</p>
            {detectedHeaders && detectedHeaders.length > 0 && (
              <>
                <p className="mt-1.5 text-slate-900">
                  ↑ Wähle oben im Dropdown den CSV-Typ manuell aus —
                  dann läuft der Import durch.
                </p>
                <details className="mt-1">
                  <summary className="cursor-pointer text-[10px] text-slate-700/80">
                    Erkannte Spalten in deiner CSV ({detectedHeaders.length})
                  </summary>
                  <p className="mt-1 break-words text-[10px] text-slate-900/80">
                    {detectedHeaders.join(" · ")}
                  </p>
                </details>
              </>
            )}
          </div>
        )}

        {/* Aktive Imports — verwalten (löschen) + neue oben hochladen */}
        {imports.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Aktive Imports (wirken auf den nächsten Generate-Run)
            </p>
            <p className="mt-0.5 text-[10px] text-slate-400">
              Pro Typ zählt der neueste. Zum Aktualisieren: alten löschen und
              oben eine neue CSV hochladen.
            </p>
            <div className="mt-1 space-y-1.5">
              {imports.map((imp) => (
                <ImportCard
                  key={imp.id}
                  record={imp}
                  deleting={deletingId === imp.id}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </div>
        )}

        {/* Hilfe */}
        <details className="text-[11px] text-slate-600">
          <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
            Wo finde ich die CSVs in Meta?
          </summary>
          <ul className="mt-1 space-y-1 pl-4">
            <li>
              <strong>Posts-Export:</strong> Meta Business Suite → Inhalte →
              „Exportieren als CSV“
            </li>
            <li>
              <strong>Ads Performance:</strong> Ads Manager → Berichte → Bericht
              erstellen → CSV
            </li>
            <li>
              <strong>Audience Insights:</strong> Meta Business Suite → Insights
              → Audience → Export
            </li>
            <li>
              <strong>Produktkatalog:</strong> Commerce Manager → Katalog → „CSV
              exportieren“
            </li>
          </ul>
        </details>
      </div>
    </details>
  );
}

function ImportCard({
  record,
  deleting,
  onDelete,
}: {
  record: ImportRecord;
  deleting: boolean;
  onDelete: (id: string) => void;
}) {
  const meta = KIND_META[record.kind];
  const dateStr = new Date(record.created_at).toLocaleDateString("de-DE");

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-slate-800">
          {meta.emoji} {meta.label}
          <span className="ml-1.5 text-slate-500">
            · {record.row_count} Rows · {dateStr}
          </span>
        </span>
        <button
          type="button"
          onClick={() => onDelete(record.id)}
          disabled={deleting}
          title="Diesen Import löschen"
          aria-label="Diesen Import löschen"
          className="-mr-1 shrink-0 self-start rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-600 disabled:opacity-50"
        >
          {deleting ? (
            <span className="text-[10px]">…</span>
          ) : (
            <Icon name="trash" className="size-3.5" />
          )}
        </button>
      </div>
      <InsightsPreview record={record} />
    </div>
  );
}

function InsightsPreview({ record }: { record: ImportRecord }) {
  const ins = record.insights as Record<string, unknown>;
  if (record.kind === "posts") {
    const topHooks = (ins.topHooks as Array<{ label: string; count: number }>) ?? [];
    if (topHooks.length === 0)
      return <p className="mt-0.5 text-slate-500">Keine Hook-Pattern erkannt.</p>;
    return (
      <p className="mt-0.5 text-slate-600">
        Top-Hooks:{" "}
        {topHooks
          .slice(0, 3)
          .map((h) => `${h.label} (${h.count})`)
          .join(" · ")}
      </p>
    );
  }
  if (record.kind === "ads_performance") {
    const map = (ins.hookCtrMap as Array<{ label: string; avgCtr: number }>) ?? [];
    if (map.length === 0)
      return <p className="mt-0.5 text-slate-500">Keine CTR-Daten lesbar.</p>;
    return (
      <p className="mt-0.5 text-slate-600">
        Beste Hooks (CTR):{" "}
        {map
          .slice(0, 3)
          .map((m) => `${m.label} ${m.avgCtr}%`)
          .join(" · ")}
      </p>
    );
  }
  if (record.kind === "audience") {
    const age = (ins.topAgeRange as string) ?? "";
    const gender = (ins.topGender as string) ?? "";
    const interests = (ins.topInterests as string[]) ?? [];
    return (
      <p className="mt-0.5 text-slate-600">
        {[age, gender, interests.slice(0, 3).join(", ")].filter(Boolean).join(" · ") || "—"}
      </p>
    );
  }
  if (record.kind === "products") {
    const rows = (ins.rows as Array<{ title: string }>) ?? [];
    return (
      <p className="mt-0.5 text-slate-600">
        {rows.length} Produkte · z. B. {rows.slice(0, 3).map((r) => r.title).join(", ")}
        …
      </p>
    );
  }
  if (record.kind === "google_ads") {
    const acc = (ins.accountCtr as number) ?? 0;
    const total = (ins.totalAds as number) ?? 0;
    const map = (ins.hookCtrMap as Array<{ label: string; avgCtr: number }>) ?? [];
    const top = map
      .slice(0, 3)
      .map((m) => `${m.label} ${m.avgCtr}%`)
      .join(" · ");
    return (
      <p className="mt-0.5 text-slate-600">
        {total} Anzeigen · Konto-CTR {acc}%
        {top ? ` · Beste Hooks: ${top}` : ""}
      </p>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// MatchBanner (Phase E) — zeigt das Ergebnis des Outcome-Adapters nach dem
// Upload. Drei Fälle:
//   - matched > 0: Performance landet bei konkreten Creatives (Lernsignal!)
//   - baseline / unmatched: fließt als Konto-Baseline in die Priors
//   - 0 Matches: Klartext-Hinweis, woran es liegt
// ---------------------------------------------------------------------------
function MatchBanner({
  m,
  kind,
}: {
  m: {
    matched: number;
    unmatched?: number;
    baseline?: number;
    skipped?: number;
    total: number;
  };
  kind: ImportKind;
}) {
  const isGoogle = kind === "google_ads";
  const baselineOrUnmatched = m.baseline ?? m.unmatched ?? 0;
  const hasMatches = m.matched > 0;

  if (!hasMatches && baselineOrUnmatched === 0 && (m.skipped ?? 0) === 0) {
    return null; // nichts zu zeigen
  }

  return (
    <div
      className={
        "rounded-md border px-3 py-2 text-xs " +
        (hasMatches
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-amber-200 bg-amber-50 text-amber-900")
      }
    >
      <p className="font-medium">
        {hasMatches
          ? `🎯 ${m.matched} von ${m.total} Anzeigen zu gespeicherten Creatives zugeordnet`
          : `ℹ️ 0 Anzeigen konnten direkt zugeordnet werden`}
      </p>
      <p className="mt-0.5 leading-relaxed">
        {baselineOrUnmatched > 0 && (
          <>
            {isGoogle ? "Konto-Baseline" : "Ohne Match"}: {baselineOrUnmatched}{" "}
            {isGoogle
              ? "— fließen in konto-weite Priors ein"
              : "— Headlines passen zu keinem gespeicherten Creative"}
            {(m.skipped ?? 0) > 0 ? " · " : ""}
          </>
        )}
        {(m.skipped ?? 0) > 0 && (
          <>Übersprungen: {m.skipped} (keine Impressions)</>
        )}
      </p>
      {!hasMatches && (
        <p className="mt-1.5 leading-relaxed">
          {isGoogle ? (
            <>
              <strong>Warum?</strong> Google-Ads-Headlines passen exakt zu keiner
              deiner gespeicherten Creative-Headlines. Das ist normal, wenn du
              das Tool gerade erst nutzt. Die Performance landet trotzdem als
              Konto-Baseline und fließt in die Lernschleife.
            </>
          ) : (
            <>
              <strong>Warum?</strong> Die Ad-Headlines in dieser CSV passen zu
              keiner deiner im Tool gespeicherten Creative-Headlines. Nach dem
              Generieren musst du die Anzeigen mit exakt derselben Headline bei
              Meta ausspielen — sonst kann das Matching keinen Bezug herstellen.
            </>
          )}
        </p>
      )}
    </div>
  );
}
