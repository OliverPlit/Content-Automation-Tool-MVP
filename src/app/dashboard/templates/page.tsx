import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { TemplateForm } from "./template-form";
import { TemplateCard } from "./template-card";
import type { PromptTemplateData } from "../generate/schema";

type Row = {
  id: string;
  name: string;
  description: string | null;
  template_data: PromptTemplateData | null;
  user_id: string | null;
  created_at: string;
};

export default async function TemplatesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, description, template_data, user_id, created_at")
    .order("created_at", { ascending: false });

  const templates = (data ?? []) as Row[];

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 rounded-2xl bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 px-6 py-7 text-white shadow-xl shadow-blue-900/20">
        <h1 className="text-3xl font-bold tracking-tight">Templates</h1>
        <p className="mt-1 max-w-2xl text-sm text-blue-100">
          Wiederverwendbare Eingabe-Sets fürs Generieren. Lege z. B. &bdquo;Sommer-
          Aktion Landwirte&ldquo; oder &bdquo;Winterdienst Push&ldquo; an — danach reicht ein
          Klick, um das komplette Form vorausgefüllt zu öffnen.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      <TemplateForm mode="create" />

      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-blue-900">
          Deine Vorlagen ({templates.length})
        </h2>

        {templates.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
            Noch keine Vorlagen. Lege oben die erste an.
          </div>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {templates.map((t) => (
              <li key={t.id}>
                <TemplateCard template={t} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-blue-900/5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-blue-900">
          Wie funktioniert das?
        </h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>Vorlage hier oben mit Namen + Default-Werten anlegen.</li>
          <li>
            In der Karte unten &bdquo;<strong>Mit Vorlage generieren</strong>&ldquo;
            klicken.
          </li>
          <li>
            Du landest auf{" "}
            <Link
              href="/dashboard/generate"
              className="font-medium text-blue-700 hover:text-blue-900"
            >
              /dashboard/generate
            </Link>{" "}
            mit allen Feldern vorausgefüllt — du kannst noch jedes Feld
            anpassen, bevor du generierst.
          </li>
        </ol>
      </section>
    </div>
  );
}
