import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-[var(--color-surface)]">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header email={user.email ?? ""} />
        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
