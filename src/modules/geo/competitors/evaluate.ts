import { nameKey, normalizeText } from "@/modules/geo/detection";
import type { Candidate } from "@/modules/geo/competitors/extract";
import { identityKeys, isKnownNonBusinessHost, isOwnBusiness } from "@/modules/geo/competitors/exclusions";
import type { ExtractionContext, FactorEvidence, SuggestionFactors } from "@/modules/geo/competitors/schema";

/**
 * Indicators, not proof. `matched` means a term of the company record appears in what the
 * candidate's own home page says; `unknown` means nothing was found, which is not evidence
 * against; `conflicting` is reserved for an explicit statement of exclusivity elsewhere.
 * The question the operator asked is context and never evidence about a candidate.
 * No score, no weights: a fixed order the operator can understand.
 */
export const EVALUATION_RULES_VERSION = "evaluate-2026-10-26.1";
export const MAX_SHOWN = 5;

export interface EvaluatedCandidate extends Candidate {
  factors: SuggestionFactors;
}

export interface Exclusion {
  candidate: Candidate;
  reason: "own_business" | "known_non_business" | "registered" | "dismissed" | "conflicting_zone";
}

export interface EvaluationResult {
  /** Ordered per FR-003b, already limited to MAX_SHOWN. */
  shown: EvaluatedCandidate[];
  /** Ordered candidates beyond the limit (counted, not shown). */
  overflow: number;
  excluded: Exclusion[];
}

/** Whole-phrase matches of each term in the page text; returns the matched terms. */
function matchedTerms(terms: string[], texts: (string | null)[]): { terms: string[]; origin: string } {
  const matched: string[] = [];
  let origin = "none";
  const sources: [string, string | null][] = [
    ["title", texts[0] ?? null],
    ["description", texts[1] ?? null],
  ];
  for (const term of terms) {
    const key = nameKey(term);
    if (key.length < 2) continue;
    for (const [name, text] of sources) {
      if (text && normalizeText(text).includes(` ${key} `)) {
        if (!matched.includes(term)) matched.push(term);
        if (origin === "none") origin = name;
        break;
      }
    }
  }
  return { terms: matched, origin };
}

function placeOf(context: ExtractionContext): { place: string; label: string } {
  const city = context.city?.trim();
  return city ? { place: city, label: "la ciudad" } : { place: context.countryName, label: "el país" };
}

/** Only these two forms count as an explicit exclusivity statement (SPEC FR-002). */
const EXCLUSIVITY = /\b(?:solo atendemos en|exclusivamente en)\s+([^.,;:!?\n]+)/giu;

function zoneFactor(candidate: Candidate, context: ExtractionContext): FactorEvidence {
  const head = candidate.head;
  const { place, label } = placeOf(context);
  const placeKey = nameKey(place);
  if (!head || head.webStatus !== "reachable") return { state: "unknown", reason: `No se pudo leer la portada para comprobar ${label}.`, origin: "none" };

  for (const text of [head.title, head.description]) {
    if (!text) continue;
    for (const m of text.matchAll(EXCLUSIVITY)) {
      const locality = nameKey(m[1] ?? "");
      if (locality && locality !== placeKey && !locality.includes(placeKey)) {
        return { state: "conflicting", reason: `La web declara atender solo en «${(m[1] ?? "").trim().slice(0, 60)}».`, terms: [place], origin: "description" };
      }
    }
  }
  const inText = matchedTerms([place], [head.title, head.description]);
  if (inText.terms.length > 0) return { state: "matched", reason: `Menciona ${place} en su ${inText.origin === "title" ? "título" : "descripción"}.`, terms: [place], origin: inText.origin };
  const inJsonLd = head.localities.some((l) => normalizeText(l).includes(` ${placeKey} `));
  if (inJsonLd) return { state: "matched", reason: `Declara ${place} en sus datos estructurados.`, terms: [place], origin: "jsonld" };
  return { state: "unknown", reason: `No encontramos ${place} en su portada; eso no significa que no atienda allí.`, origin: "none" };
}

