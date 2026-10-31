import { formatDate, formatDateTime } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import { SCORE_NOISE, speedAxis, speedSegments, type EvolutionPoint } from "@/modules/audits/evolution";
import { METRIC_THRESHOLDS, rateMetric } from "@/modules/audits/thresholds";

/**
 * Evolution across audits (no chart library, no client JavaScript): stacked bars of
 * problems by severity and a line with Google's mobile speed score.
 * Values are labelled directly, bars carry distinct patterns besides colour, and the
 * same data is available as a visually hidden table for screen readers. Server component:
 * labels and date formats follow the interface language.
 */
const SHORT_DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "Europe/Madrid" };
const SHORT_DATE_TIME: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" };

/** Day labels, with the time added when two audits share a day. */
function axisLabels(points: EvolutionPoint[], locale: Locale): string[] {
  const days = points.map((p) => formatDate(p.date, locale, SHORT_DATE));
  const repeated = new Set(days).size < days.length;
  return points.map((p, i) => (repeated ? formatDate(p.date, locale, SHORT_DATE_TIME) : days[i]!));
}

const W = 640;
const H = 180;
const PAD = { top: 16, right: 12, bottom: 28, left: 32 };

function xOf(index: number, count: number): number {
  const inner = W - PAD.left - PAD.right;
  return PAD.left + (inner / count) * (index + 0.5);
}

