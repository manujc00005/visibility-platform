import { describe, expect, it } from "vitest";
import { aggregateKeywordSeries, keywordExpression, keywordWindow, normalizeTrackedKeyword, parseKeywordSeries } from "@/modules/search-console/keywords";

const row = (date: string, query: string, impressions = 10, position = 12, clicks = 1) => ({ keys: [date, query], clicks, impressions, position, ctr: impressions ? clicks / impressions : 0 });
const end = "2026-10-27";

describe("tracked keyword identity and expression", () => {
  it("canonicalizes without dropping accents or punctuation, counting code points", () => {
    expect(normalizeTrackedKeyword("  CAFE\u0301   C++ ")).toBe("café c++");
    expect(normalizeTrackedKeyword("😀😀")).toBe("😀😀");
    for (const input of ["a", "x".repeat(81), 42, "", " \n "]) expect(() => normalizeTrackedKeyword(input)).toThrow();
    expect(normalizeTrackedKeyword("😀".repeat(80))).toHaveLength(160);
    for (const input of ["😀", "😀".repeat(81)]) expect(() => normalizeTrackedKeyword(input)).toThrow();
  });
  it("keeps marks that do not compose and joiners, as a different identity", () => {
    expect(normalizeTrackedKeyword("x\u0301y")).toBe("x\u0301y");
    expect(normalizeTrackedKeyword("x\u0301y")).not.toBe(normalizeTrackedKeyword("xy"));
    expect(normalizeTrackedKeyword("👩\u200d💻")).toBe("👩\u200d💻");
  });
  it.each(["a\0b", "ab\u0007", "\ud800ab", "crm\u202e", "\u2066crm"])("rejects text Postgres or the page would not show as typed: %j", (input) => {
    expect(() => normalizeTrackedKeyword(input)).toThrow();
  });
  it("matches literal case, repeated spaces, NFC/NFD but not unrelated text", () => {
    const expression = keywordExpression(["café c++", "a|b", "[x].*", "<script>"]);
    const matcher = new RegExp(expression!.slice(4), "iu");
    for (const q of ["CAFÉ   C++", "cafe\u0301 c++", "a|b", "[x].*", "<script>"]) expect(matcher.test(q), q).toBe(true);
    for (const q of ["cafe c++", "a", "b", "xxx", "otro café c++"]) expect(matcher.test(q), q).toBe(false);
    expect(keywordExpression([])).toBeNull();
    expect(() => keywordExpression(["CRM", "crm"])).toThrow();
  });
  it("enforces the real UTF-8 budget including pattern overhead", () => {
    const keywords = Array.from({ length: 25 }, (_, i) => `${i} ${"界".repeat(77)}`);
    expect(() => keywordExpression(keywords)).toThrow();
    expect(() => keywordExpression(Array.from({length: 26}, (_,i)=>`word ${i}`))).toThrow();
    const boundary = Array.from({length:25},(_,i)=>`${String(i).padStart(2,"0")}${"a".repeat(78)}`);
    let remaining = 1031;
    for(let i=0;i<boundary.length;i++){ const n=Math.min(remaining,78); boundary[i]=boundary[i]!.slice(0,2)+"界".repeat(n)+"a".repeat(78-n); remaining-=n; }
    expect(Buffer.byteLength(keywordExpression(boundary)!,"utf8")).toBe(4096);
    boundary[24]=boundary[24]!.replace(/a$/,".");
    expect(()=>keywordExpression(boundary)).toThrow(expect.objectContaining({kind:"keyword_limit"}));
  });
});

describe("weekly collection", () => {
  it.each(["2026-10-27", "2024-03-04", "2027-01-01", "2026-03-30"])("has 182 inclusive days and 26 slots ending %s", (date) => {
    const window = keywordWindow(date);
    expect((Date.parse(window.end) - Date.parse(window.start)) / 86400000).toBe(181);
    expect(window.starts).toHaveLength(26);
    expect(Date.parse(window.starts[25]!) + 6 * 86400000).toBe(Date.parse(date));
  });
  it("weights variants, counts distinct days, preserves gaps and frozen list", () => {
    const w = keywordWindow(end);
    const data = aggregateKeywordSeries(["café crm", "no data"], end, [row(w.start, "CAFÉ  CRM", 10, 12), row(w.start, "cafe\u0301 crm", 30, 4), row(end, "café crm", 20, 8), row(end, "other"), row(end, "no data", 0, 0, 0)]);
    expect(data.keywords[0]!.weeks).toEqual([
      { start: w.start, clicks: 2, impressions: 40, position: 6, daysWithData: 1 },
      { start: w.starts[25], clicks: 1, impressions: 20, position: 8, daysWithData: 1 },
    ]);
    expect(data.keywords[1]!.weeks).toEqual([]);
    expect(parseKeywordSeries(data)).toEqual(data);
    expect(aggregateKeywordSeries([], end, []).keywords).toEqual([]);
  });
  it.each([
    row("2026-02-30", "crm"), row("1999-01-01", "crm"), row(end, "crm", 0, 0, 1),
    row(end, "crm", 1, 0), row(end, "crm", 1, NaN), row(end, "crm", 1, Infinity), row(end, "crm", 1, 8, 2),
    { ...row(end, "crm"), keys: [end] },
  ])("rejects invalid accepted rows", (bad) => expect(() => aggregateKeywordSeries(["crm"], end, [bad])).toThrow());
  it("rejects duplicate original rows and possible truncation", () => {
    expect(() => aggregateKeywordSeries(["crm"], end, [row(end, "crm"), row(end, "crm")])).toThrow();
    expect(() => aggregateKeywordSeries(["crm"], end, Array(25000).fill(row(end, "other")))).toThrow(expect.objectContaining({ kind: "keyword_limit" }));
  });
  it("rejects dimensions in the wrong order instead of reading them as no data", () => {
    expect(() => aggregateKeywordSeries(["crm"], end, [{ ...row(end, "crm"), keys: ["crm", end] }])).toThrow();
  });
  it.each([
    ["end of month", "2026-10-02", "2026-09-30", "2026-10-01"],
    ["end of year", "2027-01-01", "2026-12-31", "2027-01-01"],
    ["leap day", "2024-03-04", "2024-02-29", "2024-03-01"],
    ["daylight saving change", "2026-03-30", "2026-03-28", "2026-03-29"],
  ])("sums the days of one slot across %s", (_, last, a, b) => {
    const [week] = aggregateKeywordSeries(["crm"], last, [row(a, "crm", 10, 4, 1), row(b, "crm", 30, 8, 2)]).keywords[0]!.weeks;
    expect(week).toEqual({ start: keywordWindow(last).starts[25], clicks: 3, impressions: 40, position: 7, daysWithData: 2 });
  });
  it("rejects malformed persisted dates, anchors, duplicate keywords and weeks", () => {
    const good = aggregateKeywordSeries(["crm"], end, [row(end, "crm")]);
    for (const bad of [
      { ...good, end: "2026-02-30" }, { ...good, keywords: [...good.keywords, ...good.keywords] },
      {...good, keywords:[{keyword:"CRM", weeks:[]}]},
      {...good, keywords:[{keyword:"crm", weeks:[{...good.keywords[0]!.weeks[0],start:end}]}]},
      {...good, keywords:[{keyword:"crm", weeks:[...good.keywords[0]!.weeks,...good.keywords[0]!.weeks]}]},
      {...good, version:2},
    ]) expect(parseKeywordSeries(bad)).toBeNull();
  });
});
