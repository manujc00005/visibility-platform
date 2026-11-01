import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { StatusPill } from "@/components/audits/status-ui";
import type { Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { GoalView } from "@/modules/goals/summary";

/** One line under the overview header: the commercial goal and whether it is measured (feature 016). */
export function GoalLine({
  view,
  workspaceId,
  locale,
}: {
  view: GoalView;
  workspaceId: string;
  locale: Locale;
}) {
  const t = getMessages(locale).goals.line;
  return (
    <section
      aria-label={t.label}
      className="flex flex-col items-start gap-2 sm:flex-row sm:items-baseline sm:gap-3"
    >
      <StatusPill tone={view.status.tone} className="sm:translate-y-[-1px]">
        {view.status.label}
      </StatusPill>
      <p className="text-sm text-pretty">
        <span
          className={
            view.state === "none" ? "text-muted-foreground" : undefined
          }
        >
          {view.text}
        </span>
        {view.notes.map((note) => (
          <span key={note} className="text-muted-foreground">
            {" "}
            {note}
          </span>
        ))}{" "}
        <Link
          href={`/workspaces/${workspaceId}/edit#goal-title`}
          className="inline-flex items-center gap-0.5 rounded-sm font-medium whitespace-nowrap text-brand hover:underline focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:outline-none"
        >
          {view.state === "none" ? t.define : t.edit}
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      </p>
    </section>
  );
}
