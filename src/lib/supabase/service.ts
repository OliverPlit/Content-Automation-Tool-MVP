/**
 * Service-Role Client — bypasses RLS. NUR in Cron/Worker-Routen verwenden,
 * niemals in User-facing Server-Actions oder Pages.
 *
 * Erwartet SUPABASE_SERVICE_ROLE_KEY in der Env.
 */
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY oder NEXT_PUBLIC_SUPABASE_URL fehlt.",
    );
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
