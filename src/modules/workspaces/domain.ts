import { domainToUnicode } from "node:url";

/**
 * Normalizes the website an operator types into a stable commercial key.
 *
 * Purely syntactic: no DNS resolution and no HTTP request happen here. Whether the host
 * actually answers, and which URL is effective after redirects, is decided later by the
 * safe fetcher (Phase 2). Rejecting IPs, localhost and internal names here is a first
 * filter, not the SSRF defence.
 *
 * Internationalized domains: the WHATWG URL parser converts them to their ASCII
 * (punycode, "xn--") form. That ASCII form is what we store and compare, so "bücher.de"
 * and "xn--bcher-kva.de" are the same key. `displayDomain` is the Unicode form for the UI.
 *
 * `www.`: removed from `domain` (the uniqueness key) but kept in `hostname`, because
 * "www.x" and "x" are not guaranteed to serve the same site.
 */

export type WebsiteError =
  | "required"
  | "too_long"
  | "malformed"
  | "unsupported_scheme"
  | "credentials"
  | "port"
  | "ip_literal"
  | "localhost"
  | "single_label"
  | "reserved_tld"
  | "invalid_label";

export interface NormalizedWebsite {
  /** Uniqueness key: lowercase ASCII hostname without a leading "www.". */
  domain: string;
  /** Lowercase ASCII hostname as entered (keeps "www." if present). */
  hostname: string;
  /** Unicode form of `domain` for display. */
  displayDomain: string;
  /** What the operator typed, trimmed. */
  originalInput: string;
}

export type NormalizeResult = { ok: true; value: NormalizedWebsite } | { ok: false; error: WebsiteError };

export const WEBSITE_ERROR_MESSAGES: Record<WebsiteError, string> = {
  required: "Introduce el dominio o la URL de la web.",
  too_long: "La dirección es demasiado larga.",
  malformed: "No es un dominio ni una URL válidos.",
  unsupported_scheme: "Solo se admiten direcciones web (http o https).",
  credentials: "La dirección no puede incluir usuario ni contraseña.",
  port: "No se admiten puertos distintos de los estándar (80 y 443).",
  ip_literal: "Introduce un dominio, no una dirección IP.",
  localhost: "No se admiten direcciones locales (localhost).",
  single_label: "El dominio debe incluir una extensión, por ejemplo .es o .com.",
  reserved_tld: "Esa extensión es interna o reservada y no corresponde a una web pública.",
  invalid_label: "El dominio contiene caracteres o partes no válidos.",
};

const MAX_INPUT_LENGTH = 2048;
const MAX_HOSTNAME_LENGTH = 253;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const NON_WEB_SCHEME = /^(?:mailto|javascript|vbscript|data|file|ftp|tel|sms|ws|wss|about|blob):/i;
/** Special-use and internal names that never identify a public business website. */
const RESERVED_SUFFIXES = ["local", "localhost", "internal", "test", "example", "invalid", "onion", "home.arpa", "lan"];

function fail(error: WebsiteError): NormalizeResult {
  return { ok: false, error };
}

export function normalizeWebsite(rawInput: string): NormalizeResult {
  const input = rawInput.trim();
  if (input === "") return fail("required");
  if (input.length > MAX_INPUT_LENGTH) return fail("too_long");
  if (/\s/.test(input)) return fail("malformed");

  const hasScheme = HAS_SCHEME.test(input);
  // Schemes written without "//" ("mailto:…", "javascript:…") would otherwise be read as
  // "host:port" or "user:password@host". An explicit list avoids that ambiguity.
  if (!hasScheme && NON_WEB_SCHEME.test(input)) return fail("unsupported_scheme");

  let url: URL;
  try {
    url = new URL(hasScheme ? input : `http://${input}`);
  } catch {
    return fail("malformed");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return fail("unsupported_scheme");
  // The parser drops an empty "@" ("https://@host"); check the raw authority as well.
  const authority = (hasScheme ? input.replace(HAS_SCHEME, "") : input).split(/[/?#]/)[0] ?? "";
  if (url.username !== "" || url.password !== "" || authority.includes("@")) return fail("credentials");
  if (url.port !== "") return fail("port");

  let hostname = url.hostname.toLowerCase();
  if (hostname.startsWith("[")) return fail("ip_literal");
  if (hostname.endsWith(".")) hostname = hostname.slice(0, -1);
  if (hostname === "") return fail("malformed");
  if (IPV4.test(hostname)) return fail("ip_literal");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return fail("localhost");
  if (hostname.length > MAX_HOSTNAME_LENGTH) return fail("too_long");

  const labels = hostname.split(".");
  if (labels.length < 2) return fail("single_label");
  if (labels.some((label) => !LABEL.test(label))) return fail("invalid_label");
  if (!TLD.test(labels.at(-1)!)) return fail("invalid_label");
  if (RESERVED_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) {
    return fail("reserved_tld");
  }

  const domain = labels.length > 2 && labels[0] === "www" ? labels.slice(1).join(".") : hostname;
  return {
    ok: true,
    value: {
      domain,
      hostname,
      displayDomain: domainToUnicode(domain) || domain,
      originalInput: input,
    },
  };
}
