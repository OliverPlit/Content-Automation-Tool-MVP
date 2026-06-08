import Link from "next/link";

import { Icon } from "@/components/icon";

/**
 * Project-Studio Empty-State — wird gerendert, wenn kein Creative gewählt ist
 * (rechte Spalte). Die Liste links liefert das Layout.
 */
export default function ProjectStudioEmpty() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-[var(--color-muted)]">
        <Icon name="rectangle-stack" className="size-8" strokeWidth={1.4} />
      </div>
      <h2 className="mt-5 text-[18px] font-semibold tracking-tight text-[var(--foreground)]">
        Wähle ein Creative
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-muted)]">
        Klick links auf ein Creative dieses Projekts, um es zu bearbeiten, zu
        rendern oder zum Posten freizugeben.
      </p>
      <Link
        href="/dashboard/generate"
        className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-[var(--foreground)] px-4 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
      >
        <Icon name="plus" className="size-3.5" />
        Neues Creative erstellen
      </Link>
    </div>
  );
}
