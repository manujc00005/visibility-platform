import { describe, expect, it } from "vitest";
import { collectSearchConsole, periodsFor, pickProperty } from "@/modules/search-console/collect";
import { parseServiceAccount } from "@/modules/search-console/credentials";
import { serviceAccountJson } from "./fixtures";

const parsed = parseServiceAccount(serviceAccountJson());
if (!parsed?.ok) throw new Error("fixture");
const account = parsed.value;
const site = { domain: "olessium.com", hostname: "olessium.com" };
const NOW = new Date("2026-10-27T10:00:00Z");

describe("periodsFor", () => {
  it("ends 3 days back and covers two consecutive 28-day windows", () => {
    expect(periodsFor(NOW)).toEqual({
      current: { start: "2026-09-27", end: "2026-10-24" },
      previous: { start: "2026-08-30", end: "2026-09-26" },
    });
  });

  it("crosses month and year boundaries", () => {
    expect(periodsFor(new Date("2027-01-02T23:59:59Z")).current).toEqual({ start: "2026-12-03", end: "2026-12-30" });
  });
});

describe("pickProperty", () => {
  const entry = (siteUrl: string, permissionLevel = "siteFullUser") => ({ siteUrl, permissionLevel });

  it("prefers the domain property", () => {
    expect(pickProperty([entry("https://olessium.com/"), entry("sc-domain:olessium.com")], site)).toBe("sc-domain:olessium.com");
  });

  it("falls back to URL-prefix properties, https before http", () => {
    expect(pickProperty([entry("http://olessium.com/"), entry("https://www.olessium.com/")], site)).toBe("https://www.olessium.com/");
    expect(pickProperty([entry("http://olessium.com/")], site)).toBe("http://olessium.com/");
  });

  it("uses the stored host first when it differs from the domain", () => {
    const www = { domain: "e.es", hostname: "www.e.es" };
    expect(pickProperty([entry("https://e.es/"), entry("https://www.e.es/")], www)).toBe("https://www.e.es/");
  });

  it("ignores unverified access, other domains and lookalikes", () => {
    expect(pickProperty([entry("sc-domain:olessium.com", "siteUnverifiedUser")], site)).toBeNull();
    expect(pickProperty([entry("sc-domain:notolessium.com"), entry("https://olessium.com.evil.es/")], site)).toBeNull();
  });
});

const totals = (clicks: number, impressions: number) => ({ rows: [{ clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: 9.4 }] });

describe("collectSearchConsole", () => {
  function google(sites: unknown, analytics: (body: Record<string, unknown>) => unknown) {
    const calls: { url: string; body: string }[] = [];
    const impl = (async (input: string, init?: RequestInit) => {
      const url = String(input);
      const body = String(init?.body ?? "");
      calls.push({ url, body });
      if (url.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "tok" });
      if (url.endsWith("/sites")) return Response.json(sites);
      return Response.json(analytics(JSON.parse(body)));
    }) as typeof fetch;
    return { calls, impl };
  }

  it("collects totals for both periods and the top queries and pages", async () => {
    const { calls, impl } = google({ siteEntry: [{ siteUrl: "sc-domain:olessium.com", permissionLevel: "siteOwner" }] }, (body) => {
      const dims = body.dimensions as string[];
      if (dims.length === 0) return body.startDate === "2026-09-27" ? totals(12, 400) : totals(8, 300);
      if (dims[0] === "query") return { rows: [{ keys: ["crm agencia ".repeat(30)], clicks: 5, impressions: 50, ctr: 0.1, position: 4.2 }] };
      return { rows: [{ keys: ["https://olessium.com/es"], clicks: 10, impressions: 300, ctr: 0.033, position: 8.1 }] };
    });
    const outcome = await collectSearchConsole(account, site, { fetchImpl: impl, now: NOW });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data).toMatchObject({
      property: "sc-domain:olessium.com",
      current: { start: "2026-09-27", end: "2026-10-24" },
      totals: { clicks: 12, impressions: 400 },
      previousTotals: { clicks: 8, impressions: 300 },
      pages: [{ page: "https://olessium.com/es", clicks: 10 }],
    });
    expect(outcome.data.queries[0]!.query).toHaveLength(200);
    // token + sites + 4 queries.
    expect(calls).toHaveLength(6);
  });

  it("returns zeros, not an error, for a property without data", async () => {
    const { impl } = google({ siteEntry: [{ siteUrl: "https://olessium.com/", permissionLevel: "siteFullUser" }] }, () => ({}));
    const outcome = await collectSearchConsole(account, site, { fetchImpl: impl, now: NOW });
    expect(outcome.ok && outcome.data.totals).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: 0 });
  });

  it("reports no_access with how many properties the account can read", async () => {
    const { calls, impl } = google({ siteEntry: [{ siteUrl: "sc-domain:other.es", permissionLevel: "siteOwner" }] }, () => ({}));
    const outcome = await collectSearchConsole(account, site, { fetchImpl: impl, now: NOW });
    expect(outcome).toMatchObject({ ok: false, kind: "no_access", property: null, accessibleProperties: 1 });
    expect(calls).toHaveLength(2);
  });

  it("keeps the property when a later query fails", async () => {
    const impl = (async (input: string) => {
      const url = String(input);
      if (url.includes("oauth2")) return Response.json({ access_token: "tok" });
      if (url.endsWith("/sites")) return Response.json({ siteEntry: [{ siteUrl: "sc-domain:olessium.com", permissionLevel: "siteOwner" }] });
      return Response.json({}, { status: 429 });
    }) as typeof fetch;
    const outcome = await collectSearchConsole(account, site, { fetchImpl: impl, now: NOW });
    expect(outcome).toMatchObject({ ok: false, kind: "quota_exceeded", property: "sc-domain:olessium.com" });
  });
});
