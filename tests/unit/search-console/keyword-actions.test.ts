import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks=vi.hoisted(()=>({add:vi.fn(),remove:vi.fn(),revalidate:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
vi.mock("@/db/client",()=>({getDb:()=>({})}));
vi.mock("@/i18n/server",()=>({getLocale:async()=>"en"}));
vi.mock("@/modules/search-console/tracked-keywords-service",()=>({addTrackedKeyword:mocks.add,removeTrackedKeyword:mocks.remove}));
import { addTrackedKeywordAction, removeTrackedKeywordAction } from "@/app/workspaces/[id]/seo/actions";
const state={error:null,value:"",revision:0};
beforeEach(()=>vi.clearAllMocks());
describe("keyword actions",()=>{
 it("preserves the typed value and returns localized duplicate feedback",async()=>{
  mocks.add.mockResolvedValue({ok:false,error:"duplicate"});const form=new FormData();form.set("keyword","  CRM  ");
  const result=await addTrackedKeywordAction("workspace",state,form);
  expect(result).toEqual({error:"You already follow this search.",value:"  CRM  ",revision:0});expect(mocks.revalidate).not.toHaveBeenCalled();
 });
 it("revalidates SEO only and clears successful input",async()=>{
  mocks.add.mockResolvedValue({ok:true});const form=new FormData();form.set("keyword","crm");
  expect(await addTrackedKeywordAction("workspace",state,form)).toEqual({error:null,value:"",revision:1});
  expect(mocks.revalidate.mock.calls).toEqual([["/workspaces/workspace/seo"]]);
 });
 it("scopes deletion and returns safe unexpected failure",async()=>{
  mocks.remove.mockRejectedValue(new Error("secret"));const result=await removeTrackedKeywordAction("workspace","keyword",state);
  expect(mocks.remove).toHaveBeenCalledWith({},"workspace","keyword");expect(result.error).not.toContain("secret");
 });
});
