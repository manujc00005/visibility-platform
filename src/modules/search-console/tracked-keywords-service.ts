import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { keywordExpression, MAX_TRACKED_KEYWORDS, normalizeTrackedKeyword } from "@/modules/search-console/keywords";
import { trackedKeywords } from "@/modules/search-console/schema";
import { workspaces } from "@/modules/workspaces/schema";

const uuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export type KeywordError = "not_found" | "invalid" | "duplicate" | "limit" | "bytes";
export type KeywordResult = { ok: true } | { ok: false; error: KeywordError };

export async function listTrackedKeywords(db: Database, workspaceId: string) {
  if (!uuid(workspaceId)) return [];
  return db.select().from(trackedKeywords).where(eq(trackedKeywords.workspaceId, workspaceId)).orderBy(asc(trackedKeywords.createdAt), asc(trackedKeywords.id));
}

export async function addTrackedKeyword(db: Database, workspaceId: string, raw: unknown): Promise<KeywordResult> {
  if (!uuid(workspaceId)) return { ok: false, error: "not_found" };
  let keyword: string;
  try { keyword = normalizeTrackedKeyword(raw); } catch { return { ok: false, error: "invalid" }; }
  return db.transaction(async (tx) => {
    const locked = await tx.execute(sql`select id from ${workspaces} where id = ${workspaceId} for no key update`);
    if (!locked.rows.length) return { ok: false, error: "not_found" };
    const rows = await tx.select().from(trackedKeywords).where(eq(trackedKeywords.workspaceId, workspaceId));
    if (rows.some((r) => r.keyword === keyword)) return { ok: false, error: "duplicate" };
    if (rows.length >= MAX_TRACKED_KEYWORDS) return { ok: false, error: "limit" };
    try { keywordExpression([...rows.map((r) => r.keyword), keyword]); } catch { return { ok: false, error: "bytes" }; }
    await tx.insert(trackedKeywords).values({ workspaceId, keyword });
    return { ok: true };
  });
}

export async function removeTrackedKeyword(db: Database, workspaceId: string, keywordId: string): Promise<KeywordResult> {
  if (!uuid(workspaceId) || !uuid(keywordId)) return { ok: false, error: "not_found" };
  return db.transaction(async (tx) => {
    const locked = await tx.execute(sql`select id from ${workspaces} where id = ${workspaceId} for no key update`);
    if (!locked.rows.length) return { ok: false, error: "not_found" };
    await tx.delete(trackedKeywords).where(and(eq(trackedKeywords.workspaceId, workspaceId), eq(trackedKeywords.id, keywordId)));
    return { ok: true };
  });
}
