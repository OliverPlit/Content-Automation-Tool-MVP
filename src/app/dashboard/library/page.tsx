import { createClient } from "@/lib/supabase/server";

type Creative = {
  id: string;
  prompt: string;
  status: string;
  created_at: string;
};

const statusStyle: Record<string, string> = {
  pending: "bg-zinc-100 text-zinc-700",
  processing: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

export default async function LibraryPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("creatives")
    .select("id, prompt, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const creatives = (data ?? []) as Creative[];

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold text-zinc-900">Library</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Alle bisher generierten Creatives.
      </p>

      {error && (
        <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      {creatives.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          Noch keine Creatives generiert.
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
          {creatives.map((c) => (
            <li
              key={c.id}
              className="flex items-start justify-between gap-4 px-6 py-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-900">{c.prompt}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {new Date(c.created_at).toLocaleString("de-DE")}
                </p>
              </div>
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-xs ${
                  statusStyle[c.status] ?? statusStyle.pending
                }`}
              >
                {c.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
