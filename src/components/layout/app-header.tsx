import Link from "next/link";

const NAV_ITEMS: { label: string; href: string }[] = [
  { label: "Inicio", href: "/" },
  { label: "Empresas", href: "/workspaces" },
];

export function AppHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="font-semibold tracking-tight">
          Visibility Platform
        </Link>
        <nav aria-label="Principal" className="flex flex-wrap items-center gap-4 text-sm">
          {NAV_ITEMS.map((item) => (
            <Link key={item.label} href={item.href} className="text-foreground hover:underline">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
