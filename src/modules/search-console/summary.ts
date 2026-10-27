import type { Change } from "@/modules/overview/types";
import type { PageRow, Period, QueryRow, Totals } from "@/modules/search-console/collect";
import type { SearchConsoleConfig } from "@/modules/search-console/deps";
import type { LatestSearchConsole } from "@/modules/search-console/service";

/**
 * What the Google tab and the overview card show about Search Console. Pure: it reads stored
 * captures and the configuration state, never Google.
 */

export type SearchConsoleState = "not_configured" | "invalid_config" | "no_data" | "error" | "ok";

export interface MetricView {
  value: string;
  previous: string | null;
  change: Change | null;
}

export interface SearchConsoleSummary {
  state: SearchConsoleState;
  /** Owner-readable explanation for every state but "ok". */
  reason: string | null;
  property: string | null;
  period: Period | null;
  capturedAt: Date | null;
  metrics: { clicks: MetricView; impressions: MetricView; ctr: MetricView; position: MetricView } | null;
  queries: QueryRow[];
  pages: PageRow[];
  /** Set when the newest attempt failed after (or without) a good capture. */
  lastFailure: { text: string; at: Date } | null;
  /** One line for the overview card, or null when there is nothing measured. */
  cardLine: string | null;
}

const integer = (n: number) => Math.round(n).toLocaleString("es-ES");
const decimal = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const percent = (ratio: number) => `${decimal(ratio * 100)} %`;

/** Below this relative change, a difference is noise for a 28-day window. */
const SAME_THRESHOLD = 0.05;
const POSITION_SAME = 0.5;

function countChange(current: number, previous: number, unit: [string, string]): Change {
  const word = (n: number) => (Math.round(n) === 1 ? unit[0] : unit[1]);
  if (previous === 0) return current === 0 ? { direction: "same", text: "Igual que los 28 días anteriores" } : { direction: "better", text: `Antes: 0 ${unit[1]}` };
  const ratio = (current - previous) / previous;
  const text = `Antes: ${integer(previous)} ${word(previous)}`;
  if (Math.abs(ratio) < SAME_THRESHOLD) return { direction: "same", text: `${text} (sin cambio apreciable)` };
  const pct = Math.round(ratio * 100);
  return { direction: ratio > 0 ? "better" : "worse", text: `${text} (${pct > 0 ? "+" : ""}${pct} %)` };
}

/** Lower is better: moving from 12 to 8 is going up four places. */
function positionChange(current: number, previous: number): Change {
  const delta = current - previous;
  const text = `Antes: ${decimal(previous)}`;
  if (Math.abs(delta) < POSITION_SAME) return { direction: "same", text: `${text} (sin cambio apreciable)` };
  return delta < 0
    ? { direction: "better", text: `${text} (sube ${decimal(-delta)} puestos)` }
    : { direction: "worse", text: `${text} (baja ${decimal(delta)} puestos)` };
}

function ctrChange(current: number, previous: number): Change {
  const delta = (current - previous) * 100;
  const text = `Antes: ${percent(previous)}`;
  if (Math.abs(delta) < 0.1) return { direction: "same", text: `${text} (sin cambio apreciable)` };
  return { direction: delta > 0 ? "better" : "worse", text: `${text} (${delta > 0 ? "+" : "−"}${decimal(Math.abs(delta))} puntos)` };
}

function metricsOf(totals: Totals, previous: Totals): NonNullable<SearchConsoleSummary["metrics"]> {
  // FR-008: without impressions before, there is nothing to compare against.
  const comparable = previous.impressions > 0;
  const hasPosition = totals.impressions > 0;
  return {
    clicks: { value: integer(totals.clicks), previous: comparable ? integer(previous.clicks) : null, change: comparable ? countChange(totals.clicks, previous.clicks, ["clic", "clics"]) : null },
    impressions: {
      value: integer(totals.impressions),
      previous: comparable ? integer(previous.impressions) : null,
      change: comparable ? countChange(totals.impressions, previous.impressions, ["impresión", "impresiones"]) : null,
    },
    ctr: { value: hasPosition ? percent(totals.ctr) : "—", previous: comparable ? percent(previous.ctr) : null, change: comparable && hasPosition ? ctrChange(totals.ctr, previous.ctr) : null },
    position: {
      value: hasPosition ? decimal(totals.position) : "—",
      previous: comparable ? decimal(previous.position) : null,
      change: comparable && hasPosition ? positionChange(totals.position, previous.position) : null,
    },
  };
}

