import { Search } from "lucide-react";
import { StatusPill } from "@/components/audits/status-ui";
import { ChangeLine, NoticeList } from "@/components/overview/overview-card";
import { formatNumber } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import { getMessages, type Messages } from "@/i18n/messages";
import type { Tone } from "@/modules/audits/status";
import type { Change } from "@/modules/overview/types";
import type { SearchConsoleConfig } from "@/modules/search-console/deps";
import { displayDay, type SearchConsoleState, type SearchConsoleSummary, type SegmentsView } from "@/modules/search-console/summary";
import { displayDate } from "@/modules/workspaces/presentation";
import type { RefreshSearchConsoleState } from "@/app/workspaces/[id]/seo/actions";
import { RefreshSearchConsoleButton } from "./refresh-button";

type Texts = Messages["searchConsole"];

const STATUS_TONE: Record<SearchConsoleState, Tone> = {
  ok: "good",
  no_data: "neutral",
  error: "bad",
  not_configured: "neutral",
  invalid_config: "bad",
};

function Setup({ config, t }: { config: SearchConsoleConfig; t: Texts }) {
  return (
    <ol className="flex max-w-3xl list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
      {config.state !== "ready" ? (
        <li>
          {t.setup.createKeyBefore}
          <code className="font-mono text-foreground">GSC_SERVICE_ACCOUNT_JSON</code>
          {t.setup.createKeyAfter}
        </li>
      ) : null}
      <li>
        {t.setup.addUserBefore}
        {config.state === "ready" ? <span className="font-mono text-foreground break-all">{config.clientEmail}</span> : t.setup.addUserFallback}
        {t.setup.addUserAfter}
      </li>
      <li>{t.setup.run(t.button.fetch)}</li>
    </ol>
  );
}

type Row = { key: string; label: string; badge?: string; change?: Change | null; clicks: number; impressions: number; ctr: number; position: number };

