import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { promptTemplateDataSchema } from "@/app/dashboard/generate/schema";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ID fehlt." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("templates")
    .select("id, name, description, template_data, user_id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `DB-Fehler: ${error.message}` },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Vorlage nicht gefunden." }, { status: 404 });
  }

  // RLS sollte das schon abgefangen haben, doppelter Check schadet nicht.
  if (data.user_id && data.user_id !== user.id) {
    return NextResponse.json({ error: "Kein Zugriff." }, { status: 403 });
  }

  const safe = promptTemplateDataSchema.safeParse(data.template_data ?? {});
  return NextResponse.json({
    id: data.id,
    name: data.name,
    description: data.description,
    data: safe.success ? safe.data : {},
  });
}
