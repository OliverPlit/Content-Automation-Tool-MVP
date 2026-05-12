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
      <header className="mb-6 rounded-2xl bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 px-6 py-7 text-white shadow-xl shadow-blue-900/20">
        <h1 className="text-3xl font-bold tracking-tight">Projekte</h1>
        <p className="mt-1 text-sm text-blue-100">
          Gruppiere deine Creatives nach Kampagne, Kunde oder Kanal.
        </p>
      </header>

      {error && (
        <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      {projects.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          Noch keine Projekte angelegt.
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-blue-900/5">
          {projects.map((p) => (
            <li key={p.id} className="px-6 py-4">
              <div className="font-medium text-slate-900">{p.name}</div>
              {p.description && (
                <div className="text-sm text-slate-600">{p.description}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
