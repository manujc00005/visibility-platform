import type { FetchBudget, FetchFailure, FetchResult, SafeFetcher } from "@/modules/audits/fetcher/safe-fetch";

export type FakeRoute =
  | { status: number; body?: string | Buffer; contentType?: string; headers?: Record<string, string>; finalUrl?: string; redirects?: { url: string; status: number; location: string }[] }
  | { fail: FetchFailure["kind"] };

/** In-memory fetcher keyed by URL. Records every request in the budget log like the real one. */
export function fakeFetcher(routes: Record<string, FakeRoute>): SafeFetcher & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async fetch(url: string, _limits: unknown, budget: FetchBudget): Promise<FetchResult> {
      calls.push(url);
      budget.requests += 1;
      const route = routes[url] ?? { status: 404, body: "not found", contentType: "text/plain" };
      if ("fail" in route) {
        budget.log.push({ url, outcome: route.fail, status: null, bytes: 0, ms: 1, ip: null, error: `fake ${route.fail}` });
        return { ok: false, failure: { kind: route.fail, message: `fake ${route.fail}`, url } };
      }
      const body = Buffer.isBuffer(route.body) ? route.body : Buffer.from(route.body ?? "");
      budget.log.push({ url, outcome: "ok", status: route.status, bytes: body.length, ms: 1, ip: "93.184.216.34", error: null });
      return {
        ok: true,
        response: {
          url: route.finalUrl ?? url,
          status: route.status,
          headers: { ...(route.contentType ? { "content-type": route.contentType } : {}), ...route.headers },
          contentType: route.contentType ?? null,
          body,
          redirects: route.redirects ?? [],
          ip: "93.184.216.34",
        },
      };
    },
  };
}

export const HTML_OK = `<!doctype html><html lang="es"><head><title>Clínica Dental García | Implantes en Valladolid</title>
<meta name="description" content="Clínica dental en Valladolid con implantes, ortodoncia invisible y odontología general. Primera cita gratis.">
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="https://www.clinicagarcia.es/">
</head><body><h1>Clínica dental</h1><a href="/servicios">Servicios</a></body></html>`;

export const SITEMAP_OK = `<urlset><url><loc>https://www.clinicagarcia.es/</loc></url><url><loc>https://www.clinicagarcia.es/servicios</loc></url></urlset>`;
