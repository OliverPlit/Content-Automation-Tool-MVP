export default function GeneratePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900">
        Neue Creative generieren
      </h1>
      <p className="mt-2 text-sm text-zinc-600">
        Beschreibe das gewünschte Creative. Generierungs-Backend folgt.
      </p>

      <form className="mt-8 space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-zinc-700">
            Prompt
          </label>
          <textarea
            name="prompt"
            rows={6}
            placeholder="z.B. Instagram-Story-Anzeige für nachhaltige Sneaker, junge Zielgruppe, Sommer-Vibe…"
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Generieren (Coming soon)
          </button>
        </div>
      </form>
    </div>
  );
}
