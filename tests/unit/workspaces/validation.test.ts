import { describe, expect, it } from "vitest";
import { parseWorkspaceInput } from "@/modules/workspaces/validation";

const valid = {
  name: "Clínica Dental García",
  website: "https://www.clinicagarcia.es/",
  sector: "Clínica dental",
  country: "ES",
  city: "Valladolid",
  services: "Implantes\nOrtodoncia invisible\n\nBlanqueamiento",
};

function errorsOf(input: Record<string, unknown>) {
  const result = parseWorkspaceInput(input);
  if (result.success) throw new Error("expected validation errors");
  return result.fieldErrors;
}

describe("parseWorkspaceInput", () => {
  it("normalizes a valid submission", () => {
    const result = parseWorkspaceInput(valid);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      name: "Clínica Dental García",
      domain: "clinicagarcia.es",
      hostname: "www.clinicagarcia.es",
      originalUrl: "https://www.clinicagarcia.es/",
      sector: "Clínica dental",
      country: "ES",
      city: "Valladolid",
      services: ["Implantes", "Ortodoncia invisible", "Blanqueamiento"],
    });
  });

  it("trims text, uppercases the country and turns an empty city into null", () => {
    const result = parseWorkspaceInput({ ...valid, name: "  Taller Pérez  ", country: "pt", city: "   " });
    expect(result.success && result.data).toMatchObject({ name: "Taller Pérez", country: "PT", city: null });
  });

  it("accepts services as an array and drops duplicates ignoring case", () => {
    const result = parseWorkspaceInput({ ...valid, services: ["Reformas", "reformas ", "Fontanería"] });
    expect(result.success && result.data.services).toEqual(["Reformas", "Fontanería"]);
  });

  it("reports the website error in Spanish on the website field", () => {
    expect(errorsOf({ ...valid, website: "http://localhost" }).website?.[0]).toMatch(/locales/);
    expect(errorsOf({ ...valid, website: "" }).website?.[0]).toMatch(/Introduce/);
  });

  it("reports the website error together with errors in other fields", () => {
    const errors = errorsOf({ ...valid, name: "", website: "192.168.1.1" });
    expect(errors.name).toBeDefined();
    expect(errors.website?.[0]).toMatch(/IP/);
  });

  it("requires name, sector and at least one service", () => {
    const errors = errorsOf({ ...valid, name: " ", sector: "", services: "\n \n" });
    expect(Object.keys(errors).sort()).toEqual(["name", "sector", "services"]);
  });

  it("rejects an unknown or malformed country code", () => {
    expect(errorsOf({ ...valid, country: "XX" }).country).toBeDefined();
    expect(errorsOf({ ...valid, country: "ESP" }).country).toBeDefined();
  });

  it("enforces length limits", () => {
    expect(errorsOf({ ...valid, name: "x".repeat(121) }).name).toBeDefined();
    expect(errorsOf({ ...valid, city: "x".repeat(121) }).city).toBeDefined();
    expect(errorsOf({ ...valid, services: Array.from({ length: 11 }, (_, i) => `Servicio ${i}`) }).services).toBeDefined();
    expect(errorsOf({ ...valid, services: ["x".repeat(81)] }).services).toBeDefined();
  });

  it("rejects non-string payloads without throwing", () => {
    expect(errorsOf({ name: 42, website: null, sector: {}, country: [], services: 7 })).toBeDefined();
  });
});

describe("formValuesFrom", () => {
  it("reads every field as text and ignores files or missing keys", async () => {
    const { formValuesFrom } = await import("@/modules/workspaces/validation");
    const form = new FormData();
    form.set("name", "Taller Pérez");
    form.set("website", "tallerperez.es");
    form.set("services", new Blob(["x"]));
    expect(formValuesFrom(form)).toEqual({
      name: "Taller Pérez",
      website: "tallerperez.es",
      sector: "",
      country: "",
      city: "",
      services: "",
    });
  });
});
