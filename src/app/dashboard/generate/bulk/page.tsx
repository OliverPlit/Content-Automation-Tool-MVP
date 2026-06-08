import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { BulkForm } from "./bulk-form";

type ProductImportRow = {
  id: string;
  filename: string | null;
  row_count: number;
  created_at: string;
  insights: { rows?: Array<{ title: string; price: string }> } | null;
};

type ProjectRow = { id: string; name: string };

export default async function BulkGeneratePage() {
  const supabase = await createClient();

  const [{ data: imports }, { data: projects }] = await Promise.all([
    supabase
      .from("meta_imports")
      .select("id, filename, row_count, created_at, insights")
      .eq("kind", "products")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("projects")
      .select("id, name")
      .order("created_at", { ascending: false }),
  ]);

  const importList = (imports ?? []) as ProductImportRow[];
  const projectList = (projects ?? []) as ProjectRow[];

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard/generate"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-800 transition-colors hover:text-slate-950"
      >
        <span>←</span> Zurück zum Einzel-Generate
      </Link>

      <header className="mt-4 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-7 text-white shadow-xl shadow-slate-900/20">
        <h1 className="text-3xl font-bold tracking-tight">Bulk-Generate</h1>
        <p className="mt-1 max-w-xl text-sm text-slate-100">
          Aus einem importierten Produktkatalog für jedes Produkt automatisch
          Creatives erstellen. Erste Variante landet direkt im gewählten Projekt.
        </p>
      </header>

      <section className="mt-6">
        <BulkForm imports={importList} projects={projectList} />
      </section>
    </div>
  );
}
