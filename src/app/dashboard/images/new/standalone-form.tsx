"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Icon } from "@/components/icon";
import { IMAGE_STYLES, PERSONAS } from "../../generate/schema";
import { generateStandaloneImages } from "./actions";

export function StandaloneImageForm() {
  const [state, action] = useActionState(generateStandaloneImages, {
    ok: false,
  });

  const [persona, setPersona] = useState<string>("");
  const [useProductImage, setUseProductImage] = useState(false);
  const [productImageUrl, setProductImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload-preview", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setUploadError(json.error ?? `Upload-Fehler (${res.status})`);
        setProductImageUrl("");
      } else {
        setProductImageUrl(json.url);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Netzwerk-Fehler.");
      setProductImageUrl("");
    } finally {
      setUploading(false);
    }
  };

  return (
    <form
      action={action}
      className="space-y-5 rounded-xl border border-[var(--color-line)] bg-white p-5"
    >
      {/* Prompt */}
      <label className="block">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
          Prompt (Englisch empfohlen)
        </span>
        <textarea
          name="prompt"
          required
          rows={4}
          className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[13px] focus:border-[var(--foreground)] focus:outline-none"
          placeholder="A workshop scene with a yellow lubricant canister on a wooden bench, natural light coming through a side window"
        />
      </label>

      {/* Persona */}
      <label className="block">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
          Persona (optional — Hände im Bild)
        </span>
        <select
          name="persona"
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[13px] focus:border-[var(--foreground)] focus:outline-none"
        >
          <option value="">— Keine Persona —</option>
          {PERSONAS.filter((p) => p.value !== "custom").map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        {persona && (
          <p className="mt-1 text-[11px] text-[var(--color-muted)]">
            Echte Hände dieser Person werden im Bild eingeblendet
            (+44 % CTR-Lift laut Motion 2024).
          </p>
        )}
      </label>

      {/* Gebinde + Drehort */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
            Gebinde (Maßstab im Bild)
          </span>
          <input
            type="text"
            name="gebinde"
            placeholder="z.B. 1000L IBC · 60L Fass · 5L Kanister"
            className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[13px] focus:border-[var(--foreground)] focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
            Drehort / Szenerie
          </span>
          <input
            type="text"
            name="scene"
            placeholder="z.B. Werkstatt · Bauernhof · Garage · Straße"
            className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[13px] focus:border-[var(--foreground)] focus:outline-none"
          />
        </label>
      </div>

      {/* Produktbild einweben */}
      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={useProductImage}
            onChange={(e) => {
              setUseProductImage(e.target.checked);
              if (!e.target.checked) {
                setProductImageUrl("");
                setUploadError(null);
              }
            }}
            className="mt-0.5 h-4 w-4 rounded border-[var(--color-line)] text-[var(--foreground)] focus:ring-1 focus:ring-[var(--foreground)]"
          />
          <span>
            <span className="block text-[13px] font-medium text-[var(--foreground)]">
              Produktbild einweben (Identity-Lock)
            </span>
            <span className="block text-[11px] text-[var(--color-muted)]">
              Nano Banana Multi-Image-Edit: dein Produkt wird nativ in die Szene
              komponiert, Label/Logo/Farben bleiben 1:1.
            </span>
          </span>
        </label>

        {useProductImage && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--foreground)] hover:bg-[var(--color-surface)]">
                <Icon name="upload" className="size-3.5" />
                {uploading ? "Lädt…" : "Datei wählen"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={async (e) => {
                    const input = e.currentTarget;
                    const f = input.files?.[0];
                    if (f) await handleUpload(f);
                    if (input) input.value = "";
                  }}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              <span className="text-[11px] text-[var(--color-muted)]">oder</span>
              <input
                type="url"
                value={productImageUrl}
                onChange={(e) => setProductImageUrl(e.target.value)}
                placeholder="https://…"
                className="flex-1 rounded-lg border border-[var(--color-line)] bg-white px-3 py-1.5 text-[12px] focus:border-[var(--foreground)] focus:outline-none"
              />
            </div>
            <input
              type="hidden"
              name="productImageUrl"
              value={productImageUrl}
            />
            {productImageUrl && (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={productImageUrl}
                  alt="Produktbild"
                  className="h-14 w-14 rounded-md border border-[var(--color-line)] object-cover"
                  onError={() => setProductImageUrl("")}
                />
                <span className="text-[11px] text-[var(--color-muted)]">
                  Wird in jede generierte Szene nativ eingewoben.
                </span>
              </div>
            )}
            {uploadError && (
              <p className="rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                {uploadError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Format · Anzahl · Stil */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
            Format
          </span>
          <select
            name="format"
            defaultValue="1:1"
            className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[13px] focus:border-[var(--foreground)] focus:outline-none"
          >
            <option value="1:1">1:1 (quadratisch)</option>
            <option value="9:16">9:16 (Reel / Story)</option>
            <option value="4:5">4:5 (Feed)</option>
            <option value="16:9">16:9 (YouTube)</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
            Anzahl
          </span>
          <select
            name="count"
            defaultValue="1"
            className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[13px] focus:border-[var(--foreground)] focus:outline-none"
          >
            <option value="1">1 Bild</option>
            <option value="2">2 Bilder</option>
            <option value="3">3 Bilder</option>
            <option value="4">4 Bilder</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
            Stil
          </span>
          <select
            name="style"
            defaultValue="ugc_phone"
            className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[13px] focus:border-[var(--foreground)] focus:outline-none"
          >
            {IMAGE_STYLES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label.replace(/^[^\w\s]+\s*/, "")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <SubmitButton uploading={uploading} />

      {state.error && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
          {state.error}
        </p>
      )}

      {state.ok && state.urls && state.urls.length > 0 && (
        <div>
          <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface)] px-2.5 py-0.5 text-[12px] font-medium text-[var(--foreground)]">
            <Icon name="check" className="size-3" />
            {state.urls.length} Bild
            {state.urls.length === 1 ? "" : "er"} generiert
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {state.urls.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={u}
                alt={`Generated ${i + 1}`}
                className="aspect-square w-full rounded-lg border border-[var(--color-line)] object-cover"
              />
            ))}
          </div>
          <Link
            href="/dashboard/gallery"
            className="mt-3 inline-flex items-center gap-1 rounded-full bg-[var(--foreground)] px-4 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
          >
            Zur Galerie
            <Icon name="chevron-right" className="size-3" />
          </Link>
        </div>
      )}
    </form>
  );
}

function SubmitButton({ uploading }: { uploading: boolean }) {
  const { pending } = useFormStatus();
  const disabled = pending || uploading;
  return (
    <button
      type="submit"
      disabled={disabled}
      className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[var(--foreground)] px-4 py-2.5 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50"
    >
      {pending ? (
        "Generiere…"
      ) : (
        <>
          <Icon name="sparkle" className="size-4" />
          Bilder generieren
        </>
      )}
    </button>
  );
}
