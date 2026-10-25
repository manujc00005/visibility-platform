import Link from "next/link";
import { Badge } from "@/components/ui/badge";

/**
 * Primary navigation. Sections that do not exist yet are shown as disabled
 * (not links) so the menu reflects the roadmap without pointing to empty pages.
 */
const NAV_ITEMS: { label: string; href?: string; phase?: string }[] = [
  { label: "Inicio", href: "/" },
  { label: "Empresas", href: "/workspaces" },
  { label: "Informes", phase: "Fase 3" },
];

export function AppHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="font-semibold tracking-tight">
          Visibility Platform
        </Link>
        <nav aria-label="Principal" className="flex flex-wrap items-center gap-4 text-sm">
          {NAV_ITEMS.map((item) =>
            item.href ? (
              <Link key={item.label} href={item.href} className="text-foreground hover:underline">
                {item.label}
              </Link>
            ) : (
              <span key={item.label} aria-disabled="true" className="flex items-center gap-1.5 text-muted-foreground">
                {item.label}
                <Badge variant="outline">{item.phase}</Badge>
              </span>
            ),
          )}
        </nav>
      </div>
    </header>
  );
}
