export function Header({ email }: { email: string }) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur-md shadow-sm">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400">
          Eingeloggt als
        </div>
        <div className="text-sm font-semibold text-slate-900">{email}</div>
      </div>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-150 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-900 hover:shadow"
        >
          Logout
        </button>
      </form>
    </header>
  );
}
