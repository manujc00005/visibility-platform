import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { KeywordSparkline } from "@/components/search-console/keyword-sparkline";
import { keywordWindow } from "@/modules/search-console/keywords";
import type { TrackedKeywordView } from "@/modules/search-console/keyword-summary";
import { displayDay } from "@/modules/search-console/summary";
const slots=keywordWindow("2026-10-27").starts;
const row=(positions:number[]):TrackedKeywordView=>({id:"k",keyword:"<script>",state:"ok",slots,weeks:positions.map((position,i)=>({start:slots[i*2]!,position,clicks:1,impressions:5,daysWithData:1})),first:null,latest:null,change:null,trailingMissing:0});
describe("keyword chart",()=>{
 it("splits gaps, puts better positions higher, describes all 26 dates and escapes text",()=>{
  const html=renderToStaticMarkup(createElement(KeywordSparkline,{row:row([12,8]),locale:"es"}));
  expect(html.match(/<path/g)).toHaveLength(2);
  expect(html).toContain('cy="40"');expect(html).toContain('cy="8"');
  for(const start of slots) expect(html).toContain(displayDay(start));
  expect(html).toContain("Sin datos");expect(html).not.toContain("<script>");
 });
 it.each([[8],[8,8],[]])("renders isolated and equal values safely: %s",(...positions)=>{
  const html=renderToStaticMarkup(createElement(KeywordSparkline,{row:row(positions),locale:"en"}));
  expect(html).not.toMatch(/NaN|Infinity/);
 });
});
