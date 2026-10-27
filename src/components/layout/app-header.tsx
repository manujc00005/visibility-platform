import { Radar } from "lucide-react";
import Link from "next/link";

const NAV_ITEMS: { label: string; href: string }[] = [
  { label: "Inicio", href: "/" },
  { label: "Empresas", href: "/workspaces" },
];

export function AppHeader() {
  return (
    <header className="border-b border-border/70 bg-card/70 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-lg bg-linear-to-br from-brand to-primary text-primary-foreground shadow-sm">
            <Radar className="size-4" />
          </span>
          Visibility Platform
        </Link>
        <nav aria-label="Principal" className="flex flex-wrap items-center gap-4 text-sm">
          {NAV_ITEMS.map((item) => (
            <Link key={item.label} href={item.href} className="text-muted-foreground transition-colors hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
