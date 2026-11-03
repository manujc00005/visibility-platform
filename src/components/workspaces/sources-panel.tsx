import Link from "next/link";
import { StatusPill } from "@/components/audits/status-ui";
import type { Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { SourceRow } from "@/modules/sources/summary";
import { displayDate } from "@/modules/workspaces/presentation";

/** Operator table of the company's data sources (feature 015). Server component; rows are pre-computed. */
export function SourcesPanel({ rows, locale }: { rows: SourceRow[]; locale: Locale }) {
  const t = getMessages(locale).sources;
  return (
    <section aria-labelledby="sources-title" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="sources-title" className="text-lg font-semibold tracking-tight">
          {t.title}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{t.description}</p>
      </div>
      {/* `relative`: the sr-only heading inside the table is absolutely positioned and would otherwise widen the page. */}
      <div className="relative overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-card">
        <table className="w-full text-sm">
          <caption className="sr-only">{t.title}</caption>
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-medium sm:px-4">
                {t.columns.source}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t.columns.status}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t.columns.target}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t.columns.lastGood}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t.columns.note}
              </th>
              <th scope="col" className="px-3 py-2 font-medium sm:px-4">
                <span className="sr-only">{t.columns.open}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y align-top">
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap sm:px-4">
                  {row.name}
                </th>
                <td className="px-3 py-2">
                  <StatusPill tone={row.status.tone} variant={row.status.tone === "neutral" ? "soft" : "solid"}>
                    {row.status.label}
                  </StatusPill>
                </td>
                {/* Properties and site URLs are data from the providers: plain text, never links. */}
                <td className="max-w-[14rem] px-3 py-2 font-mono text-xs break-all">{row.target ?? "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{row.lastGood ? displayDate(row.lastGood, locale) : t.never}</td>
                <td className="max-w-md min-w-[12rem] px-3 py-2 text-muted-foreground">{row.note ?? "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap sm:px-4">
                  <Link href={row.action.href} className="font-medium text-brand underline underline-offset-4">
                    {row.action.label}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
