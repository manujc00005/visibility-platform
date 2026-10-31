import { StatusPill } from "@/components/audits/status-ui";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { LighthouseView } from "@/modules/audits/lighthouse";
import { displayDate } from "@/modules/workspaces/presentation";

/**
 * One Google Lighthouse category of the latest audit. Check titles are ours when we have
 * them, else Lighthouse's own text: plain text either way, never HTML or links.
 */
export function LighthouseCategoryCard({
  view,
  locale,
  auditedAt,
  version,
}: {
  view: LighthouseView;
  locale: Locale;
  auditedAt: Date | null;
  version: string | null;
}) {
  const t = getMessages(locale).lighthouse;
  const copy = t.categories[view.category];
  const headingId = `lighthouse-${view.category}`;
  const hidden = view.failingTotal - view.failing.length;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 id={headingId} className="text-base font-semibold tracking-tight">
            {copy.title}
          </h3>
          <p className="max-w-2xl text-sm text-muted-foreground">{copy.description}</p>
        </div>
        <StatusPill tone={view.tone}>{view.verdict}</StatusPill>
      </div>

      {view.state === "ok" && view.score !== null ? (
        <>
          <p className="text-4xl font-semibold tabular-nums">
            {view.score}
            <span className="text-base font-normal text-muted-foreground">/100</span>
          </p>
          {view.failingTotal > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{t.failingTitle(view.failingTotal)}</p>
              <ul className="flex flex-col divide-y rounded-lg border border-border/80">
                {view.failing.map((check) => (
                  <li key={check.id} lang={check.meaning === null && view.originalTexts ? DEFAULT_LOCALE : undefined} className="px-3 py-2 text-sm break-words">
                    {check.meaning ? (
                      <>
                        <span className="font-medium">{check.title}:</span> {check.meaning}
                      </>
                    ) : (
                      check.title
                    )}
                  </li>
                ))}
              </ul>
              {hidden > 0 ? <p className="text-xs text-muted-foreground">{t.more(hidden)}</p> : null}
              {view.originalTexts ? (
                <p role="note" className="rounded-md border border-border/80 bg-muted/60 p-2.5 text-xs text-muted-foreground">
                  {t.originalNotice}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t.allPassed(view.scored)}</p>
          )}
          {auditedAt ? (
            <p className="text-xs text-muted-foreground">
              {version ? t.source(version, displayDate(auditedAt, locale)) : t.sourceNoVersion(displayDate(auditedAt, locale))}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{view.reason}</p>
      )}
    </section>
  );
}
