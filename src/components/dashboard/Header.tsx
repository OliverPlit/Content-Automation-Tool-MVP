export function Header({ email }: { email: string }) {
  return (
    <header className="flex items-center justify-between border-b border-[var(--color-line)] bg-white/80 px-6 py-3 backdrop-blur-xl">
      <div>
        <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
          Eingeloggt als
        </div>
        <div className="text-[13px] font-medium text-[var(--foreground)]">
          {email}
        </div>
      </div>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="rounded-full border border-[var(--color-line)] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--color-surface)]"
        >
          Abmelden
        </button>
      </form>
    </header>
  );
}
