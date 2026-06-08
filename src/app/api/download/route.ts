import { type NextRequest } from "next/server";

/**
 * Same-Origin Download-Proxy.
 *
 * Warum: Render-Outputs liegen cross-origin (Creatomate → Backblaze B2).
 * Das HTML-Attribut `<a download>` wird vom Browser bei cross-origin-URLs
 * IGNORIERT — der Klick öffnet die Datei nur, statt sie herunterzuladen.
 *
 * Lösung: Wir holen die Datei server-seitig und schicken sie mit
 * `Content-Disposition: attachment` same-origin zurück → echter Download.
 *
 * SSRF-Schutz: nur https + Allowlist bekannter Render-/Storage-Hosts.
 */
const ALLOWED_HOST_SUFFIXES = [
  ".backblazeb2.com",
  ".creatomate.com",
  ".supabase.co",
  ".supabase.in",
];

function isAllowed(u: URL): boolean {
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "creatomate.com") return true;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^\w.\-]+/g, "_").replace(/^_+|_+$/g, "");
  return (cleaned || "download").slice(0, 120);
}

export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get("url");
  const nameParam = request.nextUrl.searchParams.get("name");
  if (!src) {
    return new Response("Missing 'url' parameter.", { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(src);
  } catch {
    return new Response("Invalid 'url' parameter.", { status: 400 });
  }

  if (!isAllowed(target)) {
    return new Response("Host not allowed.", { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), { cache: "no-store" });
  } catch {
    return new Response("Upstream fetch failed.", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(`Upstream returned ${upstream.status}.`, {
      status: 502,
    });
  }

  const contentType =
    upstream.headers.get("content-type") ?? "application/octet-stream";
  const fallbackName = target.pathname.split("/").pop() || "download";
  const filename = sanitizeFilename(nameParam || fallbackName);

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);
  headers.set("Cache-Control", "private, no-store");

  return new Response(upstream.body, { status: 200, headers });
}
