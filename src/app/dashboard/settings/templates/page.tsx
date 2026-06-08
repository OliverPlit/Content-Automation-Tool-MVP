import { createClient } from "@/lib/supabase/server";
import { TemplateForm } from "../../templates/template-form";
import { TemplateCard } from "../../templates/template-card";
import type { PromptTemplateData } from "../../generate/schema";
import { DeleteAllTemplates } from "./delete-all-templates";

type Row = {
  id: string;
  name: string;
  description: string | null;
  template_data: PromptTemplateData | null;
  user_id: string | null;
  created_at: string;
};

export default async function SettingsTemplatesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, description, template_data, user_id, created_at")
    .order("created_at", { ascending: false });

  const templates = (data ?? []) as Row[];
  const ownCount = templates.filter((t) => t.user_id !== null).length;

  return (
    <div>
      <div className="rounded-2xl border border-[var(--color-line)] bg-white p-4">
        <p className="text-[13px] font-medium text-[var(--foreground)]">
          Vorlagen
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-muted)]">
          Wiederverwendbare Eingabe-Sets fürs Generieren. Lege z. B.
          &bdquo;Sommer-Aktion Landwirte&ldquo; an — danach reicht ein Klick, um
          das komplette Generate-Form vorausgefüllt zu öffnen.
        </p>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {error.message}
        </p>
      )}

      <div className="mt-6">
        <TemplateForm mode="create" />
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Deine Vorlagen ({templates.length})
          </h2>
          <DeleteAllTemplates count={ownCount} />
        </div>

        {templates.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-[var(--color-line)] bg-white p-10 text-center text-sm text-[var(--color-muted)]">
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
    </div>
  );
}
