import { desc, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { logger } from "@/lib/logger";
import { workspaces, type Workspace } from "@/modules/workspaces/schema";
import { parseWorkspaceInput, type FieldErrors } from "@/modules/workspaces/validation";

export type WorkspaceError =
  | { kind: "validation"; fieldErrors: FieldErrors }
  | { kind: "duplicate_domain"; domain: string; existingId: string | null }
  | { kind: "not_found" };

export type WorkspaceResult = { ok: true; workspace: Workspace } | { ok: false; error: WorkspaceError };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN_UNIQUE_CONSTRAINT = "workspaces_domain_key";

/** Postgres unique_violation on the domain key, unwrapped from Drizzle's query error. */
function isDuplicateDomain(error: unknown): boolean {
  const pgError = (error instanceof Error && error.cause ? error.cause : error) as {
    code?: string;
    constraint?: string;
  };
  return pgError?.code === "23505" && pgError.constraint === DOMAIN_UNIQUE_CONSTRAINT;
}

async function duplicateDomain(db: Database, domain: string): Promise<WorkspaceResult> {
  const [existing] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.domain, domain));
  return { ok: false, error: { kind: "duplicate_domain", domain, existingId: existing?.id ?? null } };
}

export async function listWorkspaces(db: Database): Promise<Workspace[]> {
  return db.select().from(workspaces).orderBy(desc(workspaces.createdAt), desc(workspaces.id));
}

/** Returns null for unknown or malformed ids (a malformed id can never exist). */
export async function getWorkspace(db: Database, id: string): Promise<Workspace | null> {
  if (!UUID.test(id)) return null;
  const [row] = await db.select().from(workspaces).where(eq(workspaces.id, id));
  return row ?? null;
}

/**
 * Creates a workspace. Uniqueness is enforced by the database constraint, not by a
 * prior SELECT, so two concurrent creations of the same domain yield exactly one row.
 * `locale` only selects the language of the validation messages.
 */
export async function createWorkspace(db: Database, raw: unknown, locale: Locale = DEFAULT_LOCALE): Promise<WorkspaceResult> {
  const parsed = parseWorkspaceInput(raw, locale);
  if (!parsed.success) return { ok: false, error: { kind: "validation", fieldErrors: parsed.fieldErrors } };

  try {
    const [row] = await db.insert(workspaces).values(parsed.data).returning();
    logger.info({ workspaceId: row!.id, domain: row!.domain }, "workspace created");
    return { ok: true, workspace: row! };
  } catch (error) {
    if (isDuplicateDomain(error)) return duplicateDomain(db, parsed.data.domain);
    throw error;
  }
}

/**
 * Updates a workspace in a single statement. Invalid input is rejected before touching
 * the database, and a duplicate domain fails the statement, so no partial change persists.
 */
export async function updateWorkspace(
  db: Database,
  id: string,
  raw: unknown,
  locale: Locale = DEFAULT_LOCALE,
): Promise<WorkspaceResult> {
  if (!UUID.test(id)) return { ok: false, error: { kind: "not_found" } };
  const parsed = parseWorkspaceInput(raw, locale);
  if (!parsed.success) return { ok: false, error: { kind: "validation", fieldErrors: parsed.fieldErrors } };

  try {
    const [row] = await db
      .update(workspaces)
      .set({ ...parsed.data, updatedAt: sql`now()` })
      .where(eq(workspaces.id, id))
      .returning();
    if (!row) return { ok: false, error: { kind: "not_found" } };
    logger.info({ workspaceId: row.id, domain: row.domain }, "workspace updated");
    return { ok: true, workspace: row };
  } catch (error) {
    if (isDuplicateDomain(error)) return duplicateDomain(db, parsed.data.domain);
    throw error;
  }
}
