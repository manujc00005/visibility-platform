import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GeoFormState } from "@/app/workspaces/[id]/geo/actions";
import { CompetitorSuggestions, type SuggestionCard } from "@/components/geo/competitor-suggestions";
import type { Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";

/**
 * Client templates and plurals of the suggestions flow (AC-017), rendered without a database:
 * the accepted name, the active-competitor limit and the counts are interpolated in the
 * client from serializable labels. Stored reasons stay as recorded, marked `lang="es"`.
 */

const noop = async (state: GeoFormState) => state;

const factors = {
  sector: { state: "matched", reason: "Su portada menciona «dental».", terms: ["dental"], origin: "title" },
  zone: { state: "unknown", reason: "No encontramos Madrid en su portada; eso no significa que no atienda allí.", origin: "none" },
  services: { state: "conflicting", reason: "La web declara atender solo en «Barcelona».", origin: "description" },
  review: ["La web responde, pero eso no confirma que sea la de esta empresa: revísalo."],
} as unknown as SuggestionCard["factors"];

function card(partial: Partial<SuggestionCard>): SuggestionCard {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    status: "suggested",
    name: "Clínica Sonrisa",
    domain: "sonrisa.es",
    sourceUrls: ["https://sonrisa.es/"],
    snippet: "Clínica Sonrisa es conocida por…",
    pageTitle: "Clínica Sonrisa | Dentistas en Madrid",
    pageDescription: null,
    factors,
    webStatus: "reachable",
    finalUrl: "https://sonrisa.es/",
    acceptedName: null,
    ...partial,
  };
}

function render(locale: Locale, sourcesCount: number, activeCount: number): string {
  const m = getMessages(locale);
  return renderToStaticMarkup(
    createElement(CompetitorSuggestions, {
      workspaceId: "00000000-0000-4000-8000-0000000000aa",
      questions: ["¿Qué clínica dental me recomiendas en Madrid?"],
      extraction: {
        question: "¿Qué clínica dental me recomiendas en Madrid?",
        capturedAt: locale === "en" ? "26 Oct 2026, 21:10" : "26 oct 2026, 21:10",
        sourcesCount,
        candidatesTotal: sourcesCount + 1,
        warnings: ["1 candidato excluido: la propia empresa."],
        context: "Clínica Dental García · Clínica dental · Madrid (España)",
        rulesVersion: "competitors-2026-10-26.1",
        notice: locale === "en" ? m.geo.suggestions.originalNotice : null,
      },
      cards: [card({}), card({ id: "00000000-0000-4000-8000-000000000002", status: "accepted", name: "K2 dental", acceptedName: "K2 Dental Madrid" })],
      activeCount,
      maxActive: 5,
      extract: noop,
      accept: async (_w: string, _s: string, state: GeoFormState) => state,
      dismiss: async (_w: string, _s: string, state: GeoFormState) => state,
      labels: m.geo.suggestions,
      locale,
    }),
  );
}

describe("CompetitorSuggestions in English", () => {
  it("interpolates the accepted name, the active limit and plural counts", () => {
    const one = render("en", 1, 5);
    expect(one).toContain("1 cited website · 2 candidates analysed");
    expect(one).toContain("Added as K2 Dental Madrid");
    expect(one).toContain("There are already 5 active competitors; remove one to add another.");
    expect(one).toContain("Decided in this extraction (1)");
    expect(one).toContain('aria-label="Copy the question: ¿Qué clínica dental me recomiendas en Madrid?"');
    const several = render("en", 3, 1);
    expect(several).toContain("3 cited websites · 4 candidates analysed");
    expect(several).not.toContain("There are already");
  });

  it("translates the interface around the stored evidence, which keeps its language", () => {
    const html = render("en", 2, 1);
    expect(html).toContain("Sector: Signal");
    expect(html).toContain("Area: No signals");
    expect(html).toContain("Services: Contradicts");
    expect(html).toContain("The website responds (this does not prove it is theirs)");
    expect(html).toContain('<span class="text-xs text-muted-foreground" lang="es">Su portada menciona «dental».</span>');
    expect(html).toContain('role="note"');
    expect(html).toContain("Warnings, signals and notes for each candidate are shown as they were recorded, in Spanish.");
    expect(html).toMatch(/<ul class="list-disc pl-5 text-xs text-muted-foreground" lang="es"><li>1 candidato excluido: la propia empresa\.<\/li><\/ul>/);
  });
});

describe("CompetitorSuggestions in Spanish", () => {
  it("keeps the previous Spanish texts and shows no notice", () => {
    const one = render("es", 1, 5);
    expect(one).toContain("1 web citada · 2 candidatos analizados");
    expect(one).toContain("Añadido como K2 Dental Madrid");
    expect(one).toContain("Ya hay 5 competidores activos; quita uno para añadir otro.");
    expect(one).toContain("Decididos en esta extracción (1)");
    expect(one).toContain("Sector: Indicio");
    expect(one).not.toContain('role="note"');
    expect(render("es", 3, 1)).toContain("3 webs citadas · 4 candidatos analizados");
  });
});
