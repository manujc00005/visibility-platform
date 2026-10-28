/**
 * Supported interface languages and the per-request resolution rules
 * (SPEC «Contrato de resolución de idioma», D013). Pure module: no I/O,
 * importable from server and client code alike.
 */
export const SUPPORTED_LOCALES = ["es", "en"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Spanish is the default and the reference copy. */
export const DEFAULT_LOCALE: Locale = "es";

export const LOCALE_COOKIE = "locale";

/** BCP 47 tags handed to `Intl`: day-month-year dates in both languages (D013). */
const INTL_TAGS: Record<Locale, string> = { es: "es-ES", en: "en-GB" };

export function intlTag(locale: Locale): string {
  return INTL_TAGS[locale];
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

// A language tag: letters, then optional alphanumeric subtags. `*` and junk never match.
const LANGUAGE_TAG = /^[a-z]{1,8}(?:-[a-z0-9]{1,8})*$/i;
// RFC 9110 weight: 0 to 1 with up to three decimals.
const QVALUE = /^(?:0(?:\.\d{1,3})?|1(?:\.0{1,3})?)$/;

/**
 * Picks the supported language of an `Accept-Language` header, or `null` when nothing
 * selectable is present. Rules (SPEC contract): omitted `q` is 1; entries with a malformed
 * tag or weight, unsupported languages, wildcards and `q=0` are ignored; the highest weight
 * wins; ties keep the earliest entry; repeated variants of one language keep their best
 * weight, weights are never added.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale | null {
  if (!acceptLanguage) return null;
  let best: { locale: Locale; q: number } | null = null;
  for (const entry of acceptLanguage.split(",")) {
    const [tagPart = "", ...params] = entry.split(";");
    const tag = tagPart.trim();
    if (!LANGUAGE_TAG.test(tag)) continue;
    let q = 1;
    let valid = true;
    for (const param of params) {
      const [key = "", value] = param.split("=");
      if (key.trim().toLowerCase() !== "q") continue;
      const weight = value?.trim() ?? "";
      if (!QVALUE.test(weight)) {
        valid = false;
        break;
      }
      q = Number(weight);
    }
    if (!valid || q === 0) continue;
    const base = tag.split("-")[0]!.toLowerCase();
    if (!isLocale(base)) continue;
    if (!best || q > best.q) best = { locale: base, q };
  }
  return best?.locale ?? null;
}

/** A valid cookie always wins; otherwise negotiate; otherwise the default. */
export function resolveLocale(input: { cookie?: string | null; acceptLanguage?: string | null }): Locale {
  if (isLocale(input.cookie)) return input.cookie;
  return negotiateLocale(input.acceptLanguage) ?? DEFAULT_LOCALE;
}
