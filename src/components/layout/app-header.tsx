import { Radar } from "lucide-react";
import Link from "next/link";
import { HeaderNav } from "@/components/layout/header-nav";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import type { Locale } from "@/i18n/locale";
import type { Messages } from "@/i18n/messages";

/** Target of the skip link; the root layout gives `<main>` this id. */
export const MAIN_CONTENT_ID = "contenido";

/**
 * Sticky header, `--header-height` tall at every width. Server component: only `HeaderNav` runs
 * on the client (it reads the pathname); the language switcher is a plain form.
 */
export function AppHeader({ locale, messages }: { locale: Locale; messages: Pick<Messages, "common" | "header"> }) {
  const { common, header } = messages;
  return (
    <header className="sticky top-0 z-40 h-(--header-height) border-b border-border/70 bg-card/85 backdrop-blur">
      <div className="mx-auto flex h-full w-full max-w-5xl items-center gap-x-4 px-4 sm:gap-x-6 sm:px-6">
        <a
          href={`#${MAIN_CONTENT_ID}`}
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring focus:outline-none"
        >
          {common.skipToContent}
        </a>
        <Link
          href="/"
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:outline-none"
        >
          <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-lg bg-linear-to-br from-brand to-primary text-primary-foreground shadow-sm">
            <Radar className="size-4" />
          </span>
          <span className="sr-only sm:not-sr-only">{common.brand}</span>
        </Link>
        <HeaderNav
          label={header.navLabel}
          items={[
            { href: "/", label: header.home },
            { href: "/workspaces", label: header.workspaces },
          ]}
        />
        <LanguageSwitcher locale={locale} labels={{ group: common.languageLabel, languages: common.languages }} />
      </div>
    </header>
  );
}
