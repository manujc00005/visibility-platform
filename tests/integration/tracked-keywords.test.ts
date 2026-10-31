import { refreshSearchConsole, latestSearchConsole } from "@/modules/search-console/service";
import type { CollectOutcome } from "@/modules/search-console/collect";
import { summarizeTrackedKeywords } from "@/modules/search-console/keyword-summary";
import { keywordExpression } from "@/modules/search-console/keywords";
import { addTrackedKeyword, listTrackedKeywords, removeTrackedKeyword } from "@/modules/search-console/tracked-keywords-service";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { workspaces } from "@/db/schema";
import { createWorkspace } from "@/modules/workspaces/service";
import { aggregateKeywordSeries } from "@/modules/search-console/keywords";
import { createTestDb } from "./db";

const { pool, db } = createTestDb();
afterAll(() => pool.end());
beforeEach(async () => { await db.delete(workspaces); });
async function workspace() {
  const result = await createWorkspace(db, {name:"[TEST] Keywords",website:"example.com",sector:"Testing",country:"ES",city:"",services:"Testing"});
  if (!result.ok) throw new Error("fixture");
  return result.workspace;
}
const end="2026-10-27";
const series=()=>aggregateKeywordSeries(["crm"],end,[{keys:[end,"crm"],clicks:1,impressions:5,position:8,ctr:0.2}]);
async function insertSnapshot(id:string, value:unknown, status="completed") {
  return pool.query(`insert into search_console_snapshots (workspace_id,status,property,current_start,current_end,previous_start,previous_end,totals,previous_totals,error_kind,error_message,keyword_series) values ($1,$2,'sc-domain:example.com','2026-09-30','2026-10-27','2026-09-02','2026-09-29','{}','{}',$3,$4,$5::jsonb) returning id,keyword_series`,[id,status,status==="failed"?"error":null,status==="failed"?"test":null,value===null?null:JSON.stringify(value)]);
}

describe("schema migration",()=>{
 it("reads historical null and accepts empty lists and valid series",async()=>{
  const w=await workspace();
  expect((await insertSnapshot(w.id,null)).rows[0].keyword_series).toBeNull();
  for(const value of [series(),{...series(),keywords:[]},{...series(),keywords:[{keyword:"crm",weeks:[]}]}]) expect((await insertSnapshot(w.id,value)).rowCount).toBe(1);
 });
 it("rejects malformed JSON with named check 23514, never a cast error",async()=>{
  const w=await workspace();const good=series();
  for(const value of [[],{},[good],{...good,version:[1]},{...good,keywords:{}},{...good,keywords:[{}]}, {...good,keywords:[{keyword:"a",weeks:[]}]}, {...good,keywords:[{keyword:"crm",weeks:[{}]}]}, {...good,keywords:[{keyword:"crm",weeks:[{...good.keywords[0]!.weeks[0],position:0}]}]}, {...good,keywords:[{keyword:"crm",weeks:[{...good.keywords[0]!.weeks[0],daysWithData:1.5}]}]}, {...good,keywords:Array(26).fill({keyword:"crm",weeks:[]})}]) {
    await expect(insertSnapshot(w.id,value)).rejects.toMatchObject({code:"23514",constraint:"search_console_snapshots_keyword_series_shape"});
  }
  await expect(insertSnapshot(w.id,good,"failed")).rejects.toMatchObject({code:"23514",constraint:"search_console_snapshots_failed_without_keyword_series"});
 });
 it("enforces unique, length and cascade",async()=>{
  const w=await workspace();
  await pool.query("insert into tracked_keywords(workspace_id,keyword) values ($1,'crm')",[w.id]);
  await expect(pool.query("insert into tracked_keywords(workspace_id,keyword) values ($1,'crm')",[w.id])).rejects.toMatchObject({code:"23505"});
  await expect(pool.query("insert into tracked_keywords(workspace_id,keyword) values ($1,'x')",[w.id])).rejects.toMatchObject({code:"23514",constraint:"tracked_keywords_length"});
  await db.delete(workspaces).where(eq(workspaces.id,w.id));
  expect((await pool.query("select * from tracked_keywords where workspace_id=$1",[w.id])).rowCount).toBe(0);
 });
});

