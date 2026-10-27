import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronRight, CircleAlert, Clock, RefreshCw, TriangleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusPill, toneClasses } from "@/components/audits/status-ui";
import { cn } from "@/lib/utils";
import { DIRECTION_TONE, type Direction } from "@/modules/audits/evolution";
import type { Tone } from "@/modules/audits/status";
import type { Change } from "@/modules/overview";

const CHANGE_ICON: Record<Direction, LucideIcon> = { better: ArrowUpRight, same: ArrowRight, worse: ArrowDownRight };

/** A comparable change (icon + words, never colour alone) or why there is none. */
export function ChangeLine({ change, note, className }: { change: Change | null; note?: string | null; className?: string }) {
  if (change) {
    const Icon = CHANGE_ICON[change.direction];
    return (
      <p className={cn("inline-flex items-center gap-1 text-sm font-medium", toneClasses(DIRECTION_TONE[change.direction]).text, className)}>
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {change.text}
      </p>
    );
  }
  return note ? <p className={cn("text-xs text-muted-foreground", className)}>{note}</p> : null;
}

export interface Notice {
  kind: "running" | "failed" | "stale" | "info";
  text: string;
}

const NOTICE_ICON: Record<Notice["kind"], LucideIcon> = { running: RefreshCw, failed: TriangleAlert, stale: Clock, info: CircleAlert };

/** Extra context about the result: an attempt in progress or failed, old data, missing setup. */
export function NoticeList({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1">
      {notices.map((n) => {
        const Icon = NOTICE_ICON[n.kind];
        return (
          <li key={n.text} className={cn("flex items-start gap-1.5 text-xs", n.kind === "failed" ? toneClasses("fair").text : "text-muted-foreground")}>
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
 * inside it, so `children` must be text only. Status is icon + text, never colour alone.
 */
export function OverviewCard({
  id,
  href,
  icon: Icon,
  title,
  description,
  status,
  headline,
  children,
  notices = [],
  source,
  cta = "Ver informe",
}: {
  id: string;
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  status: { tone: Tone; label: string };
  /** Main value or main state, in large type. */
  headline: ReactNode;
  /** Supporting lines. Text only: the card is already a link. */
  children?: ReactNode;
  notices?: Notice[];
  /** Where the data comes from and when it was measured. */
  source: string;
  cta?: string;
}) {
  return (
    <Link
      href={href}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-summary`}
      className="group relative flex h-full flex-col gap-4 overflow-hidden rounded-2xl border border-border/80 bg-card p-6 text-card-foreground shadow-card transition-[border-color,box-shadow,translate] duration-200 before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-linear-to-r before:from-brand before:via-brand/40 before:to-transparent before:opacity-0 before:transition-opacity hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-card-hover hover:before:opacity-100 focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand ring-1 ring-brand/15">
            <Icon className="size-4" />
          </span>
          <h2 id={`${id}-title`} className="text-sm font-semibold tracking-tight">
            {title}
          </h2>
        </div>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div id={`${id}-summary`} className="flex flex-col gap-2">
        <div className="text-4xl leading-tight font-semibold tracking-tight tabular-nums">{headline}</div>
        {children}
      </div>
      <NoticeList notices={notices} />
      <div className="-mx-6 mt-auto -mb-6 flex items-center justify-between gap-3 border-t border-border/70 bg-muted/50 px-6 py-3.5 text-xs text-muted-foreground">
        <span className="min-w-0">{source}</span>
        <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-brand">
          {cta}
          <ChevronRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
