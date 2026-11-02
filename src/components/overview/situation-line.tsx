import type { Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { SituationFragment } from "@/modules/overview";

/**
 * Where the business stands, one fragment per area in card order (feature 023). Plain text:
 * the fragments come from the cards' summaries (D003) and are never joined into a verdict.
 * On mobile each fragment takes its own line; from `sm` they run together with a dot between.
 */
export function SituationLine({ fragments, locale }: { fragments: SituationFragment[] | null; locale: Locale }) {
  if (!fragments) return null;
  const t = getMessages(locale).overview.situation;
  return (
    <section aria-labelledby="situation-title">
      {/* A heading, so heading navigation reaches the line too; visually the line speaks for itself. */}
      <h2 id="situation-title" className="sr-only">
        {t.label}
      </h2>
      {/* `role="list"`: WebKit drops list semantics from a list without bullets. */}
      <ul role="list" className="flex flex-col gap-1 text-base text-pretty sm:flex-row sm:flex-wrap sm:gap-y-1">
        {fragments.map((fragment, i) => (
          <li key={fragment.area}>
            {fragment.text}
            {/* After the fragment, so a wrapped line never starts with a dot. */}
            {i < fragments.length - 1 ? (
              <span aria-hidden="true" className="hidden px-2 text-muted-foreground sm:inline">
                ·
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
