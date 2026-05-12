import { createClient } from "@/lib/supabase/server";
import { adCopySchema } from "../generate/schema";
import { LibraryList, type LibraryItem } from "./library-list";

type Row = {
  id: string;
  prompt: string;
  output: string | null;
  status: string;
  created_at: string;
};

function parseOutput(raw: string | null) {
  if (!raw) return null;
  try {
    const parsed = adCopySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export default async function LibraryPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("creatives")
    .select("id, prompt, output, status, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const creatives = (data ?? []) as Row[];

  // Gemeinsamer Round-Trip für Bilder und Renders aller gelisteten Creatives.
  const imagesByCreative = new Map<string, number[]>();
  const rendersByCreative = new Map<string, number[]>();
  const firstImageUrl = new Map<string, string>();

  if (creatives.length > 0) {
    const ids = creatives.map((c) => c.id);
    const [{ data: imageRows }, { data: renderRows }] = await Promise.all([
      supabase
        .from("creative_images")
        .select("creative_id, variant_index, image_url")
        .in("creative_id", ids)
        .order("variant_index", { ascending: true }),
      supabase
        .from("creative_renders")
        .select("creative_id, variant_index")
        .in("creative_id", ids)
        .eq("status", "succeeded"),
    ]);

    (imageRows ?? []).forEach((row) => {
      const cid = row.creative_id as string;
      const vi = row.variant_index as number;
      const arr = imagesByCreative.get(cid) ?? [];
      arr.push(vi);
      imagesByCreative.set(cid, arr);
      if (!firstImageUrl.has(cid)) firstImageUrl.set(cid, row.image_url as string);
    });

    (renderRows ?? []).forEach((row) => {
      const cid = row.creative_id as string;
      const vi = row.variant_index as number;
      const arr = rendersByCreative.get(cid) ?? [];
      if (!arr.includes(vi)) arr.push(vi);
      rendersByCreative.set(cid, arr);
    });
  }

  const items: LibraryItem[] = creatives.map((c) => ({
    id: c.id,
    prompt: c.prompt,
    status: c.status,
    createdAt: c.created_at,
    output: parseOutput(c.output),
    thumbnailUrl: firstImageUrl.get(c.id) ?? null,
    imagesByVariant: imagesByCreative.get(c.id) ?? [],
    rendersByVariant: rendersByCreative.get(c.id) ?? [],
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 rounded-2xl bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 px-6 py-7 text-white shadow-xl shadow-blue-900/20">
        <h1 className="text-3xl font-bold tracking-tight">Library</h1>
        <p className="mt-1 max-w-xl text-sm text-blue-100">
          Alle gespeicherten Creatives. Klick einen Eintrag an für Tabs pro
          Variante, Bilder und Renders.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      <LibraryList items={items} />
    </div>
  );
}
