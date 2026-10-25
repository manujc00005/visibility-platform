import {
  createBudget,
  type FetchBudget,
  type FetchLogEntry,
  type SafeFetcher,
  type SafeResponse,
} from "@/modules/audits/fetcher/safe-fetch";
import { decodeHtml, extractPage } from "@/modules/audits/html";
import { emptyResult, type PerformanceResult } from "@/modules/audits/pagespeed";
import { isAllowedByRobots, parseRobots, type Robots } from "@/modules/audits/robots";
import type { AuditFacts, PageResult, RobotsResult, SitemapResultFacts } from "@/modules/audits/rules";
import { parseSitemap } from "@/modules/audits/sitemap";

/**
 * Collects the facts of one audit: robots.txt, the home page, one sitemap and PageSpeed.
 * Every request goes through the safe fetcher and shares one budget. Single page only:
 * this is not a crawler.
 */

export const AUDIT_USER_AGENT = "VisibilityPlatformBot/0.1 (+auditoría técnica; contacto: operador)";
/** Product token matched against robots.txt groups. */
const OUR_ROBOTS_TOKEN = "VisibilityPlatformBot";

export const AUDIT_LIMITS = {
  maxRequests: 12,
  maxTotalBytes: 12_000_000,
  timeLimitMs: 45_000,
  page: { maxBytes: 3_000_000, timeoutMs: 15_000 },
  robots: { maxBytes: 512_000, timeoutMs: 10_000, accept: "text/plain,*/*;q=0.5" },
  sitemap: { maxBytes: 5_000_000, timeoutMs: 15_000, accept: "application/xml,text/xml,*/*;q=0.5" },
} as const;

export interface CollectDeps {
  fetcher: SafeFetcher;
  pageSpeed: (url: string) => Promise<PerformanceResult>;
}

interface RobotsFetch {
  result: RobotsResult;
  parsed: Robots | null;
}

async function fetchRobots(origin: string, deps: CollectDeps, budget: FetchBudget): Promise<RobotsFetch> {
  const url = `${origin}/robots.txt`;
  const response = await deps.fetcher.fetch(url, AUDIT_LIMITS.robots, budget);
  const base = { url, sitemaps: [], homepageAllowedForGoogle: null, homepageAllowedForUs: null };
  if (!response.ok) {
    return { result: { ...base, status: "fetch_failed", httpStatus: null, error: response.failure.message }, parsed: null };
  }
  const { status } = response.response;
  if (status >= 400 && status < 500) {
    return { result: { ...base, status: "not_found", httpStatus: status, error: null }, parsed: null };
  }
  if (status >= 500) return { result: { ...base, status: "http_error", httpStatus: status, error: null }, parsed: null };
  const parsed = parseRobots(response.response.body.toString("utf8"));
  return {
    result: { ...base, url: response.response.url, status: "ok", httpStatus: status, error: null, sitemaps: parsed.sitemaps.slice(0, 20) },
    parsed,
  };
}

function withPermissions(robots: RobotsFetch, path: string): RobotsResult {
  if (!robots.parsed) return robots.result;
  return {
    ...robots.result,
    homepageAllowedForGoogle: isAllowedByRobots(robots.parsed, "Googlebot", path),
    homepageAllowedForUs: isAllowedByRobots(robots.parsed, OUR_ROBOTS_TOKEN, path),
  };
}

function toPageResult(response: SafeResponse): PageResult {
  const isHtml = /text\/html|application\/xhtml\+xml/i.test(response.contentType ?? "");
  return {
    url: response.url,
    status: response.status,
    contentType: response.contentType,
    xRobotsTag: response.headers["x-robots-tag"] ?? null,
    redirects: response.redirects,
    facts: isHtml ? extractPage(decodeHtml(response.body, response.contentType), response.url) : null,
  };
}

async function fetchSitemap(
  robots: RobotsResult | null,
  origin: string,
  homepage: string | null,
  deps: CollectDeps,
  budget: FetchBudget,
): Promise<SitemapResultFacts> {
  const declared = robots?.sitemaps.find((value) => {
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  });
  const url = declared ?? `${origin}/sitemap.xml`;
  const source = declared ? "robots" : "default";
  const response = await deps.fetcher.fetch(url, AUDIT_LIMITS.sitemap, budget);
  const base = { url, source, sitemap: null, homepageListed: null } as const;
  if (!response.ok) return { ...base, status: "fetch_failed", httpStatus: null, error: response.failure.message };
  const { status, body } = response.response;
  if (status === 404 || status === 410) return { ...base, status: "not_found", httpStatus: status, error: null };
  if (status >= 400) return { ...base, status: "http_error", httpStatus: status, error: null };
  const parsed = parseSitemap(body);
  if (!parsed.ok) return { ...base, status: "invalid", httpStatus: status, error: parsed.error };
  const { sitemap } = parsed;
  let homepageListed: boolean | null = null;
  if (homepage && sitemap.kind === "urlset") {
    const normalize = (value: string) => value.replace(/\/$/, "");
    const found = sitemap.sample.some((loc) => normalize(loc) === normalize(homepage));
    homepageListed = found ? true : sitemap.locCount <= sitemap.sample.length ? false : null;
  }
  return { ...base, status: "ok", httpStatus: status, error: null, sitemap, homepageListed };
}

export async function collectAuditFacts(hostname: string, deps: CollectDeps): Promise<{ facts: AuditFacts; log: FetchLogEntry[] }> {
  const budget = createBudget(AUDIT_LIMITS);
  const requestedUrl = `https://${hostname}/`;
  let origin = new URL(requestedUrl).origin;

  let robots = await fetchRobots(origin, deps, budget);
  let page: AuditFacts["page"];
  let httpsFailure: AuditFacts["httpsFailure"] = null;

  const allowedForUs = robots.parsed ? isAllowedByRobots(robots.parsed, OUR_ROBOTS_TOKEN, "/") : true;
  if (!allowedForUs) {
    page = { kind: "disallowed" };
  } else {
    let response = await deps.fetcher.fetch(requestedUrl, AUDIT_LIMITS.page, budget);
    // Some small-business sites still have no working HTTPS: fall back to http once.
    if (!response.ok && (response.failure.kind === "network" || response.failure.kind === "timeout")) {
      const fallback = await deps.fetcher.fetch(`http://${hostname}/`, AUDIT_LIMITS.page, budget);
      if (fallback.ok) {
        httpsFailure = response.failure;
        response = fallback;
      }
    }
    page = response.ok ? { kind: "fetched", result: toPageResult(response.response) } : { kind: "failed", failure: response.failure };
  }

  // If the home page lives on another origin (www ↔ apex, http → https), its robots.txt applies.
  let path = "/";
  if (page.kind === "fetched") {
    const finalUrl = new URL(page.result.url);
    path = `${finalUrl.pathname}${finalUrl.search}`;
    if (finalUrl.origin !== origin) {
      origin = finalUrl.origin;
      robots = await fetchRobots(origin, deps, budget);
    }
  }
  const robotsResult = withPermissions(robots, path);
  const homepage = page.kind === "fetched" ? page.result.url : null;

  const [sitemap, performance] = await Promise.all([
    fetchSitemap(robotsResult, origin, homepage, deps, budget),
    page.kind === "fetched" && page.result.status < 400 ? deps.pageSpeed(page.result.url) : Promise.resolve(emptyResult("skipped")),
  ]);

  return {
    facts: { requestedUrl, httpsFailure, page, robots: robotsResult, sitemap, performance },
    log: budget.log,
  };
}
