export function Header({ email }: { email: string }) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
      <div className="text-sm text-zinc-500">Eingeloggt als</div>
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-zinc-900">{email}</span>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Logout
          </button>
        </form>
      </div>
    </header>
  );
}
