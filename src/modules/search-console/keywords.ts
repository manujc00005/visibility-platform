import { z } from "zod";
import { escapeRe2Literal, MAX_EXPRESSION_LENGTH } from "@/modules/search-console/brand-terms";
import { GscError, type AnalyticsRow } from "@/modules/search-console/google";

export const MAX_TRACKED_KEYWORDS = 25;
export const KEYWORD_ROW_LIMIT = 25000;
const DAY = 86_400_000;
const canonical = (text: string) => text.normalize("NFC").trim().toLowerCase().replace(/\s+/gu, " ").normalize("NFC");
const invalid = () => new GscError("error", "Los datos de búsquedas seguidas no tienen un formato válido.");
/** Controls, lone surrogates and bidi overrides: Postgres or the page would not show what was typed. */
const FORBIDDEN = /[\p{Cc}\p{Cs}\u202A-\u202E\u2066-\u2069]/u;

export function normalizeTrackedKeyword(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 1000) throw invalid();
  const keyword = canonical(raw);
  const length = Array.from(keyword).length;
  if (length < 2 || length > 80 || FORBIDDEN.test(keyword)) throw invalid();
  return keyword;
}

/** Escaped literals, whitespace-tolerant between words and anchored: only whole queries match. */
export function keywordExpression(keywords: readonly string[]): string | null {
  if (keywords.length > MAX_TRACKED_KEYWORDS) throw invalid();
  if (keywords.length === 0) return null;
  const normalized = keywords.map(normalizeTrackedKeyword);
  if (new Set(normalized).size !== keywords.length) throw invalid();
  const variants = normalized.map((keyword) => keyword.split(" ").map((word) => {
    const forms = [...new Set([word, word.normalize("NFD")])].map(escapeRe2Literal);
    return forms.length === 1 ? forms[0] : `(?:${forms.join("|")})`;
  }).join("[\\s\\p{Z}]+"));
  const expression = `(?i)^(?:${variants.join("|")})$`;
  if (Buffer.byteLength(expression, "utf8") > MAX_EXPRESSION_LENGTH) {
    throw new GscError("keyword_limit", "La expresión de búsquedas seguidas supera el límite de Search Console.");
  }
  return expression;
}

export function dayMillis(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw invalid();
  const value = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== day) throw invalid();
  return value;
}
export const addDays = (day: string, days: number) => new Date(dayMillis(day) + days * DAY).toISOString().slice(0, 10);

/** Date labels are GSC Pacific calendar days, not local-time instants. */
export function keywordWindow(end: string) {
  const start = addDays(end, -181);
  return { start, end, starts: Array.from({ length: 26 }, (_, i) => addDays(start, i * 7)) };
}

const metric = z.number().finite().nonnegative();
const weekSchema = z.object({
  start: z.string(), clicks: metric, impressions: metric.positive(), position: metric.positive(), daysWithData: z.number().int().min(1).max(7),
}).strict();
const seriesSchema = z.object({
  version: z.literal(1), start: z.string(), end: z.string(),
  keywords: z.array(z.object({ keyword: z.string(), weeks: z.array(weekSchema).max(26) }).strict()).max(MAX_TRACKED_KEYWORDS),
}).strict();
export type KeywordWeek = z.infer<typeof weekSchema>;
export type KeywordSeries = z.infer<typeof seriesSchema>;

export function parseKeywordSeries(raw: unknown): KeywordSeries | null {
  const parsed = seriesSchema.safeParse(raw);
  if (!parsed.success) return null;
  const series = parsed.data;
  try {
    const window = keywordWindow(series.end);
    if (series.start !== window.start) return null;
    const seen = new Set<string>();
    for (const item of series.keywords) {
      if (normalizeTrackedKeyword(item.keyword) !== item.keyword || seen.has(item.keyword)) return null;
      seen.add(item.keyword);
      let previous = "";
      for (const week of item.weeks) {
        if (!window.starts.includes(week.start) || week.start <= previous) return null;
        previous = week.start;
      }
    }
    return series;
  } catch { return null; }
}

export function aggregateKeywordSeries(keywords: readonly string[], end: string, rows: AnalyticsRow[]): KeywordSeries {
  const window = keywordWindow(end);
  if (rows.length >= KEYWORD_ROW_LIMIT) throw new GscError("keyword_limit", "Search Console alcanzó el límite de filas de búsquedas seguidas; la respuesta puede estar truncada.");
  keywordExpression(keywords);
  const data = new Map(keywords.map((k) => [normalizeTrackedKeyword(k), new Map<string, { clicks: number; impressions: number; weighted: number; days: Set<string> }>()]));
  const originals = new Set<string>();
  for (const row of rows) {
    if (row.keys.length !== 2 || row.keys.some((k) => typeof k !== "string")) throw invalid();
    const [date, query] = row.keys as [string, string];
    const time = dayMillis(date);
    const weeks = data.get(canonical(query));
    if (!weeks) continue;
    if (date < window.start || date > end || ![row.clicks, row.impressions, row.position].every(Number.isFinite) || row.clicks < 0 || row.impressions < 0) throw invalid();
    const originalKey = JSON.stringify([date, query]);
    if (originals.has(originalKey)) throw invalid();
    originals.add(originalKey);
    if (row.impressions === 0) continue;
    if (row.position <= 0) throw invalid();
    const start = window.starts[Math.floor((time - dayMillis(window.start)) / DAY / 7)]!;
    const week = weeks.get(start) ?? { clicks: 0, impressions: 0, weighted: 0, days: new Set<string>() };
    week.clicks += row.clicks;
    week.impressions += row.impressions;
    week.weighted += row.position * row.impressions;
    week.days.add(date);
    weeks.set(start, week);
  }
  const series: KeywordSeries = {
    version: 1, start: window.start, end,
    keywords: [...data].map(([keyword, weeks]) => ({ keyword, weeks: [...weeks].sort(([a], [b]) => a.localeCompare(b)).map(([start, w]) => ({ start, clicks: w.clicks, impressions: w.impressions, position: w.weighted / w.impressions, daysWithData: w.days.size })) })),
  };
  if (!parseKeywordSeries(series)) throw invalid();
  return series;
}
