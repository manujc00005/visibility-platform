/**
 * Deterministic question templates built from the company record. They are suggestions:
 * the operator reviews, edits and approves them before any measurement. Non-branded
 * questions never contain the brand, so they measure discovery rather than recall.
 */

export type PromptIntent = "discovery" | "recommendation" | "comparison" | "branded";

export interface PromptSuggestion {
  text: string;
  intent: PromptIntent;
}

/** "Implantes" → "implantes", but "CRM para pymes" stays: a leading acronym is not lowercased. */
function lowerFirst(value: string): string {
  const firstWord = value.split(/\s+/)[0] ?? "";
  if (firstWord.length > 1 && firstWord === firstWord.toLocaleUpperCase("es")) return value;
  return value.charAt(0).toLocaleLowerCase("es") + value.slice(1);
}

/** The sector question shared by measurement suggestions and competitor discovery. */
function sectorQuestion(sector: string, place: string): string {
  return `¿Qué ${lowerFirst(sector.trim())} me recomiendas en ${place}?`;
}

/**
 * Questions the operator can ask ChatGPT to discover competitors. They are context for the
 * capture, never evidence about any candidate. The second one names the brand on purpose:
 * it asks for alternatives to it, which is not a measurement question.
 */
export function discoveryQuestions(input: { brandName: string; sector: string; city: string | null; countryName: string }): string[] {
  const place = input.city?.trim() || input.countryName;
  return [sectorQuestion(input.sector, place), `¿Qué alternativas hay a ${input.brandName.trim()} en ${place}?`];
}

export function suggestPrompts(input: {
  brandName: string;
  sector: string;
  city: string | null;
  countryName: string;
  services: string[];
  competitorNames: string[];
}): PromptSuggestion[] {
  const place = input.city?.trim() || input.countryName;
  const sector = lowerFirst(input.sector.trim());
  const services = input.services.slice(0, 3).map(lowerFirst);
  const suggestions: PromptSuggestion[] = [
    { text: sectorQuestion(input.sector, place), intent: "discovery" },
    ...services.map((service) => ({ text: `¿Quién ofrece ${service} en ${place}?`, intent: "discovery" as const })),
    { text: `¿Cuáles son las mejores opciones de ${sector} en ${place}?`, intent: "recommendation" },
    ...services.slice(0, 1).map((service) => ({
      text: `¿Qué empresa recomiendas para ${service} en ${place}?`,
      intent: "recommendation" as const,
    })),
    ...input.competitorNames.slice(0, 2).map((name) => ({
      text: `¿Qué alternativas hay a ${name} en ${place}?`,
      intent: "comparison" as const,
    })),
    { text: `¿Qué opinan los clientes de ${input.brandName}?`, intent: "branded" },
    ...services.slice(0, 1).map((service) => ({
      text: `¿Es ${input.brandName} una buena opción para ${service}?`,
      intent: "branded" as const,
    })),
  ];
  const seen = new Set<string>();
  return suggestions.filter((s) => (seen.has(s.text) ? false : (seen.add(s.text), true)));
}
