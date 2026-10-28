import { Search } from "lucide-react";
import { StatusPill } from "@/components/audits/status-ui";
import { ChangeLine, NoticeList } from "@/components/overview/overview-card";
import { RefreshSearchConsoleButton } from "@/components/search-console/refresh-button";
import { formatNumber } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import { getMessages, type Messages } from "@/i18n/messages";
import type { Tone } from "@/modules/audits/status";
import type { BingWebmasterConfig } from "@/modules/bing-webmaster/deps";
import type { BingWebmasterState, BingWebmasterSummary } from "@/modules/bing-webmaster/summary";
import { displayDay } from "@/modules/search-console/summary";
import { displayDate } from "@/modules/workspaces/presentation";
import type { RefreshBingWebmasterState } from "@/app/workspaces/[id]/seo/actions";

type Texts = Messages["bingWebmaster"];
type TableTexts = Messages["searchConsole"];

const STATUS_TONE: Record<BingWebmasterState, Tone> = {
  ok: "good",
  no_data: "neutral",
  processing: "neutral",
  error: "bad",
  not_configured: "neutral",
  invalid_config: "bad",
};

function Setup({ config, t }: { config: BingWebmasterConfig; t: Texts }) {
  return (
    <ol className="flex max-w-3xl list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
      <li>{t.setup.verify}</li>
      {config.state !== "ready" ? (
        <li>
          {t.setup.keyBefore}
          <code className="font-mono text-foreground">BING_WEBMASTER_API_KEY</code>
          {t.setup.keyAfter}
        </li>
      ) : null}
      <li>{t.setup.run(t.button.fetch)}</li>
    </ol>
  );
}

type Row = { key: string; label: string; clicks: number; impressions: number; ctr: number; position: number | null };

/** Same table as Search Console's, but Bing may have no position for a row (D008). */
function Table({ caption, head, rows, t, locale }: { caption: string; head: string; rows: Row[]; t: TableTexts; locale: Locale }) {
  const num = (n: number) => formatNumber(Math.round(n), locale, { maximumFractionDigits: 0 });
  const pos = (n: number) => formatNumber(n, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pct = (r: number) => t.percent(pos(r * 100));
  return (
    <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-card">
      <table className="w-full text-sm">
        <caption className="px-4 pt-4 pb-2 text-left text-base font-semibold">{caption}</caption>
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="px-4 py-2 font-medium">
              {head}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t.tables.clicks}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t.tables.impressions}
            </th>
            <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">
              {t.tables.ctr}
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              {t.tables.position}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.key}>
              {/* Search terms and URLs are data from Bing: plain text, never links (B08b). */}
              <td className="max-w-[16rem] px-4 py-2 break-words sm:max-w-md">{r.label}</td>
              <td className="px-3 py-2 text-right tabular-nums">{num(r.clicks)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{num(r.impressions)}</td>
              <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{pct(r.ctr)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{r.position === null ? "—" : pos(r.position)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const METRICS = ["clicks", "impressions", "ctr"] as const;

export function BingWebmasterSection({
  s,
  config,
  action,
  locale,
}: {
  s: BingWebmasterSummary;
  config: BingWebmasterConfig;
  action: (state: RefreshBingWebmasterState) => Promise<RefreshBingWebmasterState>;
  locale: Locale;
}) {
  const messages = getMessages(locale);
  const t = messages.bingWebmaster;
  const shared = messages.searchConsole;
  // Without a usable key the action calls nothing, so the button is only offered when ready (D009).
  const canRun = config.state === "ready";
  const hasData = s.state === "ok";
  const notices =
    (hasData || s.state === "processing") && s.lastFailure
      ? [{ kind: "failed" as const, text: t.failures.lastAttempt(displayDate(s.lastFailure.at, locale), s.lastFailure.text) }]
      : [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand ring-1 ring-brand/15">
              <Search className="size-4" />
            </span>
            <span className="text-sm font-medium">{t.name}</span>
            <StatusPill tone={STATUS_TONE[s.state]}>{t.status[s.state]}</StatusPill>
          </div>
          {canRun ? (
            <RefreshSearchConsoleButton labels={{ idle: hasData || s.state === "processing" ? t.button.update : t.button.fetch, pending: t.button.pending }} action={action} />
          ) : null}
        </div>

        {s.metrics && s.period ? (
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
        {s.siteUrl && s.capturedAt ? (
          <p className="text-xs text-muted-foreground">
            {t.source.prefix}
            <span className="font-mono break-all">{s.siteUrl}</span>
            {s.period && s.previousPeriod
              ? t.source.period(
                  displayDay(s.period.start, locale),
                  displayDay(s.period.end, locale),
                  displayDay(s.previousPeriod.start, locale),
                  displayDay(s.previousPeriod.end, locale),
                  displayDate(s.capturedAt, locale),
                )
              : t.source.captured(displayDate(s.capturedAt, locale))}
          </p>
        ) : null}
      </div>

      {hasData ? (
        <>
          {s.queries.length > 0 ? (
            <Table
              caption={t.tables.queries}
              head={shared.tables.query}
              rows={s.queries.map((q, i) => ({ key: `q${i}`, label: q.query, ...q }))}
              t={shared}
              locale={locale}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t.noQueries}</p>
          )}
          {s.pages.length > 0 ? (
            <Table caption={t.tables.pages} head={shared.tables.page} rows={s.pages.map((p, i) => ({ key: `p${i}`, label: p.page, ...p }))} t={shared} locale={locale} />
          ) : (
            <p className="text-sm text-muted-foreground">{t.noPages}</p>
          )}
          {s.rows ? <p className="max-w-3xl text-xs text-muted-foreground">{t.tables.window(displayDay(s.rows.start, locale), displayDay(s.rows.end, locale))}</p> : null}
          <p className="max-w-3xl text-xs text-muted-foreground">{t.note}</p>
        </>
      ) : null}
    </div>
  );
}