describe("service concurrent",()=>{
 it("canonical duplicates, scoped idempotent removal and missing workspace",async()=>{
  const w=await workspace();
  expect(await addTrackedKeyword(db,w.id,"  CRM  ")).toEqual({ok:true});
  expect(await addTrackedKeyword(db,w.id,"crm")).toEqual({ok:false,error:"duplicate"});
  const [row]=await listTrackedKeywords(db,w.id);
  expect(await removeTrackedKeyword(db,"00000000-0000-0000-0000-000000000000",row!.id)).toEqual({ok:false,error:"not_found"});
  expect((await listTrackedKeywords(db,w.id))).toHaveLength(1);
  expect(await removeTrackedKeyword(db,w.id,row!.id)).toEqual({ok:true});
  expect(await removeTrackedKeyword(db,w.id,row!.id)).toEqual({ok:true});
  expect(await addTrackedKeyword(db,w.id,"x")).toEqual({ok:false,error:"invalid"});
 });
 it("serializes two additions from 24 at the workspace boundary",async()=>{
  const w=await workspace();
  for(let i=0;i<24;i++) expect(await addTrackedKeyword(db,w.id,`query ${i}`)).toEqual({ok:true});
  const results=await Promise.all([addTrackedKeyword(db,w.id,"candidate a"),addTrackedKeyword(db,w.id,"candidate b")]);
  expect(results.filter(r=>r.ok)).toHaveLength(1);
  expect(results).toContainEqual({ok:false,error:"limit"});
  expect(await listTrackedKeywords(db,w.id)).toHaveLength(25);
 });
});

describe("capture frozen list",()=>{
 it("does not hold the workspace lock over network and persists only the initial list",async()=>{
  const w=await workspace();await addTrackedKeyword(db,w.id,"crm");
  let release!:(v:CollectOutcome)=>void;
  let started!:()=>void;const began=new Promise<void>(r=>{started=r;});
  let captured:readonly string[]=[];
  const pending=refreshSearchConsole(db,w.id,{collect(site){captured=site.trackedKeywords??[];started();return new Promise<CollectOutcome>(r=>{release=r;});}});
  await began;
  const [old]=await listTrackedKeywords(db,w.id);
  await removeTrackedKeyword(db,w.id,old!.id);await addTrackedKeyword(db,w.id,"new query");
  expect(captured).toEqual(["crm"]);
  const totals={clicks:1,impressions:5,ctr:.2,position:8};
  release({ok:true,data:{property:"sc-domain:example.com",current:{start:"2026-09-30",end},previous:{start:"2026-09-02",end:"2026-09-29"},totals,previousTotals:totals,queries:[],pages:[],segments:{version:1,terms:["example"],termsTruncated:false,branded:totals,nonBranded:totals,previousBranded:totals,previousNonBranded:totals},keywordSeries:aggregateKeywordSeries(captured,end,[{keys:[end,"crm"],...totals}])}});
  expect((await pending).ok).toBe(true);
  const stored=await latestSearchConsole(db,w.id);
  expect(stored.latestCompleted?.keywordSeries?.keywords.map(k=>k.keyword)).toEqual(["crm"]);
  const view=summarizeTrackedKeywords(await listTrackedKeywords(db,w.id),stored);
  expect(view.rows.map(r=>[r.keyword,r.state])).toEqual([["new query","pending"]]);
 });
 it("prevents a concurrent list from exceeding the regex byte budget",async()=>{
  const w=await workspace();
  const terms=Array.from({length:18},(_,i)=>`${i}${"界".repeat(78)}`);
  for(const term of terms.slice(0,16)) expect(await addTrackedKeyword(db,w.id,term)).toEqual({ok:true});
  const results=await Promise.all(terms.slice(16).map(k=>addTrackedKeyword(db,w.id,k)));
  expect(results).toContainEqual({ok:false,error:"bytes"});
  const saved=await listTrackedKeywords(db,w.id);
  expect(Buffer.byteLength(keywordExpression(saved.map(k=>k.keyword))!,"utf8")).toBeLessThanOrEqual(4096);
 });
});
