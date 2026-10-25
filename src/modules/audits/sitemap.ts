import { gunzipSync } from "node:zlib";

/**
 * Sitemap parsing without an XML parser: documents with a DTD or entity declarations are
 * rejected outright (no XXE, no entity expansion), gzip is decompressed with a hard
 * output cap, and only <loc> values are extracted.
 */

export const SITEMAP_MAX_DECOMPRESSED_BYTES = 5_000_000;
const SAMPLE_SIZE = 50;

export type SitemapParseError = "too_large" | "invalid_gzip" | "dtd_not_allowed" | "not_a_sitemap";

export interface ParsedSitemap {
  kind: "urlset" | "index";
  locCount: number;
  sample: string[];
  invalidLocCount: number;
}

export type SitemapResult = { ok: true; sitemap: ParsedSitemap } | { ok: false; error: SitemapParseError };

const GZIP_MAGIC = [0x1f, 0x8b];

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function parseSitemap(body: Buffer): SitemapResult {
  let data = body;
  if (body.length >= 2 && body[0] === GZIP_MAGIC[0] && body[1] === GZIP_MAGIC[1]) {
    try {
      data = gunzipSync(body, { maxOutputLength: SITEMAP_MAX_DECOMPRESSED_BYTES });
    } catch (error) {
      return { ok: false, error: (error as { code?: string }).code === "ERR_BUFFER_TOO_LARGE" ? "too_large" : "invalid_gzip" };
    }
  }
  if (data.length > SITEMAP_MAX_DECOMPRESSED_BYTES) return { ok: false, error: "too_large" };

  const text = data.toString("utf8");
  // An HTML page served at the sitemap URL (soft 404) is "not a sitemap", not an XML attack.
  if (/^\s*(?:<!doctype html|<html[\s>])/i.test(text)) return { ok: false, error: "not_a_sitemap" };
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) return { ok: false, error: "dtd_not_allowed" };

  const kind = /<sitemapindex[\s>]/i.test(text) ? "index" : /<urlset[\s>]/i.test(text) ? "urlset" : null;
  if (!kind) return { ok: false, error: "not_a_sitemap" };

  const sample: string[] = [];
  let locCount = 0;
  let invalidLocCount = 0;
  for (const match of text.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/loc>/gi)) {
    locCount += 1;
    const loc = decodeEntities(match[1]!.trim());
    let valid = false;
    try {
      const url = new URL(loc);
      valid = url.protocol === "http:" || url.protocol === "https:";
    } catch {
      valid = false;
    }
    if (!valid) invalidLocCount += 1;
    else if (sample.length < SAMPLE_SIZE) sample.push(loc);
  }
  return { ok: true, sitemap: { kind, locCount, sample, invalidLocCount } };
}
