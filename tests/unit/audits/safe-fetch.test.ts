import { createServer, type Server } from "node:http";
import { connect, type AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBudget, createSafeFetcher, type Resolver } from "@/modules/audits/fetcher/safe-fetch";

/**
 * A local HTTP server stands in for every remote host. Hostnames are resolved by a fake
 * resolver to *public* addresses (so the real policy runs unchanged), and the injected
 * `connect` sends the socket to the local server. Production code has no such override.
 */
let server: Server;
let port = 0;
const PUBLIC = "93.184.216.34";

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "/";
    const send = (status: number, headers: Record<string, string>, body: string | Buffer = "") => {
      res.writeHead(status, headers);
      res.end(body);
    };
    if (url === "/ok") return send(200, { "content-type": "text/html; charset=utf-8" }, "<title>Hola</title>");
    if (url === "/echo-ua") return send(200, { "content-type": "text/plain" }, String(req.headers["user-agent"]));
    if (url.startsWith("/chain/")) {
      const n = Number(url.split("/")[2]);
      return n <= 0 ? send(200, { "content-type": "text/html" }, "fin") : send(301, { location: `/chain/${n - 1}` });
    }
    if (url === "/to-private") return send(302, { location: "http://evil.example/ok" });
    if (url === "/to-javascript") return send(302, { location: "javascript:alert(1)" });
    if (url === "/to-ftp") return send(302, { location: "ftp://site.example/file" });
    if (url === "/to-credentials") return send(302, { location: "http://user:pass@site.example/ok" });
    if (url === "/to-port") return send(302, { location: "http://site.example:8080/ok" });
    if (url === "/to-ip") return send(302, { location: "http://127.0.0.1/ok" });
    if (url === "/to-ipv6") return send(302, { location: "http://[::1]/ok" });
    if (url === "/no-location") return send(302, {});
    if (url === "/big") return send(200, { "content-type": "text/html" }, Buffer.alloc(300_000, 97));
    if (url === "/gzip-bomb") {
      return send(200, { "content-type": "text/html", "content-encoding": "gzip" }, gzipSync(Buffer.alloc(20_000_000, 0)));
    }
    if (url === "/gzip-ok") return send(200, { "content-type": "text/html", "content-encoding": "gzip" }, gzipSync("<p>comprimido</p>"));
    if (url === "/weird-encoding") return send(200, { "content-encoding": "compress" }, "x");
    if (url === "/slow") return; // never answers
    return send(404, { "content-type": "text/plain" }, "no");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const RESOLUTIONS: Record<string, string[]> = {
  "site.example": [PUBLIC],
  "other.example": ["151.101.1.69"],
  "evil.example": ["10.0.0.1"],
  "metadata.example": ["169.254.169.254"],
  "mapped.example": ["::ffff:127.0.0.1"],
  "mixed.example": [PUBLIC, "127.0.0.1"],
};

function setup(overrides: { resolve?: Resolver } = {}) {
  const connectedTo: string[] = [];
  const resolve: Resolver =
    overrides.resolve ??
    (async (hostname) => {
      const addresses = RESOLUTIONS[hostname];
      if (!addresses) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: "ENOTFOUND" });
      return addresses;
    });
  const fetcher = createSafeFetcher({
    userAgent: "TestBot/1.0",
    resolve,
    connect: (ip) => {
      connectedTo.push(ip);
      return connect(port, "127.0.0.1");
    },
  });
  return { fetcher, connectedTo };
}

const limits = { maxBytes: 100_000, timeoutMs: 2_000 };
const budget = () => createBudget({ maxRequests: 10, maxTotalBytes: 1_000_000, timeLimitMs: 10_000 });

describe("safe fetch: allowed requests", () => {
  it("fetches a public host, pinning the validated IP and sending its own User-Agent", async () => {
    const { fetcher, connectedTo } = setup();
    const result = await fetcher.fetch("http://site.example/ok", limits, budget());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.status).toBe(200);
    expect(result.response.body.toString()).toBe("<title>Hola</title>");
    expect(result.response.contentType).toBe("text/html; charset=utf-8");
    expect(connectedTo).toEqual([PUBLIC]);
    const ua = await fetcher.fetch("http://site.example/echo-ua", limits, budget());
    expect(ua.ok && ua.response.body.toString()).toBe("TestBot/1.0");
  });

  it("follows up to 5 redirects and records the chain", async () => {
    const { fetcher } = setup();
    const result = await fetcher.fetch("http://site.example/chain/3", limits, budget());
    expect(result.ok && result.response.redirects.map((r) => r.status)).toEqual([301, 301, 301]);
    expect(result.ok && result.response.url).toBe("http://site.example/chain/0");
  });

  it("decompresses gzip within the limit", async () => {
    const { fetcher } = setup();
    const result = await fetcher.fetch("http://site.example/gzip-ok", limits, budget());
    expect(result.ok && result.response.body.toString()).toBe("<p>comprimido</p>");
  });

  it("returns non-2xx responses as data, not failures", async () => {
    const { fetcher } = setup();
    const result = await fetcher.fetch("http://site.example/missing", limits, budget());
    expect(result.ok && result.response.status).toBe(404);
  });
});

