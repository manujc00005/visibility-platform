import { z } from "zod";
import type { FetchFailureKind } from "@/modules/audits/fetcher/safe-fetch";
import type { AuditFacts, Finding } from "@/modules/audits/rules";

/**
 * What one comparison stores per site (feature 011). A closed list of metrics and states:
 * every field is copied by name, so nothing the audit reads from a website can slip in (D002).
 */

export const MAX_SITES = 6;

/** Reasons a home page could not be read. `refused_by_policy` never gets here: it is `robots_disallowed`. */
const CAUSES = [
  "invalid_url",
  "blocked_destination",
  "dns",
  "network",
  "timeout",
  "too_many_redirects",
  "too_large",
  "unsupported_encoding",
  "budget_exhausted",
] as const satisfies readonly FetchFailureKind[];

const isoDay = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
});
const figure = z.number().finite().nonnegative();
const count = z.number().int().nonnegative();
const score = figure.max(100);
const domainName = z.string().max(253).regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);

const measured = <T extends z.ZodType>(value: T) =>
  z.discriminatedUnion("status", [z.strictObject({ status: z.literal("ok"), value }), z.strictObject({ status: z.literal("not_measured") })]);

const lighthouseSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("ok"),
    lighthouseVersion: z.string().max(40).nullable(),
    performance: measured(score),
    seo: measured(score),
    accessibility: measured(score),
    bestPractices: measured(score),
    lcpMs: measured(figure),
    cls: measured(figure),
    tbtMs: measured(figure),
  }),
  z.strictObject({ status: z.enum(["not_configured", "quota_exceeded", "error", "skipped"]) }),
]);

const fieldSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("ok"),
    formFactor: z.literal("PHONE"),
    scope: z.enum(["url", "origin"]),
    period: z.strictObject({ firstDate: isoDay, lastDate: isoDay }).refine((p) => p.firstDate <= p.lastDate).nullable(),
    lcpMs: measured(figure),
    inpMs: measured(figure),
    cls: measured(figure),
  }),
  z.strictObject({ status: z.enum(["no_data", "not_configured", "quota_exceeded", "error", "skipped"]) }),
]);

const matched = { requestedDomain: domainName, effectiveDomain: domainName, scope: z.literal("registered_domain"), asOf: isoDay };
const authoritySchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("ok"),
    ...matched,
    score: figure.max(10),
    rank: z.number().int().positive().nullable(),
    referringDomains: count.nullable(),
  }),
  z.strictObject({ status: z.literal("not_found"), ...matched }),
  z.strictObject({ status: z.enum(["not_configured", "invalid_key", "ip_not_allowed", "quota_exceeded", "error"]), requestedDomain: domainName }),
]);

const siteSchema = z
  .strictObject({
    role: z.enum(["company", "competitor"]),
    competitorId: z.uuid().nullable(),
    name: z.string().min(1).max(120),
    domain: domainName,
    hostname: domainName,
    access: z.enum(["analyzed", "robots_disallowed", "unreachable", "http_error", "non_html", "processing_error"]),
    cause: z.enum(CAUSES).nullable(),
    lighthouse: lighthouseSchema,
    field: fieldSchema,
    criticalCount: count.nullable(),
    warningCount: count.nullable(),
    authority: authoritySchema,
  })
  .refine((s) => (s.role === "company" ? s.competitorId === null : s.competitorId !== null && s.hostname === s.domain))
  .refine((s) => (s.access === "analyzed") === (s.criticalCount !== null) && (s.access === "analyzed") === (s.warningCount !== null))
  .refine((s) => (s.access === "unreachable") === (s.cause !== null));

const comparisonSchema = z
  .strictObject({ version: z.literal(1), sites: z.array(siteSchema).min(1).max(MAX_SITES) })
  .refine(({ sites }) => sites[0]?.role === "company" && sites.filter((s) => s.role === "company").length === 1)
  .refine(({ sites }) => new Set(sites.map((s) => s.domain)).size === sites.length)
  .refine(({ sites }) => {
    const ids = sites.flatMap((s) => (s.competitorId ? [s.competitorId] : []));
    return new Set(ids).size === ids.length;
  });

export type LighthouseResult = z.infer<typeof lighthouseSchema>;
export type FieldResult = z.infer<typeof fieldSchema>;
export type AuthorityResult = z.infer<typeof authoritySchema>;
export type SiteResult = z.infer<typeof siteSchema>;
export type SiteAccess = SiteResult["access"];
export type Comparison = z.infer<typeof comparisonSchema>;

