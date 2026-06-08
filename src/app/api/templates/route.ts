import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Liste der Vorlagen des aktuellen Users — für den Vorlagen-Picker direkt
// im Generate-Form (id + name reichen; Daten lädt /api/templates/[id]).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("templates")
    .select("id, name")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ templates: data ?? [] });
}
