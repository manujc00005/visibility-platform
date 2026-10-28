import { formatDate, formatDateTime } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import { speedSegments, type EvolutionPoint } from "@/modules/audits/evolution";
import { METRIC_THRESHOLDS } from "@/modules/audits/thresholds";

/**
 * Evolution across audits as inline SVG (no chart library, no client JavaScript):
 * stacked bars of problems by severity and a line with Google's mobile speed score.
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

export function SpeedChart({ points, locale }: { points: EvolutionPoint[]; locale: Locale }) {
  const t = getMessages(locale).chart;
  const labels = axisLabels(points, locale);
  const innerH = H - PAD.top - PAD.bottom;
  const yOf = (score: number) => PAD.top + innerH - (score / 100) * innerH;
  const [good, poor] = METRIC_THRESHOLDS.score;
  // One stroke per run of comparable measurements (D019): no line where continuity cannot be claimed.
  const paths = speedSegments(points)
    .filter((segment) => segment.length > 1)
    .map((segment) =>
      segment
        .map(
          (i, k) =>
            `${k === 0 ? "M" : "L"}${xOf(i, points.length)},${yOf(points[i]!.score!)}`,
        )
        .join(" "),
    );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-labelledby="speed-chart-title"
      className="h-auto w-full text-xs"
    >
      <title id="speed-chart-title">{t.speedTitle}</title>
      <rect
        x={PAD.left}
        y={yOf(100)}
        width={W - PAD.left - PAD.right}
        height={yOf(good) - yOf(100)}
        className="fill-good-soft"
      />
      <rect
        x={PAD.left}
        y={yOf(good)}
        width={W - PAD.left - PAD.right}
        height={yOf(poor) - yOf(good)}
        className="fill-fair-soft"
      />
      <rect
        x={PAD.left}
        y={yOf(poor)}
        width={W - PAD.left - PAD.right}
        height={yOf(0) - yOf(poor)}
        className="fill-bad-soft"
      />
      {[0, poor, good, 100].map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={yOf(t)}
            y2={yOf(t)}
            className="stroke-border"
          />
          {t < 100 ? (
            <text
              x={PAD.left - 6}
              y={yOf(t) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
            >
              {t}
            </text>
          ) : null}
        </g>
      ))}
      {paths.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          className="stroke-foreground"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ))}
      {points.map((p, i) => {
        const x = xOf(i, points.length);
        return (
          <g key={p.id}>
            {p.score === null ? (
              <text
                x={x}
                y={yOf(50) + 3}
                textAnchor="middle"
                className="fill-muted-foreground"
              >
                —
              </text>
            ) : (
              <>
                <circle
                  cx={x}
                  cy={yOf(p.score)}
                  r="4"
                  className="fill-background stroke-foreground"
                  strokeWidth="2"
                />
                <text
                  x={x}
                  y={yOf(p.score) - 9}
                  textAnchor="middle"
                  className="fill-foreground font-medium"
                >
                  {p.score}
                </text>
              </>
            )}
            <text
              x={x}
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

export function SpeedLegend({ locale }: { locale: Locale }) {
  const t = getMessages(locale).chart.legend;
  return (
    <p className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      <Swatch className="bg-good-soft ring-1 ring-good-line" label={t.good} />
      <Swatch className="bg-fair-soft ring-1 ring-fair-line" label={t.fair} />
      <Swatch className="bg-bad-soft ring-1 ring-bad-line" label={t.poor} />
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
