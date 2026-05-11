import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-zinc-900">Übersicht</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Willkommen im Creative-Tool. Starte eine neue Generierung oder verwalte
        deine Inhalte.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/generate"
          className="group rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-indigo-400 hover:shadow"
        >
          <div className="text-base font-semibold text-zinc-900 group-hover:text-indigo-600">
            Neue Creative generieren
          </div>
          <p className="mt-1 text-sm text-zinc-600">
            Erstelle ein neues Creative aus einem Prompt.
          </p>
        </Link>
      </div>
    </div>
  );
}