describe("safe fetch: SSRF defences", () => {
  it.each([
    ["http://evil.example/ok", "private IPv4"],
    ["http://metadata.example/ok", "cloud metadata"],
    ["http://mapped.example/ok", "IPv4-mapped IPv6 loopback"],
    ["http://mixed.example/ok", "any private address among the results"],
    ["http://127.0.0.1/ok", "IP literal loopback"],
    ["http://[::1]/ok", "IPv6 literal loopback"],
    ["http://169.254.169.254/latest/meta-data/", "metadata literal"],
  ])("blocks %s (%s) without connecting", async (url) => {
    const { fetcher, connectedTo } = setup();
    const result = await fetcher.fetch(url, limits, budget());
    expect(result).toMatchObject({ ok: false, failure: { kind: "blocked_destination" } });
    expect(connectedTo).toEqual([]);
  });

  it.each([
    ["/to-private", "blocked_destination"],
    ["/to-ip", "blocked_destination"],
    ["/to-ipv6", "blocked_destination"],
    ["/to-javascript", "invalid_url"],
    ["/to-ftp", "invalid_url"],
    ["/to-credentials", "invalid_url"],
    ["/to-port", "invalid_url"],
    ["/no-location", "invalid_url"],
  ])("re-validates every redirect hop: %s -> %s", async (path, kind) => {
    const { fetcher, connectedTo } = setup();
    const result = await fetcher.fetch(`http://site.example${path}`, limits, budget());
    expect(result).toMatchObject({ ok: false, failure: { kind } });
    expect(connectedTo).toEqual([PUBLIC]);
  });

  it("defeats DNS rebinding: every request resolves once and connects only to that validated IP", async () => {
    let calls = 0;
    const flipping: Resolver = async () => (++calls % 2 === 1 ? [PUBLIC] : ["127.0.0.1"]);
    const { fetcher, connectedTo } = setup({ resolve: flipping });
    const first = await fetcher.fetch("http://site.example/ok", limits, budget());
    const second = await fetcher.fetch("http://site.example/ok", limits, budget());
    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, failure: { kind: "blocked_destination" } });
    expect(connectedTo).toEqual([PUBLIC]);
  });

  it.each(["ftp://site.example/", "file:///etc/passwd", "http://user:pass@site.example/", "http://site.example:8443/", "not a url"])(
    "rejects invalid start URL %j",
    async (url) => {
      const { fetcher, connectedTo } = setup();
      expect(await fetcher.fetch(url, limits, budget())).toMatchObject({ ok: false, failure: { kind: "invalid_url" } });
      expect(connectedTo).toEqual([]);
    },
  );
});

describe("safe fetch: refusing a request before it is made", () => {
  it("asks about every hop and never connects to a refused URL", async () => {
    const { fetcher, connectedTo } = setup();
    const asked: string[] = [];
    const allowRequest = async (url: URL) => {
      asked.push(url.pathname);
      return url.pathname !== "/chain/1";
    };
    const hops = budget();
    const result = await fetcher.fetch("http://site.example/chain/3", { ...limits, allowRequest }, hops);
    expect(result).toMatchObject({ ok: false, failure: { kind: "refused_by_policy", url: "http://site.example/chain/1" } });
    expect(asked).toEqual(["/chain/3", "/chain/2", "/chain/1"]);
    expect(connectedTo).toHaveLength(2);
    expect(hops.requests).toBe(2);
    expect(hops.log.at(-1)).toMatchObject({ url: "http://site.example/chain/1", outcome: "refused_by_policy", status: null, ip: null });
  });

  it("does not ask about a redirect target the fetcher itself refuses", async () => {
    const { fetcher } = setup();
    const asked: string[] = [];
    const allowRequest = async (url: URL) => {
      asked.push(url.href);
      return true;
    };
    const result = await fetcher.fetch("http://site.example/to-ftp", { ...limits, allowRequest }, budget());
    expect(result).toMatchObject({ ok: false, failure: { kind: "invalid_url" } });
    expect(asked).toEqual(["http://site.example/to-ftp"]);
  });

  it("keeps the address checks after an allowed hop", async () => {
    const { fetcher, connectedTo } = setup();
    const result = await fetcher.fetch("http://site.example/to-private", { ...limits, allowRequest: async () => true }, budget());
    expect(result).toMatchObject({ ok: false, failure: { kind: "blocked_destination" } });
    expect(connectedTo).toEqual([PUBLIC]);
  });

  it("keeps the redirect limit and the request budget", async () => {
    const allowRequest = async () => true;
    expect(await setup().fetcher.fetch("http://site.example/chain/6", { ...limits, allowRequest }, budget())).toMatchObject({ ok: false, failure: { kind: "too_many_redirects" } });
    const tight = createBudget({ maxRequests: 2, maxTotalBytes: 1_000_000, timeLimitMs: 10_000 });
    expect(await setup().fetcher.fetch("http://site.example/chain/3", { ...limits, allowRequest }, tight)).toMatchObject({ ok: false, failure: { kind: "budget_exhausted" } });
  });
});

