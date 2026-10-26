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
    { text: `¿Qué ${sector} me recomiendas en ${place}?`, intent: "discovery" },
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
