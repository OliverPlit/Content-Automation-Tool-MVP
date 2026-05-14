import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const STORAGE_BUCKET = "creative-images";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Keine Datei übergeben." }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Datei zu groß (max ${MAX_BYTES / 1024 / 1024} MB).` },
        { status: 413 },
      );
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Dateityp nicht erlaubt: ${file.type || "unbekannt"}.` },
        { status: 415 },
      );
    }

    const buf = new Uint8Array(await file.arrayBuffer());
    const ext = file.type.includes("png")
      ? "png"
      : file.type.includes("webp")
        ? "webp"
        : "jpg";
    const path = `${user.id}/preview/upload-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, buf, {
        contentType: file.type,
        upsert: true,
        cacheControl: "0",
      });
    if (upErr) {
      return NextResponse.json(
        { error: `Upload-Fehler: ${upErr.message}` },
        { status: 500 },
      );
    }

    const { data: pub } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path);
    return NextResponse.json({ url: `${pub.publicUrl}?v=${Date.now()}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
