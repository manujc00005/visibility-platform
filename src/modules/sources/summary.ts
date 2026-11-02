import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { AnalyticsState, AnalyticsSummary } from "@/modules/analytics/summary";
import type { AuditProviderConfig } from "@/modules/audits/deps";
import type { Tone } from "@/modules/audits/status";
import type { BingWebmasterState, BingWebmasterSummary } from "@/modules/bing-webmaster/summary";
import type { GeoProviderStatus } from "@/modules/geo/deps";
import type { AiSummary } from "@/modules/overview/ai";
import type { PerformanceSummary } from "@/modules/overview/performance";
import type { SearchConsoleState, SearchConsoleSummary } from "@/modules/search-console/summary";

/**
 * The «Fuentes de datos» panel of a company (feature 015, D002): one row per source, built
 * only from the summaries each source already computes. It maps states to labels, tones,
 * dates and a "what to do" text; it never recalculates a state or contacts a provider.
 * Tones describe whether the source works (`good` = connected and read), not the quality
 * of what it measured: the overview cards keep their own verdict tones.
 */
export type SourceKey = "search_console" | "bing" | "analytics" | "pagespeed" | "ai";

export interface SourceRow {
  key: SourceKey;
  name: string;
  status: { tone: Tone; label: string };
  /** Property, site or provider the data comes from; null when none applies yet. */
  target: string | null;
  /** Last successful capture or measurement. */
  lastGood: Date | null;
  /** The failure of the last attempt, a configuration warning or the reason of the state; null when nothing is pending. */
  note: string | null;
  action: { label: string; href: string };
}

export interface SourcesInput {
  workspaceId: string;
  /** The three Google/Bing summaries already fold their credential state into `state`, `reason` and `configWarning`. */
  searchConsole: { summary: SearchConsoleSummary };
  bing: { summary: BingWebmasterSummary };
  analytics: { summary: AnalyticsSummary };
  pagespeed: { performance: PerformanceSummary; config: AuditProviderConfig };
  ai: { summary: AiSummary; providers: GeoProviderStatus };
}

/** Same tones as the sections of the «Google» page. */
const SEARCH_CONSOLE_TONE: Record<SearchConsoleState, Tone> = { ok: "good", empty: "neutral", no_data: "neutral", error: "bad", not_configured: "neutral", invalid_config: "bad" };
const BING_TONE: Record<BingWebmasterState, Tone> = { ok: "good", processing: "neutral", no_data: "neutral", error: "bad", not_configured: "neutral", invalid_config: "bad" };
const ANALYTICS_TONE: Record<AnalyticsState, Tone> = { ok: "good", empty: "neutral", no_data: "neutral", error: "bad", not_configured: "neutral", invalid_config: "bad" };

/** First pending thing, in order: the last failure, a configuration warning, the reason of the state. */
function noteOf(parts: (string | null | undefined)[]): string | null {
  return parts.find((p): p is string => Boolean(p)) ?? null;
}

export function summarizeSources(input: SourcesInput, locale: Locale = DEFAULT_LOCALE): SourceRow[] {
  const m = getMessages(locale);
  const t = m.sources;
  const base = `/workspaces/${input.workspaceId}`;

  const gsc = input.searchConsole.summary;
  const searchConsole: SourceRow = {
    key: "search_console",
    name: t.names.search_console,
    status: { tone: SEARCH_CONSOLE_TONE[gsc.state], label: m.searchConsole.status[gsc.state] },
    target: gsc.property,
    lastGood: gsc.capturedAt,
    note: noteOf([gsc.lastFailure?.text, gsc.configWarning, gsc.reason]),
    action: { label: t.open.seo, href: `${base}/seo#ranking-title` },
  };

  const b = input.bing.summary;
  const bing: SourceRow = {
    key: "bing",
    name: t.names.bing,
    status: { tone: BING_TONE[b.state], label: m.bingWebmaster.status[b.state] },
    target: b.siteUrl,
    lastGood: b.capturedAt,
    note: noteOf([b.lastFailure?.text, b.configWarning, b.reason, b.staleNotice]),
    action: { label: t.open.seo, href: `${base}/seo#bing-title` },
  };

  const a = input.analytics.summary;
  const analytics: SourceRow = {
    key: "analytics",
    name: t.names.analytics,
    status: { tone: ANALYTICS_TONE[a.state], label: m.analytics.status[a.state] },
    target: a.propertyName ?? a.property,
    lastGood: a.capturedAt,
    note: noteOf([a.lastFailure?.text, a.configWarning, a.reason]),
    action: { label: t.open.seo, href: `${base}/seo#analytics-title` },
  };

  const p = input.pagespeed.performance;
  const keys = input.pagespeed.config;
  const states = m.overview.states;
  // Without a key nothing can be measured, whatever the audits say (overview.performance explains it).
  const pagespeedStatus = !keys.pageSpeed
    ? { tone: "neutral" as Tone, label: states.not_configured }
    : p.state === "ok"
      ? { tone: "good" as Tone, label: states.ok }
      : p.state === "partial" || p.state === "not_configured"
        ? { tone: "neutral" as Tone, label: states.not_measured }
        : { tone: (p.state === "error" ? "bad" : "neutral") as Tone, label: states[p.state] };
  const pagespeed: SourceRow = {
    key: "pagespeed",
    name: t.names.pagespeed,
    status: pagespeedStatus,
    target: !keys.pageSpeed ? null : keys.crux ? t.pagespeed.keyAndCrux : t.pagespeed.keyOnly,
    // A partial audit keeps its date in the summary, but speed was not read then.
    lastGood: p.state === "ok" ? p.measuredAt : null,
    note: !keys.pageSpeed ? m.overview.performance.notMeasured.not_configured : noteOf([p.attempt?.text, p.reason]),
    action: { label: t.open.performance, href: `${base}/performance` },
  };

  const s = input.ai.summary;
  const paid = input.ai.providers.dataforseo;
  const aiLabel = s.state === "analyzing" || s.state === "no_data" ? m.overview.cards.ai.status[s.state] : states[s.state];
  const ai: SourceRow = {
    key: "ai",
    name: t.names.ai,
    status: { tone: s.state === "ok" ? "good" : s.state === "error" ? "bad" : "neutral", label: aiLabel },
    target: t.ai.providers(m.geo.labels.provider.manual, paid.available ? m.geo.labels.provider.dataforseo_chatgpt : null),
    lastGood: s.measuredAt,
    // The automatic provider is availability, shown in `target`; it is not something to do for this company.
    note: noteOf([s.attempt?.text, s.reason]),
    action: { label: t.open.ai, href: `${base}/geo/setup` },
  };

  return [searchConsole, bing, analytics, pagespeed, ai];
}
