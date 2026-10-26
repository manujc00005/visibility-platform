import { describe, expect, it } from "vitest";
import { createBudget } from "@/modules/audits/fetcher/safe-fetch";
import { fetchPageHead, jsonLdLocalities, PAGE_HEAD_LIMITS } from "@/modules/geo/competitors/page-head";
import { fakeFetcher } from "../../../support/fake-fetcher";

const HTML = `<!doctype html><html lang="es"><head><title>Alfa Dental | Clínica dental en Madrid con implantes y mucho texto para superar el límite de ciento veinte caracteres del título</title>
<meta name="description" content="Implantes y ortodoncia en Madrid.">
<script type="application/ld+json">{"@type":"Dentist","address":{"@type":"PostalAddress","addressLocality":"Madrid","addressRegion":"Comunidad de Madrid"},"areaServed":["Madrid","Getafe"]}</script>
<script type="application/ld+json">not json</script>
</head><body><a href="/precios">Precios</a></body></html>`;

const options = () => ({ deadlineAt: Date.now() + 5_000, signal: new AbortController().signal, now: () => new Date(0) });
const budget = () => createBudget({ maxRequests: 25, maxTotalBytes: 25 * PAGE_HEAD_LIMITS.maxBytes, timeLimitMs: 15_000 });

describe("jsonLdLocalities", () => {
  it("collects PostalAddress and areaServed values, ignoring invalid blocks", () => {
    expect(jsonLdLocalities(HTML).sort()).toEqual(["Comunidad de Madrid", "Getafe", "Madrid"]);
  });
});

describe("fetchPageHead", () => {
  it("reads only https://host/ with the candidate limits and keeps bounded text, never HTML", async () => {
    const fetcher = fakeFetcher({ "https://alfa.es/": { status: 200, body: HTML, contentType: "text/html; charset=utf-8", finalUrl: "https://www.alfa.es/" } });
    const head = await fetchPageHead("alfa.es", fetcher, budget(), options());
    expect(fetcher.calls).toEqual(["https://alfa.es/"]);
    expect(head).toMatchObject({ host: "alfa.es", finalHost: "alfa.es", finalUrl: "https://www.alfa.es/", webStatus: "reachable", lang: "es", description: "Implantes y ortodoncia en Madrid." });
    expect(head.title!.length).toBeLessThanOrEqual(PAGE_HEAD_LIMITS.maxTitle);
    expect(head.localities).toContain("Getafe");
    expect(JSON.stringify(head)).not.toContain("<a href");
  });

  it("maps failures: blocked destinations, unreachable hosts, unverified timeouts and non-2xx answers", async () => {
    const fetcher = fakeFetcher({
      "https://privada.es/": { fail: "blocked_destination" },
      "https://caida.es/": { fail: "dns" },
      "https://lenta.es/": { fail: "timeout" },
      "https://grande.es/": { fail: "too_large" },
      "https://rota.es/": { status: 503, body: "", contentType: "text/html" },
      "https://redir.es/": { status: 200, body: "<title>Dir</title>", contentType: "text/html", finalUrl: "https://www.doctoralia.es/x" },
    });
    const b = budget();
    const o = options();
    expect((await fetchPageHead("privada.es", fetcher, b, o)).webStatus).toBe("blocked");
    expect((await fetchPageHead("caida.es", fetcher, b, o)).webStatus).toBe("unreachable");
    expect((await fetchPageHead("lenta.es", fetcher, b, o)).webStatus).toBe("unverified");
    expect((await fetchPageHead("grande.es", fetcher, b, o)).webStatus).toBe("unverified");
    expect(await fetchPageHead("rota.es", fetcher, b, o)).toMatchObject({ webStatus: "unreachable", title: null });
    expect(await fetchPageHead("redir.es", fetcher, b, o)).toMatchObject({ webStatus: "reachable", finalHost: "doctoralia.es" });
  });
});
