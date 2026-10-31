import { addDays, keywordWindow, parseKeywordSeries, type KeywordWeek } from "@/modules/search-console/keywords";
import type { LatestSearchConsole } from "@/modules/search-console/service";

export interface TrackedKeywordView {
  id: string;
  keyword: string;
  state: "pending" | "no_data" | "ok";
  weeks: KeywordWeek[];
  slots: string[];
  first: KeywordWeek | null;
  latest: KeywordWeek | null;
  change: { direction: "better" | "worse" | "same"; delta: number } | null;
  trailingMissing: number;
}

/** Independent from credential/global state: active list and latest successful capture win. */
export function summarizeTrackedKeywords(active: readonly { id: string; keyword: string }[], stored: LatestSearchConsole) {
  const snapshot = stored.latestCompleted;
  const raw = snapshot?.keywordSeries;
  const series = raw == null ? null : parseKeywordSeries(raw);
  const warning = raw != null && !series;
  const slots = series ? keywordWindow(series.end).starts : [];
  const rows: TrackedKeywordView[] = active.map(({ id, keyword }) => {
    const item = series?.keywords.find((item) => item.keyword === keyword);
    const weeks = item?.weeks ?? [];
    const first = weeks[0] ?? null;
    const latest = weeks.at(-1) ?? null;
    const delta = latest && first ? latest.position - first.position : 0;
    return {
      id, keyword, state: !item ? "pending" : weeks.length ? "ok" : "no_data",
      weeks, slots, first, latest,
      change: weeks.length < 2 ? null : {
        direction: Math.abs(delta) + 1e-9 < .5 ? "same" : delta < 0 ? "better" : "worse",
        delta,
      },
      trailingMissing: latest ? slots.length - 1 - slots.indexOf(latest.start) : 0,
    };
  });
  return {
    rows, warning,
    property: series ? snapshot?.property ?? null : null,
    capturedAt: series ? snapshot?.createdAt ?? null : null,
    range: series ? { start: series.start, end: series.end } : null,
  };
}
export type TrackedKeywordSummary = ReturnType<typeof summarizeTrackedKeywords>;
export const weekEnd = (start: string) => addDays(start, 6);
