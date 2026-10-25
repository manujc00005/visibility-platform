import { parse, type DefaultTreeAdapterMap } from "parse5";

/**
 * Extracts SEO facts from one HTML document. Output is plain text only — bounded and
 * truncated — never markup, so nothing from the audited site is ever re-emitted as HTML.
 */

type Node = DefaultTreeAdapterMap["childNode"] | DefaultTreeAdapterMap["document"];
type Element = DefaultTreeAdapterMap["element"];

export interface PageFacts {
  title: string | null;
  titleLength: number;
  titleCount: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  metaDescriptionCount: number;
  /** Values of <meta name="robots"> and <meta name="googlebot">. */
  metaRobots: string[];
  lang: string | null;
  viewport: string | null;
  /** Absolute http(s) canonical URLs. */
  canonicals: string[];
  /** All <link rel="canonical"> elements, valid or not. */
  canonicalCount: number;
  headings: { level: number; text: string }[];
  headingCounts: Record<"h1" | "h2" | "h3" | "h4" | "h5" | "h6", number>;
  openGraph: Record<string, string>;
  structuredData: {
    jsonLdBlocks: number;
    invalidJsonLdBlocks: number;
    types: string[];
    microdataTypes: string[];
  };
  links: {
    /** Unique internal URLs (same host, ignoring "www."), fragment removed. */
    internal: string[];
    internalCount: number;
    externalCount: number;
    nofollowCount: number;
  };
}

const MAX_TEXT = 300;
const MAX_HEADINGS = 100;
const MAX_INTERNAL_LINKS = 50;
const MAX_JSON_LD_BYTES = 200_000;
const MAX_TYPES = 50;
const MAX_OG_KEYS = 20;

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string, max = MAX_TEXT): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function attr(element: Element, name: string): string | null {
  return element.attrs.find((a) => a.name === name)?.value ?? null;
}

function textOf(node: Node): string {
  if (node.nodeName === "#text") return (node as DefaultTreeAdapterMap["textNode"]).value;
  if (!("childNodes" in node)) return "";
  return node.childNodes.map((child) => textOf(child)).join(" ");
}

function* elements(node: Node): Generator<Element> {
  if (!("childNodes" in node)) return;
  for (const child of node.childNodes) {
    if ("tagName" in child) {
      yield child;
      // <template> children live in `content`, outside childNodes: they are not part of the page.
      yield* elements(child);
    }
  }
}

