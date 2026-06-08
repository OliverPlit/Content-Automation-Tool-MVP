import { redirect } from "next/navigation";

/**
 * /dashboard hat keine eigene Welcome-Page mehr — direkt in den Workflow.
 * Erstellen ist der erste Schritt, deshalb landest du dort.
 */
export default function DashboardIndex() {
  redirect("/dashboard/generate");
}
