import { ChartColumn } from "lucide-react";
import type { ReactNode } from "react";
import { StatusPill } from "@/components/audits/status-ui";
import { ChangeLine, NoticeList } from "@/components/overview/overview-card";
import { RefreshSearchConsoleButton } from "@/components/search-console/refresh-button";
import type { Locale } from "@/i18n/locale";
import { getMessages, type Messages } from "@/i18n/messages";
import type { Tone } from "@/modules/audits/status";
import type { AnalyticsConfig } from "@/modules/analytics/deps";
import type { AnalyticsState, AnalyticsSummary, KeyEventsView } from "@/modules/analytics/summary";
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

function TableFrame({ caption, children, nested = false }: { caption: string; children: ReactNode; nested?: boolean }) {
  // Inside the card (key events, D005 of 008) the table is a plain frame with a caption no larger than its h3.
  return (
    <div className={nested ? "overflow-x-auto rounded-lg border border-border/80" : "overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-card"}>
      <table className="w-full text-sm">
        <caption className={nested ? "px-4 pt-3 pb-2 text-left text-sm font-semibold" : "px-4 pt-4 pb-2 text-left text-base font-semibold"}>{caption}</caption>
        {children}
      </table>
    </div>
  );
}

const METRICS = ["users", "sessions", "views"] as const;
const KEY_FIGURES = ["organic", "total"] as const;

/** Key events (feature 008), inside the card so it also shows without visits (D005). Names are GA4 data: plain text. */
function KeyEventsBlock({ v, t, button }: { v: KeyEventsView; t: Texts; button: string }) {
  const k = t.keyEvents;
  const note = "max-w-3xl text-xs text-muted-foreground";
  return (
    <section aria-labelledby="ga4-key-events" className="flex flex-col gap-3 border-t border-border/60 pt-4">
      <h3 id="ga4-key-events" className="text-sm font-semibold">
        {k.title}
      </h3>
      <p className={note}>{k.scope}</p>
      {v.state === "none_configured" ? (
        <p className="max-w-3xl text-sm text-muted-foreground">{k.noneConfigured(button)}</p>
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {KEY_FIGURES.map((key) => (
              <div key={key} className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3">
                <dt className="text-xs font-medium text-muted-foreground">{k[key].label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{v[key].value}</dd>
                <dd>
                  <ChangeLine change={v[key].change} note={v[key].change === null ? k[key].noPrevious : null} className="text-xs" />
                </dd>
                <dd className="hidden text-xs text-muted-foreground sm:block">{k[key].hint}</dd>
              </div>
            ))}
          </dl>
          {v.allZero ? <p className="max-w-3xl text-sm text-muted-foreground">{k.allZero}</p> : null}
          {v.hasTotal ? <p className={note}>{k.share(v.organicShare)}</p> : null}
          {v.organicMissing ? <p className={note}>{k.organicMissing}</p> : null}
          {v.noPrevious ? <p className={note}>{k.noPrevious}</p> : null}
          {v.byEvent.length > 0 ? (
            <TableFrame caption={k.table.caption} nested>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">
                    {k.table.event}
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium whitespace-nowrap">
                    {k.table.count}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {v.byEvent.map((row, i) => (
                  <tr key={`e${i}`}>
                    {/* Event names have no spaces (envio_formulario_…): break anywhere so the count stays in view at 375 px. */}
                    <td className="px-4 py-2 break-all">{row.event}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.keyEvents}</td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          ) : null}
          {v.allZero ? null : <p className={note}>{k.limitsTotal}</p>}
          {v.byEvent.length > 0 ? <p className={note}>{k.limitsTable}</p> : null}
        </>
      )}
      {v.configured.length > 0 ? (
        <div className="flex max-w-3xl flex-col gap-1.5 text-xs text-muted-foreground">
          <p id="ga4-key-events-configured">{k.configured}</p>
          {/* A list, so the names stay apart when copied or read aloud. */}
          <ul aria-labelledby="ga4-key-events-configured" className="flex flex-wrap gap-1.5">
            {v.configured.map((name, i) => (
              <li key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono break-all text-foreground">
                {name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {v.configuredMore ? <p className={note}>{k.configuredMore}</p> : null}
    </section>
  );
}

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
        {s.keyEvents ? (
          <KeyEventsBlock v={s.keyEvents} t={t} button={t.button.update} />
        ) : hasData || s.state === "empty" ? (
          <p className="max-w-3xl text-sm text-muted-foreground">{canRun ? t.keyEvents.missing(t.button.update) : t.keyEvents.missingNotConfigured}</p>
        ) : null}
        {/* Without visits the tables below are hidden; the notice still covers the key event reports (D006 of 008). */}
        {s.state === "empty" && s.keyEvents && s.quality ? <p className="max-w-3xl text-xs text-muted-foreground">{s.quality}</p> : null}
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
