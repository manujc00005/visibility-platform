import Link from "next/link";
import type { ReactNode } from "react";
import type { CompetitorComparisonState } from "@/app/workspaces/[id]/seo/actions";
import { ComparisonButton } from "@/components/competitor-comparison/comparison-button";
import { formatDateTime, formatMs, formatNumber } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { SiteResult } from "@/modules/competitor-comparison/sites";
import type { ComparisonRow, ComparisonSummary } from "@/modules/competitor-comparison/summary";
import { displayDay } from "@/modules/search-console/summary";

type Texts = ReturnType<typeof getMessages>["competitorComparison"];
type Metric = { status: "ok"; value: number } | { status: "not_measured" };

const COLUMNS = ["performance", "seo", "accessibility", "bestPractices", "lcp", "inp", "cls", "critical", "warnings", "authority", "referringDomains"] as const;
const cellClass = "flex items-baseline justify-between gap-3 py-0.5 text-sm tabular-nums lg:table-cell lg:px-1.5 lg:py-2 lg:text-center lg:align-top lg:text-xs";

/** On a phone a row is a list, so each value carries its label; on a wide screen the header does it. */
function Value({ label, children }: { label: string; children: ReactNode }) {
  return (
    <td role="cell" className={cellClass}>
      <span className="text-muted-foreground lg:hidden">{label}</span>
      <span>{children}</span>
    </td>
  );
}

/** A source with no data at all: its reason spans its columns (D008). */
function Absent({ source, span, children }: { source: string; span: number; children: ReactNode }) {
  return (
    <td role="cell" colSpan={span} className={cellClass}>
      <span className="text-muted-foreground lg:hidden">{source}</span>
      <span className="text-muted-foreground">{children}</span>
    </td>
  );
}

