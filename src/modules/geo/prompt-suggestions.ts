import type { CompetitorKind } from "@/modules/geo/competitors/profile-options";
import type { ExtractionProfile } from "@/modules/geo/competitors/schema";

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

export const MAX_DISCOVERY_PROMPT = 2_000;

const KIND_RULES: Record<CompetitorKind, string> = {
  direct: "directo: vende lo mismo al mismo tipo de cliente",
  indirect: "indirecto: resuelve la misma necesidad con otra oferta",
  substitute: "sustituto: lo que el cliente usa en lugar de contratar este servicio",
};

/** Profile text goes inside a fixed format: nothing in it may break a line or the code block. */
const flat = (value: string) => value.replace(/[\r\n|`]+/g, " ").replace(/\s+/g, " ").trim();

function zoneRule(profile: ExtractionProfile, countryName: string): string {
  const area = flat(profile.servedArea ?? "") || countryName;
  switch (profile.zoneRelevance) {
    case "local":
      return `importa. Solo empresas que atiendan a clientes en ${area}.`;
    case "regional":
      return `importa. Solo empresas que trabajen en la región: ${area}.`;
    case "national":
      return `cuenta el país, no la ciudad. Empresas que trabajen en ${countryName}.`;
    case "international":
      return "no importa dónde estén. Cuenta que vendan al mismo mercado.";
  }
}

const CUSTOMER_LABEL: Record<ExtractionProfile["customerType"], string> = { b2b: "empresas", b2c: "particulares", both: "empresas y particulares" };

/**
 * The full question for the assistant, built only from what the operator confirmed. It fits the
 * question field: when it would not, the offer shrinks first and then the summary.
 */
export function discoveryPrompt(input: { brandName: string; hostname: string; sector: string; countryName: string; services: string[]; profile: ExtractionProfile }): string {
  const { profile } = input;
  const brand = flat(input.brandName);
  const build = (offerings: string[], summary: string) =>
    [
      `Usa la búsqueda web. Necesito los competidores reales de ${brand} (${input.hostname}).`,
      "",
      `Negocio: ${summary}`,
      `Sector: ${flat(input.sector)}`,
      ...(offerings.length > 0 ? [`Oferta: ${offerings.join("; ")}`] : []),
      `Cliente: ${CUSTOMER_LABEL[profile.customerType]}. ${flat(profile.targetCustomer)}`,
      `Zona: ${zoneRule(profile, input.countryName)}`,
      "",
      "Busca hasta 5 empresas reales con web propia. Tipos que me interesan:",
      ...profile.competitorKinds.map((kind) => `- ${KIND_RULES[kind]}`),
      "",
      `No incluyas a ${brand}, directorios, marketplaces, artículos ni comparadores. Comprueba que cada web existe y no inventes empresas.`,
      "",
      "Responde solo con un bloque de código, una línea por empresa, con este formato:",
      "COMPETIDOR | Nombre | https://web | tipo | zona donde atiende | motivo breve",
    ].join("\n");
  const offerings = [...new Set([...profile.offerings, ...input.services].map(flat).filter(Boolean))].slice(0, 10);
  let summary = flat(profile.summary);
  let prompt = build(offerings, summary);
  while (prompt.length > MAX_DISCOVERY_PROMPT && offerings.length > 0) {
    offerings.pop();
    prompt = build(offerings, summary);
  }
  if (prompt.length > MAX_DISCOVERY_PROMPT) {
    summary = summary.slice(0, Math.max(0, summary.length - (prompt.length - MAX_DISCOVERY_PROMPT)));
    prompt = build(offerings, summary);
  }
  return prompt;
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