function termFactor(label: "sector" | "services", terms: string[], candidate: Candidate): FactorEvidence {
  const head = candidate.head;
  const what = label === "sector" ? "el sector" : "los servicios";
  if (terms.length === 0) return { state: "unknown", reason: `La ficha no indica ${what}.`, origin: "none" };
  if (!head || head.webStatus !== "reachable") return { state: "unknown", reason: `No se pudo leer la portada para comprobar ${what}.`, origin: "none" };
  const found = matchedTerms(terms, [head.title, head.description]);
  if (found.terms.length > 0) {
    return { state: "matched", reason: `Su portada menciona «${found.terms.join("», «")}».`, terms: found.terms.slice(0, 10), origin: found.origin };
  }
  return { state: "unknown", reason: `Su portada no menciona ${what} con las mismas palabras.`, origin: "none" };
}

export function evaluateCandidate(candidate: Candidate, context: ExtractionContext): SuggestionFactors {
  const review: string[] = [...candidate.notes];
  const sector = termFactor("sector", [context.sector], candidate);
  const services = termFactor("services", context.services, candidate);
  const zone = zoneFactor(candidate, context);
  if (candidate.head?.webStatus === "reachable") review.push("La web responde, pero eso no confirma que sea la de esta empresa: revísalo.");
  for (const [factor, name] of [
    [sector, "sector"],
    [zone, "zona"],
    [services, "servicios"],
  ] as const) {
    if (factor.state === "unknown") review.push(`Sin indicios de ${name}: confirma a mano.`);
  }
  return { sector, zone, services, language: candidate.head?.lang ?? null, review: [...new Set(review)] };
}

function matchedCount(f: SuggestionFactors): number {
  return [f.sector, f.zone, f.services].filter((x) => x.state === "matched").length;
}

/** FR-003b: matched count desc, reachable first, then name key and hostname ascending. */
export function compareEvaluated(a: EvaluatedCandidate, b: EvaluatedCandidate): number {
  const byMatches = matchedCount(b.factors) - matchedCount(a.factors);
  if (byMatches !== 0) return byMatches;
  const reach = (c: EvaluatedCandidate) => (c.head?.webStatus === "reachable" ? 0 : 1);
  if (reach(a) !== reach(b)) return reach(a) - reach(b);
  if (a.nameKey !== b.nameKey) return a.nameKey < b.nameKey ? -1 : 1;
  const ha = a.host ?? "";
  const hb = b.host ?? "";
  return ha < hb ? -1 : ha > hb ? 1 : 0;
}

export function evaluateCandidates(
  candidates: Candidate[],
  context: ExtractionContext,
  known: { registeredKeys: Set<string>; dismissedKeys: Set<string> },
): EvaluationResult {
  const excluded: Exclusion[] = [];
  const kept: EvaluatedCandidate[] = [];
  for (const candidate of candidates) {
    const identity = { nameKey: candidate.nameKey || null, host: candidate.host };
    // Hosts are judged after public redirects too: a cited URL that lands on a directory is not a business.
    const hosts = [candidate.host, candidate.head?.finalHost].filter((h): h is string => Boolean(h));
    if (isOwnBusiness(identity, context) || hosts.some((h) => isOwnBusiness({ nameKey: null, host: h }, context))) {
      excluded.push({ candidate, reason: "own_business" });
      continue;
    }
    if (hosts.some(isKnownNonBusinessHost)) {
      excluded.push({ candidate, reason: "known_non_business" });
      continue;
    }
    const keys = identityKeys(identity);
    if (keys.some((k) => known.registeredKeys.has(k))) {
      excluded.push({ candidate, reason: "registered" });
      continue;
    }
    if (keys.some((k) => known.dismissedKeys.has(k))) {
      excluded.push({ candidate, reason: "dismissed" });
      continue;
    }
    const factors = evaluateCandidate(candidate, context);
    if (factors.zone.state === "conflicting") {
      excluded.push({ candidate, reason: "conflicting_zone" });
      continue;
    }
    kept.push({ ...candidate, factors });
  }
  kept.sort(compareEvaluated);
  return { shown: kept.slice(0, MAX_SHOWN), overflow: Math.max(0, kept.length - MAX_SHOWN), excluded };
}

export const EXCLUSION_LABELS: Record<Exclusion["reason"], string> = {
  own_business: "la propia empresa",
  known_non_business: "directorios, redes o buscadores",
  registered: "competidores ya registrados",
  dismissed: "descartados anteriormente",
  conflicting_zone: "webs que declaran atender solo en otra zona",
};
