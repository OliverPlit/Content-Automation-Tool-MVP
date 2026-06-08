import { SettingsTabs } from "./settings-tabs";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--foreground)]">
          Einstellungen
        </h1>
        <p className="mt-1 text-[13px] text-[var(--color-muted)]">
          Vorlagen verwalten und Kontodetails einsehen.
        </p>
      </header>

      <SettingsTabs />

      <div className="mt-6">{children}</div>
    </div>
  );
}
