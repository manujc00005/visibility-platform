import { describe, expect, it } from "vitest";
import { suggestPrompts } from "@/modules/geo/prompt-suggestions";

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
