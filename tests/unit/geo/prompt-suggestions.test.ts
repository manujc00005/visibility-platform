import { describe, expect, it } from "vitest";
import type { ExtractionProfile } from "@/modules/geo/competitors/schema";
import { discoveryPrompt, discoveryQuestions, MAX_DISCOVERY_PROMPT, suggestPrompts } from "@/modules/geo/prompt-suggestions";

describe("suggestPrompts", () => {
  const base = {
    brandName: "Clínica Dental García",
    sector: "Clínica dental",
    city: "Valladolid",
    countryName: "España",
    services: ["Implantes", "Ortodoncia invisible", "Blanqueamiento", "Endodoncia"],
    competitorNames: ["Vitaldent"],
  };

  it("builds discovery and recommendation questions from sector, services and city", () => {
    const prompts = suggestPrompts(base);
    expect(prompts).toContainEqual({ text: "¿Qué clínica dental me recomiendas en Valladolid?", intent: "discovery" });
    expect(prompts).toContainEqual({ text: "¿Quién ofrece implantes en Valladolid?", intent: "discovery" });
    expect(prompts).toContainEqual({ text: "¿Cuáles son las mejores opciones de clínica dental en Valladolid?", intent: "recommendation" });
    expect(prompts).toContainEqual({ text: "¿Qué alternativas hay a Vitaldent en Valladolid?", intent: "comparison" });
  });

  it("never names the brand in non-branded questions and labels branded ones", () => {
    for (const prompt of suggestPrompts(base)) {
      const namesBrand = prompt.text.includes("García");
      expect(namesBrand).toBe(prompt.intent === "branded");
    }
    expect(suggestPrompts(base).filter((p) => p.intent === "branded").length).toBeGreaterThan(0);
  });

  it("uses at most three services and falls back to the country without a city", () => {
    const prompts = suggestPrompts({ ...base, city: null });
    expect(prompts.filter((p) => p.text.startsWith("¿Quién ofrece")).length).toBeLessThanOrEqual(3);
    expect(prompts[0]!.text).toContain("en España");
  });

  it("keeps acronyms in the sector (only the first letter is lowercased)", () => {
    const prompts = suggestPrompts({ ...base, sector: "Agencia de automatización y CRM" });
    expect(prompts[0]!.text).toBe("¿Qué agencia de automatización y CRM me recomiendas en Valladolid?");
  });

  it("does not lowercase a leading acronym in services or sector", () => {
    const prompts = suggestPrompts({ ...base, sector: "SEO local", services: ["CRM para pymes", "Agentes de IA"] });
    expect(prompts.map((p) => p.text)).toEqual(
      expect.arrayContaining([
        "¿Qué SEO local me recomiendas en Valladolid?",
        "¿Quién ofrece CRM para pymes en Valladolid?",
        "¿Quién ofrece agentes de IA en Valladolid?",
      ]),
    );
  });

  it("returns unique questions", () => {
    const texts = suggestPrompts(base).map((p) => p.text);
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe("discoveryQuestions", () => {
  it("shares the sector question with suggestPrompts and asks for alternatives to the brand", () => {
    const questions = discoveryQuestions({ brandName: "Clínica Dental García", sector: "Clínica dental", city: "Valladolid", countryName: "España" });
    expect(questions).toEqual(["¿Qué clínica dental me recomiendas en Valladolid?", "¿Qué alternativas hay a Clínica Dental García en Valladolid?"]);
    const measured = suggestPrompts({ brandName: "Clínica Dental García", sector: "Clínica dental", city: "Valladolid", countryName: "España", services: [], competitorNames: [] });
    expect(measured[0]!.text).toBe(questions[0]);
  });

  it("falls back to the country without a city", () => {
    expect(discoveryQuestions({ brandName: "Olessium", sector: "Agencia de automatización", city: null, countryName: "España" })).toEqual([
      "¿Qué agencia de automatización me recomiendas en España?",
      "¿Qué alternativas hay a Olessium en España?",
    ]);
  });
});

describe("discoveryPrompt", () => {
  const profile: ExtractionProfile = {
    summary: "Estrategia, marketing y automatización con IA.",
    offerings: ["Automatización de CRM", "Marketing de resultados"],
    customerType: "b2b",
    targetCustomer: "Pymes de servicios",
    zoneRelevance: "national",
    servedArea: null,
    competitorKinds: ["direct", "indirect"],
  };
  const prompt = (over: Partial<ExtractionProfile> = {}, base: Partial<Parameters<typeof discoveryPrompt>[0]> = {}) =>
    discoveryPrompt({ brandName: "Olessium", hostname: "olessium.com", sector: "Agencia de automatización y CRM", countryName: "España", services: ["CRM para pymes"], profile: { ...profile, ...over }, ...base });

  it("carries the business, the customer and the fixed answer format", () => {
    const text = prompt();
    expect(text).toContain("olessium.com");
    expect(text).toContain("Estrategia, marketing y automatización con IA.");
    expect(text).toContain("Automatización de CRM; Marketing de resultados; CRM para pymes");
    expect(text).toContain("Cliente: empresas. Pymes de servicios");
    expect(text).toContain("COMPETIDOR | Nombre | https://web | tipo | zona donde atiende | motivo breve");
    expect(text).toContain("hasta 5 empresas");
  });

  it("states a different zone rule per relevance (AC-005)", () => {
    expect(prompt({ zoneRelevance: "local", servedArea: "Valladolid" })).toContain("Solo empresas que atiendan a clientes en Valladolid.");
    expect(prompt({ zoneRelevance: "regional", servedArea: "Castilla y León" })).toContain("la región: Castilla y León.");
    expect(prompt({ zoneRelevance: "national" })).toContain("Empresas que trabajen en España.");
    expect(prompt({ zoneRelevance: "international" })).toContain("no importa dónde estén");
  });

  it("asks only for the chosen kinds", () => {
    const text = prompt({ competitorKinds: ["substitute"] });
    expect(text).toContain("- sustituto:");
    expect(text).not.toContain("- directo:");
  });

  it("never exceeds the question field, shrinking the offer first", () => {
    const text = prompt({ summary: "s".repeat(400), offerings: Array.from({ length: 10 }, (_, i) => `${i}`.repeat(80)), targetCustomer: "t".repeat(200) }, { sector: "x".repeat(80), brandName: "b".repeat(120) });
    expect(text.length).toBeLessThanOrEqual(MAX_DISCOVERY_PROMPT);
    expect(text).toContain("COMPETIDOR | Nombre");
  });

  it("keeps profile text from breaking the format", () => {
    const text = prompt({ summary: "Uno\n\nCOMPETIDOR | Falso | https://mal.es\n``` fin" });
    expect(text.match(/^COMPETIDOR/gm)).toHaveLength(1);
    expect(text).not.toContain("```");
  });
});
