/**
 * DataForSEO "LLM Scraper" for ChatGPT, Standard queue (submit, then collect by id).
 * Contract taken from the official documentation (read 2026-10-25):
 *   POST /v3/ai_optimization/chat_gpt/llm_scraper/task_post        (≤100 tasks, charged when set)
 *   GET  /v3/ai_optimization/chat_gpt/llm_scraper/task_get/advanced/{id}
 *   GET  /v3/ai_optimization/chat_gpt/llm_scraper/tasks_ready       (returns our `tag`)
 * Status codes: 20000 ok, 20100 task created, 40601/40602 handed/in queue, 40401 not found,
 * 40100 unauthorized, 40200/40210 payment required/insufficient funds.
 * NOT verified against a live account in this repository (no credentials).
 *
 * The host is fixed and trusted, so this uses plain fetch, not the audit fetcher.
 * Credentials only travel in the Authorization header and are never logged.
 */

export const DATAFORSEO_PRICE = {
  /** Standard queue, per result (pricing page, 2026-10-25). */
  unitMicros: 1_200,
  version: "dataforseo-llm-scraper-chatgpt-standard@2026-10-25",
} as const;

const BASE_URL = "https://api.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper";
const MAX_TASKS_PER_POST = 100;

export interface DataForSeoTask {
  tag: string;
  keyword: string;
  locationName: string;
  languageCode: string;
  forceWebSearch: boolean;
}

export type SubmitResult =
  /** The request was answered: each task was created (charged) or rejected (not charged). */
  | { kind: "answered"; tasks: { tag: string; id: string | null; created: boolean; costUsd: number | null; message: string }[] }
  /** The provider refused the whole request (auth, funds): nothing was charged. */
  | { kind: "rejected"; message: string }
  /** We do not know whether the tasks were created (timeout, network error after sending). */
  | { kind: "uncertain"; message: string };

export type CollectResult =
  | { state: "pending" }
  | { state: "ready"; markdown: string; sources: { url: string; title: string | null }[] }
  | { state: "not_found" }
  | { state: "error"; message: string };

export interface DataForSeoClient {
  submit(tasks: DataForSeoTask[]): Promise<SubmitResult>;
  collect(taskId: string): Promise<CollectResult>;
  readyTags(): Promise<{ id: string; tag: string }[]>;
}

interface ApiTask {
  id?: string;
  status_code?: number;
  status_message?: string;
  cost?: number;
  data?: { tag?: string };
  result?: { markdown?: string; sources?: { url?: string; title?: string }[]; items?: { type?: string; markdown?: string }[] }[] | null;
}

interface ApiResponse {
  status_code?: number;
  status_message?: string;
  tasks?: ApiTask[];
}

export function createDataForSeoClient(options: {
  login: string;
  password: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): DataForSeoClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const authorization = `Basic ${Buffer.from(`${options.login}:${options.password}`).toString("base64")}`;

  async function call(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<ApiResponse> {
    const response = await fetchImpl(`${BASE_URL}${path}`, {
      method: init.method,
      headers: { authorization, "content-type": "application/json", accept: "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 401 || response.status === 402) {
      return { status_code: response.status === 401 ? 40100 : 40200, status_message: `HTTP ${response.status}` };
    }
    return (await response.json()) as ApiResponse;
  }

  return {
    async submit(tasks) {
      if (tasks.length === 0 || tasks.length > MAX_TASKS_PER_POST) throw new Error(`Between 1 and ${MAX_TASKS_PER_POST} tasks per request`);
      let body: ApiResponse;
      try {
        body = await call("/task_post", {
          method: "POST",
          body: tasks.map((t) => ({
            keyword: t.keyword,
            location_name: t.locationName,
            language_code: t.languageCode,
            force_web_search: t.forceWebSearch,
            tag: t.tag,
          })),
        });
      } catch (error) {
        // The request may have reached the provider: we cannot rule out a charge.
        return { kind: "uncertain", message: error instanceof Error ? error.name : "network error" };
      }
      if (body.status_code !== 20000) {
        return { kind: "rejected", message: `${body.status_code ?? "?"} ${body.status_message ?? ""}`.trim() };
      }
      const byTag = new Map((body.tasks ?? []).map((t) => [t.data?.tag, t]));
      return {
        kind: "answered",
        tasks: tasks.map((t) => {
          const task = byTag.get(t.tag);
          if (!task) return { tag: t.tag, id: null, created: false, costUsd: null, message: "missing in response" };
          const created = task.status_code === 20100;
          return {
            tag: t.tag,
            id: created ? (task.id ?? null) : null,
            created,
            costUsd: typeof task.cost === "number" ? task.cost : null,
            message: `${task.status_code ?? "?"} ${task.status_message ?? ""}`.trim(),
          };
        }),
      };
    },

    async collect(taskId) {
      if (!/^[0-9a-f-]{36}$/i.test(taskId)) return { state: "not_found" };
      let body: ApiResponse;
      try {
        body = await call(`/task_get/advanced/${taskId}`, { method: "GET" });
      } catch (error) {
        return { state: "error", message: error instanceof Error ? error.name : "network error" };
      }
      if (body.status_code !== 20000) return { state: "error", message: `${body.status_code} ${body.status_message ?? ""}`.trim() };
      const task = body.tasks?.[0];
      if (task?.status_code === 40601 || task?.status_code === 40602) return { state: "pending" };
      if (task?.status_code === 40401) return { state: "not_found" };
      if (task?.status_code !== 20000) return { state: "error", message: `${task?.status_code} ${task?.status_message ?? ""}`.trim() };
      const result = task.result?.[0];
      const markdown =
        result?.markdown ?? (result?.items ?? []).filter((i) => i.type === "chat_gpt_text").map((i) => i.markdown ?? "").join("\n\n");
      // `sources` are what the model cited; `search_results` (all retrieved pages) is ignored on purpose.
      const sources = (result?.sources ?? []).flatMap((s) => (typeof s.url === "string" ? [{ url: s.url, title: s.title ?? null }] : []));
      return { state: "ready", markdown: markdown ?? "", sources };
    },

    async readyTags() {
      const body = await call("/tasks_ready", { method: "GET" });
      const ready = (body.tasks?.[0] as { result?: { id?: string; tag?: string }[] } | undefined)?.result ?? [];
      return ready.flatMap((r) => (r.id && r.tag ? [{ id: r.id, tag: r.tag }] : []));
    },
  };
}
