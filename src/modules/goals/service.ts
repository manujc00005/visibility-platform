import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import { analyticsSnapshots } from "@/modules/analytics/schema";
import {
  fieldErrorsOf,
  lockWorkspace,
  type Result,
} from "@/modules/geo/service";
import {
  GOAL_KINDS,
  GOAL_LIMITS,
  workspaceGoals,
  type WorkspaceGoal,
} from "@/modules/goals/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validation with messages in one language (D007 of 003). */
export function goalSchemaFor(locale: Locale = DEFAULT_LOCALE) {
  const t = getMessages(locale).goals.validation;
  return z.object({
    kind: z.enum(GOAL_KINDS, { error: t.kindInvalid }),
    label: z
      .string({ error: t.labelRequired })
      .trim()
      .min(1, t.labelRequired)
      .max(GOAL_LIMITS.label, t.labelMax),
    eventName: z
      .string({ error: t.eventRequired })
      .trim()
      .min(1, t.eventRequired)
      .max(GOAL_LIMITS.event, t.eventMax),
  });
}

export async function getGoal(
  db: Database,
  workspaceId: string,
): Promise<WorkspaceGoal | null> {
  if (!UUID.test(workspaceId)) return null;
  const [row] = await db
    .select()
    .from(workspaceGoals)
    .where(eq(workspaceGoals.workspaceId, workspaceId));
  return row ?? null;
}

/** Upsert under the company lock, like every 1:1 writer (012 D002). */
export async function saveGoal(
  db: Database,
  workspaceId: string,
  raw: unknown,
  locale: Locale = DEFAULT_LOCALE,
): Promise<Result<WorkspaceGoal, "not_found" | "validation">> {
  const parsed = goalSchemaFor(locale).safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      error: "validation",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  return db.transaction(
    async (tx): Promise<Result<WorkspaceGoal, "not_found" | "validation">> => {
      if (!(await lockWorkspace(tx, workspaceId)))
        return { ok: false, error: "not_found" };
      const [row] = await tx
        .insert(workspaceGoals)
        .values({ workspaceId, ...parsed.data })
        .onConflictDoUpdate({
          target: workspaceGoals.workspaceId,
          set: { ...parsed.data, updatedAt: sql`now()` },
        })
        .returning();
      return { ok: true, value: row! };
    },
  );
}

/** Under the company lock like the upsert (D001); removing a goal that does not exist is not an error. */
export async function removeGoal(
  db: Database,
  workspaceId: string,
): Promise<boolean> {
  if (!UUID.test(workspaceId)) return false;
  return db.transaction(async (tx) => {
    if (!(await lockWorkspace(tx, workspaceId))) return false;
    const rows = await tx
      .delete(workspaceGoals)
      .where(eq(workspaceGoals.workspaceId, workspaceId))
      .returning({ id: workspaceGoals.workspaceId });
    return rows.length === 1;
  });
}

export interface GoalEvidence {
  /** When the capture that saw the event was taken: the last reception observed. */
  observedAt: Date;
}

/**
 * The most recent good capture whose organic key events include `eventName` above zero
 * (D002): the proof that the goal is being measured. Only this company's captures.
 */
export async function goalEvidence(
  db: Database,
  workspaceId: string,
  eventName: string,
): Promise<GoalEvidence | null> {
  if (!UUID.test(workspaceId)) return null;
  const [row] = await db
    .select({ observedAt: analyticsSnapshots.createdAt })
    .from(analyticsSnapshots)
    .where(
      and(
        eq(analyticsSnapshots.workspaceId, workspaceId),
        eq(analyticsSnapshots.status, "completed"),
        isNotNull(analyticsSnapshots.keyEvents),
        sql`jsonb_path_exists(${analyticsSnapshots.keyEvents}, '$.organicByEvent[*] ? (@.event == $event && @.keyEvents > 0)', jsonb_build_object('event', ${eventName}::text))`,
      ),
    )
    .orderBy(desc(analyticsSnapshots.createdAt))
    .limit(1);
  return row ? { observedAt: row.observedAt } : null;
}
