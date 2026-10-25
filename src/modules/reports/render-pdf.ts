import { chromium } from "playwright-core";

/**
 * Prints a self-contained HTML document to PDF with headless Chromium, isolated (B08b):
 * JavaScript disabled, offline, service workers blocked, and every network request aborted
 * by a catch-all route. The report needs no resource, so nothing it references — even if
 * escaping ever failed — can reach the internet or the internal network.
 */

export interface RenderedPdf {
  pdf: Buffer;
  /** Requests the document tried to make and that were aborted (should be 0 for our template). */
  blockedRequests: string[];
}

// Static and trusted: Chromium substitutes pageNumber/totalPages. No report data here.
const FOOTER = `<div style="width:100%;font:8px -apple-system,Helvetica,Arial,sans-serif;color:#59636e;padding:0 16mm;display:flex;justify-content:space-between">
<span>Diagnóstico SEO técnico</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;

export async function renderPdf(documentHtml: string, options: { timeoutMs?: number } = {}): Promise<RenderedPdf> {
  const timeout = options.timeoutMs ?? 30_000;
  const browser = await chromium.launch({ headless: true, timeout });
  const blockedRequests: string[] = [];
  try {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      offline: true,
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    await context.route("**/*", (route) => {
      blockedRequests.push(route.request().url());
      return route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);
    await page.setContent(documentHtml, { waitUntil: "load", timeout });
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: FOOTER,
    });
    return { pdf, blockedRequests };
  } finally {
    await browser.close();
  }
}
