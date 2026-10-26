import { describe, expect, it } from "vitest";
import { classifySources, detectMentions, type BrandPanel } from "@/modules/geo/detection";

const panel: BrandPanel = {
  brand: { name: "Clínica Dental García", aliases: ["Dental García", "CDG"], domain: "clinicagarcia.es" },
  competitors: [
    { id: "c1", name: "Sonrisas Valladolid", aliases: [], domain: "sonrisasva.com" },
    { id: "c2", name: "Vitaldent", aliases: ["Vital Dent"], domain: "vitaldent.com" },
  ],
};

describe("detectMentions", () => {
  it("matches names ignoring case, accents and punctuation", () => {
    const result = detectMentions("Te recomiendo la CLINICA DENTAL GARCÍA, o bien Vitaldent.", panel);
    expect(result).toEqual({ brand: true, competitors: { c1: false, c2: true } });
  });

  it("matches aliases and the domain, including subdomains", () => {
    expect(detectMentions("Pide cita en dental garcia", panel).brand).toBe(true);
    expect(detectMentions("Más info en https://www.clinicagarcia.es/citas", panel).brand).toBe(true);
    expect(detectMentions("Ver sonrisasva.com", panel).competitors.c1).toBe(true);
  });

  it("requires whole words: short aliases do not match inside other words", () => {
    expect(detectMentions("Un tratamiento CDG-2 o abcdgh", panel).brand).toBe(true); // "CDG" as a word
    expect(detectMentions("Las siglas abcdgh no cuentan", panel).brand).toBe(false);
    expect(detectMentions("Vitaldental es otra empresa", panel).competitors.c2).toBe(false);
  });

  it("does not match a domain that only contains ours as a substring", () => {
    expect(detectMentions("Visita miclinicagarcia.es o clinicagarcia.es.fake.com", panel).brand).toBe(false);
  });

  it("returns no mentions for empty text", () => {
    expect(detectMentions("", panel)).toEqual({ brand: false, competitors: { c1: false, c2: false } });
  });
});

describe("classifySources", () => {
  it("classifies cited URLs as own, competitor or other by registrable host", () => {
    const result = classifySources(
      [
        { url: "https://www.clinicagarcia.es/implantes?utm=x", title: "Implantes" },
        { url: "https://blog.vitaldent.com/a", title: null },
        { url: "https://www.doctoralia.es/x", title: "Doctoralia" },
        { url: "javascript:alert(1)", title: "x" },
        { url: "https://notclinicagarcia.es/", title: "x" },
      ],
      panel,
    );
    expect(result.ownCited).toBe(true);
    expect(result.competitorsCited).toEqual(["c2"]);
    expect(result.sources).toEqual([
      { url: "https://www.clinicagarcia.es/implantes?utm=x", domain: "clinicagarcia.es", title: "Implantes", kind: "own" },
      { url: "https://blog.vitaldent.com/a", domain: "blog.vitaldent.com", title: null, kind: "competitor", competitorId: "c2" },
      { url: "https://www.doctoralia.es/x", domain: "doctoralia.es", title: "Doctoralia", kind: "other" },
      { url: "https://notclinicagarcia.es/", domain: "notclinicagarcia.es", title: "x", kind: "other" },
    ]);
  });
});
