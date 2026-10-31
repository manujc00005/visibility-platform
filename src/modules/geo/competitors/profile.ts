import { parse, type DefaultTreeAdapterMap } from "parse5";
import { z } from "zod";
import { extractPage } from "@/modules/audits/html";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import { COMPETITOR_KINDS, CUSTOMER_TYPES, PROFILE_LIMITS, ZONE_RELEVANCES, type CompetitorKind, type CustomerType, type ZoneRelevance } from "@/modules/geo/competitors/profile-options";
import { jsonLdLocalities } from "@/modules/geo/competitors/page-head";
import type { ExtractionProfile, GeoBusinessProfile } from "@/modules/geo/competitors/schema";
import { nameKey, normalizeText } from "@/modules/geo/detection";

/**
 * The business profile: what the company sells, to whom, whether its zone matters and which
 * competitors it wants to see. `proposeProfile` only drafts it from what the home page says,
 * with fixed rules and visible reasons; the operator confirms it before anything uses it.
 */
const HEADING_MIN = 3;
const HEADING_MAX = 60;

/** schema.org types of a business tied to a place. */
const LOCAL_TYPES = new Set([
  "LocalBusiness", "Dentist", "Store", "Restaurant", "Physician", "MedicalClinic", "MedicalBusiness", "Hospital", "Hotel", "BeautySalon", "HairSalon",
  "AutoRepair", "AutoDealer", "RealEstateAgent", "LegalService", "Attorney", "Notary", "Bakery", "CafeOrCoffeeShop", "BarOrPub", "ExerciseGym", "Pharmacy",
]);
const B2B_TERMS = ["pymes", "empresas", "negocios", "tu negocio", "tu empresa", "startups", "equipos", "profesionales", "b2b"];
const B2C_TERMS = ["particulares", "familias", "pacientes", "consumidores", "tienda online"];

function buildSchema(locale: Locale) {
  const t = getMessages(locale).geo.profile.validation;
  return z
    .object({
      summary: z.string({ error: t.summaryRequired }).trim().min(1, t.summaryRequired).max(PROFILE_LIMITS.summary, t.summaryMax(PROFILE_LIMITS.summary)),
      offerings: z
        .string()
        .default("")
        .transform((value) => [...new Set(value.split(/\r?\n/).map((v) => v.trim()).filter(Boolean))])
        .pipe(z.array(z.string().max(PROFILE_LIMITS.offering, t.offeringMax(PROFILE_LIMITS.offering))).max(PROFILE_LIMITS.offerings, t.offeringsMax(PROFILE_LIMITS.offerings))),
      customerType: z.enum(CUSTOMER_TYPES, { error: t.customerType }),
      targetCustomer: z.string({ error: t.targetRequired }).trim().min(1, t.targetRequired).max(PROFILE_LIMITS.targetCustomer, t.targetMax(PROFILE_LIMITS.targetCustomer)),
      zoneRelevance: z.enum(ZONE_RELEVANCES, { error: t.zoneRelevance }),
      servedArea: z.string().trim().max(PROFILE_LIMITS.servedArea, t.areaMax(PROFILE_LIMITS.servedArea)).default(""),
      competitorKinds: z.array(z.enum(COMPETITOR_KINDS, { error: t.kindsRequired }), { error: t.kindsRequired }).min(1, t.kindsRequired),
    })
    .superRefine((value, ctx) => {
      if (needsArea(value.zoneRelevance) && !value.servedArea) ctx.addIssue({ code: "custom", path: ["servedArea"], message: t.areaRequired });
    })
    .transform((value) => ({
      ...value,
      servedArea: value.servedArea || null,
      competitorKinds: orderKinds(value.competitorKinds),
    }));
}

const schemas = new Map<Locale, ReturnType<typeof buildSchema>>();

export function profileSchemaFor(locale: Locale = DEFAULT_LOCALE): ReturnType<typeof buildSchema> {
  let schema = schemas.get(locale);
  if (!schema) {
    schema = buildSchema(locale);
    schemas.set(locale, schema);
  }
  return schema;
}

export const needsArea = (zone: ZoneRelevance) => zone === "local" || zone === "regional";

/** Canonical order and no repeats, so the same choice always yields the same fingerprint. */
function orderKinds(kinds: readonly CompetitorKind[]): CompetitorKind[] {
  return COMPETITOR_KINDS.filter((kind) => kinds.includes(kind));
}

/** What an extraction freezes: the confirmed fields, without timestamps (FR-011). */
export function profileContext(profile: GeoBusinessProfile): ExtractionProfile {
  return {
    summary: profile.summary,
    offerings: profile.offerings,
    customerType: profile.customerType,
    targetCustomer: profile.targetCustomer,
    zoneRelevance: profile.zoneRelevance,
    servedArea: profile.servedArea,
    competitorKinds: orderKinds(profile.competitorKinds),
  };
}