export function ProblemsChart({ points, locale }: { points: EvolutionPoint[]; locale: Locale }) {
  const t = getMessages(locale).chart;
  const labels = axisLabels(points, locale);
  const maxTotal = Math.max(
    1,
    ...points.map((p) => p.counts.critical + p.counts.warning + p.counts.info),
  );
  const innerH = H - PAD.top - PAD.bottom;
  const slot = (W - PAD.left - PAD.right) / points.length;
  const barW = Math.min(40, slot * 0.6);
  const yOf = (value: number) => PAD.top + innerH - (value / maxTotal) * innerH;
  // Unique ticks: with a maximum of 1 the middle and top ticks would repeat (same key, same line).
  const ticks = [...new Set([0, Math.ceil(maxTotal / 2), maxTotal])];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-labelledby="problems-chart-title"
      className="h-auto w-full text-xs"
    >
      <title id="problems-chart-title">{t.problemsTitle}</title>
      <defs>
        <pattern
          id="hatch-warning"
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="4" height="4" className="fill-fair-line" />
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="4"
            className="stroke-background"
            strokeWidth="1.5"
          />
        </pattern>
        <pattern
          id="dots-info"
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
        >
          <rect width="4" height="4" className="fill-info-line" />
          <circle cx="2" cy="2" r="0.9" className="fill-background" />
        </pattern>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={yOf(t)}
            y2={yOf(t)}
            className="stroke-border"
            strokeDasharray={t === 0 ? undefined : "2 3"}
          />
          <text
            x={PAD.left - 6}
            y={yOf(t) + 3}
            textAnchor="end"
            className="fill-muted-foreground"
          >
            {t}
          </text>
        </g>
      ))}
      {points.map((p, i) => {
        const x = xOf(i, points.length) - barW / 2;
        const total = p.counts.critical + p.counts.warning + p.counts.info;
        const segments: { key: string; value: number; fill: string }[] = [
          { key: "critical", value: p.counts.critical, fill: "fill-bad-line" },
          {
            key: "warning",
            value: p.counts.warning,
            fill: "url(#hatch-warning)",
          },
          { key: "info", value: p.counts.info, fill: "url(#dots-info)" },
        ];
        let acc = 0;
        return (
          <g key={p.id}>
            <title>{t.bar(formatDateTime(p.date, locale), p.counts.critical, p.counts.warning, p.counts.info)}</title>
            {segments.map((s) => {
              if (s.value === 0) return null;
              const y1 = yOf(acc + s.value);
              const y2 = yOf(acc);
              acc += s.value;
              const common = {
                x,
                y: y1,
                width: barW,
                height: Math.max(1, y2 - y1),
                rx: 2,
              };
              return s.fill.startsWith("url(") ? (
                <rect key={s.key} {...common} fill={s.fill} />
              ) : (
                <rect key={s.key} {...common} className={s.fill} />
              );
            })}
            {total === 0 ? (
              <line
                x1={x}
                x2={x + barW}
                y1={yOf(0)}
                y2={yOf(0)}
                className="stroke-good-line"
                strokeWidth="3"
                strokeLinecap="round"
              />
            ) : null}
            <text
              x={x + barW / 2}
              y={yOf(total) - 4}
              textAnchor="middle"
              className="fill-foreground font-medium"
            >
              {total}
            </text>
            <text
              x={x + barW / 2}
              y={H - 8}
              textAnchor="middle"
              className="fill-muted-foreground"
            >
              {labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" };

/** Points that share a day sit under one date, each with its time; a lone audit needs only the date. */
function dayGroups(points: EvolutionPoint[], locale: Locale): { label: string; start: number; count: number }[] {
  const groups: { label: string; start: number; count: number }[] = [];
  points.forEach((p, i) => {
    const label = formatDate(p.date, locale, SHORT_DATE);
    const last = groups.at(-1);
    if (last?.label === label) last.count += 1;
    else groups.push({ label, start: i, count: 1 });
  });
  return groups;
}

/** Above this many audits a phone cannot fit every date and time. */
const PHONE_MAX_LABELS = 6;

const DOT = { good: "bg-good-line", needs_improvement: "bg-fair-line", poor: "bg-bad-line" };

/**
 * Speed score per audit. Unlike the bars above, this is HTML over a stretched SVG line, so
 * text keeps its size at any width. Every audit is a hover and focus target with its detail;
 * still no client JavaScript.
 */
export function SpeedChart({ points, locale }: { points: EvolutionPoint[]; locale: Locale }) {
  const t = getMessages(locale).chart;
  const count = points.length;
  const [good, poor] = METRIC_THRESHOLDS.score;
  const { min, ticks } = speedAxis(points.flatMap((p) => (p.score === null ? [] : [p.score])));
  const yOf = (score: number) => ((100 - score) / (100 - min)) * 100;
  const xOf = (index: number) => ((index + 0.5) / count) * 100;
  const dense = count > PHONE_MAX_LABELS;
  const onlyWide = dense ? "hidden sm:block" : "";
  const groups = dayGroups(points, locale);
  const latest = points.findLastIndex((p) => p.score !== null);
  const bands = [
    { key: "good", from: good, to: 100, fill: "bg-good-soft", swatch: "bg-good-soft ring-1 ring-good-line", label: t.legend.good },
    { key: "fair", from: Math.max(poor, min), to: good, fill: "bg-fair-soft", swatch: "bg-fair-soft ring-1 ring-fair-line", label: t.legend.fair },
    { key: "poor", from: min, to: poor, fill: "bg-bad-soft", swatch: "bg-bad-soft ring-1 ring-bad-line", label: t.legend.poor },
  ].filter((band) => band.to > band.from);
  // One stroke per run of comparable measurements (D019): no line where continuity cannot be claimed.
  const paths = speedSegments(points)
    .filter((segment) => segment.length > 1)
    .map((segment) => segment.map((i, k) => `${k === 0 ? "M" : "L"}${xOf(i)},${yOf(points[i]!.score!)}`).join(" "));

  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {bands.map((band) => (
          <Swatch key={band.key} className={band.swatch} label={band.label} />
        ))}
        {points.some((p) => p.score === null) ? <Swatch className="border-l border-dashed border-muted-foreground bg-transparent !w-0 !rounded-none" label={t.legend.unmeasured} /> : null}
      </p>
      <div className="mt-5 grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2">
        <div aria-hidden="true" className="relative">
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-0 -translate-y-1/2 text-xs text-muted-foreground tabular-nums" style={{ top: `${yOf(tick)}%` }}>
              {tick}
            </span>
          ))}
        </div>
        <div role="group" aria-label={t.speedTitle} className="relative h-56 sm:h-64">
          <div aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-lg">
            {bands.map((band) => (
              <div key={band.key} className={`absolute inset-x-0 ${band.fill}`} style={{ top: `${yOf(band.to)}%`, height: `${yOf(band.from) - yOf(band.to)}%` }} />
            ))}
            {ticks
              .filter((tick) => tick > min && tick < 100)
              .map((tick) => (
                <div key={tick} className={`absolute inset-x-0 border-t ${tick === good || tick === poor ? "border-foreground/20" : "border-foreground/5"}`} style={{ top: `${yOf(tick)}%` }} />
              ))}
          </div>
          <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
            {paths.map((d) => (
              <path key={d} d={d} fill="none" vectorEffect="non-scaling-stroke" className="stroke-foreground/70" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            ))}
          </svg>
          {points.map((p, i) => {
            const x = xOf(i);
            const y = p.score === null ? 50 : yOf(p.score);
            const when = formatDateTime(p.date, locale);
            const rating = p.score === null ? null : t.rating[rateMetric("score", p.score)];
            const isLatest = i === latest;
            // Near the edges the detail grows inwards, so it never widens the page.
            const align = x < 30 ? "left-0" : x > 70 ? "right-0" : "left-1/2 -translate-x-1/2";
            return (
              <div
                key={p.id}
                role="img"
                tabIndex={0}
                aria-label={p.score === null ? t.unmeasured(when) : t.point(when, p.score, rating!)}
                className="group absolute inset-y-0 rounded-sm transition-colors outline-none hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-foreground motion-reduce:transition-none"
                style={{ left: `${(i / count) * 100}%`, width: `${100 / count}%` }}
              >
                {p.score === null ? (
                  <span aria-hidden="true" className="absolute inset-y-3 left-1/2 border-l border-dashed border-muted-foreground/60" />
                ) : (
                  <>
                    <span aria-hidden="true" className={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background ${DOT[rateMetric("score", p.score)]} ${isLatest ? "size-3.5" : "size-2.5"}`} style={{ top: `${y}%` }} />
                    <span aria-hidden="true" className={`absolute left-1/2 -translate-x-1/2 -translate-y-full tabular-nums ${isLatest ? "text-sm font-semibold sm:text-base" : "text-xs font-medium sm:text-sm"}`} style={{ top: `calc(${y}% - 0.625rem)` }}>
                      {p.score}
                    </span>
                  </>
                )}
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute z-10 w-max max-w-44 rounded-md bg-popover px-2.5 py-1.5 text-xs text-popover-foreground opacity-0 shadow-md ring-1 ring-border transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none ${align}`}
                  style={{ bottom: `calc(${100 - y}% + 2.25rem)` }}
                >
                  {p.score === null ? (
                    <span className="block font-medium">{t.table.notMeasured}</span>
                  ) : (
                    <span className="block font-medium">
                      {p.score} · {rating}
                    </span>
                  )}
                  <span className="block text-muted-foreground">{when}</span>
                  {p.methodology ? <span className="block text-muted-foreground">Lighthouse {p.methodology.major}</span> : null}
                </span>
              </div>
            );
          })}
        </div>
        <div aria-hidden="true" className="col-start-2 mt-2 grid text-xs text-muted-foreground" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
          {groups.flatMap((group) =>
            group.count > 1
              ? points.slice(group.start, group.start + group.count).map((p, k) => (
                  <span key={p.id} className={`whitespace-nowrap text-center tabular-nums ${onlyWide}`} style={{ gridColumn: group.start + k + 1, gridRow: 1 }}>
                    {formatDate(p.date, locale, TIME)}
                  </span>
                ))
              : [],
          )}
          {groups.map((group, k) => (
            <span
              key={group.start}
              className={`mt-1 whitespace-nowrap border-t pt-1 text-center font-medium text-foreground/80 ${group.count > 1 ? "border-foreground/20" : "border-transparent"} ${dense && k > 0 && k < groups.length - 1 ? "hidden sm:block" : ""}`}
              style={{ gridColumn: `${group.start + 1} / span ${group.count}`, gridRow: 2 }}
            >
              {group.label}
            </span>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {min > 0 ? `${t.zoomed(min)} ` : ""}
        {t.noise(SCORE_NOISE)}
      </p>
    </div>
  );
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={`inline-block size-3 rounded-sm ${className}`}
      />
      {label}
    </span>
  );
}

export function ProblemsLegend({ locale }: { locale: Locale }) {
  const t = getMessages(locale).chart.legend;
  return (
    <p className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      <Swatch className="bg-bad-line" label={t.critical} />
      <Swatch className="bg-[repeating-linear-gradient(45deg,var(--fair-line)_0_2px,var(--background)_2px_3px)]" label={t.warning} />
      <Swatch className="bg-info-line" label={t.info} />
    </p>
  );
}

/** The chart data as a visually hidden table for screen readers (charts are images to them). */
export function ChartDataTable({ points, kind, locale }: { points: EvolutionPoint[]; kind: "problems" | "speed"; locale: Locale }) {
  const t = getMessages(locale).chart;
  return (
    <div className="sr-only">
      <table>
        <caption>{kind === "problems" ? t.table.problems : t.table.speed}</caption>
        <thead>
          <tr>
            <th>{t.table.date}</th>
            {kind === "problems" ? (
              <>
                <th>{t.legend.critical}</th>
                <th>{t.legend.warning}</th>
                <th>{t.legend.info}</th>
              </>
            ) : (
              <>
                <th>{t.table.speedColumn}</th>
                <th>{t.table.test}</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.id}>
              <td>{formatDateTime(p.date, locale)}</td>
              {kind === "problems" ? (
                <>
                  <td>{p.counts.critical}</td>
                  <td>{p.counts.warning}</td>
                  <td>{p.counts.info}</td>
                </>
              ) : (
                <>
                  <td>{p.score ?? t.table.notMeasured}</td>
                  <td>{p.score === null ? "—" : p.methodology ? `Lighthouse ${p.methodology.major}` : t.table.unknownVersion}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
