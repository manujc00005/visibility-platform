import { nameKey } from "@/modules/geo/detection";

/**
 * Brand terms of a company and the regular expression that sends them to Search Analytics
 * (feature 007). Pure. Terms come from the company record (D001): name, aliases, domain.
 *
 * One variant builder serves both Google (RE2) and the local row label (JavaScript), so both
 * give the same verdict (D004). Variants use only escaped literals and " +" between words,
 * a subset both engines read the same way. The hyphen is never escaped: it is literal outside
 * a class in RE2, and escaping it is a syntax error in JavaScript with the `u` flag.
 */

/** Documented maximum of a Search Analytics filter `expression`. */
export const MAX_EXPRESSION_LENGTH = 4096;
const PREFIX = "(?i)";
const MIN_KEY_CHARS = 3;
const SPECIAL = /[\\^$.|?*+()[\]{}]/g;

/** Fixed text: it never quotes the domain or any term. */
export class BrandTermsError extends Error {
  constructor() {
    super("La expresión de marca no cabe en el límite de Search Console");
    this.name = "BrandTermsError";
  }
}

export interface BrandTerms {
  /** Terms actually used, as typed (trimmed), in order: name, aliases, domain. */
  terms: string[];
  /** RE2 expression for `includingRegex` / `excludingRegex`. */
  expression: string;
  /** True when a name or alias was left out to stay under the limit. */
  truncated: boolean;
}

const stripAccents = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "");

/** Words escaped one by one and joined so any run of spaces in the query matches. */
function literal(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(SPECIAL, "\\$&"))
    .join(" +");
}

/** As typed, without accents, and in its nameKey form (punctuation as spaces); no repeats. */
function variantsOf(term: string): string[] {
  const lower = term.trim().toLowerCase();
  const variants = [literal(lower), literal(stripAccents(lower)), literal(nameKey(term))].filter(Boolean);
  return [...new Set(variants)];
}

const keyLength = (key: string) => key.replace(/ /g, "").length;

export function brandTerms(site: { name: string; brandAliases: readonly string[]; domain: string }): BrandTerms {
  const domain = site.domain.trim();
  const domainKey = nameKey(domain);
  const seen = new Set([domainKey]);
  const candidates: string[] = [];
  for (const raw of [site.name, ...site.brandAliases]) {
    const term = raw.trim();
    const key = nameKey(term);
    if (keyLength(key) < MIN_KEY_CHARS || seen.has(key)) continue;
    seen.add(key);
    candidates.push(term);
  }

  // The domain is reserved first so a long name or alias can never push it out.
  const domainVariants = variantsOf(domain);
  // String length counts UTF-16 units, never fewer than characters: a safe upper bound.
  let length = PREFIX.length + domainVariants.join("|").length;
  if (length > MAX_EXPRESSION_LENGTH) throw new BrandTermsError();

  const kept: { term: string; variants: string[] }[] = [];
  let truncated = false;
  for (const term of candidates) {
    const variants = variantsOf(term);
    const cost = variants.join("|").length + 1;
    if (length + cost > MAX_EXPRESSION_LENGTH) {
      truncated = true;
      continue;
    }
    length += cost;
    kept.push({ term, variants });
  }
  kept.push({ term: domain, variants: domainVariants });

  return {
    terms: kept.map((k) => k.term),
    expression: PREFIX + kept.flatMap((k) => k.variants).join("|"),
    truncated,
  };
}

/**
 * Whether a query contains one of the stored terms, with the same variants as the expression
 * sent to Google. `iu` replaces the `(?i)` prefix, which JavaScript does not accept.
 */
export function isBrandedQuery(query: string, terms: readonly string[]): boolean {
  const variants = terms.flatMap(variantsOf);
  if (variants.length === 0) return false;
  return new RegExp(variants.join("|"), "iu").test(query);
}
