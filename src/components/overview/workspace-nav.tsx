import Link from "next/link";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import { cn } from "@/lib/utils";

export type WorkspaceSection = "overview" | "performance" | "seo" | "geo";

const ITEMS: { key: WorkspaceSection; path: string }[] = [
  { key: "overview", path: "" },
  { key: "performance", path: "/performance" },
  { key: "seo", path: "/seo" },
  { key: "geo", path: "/geo" },
];

/** Section tabs of a workspace. Same order and labels everywhere; the current one is marked for assistive tech. */
export function WorkspaceNav({ workspaceId, current, locale = DEFAULT_LOCALE }: { workspaceId: string; current: WorkspaceSection; locale?: Locale }) {
  const t = getMessages(locale).overview.nav;
  return (
    <nav aria-label={t.label} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
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
                {item.key === "geo" ? (
                  <>
                    <span className="sm:hidden">{t.geoShort}</span>
                    <span className="hidden sm:inline">{t.geo}</span>
                  </>
                ) : (
                  t[item.key]
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