function absoluteHttpUrl(href: string, base: string): URL | null {
  try {
    const url = new URL(href.trim(), base);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function hostKey(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function collectTypes(value: unknown, into: Set<string>, depth = 0): void {
  if (depth > 20 || into.size >= MAX_TYPES) return;
  if (Array.isArray(value)) {
    for (const item of value) collectTypes(item, into, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    const type = (value as Record<string, unknown>)["@type"];
    if (typeof type === "string") into.add(type);
    else if (Array.isArray(type)) for (const t of type) if (typeof t === "string") into.add(t);
    for (const nested of Object.values(value)) collectTypes(nested, into, depth + 1);
  }
}

export function extractPage(html: string, pageUrl: string): PageFacts {
  const document = parse(html);
  const pageHost = hostKey(new URL(pageUrl).hostname);

  const titles: string[] = [];
  const descriptions: string[] = [];
  const metaRobots: string[] = [];
  const canonicals: string[] = [];
  let canonicalCount = 0;
  let lang: string | null = null;
  let viewport: string | null = null;
  const headings: PageFacts["headings"] = [];
  const headingCounts: PageFacts["headingCounts"] = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  const openGraph: Record<string, string> = {};
  let jsonLdBlocks = 0;
  let invalidJsonLdBlocks = 0;
  const types = new Set<string>();
  const microdataTypes = new Set<string>();
  const internal = new Set<string>();
  let externalCount = 0;
  let nofollowCount = 0;

  for (const element of elements(document)) {
    const tag = element.tagName;
    if (tag === "html") lang = attr(element, "lang");
    else if (tag === "title") titles.push(collapse(textOf(element)));
    else if (tag === "meta") {
      const name = attr(element, "name")?.toLowerCase();
      const property = attr(element, "property")?.toLowerCase();
      const content = attr(element, "content") ?? "";
      if (name === "description") descriptions.push(collapse(content));
      else if (name === "robots" || name === "googlebot") metaRobots.push(truncate(collapse(content)));
      else if (name === "viewport") viewport = truncate(collapse(content));
      if (property?.startsWith("og:") && !(property in openGraph) && Object.keys(openGraph).length < MAX_OG_KEYS) {
        openGraph[property] = truncate(collapse(content), 500);
      }
    } else if (tag === "link") {
      const rel = (attr(element, "rel") ?? "").toLowerCase().split(/\s+/);
      if (rel.includes("canonical")) {
        canonicalCount += 1;
        const url = absoluteHttpUrl(attr(element, "href") ?? "", pageUrl);
        if (url) canonicals.push(url.href);
      }
    } else if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      headingCounts[tag as keyof PageFacts["headingCounts"]] += 1;
      if (headings.length < MAX_HEADINGS) headings.push({ level, text: truncate(collapse(textOf(element))) });
    } else if (tag === "script" && (attr(element, "type") ?? "").toLowerCase().trim() === "application/ld+json") {
      jsonLdBlocks += 1;
      const raw = textOf(element);
      try {
        if (raw.length > MAX_JSON_LD_BYTES) throw new Error("too large");
        collectTypes(JSON.parse(raw), types);
      } catch {
        invalidJsonLdBlocks += 1;
      }
    } else if (tag === "a") {
      const href = attr(element, "href")?.trim();
      // In-page anchors ("#section") point to this same page, not to another URL.
      const url = href && !href.startsWith("#") ? absoluteHttpUrl(href, pageUrl) : null;
      if (!url) continue;
      if ((attr(element, "rel") ?? "").toLowerCase().split(/\s+/).includes("nofollow")) nofollowCount += 1;
      url.hash = "";
      if (hostKey(url.hostname) === pageHost) {
        if (internal.size < MAX_INTERNAL_LINKS || internal.has(url.href)) internal.add(url.href);
      } else externalCount += 1;
    }
    const itemtype = attr(element, "itemtype");
    if (itemtype && microdataTypes.size < MAX_TYPES) {
      for (const type of itemtype.split(/\s+/).filter(Boolean)) microdataTypes.add(truncate(type, 200));
    }
  }

  const internalLinks = [...internal];
  return {
    title: titles[0] !== undefined ? truncate(titles[0]) : null,
    titleLength: titles[0]?.length ?? 0,
    titleCount: titles.length,
    metaDescription: descriptions[0] !== undefined ? truncate(descriptions[0], 500) : null,
    metaDescriptionLength: descriptions[0]?.length ?? 0,
    metaDescriptionCount: descriptions.length,
    metaRobots,
    lang: lang ? truncate(lang, 35) : null,
    viewport,
    canonicals,
    canonicalCount,
    headings,
    headingCounts,
    openGraph,
    structuredData: {
      jsonLdBlocks,
      invalidJsonLdBlocks,
      types: [...types],
      microdataTypes: [...microdataTypes],
    },
    links: {
      internal: internalLinks,
      internalCount: internalLinks.length,
      externalCount,
      nofollowCount,
    },
  };
}

const CHARSET_IN_HEADER = /charset\s*=\s*["']?([\w.:-]+)/i;
const CHARSET_IN_META = /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i;

/** Decodes an HTML body using the Content-Type charset, then <meta charset>, then UTF-8. */
export function decodeHtml(body: Buffer, contentType: string | null): string {
  const candidates = [
    contentType?.match(CHARSET_IN_HEADER)?.[1],
    body.subarray(0, 1024).toString("latin1").match(CHARSET_IN_META)?.[1],
    "utf-8",
  ];
  for (const label of candidates) {
    if (!label) continue;
    try {
      return new TextDecoder(label.toLowerCase()).decode(body);
    } catch {
      // Unknown label: try the next candidate.
    }
  }
  return body.toString("utf8");
}
