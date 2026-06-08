"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Icon } from "@/components/icon";
import { deleteAllTemplates } from "../../templates/actions";

export function DeleteAllTemplates({ count }: { count: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  if (count === 0) return null;

  function run() {
    start(async () => {
      const res = await deleteAllTemplates();
      if (res.ok) {
        setMsg({
          kind: "ok",
          text: `${res.deleted ?? 0} Vorlage(n) gelöscht.`,
        });
        setConfirming(false);
        router.refresh();
      } else {
        setMsg({ kind: "err", text: res.error ?? "Löschen fehlgeschlagen." });
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!confirming ? (
        <button
          type="button"
          onClick={() => {
            setMsg(null);
            setConfirming(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--color-surface)]"
        >
          <Icon name="trash" className="size-3.5" /> Alle Vorlagen löschen
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1">
          <span className="pl-1.5 text-[12px] text-[var(--foreground)]">
            Wirklich alle {count} eigenen Vorlagen löschen?
          </span>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="rounded-full border border-[var(--color-line)] bg-white px-3 py-1 text-[12px] font-medium text-[var(--foreground)] hover:bg-white/70 disabled:opacity-60"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={run}
            disabled={pending}
            className="rounded-full bg-red-600 px-3 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-60"
          >
            {pending ? "Lösche…" : "Endgültig löschen"}
          </button>
        </div>
      )}

      {msg && (
        <span
          className={
            "text-[12px] " +
            (msg.kind === "ok" ? "text-emerald-600" : "text-red-600")
          }
        >
          {msg.text}
        </span>
      )}
    </div>
  );
}
