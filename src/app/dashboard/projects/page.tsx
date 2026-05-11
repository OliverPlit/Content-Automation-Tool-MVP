import { createClient } from "@/lib/supabase/server";

type Project = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, description, created_at")
    .order("created_at", { ascending: false });

  const projects = (data ?? []) as Project[];

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold text-zinc-900">Projekte</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Gruppiere deine Creatives nach Kampagne, Kunde oder Kanal.
      </p>

      {error && (
        <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      {projects.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          Noch keine Projekte angelegt.
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
          {projects.map((p) => (
            <li key={p.id} className="px-6 py-4">
              <div className="font-medium text-zinc-900">{p.name}</div>
              {p.description && (
                <div className="text-sm text-zinc-600">{p.description}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
