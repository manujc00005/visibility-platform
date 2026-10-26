import { describe, expect, it } from "vitest";
import { hostMatches, identityKeys, isKnownNonBusinessHost, isOwnBusiness, registeredKeys } from "@/modules/geo/competitors/exclusions";
import type { ExtractionContext } from "@/modules/geo/competitors/schema";

const context: ExtractionContext = {
  brandName: "Clínica Dental García",
  aliases: ["Sonrisas Pepe", "CDG"],
  hostname: "clinicagarcia.es",
  sector: "Clínica dental",
  city: "Valladolid",
  countryCode: "ES",
  countryName: "España",
  services: ["Implantes"],
};

describe("host matching", () => {
  it("matches equality and dot-boundary suffixes only", () => {
    expect(hostMatches("clinicagarcia.es", "clinicagarcia.es")).toBe(true);
    expect(hostMatches("citas.clinicagarcia.es", "clinicagarcia.es")).toBe(true);
    expect(hostMatches("clinicagarcia.es.ejemplo.com", "clinicagarcia.es")).toBe(false);
    expect(hostMatches("miclinicagarcia.es", "clinicagarcia.es")).toBe(false);
  });

  it("recognises known directories, networks and builders by host", () => {
    expect(isKnownNonBusinessHost("paginasamarillas.es")).toBe(true);
    expect(isKnownNonBusinessHost("es-es.facebook.com")).toBe(true);
    expect(isKnownNonBusinessHost("alguien.wixsite.com")).toBe(true);
    expect(isKnownNonBusinessHost("clinica-nueva.es")).toBe(false);
    expect(isKnownNonBusinessHost("facebook.com.ejemplo.es")).toBe(false);
  });
});

describe("own business and identities", () => {
  it("excludes the company by subdomain, name or alias normalized", () => {
    expect(isOwnBusiness({ nameKey: null, host: "blog.clinicagarcia.es" }, context)).toBe(true);
    expect(isOwnBusiness({ nameKey: "sonrisas pepe", host: null }, context)).toBe(true);
    expect(isOwnBusiness({ nameKey: "cdg", host: "otra.es" }, context)).toBe(true);
    expect(isOwnBusiness({ nameKey: "clinica garcia", host: "clinicagarcia.es.ejemplo.com" }, context)).toBe(false);
  });

  it("builds prefixed keys and registered keys for active and archived competitors", () => {
    expect(identityKeys({ nameKey: "vitaldent", host: "vitaldent.com" })).toEqual(["host:vitaldent.com", "name:vitaldent"]);
    expect(identityKeys({ nameKey: "vitaldent", host: null })).toEqual(["name:vitaldent"]);
    const keys = registeredKeys([
      { name: "Vitaldent", domain: "vitaldent.com" },
      { name: "Archivada SL", domain: null },
    ]);
    expect([...keys].sort()).toEqual(["host:vitaldent.com", "name:archivada sl", "name:vitaldent"]);
  });

  it("a dismissal without web still blocks the same name once a host is found later", () => {
    const dismissed = new Set(["name:odontored"]);
    expect(identityKeys({ nameKey: "odontored", host: "odontored.es" }).some((k) => dismissed.has(k))).toBe(true);
  });
});
