/**
 * Deterministic brand detection in AI answers. No LLM: the same text and panel always
 * give the same result, which keeps measurements reproducible (B05).
 */

export interface PanelEntry {
  name: string;
  aliases: string[];
  /** ASCII registrable domain without "www.", or null. */
  domain: string | null;
}

export interface BrandPanel {
  brand: PanelEntry;
  competitors: (PanelEntry & { id: string })[];
}

export interface Mentions {
  brand: boolean;
  competitors: Record<string, boolean>;
}

export interface ClassifiedSource {
  url: string;
  domain: string;
  title: string | null;
  kind: "own" | "competitor" | "other";
  competitorId?: string;
}

/** Lowercase, strip accents, punctuation to spaces, padded so " term " means whole words. */
export function normalizeText(value: string): string {
  const flat = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return ` ${flat} `;
}

/**
 * Persisted identity of a name: the normalized text without the padding spaces that
 * `normalizeText` adds for whole-word detection. Internal runs of spaces are already one.
 */
export function nameKey(value: string): string {
  return normalizeText(value).trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionsEntry(normalized: string, raw: string, entry: PanelEntry): boolean {
  for (const term of [entry.name, ...entry.aliases]) {
    const needle = normalizeText(term);
    if (needle.trim().length >= 2 && normalized.includes(needle)) return true;
  }
  if (entry.domain) {
    // "clinicagarcia.es" or "www.clinicagarcia.es", but not "miclinicagarcia.es" or "clinicagarcia.es.fake.com".
    const pattern = new RegExp(`(?<![a-z0-9-])(?:[a-z0-9-]+\\.)*${escapeRegex(entry.domain)}(?![a-z0-9-]|\\.[a-z0-9])`, "i");
    if (pattern.test(raw)) return true;
  }
  return false;
}

export function detectMentions(text: string, panel: BrandPanel): Mentions {
  const normalized = normalizeText(text);
  const raw = text.toLowerCase();
  return {
    brand: mentionsEntry(normalized, raw, panel.brand),
    competitors: Object.fromEntries(panel.competitors.map((c) => [c.id, mentionsEntry(normalized, raw, c)])),
  };
}

function hostMatches(host: string, domain: string | null): boolean {
  return Boolean(domain) && (host === domain || host.endsWith(`.${domain}`));
}

/** Classifies the sources an answer cited. Non-http(s) URLs are dropped. */
export function classifySources(
  sources: { url: string; title: string | null }[],
  panel: BrandPanel,
): { sources: ClassifiedSource[]; ownCited: boolean; competitorsCited: string[] } {
  const classified: ClassifiedSource[] = [];
  for (const source of sources) {
    let url: URL;
    try {
      url = new URL(source.url);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const base = { url: source.url, domain: host, title: source.title };
    if (hostMatches(host, panel.brand.domain)) {
      classified.push({ ...base, kind: "own" });
      continue;
    }
    const competitor = panel.competitors.find((c) => hostMatches(host, c.domain));
    classified.push(competitor ? { ...base, kind: "competitor", competitorId: competitor.id } : { ...base, kind: "other" });
  }
  return {
    sources: classified,
    ownCited: classified.some((s) => s.kind === "own"),
    competitorsCited: [...new Set(classified.flatMap((s) => (s.competitorId ? [s.competitorId] : [])))],
  };
}
