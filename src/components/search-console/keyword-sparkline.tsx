import { formatNumber } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { TrackedKeywordView } from "@/modules/search-console/keyword-summary";
import { addDays } from "@/modules/search-console/keywords";
import { displayDay } from "@/modules/search-console/summary";

/** 26 calendar slots; disconnected points never bridge absent weeks. */
export function KeywordSparkline({ row, locale }: { row: TrackedKeywordView; locale: Locale }) {
  const t = getMessages(locale).searchConsole.tracked;
  const values = row.weeks.map((week) => week.position);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = row.slots.map((start, i) => {
    const week = row.weeks.find((week) => week.start === start);
    return week ? { x: 8 + i * 8, y: max === min ? 24 : 8 + (week.position - min) / (max - min) * 32, value: week.position } : null;
  });
  const segments: string[] = [];
  let current = "";
  for (const point of points) {
    if (!point) {
      if (current) segments.push(current);
      current = "";
    } else {
      current += `${current ? " L" : "M"}${point.x},${point.y}`;
    }
  }
  if (current) segments.push(current);
  // Runs of absent weeks read as one gap: 26 repeated dates cannot be listened to.
  const ranges: { from: string; to: string; value: string }[] = [];
  row.slots.forEach((start, i) => {
    const point = points[i];
    const last = ranges.at(-1);
    if (!point && last?.value === t.gap) last.to = start;
    else ranges.push({ from: start, to: start, value: point ? formatNumber(point.value, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : t.gap });
  });
  const description = ranges.map(({ from, to, value }) => `${displayDay(from, locale)} – ${displayDay(addDays(to, 6), locale)}: ${value}`).join("; ");
  return (
    <svg viewBox="0 0 216 48" role="img" aria-label={`${row.keyword}. ${t.history}. ${description}`} className="h-12 w-full max-w-60">
      {segments.map((d, i) => <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth="2" />)}
      {points.map((point, i) => point ? <circle key={i} cx={point.x} cy={point.y} r="2.5" fill="currentColor" /> : null)}
    </svg>
  );
}
