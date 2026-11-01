import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { LatestAnalytics } from "@/modules/analytics/service";
import type { Tone } from "@/modules/audits/status";
import type { GoalEvidence } from "@/modules/goals/service";
import type { GoalKind, WorkspaceGoal } from "@/modules/goals/schema";
import { displayDay } from "@/modules/search-console/summary";
import { displayDate } from "@/modules/workspaces/presentation";

/**
 * The goal line of the overview (feature 016). Pure over the stored goal, the stored GA4
 * captures and the evidence query. Verified means some good capture saw the event above
 * zero (D002); the count is always the latest good capture's organic figure, zero included.
 * Texts say «desde buscadores» and «eventos clave», never customers or sales.
 */
export type GoalState = "none" | "pending" | "verified";

export interface GoalView {
  state: GoalState;
  status: { tone: Tone; label: string };
  kind: GoalKind | null;
  kindLabel: string | null;
  label: string | null;
  event: string | null;
  /** Organic key events of the goal event in the latest good capture; null without a capture with key events. */
  count: number | null;
  period: { start: string; end: string } | null;
  observedAt: Date | null;
  /** The main sentence. */
  text: string;
  /** Extra sentences: last reception, event not configured, connect GA4. */
  notes: string[];
}

export interface GoalInput {
  goal: WorkspaceGoal | null;
  analytics: LatestAnalytics;
  evidence: GoalEvidence | null;
}

export function summarizeGoal(
  { goal, analytics, evidence }: GoalInput,
  locale: Locale = DEFAULT_LOCALE,
): GoalView {
  const t = getMessages(locale).goals;
  if (!goal) {
    return {
      state: "none",
      status: { tone: "neutral", label: t.states.none },
      kind: null,
      kindLabel: null,
      label: null,
      event: null,
      count: null,
      period: null,
      observedAt: null,
      text: t.line.none,
      notes: [],
    };
  }
  const capture = analytics.latestCompleted;
  const keyEvents = capture?.keyEvents ?? null;
  const period =
    capture?.currentStart && capture.currentEnd
      ? { start: capture.currentStart, end: capture.currentEnd }
      : null;
  const count = keyEvents
    ? (keyEvents.organicByEvent.find((e) => e.event === goal.eventName)
        ?.keyEvents ?? 0)
    : null;
  const notConfigured =
    keyEvents !== null &&
    !keyEvents.configured.includes(goal.eventName) &&
    !keyEvents.configuredMore;
  const base = {
    kind: goal.kind,
    kindLabel: t.kinds[goal.kind],
    label: goal.label,
    event: goal.eventName,
    count,
    period,
  };

  if (evidence) {
    const notes = [t.line.observed(displayDate(evidence.observedAt, locale))];
    if (notConfigured) notes.push(t.line.notConfigured);
    const text =
      count !== null && period
        ? t.line.verified(
            goal.label,
            count,
            displayDay(period.start, locale),
            displayDay(period.end, locale),
          )
        : t.line.verifiedNoCapture(goal.label);
    return {
      ...base,
      state: "verified",
      status: { tone: "good", label: t.states.verified },
      observedAt: evidence.observedAt,
      text,
      notes,
    };
  }

  const notes: string[] = [];
  if (!capture) notes.push(t.line.connect);
  else if (notConfigured) notes.push(t.line.notConfigured);
  return {
    ...base,
    state: "pending",
    status: { tone: "neutral", label: t.states.pending },
    observedAt: null,
    text: t.line.pending(goal.label),
    notes,
  };
}
