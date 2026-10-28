import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "@/i18n/locale";

/**
 * Locale of the current request: cookie first, then `Accept-Language`, then Spanish.
 * Server only: it reads request data, so the segment that calls it renders per request
 * (the root layout exports `instant = false` for that reason; see D016).
 * The header value is only compared against the supported list, never echoed.
 */
export async function getLocale(): Promise<Locale> {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  return resolveLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
  });
}
