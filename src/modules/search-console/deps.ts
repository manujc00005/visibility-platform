import { env } from "@/config/env";
import { collectSearchConsole } from "@/modules/search-console/collect";
import { parseServiceAccount, type CredentialProblem } from "@/modules/search-console/credentials";
import type { SearchConsoleDeps } from "@/modules/search-console/service";

export type SearchConsoleConfig = { state: "not_configured" } | { state: "invalid"; reason: CredentialProblem } | { state: "ready"; clientEmail: string };

/** What the page needs to explain the setup. The email is not secret: it is what the owner adds in Search Console. */
export function searchConsoleConfig(): SearchConsoleConfig {
  const parsed = parseServiceAccount(env().GSC_SERVICE_ACCOUNT_JSON);
  if (!parsed) return { state: "not_configured" };
  return parsed.ok ? { state: "ready", clientEmail: parsed.value.clientEmail } : { state: "invalid", reason: parsed.reason };
}

/** Production wiring: real network, credential read on each call. */
export function createSearchConsoleDeps(): SearchConsoleDeps {
  return {
    collect(site) {
      const parsed = parseServiceAccount(env().GSC_SERVICE_ACCOUNT_JSON);
      if (!parsed) return null;
      if (!parsed.ok) {
        // Stored for diagnosis only; the page explains it in the viewer's language from the config state.
        return Promise.resolve({ ok: false, kind: "invalid_credentials", message: `GSC_SERVICE_ACCOUNT_JSON: ${parsed.reason}`, property: null, accessibleProperties: null });
      }
      return collectSearchConsole(parsed.value, site);
    },
  };
}
