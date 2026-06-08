"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/icon";

const tabs: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard/settings/templates", label: "Templates", icon: "tag" },
  { href: "/dashboard/settings/account", label: "Konto", icon: "settings" },
];

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 border-b border-[var(--color-line)]">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors " +
              (active
                ? "border-[var(--foreground)] text-[var(--foreground)]"
                : "border-transparent text-[var(--color-muted)] hover:text-[var(--foreground)]")
            }
          >
            <Icon name={tab.icon} className="size-[15px]" strokeWidth={1.6} />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