describe("safe fetch: resource limits", () => {
  it("stops after 5 redirects", async () => {
    const { fetcher } = setup();
    const result = await fetcher.fetch("http://site.example/chain/6", limits, budget());
    expect(result).toMatchObject({ ok: false, failure: { kind: "too_many_redirects" } });
  });

  it("aborts a response larger than maxBytes", async () => {
    const { fetcher } = setup();
    const result = await fetcher.fetch("http://site.example/big", { ...limits, maxBytes: 100_000 }, budget());
    expect(result).toMatchObject({ ok: false, failure: { kind: "too_large" } });
  });

  it("aborts a gzip bomb by its decompressed size", async () => {
    const { fetcher } = setup();
    const result = await fetcher.fetch("http://site.example/gzip-bomb", { ...limits, maxBytes: 1_000_000 }, budget());
    expect(result).toMatchObject({ ok: false, failure: { kind: "too_large" } });
  });

  it("rejects unsupported content encodings", async () => {
    const { fetcher } = setup();
    expect(await fetcher.fetch("http://site.example/weird-encoding", limits, budget())).toMatchObject({
      ok: false,
      failure: { kind: "unsupported_encoding" },
    });
  });

  it("times out a server that never answers", async () => {
    const { fetcher } = setup();
    const started = Date.now();
    const result = await fetcher.fetch("http://site.example/slow", { ...limits, timeoutMs: 300 }, budget());
    expect(result).toMatchObject({ ok: false, failure: { kind: "timeout" } });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("enforces the per-audit request budget, redirects included", async () => {
    const { fetcher } = setup();
    const small = createBudget({ maxRequests: 2, maxTotalBytes: 1_000_000, timeLimitMs: 10_000 });
    const result = await fetcher.fetch("http://site.example/chain/3", limits, small);
    expect(result).toMatchObject({ ok: false, failure: { kind: "budget_exhausted" } });
    expect(small.requests).toBe(2);
  });

  it("enforces the per-audit byte budget across requests", async () => {
    const { fetcher } = setup();
    const small = createBudget({ maxRequests: 10, maxTotalBytes: 400_000, timeLimitMs: 10_000 });
    const opts = { ...limits, maxBytes: 350_000 };
    expect((await fetcher.fetch("http://site.example/big", opts, small)).ok).toBe(true);
    expect(await fetcher.fetch("http://site.example/big", opts, small)).toMatchObject({
      ok: false,
      failure: { kind: "budget_exhausted" },
    });
  });

  it("enforces the per-audit time budget", async () => {
    const { fetcher } = setup();
    const expired = createBudget({ maxRequests: 10, maxTotalBytes: 1_000_000, timeLimitMs: 0 });
    expect(await fetcher.fetch("http://site.example/ok", limits, expired)).toMatchObject({
      ok: false,
      failure: { kind: "budget_exhausted" },
    });
  });

  it("reports DNS failures", async () => {
    const { fetcher } = setup();
    expect(await fetcher.fetch("http://nowhere.example/", limits, budget())).toMatchObject({
      ok: false,
      failure: { kind: "dns" },
    });
  });

  it("logs every network request with outcome, status and size", async () => {
    const { fetcher } = setup();
    const b = budget();
    await fetcher.fetch("http://site.example/chain/1", limits, b);
    await fetcher.fetch("http://evil.example/", limits, b);
    expect(b.log.map((e) => [e.url, e.outcome, e.status])).toEqual([
      ["http://site.example/chain/1", "redirect", 301],
      ["http://site.example/chain/0", "ok", 200],
      ["http://evil.example/", "blocked_destination", null],
    ]);
    expect(b.log[2]!.error).toContain("non-public");
    expect(b.log[0]!.error).toBeNull();
  });
});
