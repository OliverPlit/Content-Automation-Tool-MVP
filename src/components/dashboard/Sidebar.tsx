import Link from "next/link";

const nav = [
  { href: "/dashboard", label: "Übersicht" },
  { href: "/dashboard/generate", label: "Generate" },
  { href: "/dashboard/projects", label: "Projekte" },
  { href: "/dashboard/templates", label: "Templates" },
  { href: "/dashboard/library", label: "Library" },
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-60 flex-col border-r border-zinc-800 bg-zinc-900 px-4 py-6 text-zinc-100">
      <div className="mb-8 px-2 text-lg font-semibold">Content-Tool</div>
      <nav className="flex flex-col gap-1">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
