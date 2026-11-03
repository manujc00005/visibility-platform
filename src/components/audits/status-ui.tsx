import { CircleCheck, CircleDashed, CircleX, Lightbulb, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/modules/audits/status";

/**
 * Status primitives for the audit screen. Colour is never the only signal: every tone
 * carries its own icon and a text verdict (WCAG 1.4.1). Class names are literal so
 * Tailwind can see them.
 */
const TONES: Record<Tone, { text: string; soft: string; line: string; accent: string; solid: string; bar: string; icon: LucideIcon }> = {
  good: { text: "text-good", soft: "bg-good-soft", line: "border-good-line", accent: "border-l-good-line", solid: "bg-good text-white", bar: "bg-good-line", icon: CircleCheck },
  fair: { text: "text-fair", soft: "bg-fair-soft", line: "border-fair-line", accent: "border-l-fair-line", solid: "bg-fair text-white", bar: "bg-fair-line", icon: TriangleAlert },
  bad: { text: "text-bad", soft: "bg-bad-soft", line: "border-bad-line", accent: "border-l-bad-line", solid: "bg-bad text-white", bar: "bg-bad-line", icon: CircleX },
  info: { text: "text-info", soft: "bg-info-soft", line: "border-info-line", accent: "border-l-info-line", solid: "bg-info text-white", bar: "bg-info-line", icon: Lightbulb },
  neutral: {
    text: "text-muted-foreground",
    soft: "bg-muted",
    line: "border-border",
    accent: "border-l-muted-foreground/40",
    solid: "bg-muted-foreground text-white",
    bar: "bg-muted-foreground/40",
    icon: CircleDashed,
  },
};

export function toneClasses(tone: Tone) {
  return TONES[tone];
}

export function ToneIcon({ tone, className }: { tone: Tone; className?: string }) {
  const Icon = TONES[tone].icon;
  return <Icon aria-hidden="true" className={cn("shrink-0", TONES[tone].text, className)} />;
}

/**
 * `soft`: the quiet pill next to a metric. `solid`: the verdict of a whole block, filled with
 * the tone's text colour (≥ 4.5:1 with white) so it reads from across the room.
 */
export function StatusPill({
  tone,
  variant = "soft",
  children,
  className,
}: {
  tone: Tone;
  variant?: "soft" | "solid";
  children: ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  const Icon = t.icon;
  if (variant === "solid") {
    return (
      <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", t.solid, className)}>
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
        {children}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        t.soft,
        t.line,
        t.text,
        className,
      )}
    >
      <ToneIcon tone={tone} className="size-3.5" />
      {children}
    </span>
  );
}

/**
 * Classes of a block that wears its verdict: tinted border now, tone bar from `VerdictBar`.
 * Neutral keeps the quiet hairline, so judged and unjudged blocks also differ at a glance.
 */
export function verdictCard(tone: Tone): string {
  return cn("relative overflow-hidden rounded-2xl border bg-card p-5 pt-6 shadow-card", tone === "neutral" ? "border-border/80" : TONES[tone].line);
}

/** The 4 px bar at the top of a verdict block; the block needs `relative overflow-hidden`. */
export function VerdictBar({ tone }: { tone: Tone }) {
  return <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-1", TONES[tone].bar)} />;
}

export function VerdictCard({ tone, className, children, ...rest }: ComponentProps<"div"> & { tone: Tone }) {
  return (
    <div className={cn(verdictCard(tone), className)} {...rest}>
      <VerdictBar tone={tone} />
      {children}
    </div>
  );
}

/** Colour of a headline figure: the tone's text, or the page's ink when nothing is judged. */
export function figureClasses(tone: Tone): string {
  return tone === "neutral" ? "" : TONES[tone].text;
}

/** A list row or tile with the verdict as a 4 px left accent. */
export function accentRow(tone: Tone): string {
  return cn("border-l-4", TONES[tone].accent);
}

/** A measured value with its verdict and the "good" reference, coloured by quality. */
export function MetricTile({
  label,
  value,
  tone,
  verdict,
  hint,
}: {
  label: string;
  value: string;
  tone: Tone;
  verdict: string;
  hint?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-lg border border-l-4 bg-card p-3", toneClasses(tone).accent)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
      <StatusPill tone={tone}>{verdict}</StatusPill>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
