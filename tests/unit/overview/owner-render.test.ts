import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Opportunities } from "@/components/overview/opportunities";
import { PendingList } from "@/components/overview/pending-list";
import { SituationLine } from "@/components/overview/situation-line";
import type { Opportunity, OpportunityList } from "@/modules/overview";
import { NOW } from "./fixtures";

/** What the owner's overview paints (feature 023), rendered without a database. */

const opportunity: Opportunity = {
  kind: "access",
  priority: "high",
  title: "Hacer que tu web cargue correctamente y de forma segura",
  problem: "La conexión segura (HTTPS) no funciona",
  why: "Si la portada no carga, Google no puede mostrarla.",
  action: "Activa un certificado SSL y redirige todo el tráfico http a https.",
  evidence: ["https://e.es/: el certificado no funciona"],
  sourceLabel: "Auditoría técnica de la portada",
  measuredAt: NOW,
  href: "/seo#finding-1",
  original: false,
  storedEvidenceFrom: 0,
  covers: 1,
};

const list = (items: Opportunity[], evidence: OpportunityList["evidence"] = "complete"): OpportunityList => ({ items, evidence, pending: [] });

describe("Opportunities (AC-008, AC-009)", () => {
  it("says who can do it and labels the technical recommendation as what that person has to do", () => {
    const html = renderToStaticMarkup(createElement(Opportunities, { workspaceId: "w1", list: list([opportunity]), locale: "es" }));
    expect(html).toContain("Quién puede hacerlo");
    expect(html).toContain("Esto lo hace quien mantenga tu web, o un técnico si no tienes a nadie.");
    expect(html).toContain("Qué tiene que hacer");
    expect(html).toContain("Activa un certificado SSL");
    // The proposal button waits for Módulo F (BL-09): reserved, not rendered.
    expect(html).not.toContain("Pedir propuesta");
  });

  it("explains an empty list without sending the owner to buttons or setup", () => {
    const html = renderToStaticMarkup(createElement(Opportunities, { workspaceId: "w1", list: list([], "none"), locale: "es" }));
    expect(html).toContain("Todavía no podemos recomendar mejoras");
    expect(html).not.toMatch(/Analizar portada|configura|<a /);
  });

  it("reads the same in English", () => {
    const html = renderToStaticMarkup(createElement(Opportunities, { workspaceId: "w1", list: list([opportunity]), locale: "en" }));
    expect(html).toContain("Who can do it");
    expect(html).toContain("What they need to do");
  });
});

describe("SituationLine and PendingList: semantics", () => {
  it("is a list with a heading, the separator hidden from assistive tech, and nothing without fragments", () => {
    const fragments = [
      { area: "performance" as const, text: "En la prueba de Google en móvil, tu web va bien", tone: "good" as const },
      { area: "technical" as const, text: "Aún no hemos revisado tu portada", tone: "neutral" as const },
    ];
    const html = renderToStaticMarkup(createElement(SituationLine, { fragments, locale: "es" }));
    expect(html).toContain('role="list"');
    expect(html).toContain("Dónde estás");
    // One separator between two fragments, aria-hidden.
    expect(html.match(/aria-hidden="true"[^>]*>·</g)).toHaveLength(1);
    expect(renderToStaticMarkup(createElement(SituationLine, { fragments: null, locale: "es" }))).toBe("");
  });

  it("lists pending areas as text, with no links", () => {
    const rows = [{ area: "ai" as const, title: "¿Apareces en las respuestas de IA?", reason: "Aún no hemos medido si las respuestas de IA te mencionan." }];
    const html = renderToStaticMarkup(createElement(PendingList, { rows, locale: "es" }));
    expect(html).toContain('role="list"');
    expect(html).toContain("Pendiente de medir");
    expect(html).not.toContain("<a ");
    expect(renderToStaticMarkup(createElement(PendingList, { rows: [], locale: "es" }))).toBe("");
  });
});
