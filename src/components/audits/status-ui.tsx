import { CircleCheck, CircleDashed, CircleX, Lightbulb, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/modules/audits/status";

/**
 * Status primitives for the audit screen. Colour is never the only signal: every tone
 * carries its own icon and a text verdict (WCAG 1.4.1). Class names are literal so
 * Tailwind can see them.
 */
const TONES: Record<Tone, { text: string; soft: string; line: string; accent: string; icon: LucideIcon }> = {
  good: { text: "text-good", soft: "bg-good-soft", line: "border-good-line", accent: "border-l-good-line", icon: CircleCheck },
  fair: { text: "text-fair", soft: "bg-fair-soft", line: "border-fair-line", accent: "border-l-fair-line", icon: TriangleAlert },
  bad: { text: "text-bad", soft: "bg-bad-soft", line: "border-bad-line", accent: "border-l-bad-line", icon: CircleX },
  info: { text: "text-info", soft: "bg-info-soft", line: "border-info-line", accent: "border-l-info-line", icon: Lightbulb },
  neutral: { text: "text-muted-foreground", soft: "bg-muted", line: "border-border", accent: "border-l-muted-foreground/40", icon: CircleDashed },
};

export function toneClasses(tone: Tone) {
  return TONES[tone];
}

export function ToneIcon({ tone, className }: { tone: Tone; className?: string }) {
  const Icon = TONES[tone].icon;
  return <Icon aria-hidden="true" className={cn("shrink-0", TONES[tone].text, className)} />;
}

export function StatusPill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  const t = TONES[tone];
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
