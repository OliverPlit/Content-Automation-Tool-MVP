import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scrapeProductPage } from "@/lib/scrape/product";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { url?: string };
  const url = String(body.url ?? "").trim();
  if (!url) {
    return NextResponse.json({ error: "URL fehlt." }, { status: 400 });
  }

  const result = await scrapeProductPage(url);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ data: result.data });
}
