import type { EvolutionPoint } from "@/modules/audits/evolution";
import { METRIC_THRESHOLDS } from "@/modules/audits/status";

/**
 * Evolution across audits as inline SVG (no chart library, no client JavaScript):
 * stacked bars of problems by severity and a line with Google's mobile speed score.
 * Values are labelled directly, bars carry distinct patterns besides colour, and the
 * same data is available as a visually hidden table for screen readers.
 */
const shortDate = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Madrid",
});
const shortDateTime = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});

/** Day labels, with the time added when two audits share a day. */
function axisLabels(points: EvolutionPoint[]): string[] {
  const days = points.map((p) => shortDate.format(p.date));
  const repeated = new Set(days).size < days.length;
  return points.map((p, i) =>
    repeated ? shortDateTime.format(p.date) : days[i]!,
  );
}
const fullDate = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

const W = 640;
const H = 180;
const PAD = { top: 16, right: 12, bottom: 28, left: 32 };
const MAX_POINTS = 12;

function xOf(index: number, count: number): number {
  const inner = W - PAD.left - PAD.right;
  return PAD.left + (inner / count) * (index + 0.5);
}

function ProblemsChart({ points }: { points: EvolutionPoint[] }) {
  const labels = axisLabels(points);
  const maxTotal = Math.max(
    1,
    ...points.map((p) => p.counts.critical + p.counts.warning + p.counts.info),
  );
  const innerH = H - PAD.top - PAD.bottom;
  const slot = (W - PAD.left - PAD.right) / points.length;
  const barW = Math.min(40, slot * 0.6);
  const yOf = (value: number) => PAD.top + innerH - (value / maxTotal) * innerH;
  const ticks = [0, Math.ceil(maxTotal / 2), maxTotal];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-labelledby="problems-chart-title"
      className="h-auto w-full text-xs"
    >
      <title id="problems-chart-title">
        Problemas por auditoría, de la más antigua a la más reciente
      </title>
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
            <title>{`${fullDate.format(p.date)}: ${p.counts.critical} críticos, ${p.counts.warning} importantes, ${p.counts.info} mejoras`}</title>
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

function SpeedChart({ points }: { points: EvolutionPoint[] }) {
  const labels = axisLabels(points);
  const innerH = H - PAD.top - PAD.bottom;
  const yOf = (score: number) => PAD.top + innerH - (score / 100) * innerH;
  const measured = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.score !== null);
  const [good, poor] = METRIC_THRESHOLDS.score;
  const path = measured
    .map(
      ({ p, i }, k) =>
        `${k === 0 ? "M" : "L"}${xOf(i, points.length)},${yOf(p.score!)}`,
    )
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-labelledby="speed-chart-title"
      className="h-auto w-full text-xs"
    >
      <title id="speed-chart-title">
        Puntuación de velocidad en móvil por auditoría, de 0 a 100
      </title>
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
      {measured.length > 1 ? (
        <path
          d={path}
          fill="none"
          className="stroke-foreground"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ) : null}
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

export function EvolutionChart({ points }: { points: EvolutionPoint[] }) {
  const shown = points.slice(-MAX_POINTS);
  const anySpeed = shown.some((p) => p.score !== null);
  return (
    <div className="flex flex-col gap-6">
      {points.length > MAX_POINTS ? (
        <p className="text-xs text-muted-foreground">
          Se muestran las {MAX_POINTS} auditorías más recientes de{" "}
          {points.length}.
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">Problemas por auditoría</h3>
          <p className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <Swatch className="bg-bad-line" label="Críticos" />
            <Swatch
              className="bg-[repeating-linear-gradient(45deg,var(--fair-line)_0_2px,var(--background)_2px_3px)]"
              label="Importantes"
            />
            <Swatch className="bg-info-line" label="Mejoras" />
          </p>
        </div>
        <ProblemsChart points={shown} />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">
            Velocidad en móvil (puntuación de Google, 0 a 100)
          </h3>
          <p className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <Swatch
              className="bg-good-soft ring-1 ring-good-line"
              label="Bueno ≥ 90"
            />
            <Swatch
              className="bg-fair-soft ring-1 ring-fair-line"
              label="Mejorable"
            />
            <Swatch
              className="bg-bad-soft ring-1 ring-bad-line"
              label="Malo < 50"
            />
          </p>
        </div>
        {anySpeed ? (
          <SpeedChart points={shown} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Ninguna de estas auditorías midió la velocidad.
          </p>
        )}
      </div>
      <div className="sr-only">
        <table>
          <caption>Datos de la evolución por auditoría</caption>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Críticos</th>
              <th>Importantes</th>
              <th>Mejoras</th>
              <th>Velocidad</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id}>
                <td>{fullDate.format(p.date)}</td>
                <td>{p.counts.critical}</td>
                <td>{p.counts.warning}</td>
                <td>{p.counts.info}</td>
                <td>{p.score ?? "no medida"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