export type ProposalNote =
  | { code: "summary_description" | "summary_heading" | "summary_missing" | "offerings_headings" | "offerings_record" | "customer_ambiguous" | "zone_city" | "zone_default" }
  | { code: "customer_terms"; terms: string[] }
  | { code: "zone_local_type"; type: string }
  | { code: "zone_languages"; languages: string[] };

export interface ProfileDraft {
  summary: string;
  offerings: string[];
  customerType: CustomerType;
  targetCustomer: string;
  zoneRelevance: ZoneRelevance;
  servedArea: string;
  competitorKinds: CompetitorKind[];
}

type TreeNode = DefaultTreeAdapterMap["childNode"] | DefaultTreeAdapterMap["document"];

function collectLanguages(node: TreeNode, into: Set<string>): void {
  if (!("childNodes" in node)) return;
  for (const child of node.childNodes) {
    if ("tagName" in child) {
      if (child.tagName === "link") {
        const attribute = (name: string) => child.attrs.find((a) => a.name === name)?.value.trim().toLowerCase() ?? "";
        const language = attribute("hreflang").split("-")[0] ?? "";
        if (attribute("rel").split(/\s+/).includes("alternate") && language && language !== "x") into.add(language);
      }
      collectLanguages(child, into);
    }
  }
}

function foundTerms(terms: string[], text: string): string[] {
  return terms.filter((term) => text.includes(` ${nameKey(term)} `));
}

function offeringsFrom(headings: { level: number; text: string }[]): string[] {
  const seen = new Set<string>();
  const offerings: string[] = [];
  for (const { level, text } of headings) {
    const value = text.trim();
    const key = nameKey(value);
    if ((level !== 2 && level !== 3) || value.length < HEADING_MIN || value.length > HEADING_MAX || /[.?!→>|]/.test(value) || !key || seen.has(key)) continue;
    seen.add(key);
    offerings.push(value);
    if (offerings.length === PROFILE_LIMITS.offerings) break;
  }
  return offerings;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Pure: same page and same company record, same draft. Page text is data for the form, never instructions. */
export function proposeProfile(input: { html: string; url: string; city: string | null; services: string[] }): { draft: ProfileDraft; notes: ProposalNote[] } {
  const facts = extractPage(input.html, input.url);
  const notes: ProposalNote[] = [];
  const h1 = facts.headings.find((h) => h.level === 1)?.text ?? "";
  const summary = facts.metaDescription ?? h1;
  notes.push({ code: facts.metaDescription ? "summary_description" : h1 ? "summary_heading" : "summary_missing" });

  const fromHeadings = offeringsFrom(facts.headings);
  notes.push({ code: fromHeadings.length > 0 ? "offerings_headings" : "offerings_record" });

  const text = normalizeText([facts.title, facts.metaDescription, ...facts.headings.map((h) => h.text)].filter(Boolean).join(" . "));
  const business = foundTerms(B2B_TERMS, text);
  const consumers = foundTerms(B2C_TERMS, text);
  const terms = [...business, ...consumers];
  const customerType: CustomerType = business.length > 0 && consumers.length === 0 ? "b2b" : consumers.length > 0 && business.length === 0 ? "b2c" : "both";
  notes.push(terms.length > 0 ? { code: "customer_terms", terms } : { code: "customer_ambiguous" });

  const types = [...facts.structuredData.types, ...facts.structuredData.microdataTypes].map((t) => t.split(/[/#]/).pop() ?? t);
  const localType = types.find((t) => LOCAL_TYPES.has(t));
  const languages = new Set<string>();
  collectLanguages(parse(input.html), languages);
  const localities = jsonLdLocalities(input.html);
  const city = input.city?.trim() || null;
  let zoneRelevance: ZoneRelevance = "national";
  if (localType) {
    zoneRelevance = "local";
    notes.push({ code: "zone_local_type", type: localType });
  } else if (city) {
    zoneRelevance = "local";
    notes.push({ code: "zone_city" });
  } else if (languages.size >= 2) {
    zoneRelevance = "international";
    notes.push({ code: "zone_languages", languages: [...languages] });
  } else {
    notes.push({ code: "zone_default" });
  }

  return {
    draft: {
      summary: truncate(summary, PROFILE_LIMITS.summary),
      offerings: (fromHeadings.length > 0 ? fromHeadings : input.services).slice(0, PROFILE_LIMITS.offerings).map((o) => truncate(o, PROFILE_LIMITS.offering)),
      customerType,
      targetCustomer: terms.join(", "),
      zoneRelevance,
      servedArea: needsArea(zoneRelevance) ? (city ?? localities[0] ?? "") : "",
      competitorKinds: ["direct", "indirect"],
    },
    notes,
  };
}
