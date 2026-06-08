"use client";

import { useState } from "react";

type ScrapedProduct = {
  name: string;
  keyMessage: string;
  audience: string;
  productHint: string;
  imageUrls: string[];
};

export function ScrapeProductForm({
  onApply,
}: {
  onApply: (data: ScrapedProduct) => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScrapedProduct | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/scrape-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Fehler beim Scrapen.");
      } else {
        setResult(json.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Netzwerk-Fehler.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900">
        🔗 Aus Produkt-URL laden (optional)
      </h3>
      <div className="mt-2 flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://wodoil.at/produkte/..."
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={run}
          disabled={busy || !url}
          className="rounded-md bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "⏳ Scraping…" : "Laden"}
        </button>
      </div>
      {error && (
        <p className="mt-2 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-700">
          {error}
        </p>
      )}
      {result && (
        <div className="mt-3 space-y-2 text-xs">
          <p>
            <strong className="text-slate-900">Name:</strong> {result.name}
          </p>
          <p>
            <strong className="text-slate-900">Key Message:</strong>{" "}
            {result.keyMessage}
          </p>
          {result.audience && (
            <p>
              <strong className="text-slate-900">Audience:</strong>{" "}
              {result.audience}
            </p>
          )}
          {result.imageUrls.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {result.imageUrls.slice(0, 6).map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={u}
                  alt={`Scraped ${i + 1}`}
                  className="h-12 w-12 rounded border border-slate-200 object-cover"
                />
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => onApply(result)}
            className="mt-1 rounded-md bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
          >
            ✓ Werte ins Form übernehmen
          </button>
        </div>
      )}
    </div>
  );
}
