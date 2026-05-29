"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { IMAGE_STYLES } from "../../generate/schema";
import { generateStandaloneImages } from "./actions";

export function StandaloneImageForm() {
  const [state, action] = useActionState(generateStandaloneImages, {
    ok: false,
  });

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-blue-900/5">
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wider text-blue-900">
          Prompt (Englisch empfohlen)
        </span>
        <textarea
          name="prompt"
          required
          rows={4}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="A vibrant studio photo of a yellow lubricant canister on a wooden workshop bench, dramatic side lighting"
        />
      </label>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-900">
            Format
          </span>
          <select
            name="format"
            defaultValue="1:1"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="1:1">1:1 (quadratisch)</option>
            <option value="9:16">9:16 (Reel/Story)</option>
            <option value="4:5">4:5 (Feed)</option>
            <option value="16:9">16:9 (YouTube)</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-900">
            Anzahl
          </span>
          <select
            name="count"
            defaultValue="1"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-900">
            Stil
          </span>
          <select
            name="style"
            defaultValue="auto"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {IMAGE_STYLES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <SubmitButton />

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      {state.ok && state.urls && state.urls.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-green-700">
            ✓ {state.urls.length} Bild{state.urls.length === 1 ? "" : "er"} generiert — in der Galerie ansehen:
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {state.urls.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={u}
                alt={`Generated ${i + 1}`}
                className="aspect-square w-full rounded-lg object-cover shadow-md"
              />
            ))}
          </div>
          <Link
            href="/dashboard/gallery"
            className="mt-3 inline-block rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            → Zur Galerie
          </Link>
        </div>
      )}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-md hover:bg-blue-800 disabled:opacity-50"
    >
      {pending ? "⏳ Generiere…" : "✨ Bilder generieren"}
    </button>
  );
}
