import { describe, expect, it } from "vitest";
import type { CompetitorComparison } from "@/modules/competitor-comparison/schema";
import type { LatestComparison } from "@/modules/competitor-comparison/service";
import type { FieldResult, SiteResult } from "@/modules/competitor-comparison/sites";
import { summarizeComparison, type ComparisonRow } from "@/modules/competitor-comparison/summary";

const NOW = new Date("2026-10-31T12:00:00Z");
const company = { name: "Olessium", domain: "olessium.com", hostname: "www.olessium.com" };
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const rival = (n: number, domain: string | null, name = `Rival ${n}`) => ({ id: id(n), name, domain, createdAt: new Date(Date.UTC(2026, 0, n)) });
const realUsers = (scope: "url" | "origin"): FieldResult => ({ status: "ok", formFactor: "PHONE", scope, period: null, lcpMs: { status: "ok", value: 1 }, inpMs: { status: "not_measured" }, cls: { status: "ok", value: 0 } });

const site = (role: "company" | "competitor", n: number, domain: string, hostname = domain, over: Partial<SiteResult> = {}): SiteResult => ({
  role,
  competitorId: role === "company" ? null : id(n),
  name: role === "company" ? "Olessium" : `Rival ${n}`,
  domain,
  hostname,
  access: "http_error",
  cause: null,
  lighthouse: { status: "skipped" },
  field: { status: "skipped" },
  criticalCount: null,
  warningCount: null,
  authority: { status: "not_configured", requestedDomain: domain },
  ...over,
});
const own = (over: Partial<SiteResult> = {}) => site("company", 0, "olessium.com", "www.olessium.com", over);

const row = (status: CompetitorComparison["status"], over: Partial<CompetitorComparison> = {}): CompetitorComparison => ({
  id: id(9),
  workspaceId: id(8),
  status,
  sites: null,
  rulesVersion: "r",
  error: null,
  startedAt: new Date("2026-10-31T11:50:00Z"),
  finishedAt: status === "running" ? null : new Date("2026-10-31T11:53:00Z"),
  ...over,
});
const completed = (sites: SiteResult[]) => row("completed", { sites: { version: 1, sites } });
const stored = (latest: CompetitorComparison | null, latestCompleted: CompetitorComparison | null = latest): LatestComparison => ({ latest, latestCompleted });
const summarize = (s: LatestComparison, competitors = [rival(1, "uno.es")], over: { company?: typeof company; pageSpeed?: boolean } = {}) =>
  summarizeComparison({ stored: s, company: over.company ?? company, competitors, config: { pageSpeed: over.pageSpeed ?? true }, now: NOW });
const states = (rows: ComparisonRow[]) => rows.map((r) => [r.domain, r.state]);

