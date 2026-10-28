import { describe, expect, it } from "vitest";
import { displayCountry, displayDate } from "@/modules/workspaces/presentation";
import { countryName, countryOptions, parseWorkspaceInput, workspaceInputSchemaFor } from "@/modules/workspaces/validation";

/** English variants (T004). The Spanish behaviour is asserted, unchanged, in `validation.test.ts`. */

const valid = {
  name: "García Dental Clinic",
  website: "https://www.clinicagarcia.es/",
  sector: "Dental clinic",
  country: "ES",
  city: "Valladolid",
  services: "Implants\nInvisible braces",
};

function errorsOf(input: Record<string, unknown>, locale: "es" | "en") {
  const result = parseWorkspaceInput(input, locale);
  if (result.success) throw new Error("expected validation errors");
  return result.fieldErrors;
}

describe("parseWorkspaceInput in English", () => {
  it("reports an empty name, an IP website and empty services in English", () => {
    const errors = errorsOf({ ...valid, name: " ", website: "192.168.1.1", services: "\n \n" }, "en");
    expect(errors.name).toEqual(["The business name is required."]);
    expect(errors.website).toEqual(["Enter a domain, not an IP address."]);
    expect(errors.services).toEqual(["Enter at least one service."]);
  });

  it("keeps the Spanish messages by default and with locale es", () => {
    expect(errorsOf({ ...valid, name: " " }, "es").name).toEqual(["El nombre comercial es obligatorio."]);
    const byDefault = parseWorkspaceInput({ ...valid, website: "" });
    expect(!byDefault.success && byDefault.fieldErrors.website).toEqual(["Introduce el dominio o la URL de la web."]);
  });

  it("parametrizes limits and labels in both languages", () => {
    expect(errorsOf({ ...valid, name: "x".repeat(121) }, "en").name).toEqual(["The business name can have at most 120 characters."]);
    expect(errorsOf({ ...valid, sector: "" }, "en").sector).toEqual(["The sector is required."]);
    expect(errorsOf({ ...valid, city: "x".repeat(121) }, "en").city).toEqual(["The city can have at most 120 characters."]);
    expect(errorsOf({ ...valid, services: Array.from({ length: 11 }, (_, i) => `Service ${i}`) }, "en").services).toEqual(["Enter at most 10 services."]);
    expect(errorsOf({ ...valid, services: ["x".repeat(81)] }, "en").services).toEqual(["Each service can have at most 80 characters."]);
    expect(errorsOf({ ...valid, country: "XX" }, "en").country).toEqual(["Select a valid country."]);
  });

  it("accepts the same valid input in both languages", () => {
    const es = parseWorkspaceInput(valid);
    const en = parseWorkspaceInput(valid, "en");
    expect(en).toEqual(es);
    expect(en.success).toBe(true);
  });

  it("builds one schema per language and reuses it", () => {
    expect(workspaceInputSchemaFor("en")).toBe(workspaceInputSchemaFor("en"));
    expect(workspaceInputSchemaFor("en")).not.toBe(workspaceInputSchemaFor());
  });
});

describe("country names and dates by language", () => {
  it("names countries in the interface language, Spanish by default", () => {
    expect(countryName("ES")).toBe("España");
    expect(countryName("ES", "en")).toBe("Spain");
    expect(countryName("ZZ", "en")).toBeUndefined();
    expect(displayCountry("DE")).toBe("Alemania");
    expect(displayCountry("DE", "en")).toBe("Germany");
    expect(displayCountry("QM", "en")).toBe("QM");
  });

  it("offers the same country codes in both languages, in the same order", () => {
    const es = countryOptions();
    const en = countryOptions("en");
    expect(en.map((c) => c.code)).toEqual(es.map((c) => c.code));
    expect(es[0]).toEqual({ code: "ES", name: "España" });
    expect(en[0]).toEqual({ code: "ES", name: "Spain" });
    expect(en.find((c) => c.code === "GB")?.name).toBe("United Kingdom");
  });

  it("formats the creation date in Madrid time for both languages", () => {
    const fixed = new Date("2026-10-27T12:34:56Z");
    expect(displayDate(fixed)).toBe("27 oct 2026, 13:34");
    expect(displayDate(fixed, "en")).toBe("27 Oct 2026, 13:34");
  });
});