function Cells({ site, t, locale }: { site: SiteResult; t: Texts; locale: Locale }) {
  const number = (value: number, digits = 0) => formatNumber(value, locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const shown = (metric: Metric, format: (value: number) => string) => (metric.status === "ok" ? format(metric.value) : t.notMeasured);
  const c = t.columns;
  const { lighthouse, field, authority } = site;
  return (
    <>
      {lighthouse.status === "ok" ? (
        <>
          <Value label={c.performance}>{shown(lighthouse.performance, number)}</Value>
          <Value label={c.seo}>{shown(lighthouse.seo, number)}</Value>
          <Value label={c.accessibility}>{shown(lighthouse.accessibility, number)}</Value>
          <Value label={c.bestPractices}>{shown(lighthouse.bestPractices, number)}</Value>
        </>
      ) : (
        <Absent source={t.sources.lighthouse} span={4}>
          {lighthouse.status === "skipped" ? t.access[site.access] : t.lighthouseStatus[lighthouse.status]}
        </Absent>
      )}
      {field.status === "ok" ? (
        <>
          <Value label={c.lcp}>{shown(field.lcpMs, (v) => formatMs(v, locale))}</Value>
          <Value label={c.inp}>{shown(field.inpMs, (v) => formatMs(v, locale))}</Value>
          <Value label={c.cls}>{shown(field.cls, (v) => number(v, 2))}</Value>
        </>
      ) : (
        <Absent source={t.sources.field} span={3}>
          {field.status === "skipped" ? t.access[site.access] : t.fieldStatus[field.status]}
        </Absent>
      )}
      {site.criticalCount !== null && site.warningCount !== null ? (
        <>
          <Value label={c.critical}>{number(site.criticalCount)}</Value>
          <Value label={c.warnings}>{number(site.warningCount)}</Value>
        </>
      ) : (
        <Absent source={t.sources.audit} span={2}>
          {t.access[site.access]}
        </Absent>
      )}
      {authority.status === "ok" ? (
        <>
          <Value label={c.authority}>{number(authority.score, 2)}</Value>
          <Value label={c.referringDomains}>{authority.referringDomains === null ? t.unavailable : number(authority.referringDomains)}</Value>
        </>
      ) : (
        <Absent source={t.sources.authority} span={2}>
          {t.authorityStatus[authority.status]}
        </Absent>
      )}
    </>
  );
}

function Details({ site, t, locale }: { site: SiteResult; t: Texts; locale: Locale }) {
  const { field, authority } = site;
  const period = field.status === "ok" ? (field.period ? `${displayDay(field.period.firstDate, locale)} – ${displayDay(field.period.lastDate, locale)}` : t.fieldNoPeriod) : null;
  const matched = authority.status === "ok" || authority.status === "not_found" ? authority : null;
  return (
    <>
      {field.status === "ok" && period ? <span className="block">{t.fieldDetail(t.scope[field.scope], period)}</span> : null}
      {matched ? <span className="block">{t.authorityDetail(matched.effectiveDomain, displayDay(matched.asOf, locale))}</span> : null}
      {matched && matched.effectiveDomain !== matched.requestedDomain ? <span className="block">{t.subdomainNote}</span> : null}
      {authority.status === "ok" ? <span className="block">{authority.rank === null ? t.noRank : t.rank(formatNumber(authority.rank, locale))}</span> : null}
    </>
  );
}

function Row({ row, t, locale }: { row: ComparisonRow; t: Texts; locale: Locale }) {
  return (
    <tr role="row" className="block py-3 lg:table-row lg:py-0">
      <th role="rowheader" scope="row" className="block pb-1 text-left align-top font-normal lg:table-cell lg:py-2 lg:pr-3">
        <span className="block font-medium [overflow-wrap:anywhere]">{row.name}</span>
        <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{row.domain}</span>
        {row.role === "company" ? <span className="mt-0.5 block text-xs font-medium">{t.you}</span> : null}
        {row.state === "measured" && row.measuredAs ? <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{t.measuredAs(row.measuredAs)}</span> : null}
        {row.state === "measured" ? (
          <span className="mt-1 block text-xs text-muted-foreground">
            <Details site={row.site} t={t} locale={locale} />
          </span>
        ) : null}
      </th>
      {row.state === "measured" ? (
        <Cells site={row.site} t={t} locale={locale} />
      ) : (
        <td role="cell" colSpan={COLUMNS.length} className={cellClass}>
          <span className="text-muted-foreground">{t.pending}</span>
        </td>
      )}
    </tr>
  );
}

interface Props {
  s: ComparisonSummary;
  action: (state: CompetitorComparisonState) => Promise<CompetitorComparisonState>;
  manageHref: string;
  locale: Locale;
}

export function ComparisonSection({ s, action, manageHref, locale }: Props) {
  const t = getMessages(locale).competitorComparison;
  const measured = s.capture !== null;
  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border/80 bg-card p-4 shadow-card sm:p-5">
      {s.blocker ? (
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t.needs[s.blocker]}{" "}
          {s.blocker === "no_competitors" ? (
            <Link href={manageHref} className="font-medium underline underline-offset-2">
              {t.needs.manage}
            </Link>
          ) : null}
        </p>
      ) : (
        <ComparisonButton labels={{ idle: measured ? t.button.rerun : t.button.run, pending: t.button.pending }} action={action} />
      )}
      {s.running ? <p className="text-sm">{t.running}</p> : null}
      {s.failure ? <p className="text-sm">{t.lastAttempt(formatDateTime(s.failure.at, locale), t.failure[s.failure.error])}</p> : null}
      {s.unreadable ? (
        <p role="alert" className="text-sm text-destructive">
          {t.unreadable}
        </p>
      ) : null}
      {measured ? (
        <table role="table" aria-label={t.tableLabel} className="block w-full min-w-0 lg:table lg:table-fixed">
          <thead role="rowgroup" className="sr-only lg:not-sr-only lg:table-header-group">
            <tr role="row" className="text-xs text-muted-foreground">
              <th role="columnheader" scope="col" className="w-[23%] pb-2 pr-3 text-left font-medium">
                {t.columns.site}
              </th>
              {COLUMNS.map((column) => (
                <th key={column} role="columnheader" scope="col" className="px-1.5 pb-2 text-center align-bottom font-medium [overflow-wrap:anywhere]">
                  {t.columns[column]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup" className="block divide-y lg:table-row-group">
            {s.rows.map((row) => (
              <Row key={row.key} row={row} t={t} locale={locale} />
            ))}
          </tbody>
        </table>
      ) : s.running ? null : (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      )}
      {s.mixedFieldScope ? <p className="text-sm">{t.mixedScope}</p> : null}
      {s.withoutWebsite.length > 0 ? <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{t.withoutWebsite(s.withoutWebsite.join(", "))}</p> : null}
      {s.capture ? (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {s.capture.finishedAt ? <p>{t.captured(formatDateTime(s.capture.startedAt, locale), formatDateTime(s.capture.finishedAt, locale))}</p> : null}
          <p className="max-w-3xl">{t.context}</p>
          <p>{t.source}</p>
        </div>
      ) : null}
    </div>
  );
}