describe("summarizeComparison", () => {
  it("shows nothing measured before the first comparison", () => {
    const s = summarize(stored(null));
    expect(s).toMatchObject({ blocker: null, running: false, failure: null, unreadable: false, capture: null });
    expect(states(s.rows)).toEqual([["olessium.com", "pending"], ["uno.es", "pending"]]);
  });

  it("gives each row the figures of the last comparison, company first", () => {
    const s = summarize(stored(completed([own(), site("competitor", 1, "uno.es")])));
    expect(states(s.rows)).toEqual([["olessium.com", "measured"], ["uno.es", "measured"]]);
    expect(s.rows[0]).toMatchObject({ role: "company" });
    expect(s.capture?.finishedAt).toEqual(new Date("2026-10-31T11:53:00Z"));
  });

  it("keeps the last comparison after a later failure and says so", () => {
    const last = completed([own(), site("competitor", 1, "uno.es")]);
    const failed = row("failed", { error: "internal_error", finishedAt: new Date("2026-10-31T11:58:00Z") });
    const s = summarize(stored(failed, last));
    expect(s.failure).toEqual({ error: "internal_error", at: new Date("2026-10-31T11:58:00Z") });
    expect(states(s.rows)).toContainEqual(["uno.es", "measured"]);
  });

  it("tells a failure with nothing measured yet", () => {
    expect(summarize(stored(row("failed", { error: "interrupted" }), null)).failure?.error).toBe("interrupted");
  });

  it("says a comparison is running, but not one that stopped answering", () => {
    expect(summarize(stored(row("running", { startedAt: new Date("2026-10-31T11:58:00Z") }), null)).running).toBe(true);
    expect(summarize(stored(row("running", { startedAt: new Date("2026-10-31T11:40:00Z") }), null)).running).toBe(false);
  });

  it("hides an archived competitor and leaves a new one pending", () => {
    const s = summarize(stored(completed([own(), site("competitor", 1, "uno.es")])), [rival(2, "dos.es")]);
    expect(states(s.rows)).toEqual([["olessium.com", "measured"], ["dos.es", "pending"]]);
  });

  it("leaves a competitor pending when its domain changed", () => {
    const s = summarize(stored(completed([own(), site("competitor", 1, "uno.es")])), [rival(1, "otro.es")]);
    expect(states(s.rows)).toContainEqual(["otro.es", "pending"]);
  });

  it.each([
    ["domain", { ...company, domain: "nuevo.com", hostname: "www.olessium.com" }],
    ["hostname", { ...company, hostname: "olessium.com" }],
  ])("leaves the company pending when its %s changed", (_, changed) => {
    expect(summarize(stored(completed([own(), site("competitor", 1, "uno.es")])), undefined, { company: changed }).rows[0]!.state).toBe("pending");
  });

  it("does not take a new name for a new site, and keeps the name measured", () => {
    const s = summarize(stored(completed([own(), site("competitor", 1, "uno.es")])), [rival(1, "uno.es", "Nombre nuevo")], { company: { ...company, name: "Olessium SL" } });
    expect(s.rows[0]).toMatchObject({ state: "measured", name: "Olessium SL", measuredAs: "Olessium" });
    expect(s.rows[1]).toMatchObject({ state: "measured", name: "Nombre nuevo", measuredAs: "Rival 1" });
  });

  it("warns about an unreadable comparison and leaves every row pending", () => {
    const s = summarize(stored(row("completed", { sites: { version: 9 } })));
    expect(s.unreadable).toBe(true);
    expect(s.rows.every((r) => r.state === "pending")).toBe(true);
  });

  it("creates no pending row for duplicates of the company or of another competitor", () => {
    const s = summarize(stored(completed([own(), site("competitor", 1, "uno.es")])), [rival(1, "uno.es"), rival(2, "uno.es"), rival(3, "olessium.com")]);
    expect(states(s.rows)).toEqual([["olessium.com", "measured"], ["uno.es", "measured"]]);
  });

  it("lists competitors without a website apart", () => {
    expect(summarize(stored(null), [rival(1, "uno.es"), rival(2, null)]).withoutWebsite).toEqual(["Rival 2"]);
  });

  it("flags mixed real-user scopes only when they differ", () => {
    const mixed = completed([own({ field: realUsers("url") }), site("competitor", 1, "uno.es", "uno.es", { field: realUsers("origin") })]);
    const same = completed([own({ field: realUsers("origin") }), site("competitor", 1, "uno.es", "uno.es", { field: realUsers("origin") })]);
    expect(summarize(stored(mixed)).mixedFieldScope).toBe(true);
    expect(summarize(stored(same)).mixedFieldScope).toBe(false);
  });

  it.each<[string, Parameters<typeof summarize>[1], boolean, string | null]>([
    ["ready", [rival(1, "uno.es")], true, null],
    ["without PageSpeed", [rival(1, "uno.es")], false, "not_configured"],
    ["without competitors", [], true, "no_competitors"],
    ["without competitors with a website", [rival(1, null)], true, "no_competitors"],
    ["when they all repeat the company", [rival(1, "olessium.com")], true, "no_competitors"],
  ])("resolves what stops a comparison: %s", (_, competitors, pageSpeed, blocker) => {
    expect(summarize(stored(null), competitors, { pageSpeed }).blocker).toBe(blocker);
  });
});
