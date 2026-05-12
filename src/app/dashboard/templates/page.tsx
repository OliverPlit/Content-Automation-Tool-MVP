import { createClient } from "@/lib/supabase/server";

type Template = {
  id: string;
  name: string;
  description: string | null;
  prompt_template: string;
  user_id: string | null;
};

export default async function TemplatesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, description, prompt_template, user_id")
    .order("created_at", { ascending: false });

  const templates = (data ?? []) as Template[];

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 rounded-2xl bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 px-6 py-7 text-white shadow-xl shadow-blue-900/20">
        <h1 className="text-3xl font-bold tracking-tight">Templates</h1>
        <p className="mt-1 text-sm text-blue-100">
          Wiederverwendbare Prompt-Vorlagen für deine Creative-Generierungen.
        </p>
      </header>

      {error && (
        <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      {templates.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          Noch keine Templates vorhanden.
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {templates.map((t) => (
            <li
              key={t.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-blue-900/5 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-900/10"
            >
              <div className="flex items-center justify-between">
                <div className="font-medium text-slate-900">{t.name}</div>
                {t.user_id === null && (
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">
                    System
                  </span>
                )}
              </div>
              {t.description && (
                <p className="mt-1 text-sm text-slate-600">{t.description}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
