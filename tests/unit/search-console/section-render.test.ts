import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RefreshSearchConsoleState } from "@/app/workspaces/[id]/seo/actions";
import { SearchConsoleSection } from "@/components/search-console/search-console-section";
import type { Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { SearchConsoleConfig } from "@/modules/search-console/deps";
import type { SearchConsoleSnapshot } from "@/modules/search-console/schema";
import { summarizeSearchConsole } from "@/modules/search-console/summary";

/**
 * What the Search Console section paints for the brand split (feature 007, AC-001, AC-005,
 * AC-006, AC-011, AC-015), rendered without a database.
 */

const READY: SearchConsoleConfig = { state: "ready", clientEmail: "gsc-reader@olessium.iam.gserviceaccount.com" };
const NOT_CONFIGURED: SearchConsoleConfig = { state: "not_configured" };
const noop = async (state: RefreshSearchConsoleState) => state;
const tot = (clicks: number, impressions: number) => ({ clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: 5 });

const SEGMENTS = {
  version: 1 as const,
  terms: ["Olessium", "olessium.com"],
  termsTruncated: false,
  branded: tot(30, 120),
  nonBranded: tot(50, 700),
  previousBranded: tot(20, 100),
  previousNonBranded: tot(40, 650),
};

function completed(overrides: Partial<SearchConsoleSnapshot> = {}): SearchConsoleSnapshot {
  return {
    id: "s1",
    workspaceId: "w1",
    status: "completed",
    provider: "google_gsc",
    captureCondition: "owner_api",
    property: "sc-domain:olessium.com",
    currentStart: "2026-09-27",
    currentEnd: "2026-10-24",
    previousStart: "2026-08-30",
    previousEnd: "2026-09-26",
    totals: tot(100, 1000),
    previousTotals: tot(80, 900),
    queries: [
      { query: "olessium opiniones", clicks: 3, impressions: 9, ctr: 0.33, position: 1.2 },
      { query: "crm agencias", clicks: 5, impressions: 50, ctr: 0.1, position: 4.2 },
    ],
    pages: [],
    segments: SEGMENTS,
    errorKind: null,
    errorMessage: null,
    accessibleProperties: null,
    createdAt: new Date("2026-10-27T10:00:00Z"),
    ...overrides,
  };
}

function render(stored: SearchConsoleSnapshot, config: SearchConsoleConfig = READY, locale: Locale = "es") {
  const s = summarizeSearchConsole({ latest: stored, latestCompleted: stored }, config, "olessium.com", locale);
  return renderToStaticMarkup(createElement(SearchConsoleSection, { s, config, action: noop, locale }));
}

const t = getMessages("es").searchConsole;
const BADGE = `>${t.segments.badge}</span>`;

describe("SearchConsoleSection brand split", () => {
  it("paints both blocks, their shares, the unclassified gap and the terms (AC-001)", () => {
    const html = render(completed());
    expect(html).toContain(t.segments.title);
    expect(html).toContain(t.segments.branded.label);
    expect(html).toContain(t.segments.nonBranded.label);
    expect(html).toContain("30 clics");
    expect(html).toContain(t.segments.clicksShare("30,0 %"));
    expect(html).toContain(t.segments.impressionsShare("70,0 %"));
    expect(html).toContain(t.segments.hidden("20 clics", "180 impresiones"));
    expect(html).toContain(t.segments.terms);
    expect(html).toContain(">Olessium</span>");
    expect(html).toContain(">olessium.com</span>");
    expect(html).not.toContain(t.segments.mismatch);
    expect(html).not.toContain(t.segments.truncated);
  });

  it("puts the brand badge only on rows that contain a term, separated from the query text (AC-005)", () => {
    const html = render(completed());
    expect(html.split(BADGE)).toHaveLength(2);
    expect(html).toMatch(/olessium opiniones <span[^>]*>marca<\/span>/);
    const brandedRow = html.slice(html.indexOf("olessium opiniones"), html.indexOf("crm agencias"));
    expect(brandedRow).toContain(BADGE);
  });

  it("asks to update a capture taken before feature 007, without block or badges (AC-006)", () => {
    const html = render(completed({ segments: null }));
    expect(html).toContain(t.segments.missing(t.button.update));
    expect(html).not.toContain(t.segments.title);
    expect(html).not.toContain(BADGE);
    // The four figures and the queries table are still there.
    expect(html).toContain(t.metrics.clicks.label);
    expect(html).toContain("crm agencias");
  });

  it("asks to set up Search Console when stored data has no button to update it (AC-006)", () => {
    const html = render(completed({ segments: null }), NOT_CONFIGURED);
    expect(html).toContain(t.segments.missingNotConfigured);
    expect(html).not.toContain(t.segments.missing(t.button.update));
  });

  it("keeps the blocks and their change without shares for a period without impressions (AC-013)", () => {
    const html = render(completed({ totals: tot(0, 0), queries: [], segments: { ...SEGMENTS, branded: tot(0, 0), nonBranded: tot(0, 0) } }));
    expect(html).toContain(t.segments.title);
    expect(html.split(t.segments.empty)).toHaveLength(2);
    expect(html).toContain(`>${t.segments.branded.label}</dt>`);
    // A drop to zero still shows where it came from.
    expect(html).toContain("Antes: 20 clics");
    expect(html).not.toContain(t.segments.clicksShare("—"));
    expect(html).toContain(t.segments.previousHidden("20 clics", "150 impresiones"));
    // The table's own empty phrase is a different text, shown once.
    expect(html.split(t.noQueries)).toHaveLength(2);
  });

  it("explains a mismatch and a truncated term list (AC-004, AC-012)", () => {
    const html = render(completed({ segments: { ...SEGMENTS, termsTruncated: true, branded: tot(70, 400) } }));
    expect(html).toContain(t.segments.mismatch);
    expect(html).toContain(t.segments.truncated);
  });

  it("paints a hostile term as text: no script element and no link (AC-015)", () => {
    const html = render(completed({ segments: { ...SEGMENTS, terms: ['<script>alert(1)</script><a href="https://x.example">x</a>', "olessium.com"] } }));
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    // React adds its own form-replay <script>; the term must not add another one or a link.
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain('<a href="https://x.example"');
    expect(html.split("<script").length).toBe(render(completed()).split("<script").length);
  });

  it("keeps the two previous sentences of the privacy note and adds the classification one (AC-009)", () => {
    expect(t.privacyNote).toContain("la suma de la tabla puede ser menor que el total");
    expect(t.privacyNote).toContain("La posición es una media de todas las apariciones");
    expect(t.privacyNote).toContain("sin clasificar");
    expect(render(completed())).toContain("sin clasificar");
  });

  it("renders in English", () => {
    const en = getMessages("en").searchConsole;
    const html = render(completed(), READY, "en");
    expect(html).toContain(en.segments.title);
    expect(html).toContain(en.segments.clicksShare("30.0%"));
    expect(html).toContain(`>${en.segments.badge}</span>`);
  });
});

describe("SearchConsoleSection position change per query (feature 009)", () => {
  const before = (position: number) => ({ clicks: 2, impressions: 20, ctr: 0.1, position });
  const row = (query: string, position: number, previous: ReturnType<typeof before> | null) => ({ query, clicks: 5, impressions: 50, ctr: 0.1, position, previous });
  const queries = [row("sube", 8, before(12)), row("baja", 12, before(8)), row("igual", 8, before(8.2)), row("olessium opiniones", 3, null)];
  const columns = (html: string) => (html.slice(0, html.indexOf("</thead>")).match(/<th /g) ?? []).length;

  it("paints the four texts under the position, without a new column (AC-003, AC-004, AC-008)", () => {
    const html = render(completed({ queries }));
    for (const text of ["Sube 4,0", "Baja 4,0", t.changes.querySame, t.changes.queryNoPrevious]) expect(html).toContain(text);
    expect(columns(html)).toBe(5);
    expect(html).not.toContain(t.positionChanges.missing(t.button.update));
  });

  it("places the change under the search on phones and under the position from sm up (D004)", () => {
    const html = render(completed({ queries: [row("sube", 8, before(12))] }));
    const firstCell = html.slice(html.indexOf(">sube"), html.indexOf("</td>", html.indexOf(">sube")));
    expect(firstCell).toContain('class="sm:hidden"');
    expect(firstCell).toContain("Sube 4,0");
    const cells = html.slice(html.indexOf(">sube")).split("</tr>")[0]!.split("<td ");
    expect(cells.at(-1)).toContain('class="hidden justify-end sm:flex"');
    expect(cells.at(-1)).toContain("Sube 4,0");
  });

  it("shows the brand badge and the change in the same row (AC-008)", () => {
    const html = render(completed({ queries }));
    const brandedRow = html.slice(html.indexOf("olessium opiniones"), html.indexOf("</tr>", html.indexOf("olessium opiniones")));
    expect(brandedRow).toContain(BADGE);
    expect(brandedRow).toContain(t.changes.queryNoPrevious);
  });

  it("paints no change in the pages table (AC-008)", () => {
    const html = render(completed({ queries: [], pages: [{ page: "https://olessium.com/", clicks: 1, impressions: 2, ctr: 0.5, position: 3 }] }));
    expect(html).toContain("https://olessium.com/");
    expect(html).not.toContain(t.changes.querySame);
    expect(html).not.toContain(t.changes.queryNoPrevious);
  });

  it("asks to update a capture whose rows lack the comparison, or to set up without a button (AC-006)", () => {
    const old = [{ query: "crm agencias", clicks: 5, impressions: 50, ctr: 0.1, position: 4.2 }];
    expect(render(completed({ queries: old })).includes(t.positionChanges.missing(t.button.update))).toBe(true);
    const none = render(completed({ queries: old }), NOT_CONFIGURED);
    expect(none).toContain(t.positionChanges.missingNotConfigured);
    expect(none).not.toContain(t.positionChanges.missing(t.button.update));
  });

  it("asks nothing without rows (AC-006)", () => {
    const html = render(completed({ queries: [] }));
    expect(html).not.toContain(t.positionChanges.missing(t.button.update));
    expect(html).not.toContain(t.positionChanges.missingNotConfigured);
  });

  it("keeps a hostile query as text (AC-008)", () => {
    const html = render(completed({ queries: [row('<script>alert(1)</script><a href="https://x.example">x</a>', 8, before(12))] }));
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain('<a href="https://x.example"');
  });

  it("keeps the previous sentences of the note and adds the comparison one (AC-009)", () => {
    expect(t.privacyNote).toContain("la suma de la tabla puede ser menor que el total");
    expect(t.privacyNote).toContain("La posición es una media de todas las apariciones");
    expect(t.privacyNote).toContain("sin clasificar");
    expect(t.privacyNote).toContain("compara la media de dos periodos de 28 días");
  });

  it("renders in English", () => {
    const en = getMessages("en").searchConsole;
    const html = render(completed({ queries }), READY, "en");
    expect(html).toContain("Up 4.0");
    expect(html).toContain(en.changes.queryNoPrevious);
  });
});
