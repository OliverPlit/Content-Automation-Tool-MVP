"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Project-Studio: gleiches Look-and-Feel wie library/studio-list-item.tsx,
 * aber Link bleibt im Projekt-Scope (`/dashboard/projects/<pid>/edit/<cid>`).
 */
export function ProjectStudioItem({
  projectId,
  id,
  headline,
  subline,
  thumb,
  createdAt,
}: {
  projectId: string;
  id: string;
  headline: string;
  subline: string;
  thumb: string | null;
  createdAt: string;
}) {
  const pathname = usePathname();
  const href = `/dashboard/projects/${projectId}/edit/${id}`;
  const active = pathname === href;
  const date = new Date(createdAt).toLocaleDateString("de-DE", {
    day: "numeric",
    month: "short",
  });

  return (
    <li>
      <Link
        href={href}
        className={
          "flex items-start gap-3 border-b border-[var(--color-line)] px-4 py-2.5 transition-colors " +
          (active
            ? "bg-[var(--color-surface)]"
            : "hover:bg-[var(--color-surface)]")
        }
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            className="h-10 w-10 shrink-0 rounded border border-[var(--color-line)] object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] text-[9px] text-[var(--color-muted)]">
            —
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-[var(--foreground)]">
            {headline}
          </p>
          {subline && (
            <p className="truncate text-[11px] text-[var(--color-muted)]">
              {subline}
            </p>
          )}
          <p className="mt-0.5 text-[10px] tabular-nums text-[var(--color-muted)]">
            {date}
          </p>
        </div>
      </Link>
    </li>
  );
}
