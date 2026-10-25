import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { isAllowedByRobots, parseRobots } from "@/modules/audits/robots";
import { parseSitemap, SITEMAP_MAX_DECOMPRESSED_BYTES } from "@/modules/audits/sitemap";

describe("robots.txt", () => {
  const robots = parseRobots(`
# comentario
User-agent: *
Disallow: /admin/
Allow: /admin/public/
Disallow: /*.pdf$
Disallow:

User-agent: Googlebot
User-agent: Bingbot
Disallow: /solo-humanos

Sitemap: https://ejemplo.es/sitemap.xml
sitemap: https://ejemplo.es/sitemap-blog.xml.gz
`);

  it("collects sitemaps declared anywhere", () => {
    expect(robots.sitemaps).toEqual(["https://ejemplo.es/sitemap.xml", "https://ejemplo.es/sitemap-blog.xml.gz"]);
  });

  it("groups consecutive user-agent lines", () => {
    expect(robots.groups.map((g) => g.agents)).toEqual([["*"], ["googlebot", "bingbot"]]);
  });

  it("applies the longest matching rule and lets allow win ties", () => {
    expect(isAllowedByRobots(robots, "VisibilityPlatformBot", "/admin/x")).toBe(false);
    expect(isAllowedByRobots(robots, "VisibilityPlatformBot", "/admin/public/x")).toBe(true);
    expect(isAllowedByRobots(robots, "VisibilityPlatformBot", "/")).toBe(true);
  });

  it("supports * and $ wildcards", () => {
    expect(isAllowedByRobots(robots, "VisibilityPlatformBot", "/docs/a.pdf")).toBe(false);
    expect(isAllowedByRobots(robots, "VisibilityPlatformBot", "/docs/a.pdf?x=1")).toBe(true);
  });

  it("uses the most specific agent group instead of *", () => {
    expect(isAllowedByRobots(robots, "Googlebot", "/admin/x")).toBe(true);
    expect(isAllowedByRobots(robots, "Googlebot", "/solo-humanos")).toBe(false);
  });

  it("treats a full disallow as blocking the home page", () => {
    expect(isAllowedByRobots(parseRobots("User-agent: *\nDisallow: /"), "Googlebot", "/")).toBe(false);
  });

  it("allows everything when there is no applicable group or the file is empty", () => {
    expect(isAllowedByRobots(parseRobots(""), "Googlebot", "/x")).toBe(true);
    expect(isAllowedByRobots(parseRobots("User-agent: OtherBot\nDisallow: /"), "Googlebot", "/x")).toBe(true);
  });

  it("does not choke on garbage or regex metacharacters", () => {
    const messy = parseRobots("User-agent: *\nDisallow: /(a|b)+[x]\n<html>not robots</html>\n:::");
    expect(isAllowedByRobots(messy, "Bot", "/(a|b)+[x]/y")).toBe(false);
    expect(isAllowedByRobots(messy, "Bot", "/aaa")).toBe(true);
  });
});

describe("sitemap", () => {
  const urlset = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://ejemplo.es/</loc></url>
  <url><loc> https://ejemplo.es/servicios?a=1&amp;b=2 </loc></url>
  <url><loc><![CDATA[https://ejemplo.es/contacto]]></loc></url>
  <url><loc>javascript:alert(1)</loc></url>
</urlset>`;

  it("extracts locs, decodes entities and counts invalid ones", () => {
    const result = parseSitemap(Buffer.from(urlset));
    expect(result).toEqual({
      ok: true,
      sitemap: {
        kind: "urlset",
        locCount: 4,
        invalidLocCount: 1,
        sample: ["https://ejemplo.es/", "https://ejemplo.es/servicios?a=1&b=2", "https://ejemplo.es/contacto"],
      },
    });
  });

  it("recognises a sitemap index", () => {
    const index = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://ejemplo.es/s1.xml</loc></sitemap></sitemapindex>`;
    expect(parseSitemap(Buffer.from(index))).toMatchObject({ ok: true, sitemap: { kind: "index", locCount: 1 } });
  });

  it("decompresses gzip sitemaps", () => {
    expect(parseSitemap(gzipSync(urlset))).toMatchObject({ ok: true, sitemap: { locCount: 4 } });
  });

  it("rejects a gzip bomb by its decompressed size", () => {
    const bomb = gzipSync(Buffer.alloc(SITEMAP_MAX_DECOMPRESSED_BYTES + 1_000_000, 32));
    expect(bomb.length).toBeLessThan(100_000);
    expect(parseSitemap(bomb)).toEqual({ ok: false, error: "too_large" });
  });

  it("rejects DTDs and entity declarations (XXE, billion laughs)", () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><urlset><url><loc>&e;</loc></url></urlset>`;
    const laughs = `<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><urlset/>`;
    expect(parseSitemap(Buffer.from(xxe))).toEqual({ ok: false, error: "dtd_not_allowed" });
    expect(parseSitemap(Buffer.from(laughs))).toEqual({ ok: false, error: "dtd_not_allowed" });
  });

  it("rejects HTML served at /sitemap.xml and corrupt gzip", () => {
    expect(parseSitemap(Buffer.from("<!doctype html><html><body>404</body></html>"))).toEqual({ ok: false, error: "not_a_sitemap" });
    expect(parseSitemap(Buffer.from("<html><body>Not found</body></html>"))).toEqual({ ok: false, error: "not_a_sitemap" });
    expect(parseSitemap(Buffer.from([0x1f, 0x8b, 1, 2, 3]))).toEqual({ ok: false, error: "invalid_gzip" });
  });
});
