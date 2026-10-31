import { describe, it, expect } from "vitest";
import type { SearchConsoleSnapshot } from "@/modules/search-console/schema";
import { aggregateKeywordSeries, keywordWindow } from "@/modules/search-console/keywords";
import { summarizeTrackedKeywords } from "@/modules/search-console/keyword-summary";
function completed(overrides: Partial<SearchConsoleSnapshot> = {}): SearchConsoleSnapshot {
  return {
    id: "s1",
    workspaceId: "w1",
    status: "completed",
    provider: "google_gsc",
    captureCondition: "owner_api",
    property: "sc-domain:olessium.com",
    currentStart: "2026-09-27",
    currentEnd: "2026-10-24",
    previousStart: "2026-08-30",
    previousEnd: "2026-09-26",
    totals: { clicks: 12, impressions: 400, ctr: 0.03, position: 9.4 },
    previousTotals: { clicks: 8, impressions: 390, ctr: 0.0205, position: 12.1 },
    queries: [{ query: "crm agencias", clicks: 5, impressions: 50, ctr: 0.1, position: 4.2 }],
    pages: [],
    segments: null,
    keywordSeries: null,
    errorKind: null,
    errorMessage: null,
    accessibleProperties: null,
    createdAt: new Date("2026-10-27T10:00:00Z"),
    ...overrides,
  };
}

const active=[{id:"k1",keyword:"crm"}];
const end="2026-10-27";
function capture(positions:number[]) {
 const starts=keywordWindow(end).starts;
 return completed({keywordSeries:aggregateKeywordSeries(["crm"],end,positions.map((position,i)=>({keys:[starts[i]!,"crm"],clicks:1,impressions:5,ctr:.2,position})))});
}
describe("keyword summary",()=>{
 it("shows pending for historical null and missing item, no_data for explicit empty weeks",()=>{
  for(const snapshot of [completed(),completed({keywordSeries:aggregateKeywordSeries([],end,[])})]) expect(summarizeTrackedKeywords(active,{latest:snapshot,latestCompleted:snapshot}).rows[0]!.state).toBe("pending");
  const snapshot=capture([]);
  expect(summarizeTrackedKeywords(active,{latest:snapshot,latestCompleted:snapshot}).rows[0]!.state).toBe("no_data");
 });
 it.each([[12,8,"better"],[8,12,"worse"],[8,8.5,"worse"],[8,7.5,"better"],[8,8.499999,"same"],[8,8.4999999999,"worse"]])("compares raw %s to %s as %s",(first,last,direction)=>{
  const snapshot=capture([Number(first),Number(last)]);
  const row=summarizeTrackedKeywords(active,{latest:null,latestCompleted:snapshot}).rows[0]!;
  expect(row.change?.direction).toBe(direction);
  expect(row.first?.start).toBe(keywordWindow(end).start);
  expect(row.latest?.daysWithData).toBe(1);expect(row.trailingMissing).toBe(24);
 });
 it("uses latestCompleted after a failure, current active list and one week",()=>{
  const snapshot=capture([8]); const failed=completed({status:"failed",keywordSeries:null});
  const summary=summarizeTrackedKeywords([...active,{id:"k2",keyword:"new"}],{latest:failed,latestCompleted:snapshot});
  expect(summary.rows.map(r=>r.state)).toEqual(["ok","pending"]); expect(summary.rows[0]!.change).toBeNull();
  expect(summarizeTrackedKeywords([],{latest:failed,latestCompleted:snapshot}).rows).toEqual([]);
 });
 it("warns and falls back to pending for invalid stored non-null data",()=>{
  const snapshot=capture([8]); snapshot.keywordSeries!.keywords[0]!.weeks[0]!.start="bad";
  const summary=summarizeTrackedKeywords(active,{latest:snapshot,latestCompleted:snapshot});
  expect(summary.warning).toBe(true);expect(summary.rows[0]!.state).toBe("pending");
 });
});
