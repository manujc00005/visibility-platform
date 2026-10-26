import { describe, expect, it } from "vitest";
import { createDataForSeoClient } from "@/modules/geo/dataforseo";

/** Builds a fetch double that records requests and answers with documented response shapes. */
function fakeApi(handler: (url: string, init: RequestInit) => unknown | Promise<unknown>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const body = await handler(url, init);
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const task = { tag: "obs-1", keyword: "¿Qué clínica dental me recomiendas en Valladolid?", locationName: "Spain", languageCode: "es", forceWebSearch: true };

describe("DataForSEO client: submit", () => {
  it("sends documented fields with Basic auth and maps created tasks by tag", async () => {
    const api = fakeApi(() => ({
      status_code: 20000,
      status_message: "Ok.",
      cost: 0.0024,
      tasks: [
        { id: "11111111-2222-3333-4444-555555555555", status_code: 20100, status_message: "Task Created.", cost: 0.0012, data: { tag: "obs-1" } },
        { id: "x", status_code: 40501, status_message: "Invalid Field", cost: 0, data: { tag: "obs-2" } },
      ],
    }));
    const client = createDataForSeoClient({ login: "user@x.es", password: "secret", fetchImpl: api.fetchImpl });
    const result = await client.submit([task, { ...task, tag: "obs-2" }]);
    expect(result).toEqual({
      kind: "answered",
      tasks: [
        { tag: "obs-1", id: "11111111-2222-3333-4444-555555555555", created: true, costUsd: 0.0012, message: "20100 Task Created." },
        { tag: "obs-2", id: null, created: false, costUsd: 0, message: "40501 Invalid Field" },
      ],
    });
    const { url, init } = api.calls[0]!;
    expect(url).toBe("https://api.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper/task_post");
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("user@x.es:secret").toString("base64")}`);
    expect(JSON.parse(init.body as string)[0]).toEqual({
      keyword: task.keyword,
      location_name: "Spain",
      language_code: "es",
      force_web_search: true,
      tag: "obs-1",
    });
  });

  it("treats a refused request (insufficient funds, unauthorized) as rejected without charge", async () => {
    const funds = fakeApi(() => ({ status_code: 40210, status_message: "insufficient funds.", tasks: [] }));
    expect(await createDataForSeoClient({ login: "a", password: "b", fetchImpl: funds.fetchImpl }).submit([task])).toEqual({
      kind: "rejected",
      message: "40210 insufficient funds.",
    });
    const unauthorized = fakeApi(() => new Response("{}", { status: 401 }));
    expect((await createDataForSeoClient({ login: "a", password: "b", fetchImpl: unauthorized.fetchImpl }).submit([task])).kind).toBe("rejected");
  });

  it("treats a timeout or network error after sending as uncertain (may have been charged)", async () => {
    const hang = fakeApi(
      (_url, init) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal!.reason))),
    );
    const result = await createDataForSeoClient({ login: "a", password: "b", fetchImpl: hang.fetchImpl, timeoutMs: 30 }).submit([task]);
    expect(result.kind).toBe("uncertain");
  });

  it("refuses empty batches and batches above the documented 100-task limit", async () => {
    const client = createDataForSeoClient({ login: "a", password: "b", fetchImpl: fakeApi(() => ({})).fetchImpl });
    await expect(client.submit([])).rejects.toThrow();
    await expect(client.submit(Array.from({ length: 101 }, (_, i) => ({ ...task, tag: `t${i}` })))).rejects.toThrow();
  });
});

describe("DataForSEO client: collect and reconcile", () => {
  const id = "11111111-2222-3333-4444-555555555555";

  it("reports queued tasks as pending", async () => {
    const api = fakeApi(() => ({ status_code: 20000, tasks: [{ id, status_code: 40602, status_message: "Task In Queue." }] }));
    expect(await createDataForSeoClient({ login: "a", password: "b", fetchImpl: api.fetchImpl }).collect(id)).toEqual({ state: "pending" });
    expect(api.calls[0]!.url).toBe(`https://api.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper/task_get/advanced/${id}`);
  });

  it("returns the answer markdown and only the cited sources, not all search results", async () => {
    const api = fakeApi(() => ({
      status_code: 20000,
      tasks: [
        {
          id,
          status_code: 20000,
          result: [
            {
              markdown: "Te recomiendo **Clínica Dental García**.",
              sources: [{ type: "chat_gpt_source", url: "https://www.clinicagarcia.es/", title: "Clínica García", domain: "www.clinicagarcia.es" }],
              search_results: [{ type: "chatgpt_search_result", url: "https://unused.example/", title: "Unused" }],
            },
          ],
        },
      ],
    }));
    expect(await createDataForSeoClient({ login: "a", password: "b", fetchImpl: api.fetchImpl }).collect(id)).toEqual({
      state: "ready",
      markdown: "Te recomiendo **Clínica Dental García**.",
      sources: [{ url: "https://www.clinicagarcia.es/", title: "Clínica García" }],
    });
  });

  it("falls back to chat_gpt_text items when there is no top-level markdown", async () => {
    const api = fakeApi(() => ({
      status_code: 20000,
      tasks: [{ id, status_code: 20000, result: [{ items: [{ type: "chat_gpt_text", markdown: "A" }, { type: "chat_gpt_table", markdown: "x" }, { type: "chat_gpt_text", markdown: "B" }] }] }],
    }));
    const result = await createDataForSeoClient({ login: "a", password: "b", fetchImpl: api.fetchImpl }).collect(id);
    expect(result).toMatchObject({ state: "ready", markdown: "A\n\nB", sources: [] });
  });

  it("maps unknown tasks to not_found and never puts a malformed id in the URL", async () => {
    const api = fakeApi(() => ({ status_code: 20000, tasks: [{ id, status_code: 40401, status_message: "Task Not Found." }] }));
    const client = createDataForSeoClient({ login: "a", password: "b", fetchImpl: api.fetchImpl });
    expect(await client.collect(id)).toEqual({ state: "not_found" });
    expect(await client.collect("../../v3/user_data")).toEqual({ state: "not_found" });
    expect(api.calls).toHaveLength(1);
  });

  it("lists ready tasks with their tag for reconciliation", async () => {
    const api = fakeApi(() => ({
      status_code: 20000,
      tasks: [{ status_code: 20000, result: [{ id, tag: "obs-1", se: "chat_gpt" }, { id: "y" }] }],
    }));
    expect(await createDataForSeoClient({ login: "a", password: "b", fetchImpl: api.fetchImpl }).readyTags()).toEqual([{ id, tag: "obs-1" }]);
  });
});
