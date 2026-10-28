import { setLocaleAction } from "@/i18n/actions";
import { LOCALE_COOKIE, SUPPORTED_LOCALES, type Locale } from "@/i18n/locale";
import { cn } from "@/lib/utils";

export interface LanguageSwitcherLabels {
  /** Accessible name of the group («Idioma» / «Language»). */
  group: string;
  /** Full accessible name of each button, in its own language. */
  languages: Record<Locale, string>;
}

/**
 * Segmented ES/EN control. Server component: a plain form posts to the server action, so the
 * change works without JavaScript. The active button stays enabled so focus is not lost on change.
 */
export function LanguageSwitcher({ locale, labels }: { locale: Locale; labels: LanguageSwitcherLabels }) {
  return (
    <form action={setLocaleAction} className="ml-auto flex items-center">
      <div role="group" aria-label={labels.group} className="flex items-center gap-2 rounded-lg bg-muted/70 p-1">
        {SUPPORTED_LOCALES.map((code) => {
          const active = code === locale;
          return (
            <button
              key={code}
              type="submit"
              name={LOCALE_COOKIE}
              value={code}
              lang={code}
              aria-label={labels.languages[code]}
              aria-current={active ? "true" : undefined}
              className={cn(
                "inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-xs font-semibold transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none motion-reduce:transition-none",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-card hover:text-foreground",
              )}
            >
              {code.toUpperCase()}
            </button>
          );
        })}
      </div>
    </form>
  );
}