function Table({ caption, head, rows, t, locale }: { caption: string; head: string; rows: Row[]; t: Texts; locale: Locale }) {
  const num = (n: number) => formatNumber(Math.round(n), locale, { maximumFractionDigits: 0 });
  const pos = (n: number) => formatNumber(n, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pct = (r: number) => t.percent(pos(r * 100));
  return (
    <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-card">
      <table className="w-full text-sm">
        <caption className="px-3 pt-4 pb-2 text-left text-base font-semibold sm:px-4">{caption}</caption>
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium sm:px-4">
              {head}
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium sm:px-3">
              {t.tables.clicks}
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium sm:px-3">
              {t.tables.impressions}
            </th>
            <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">
              {t.tables.ctr}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium sm:px-4">
              {t.tables.position}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.key}>
              {/* Search terms and URLs are data from Google: plain text, never links (B08b). */}
              <td className="max-w-[16rem] px-3 py-2 break-words sm:max-w-md sm:px-4">
                {r.label}
                {/* A word, not only a colour, so it reads without styles (D005 of 007). The space keeps
                    "opiniones" and "marca" apart when copied or read aloud. */}
                {r.badge ? " " : null}
                {r.badge ? (
                  <span className="ml-1 inline-block rounded-full bg-brand-soft px-1.5 py-0.5 align-middle text-[11px] font-medium text-brand ring-1 ring-brand/15">
                    {r.badge}
                  </span>
                ) : null}
                {/* On phones the change goes here: under the position it pushed that column out of view (D004 of 009). */}
                {r.change ? (
                  <div className="sm:hidden">
                    {/* Under the search it needs to say it is about the position, not about the search. */}
                    <span className="sr-only">{t.tables.position}: </span>
                    <ChangeLine change={r.change} className="text-xs font-normal" />
                  </div>
                ) : null}
              </td>
              <td className="px-2 py-2 text-right tabular-nums sm:px-3">{num(r.clicks)}</td>
              <td className="px-2 py-2 text-right tabular-nums sm:px-3">{num(r.impressions)}</td>
              <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{pct(r.ctr)}</td>
              <td className="px-3 py-2 text-right tabular-nums sm:px-4">
                {pos(r.position)}
                {r.change ? (
                  <div className="hidden justify-end sm:flex">
                    <ChangeLine change={r.change} className="text-xs font-normal" />
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const METRICS = ["clicks", "impressions", "ctr", "position"] as const;
const BLOCKS = ["branded", "nonBranded"] as const;

/** Brand split of the capture (feature 007). Terms are company data: plain text, never markup. */
function Segments({ v, t }: { v: SegmentsView; t: Texts }) {
  return (
    <section aria-labelledby="gsc-segments" className="flex flex-col gap-3 border-t border-border/60 pt-4">
      <h3 id="gsc-segments" className="text-sm font-semibold">
        {t.segments.title}
      </h3>
      {/* Without impressions the blocks stay, without shares, so a drop to zero still shows its change. */}
      {v.empty ? <p className="text-sm text-muted-foreground">{t.segments.empty}</p> : null}
      <dl className="grid gap-3 sm:grid-cols-2">
        {BLOCKS.map((key) => (
          <div key={key} className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3">
            <dt className="text-xs font-medium text-muted-foreground">{t.segments[key].label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{v[key].clicks}</dd>
            <dd className="text-sm tabular-nums">{v[key].impressions}</dd>
            {v.empty ? null : (
              <dd className="text-xs text-muted-foreground">
                {t.segments.clicksShare(v[key].clicksShare)} · {t.segments.impressionsShare(v[key].impressionsShare)}
              </dd>
            )}
            <dd>
              <ChangeLine change={v[key].change} note={v[key].change === null ? t.metrics.noPrevious : null} className="text-xs" />
            </dd>
            <dd className="hidden text-xs text-muted-foreground sm:block">{t.segments[key].hint}</dd>
          </div>
        ))}
      </dl>
      <p className="max-w-3xl text-xs text-muted-foreground">
        {t.segments.hidden(v.hidden.clicks, v.hidden.impressions)} {t.segments.previousHidden(v.previousHidden.clicks, v.previousHidden.impressions)}
      </p>
      {v.mismatch ? <p className="max-w-3xl text-xs text-muted-foreground">{t.segments.mismatch}</p> : null}
      {v.truncated ? <p className="max-w-3xl text-xs text-muted-foreground">{t.segments.truncated}</p> : null}
      <p className="flex max-w-3xl flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span>{t.segments.terms}</span>
        {v.terms.map((term, i) => (
          <span key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono break-all text-foreground">
            {term}
          </span>
        ))}
      </p>
    </section>
  );
}

export function SearchConsoleSection({
  s,
  config,
  action,
  locale,
}: {
  s: SearchConsoleSummary;
  config: SearchConsoleConfig;
  action: (state: RefreshSearchConsoleState) => Promise<RefreshSearchConsoleState>;
  locale: Locale;
}) {
  const t = getMessages(locale).searchConsole;
  const canRun = config.state === "ready";
  const notices = [
    ...(s.state === "ok" && s.lastFailure ? [{ kind: "failed" as const, text: t.failures.lastAttempt(displayDate(s.lastFailure.at, locale), s.lastFailure.text) }] : []),
    // Stored figures stay, but without a usable credential there is no button to refresh them.
    ...(s.state === "ok" && config.state === "invalid" ? [{ kind: "info" as const, text: t.reasons.invalidConfig[config.reason] }] : []),
  ];
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
            <RefreshSearchConsoleButton labels={{ idle: s.state === "ok" ? t.button.update : t.button.fetch, pending: t.button.pending }} action={action} />
          ) : null}
        </div>

        {s.metrics && s.period ? (
          <>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
            {s.segments ? (
              <Segments v={s.segments} t={t} />
            ) : (
              <p className="max-w-3xl text-sm text-muted-foreground">{canRun ? t.segments.missing(t.button.update) : t.segments.missingNotConfigured}</p>
            )}
            <NoticeList notices={notices} />
            <p className="text-xs text-muted-foreground">
              {t.source.prefix}
              <span className="font-mono break-all">{s.property}</span>
              {t.source.period(displayDay(s.period.start, locale), displayDay(s.period.end, locale), s.capturedAt ? displayDate(s.capturedAt, locale) : "")}
            </p>
          </>
        ) : (
          <>
            {s.reason ? <p className="max-w-3xl text-sm text-muted-foreground">{s.reason}</p> : null}
            {s.state === "not_configured" || s.state === "invalid_config" || s.state === "error" ? <Setup config={config} t={t} /> : null}
          </>
        )}
      </div>

      {s.metrics ? (
        <>
          {s.queries.length > 0 ? (
            <Table
              caption={t.tables.queries}
              head={t.tables.query}
              rows={s.queries.map((q, i) => ({ key: `q${i}`, label: q.query, badge: q.branded ? t.segments.badge : undefined, change: q.positionChange, ...q }))}
              t={t}
              locale={locale}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t.noQueries}</p>
          )}
          {s.queries.length > 0 && s.queries.every((q) => q.positionChange === null) ? (
            <p className="max-w-3xl text-sm text-muted-foreground">{canRun ? t.positionChanges.missing(t.button.update) : t.positionChanges.missingNotConfigured}</p>
          ) : null}
          {s.pages.length > 0 ? (
            <Table caption={t.tables.pages} head={t.tables.page} rows={s.pages.map((p, i) => ({ key: `p${i}`, label: p.page, ...p }))} t={t} locale={locale} />
          ) : null}
          <p className="max-w-3xl text-xs text-muted-foreground">{t.privacyNote}</p>
        </>
      ) : null}
    </div>
  );
}
