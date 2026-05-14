import { NextResponse } from "next/server";

const MAX_CHARS = 3000;
const TIMEOUT_MS = 5000;

// Sehr simpler HTML → Text Stripper (kein DOM-Parser, nur Regex).
// Reicht für unseren Zweck: Marketing-Kontext für GPT, nicht für strukturiertes Parsing.
function htmlToText(html: string): string {
  return (
    html
      // Komplette Block-Bereiche, die wir nie wollen, ganz entfernen.
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      // Alle übrigen Tags entfernen.
      .replace(/<[^>]+>/g, " ")
      // HTML-Entities grob auflösen (häufigste).
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Whitespace normalisieren.
      .replace(/\s+/g, " ")
      .trim()
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { url?: string };
    const raw = String(body.url ?? "").trim();
    if (!raw) {
      return NextResponse.json(
        { error: "URL fehlt." },
        { status: 400 },
      );
    }

    // URL parsen + Protokoll prüfen
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return NextResponse.json(
        { error: "URL hat ein ungültiges Format." },
        { status: 400 },
      );
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json(
        { error: "Nur http(s)-URLs erlaubt." },
        { status: 400 },
      );
    }

    // Fetch mit Timeout
    const res = await fetch(parsed.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ContentToolBot/1.0; +https://content-tool.local)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Website-Fetch fehlgeschlagen: HTTP ${res.status}` },
        { status: 502 },
      );
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("text")) {
      return NextResponse.json(
        { error: "Inhalt ist kein HTML/Text." },
        { status: 415 },
      );
    }

    const html = await res.text();
    const text = htmlToText(html).slice(0, MAX_CHARS);

    if (!text) {
      return NextResponse.json(
        { error: "Nach dem Strippen kein lesbarer Text mehr übrig." },
        { status: 422 },
      );
    }

    return NextResponse.json({ text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler.";
    const isTimeout =
      msg.toLowerCase().includes("aborted") ||
      msg.toLowerCase().includes("timeout");
    return NextResponse.json(
      {
        error: isTimeout
          ? "Website-Fetch hat länger als 5 Sek. gebraucht — abgebrochen."
          : `Crawl-Fehler: ${msg}`,
      },
      { status: 500 },
    );
  }
}
