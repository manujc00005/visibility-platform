import { ChartColumn } from "lucide-react";
import type { ReactNode } from "react";
import { StatusPill } from "@/components/audits/status-ui";
import { ChangeLine, NoticeList } from "@/components/overview/overview-card";
import { RefreshSearchConsoleButton } from "@/components/search-console/refresh-button";
import type { Locale } from "@/i18n/locale";
import { getMessages, type Messages } from "@/i18n/messages";
import type { Tone } from "@/modules/audits/status";
import type { AnalyticsConfig } from "@/modules/analytics/deps";
import type { AnalyticsState, AnalyticsSummary } from "@/modules/analytics/summary";
import { displayDay } from "@/modules/search-console/summary";
import { displayDate } from "@/modules/workspaces/presentation";
import type { RefreshAnalyticsState } from "@/app/workspaces/[id]/seo/actions";

type Texts = Messages["analytics"];

const STATUS_TONE: Record<AnalyticsState, Tone> = {
  ok: "good",
  no_data: "neutral",
  empty: "neutral",
  error: "bad",
  not_configured: "neutral",
  invalid_config: "bad",
};

function Setup({ config, t }: { config: AnalyticsConfig; t: Texts }) {
  return (
    <ol className="flex max-w-3xl list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
      {config.state !== "ready" ? (
        <li>
          {t.setup.keyBefore}
          <code className="font-mono text-foreground">GSC_SERVICE_ACCOUNT_JSON</code>
          {t.setup.keyAfter}
        </li>
      ) : null}
      <li>{t.setup.apis}</li>
      <li>
        {t.setup.addUserBefore}
        {config.state === "ready" ? <code className="font-mono break-all text-foreground">{config.clientEmail}</code> : t.setup.addUserFallback}
        {t.setup.addUserAfter}
      </li>
      <li>{t.setup.run(t.button.fetch)}</li>
    </ol>
  );
}

const cell = "px-3 py-2 text-right tabular-nums";

function TableFrame({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-card">
      <table className="w-full text-sm">
        <caption className="px-4 pt-4 pb-2 text-left text-base font-semibold">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

const METRICS = ["users", "sessions", "views"] as const;

export function AnalyticsSection({
  s,
  config,
  action,
  locale,
}: {
  s: AnalyticsSummary;
  config: AnalyticsConfig;
  action: (state: RefreshAnalyticsState) => Promise<RefreshAnalyticsState>;
  locale: Locale;
}) {
  const t = getMessages(locale).analytics;
  // Without a usable credential the action calls nothing, so the button is only offered when ready (D007).
  const canRun = config.state === "ready";
  const hasData = s.state === "ok";
  const notices =
    (hasData || s.state === "empty") && s.lastFailure
      ? [{ kind: "failed" as const, text: t.failures.lastAttempt(displayDate(s.lastFailure.at, locale), s.lastFailure.text) }]
      : [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand ring-1 ring-brand/15">
              <ChartColumn className="size-4" />
            </span>
            <span className="text-sm font-medium">{t.name}</span>
            <StatusPill tone={STATUS_TONE[s.state]}>{t.status[s.state]}</StatusPill>
          </div>
          {canRun ? (
            <RefreshSearchConsoleButton labels={{ idle: hasData || s.state === "empty" ? t.button.update : t.button.fetch, pending: t.button.pending }} action={action} />
          ) : null}
        </div>

        {s.metrics ? (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {METRICS.map((key) => (
              <div key={key} className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3">
                <dt className="text-xs font-medium text-muted-foreground">{t.metrics[key].label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{s.metrics![key].value}</dd>
                <dd>
                  <ChangeLine change={s.metrics![key].change} note={s.metrics![key].previous === null ? t.metrics.noPrevious : null} className="text-xs" />
                </dd>
                <dd className="hidden text-xs text-muted-foreground sm:block">{t.metrics[key].hint}</dd>
              </div>
            ))}
          </dl>
        ) : s.reason ? (
          <p className="max-w-3xl text-sm text-muted-foreground">{s.reason}</p>
        ) : null}
        {s.state === "not_configured" || s.state === "invalid_config" || s.state === "error" || s.configWarning ? <Setup config={config} t={t} /> : null}
        {s.configWarning ? <p className="max-w-3xl text-sm text-muted-foreground">{s.configWarning}</p> : null}
        <NoticeList notices={notices} />
        {s.property && s.period && s.previousPeriod && s.capturedAt ? (
          <p className="text-xs text-muted-foreground">
            {t.source.prefix}
            {/* The property name is the owner's own text from GA4: plain text, never markup (B08b). */}
            <span className="break-all">{s.propertyName ? `${s.propertyName} (${s.property})` : s.property}</span>
            {t.source.period(
              displayDay(s.period.start, locale),
              displayDay(s.period.end, locale),
              displayDay(s.previousPeriod.start, locale),
              displayDay(s.previousPeriod.end, locale),
              displayDate(s.capturedAt, locale),
            )}
          </p>
        ) : null}
      </div>

      {hasData ? (
        <>
          {s.channels.length > 0 ? (
            <TableFrame caption={t.tables.channels}>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">
                    {t.tables.channel}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t.tables.sessions}
                  </th>
                  <th scope="col" className="hidden px-4 py-2 text-left font-medium sm:table-cell">
                    {t.tables.change}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {s.channels.map((row) => (
                  <tr key={row.channel}>
                    <td className="px-4 py-2 break-words">
                      {row.channel}
                      <div className="sm:hidden">
                        <ChangeLine change={row.change} className="text-xs" />
                      </div>
                    </td>
                    <td className={cell}>{row.sessions}</td>
                    <td className="hidden px-4 py-2 sm:table-cell">
                      <ChangeLine change={row.change} className="text-xs" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          ) : (
            <p className="text-sm text-muted-foreground">{t.noChannels}</p>
          )}
          {s.pages.length > 0 ? (
            <TableFrame caption={t.tables.pages}>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">
                    {t.tables.page}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t.tables.views}
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    {t.tables.users}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {s.pages.map((row, i) => (
                  <tr key={`p${i}`}>
                    {/* Page paths are data from GA4: plain text, never links (B08b). */}
                    <td className="max-w-[16rem] px-4 py-2 break-words sm:max-w-md">{row.page}</td>
                    <td className={cell}>{row.views}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.users}</td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          ) : (
            <p className="text-sm text-muted-foreground">{t.noPages}</p>
          )}
          {s.quality ? <p className="max-w-3xl text-xs text-muted-foreground">{s.quality}</p> : null}
          <p className="max-w-3xl text-xs text-muted-foreground">{t.note}</p>
        </>
      ) : null}
    </div>
  );
}
