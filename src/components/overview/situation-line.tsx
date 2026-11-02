import type { Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";

/**
 * Where the business stands, one fragment per area in card order (feature 023). Plain text:
 * the fragments come from the cards' summaries (D003) and are never joined into a verdict.
 * On mobile each fragment takes its own line; from `sm` they run together with a separator.
 */
export function SituationLine({ fragments, locale }: { fragments: string[] | null; locale: Locale }) {
  if (!fragments) return null;
  const t = getMessages(locale).overview.situation;
  return (
    <section aria-label={t.label}>
      <ul className="flex flex-col gap-1 text-base text-pretty sm:flex-row sm:flex-wrap sm:gap-x-0 sm:gap-y-1">
        {fragments.map((fragment) => (
          // The dot between fragments is decoration: a list already reads as separate items.
          <li key={fragment} className="sm:after:px-2 sm:after:text-muted-foreground sm:after:content-['·'] sm:last:after:content-none">
            {fragment}
          </li>
        ))}
      </ul>
    </section>
  );
}
