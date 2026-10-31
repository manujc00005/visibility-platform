import type { KeywordActionState } from "@/app/workspaces/[id]/seo/actions";
import { ChangeLine } from "@/components/overview/overview-card";
import { KeywordSparkline } from "@/components/search-console/keyword-sparkline";
import { RemoveTrackedKeywordForm, TrackedKeywordForm } from "@/components/search-console/tracked-keyword-form";
import { formatDateTime, formatNumber } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import { weekEnd, type TrackedKeywordSummary, type TrackedKeywordView } from "@/modules/search-console/keyword-summary";
import { MAX_TRACKED_KEYWORDS } from "@/modules/search-console/keywords";
import { displayDay } from "@/modules/search-console/summary";

type Action = (state: KeywordActionState, form: FormData) => Promise<KeywordActionState>;
interface Props {
  summary: TrackedKeywordSummary;
  locale: Locale;
  addAction: Action;
  removeAction: (id: string) => Action;
}

/** Same wording as the query table (009): a lower position number is going up. */
function changeOf(change: NonNullable<TrackedKeywordView["change"]>, locale: Locale) {
  const t = getMessages(locale).searchConsole.changes;
  const places = formatNumber(Math.abs(change.delta), locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (change.direction === "same") return { direction: "same" as const, text: t.querySame };
  return { direction: change.direction, text: change.direction === "better" ? t.queryUp(places) : t.queryDown(places) };
}

export function TrackedKeywordsSection({ summary, locale, addAction, removeAction }: Props) {
  const t = getMessages(locale).searchConsole.tracked;
  const position = (value: number) => formatNumber(value, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const count = (value: number) => formatNumber(value, locale, { maximumFractionDigits: 0 });
  const week = (start: string) => `${displayDay(start, locale)} – ${displayDay(weekEnd(start), locale)}`;
  return (
    <section aria-labelledby="tracked-keywords-title" className="flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5">
      <div>
        <h3 id="tracked-keywords-title" className="font-semibold">{t.title}</h3>
        <p className="text-sm text-muted-foreground">{t.description}</p>
      </div>
      {summary.rows.length < MAX_TRACKED_KEYWORDS ? (
        <TrackedKeywordForm action={addAction} labels={{ label: t.label, add: t.add, pendingAction: t.pendingAction }} />
      ) : <p className="text-sm">{t.limit}</p>}
      {summary.warning ? <p role="alert" className="text-sm text-destructive">{t.warning}</p> : null}
      {summary.rows.length === 0 ? <p className="text-sm text-muted-foreground">{t.empty}</p> : (
        <table className="block w-full min-w-0 table-fixed">
          <thead className="sr-only"><tr><th scope="col">{t.label}</th><th scope="col">{t.remove}</th></tr></thead>
          <tbody className="block w-full divide-y">
            {summary.rows.map((row) => (
              <tr key={row.id} className="grid min-w-0 gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                <td className="flex min-w-0 flex-col gap-2">
                  <p className="font-medium [overflow-wrap:anywhere]">{row.keyword}</p>
                  {row.state !== "ok" ? <p className="text-sm text-muted-foreground">{t[row.state]}</p> : (
                    <>
                      <p className="text-sm">
                        {t.position}: <strong>{position(row.latest!.position)}</strong> · {t.impressions}: {count(row.latest!.impressions)} · {t.days}: {row.latest!.daysWithData}/7
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.first}: {week(row.first!.start)} · {position(row.first!.position)}
                        <br />
                        {t.latest}: {week(row.latest!.start)} · {position(row.latest!.position)}
                      </p>
                      {row.change ? <ChangeLine change={changeOf(row.change, locale)} /> : <p className="text-sm">{t.oneWeek}</p>}
                      <KeywordSparkline row={row} locale={locale} />
                      {row.trailingMissing > 0 ? <p className="text-xs text-muted-foreground">{t.trailing}: {row.trailingMissing}</p> : null}
                    </>
                  )}
                </td>
                <td className="block min-w-0">
                  <RemoveTrackedKeywordForm action={removeAction(row.id)} label={t.remove} pendingLabel={t.pendingAction} keyword={row.keyword} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
        {t.source}{summary.property ? ` · ${summary.property}` : ""}
        {summary.range ? ` · ${displayDay(summary.range.start, locale)} – ${displayDay(summary.range.end, locale)}` : ""}
        {summary.capturedAt ? ` · ${formatDateTime(summary.capturedAt, locale)}` : ""}
      </p>
    </section>
  );
}
