import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  csvToRecords,
  detectKind,
  dropTotalsRows,
  findHeaderRow,
  parseCsv,
  type MetaImportKind,
} from "@/lib/meta-import/csv";
import {
  extractAdsPerfInsights,
  extractAudienceInsights,
  extractGoogleAdsInsights,
  extractPostsInsights,
  extractProductsInsights,
  type AnyInsights,
} from "@/lib/meta-import/insights";
import { matchAdsToOutcomes } from "@/lib/meta-import/match-outcomes";
import { matchGoogleAdsToOutcomes } from "@/lib/meta-import/match-google-outcomes";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXT = ["csv", "tsv", "txt"];

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file");
    const forcedKindRaw = String(form.get("kind") ?? "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Keine Datei übergeben." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Datei zu groß (max ${MAX_BYTES / 1024 / 1024} MB).` },
        { status: 413 },
      );
    }
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return NextResponse.json(
        { error: `Dateityp nicht erlaubt: .${ext} — erwartet .csv/.tsv/.txt` },
        { status: 415 },
      );
    }

    let text = await file.text();
    // TSV → wir konvertieren Tabs zu Kommas (rudimentär — funktioniert für
    // simple Exporte ohne Tabs in Werten).
    if (ext === "tsv") text = text.replace(/\t/g, ",");

    const rawRows = parseCsv(text);
    if (rawRows.length < 2) {
      return NextResponse.json(
        { error: "CSV enthält keine Daten-Rows (mindestens Header + 1 Row nötig)." },
        { status: 400 },
      );
    }

    // Echte Header-Zeile finden (Google-Ads-Berichte haben 2 Metadaten-Zeilen
    // davor). Daten danach + Total/Gesamt-Zeilen am Ende abschneiden.
    const headerIdx = findHeaderRow(rawRows);
    const dataRows = dropTotalsRows(rawRows.slice(headerIdx + 1));
    const rows = [rawRows[headerIdx], ...dataRows];

    // Kind-Detection (mit User-Override)
    const detected = detectKind(rows[0]);
    const validKinds: MetaImportKind[] = [
      "posts",
      "ads_performance",
      "audience",
      "products",
      "google_ads",
    ];
    const forcedKind = validKinds.includes(forcedKindRaw as MetaImportKind)
      ? (forcedKindRaw as MetaImportKind)
      : null;
    const kind: MetaImportKind | null = forcedKind ?? detected.kind;
    if (!kind) {
      return NextResponse.json(
        {
          error:
            "CSV-Typ konnte nicht erkannt werden. Bitte oben Typ manuell wählen.",
          headers: rows[0],
          scores: detected.scores,
        },
        { status: 422 },
      );
    }

    const records = csvToRecords(rows);

    // Insights extrahieren je nach Kind
    let insights: AnyInsights;
    switch (kind) {
      case "posts":
        insights = { kind, data: extractPostsInsights(records) };
        break;
      case "ads_performance":
        insights = { kind, data: extractAdsPerfInsights(records) };
        break;
      case "audience":
        insights = { kind, data: extractAudienceInsights(records) };
        break;
      case "products":
        insights = { kind, data: extractProductsInsights(records) };
        break;
      case "google_ads":
        insights = { kind, data: extractGoogleAdsInsights(records) };
        break;
    }

    // DB-Insert. raw_csv kappen auf 1 MB Text damit DB-Row nicht explodiert.
    const rawClipped = text.length > 1_000_000 ? text.slice(0, 1_000_000) : text;
    const { data: row, error: insertErr } = await supabase
      .from("meta_imports")
      .insert({
        user_id: user.id,
        kind,
        filename: file.name,
        row_count: records.length,
        raw_csv: rawClipped,
        parsed_json: records.slice(0, 500), // erste 500 Rows, mehr brauchen wir nicht zum Lesen
        insights: insights.data,
      })
      .select("id, kind, row_count, insights, created_at")
      .single();

    if (insertErr || !row) {
      return NextResponse.json(
        { error: `DB-Insert: ${insertErr?.message ?? "unbekannt"}` },
        { status: 500 },
      );
    }

    // Self-Learning Phase 1: Bei Ads-Performance die Rows den gespeicherten
    // Creatives zuordnen und echte Outcomes schreiben. Soft-fail — der Import
    // selbst soll nie an der Zuordnung scheitern.
    let outcomeMatch:
      | { matched: number; unmatched?: number; baseline?: number; skipped?: number; total: number }
      | null = null;
    if (kind === "ads_performance") {
      try {
        outcomeMatch = await matchAdsToOutcomes(supabase, user.id);
      } catch {
        outcomeMatch = null;
      }
    } else if (kind === "google_ads") {
      try {
        outcomeMatch = await matchGoogleAdsToOutcomes(supabase, user.id);
      } catch {
        outcomeMatch = null;
      }
    }

    return NextResponse.json({
      ok: true,
      id: row.id,
      kind,
      rowCount: records.length,
      insights: insights.data,
      outcomeMatch,
      detection: {
        autoDetected: detected.kind === kind,
        confidence: Math.round(detected.confidence * 100),
        scores: detected.scores,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: einen Import des Users entfernen (?id=<uuid>). RLS erlaubt nur
// das Löschen eigener Zeilen.
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id fehlt." }, { status: 400 });
  }
  const { error } = await supabase
    .from("meta_imports")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// GET: letzte Imports für den User (für UI-Anzeige nach Reload)
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("meta_imports")
    .select("id, kind, filename, row_count, insights, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ imports: data ?? [] });
}
