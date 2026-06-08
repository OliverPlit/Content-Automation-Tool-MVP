import { redirect } from "next/navigation";

// Templates leben jetzt als eigener Reiter unter Einstellungen.
// Alte Links / Bookmarks auf /dashboard/templates hierher umleiten.
export default function TemplatesRedirectPage() {
  redirect("/dashboard/settings/templates");
}
