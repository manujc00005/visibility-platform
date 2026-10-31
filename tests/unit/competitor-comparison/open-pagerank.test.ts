import { describe, expect, it } from "vitest";
import { ENDPOINT, fetchAuthority } from "@/modules/competitor-comparison/open-pagerank";

const KEY = "opr_live_secreta";
const found = (domain: string, over: Record<string, unknown> = {}) => ({ domain, found: true, open_page_rank: 4.2, rank: 1200, referring_domains: 88, ...over });
const body = (results: unknown[], over: Record<string, unknown> = {}) => ({ as_of: "2026-10-01", count: results.length, results, invalid: [], ...over });

function provider(answer: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return answer();
  }) as typeof fetch;
  return { calls, fetchImpl };
}
const respond = (results: unknown[], domains: string[], over?: Record<string, unknown>) => fetchAuthority(domains, { apiKey: KEY, ...provider(() => Response.json(body(results, over))) });

describe("fetchAuthority", () => {
  it("makes one request with every domain and no history", async () => {
    const { calls, fetchImpl } = provider(() => Response.json(body([found("uno.es"), found("dos.es")])));
    await fetchAuthority(["uno.es", "dos.es", "uno.es"], { apiKey: KEY, fetchImpl });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(ENDPOINT);
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.headers).toMatchObject({ authorization: `Bearer ${KEY}`, "content-type": "application/json" });
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ domains: ["uno.es", "dos.es"], include_history: false });
  });

  it("makes no request without a key", async () => {
    const { calls, fetchImpl } = provider(() => Response.json({}));
    const results = await fetchAuthority(["uno.es"], { apiKey: undefined, fetchImpl });
    expect(calls).toHaveLength(0);
    expect(results.get("uno.es")).toEqual({ status: "not_configured", requestedDomain: "uno.es" });
  });

  it("maps a domain found", async () => {
    const results = await respond([found("uno.es")], ["uno.es"]);
    expect(results.get("uno.es")).toEqual({ status: "ok", requestedDomain: "uno.es", effectiveDomain: "uno.es", scope: "registered_domain", asOf: "2026-10-01", score: 4.2, rank: 1200, referringDomains: 88 });
  });

  it("keeps a real zero and accepts no rank or referring domains", async () => {
    const results = await respond([found("uno.es", { open_page_rank: 0, referring_domains: 0 }), found("dos.es", { rank: null, referring_domains: null }), { domain: "tres.es", found: true, open_page_rank: 1 }], ["uno.es", "dos.es", "tres.es"]);
    expect(results.get("uno.es")).toMatchObject({ status: "ok", score: 0, referringDomains: 0 });
    expect(results.get("dos.es")).toMatchObject({ status: "ok", rank: null, referringDomains: null });
    expect(results.get("tres.es")).toMatchObject({ status: "ok", rank: null, referringDomains: null });
  });

  it.each([
    ["with null figures", { domain: "uno.es", found: false, open_page_rank: null, rank: null, referring_domains: null }],
    ["without figures", { domain: "uno.es", found: false }],
  ])("only an explicit found:false is not found, %s", async (_, result) => {
    expect((await respond([result], ["uno.es"])).get("uno.es")).toEqual({ status: "not_found", requestedDomain: "uno.es", effectiveDomain: "uno.es", scope: "registered_domain", asOf: "2026-10-01" });
  });

  it("does not depend on the order and matches a host to its registered domain", async () => {
    const results = await respond([found("otro.es", { rank: 2 }), found("uno.es", { rank: 1 })], ["blog.uno.es", "otro.es"]);
    expect(results.get("blog.uno.es")).toMatchObject({ status: "ok", requestedDomain: "blog.uno.es", effectiveDomain: "uno.es", rank: 1 });
    expect(results.get("otro.es")).toMatchObject({ rank: 2 });
  });

  it("prefers the exact domain and then the longest parent", async () => {
    const results = await respond([found("uno.es", { rank: 1 }), found("blog.uno.es", { rank: 2 }), found("a.blog.uno.es", { rank: 3 })], ["uno.es", "x.blog.uno.es"]);
    expect(results.get("uno.es")).toMatchObject({ rank: 1 });
    expect(results.get("x.blog.uno.es")).toMatchObject({ rank: 2, effectiveDomain: "blog.uno.es" });
  });

  it("does not match a domain that merely ends with the same letters", async () => {
    expect((await respond([found("uno.es")], ["bueno.es"])).get("bueno.es")).toEqual({ status: "error", requestedDomain: "bueno.es" });
  });

  it("ignores hosts: a shared platform stays not found in the domain graph", async () => {
    const result = { domain: "github.io", found: false, hosts: [{ host: "uno.github.io", found: true, open_page_rank: 6, rank: 5, referring_hosts: 9 }] };
    expect((await respond([result], ["uno.github.io"])).get("uno.github.io")).toMatchObject({ status: "not_found", effectiveDomain: "github.io" });
  });

  it("fails only the sites whose result is missing, invalid or contradictory", async () => {
    const results = await respond(
      [found("bien.es"), found("mal.es", { open_page_rank: 11 }), found("rango.es", { rank: 0 }), found("doble.es", { rank: 1 }), found("doble.es", { rank: 2 }), found("igual.es"), found("igual.es"), { domain: "nada.es" }, { found: true }, "x"],
      ["bien.es", "mal.es", "rango.es", "doble.es", "igual.es", "nada.es", "ausente.es"],
    );
    expect(results.get("bien.es")?.status).toBe("ok");
    expect(results.get("igual.es")?.status).toBe("ok");
    for (const domain of ["mal.es", "rango.es", "doble.es", "nada.es", "ausente.es"]) expect(results.get(domain)).toEqual({ status: "error", requestedDomain: domain });
  });

  it("rejects figures on a domain not found", async () => {
    expect((await respond([{ domain: "uno.es", found: false, open_page_rank: 3 }], ["uno.es"])).get("uno.es")?.status).toBe("error");
  });

  it("invents no date", async () => {
    expect((await respond([found("uno.es")], ["uno.es"], { as_of: "2026-02-30" })).get("uno.es")).toEqual({ status: "error", requestedDomain: "uno.es" });
  });

  it.each<[string, () => Response, string]>([
    ["a rejected key", () => Response.json({ error: { type: "authentication_error", message: KEY } }, { status: 401 }), "invalid_key"],
    ["another address", () => Response.json({ error: { type: "address_error", message: "x" } }, { status: 403 }), "ip_not_allowed"],
    ["another 403", () => Response.json({ error: { type: "other", message: "x" } }, { status: 403 }), "error"],
    ["the monthly limit", () => Response.json({ error: { type: "quota_error", message: "x" } }, { status: 429 }), "quota_exceeded"],
    ["the minute limit", () => Response.json({ error: { type: "rate_limit_error", message: "x" } }, { status: 429 }), "quota_exceeded"],
    ["a server error", () => new Response("no", { status: 503 }), "error"],
    ["a body that is not JSON", () => new Response("<html>", { status: 200 }), "error"],
    ["an unexpected shape", () => Response.json({ results: "x" }), "error"],
  ])("gives every site the same state on %s, without the key", async (_, answer, status) => {
    const results = await fetchAuthority(["uno.es", "dos.es"], { apiKey: KEY, ...provider(answer) });
    expect([...results.values()]).toEqual([
      { status, requestedDomain: "uno.es" },
      { status, requestedDomain: "dos.es" },
    ]);
    expect(JSON.stringify([...results.values()])).not.toContain(KEY);
  });

  it("treats a timeout as an error", async () => {
    const fetchImpl = ((_url: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("t", "TimeoutError"))))) as typeof fetch;
    expect((await fetchAuthority(["uno.es"], { apiKey: KEY, fetchImpl, timeoutMs: 5 })).get("uno.es")).toEqual({ status: "error", requestedDomain: "uno.es" });
  });
});
