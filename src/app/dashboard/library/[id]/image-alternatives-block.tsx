"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  regenerateImageAlternatives,
  setActiveImageAlternative,
} from "./image-alternatives-actions";

export type ImageAlt = {
  id: string;
  imageUrl: string;
  isActive: boolean;
  altIndex: number;
};

export function ImageAlternativesBlock({
  creativeId,
  variantIndex,
  alternatives,
}: {
  creativeId: string;
  variantIndex: number;
  alternatives: ImageAlt[];
}) {
  const [regenState, regenAction] = useActionState(
    regenerateImageAlternatives,
    { ok: false },
  );
  const [setState, setAction] = useActionState(setActiveImageAlternative, {
    ok: false,
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-900">
          Bild-Alternativen ({alternatives.length})
        </h4>
        <form action={regenAction} className="flex items-center gap-2">
          <input type="hidden" name="creativeId" value={creativeId} />
          <input type="hidden" name="variantIndex" value={variantIndex} />
          <select
            name="count"
            defaultValue="2"
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            <option value="1">×1</option>
            <option value="2">×2</option>
            <option value="3">×3</option>
            <option value="4">×4</option>
          </select>
          <RegenBtn />
        </form>
      </div>

      {regenState.error && (
        <p className="mb-2 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-700">
          {regenState.error}
        </p>
      )}
      {setState.error && (
        <p className="mb-2 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-700">
          {setState.error}
        </p>
      )}

      {alternatives.length === 0 ? (
        <p className="text-xs text-slate-500">
          Noch keine Alternativen. Klick &bdquo;🔄 Generieren&ldquo; um 2 weitere Looks zu
          bekommen.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 md:grid-cols-4 lg:grid-cols-5">
          {alternatives.map((alt) => (
            <form
              key={alt.id}
              action={setAction}
              className="relative overflow-hidden rounded-lg border-2 border-transparent"
              style={alt.isActive ? { borderColor: "#1d4ed8" } : undefined}
            >
              <input type="hidden" name="imageId" value={alt.id} />
              <input type="hidden" name="creativeId" value={creativeId} />
              <input type="hidden" name="variantIndex" value={variantIndex} />
              <button
                type="submit"
                disabled={alt.isActive}
                className="block w-full"
                title={alt.isActive ? "Aktiv" : "Als aktiv setzen"}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={alt.imageUrl}
                  alt={`Variant ${variantIndex + 1} Alt ${alt.altIndex}`}
                  className="aspect-square w-full object-cover"
                />
                {alt.isActive && (
                  <span className="absolute left-1 top-1 rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                    ✓ Aktiv
                  </span>
                )}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}

function RegenBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-slate-700 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
    >
      {pending ? "⏳ …" : "🔄 Generieren"}
    </button>
  );
}
