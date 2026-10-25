import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderPdf } from "@/modules/reports/render-pdf";

/** Counts every request the renderer might make to a host on the machine. */
let server: Server;
let base = "";
const hits: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push(req.url ?? "");
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("leaked");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("renderPdf", () => {
  it("produces a valid PDF from a self-contained document without any request", async () => {
    const { pdf, blockedRequests } = await renderPdf(
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>t</title><style>body{font-family:Helvetica}</style></head><body><h1>Diagnóstico</h1><p>Ñandú · €</p></body></html>`,
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.subarray(-6).toString()).toContain("%%EOF");
    expect(pdf.length).toBeGreaterThan(2_000);
    expect(blockedRequests).toEqual([]);
  }, 60_000);

  it("cannot reach the network even if a document references remote resources", async () => {
    hits.length = 0;
    const hostile = `<!doctype html><html><head>
      <meta http-equiv="refresh" content="0;url=${base}/refresh">
      <link rel="stylesheet" href="${base}/style.css">
      <link rel="preload" as="image" href="${base}/preload.png">
      <style>@import url("${base}/import.css"); body { background: url("${base}/bg.png"); }</style>
      <script src="${base}/script.js"></script>
      <script>fetch("${base}/fetch"); new Image().src = "${base}/js-image";</script>
    </head><body>
      <img src="${base}/img.png">
      <img srcset="${base}/srcset.png 2x">
      <iframe src="${base}/iframe"></iframe>
      <object data="${base}/object"></object>
      <video poster="${base}/poster.png"></video>
      <svg><image href="${base}/svg-image.png"/></svg>
      <img src="http://169.254.169.254/latest/meta-data/">
      <img src="https://example.com/remote.png">
    </body></html>`;
    const { pdf, blockedRequests } = await renderPdf(hostile);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(hits).toEqual([]);
    // The resources were requested by the engine and aborted before leaving the browser.
    expect(blockedRequests.length).toBeGreaterThan(0);
    expect(blockedRequests.some((url) => url.startsWith(base))).toBe(true);
    expect(blockedRequests.join(" ")).not.toContain("/fetch");
  }, 60_000);
});
