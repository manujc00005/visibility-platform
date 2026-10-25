import { describe, expect, it } from "vitest";
import { collectAuditFacts } from "@/modules/audits/collect";
import { emptyResult, type PerformanceResult } from "@/modules/audits/pagespeed";
import { fakeFetcher, HTML_OK, SITEMAP_OK } from "../../support/fake-fetcher";

const psiCalls: string[] = [];
const pageSpeed = async (url: string): Promise<PerformanceResult> => {
  psiCalls.push(url);
  return emptyResult("not_configured");
};

describe("collectAuditFacts", () => {
  it("reads robots.txt first, then the page, then the sitemap declared in robots.txt", async () => {
    const fetcher = fakeFetcher({
      "https://clinicagarcia.es/robots.txt": { status: 200, body: "User-agent: *\nAllow: /\nSitemap: https://clinicagarcia.es/sm.xml", contentType: "text/plain" },
      "https://clinicagarcia.es/": { status: 200, body: HTML_OK, contentType: "text/html" },
      "https://clinicagarcia.es/sm.xml": { status: 200, body: SITEMAP_OK, contentType: "application/xml" },
    });
    const { facts, log } = await collectAuditFacts("clinicagarcia.es", { fetcher, pageSpeed });
    expect(fetcher.calls).toEqual([
      "https://clinicagarcia.es/robots.txt",
      "https://clinicagarcia.es/",
      "https://clinicagarcia.es/sm.xml",
    ]);
    expect(facts.page.kind).toBe("fetched");
    expect(facts.robots).toMatchObject({ status: "ok", homepageAllowedForGoogle: true, homepageAllowedForUs: true });
    expect(facts.sitemap).toMatchObject({ source: "robots", status: "ok", sitemap: { locCount: 2 } });
    expect(log).toHaveLength(3);
  });

  it("does not fetch the home page when robots.txt forbids our crawler", async () => {
    const fetcher = fakeFetcher({
      "https://ejemplo.es/robots.txt": { status: 200, body: "User-agent: VisibilityPlatformBot\nDisallow: /", contentType: "text/plain" },
    });
    const { facts } = await collectAuditFacts("ejemplo.es", { fetcher, pageSpeed });
    expect(facts.page).toEqual({ kind: "disallowed" });
    expect(fetcher.calls).not.toContain("https://ejemplo.es/");
    expect(facts.performance.status).toBe("skipped");
  });

  it("re-reads robots.txt when the home page redirects to another origin", async () => {
    const fetcher = fakeFetcher({
      "https://clinicagarcia.es/robots.txt": { status: 404, contentType: "text/plain" },
      "https://clinicagarcia.es/": {
        status: 200,
        body: HTML_OK,
        contentType: "text/html",
        finalUrl: "https://www.clinicagarcia.es/",
        redirects: [{ url: "https://clinicagarcia.es/", status: 301, location: "https://www.clinicagarcia.es/" }],
      },
      "https://www.clinicagarcia.es/robots.txt": { status: 200, body: "User-agent: Googlebot\nDisallow: /", contentType: "text/plain" },
      "https://www.clinicagarcia.es/sitemap.xml": { status: 404 },
    });
    const { facts } = await collectAuditFacts("clinicagarcia.es", { fetcher, pageSpeed });
    expect(fetcher.calls).toContain("https://www.clinicagarcia.es/robots.txt");
    expect(facts.robots).toMatchObject({ url: "https://www.clinicagarcia.es/robots.txt", homepageAllowedForGoogle: false });
    expect(facts.sitemap).toMatchObject({ source: "default", status: "not_found" });
  });

  it("falls back to http once when https fails at the network level", async () => {
    const fetcher = fakeFetcher({
      "https://viejo.es/robots.txt": { fail: "network" },
      "https://viejo.es/": { fail: "network" },
      "http://viejo.es/": { status: 200, body: HTML_OK, contentType: "text/html" },
      "http://viejo.es/robots.txt": { status: 404 },
    });
    const { facts } = await collectAuditFacts("viejo.es", { fetcher, pageSpeed });
    expect(facts.page.kind === "fetched" && facts.page.result.url).toBe("http://viejo.es/");
    expect(facts.httpsFailure).toMatchObject({ kind: "network", url: "https://viejo.es/" });
    expect(facts.robots?.status).toBe("not_found");
  });

  it("does not fall back to http on DNS failures and skips PageSpeed", async () => {
    psiCalls.length = 0;
    const fetcher = fakeFetcher({
      "https://noexiste.es/robots.txt": { fail: "dns" },
      "https://noexiste.es/": { fail: "dns" },
    });
    const { facts } = await collectAuditFacts("noexiste.es", { fetcher, pageSpeed });
    expect(facts.page).toMatchObject({ kind: "failed", failure: { kind: "dns" } });
    expect(fetcher.calls).not.toContain("http://noexiste.es/");
    expect(facts.performance.status).toBe("skipped");
    expect(psiCalls).toEqual([]);
  });

  it("does not parse non-HTML responses", async () => {
    const fetcher = fakeFetcher({
      "https://api.ejemplo.es/robots.txt": { status: 404 },
      "https://api.ejemplo.es/": { status: 200, body: '{"ok":true}', contentType: "application/json" },
    });
    const { facts } = await collectAuditFacts("api.ejemplo.es", { fetcher, pageSpeed });
    expect(facts.page.kind === "fetched" && facts.page.result.facts).toBeNull();
  });
});
