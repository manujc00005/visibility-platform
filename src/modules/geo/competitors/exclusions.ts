import { nameKey } from "@/modules/geo/detection";
import type { ExtractionContext } from "@/modules/geo/competitors/schema";

/**
 * What is never suggested as a competitor: known directories, search engines, social
 * networks and marketplaces; the company itself; and anything the operator already
 * registered or dismissed. Hosts are compared as hostnames without "www." using equality
 * or a dot-boundary suffix: "empresa.es.ejemplo.com" does not match "empresa.es".
 * This list is versioned with the rest of the rules and does not pretend to recognise
 * directories outside it by reading a home page.
 */
export const KNOWN_NON_BUSINESS_HOSTS: readonly string[] = [
  // Search, maps and assistants
  "google.com",
  "google.es",
  "bing.com",
  "duckduckgo.com",
  "yahoo.com",
  "openai.com",
  "chatgpt.com",
  // Social networks and video
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "youtube.com",
  "pinterest.com",
  "threads.net",
  // Encyclopedias and generic media
  "wikipedia.org",
  "wikidata.org",
  // Directories and review sites (Spain first)
  "paginasamarillas.es",
  "yelp.com",
  "yelp.es",
  "tripadvisor.com",
  "tripadvisor.es",
  "trustpilot.com",
  "infoempresa.com",
  "einforma.com",
  "axesor.es",
  "empresite.eleconomista.es",
  "cylex.es",
  "cylex-espana.es",
  "habitissimo.es",
  "doctoralia.es",
  "topdoctors.es",
  "treatwell.es",
  "clutch.co",
  "goodfirms.co",
  "sortlist.com",
  "sortlist.es",
  "g2.com",
  "capterra.com",
  "capterra.es",
  "getapp.com",
  "crunchbase.com",
  "glassdoor.com",
  "glassdoor.es",
  "indeed.com",
  "infojobs.net",
  "qdq.com",
  "11870.com",
  "hotfrog.es",
  "europages.es",
  "europages.com",
  // Marketplaces and classifieds
  "amazon.com",
  "amazon.es",
  "ebay.es",
  "ebay.com",
  "etsy.com",
  "aliexpress.com",
  "idealista.com",
  "fotocasa.es",
  "milanuncios.com",
  "wallapop.com",
  "booking.com",
  "airbnb.com",
  "airbnb.es",
  "fiverr.com",
  "upwork.com",
  "malt.es",
  "malt.com",
  // Builders and hosting where a path, not the host, identifies a business
  "blogspot.com",
  "wordpress.com",
  "wixsite.com",
  "medium.com",
  "github.com",
  "notion.site",
  "linktr.ee",
];

export const EXCLUSIONS_VERSION = "exclusions-2026-10-26.1";

/** Equality or dot-boundary suffix match against one known host. */
export function hostMatches(host: string, known: string): boolean {
  return host === known || host.endsWith(`.${known}`);
}

export function isKnownNonBusinessHost(host: string): boolean {
  return KNOWN_NON_BUSINESS_HOSTS.some((known) => hostMatches(host, known));
}

/** The company itself: its own hostname (any subdomain of it) or its brand name and aliases. */
export function isOwnBusiness(candidate: { nameKey: string | null; host: string | null }, context: ExtractionContext): boolean {
  if (candidate.host && hostMatches(candidate.host, context.hostname)) return true;
  if (candidate.nameKey) {
    const own = new Set([context.brandName, ...context.aliases].map(nameKey).filter((k) => k.length > 0));
    if (own.has(candidate.nameKey)) return true;
  }
  return false;
}

/** Prefixed identity keys used by dismissals and registered-competitor checks. */
export function identityKeys(candidate: { nameKey: string | null; host: string | null }): string[] {
  const keys: string[] = [];
  if (candidate.host) keys.push(`host:${candidate.host}`);
  if (candidate.nameKey) keys.push(`name:${candidate.nameKey}`);
  return keys;
}

/** Keys of competitors already registered (active or archived), for exclusion by host or name. */
export function registeredKeys(competitors: { name: string; domain: string | null }[]): Set<string> {
  const keys = new Set<string>();
  for (const c of competitors) {
    const key = nameKey(c.name);
    if (key) keys.add(`name:${key}`);
    if (c.domain) keys.add(`host:${c.domain}`);
  }
  return keys;
}
