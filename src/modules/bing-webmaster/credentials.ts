/**
 * Bing Webmaster Tools user API key (D001), read from BING_WEBMASTER_API_KEY. Bing only documents
 * it as a query string parameter, so anything that could change the request URL is rejected.
 */

const KEY_PATTERN = /^[A-Za-z0-9]{16,128}$/;

/** Why a configured value is unusable; the interface translates it (never the value itself). */
export type KeyProblem = "bad_format";

export type ParsedKey = { ok: true; value: string } | { ok: false; reason: KeyProblem };

/** Never throws and never echoes the input. */
export function parseApiKey(raw: string | undefined): ParsedKey | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return KEY_PATTERN.test(trimmed) ? { ok: true, value: trimmed } : { ok: false, reason: "bad_format" };
}
