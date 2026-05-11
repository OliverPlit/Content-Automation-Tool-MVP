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
      <h1 className="text-2xl font-semibold text-zinc-900">Templates</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Wiederverwendbare Prompt-Vorlagen für deine Creative-Generierungen.
      </p>

      {error && (
        <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      {templates.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          Noch keine Templates vorhanden.
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {templates.map((t) => (
            <li
              key={t.id}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="font-medium text-zinc-900">{t.name}</div>
                {t.user_id === null && (
                  <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                    System
                  </span>
                )}
              </div>
              {t.description && (
                <p className="mt-1 text-sm text-zinc-600">{t.description}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
