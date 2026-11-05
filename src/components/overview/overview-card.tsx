import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  CircleAlert,
  Clock,
  RefreshCw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusPill, toneClasses } from "@/components/audits/status-ui";
import { cn } from "@/lib/utils";
import { DIRECTION_TONE, type Direction } from "@/modules/audits/evolution";
import type { Tone } from "@/modules/audits/status";
import type { Change } from "@/modules/overview";

const CHANGE_ICON: Record<Direction, LucideIcon> = {
  better: ArrowUpRight,
  same: ArrowRight,
  worse: ArrowDownRight,
};

/**
 * A comparable change (icon + words, never colour alone) or why there is none. With `labels`
 * it becomes a chip that leads with the direction word ("Mejora · 2 problemas menos…"), so a
 * figure inside the sentence is never mistaken for a count of problems.
 */
export function ChangeLine({
  change,
  note,
  labels,
  className,
}: {
  change: Change | null;
  note?: string | null;
  /** Direction words, one per direction; when given the change renders as a chip. */
  labels?: Record<Direction, string>;
  className?: string;
}) {
  if (change) {
    const Icon = CHANGE_ICON[change.direction];
    const tone = toneClasses(DIRECTION_TONE[change.direction]);
    if (labels) {
      return (
        <p
          className={cn(
            "inline-flex w-fit items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm",
            tone.soft,
            tone.line,
            tone.text,
            className,
          )}
        >
          <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="font-semibold">{labels[change.direction]}</strong>
            <span aria-hidden="true"> · </span>
            <span className="sr-only">: </span>
            {change.text}
          </span>
        </p>
      );
    }
    return (
      <p
        className={cn(
          "inline-flex items-center gap-1 text-sm font-medium",
          tone.text,
          className,
        )}
      >
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {change.text}
      </p>
    );
  }
  return note ? (
    <p className={cn("text-xs text-muted-foreground", className)}>{note}</p>
  ) : null;
}

export interface Notice {
  kind: "running" | "failed" | "stale" | "info";
  text: string;
}

const NOTICE_ICON: Record<Notice["kind"], LucideIcon> = {
  running: RefreshCw,
  failed: TriangleAlert,
  stale: Clock,
  info: CircleAlert,
};

/** Extra context about the result: an attempt in progress or failed, old data, missing setup. */
export function NoticeList({
  notices,
  id,
}: {
  notices: Notice[];
  id?: string;
}) {
  if (notices.length === 0) return null;
  return (
    <ul id={id} className="flex flex-col gap-1">
      {notices.map((n) => {
        const Icon = NOTICE_ICON[n.kind];
        return (
          <li
            key={n.text}
            className={cn(
              "flex items-start gap-1.5 text-xs",
              n.kind === "failed"
                ? toneClasses("fair").text
                : "text-muted-foreground",
            )}
          >
            <Icon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            {n.text}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One block of the overview. The whole card is a single link (FR-003): no buttons or links
 * inside it, so `children` must be text only. Status is icon + text, never colour alone, but
 * the whole card wears its verdict: a tone bar on top, a tinted border, a solid pill and the
 * figure in the tone's colour, so good and bad news look different from across the room.
 */
export function OverviewCard({
  id,
  href,
  icon: Icon,
  title,
  status,
  headline,
  headlineTone = status.tone,
  children,
  notices = [],
  source,
  cta,
}: {
  id: string;
  href: string;
  icon: LucideIcon;
  title: string;
  status: { tone: Tone; label: string };
  /** Main value or main state, in large type. */
  headline: ReactNode;
  /** Tone of the figure when it is not the one that sets the verdict (lab score under a real-visitor verdict). */
  headlineTone?: Tone;
  /** Supporting lines. Text only: the card is already a link. */
  children?: ReactNode;
  notices?: Notice[];
  /** Where the data comes from and when it was measured. */
  source: string;
  cta: string;
}) {
  const tone = toneClasses(status.tone);
  const judged = status.tone !== "neutral";
  const figure = toneClasses(headlineTone);
  return (
    <Link
      href={href}
      aria-labelledby={`${id}-title`}
      // Verdict first, then the figure, the notices and where the data comes from: all of it is text a sighted owner reads.
      aria-describedby={[
        `${id}-status`,
        `${id}-summary`,
        notices.length > 0 ? `${id}-notices` : null,
        `${id}-source`,
      ]
        .filter(Boolean)
        .join(" ")}
      className={cn(
        "group relative flex h-full flex-col gap-4 overflow-hidden rounded-2xl border bg-card p-6 pt-7 text-card-foreground shadow-card transition-[border-color,box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        judged ? tone.line : "border-border/80 hover:border-brand/30",
      )}
    >
      {/* The verdict's bar: always on, in the tone's line colour. A neutral card keeps a quiet hairline. */}
      <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-1", tone.bar)} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl ring-1",
              judged ? cn(tone.soft, tone.text, "ring-current/15") : "bg-brand-soft text-brand ring-brand/15",
            )}
          >
            <Icon className="size-4" />
          </span>
          <h2
            id={`${id}-title`}
            className="text-sm font-semibold tracking-tight"
          >
            {title}
          </h2>
        </div>
        <span id={`${id}-status`} className="contents">
          <StatusPill tone={status.tone} variant={judged ? "solid" : "soft"}>
            {status.label}
          </StatusPill>
        </span>
      </div>
      <div id={`${id}-summary`} className="flex flex-col gap-2">
        <div className={cn("text-5xl leading-none font-semibold tracking-tight tabular-nums", headlineTone !== "neutral" && figure.text)}>
          {headline}
        </div>
        {children}
      </div>
      <NoticeList notices={notices} id={`${id}-notices`} />
      <div className="-mx-6 mt-auto -mb-6 flex items-center justify-between gap-3 border-t border-border/70 bg-muted/50 px-6 py-3.5 text-xs text-muted-foreground">
        <span id={`${id}-source`} className="min-w-0">
          {source}
        </span>
        <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-brand">
          {cta}
          <ChevronRight
            aria-hidden="true"
            className="size-4 transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </Link>
  );
}
