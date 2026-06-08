import { createClient } from "@/lib/supabase/server";

export default async function SettingsAccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
      <p className="text-[13px] font-medium text-[var(--foreground)]">Konto</p>

      <dl className="mt-4 space-y-3">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            E-Mail
          </dt>
          <dd className="mt-0.5 text-[14px] text-[var(--foreground)]">
            {user?.email ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Konto-ID
          </dt>
          <dd className="mt-0.5 font-mono text-[12px] text-[var(--color-muted)]">
            {user?.id ?? "—"}
          </dd>
        </div>
      </dl>

      <form action="/auth/signout" method="post" className="mt-6">
        <button
          type="submit"
          className="rounded-full border border-[var(--color-line)] bg-white px-4 py-2 text-[12px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--color-surface)]"
        >
          Abmelden
        </button>
      </form>
    </div>
  );
}
