import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusPill, ToneIcon } from "@/components/audits/status-ui";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { Tone } from "@/modules/audits/status";
import type { OpportunityList, Priority } from "@/modules/overview";
import { displayDate } from "@/modules/workspaces/presentation";

const PRIORITY_TONE: Record<Priority, Tone> = { high: "bad", medium: "fair", low: "info" };

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed bg-card/60 p-6">
      <p className="font-medium">{title}</p>
      <p className="max-w-2xl text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

/** Spanish lowercases after a colon; an acronym at the start ("HTTPS…") keeps its case. */
function afterColon(title: string): string {
  return title.length > 1 && title[1] === title[1].toLowerCase() ? title[0].toLowerCase() + title.slice(1) : title;
}

/**
 * The first opportunity in one line under the header, linked to its card further down.
 * Renders nothing without opportunities: the section below already explains why.
 */
export function OpportunityLead({ list, locale }: { list: OpportunityList; locale: Locale }) {
  const first = list.items[0];
  if (!first) return null;
  const m = getMessages(locale);
  const t = m.overview.lead;
  const rest = list.items.length - 1;
  return (
    <section aria-label={t.label} className="flex flex-col items-start gap-2 sm:flex-row sm:items-baseline sm:gap-3">
      <StatusPill tone={PRIORITY_TONE[first.priority]} className="sm:translate-y-[-1px]">
        {m.overview.priority[first.priority]}
      </StatusPill>
      <p className="text-base text-pretty">
        <span className="text-muted-foreground">{t.first} </span>
        <span className="font-semibold" lang={first.original ? DEFAULT_LOCALE : undefined}>
          {afterColon(first.title)}
        </span>
        {rest > 0 ? <span className="text-muted-foreground"> {t.more(rest)}</span> : null}
        {". "}
        <a
          href={`#opportunity-${first.kind}`}
          className="inline-flex items-center gap-0.5 rounded-sm font-medium whitespace-nowrap text-brand hover:underline focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:outline-none"
        >
          {t.link}
          <ChevronRight aria-hidden="true" className="size-4" />
        </a>
      </p>
    </section>
  );
}

/**
 * "Tus próximas oportunidades". Never fills the list: zero items is a valid answer, with
 * one of three messages depending on how much was measured (AC-006). Stored evidence lines
 * keep `lang="es"`; the page renders the single original-language notice (`overviewOriginalText`).
 */
export function Opportunities({
  workspaceId,
  list,
  locale,
}: {
  workspaceId: string;
  list: OpportunityList;
  locale: Locale;
}) {
  const m = getMessages(locale);
  const t = m.overview.opportunities;
  return (
    <section aria-labelledby="opportunities-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="opportunities-title" className="text-lg font-semibold tracking-tight">
          {t.title}
        </h2>
        <p className="text-sm text-muted-foreground">{t.description}</p>
      </div>

      {list.evidence === "none" ? (
        <Empty title={t.noneTitle}>{t.noneBody}</Empty>
      ) : (
        <>
          {list.evidence === "partial" ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-border/80 bg-muted/60 px-4 py-3 text-sm">
              <ToneIcon tone="neutral" className="mt-0.5 size-4" />
              <div className="flex flex-col gap-0.5">
                <p className="font-medium">{t.partialTitle}</p>
                <ul className="text-muted-foreground">
                  {list.pending.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {list.items.length === 0 ? (
            list.evidence === "complete" ? (
              <Empty title={t.completeEmptyTitle}>{t.completeEmptyBody}</Empty>
            ) : (
              <p className="text-sm text-muted-foreground">{t.partialEmpty}</p>
            )
          ) : (
            <ol className="flex flex-col gap-3">
              {list.items.map((o, i) => (
                <li key={o.kind}>
                  <article aria-labelledby={`opportunity-${o.kind}`} className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card p-6 shadow-card">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex size-6 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand tabular-nums">{i + 1}</span>
                      <StatusPill tone={PRIORITY_TONE[o.priority]}>{m.overview.priority[o.priority]}</StatusPill>
                      {o.covers > 1 ? <span className="text-xs text-muted-foreground">{t.covers(o.covers)}</span> : null}
                    </div>
                    {/* Focusable by script only: the lead's link moves focus here, not just the scroll. */}
                    <h3 id={`opportunity-${o.kind}`} tabIndex={-1} className="text-base font-semibold tracking-tight outline-none">
                      {o.title}
                    </h3>
                    <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs font-medium text-muted-foreground">{t.what}</dt>
                        <dd className="break-words" lang={o.original ? DEFAULT_LOCALE : undefined}>
                          {o.problem}
                        </dd>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs font-medium text-muted-foreground">{t.why}</dt>
                        <dd>{o.why}</dd>
                      </div>
                      {/* Who first, then what that person has to do: the owner may not be the one doing it (023). */}
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs font-medium text-muted-foreground">{t.who}</dt>
                        <dd>{t.whoText}</dd>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs font-medium text-muted-foreground">{t.action}</dt>
                        <dd lang={o.original ? DEFAULT_LOCALE : undefined}>{o.action}</dd>
                      </div>
                    </dl>
                    <div className="rounded-lg bg-muted/60 p-3">
                      <p className="text-xs font-medium text-muted-foreground">{t.evidence}</p>
                      <ul className="mt-1 flex flex-col gap-0.5 text-xs">
                        {o.evidence.map((line, index) => (
                          <li key={line} className="break-words" lang={index >= o.storedEvidenceFrom ? DEFAULT_LOCALE : undefined}>
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {o.sourceLabel} · {displayDate(o.measuredAt, locale)}
                      </span>
                      {/* Reserved: «Pedir propuesta de mejora» goes here, next to the detail link, once Módulo F exists (doc 03). Not rendered before. */}
                      <Link
                        href={`/workspaces/${workspaceId}${o.href}`}
                        className="inline-flex items-center gap-0.5 rounded-sm font-medium text-brand hover:underline focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:outline-none"
                      >
                        {t.detail}
                        <ChevronRight aria-hidden="true" className="size-4" />
                      </Link>
                    </div>
                  </article>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
