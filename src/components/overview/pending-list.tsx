import { CircleDashed } from "lucide-react";
import type { Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { PendingRow } from "@/modules/overview";

/**
 * Areas without a result (feature 023): one compact row each instead of a card. Text only, no
 * links: there is no report behind them and setting them up is the operator's work.
 */
export function PendingList({ rows, locale }: { rows: PendingRow[]; locale: Locale }) {
  if (rows.length === 0) return null;
  const t = getMessages(locale).overview.pending;
  return (
    <section aria-labelledby="pending-title" className="flex flex-col gap-2">
      <h2 id="pending-title" className="text-sm font-semibold tracking-tight text-muted-foreground">
        {t.title}
      </h2>
      {/* `role="list"`: WebKit drops list semantics from a list without bullets. */}
      <ul role="list" className="flex flex-col divide-y divide-border/70 rounded-xl border border-border/80 bg-card/60">
        {rows.map((row) => (
          <li key={row.area} className="flex items-start gap-2.5 px-4 py-3 text-sm">
            <CircleDashed aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p>
              <span className="font-medium">{row.title}</span> <span className="text-muted-foreground">{row.reason}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