export function parseAuthority(raw: unknown): AuthorityResult | null {
  const parsed = authoritySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Used on both sides of the database: nothing out of contract is stored, and a stored row is never trusted. */
export function parseComparison(raw: unknown): Comparison | null {
  const parsed = comparisonSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export interface SiteTarget {
  role: "company" | "competitor";
  competitorId: string | null;
  name: string;
  domain: string;
  hostname: string;
}

interface CompanyInput {
  name: string;
  domain: string;
  hostname: string;
}

interface CompetitorInput {
  id: string;
  name: string;
  domain: string | null;
  createdAt: Date;
}

export interface SiteSelection<C> {
  sites: SiteTarget[];
  /** Competitors that have no website to measure. */
  withoutWebsite: C[];
  /** Competitors sharing a domain with a site already listed: measured once, under that site. */
  duplicates: C[];
  /** True when at least one competitor remains to compare with. */
  eligible: boolean;
}

/** One measurement per domain: the company first, then the oldest competitor holding each domain. */
export function selectSites<C extends CompetitorInput>(company: CompanyInput, competitors: readonly C[]): SiteSelection<C> {
  const sites: SiteTarget[] = [{ role: "company", competitorId: null, name: company.name, domain: company.domain, hostname: company.hostname }];
  const taken = new Set([company.domain]);
  const withoutWebsite: C[] = [];
  const duplicates: C[] = [];
  const stable = [...competitors].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  for (const competitor of stable) {
    if (!competitor.domain) {
      withoutWebsite.push(competitor);
      continue;
    }
    const domain = competitor.domain.toLowerCase();
    if (taken.has(domain)) duplicates.push(competitor);
    if (taken.has(domain) || sites.length >= MAX_SITES) continue;
    taken.add(domain);
    sites.push({ role: "competitor", competitorId: competitor.id, name: competitor.name, domain, hostname: domain });
  }
  return { sites, withoutWebsite, duplicates, eligible: sites.length > 1 };
}

const value = <T>(from: T | null | undefined) => (from === null || from === undefined ? { status: "not_measured" as const } : { status: "ok" as const, value: from });

function accessOf(page: AuditFacts["page"]): Pick<SiteResult, "access" | "cause"> {
  if (page.kind === "disallowed") return { access: "robots_disallowed", cause: null };
  if (page.kind === "failed") {
    const known = CAUSES.find((cause) => cause === page.failure.kind);
    return { access: "unreachable", cause: known ?? "network" };
  }
  if (page.result.status >= 400) return { access: "http_error", cause: null };
  return { access: page.result.facts ? "analyzed" : "non_html", cause: null };
}

/** Out of contract, a source reads as failed: it does not take down the site or the comparison. */
const checked = <T>(schema: z.ZodType<T>, built: T): T | { status: "error" } => (schema.safeParse(built).success ? built : { status: "error" });

function lighthouseOf(result: AuditFacts["performance"]): LighthouseResult {
  if (result.status !== "ok") return { status: result.status };
  return checked(lighthouseSchema, {
    status: "ok",
    lighthouseVersion: result.lighthouseVersion,
    performance: value(result.score),
    seo: value(result.categories?.seo?.score),
    accessibility: value(result.categories?.accessibility?.score),
    bestPractices: value(result.categories?.["best-practices"]?.score),
    lcpMs: value(result.metrics?.lcpMs),
    cls: value(result.metrics?.cls),
    tbtMs: value(result.metrics?.tbtMs),
  });
}

function fieldOf(result: AuditFacts["fieldData"]): FieldResult {
  if (!result) return { status: "not_configured" };
  if (result.status !== "ok") return { status: result.status };
  if (!result.scope) return { status: "error" };
  return checked(fieldSchema, {
    status: "ok",
    formFactor: result.formFactor,
    scope: result.scope,
    period: result.collectionPeriod && { firstDate: result.collectionPeriod.firstDate, lastDate: result.collectionPeriod.lastDate },
    lcpMs: value(result.metrics?.lcpMs),
    inpMs: value(result.metrics?.inpMs),
    cls: value(result.metrics?.cls),
  });
}

export function toSiteResult(target: SiteTarget, facts: AuditFacts, findings: readonly Finding[], authority: AuthorityResult): SiteResult {
  const access = accessOf(facts.page);
  const counted = access.access === "analyzed";
  const severity = (level: Finding["severity"]) => (counted ? findings.filter((f) => f.severity === level).length : null);
  return {
    role: target.role,
    competitorId: target.competitorId,
    name: target.name,
    domain: target.domain,
    hostname: target.hostname,
    ...access,
    lighthouse: lighthouseOf(facts.performance),
    field: fieldOf(facts.fieldData),
    criticalCount: severity("critical"),
    warningCount: severity("warning"),
    authority,
  };
}

/** The measurement of this site broke; the others keep theirs and its authority is still valid. */
export function unprocessedSite(target: SiteTarget, authority: AuthorityResult): SiteResult {
  return {
    role: target.role,
    competitorId: target.competitorId,
    name: target.name,
    domain: target.domain,
    hostname: target.hostname,
    access: "processing_error",
    cause: null,
    lighthouse: { status: "error" },
    field: { status: "error" },
    criticalCount: null,
    warningCount: null,
    authority,
  };
}
