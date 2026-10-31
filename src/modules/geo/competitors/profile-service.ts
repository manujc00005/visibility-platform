import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { logger } from "@/lib/logger";
import { createBudget } from "@/modules/audits/fetcher/safe-fetch";
import { decodeHtml } from "@/modules/audits/html";
import { profileSchemaFor, proposeProfile, type ProfileDraft, type ProposalNote } from "@/modules/geo/competitors/profile";
import { geoBusinessProfiles, type GeoBusinessProfile } from "@/modules/geo/competitors/schema";
import type { CompetitorDeps } from "@/modules/geo/competitors/service";
import { fieldErrorsOf, lockWorkspace, type Result, type Tx } from "@/modules/geo/service";
import { getWorkspace } from "@/modules/workspaces/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = { maxBytes: 3_000_000, timeoutMs: 10_000 };

export async function getBusinessProfile(db: Tx | Database, workspaceId: string): Promise<GeoBusinessProfile | null> {
  if (!UUID.test(workspaceId)) return null;
  const [row] = await db.select().from(geoBusinessProfiles).where(eq(geoBusinessProfiles.workspaceId, workspaceId));
  return row ?? null;
}

/** Takes the workspace lock like every writer an extraction competes against. */
export async function saveBusinessProfile(
  db: Database,
  workspaceId: string,
  raw: unknown,
  locale: Locale = DEFAULT_LOCALE,
): Promise<Result<GeoBusinessProfile, "not_found" | "validation">> {
  const parsed = profileSchemaFor(locale).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "validation", fieldErrors: fieldErrorsOf(parsed.error) };
  return db.transaction(async (tx): Promise<Result<GeoBusinessProfile, "not_found" | "validation">> => {
    if (!(await lockWorkspace(tx, workspaceId))) return { ok: false, error: "not_found" };
    const [row] = await tx
      .insert(geoBusinessProfiles)
      .values({ workspaceId, ...parsed.data })
      .onConflictDoUpdate({ target: geoBusinessProfiles.workspaceId, set: { ...parsed.data, updatedAt: sql`now()` } })
      .returning();
    return { ok: true, value: row! };
  });
}

export type ProposeError = "not_found" | "unreadable";

/** Reads the company's own home page, on the operator's request. Writes nothing and never leaves its domain. */
export async function proposeBusinessProfile(db: Database, workspaceId: string, deps: CompetitorDeps): Promise<Result<{ draft: ProfileDraft; notes: ProposalNote[] }, ProposeError>> {
  if (!UUID.test(workspaceId)) return { ok: false, error: "not_found" };
  const workspace = await getWorkspace(db, workspaceId);
  if (!workspace) return { ok: false, error: "not_found" };
  const started = Date.now();
  const own = (url: URL) => {
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === workspace.domain || host.endsWith(`.${workspace.domain}`));
  };
  const result = await deps.fetcher.fetch(
    `https://${workspace.hostname}/`,
    { ...PAGE, allowRequest: async (url) => own(url) },
    createBudget({ maxRequests: 6, maxTotalBytes: PAGE.maxBytes, timeLimitMs: PAGE.timeoutMs }),
  );
  const html = result.ok && result.response.status >= 200 && result.response.status < 300 && /html|xml/i.test(result.response.contentType ?? "html");
  let proposal: { draft: ProfileDraft; notes: ProposalNote[] } | null = null;
  try {
    if (result.ok && html) proposal = proposeProfile({ html: decodeHtml(result.response.body, result.response.contentType), url: result.response.url, city: workspace.city, services: workspace.services });
  } catch (error) {
    // A page too deep or malformed to parse must not lose what the operator already typed.
    logger.warn({ workspaceId, error: error instanceof Error ? error.name : "unknown" }, "business profile page could not be parsed");
  }
  logger.info({ workspaceId, ok: proposal !== null, ms: Date.now() - started }, "business profile proposal");
  return proposal ? { ok: true, value: proposal } : { ok: false, error: "unreadable" };
}
