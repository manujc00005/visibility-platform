import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SpeedChart } from "@/components/audits/evolution-chart";
import type { Locale } from "@/i18n/locale";
import type { EvolutionPoint } from "@/modules/audits/evolution";

/** What the speed chart paints: audits as named points, the zoomed scale said aloud, audits without measurement not faked as data. */

const point = (id: string, iso: string, score: number | null): EvolutionPoint => ({
  id,
  date: new Date(iso),
  counts: { critical: 0, warning: 0, info: 0 },
  score,
  lcpMs: null,
  methodology: score === null ? null : { strategy: "mobile", major: "13" },
});

const POINTS = [point("a", "2026-10-26T11:37:00Z", 95), point("b", "2026-10-26T13:41:00Z", 86), point("c", "2026-10-28T09:26:00Z", null), point("d", "2026-10-28T09:27:00Z", 96)];
const render = (points: EvolutionPoint[], locale: Locale = "es") => renderToStaticMarkup(createElement(SpeedChart, { points, locale }));

describe("SpeedChart", () => {
  it("names every audit with its score and rating, and says when one was not measured", () => {
    const html = render(POINTS);
    expect(html).toContain("95 de 100, Bueno");
    expect(html).toContain("86 de 100, Mejorable");
    expect(html).toContain("no se midió la velocidad");
    expect(html).toContain("Auditoría sin medir");
  });

  it("says the scale is zoomed and only lists the bands in view", () => {
    const html = render(POINTS);
    expect(html).toContain("La escala empieza en 70");
    expect(html).toContain("Bueno: 90–100");
    expect(html).not.toContain("Malo: 0–49");
  });

  it("shows the full scale without the zoom notice for a very low score", () => {
    const html = render([point("a", "2026-10-26T11:37:00Z", 5)]);
    expect(html).not.toContain("La escala empieza");
    expect(html).toContain("Malo: 0–49");
    expect(html).not.toContain("Auditoría sin medir");
  });

  it("joins comparable audits across one that measured nothing", () => {
    const lines = render(POINTS).match(/ d="[^"]+"/g);
    expect(lines).toHaveLength(1);
    expect(lines![0]!.match(/[ML]/g)).toEqual(["M", "L", "L"]);
  });

  it("does not join audits across a version change", () => {
    const newer: EvolutionPoint = { ...point("e", "2026-10-29T09:27:00Z", 90), methodology: { strategy: "mobile", major: "14" } };
    expect(render([...POINTS, newer]).match(/ d="[^"]+"/g)).toHaveLength(1);
    expect(render([point("a", "2026-10-26T11:37:00Z", 95), newer]).match(/ d="[^"]+"/g)).toBeNull();
  });

  it("follows the interface language", () => {
    const html = render(POINTS, "en");
    expect(html).toContain("95 out of 100, Good");
    expect(html).toContain("The scale starts at 70");
  });
});
