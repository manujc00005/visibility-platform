import { env } from "@/config/env";
import { collectBingWebmaster } from "@/modules/bing-webmaster/collect";
import { parseApiKey, type KeyProblem } from "@/modules/bing-webmaster/credentials";
import type { BingWebmasterDeps } from "@/modules/bing-webmaster/service";
import type { ClientOptions } from "@/modules/bing-webmaster/bing";

export type BingWebmasterConfig = { state: "not_configured" } | { state: "invalid"; reason: KeyProblem } | { state: "ready" };

/** What the page needs to explain the setup. Never carries the key. */
export function bingWebmasterConfigFor(raw: string | undefined): BingWebmasterConfig {
  const parsed = parseApiKey(raw);
  if (!parsed) return { state: "not_configured" };
  return parsed.ok ? { state: "ready" } : { state: "invalid", reason: parsed.reason };
}

export function bingWebmasterConfig(): BingWebmasterConfig {
  return bingWebmasterConfigFor(env().BING_WEBMASTER_API_KEY);
}

/**
 * Production wiring: real network, key read on each call. An unusable key calls nothing and
 * stores nothing; the page explains it from `bingWebmasterConfig` (AC-001, AC-002).
 */
export function createBingWebmasterDeps(raw: () => string | undefined = () => env().BING_WEBMASTER_API_KEY, options: ClientOptions = {}): BingWebmasterDeps {
  return {
    collect(site) {
      const parsed = parseApiKey(raw());
      if (!parsed?.ok) return null;
      return collectBingWebmaster(parsed.value, site, options);
    },
  };
}
