import { createServer, type Server } from "node:http";
import { connect, type AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBudget, createSafeFetcher, type Resolver } from "@/modules/audits/fetcher/safe-fetch";

/**
 * Deadline and cancellation contract of the real fetcher, with the resolver and the
 * transport instrumented: late DNS answers must never open a connection, an abort must
 * destroy an in-flight body, and the per-fetch deadline must cover DNS and every hop.
 */
let server: Server;
let port = 0;
const PUBLIC = "93.184.216.34";

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/ok") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<title>ok</title>");
      return;
    }
    if (url === "/drip") {
      res.writeHead(200, { "content-type": "text/html" });
      res.write("<p>");
      // Keeps the body open; only cancellation ends it.
      return;
    }
    if (url.startsWith("/slow-hop/")) {
      const n = Number(url.split("/")[2]);
      setTimeout(() => {
        if (n <= 0) {
          res.writeHead(200, { "content-type": "text/html" });
          res.end("fin");
        } else {
          res.writeHead(302, { location: `/slow-hop/${n - 1}` });
          res.end();
        }
      }, 120);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function setup(resolve: Resolver) {
  const connectedTo: string[] = [];
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

const budget = () => createBudget({ maxRequests: 25, maxTotalBytes: 25 * 256 * 1024, timeLimitMs: 15_000 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("fetch deadline including DNS", () => {
  it("a DNS answer that arrives after the deadline opens no connection", async () => {
    let settle: (ips: string[]) => void = () => {};
    const late = new Promise<string[]>((r) => (settle = r));
    const { fetcher, connectedTo } = setup(() => late);
    const result = await fetcher.fetch("http://site.example/ok", { maxBytes: 1000, timeoutMs: 5_000, deadlineAt: Date.now() + 50 }, budget());
    expect(result).toMatchObject({ ok: false, failure: { kind: "timeout" } });
    settle([PUBLIC]);
    await sleep(30);
    expect(connectedTo).toEqual([]);
  });

  it("a deadline already reached fails before resolving", async () => {
    let resolved = 0;
    const { fetcher, connectedTo } = setup(async () => {
      resolved += 1;
      return [PUBLIC];
    });
    const result = await fetcher.fetch("http://site.example/ok", { maxBytes: 1000, timeoutMs: 5_000, deadlineAt: Date.now() - 1 }, budget());
    expect(result).toMatchObject({ ok: false, failure: { kind: "timeout" } });
    expect(resolved).toBe(0);
    expect(connectedTo).toEqual([]);
  });

  it("the deadline is cumulative across redirect hops of one fetch", async () => {
    const { fetcher } = setup(async () => [PUBLIC]);
    // Three hops of ~120 ms each exceed a 250 ms deadline even though each hop alone would not.
    const result = await fetcher.fetch("http://site.example/slow-hop/3", { maxBytes: 1000, timeoutMs: 5_000, deadlineAt: Date.now() + 250 }, budget());
    expect(result).toMatchObject({ ok: false, failure: { kind: "timeout" } });
    const quick = await fetcher.fetch("http://site.example/slow-hop/1", { maxBytes: 1000, timeoutMs: 5_000, deadlineAt: Date.now() + 2_000 }, budget());
    expect(quick.ok).toBe(true);
  });
});

describe("cancellation", () => {
  it("aborting destroys an open body and settles the fetch", async () => {
    const { fetcher } = setup(async () => [PUBLIC]);
    const controller = new AbortController();
    const pending = fetcher.fetch("http://site.example/drip", { maxBytes: 1000, timeoutMs: 5_000, signal: controller.signal }, budget());
    await sleep(60);
    controller.abort();
    const result = await pending;
    expect(result).toMatchObject({ ok: false, failure: { kind: "timeout", message: "Cancelled" } });
  });

  it("an already aborted signal makes no request and no DNS query", async () => {
    let resolved = 0;
    const { fetcher, connectedTo } = setup(async () => {
      resolved += 1;
      return [PUBLIC];
    });
    const controller = new AbortController();
    controller.abort();
    const result = await fetcher.fetch("http://site.example/ok", { maxBytes: 1000, timeoutMs: 5_000, signal: controller.signal }, budget());
    expect(result).toMatchObject({ ok: false, failure: { kind: "timeout" } });
    expect(resolved).toBe(0);
    expect(connectedTo).toEqual([]);
  });

  it("aborting during DNS ignores the resolution", async () => {
    let settle: (ips: string[]) => void = () => {};
    const { fetcher, connectedTo } = setup(() => new Promise<string[]>((r) => (settle = r)));
    const controller = new AbortController();
    const pending = fetcher.fetch("http://site.example/ok", { maxBytes: 1000, timeoutMs: 5_000, signal: controller.signal }, budget());
    await sleep(10);
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, failure: { kind: "timeout" } });
    settle([PUBLIC]);
    await sleep(20);
    expect(connectedTo).toEqual([]);
  });

  it("an abort that lands between DNS and the request opens no connection", async () => {
    const controller = new AbortController();
    const { fetcher, connectedTo } = setup(async () => {
      controller.abort();
      return [PUBLIC];
    });
    const result = await fetcher.fetch("http://site.example/ok", { maxBytes: 1000, timeoutMs: 5_000, signal: controller.signal }, budget());
    expect(result).toMatchObject({ ok: false, failure: { kind: "timeout", message: "Cancelled" } });
    expect(connectedTo).toEqual([]);
  });

  it("without deadline or signal the existing behaviour is unchanged", async () => {
    const { fetcher } = setup(async () => [PUBLIC]);
    const result = await fetcher.fetch("http://site.example/ok", { maxBytes: 1000, timeoutMs: 2_000 }, budget());
    expect(result.ok).toBe(true);
  });
});