function failureText(s: NonNullable<LatestSearchConsole["latest"]>, config: SearchConsoleConfig, domain: string): string {
  const email = config.state === "ready" ? config.clientEmail : "la cuenta de servicio";
  switch (s.errorKind) {
    case "no_access": {
      const seen = s.accessibleProperties === null ? "" : ` Ahora mismo la cuenta puede leer ${s.accessibleProperties} ${s.accessibleProperties === 1 ? "propiedad" : "propiedades"}.`;
      return `Añade ${email} como usuario en la propiedad de ${domain} en Search Console (Configuración › Usuarios y permisos) y vuelve a intentarlo.${seen}`;
    }
    case "api_disabled":
      return `${s.errorMessage}. Actívala en Google Cloud (APIs y servicios) y vuelve a intentarlo.`;
    case "invalid_credentials":
      return `${s.errorMessage}. Revisa GSC_SERVICE_ACCOUNT_JSON.`;
    default:
      return `${s.errorMessage ?? "No se pudieron leer los datos"}. Vuelve a intentarlo.`;
  }
}

const NO_DATA_REASON = "Pulsa «Traer datos de Search Console» para ver cómo te encuentran en Google.";

export function summarizeSearchConsole(stored: LatestSearchConsole, config: SearchConsoleConfig, domain: string): SearchConsoleSummary {
  const { latest, latestCompleted } = stored;
  const base: SearchConsoleSummary = {
    state: "no_data",
    reason: null,
    property: null,
    period: null,
    capturedAt: null,
    metrics: null,
    queries: [],
    pages: [],
    lastFailure: null,
    cardLine: null,
  };
  const failed = latest && latest.status === "failed" ? { text: failureText(latest, config, domain), at: latest.createdAt } : null;

  if (latestCompleted?.totals && latestCompleted.previousTotals && latestCompleted.currentStart && latestCompleted.currentEnd) {
    const t = latestCompleted.totals;
    const clicks = `${integer(t.clicks)} ${Math.round(t.clicks) === 1 ? "clic" : "clics"}`;
    const impressions = `${integer(t.impressions)} ${Math.round(t.impressions) === 1 ? "impresión" : "impresiones"}`;
    return {
      ...base,
      state: "ok",
      property: latestCompleted.property,
      period: { start: latestCompleted.currentStart, end: latestCompleted.currentEnd },
      capturedAt: latestCompleted.createdAt,
      metrics: metricsOf(t, latestCompleted.previousTotals),
      queries: latestCompleted.queries,
      pages: latestCompleted.pages,
      lastFailure: failed,
      cardLine:
        t.impressions > 0
          ? `En Google: ${clicks} y ${impressions} en los últimos 28 días, posición media ${decimal(t.position)} (Search Console).`
          : "En Google: sin impresiones en los últimos 28 días (Search Console).",
    };
  }

  if (config.state === "not_configured") {
    return { ...base, state: "not_configured", reason: "Search Console no está configurado en la plataforma.", lastFailure: failed };
  }
  if (config.state === "invalid") return { ...base, state: "invalid_config", reason: `${config.reason}.`, lastFailure: failed };
  if (failed) return { ...base, state: "error", reason: failed.text, lastFailure: failed };
  return { ...base, reason: NO_DATA_REASON };
}

/** Human date for a YYYY-MM-DD string, without time zone shifts. */
export function displayDay(isoDay: string): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
