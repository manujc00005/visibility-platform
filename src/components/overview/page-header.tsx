import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Page title block shared by the overview and the detail pages: optional breadcrumb,
 * title, one line of context, a plain-words description and the page actions.
 */
export function PageHeader({
  breadcrumbs,
  title,
  meta,
  description,
  actions,
}: {
  breadcrumbs?: { href: string; label: string }[];
  title: string;
  meta?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        {breadcrumbs?.length ? (
          <nav aria-label="Ruta de navegación">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              {breadcrumbs.map((crumb, i) => (
                <li key={crumb.href} className="flex items-center gap-1">
                  {i > 0 ? <ChevronRight aria-hidden="true" className="size-3.5" /> : null}
                  <Link
                    href={crumb.href}
                    className="rounded-sm transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:outline-none"
                  >
                    {crumb.label}
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight break-words sm:text-3xl">{title}</h1>
        {meta ? <p className="text-sm text-muted-foreground">{meta}</p> : null}
        {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-start gap-2">{actions}</div> : null}
    </header>
  );
}
