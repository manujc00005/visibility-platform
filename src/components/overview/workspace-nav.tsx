import Link from "next/link";
import { cn } from "@/lib/utils";

export type WorkspaceSection = "overview" | "performance" | "seo" | "geo";

const ITEMS: { key: WorkspaceSection; label: string; short?: string; path: string }[] = [
  { key: "overview", label: "Resumen", path: "" },
  { key: "performance", label: "Rendimiento", path: "/performance" },
  { key: "seo", label: "Google", path: "/seo" },
  { key: "geo", label: "Presencia en IA", short: "IA", path: "/geo" },
];

/** Section tabs of a workspace. Same order and labels everywhere; the current one is marked for assistive tech. */
export function WorkspaceNav({ workspaceId, current }: { workspaceId: string; current: WorkspaceSection }) {
  return (
    <nav aria-label="Secciones de la empresa" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b">
        {ITEMS.map((item) => {
          const active = item.key === current;
          return (
            <li key={item.key}>
              <Link
                href={`/workspaces/${workspaceId}${item.path}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:outline-none",
                  active && "text-foreground after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand",
                )}
              >
                {item.short ? (
                  <>
                    <span className="sm:hidden">{item.short}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </>
                ) : (
                  item.label
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
