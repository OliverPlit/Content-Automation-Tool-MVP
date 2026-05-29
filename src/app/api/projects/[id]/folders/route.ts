import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ id: string }>;

// Liste der Folder eines Projekts
export async function GET(_req: Request, { params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("project_folders")
    .select("id, name, color, description, position, created_at")
    .eq("project_id", id)
    .order("position", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ folders: data ?? [] });
}
