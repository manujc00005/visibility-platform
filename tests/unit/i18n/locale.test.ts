import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, intlTag, isLocale, negotiateLocale, resolveLocale, SUPPORTED_LOCALES } from "@/i18n/locale";

describe("isLocale", () => {
  it("accepts only the supported languages", () => {
    expect(SUPPORTED_LOCALES).toEqual(["es", "en"]);
    expect(DEFAULT_LOCALE).toBe("es");
    expect(isLocale("es")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("EN")).toBe(false);
    expect(isLocale("xx")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(1)).toBe(false);
  });

  it("maps to day-month-year Intl tags", () => {
    expect(intlTag("es")).toBe("es-ES");
    expect(intlTag("en")).toBe("en-GB");
  });
});

describe("negotiateLocale (Accept-Language)", () => {
  // Every example the SPEC contract demands.
  const cases: [string | null | undefined, "es" | "en" | null][] = [
    ["en;q=0.2,es;q=0.9", "es"],
    ["es;q=0.2,en;q=0.9", "en"],
    ["en;q=0,es;q=0.5", "es"],
    ["en,es", "en"],
    ["es,en", "es"],
    ["EN-gb,es;q=0.8", "en"],
    ["en;q=2,es;q=0.5", "es"],
    ["en;q=bad,es;q=0.5", "es"],
    ["en-US;q=0.2,en-GB;q=0.9,es;q=0.8", "en"],
    ["en-US,en;q=0.9,es;q=0.8", "en"],
    ["es-ES,en;q=0.9", "es"],
    ["fr", null],
    [undefined, null],
    [null, null],
    ["", null],
    ["*", null],
  ];

  it.each(cases)("%j → %j", (header, expected) => {
    expect(negotiateLocale(header)).toBe(expected);
  });

  it("ignores wildcards without discarding valid entries", () => {
    expect(negotiateLocale("*,en;q=0.5")).toBe("en");
    expect(negotiateLocale("fr,*;q=0.9,es;q=0.1")).toBe("es");
  });

  it("excludes q=0 even when it is the only supported entry", () => {
    expect(negotiateLocale("en;q=0")).toBeNull();
    expect(negotiateLocale("en;q=0,fr")).toBeNull();
  });

  it("does not add weights of repeated variants", () => {
    // en: 0.3 + 0.3 would beat es 0.5 if weights were summed.
    expect(negotiateLocale("en-US;q=0.3,en-GB;q=0.3,es;q=0.5")).toBe("es");
  });

  it("keeps the earliest entry on ties and tolerates spaces and three decimals", () => {
    expect(negotiateLocale(" es ; q=0.5 , en ; q=0.5 ")).toBe("es");
    expect(negotiateLocale("en;q=0.501,es;q=0.5")).toBe("en");
    expect(negotiateLocale("en;q=0.5001,es;q=0.5")).toBe("es");
  });

  it("ignores malformed tags and unknown parameters", () => {
    expect(negotiateLocale("en_US,es;q=0.1")).toBe("es");
    expect(negotiateLocale("en;foo=bar,es;q=0.1")).toBe("en");
    expect(negotiateLocale("en;q=,es")).toBe("es");
    expect(negotiateLocale("en;q=1.5,es")).toBe("es");
    expect(negotiateLocale("en;q=-1,es")).toBe("es");
    expect(negotiateLocale("en;q=1.0000,es")).toBe("es");
    expect(negotiateLocale("en;q=1.000,fr")).toBe("en");
  });
});

describe("resolveLocale", () => {
  it("lets a valid cookie win over any header", () => {
    expect(resolveLocale({ cookie: "en", acceptLanguage: "es" })).toBe("en");
    expect(resolveLocale({ cookie: "es", acceptLanguage: "en;q=1,es;q=0.1" })).toBe("es");
    expect(resolveLocale({ cookie: "en" })).toBe("en");
  });

  it("ignores an invalid cookie and negotiates", () => {
    expect(resolveLocale({ cookie: "xx", acceptLanguage: "en" })).toBe("en");
    expect(resolveLocale({ cookie: "EN", acceptLanguage: "en" })).toBe("en");
    expect(resolveLocale({ cookie: "", acceptLanguage: "en;q=0.9,es;q=0.8" })).toBe("en");
  });

  it("falls back to Spanish without cookie or selectable header", () => {
    expect(resolveLocale({})).toBe("es");
    expect(resolveLocale({ cookie: null, acceptLanguage: null })).toBe("es");
    expect(resolveLocale({ cookie: "xx", acceptLanguage: "fr" })).toBe("es");
    expect(resolveLocale({ acceptLanguage: "*" })).toBe("es");
  });
});
