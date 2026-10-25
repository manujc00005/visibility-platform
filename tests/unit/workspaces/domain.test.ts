import { describe, expect, it } from "vitest";
import { normalizeWebsite, type WebsiteError } from "@/modules/workspaces/domain";

function ok(input: string) {
  const result = normalizeWebsite(input);
  if (!result.ok) throw new Error(`expected ok for ${JSON.stringify(input)}, got ${result.error}`);
  return result.value;
}

function err(input: string): WebsiteError {
  const result = normalizeWebsite(input);
  if (result.ok) throw new Error(`expected error for ${JSON.stringify(input)}, got ${result.value.domain}`);
  return result.error;
}

describe("normalizeWebsite: accepted inputs", () => {
  it("accepts a bare domain", () => {
    expect(ok("ejemplo.es")).toEqual({
      domain: "ejemplo.es",
      hostname: "ejemplo.es",
      displayDomain: "ejemplo.es",
      originalInput: "ejemplo.es",
    });
  });

  it("accepts a full URL, lowercases the host and drops scheme, path, query and fragment", () => {
    const value = ok("HTTPS://Www.Ejemplo.es/contacto?utm_source=x#mapa");
    expect(value.domain).toBe("ejemplo.es");
    expect(value.hostname).toBe("www.ejemplo.es");
    expect(value.originalInput).toBe("HTTPS://Www.Ejemplo.es/contacto?utm_source=x#mapa");
  });

  it("keeps www in hostname but removes it from the commercial key", () => {
    const value = ok("www.clinica-garcia.com");
    expect(value.hostname).toBe("www.clinica-garcia.com");
    expect(value.domain).toBe("clinica-garcia.com");
  });

  it("does not strip www when it is the whole registrable name", () => {
    expect(ok("www.com").domain).toBe("www.com");
  });

  it("keeps other subdomains as part of the key", () => {
    expect(ok("tienda.ejemplo.es").domain).toBe("tienda.ejemplo.es");
    expect(ok("www.ejemplo.co.uk").domain).toBe("ejemplo.co.uk");
  });

  it("removes a trailing dot and surrounding whitespace", () => {
    const value = ok("  ejemplo.es.  ");
    expect(value.domain).toBe("ejemplo.es");
    expect(value.originalInput).toBe("ejemplo.es.");
  });

  it("stores internationalized domains in ASCII (punycode) and displays them in Unicode", () => {
    const value = ok("https://www.Bücher.de/tienda");
    expect(value.domain).toBe("xn--bcher-kva.de");
    expect(value.hostname).toBe("www.xn--bcher-kva.de");
    expect(value.displayDomain).toBe("bücher.de");
  });

  it("treats the Unicode and punycode spellings as the same key", () => {
    expect(ok("bücher.de").domain).toBe(ok("xn--bcher-kva.de").domain);
  });

  it("accepts the default port explicitly", () => {
    expect(ok("https://ejemplo.es:443/").domain).toBe("ejemplo.es");
    expect(ok("http://ejemplo.es:80").domain).toBe("ejemplo.es");
  });
});

describe("normalizeWebsite: rejected inputs", () => {
  it.each([
    ["", "required"],
    ["   ", "required"],
  ])("rejects empty %j", (input, code) => expect(err(input)).toBe(code));

  it("rejects overly long input", () => {
    expect(err(`${"a".repeat(2050)}.es`)).toBe("too_long");
  });

  it.each(["ejemplo .es", "https://", "http://exa mple.es", "ejemplo..es", "-ejemplo.es", "ejemplo-.es", "ej_emplo.es", "%%%.es"])(
    "rejects malformed %j",
    (input) => expect(["malformed", "invalid_label"]).toContain(err(input)),
  );

  it.each(["ftp://ejemplo.es", "javascript:alert(1)", "file:///etc/passwd", "mailto:a@ejemplo.es"])(
    "rejects non-web scheme %j",
    (input) => expect(["unsupported_scheme", "malformed"]).toContain(err(input)),
  );

  it.each(["https://user:pass@ejemplo.es", "user@ejemplo.es", "https://:secret@ejemplo.es", "https://@ejemplo.es"])(
    "rejects embedded credentials %j",
    (input) => expect(err(input)).toBe("credentials"),
  );

  it.each(["ejemplo.es:8080", "https://ejemplo.es:3000/"])("rejects non-default port %j", (input) =>
    expect(err(input)).toBe("port"),
  );

  it.each([
    "127.0.0.1",
    "http://10.0.0.1/",
    "192.168.1.1",
    "169.254.169.254",
    "8.8.8.8",
    "0x7f.0.0.1",
    "2130706433",
    "[::1]",
    "http://[2001:db8::1]/",
  ])("rejects IP literal %j", (input) => expect(err(input)).toBe("ip_literal"));

  it.each(["localhost", "http://localhost:80/", "app.localhost", "LOCALHOST"])("rejects localhost %j", (input) =>
    expect(err(input)).toBe("localhost"),
  );

  it.each(["intranet", "http://servidor/"])("rejects single-label host %j", (input) =>
    expect(err(input)).toBe("single_label"),
  );

  it.each(["impresora.local", "api.internal", "sitio.test", "web.example", "x.invalid", "abc.onion", "router.home.arpa"])(
    "rejects reserved or internal TLD %j",
    (input) => expect(err(input)).toBe("reserved_tld"),
  );

  it("rejects numeric top-level domains", () => {
    expect(["invalid_label", "ip_literal", "malformed"]).toContain(err("ejemplo.123"));
  });
});
