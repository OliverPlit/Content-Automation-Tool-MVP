import Link from "next/link";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white/95 p-8 shadow-2xl shadow-slate-900/10 backdrop-blur">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-slate-400 to-slate-800 text-base font-bold text-white shadow-md shadow-slate-900/30">
            C
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Login</h1>
            <p className="text-[10px] uppercase tracking-wider text-slate-700">
              Content-Tool
            </p>
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {error}
          </p>
        )}

        <form action={login} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              name="email"
              type="email"
              required
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Passwort
            </label>
            <input
              name="password"
              type="password"
              required
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-700"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-gradient-to-br from-slate-800 to-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/30 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-900/40"
          >
            Anmelden
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Noch kein Account?{" "}
          <Link
            href="/signup"
            className="font-medium text-slate-800 hover:text-slate-950 hover:underline"
          >
            Registrieren
          </Link>
        </p>
      </div>
    </main>
  );
}
