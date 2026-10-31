import { createServer, type Server } from "node:http";
import { connect, type AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collectAuditFacts } from "@/modules/audits/collect";
import { emptyFieldData, type FieldDataResult } from "@/modules/audits/crux";
import { createSafeFetcher } from "@/modules/audits/fetcher/safe-fetch";
import { emptyResult, type PerformanceResult } from "@/modules/audits/pagespeed";
import { fakeFetcher, HTML_OK, SITEMAP_OK } from "../../support/fake-fetcher";

const psiCalls: string[] = [];
const pageSpeed = async (url: string): Promise<PerformanceResult> => {
  psiCalls.push(url);
  return emptyResult("not_configured");
};

describe("collectAuditFacts", () => {
  it("queries real-user data for the final page URL, and skips it when the page is unreadable", async () => {
    const fieldCalls: string[] = [];
    const fieldData = async (url: string): Promise<FieldDataResult> => {
      fieldCalls.push(url);
      return emptyFieldData("no_data");
    };
    const ok = fakeFetcher({
      "https://clinicagarcia.es/robots.txt": { status: 404 },
      "https://clinicagarcia.es/": { status: 200, body: HTML_OK, contentType: "text/html" },
      "https://clinicagarcia.es/sitemap.xml": { status: 404 },
    });
    expect((await collectAuditFacts("clinicagarcia.es", { fetcher: ok, pageSpeed, fieldData })).facts.fieldData?.status).toBe("no_data");
    expect(fieldCalls).toEqual(["https://clinicagarcia.es/"]);

    const down = fakeFetcher({ "https://caida.es/robots.txt": { fail: "dns" }, "https://caida.es/": { fail: "dns" } });
    expect((await collectAuditFacts("caida.es", { fetcher: down, pageSpeed, fieldData })).facts.fieldData?.status).toBe("skipped");
    expect(fieldCalls).toHaveLength(1);
  });

  it("marks real-user data as not configured when no provider is wired", async () => {
    const fetcher = fakeFetcher({
      "https://clinicagarcia.es/robots.txt": { status: 404 },
      "https://clinicagarcia.es/": { status: 200, body: HTML_OK, contentType: "text/html" },
      "https://clinicagarcia.es/sitemap.xml": { status: 404 },
    });
    expect((await collectAuditFacts("clinicagarcia.es", { fetcher, pageSpeed })).facts.fieldData?.status).toBe("not_configured");
  });

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

/**
 * Real safe fetcher against a local plain-HTTP server, so "never requested" means the server saw
 * nothing. Https cannot handshake with it and always falls back to http, which is the path tested.
 */
describe("collectAuditFacts with robots checked before each request (D011)", () => {
  type Site = Record<string, { status?: number; location?: string; body?: string; type?: string }>;
  let sites: Record<string, Site> = {};
  let seen: string[] = [];
  let server: Server;
  let port = 0;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const host = (req.headers.host ?? "").split(":")[0]!;
      seen.push(`${host}${req.url}`);
      const route = sites[host]?.[req.url ?? "/"];
      if (!route) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("no");
        return;
      }
      res.writeHead(route.status ?? 200, { "content-type": route.type ?? "text/html", ...(route.location ? { location: route.location } : {}) });
      res.end(route.body ?? "");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  function run(routes: Record<string, Site>, hostname = "uno.example") {
    sites = routes;
    seen = [];
    const fetcher = createSafeFetcher({ userAgent: "TestBot/1.0", resolve: async () => ["93.184.216.34"], connect: () => connect(port, "127.0.0.1") });
    const google: string[] = [];
    const pageSpeedSpy = async (url: string) => {
      google.push(`psi ${url}`);
      return emptyResult("not_configured");
    };
    const fieldData = async (url: string) => {
      google.push(`crux ${url}`);
      return emptyFieldData("no_data");
    };
    return { google, result: collectAuditFacts(hostname, { fetcher, pageSpeed: pageSpeedSpy, fieldData }, { robotsBeforeEachRequest: true }) };
  }
  const robots = (path: string) => ({ body: `User-agent: VisibilityPlatformBot\nDisallow: ${path}`, type: "text/plain" });
  const reads = (needle: string) => seen.filter((entry) => entry === needle).length;

  it("never requests a path of the same origin that robots.txt forbids", async () => {
    const { google, result } = run({ "uno.example": { "/robots.txt": robots("/privado"), "/": { status: 302, location: "/privado" }, "/privado": { body: HTML_OK } } });
    const { facts, log } = await result;
    expect(facts.page).toEqual({ kind: "disallowed" });
    expect(seen).not.toContain("uno.example/privado");
    expect(facts.performance.status).toBe("skipped");
    expect(facts.fieldData?.status).toBe("skipped");
    expect(google).toEqual([]);
    expect(facts.robots).toMatchObject({ homepageAllowedForUs: false });
    expect(log.some((entry) => entry.outcome === "refused_by_policy")).toBe(true);
  });

  it("reads the robots.txt of a redirect's origin before going there, and never requests the page", async () => {
    const { google, result } = run({
      "uno.example": { "/robots.txt": { status: 404 }, "/": { status: 301, location: "http://dos.example/" } },
      "dos.example": { "/robots.txt": robots("/"), "/": { body: HTML_OK } },
    });
    const { facts } = await result;
    expect(facts.page).toEqual({ kind: "disallowed" });
    expect(seen).toContain("dos.example/robots.txt");
    expect(seen).not.toContain("dos.example/");
    expect(seen.filter((entry) => entry.endsWith("sitemap.xml"))).toEqual([]);
    expect(facts.sitemap).toBeNull();
    expect(google).toEqual([]);
  });

  it("asks a site that forbids the home page for nothing else, not even a declared sitemap", async () => {
    const { result } = run({ "uno.example": { "/robots.txt": { body: "User-agent: *\nDisallow: /\nSitemap: http://dos.example/s.xml", type: "text/plain" } } });
    await result;
    expect(seen.every((entry) => entry.endsWith("robots.txt"))).toBe(true);
  });

  it("does not ask for the sitemap of a site that cannot be read", async () => {
    const fetcher = fakeFetcher({ "https://caida.es/robots.txt": { fail: "dns" }, "https://caida.es/": { fail: "dns" } });
    const { facts } = await collectAuditFacts("caida.es", { fetcher, pageSpeed }, { robotsBeforeEachRequest: true });
    expect(facts.sitemap).toBeNull();
    expect(fetcher.calls.some((call) => call.includes("sitemap"))).toBe(false);
  });

  it("checks the http fallback against the robots.txt of the http origin", async () => {
    const { google, result } = run({ "uno.example": { "/robots.txt": robots("/"), "/": { body: HTML_OK } } });
    const { facts } = await result;
    expect(facts.page).toEqual({ kind: "disallowed" });
    expect(seen).toEqual(expect.arrayContaining(["uno.example/robots.txt"]));
    expect(seen).not.toContain("uno.example/");
    expect(facts.httpsFailure).toBeNull();
    expect(google).toEqual([]);
  });

  it("measures an allowed site through a redirect, reading each robots.txt once", async () => {
    const { google, result } = run({
      "uno.example": { "/robots.txt": { status: 404 }, "/": { status: 301, location: "http://dos.example/inicio" } },
      "dos.example": { "/robots.txt": robots("/privado"), "/inicio": { body: HTML_OK } },
    });
    const { facts } = await result;
    expect(facts.page.kind).toBe("fetched");
    expect(reads("uno.example/robots.txt")).toBe(1);
    expect(reads("dos.example/robots.txt")).toBe(1);
    expect(google.sort()).toEqual(["crux http://dos.example/inicio", "psi http://dos.example/inicio"]);
    expect(facts.robots).toMatchObject({ url: "http://dos.example/robots.txt", homepageAllowedForUs: true });
  });

  it("treats a robots.txt that cannot be read as today: the page is requested", async () => {
    const { result } = run({ "uno.example": { "/robots.txt": { status: 500 }, "/": { body: HTML_OK } } });
    expect((await result).facts.page.kind).toBe("fetched");
    expect(seen).toContain("uno.example/");
  });
});
