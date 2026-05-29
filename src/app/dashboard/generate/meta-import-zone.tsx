"use client";

import { useEffect, useState } from "react";

type ImportKind = "posts" | "ads_performance" | "audience" | "products";

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

  return (
    <details className="rounded-2xl border border-purple-200 bg-purple-50/40 open:bg-white">
      <summary className="cursor-pointer select-none rounded-2xl px-4 py-3 text-sm font-semibold text-purple-900 hover:bg-purple-100/50">
        📥 Meta-Daten importieren
        <span className="ml-2 text-xs font-normal text-purple-700/70">
          {imports.length > 0
            ? `${imports.length} aktiv · fließt in jeden Generate-Run`
            : "optional — wirkt direkt auf Output-Qualität"}
        </span>
      </summary>

      <div className="space-y-3 border-t border-purple-200 p-4">
        {/* Upload */}
        <div>
          <label className="block text-xs font-medium text-slate-700">
            CSV / TSV hochladen
          </label>
          <div className="mt-1 flex gap-2">
            <select
              value={forceKind}
              onChange={(e) => setForceKind(e.target.value as ImportKind | "")}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-purple-700 focus:outline-none"
            >
              <option value="">🪄 Typ auto-erkennen</option>
              <option value="posts">📝 Posts-Export</option>
              <option value="ads_performance">📊 Ads Performance</option>
              <option value="audience">👥 Audience Insights</option>
              <option value="products">📦 Produktkatalog</option>
            </select>
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="flex flex-1 cursor-pointer items-center justify-center rounded-md border border-dashed border-purple-300 bg-white px-3 py-2 text-xs text-purple-700 hover:bg-purple-50"
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
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            ✓ <strong>{KIND_META[lastSummary.kind].label}</strong> importiert ·{" "}
            {lastSummary.rowCount} Rows
            {lastSummary.autoDetected
              ? ` · auto-erkannt (${lastSummary.confidence}%)`
              : " · manuell"}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <p className="font-semibold">{error}</p>
            {detectedHeaders && detectedHeaders.length > 0 && (
              <>
                <p className="mt-1.5 text-red-900">
                  ↑ Wähle oben im Dropdown den CSV-Typ manuell aus —
                  dann läuft der Import durch.
                </p>
                <details className="mt-1">
                  <summary className="cursor-pointer text-[10px] text-red-700/80">
                    Erkannte Spalten in deiner CSV ({detectedHeaders.length})
                  </summary>
                  <p className="mt-1 break-words text-[10px] text-red-900/80">
                    {detectedHeaders.join(" · ")}
                  </p>
                </details>
              </>
            )}
          </div>
        )}

        {/* Aktive Imports */}
        {imports.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Aktive Imports (wirken auf den nächsten Generate-Run)
            </p>
            <div className="mt-1 space-y-1.5">
              {imports.slice(0, 4).map((imp) => (
                <ImportCard key={imp.id} record={imp} />
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

function ImportCard({ record }: { record: ImportRecord }) {
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
  return null;
}
