import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { AuditLike, Direction } from "@/modules/audits/evolution";
import type { Severity } from "@/modules/audits/rules";

/**
 * Owner-facing summaries of a workspace for the overview. Pure functions over data the
 * pages already load: no I/O, no composite scores (B06), no invented zeros.
 *
 * Every block keeps two dimensions apart (SPEC «Reglas de estados», D011):
 * - the latest usable RESULT, with its own date, and
 * - the latest ATTEMPT when it is newer and did not produce a result (running or failed).
 * A newer attempt never replaces nor re-dates the result. Staleness is an extra notice.
 * Texts come from the catalog of `locale`, Spanish by default (D007).
 */
export type BlockState = "not_configured" | "no_data" | "analyzing" | "partial" | "error" | "ok";

export interface Change {
  direction: Direction;
  text: string;
}

export interface FindingLike {
  id: string;
  ruleId: string;
  severity: Severity;
  category: string;
  title: string;
  evidence: string[];
  recommendation: string;
}

/** Stored audit as the overview needs it. `rulesVersion` is part of the check coverage. */
export interface AuditInput extends AuditLike {
  rulesVersion?: string | null;
}

/** A newer attempt that has not produced a result. Only set when an older result exists. */
export interface Attempt {
  status: "running" | "failed";
  startedAt: Date;
  text: string;
}

export interface Stale {
  days: number;
  text: string;
}

export const STALE_AFTER_DAYS = 30;
const DAY_MS = 86_400_000;

/** More than 30 × 24 hours since the result. Exactly 30 days is not stale. */
export function isStale(date: Date | null, now: Date): boolean {
  return date !== null && now.getTime() - date.getTime() > STALE_AFTER_DAYS * DAY_MS;
}

/** "Datos de hace N días" (N in whole days) when the result is stale, otherwise null. */
export function staleInfo(date: Date | null, now: Date, locale: Locale = DEFAULT_LOCALE): Stale | null {
  if (!date || !isStale(date, now)) return null;
  const days = Math.floor((now.getTime() - date.getTime()) / DAY_MS);
  return { days, text: getMessages(locale).overview.stale(days) };
}

export interface AuditSplit<T extends AuditLike> {
  /** Latest completed audit: the result. */
  result: T | null;
  /** Completed audit immediately before the result. */
  previous: T | null;
  /** Latest audit when it is newer than the result and not completed. */
  pending: T | null;
}

export function splitAudits<T extends AuditLike>(audits: T[]): AuditSplit<T> {
  const sorted = [...audits].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const completed = sorted.filter((a) => a.status === "completed");
  const newest = sorted[0] ?? null;
  return {
    result: completed[0] ?? null,
    previous: completed[1] ?? null,
    pending: newest && newest.status !== "completed" ? newest : null,
  };
}

export function auditAttempt(pending: AuditLike | null, locale: Locale = DEFAULT_LOCALE): Attempt | null {
  if (!pending) return null;
  const t = getMessages(locale).overview.attempt;
  return pending.status === "running"
    ? { status: "running", startedAt: pending.startedAt, text: t.running }
    : { status: "failed", startedAt: pending.startedAt, text: t.failed };
}
