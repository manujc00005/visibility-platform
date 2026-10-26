import { parse, type DefaultTreeAdapterMap } from "parse5";
import type { FetchBudget, SafeFetcher } from "@/modules/audits/fetcher/safe-fetch";
import { decodeHtml, extractPage } from "@/modules/audits/html";
import type { PageHead } from "@/modules/geo/competitors/extract";

/**
 * Reads only the home page of a cited hostname, over HTTPS and through the safe fetcher,
 * to learn what the page says about itself: title, description, language and the
 * localities it declares in JSON-LD. A 2xx proves the page answers, nothing more. No
 * links, sitemaps or inner pages are ever requested, and no HTML is kept.
 */
export const PAGE_HEAD_LIMITS = {
  maxBytes: 256 * 1024,
  /** Per candidate, cumulative over DNS, redirects and body (SPEC). */
  perCandidateMs: 5_000,
  maxTitle: 120,
  maxDescription: 500,
  maxLocalities: 10,
} as const;

type Node = DefaultTreeAdapterMap["childNode"] | DefaultTreeAdapterMap["document"];

function* scripts(node: Node): Generator<DefaultTreeAdapterMap["element"]> {
  if (!("childNodes" in node)) return;
  for (const child of node.childNodes) {
    if ("tagName" in child) {
      if (child.tagName === "script" && (child.attrs.find((a) => a.name === "type")?.value ?? "").trim().toLowerCase() === "application/ld+json") yield child;
      yield* scripts(child);
    }
  }
}

function collectLocalities(value: unknown, into: Set<string>, depth = 0): void {
  if (depth > 12 || into.size >= PAGE_HEAD_LIMITS.maxLocalities) return;
  if (Array.isArray(value)) {
    for (const item of value) collectLocalities(item, into, depth + 1);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const key of ["addressLocality", "addressRegion", "areaServed"]) {
    const v = record[key];
    if (typeof v === "string" && v.trim()) into.add(v.trim().slice(0, 80));
    else if (Array.isArray(v)) for (const x of v) if (typeof x === "string" && x.trim()) into.add(x.trim().slice(0, 80));
    else if (v && typeof v === "object" && !Array.isArray(v)) {
      const name = (v as Record<string, unknown>).name;
      if (typeof name === "string" && name.trim()) into.add(name.trim().slice(0, 80));
    }
  }
  for (const nested of Object.values(record)) collectLocalities(nested, into, depth + 1);
}

/** Localities declared in JSON-LD blocks (PostalAddress, areaServed). Exported for tests. */
export function jsonLdLocalities(html: string): string[] {
  const localities = new Set<string>();
  for (const element of scripts(parse(html))) {
    const raw = element.childNodes.map((n) => (n.nodeName === "#text" ? (n as DefaultTreeAdapterMap["textNode"]).value : "")).join("");
    if (raw.length > 200_000) continue;
    try {
      collectLocalities(JSON.parse(raw), localities);
    } catch {
      // Invalid JSON-LD: no localities from this block.
    }
  }
  return [...localities];
}

function truncate(text: string | null, max: number): string | null {
  if (text === null) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function hostWithoutWww(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * `budget` is shared by every candidate of one extraction (request attempts, deadline);
 * `deadlineAt` is this candidate's own absolute limit; `signal` cancels everything.
 */
export async function fetchPageHead(
  host: string,
  fetcher: SafeFetcher,
  budget: FetchBudget,
  options: { deadlineAt: number; signal: AbortSignal; now?: () => Date },
): Promise<PageHead> {
  const initialUrl = `https://${host}/`;
  const checkedAt = (options.now ?? (() => new Date()))();
  const base: PageHead = { host, finalHost: null, initialUrl, finalUrl: null, webStatus: "unverified", title: null, description: null, lang: null, localities: [], checkedAt };
  const result = await fetcher.fetch(
    initialUrl,
    { maxBytes: PAGE_HEAD_LIMITS.maxBytes, timeoutMs: PAGE_HEAD_LIMITS.perCandidateMs, deadlineAt: options.deadlineAt, signal: options.signal },
    budget,
  );
  if (!result.ok) {
    const kind = result.failure.kind;
    const webStatus: PageHead["webStatus"] =
      kind === "blocked_destination" || kind === "invalid_url" ? "blocked" : kind === "dns" || kind === "network" || kind === "too_many_redirects" ? "unreachable" : "unverified";
    return { ...base, webStatus, finalUrl: result.failure.url, finalHost: hostWithoutWww(result.failure.url) };
  }
  const { response } = result;
  const finalHost = hostWithoutWww(response.url);
  if (response.status < 200 || response.status >= 300) {
    return { ...base, webStatus: "unreachable", finalUrl: response.url, finalHost };
  }
  const contentType = response.contentType ?? "";
  if (!/html|xml/i.test(contentType) && contentType !== "") {
    return { ...base, webStatus: "reachable", finalUrl: response.url, finalHost };
  }
  const html = decodeHtml(response.body, response.contentType);
  const facts = extractPage(html, response.url);
  return {
    ...base,
    webStatus: "reachable",
    finalUrl: response.url,
    finalHost,
    title: truncate(facts.title, PAGE_HEAD_LIMITS.maxTitle),
    description: truncate(facts.metaDescription, PAGE_HEAD_LIMITS.maxDescription),
    lang: facts.lang,
    localities: jsonLdLocalities(html),
  };
}
