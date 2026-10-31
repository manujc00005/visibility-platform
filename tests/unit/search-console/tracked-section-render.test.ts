import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe,it,expect } from "vitest";
import { TrackedKeywordsSection } from "@/components/search-console/tracked-keywords-section";
import { getMessages } from "@/i18n/messages";
import type { AnalyticsRow } from "@/modules/search-console/google";
import { summarizeTrackedKeywords, type TrackedKeywordSummary, type TrackedKeywordView } from "@/modules/search-console/keyword-summary";
import { aggregateKeywordSeries, type KeywordSeries } from "@/modules/search-console/keywords";
import type { SearchConsoleSnapshot } from "@/modules/search-console/schema";
import { displayDay } from "@/modules/search-console/summary";
import type { KeywordActionState } from "@/app/workspaces/[id]/seo/actions";
const noop=async(s:KeywordActionState)=>s;
const base:TrackedKeywordView={id:"k",keyword:"<script>alert(1)</script>",state:"pending",weeks:[],slots:[],first:null,latest:null,change:null,trailingMissing:0};
function render(rows:TrackedKeywordView[],locale:"es"|"en"="es",warning=false){
 const summary:TrackedKeywordSummary={rows,warning,property:null,capturedAt:null,range:null};
 return renderToStaticMarkup(createElement(TrackedKeywordsSection,{summary,locale,addAction:noop,removeAction:()=>noop}));
}
describe("tracked section render",()=>{
 it.each(["es","en"] as const)("renders management and the three states in %s",locale=>{
  const html=render([base,{...base,id:"empty",keyword:"empty",state:"no_data"}],locale);
  expect(html).toContain('name="keyword"'); expect(html).toContain("&lt;script&gt;");expect(html).not.toContain("<script>alert");
  expect(html).toContain(locale==="es"?"Pendiente de una captura":"Waiting for a capture");
  expect(html).toContain(locale==="es"?"Esto no indica que no haya demanda":"This does not mean there is no demand");
  expect(html).toContain("<table");
 });
 it("hides add at 25 but retains all removals and warning",()=>{
  const html=render(Array.from({length:25},(_,i)=>({...base,id:String(i),keyword:`query ${i}`})),"es",true);
  expect(html).not.toContain('name="keyword"');expect(html.match(/aria-label="Quitar:/g)).toHaveLength(25);
  expect(html).toContain("máximo de 25");expect(html).toContain("serie guardada no es válida");
 });
});

describe("tracked section with data, from the stored series to the HTML", () => {
  const end = "2026-10-24";
  const row = (date: string, query: string, position: number, impressions = 10) => ({ keys: [date, query], clicks: 1, impressions, ctr: 1 / impressions, position });
  const snapshot = (keywordSeries: KeywordSeries) => ({ keywordSeries, property: "sc-domain:olessium.com", createdAt: new Date("2026-10-27T10:00:00Z") }) as SearchConsoleSnapshot;
  const view = (keyword: string, rows: AnalyticsRow[], locale: "es" | "en" = "es") => {
    const series = aggregateKeywordSeries([keyword], end, rows);
    const stored = { latest: snapshot(series), latestCompleted: snapshot(series) };
    const summary = summarizeTrackedKeywords([{ id: "k", keyword }], stored);
    return renderToStaticMarkup(createElement(TrackedKeywordsSection, { summary, locale, addAction: noop, removeAction: () => noop }));
  };
  const early = "2026-05-01";

  it("says a search goes up when its position number falls (AC-007)", () => {
    const html = view("crm", [row(early, "crm", 12), row(end, "crm", 8)]);
    expect(html).toContain("Sube 4,0");
    expect(html).not.toContain("Baja 4,0");
  });

  it("says a search goes down when its position number rises (AC-007)", () => {
    const html = view("crm", [row(early, "crm", 8), row(end, "crm", 12)]);
    expect(html).toContain("Baja 4,0");
    expect(html).not.toContain("Sube 4,0");
  });

  it("uses the same words in English (AC-007)", () => {
    expect(view("crm", [row(early, "crm", 12), row(end, "crm", 8)], "en")).toContain("Up 4.0");
    expect(view("crm", [row(early, "crm", 8), row(end, "crm", 12)], "en")).toContain("Down 4.0");
  });

  it("says same below half a position and has no change with one week (AC-007)", () => {
    expect(view("crm", [row(early, "crm", 8), row(end, "crm", 8.3)])).toContain(">Igual<");
    const one = view("crm", [row(end, "crm", 8)]);
    expect(one).toContain(getMessages("es").searchConsole.tracked.oneWeek);
    expect(one).not.toContain("Sube");
    expect(one).not.toContain("Baja");
  });

  it("formats dates and figures for the reader instead of showing raw ISO days", () => {
    const html = view("crm", [row(early, "crm", 12.34), row(end, "crm", 8)]);
    expect(html).not.toContain("2026-10-");
    expect(html).toContain(displayDay(end));
    expect(html).toContain("<strong>8,0</strong>");
    expect(html).toContain("12,3");
  });
});
