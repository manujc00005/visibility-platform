import { describe, expect, it } from "vitest";
import { compareEvaluated, evaluateCandidate, evaluateCandidates, MAX_SHOWN } from "@/modules/geo/competitors/evaluate";
import type { Candidate, PageHead } from "@/modules/geo/competitors/extract";
import type { ExtractionContext } from "@/modules/geo/competitors/schema";

const context: ExtractionContext = {
  brandName: "Clínica Dental García",
  aliases: ["Sonrisas Pepe"],
  hostname: "clinicagarcia.es",
  sector: "Clínica dental",
  city: "Madrid",
  countryCode: "ES",
  countryName: "España",
  services: ["Implantes", "Ortodoncia invisible"],
};

function head(host: string, title: string | null, description: string | null = null, extra: Partial<PageHead> = {}): PageHead {
  return { host, finalHost: host, initialUrl: `https://${host}/`, finalUrl: `https://${host}/`, webStatus: "reachable", title, description, lang: "es", localities: [], checkedAt: new Date(0), ...extra };
}

function candidate(name: string, host: string | null, page: PageHead | null = null, extra: Partial<Candidate> = {}): Candidate {
  const key = name.toLowerCase();
  return { key: host ? `host:${host}` : `name:${key}`, name, nameKey: key, nameProvisional: false, host, sourceUrls: [], snippet: "", association: host ? "title" : "none", head: page, notes: [], ...extra };
}

describe("evaluateCandidate", () => {
  it("marks indicators only from the candidate's own page; the question is never evidence", () => {
    const f = evaluateCandidate(candidate("sonrisa", "sonrisa.es", head("sonrisa.es", "Clínica dental Sonrisa en Madrid", "Implantes y estética dental")), context);
    expect(f.sector).toMatchObject({ state: "matched", terms: ["Clínica dental"], origin: "title" });
    expect(f.zone).toMatchObject({ state: "matched", terms: ["Madrid"], origin: "title" });
    expect(f.services).toMatchObject({ state: "matched", terms: ["Implantes"], origin: "description" });
    expect(f.review).toContain("La web responde, pero eso no confirma que sea la de esta empresa: revísalo.");

    const unknown = evaluateCandidate(candidate("otra", "otra.es", head("otra.es", "Bienvenidos", "Servicios profesionales")), context);
    expect(unknown.sector.state).toBe("unknown");
    expect(unknown.zone.state).toBe("unknown");
    expect(unknown.services.state).toBe("unknown");
    expect(unknown.review.filter((r) => r.startsWith("Sin indicios"))).toHaveLength(3);
  });

  it("treats a different postal address as unknown, and only explicit exclusivity as conflicting", () => {
    const elsewhere = evaluateCandidate(candidate("bcn", "bcn.es", head("bcn.es", "Dentistas", "Calle Mayor 1, Barcelona", { localities: ["Barcelona"] })), context);
    expect(elsewhere.zone.state).toBe("unknown");
    const exclusive = evaluateCandidate(candidate("bcn2", "bcn2.es", head("bcn2.es", "Dentistas", "Solo atendemos en Barcelona capital")), context);
    expect(exclusive.zone).toMatchObject({ state: "conflicting" });
    const exclusiveHere = evaluateCandidate(candidate("mad", "mad.es", head("mad.es", "Dentistas", "Exclusivamente en Madrid")), context);
    expect(exclusiveHere.zone.state).toBe("matched");
    const jsonLd = evaluateCandidate(candidate("ld", "ld.es", head("ld.es", "Dentistas", null, { localities: ["Madrid"] })), context);
    expect(jsonLd.zone).toMatchObject({ state: "matched", origin: "jsonld" });
  });

  it("uses the country when the record has no city and leaves services unknown when the record has none", () => {
    const noCity = { ...context, city: null, services: [] };
    const f = evaluateCandidate(candidate("es", "es.es", head("es.es", "Clínica dental en España")), noCity);
    expect(f.zone).toMatchObject({ state: "matched", terms: ["España"] });
    expect(f.services).toMatchObject({ state: "unknown", reason: "La ficha no indica los servicios." });
  });

  it("never labels ownership from an HTTP 200", () => {
    const f = evaluateCandidate(candidate("x", "x.es", head("x.es", "Clínica dental")), context);
    expect(JSON.stringify(f)).not.toMatch(/propia verificada/i);
  });
});

describe("evaluateCandidates (AC-001 fixture)", () => {
  const fixture: Candidate[] = [
    candidate("Páginas Amarillas", "paginasamarillas.es", head("paginasamarillas.es", "Clínica dental en Madrid | Páginas Amarillas")),
    candidate("Doctoralia", "doctoralia.es", head("doctoralia.es", "Dentistas en Madrid - Doctoralia")),
    candidate("Yelp", "yelp.es", head("yelp.es", "Los 10 mejores dentistas de Madrid")),
    candidate("Sonrisas Pepe", "sonrisaspepe.es", head("sonrisaspepe.es", "Sonrisas Pepe, clínica dental en Madrid")),
    candidate("Dental Barcelona", "dentalbcn.es", head("dentalbcn.es", "Clínica dental", "Solo atendemos en Barcelona")),
    candidate("Odonto Catalunya", "odontocat.es", head("odontocat.es", "Clínica dental Odonto", "Exclusivamente en Barcelona y alrededores")),
    candidate("Alfa Dental", "alfa.es", head("alfa.es", "Alfa Dental, clínica dental en Madrid", "Implantes dentales")),
    candidate("Beta Dental", "beta.es", head("beta.es", "Beta Dental, clínica dental en Madrid")),
    candidate("Gamma", "gamma.es", head("gamma.es", "Gamma · dentistas en Madrid")),
    candidate("Delta", "delta.es", head("delta.es", "Delta clínica dental")),
    candidate("Epsilon", "epsilon.es", head("epsilon.es", "Epsilon", null, { webStatus: "unreachable" })),
    candidate("Zeta", null),
  ];
  const result = evaluateCandidates(fixture, context, { registeredKeys: new Set(), dismissedKeys: new Set() });

  it("shows exactly five valid candidates in FR-003b order and excludes directories, the own alias and exclusive zones", () => {
    expect(result.shown.map((c) => c.name)).toEqual(["Alfa Dental", "Beta Dental", "Delta", "Gamma", "Epsilon"]);
    expect(result.overflow).toBe(1); // Zeta: no indicators, no web
    expect(result.excluded.map((e) => [e.candidate.name, e.reason])).toEqual([
      ["Páginas Amarillas", "known_non_business"],
      ["Doctoralia", "known_non_business"],
      ["Yelp", "known_non_business"],
      ["Sonrisas Pepe", "own_business"],
      ["Dental Barcelona", "conflicting_zone"],
      ["Odonto Catalunya", "conflicting_zone"],
    ]);
  });

  it("a correct question gives nothing to a candidate whose page says nothing", () => {
    const delta = result.shown.find((c) => c.name === "Delta")!;
    expect(delta.factors.zone.state).toBe("unknown");
    expect(delta.factors.sector.state).toBe("matched");
  });

  it("excludes registered (also archived) and dismissed identities, including a redirect landing on a directory", () => {
    const r = evaluateCandidates(
      [
        candidate("Vitaldent", "vitaldent.com", head("vitaldent.com", "Vitaldent")),
        candidate("Archivada", null),
        candidate("Odontored", "odontored.es", head("odontored.es", "Odontored")),
        candidate("Redirigida", "redir.es", head("redir.es", "Dentistas", null, { finalHost: "doctoralia.es" })),
        candidate("Propia", "promo.es", head("promo.es", "Promo", null, { finalHost: "clinicagarcia.es" })),
      ],
      context,
      { registeredKeys: new Set(["host:vitaldent.com", "name:archivada"]), dismissedKeys: new Set(["name:odontored"]) },
    );
    expect(r.shown).toEqual([]);
    expect(r.excluded.map((e) => e.reason)).toEqual(["registered", "registered", "dismissed", "known_non_business", "own_business"]);
  });

  it("orders stably: matches, then reachable, then name and host", () => {
    const a = { ...candidate("b", "b.es", head("b.es", "clínica dental madrid")), factors: evaluateCandidate(candidate("b", "b.es", head("b.es", "clínica dental madrid")), context) };
    const b = { ...candidate("a", "a.es", head("a.es", "clínica dental madrid")), factors: evaluateCandidate(candidate("a", "a.es", head("a.es", "clínica dental madrid")), context) };
    expect([a, b].sort(compareEvaluated).map((c) => c.name)).toEqual(["a", "b"]);
    expect(MAX_SHOWN).toBe(5);
  });
});

describe("inputFingerprint", () => {
  it("changes with sources, context or rules version, and ignores source order and duplicates", async () => {
    const { inputFingerprint } = await import("@/modules/geo/competitors/service");
    const base = { workspaceId: "w", question: "q", answerSha256: "a".repeat(64), sources: ["https://b.es/", "https://a.es/"], context, rulesVersion: "v1" };
    const same = inputFingerprint({ ...base, sources: ["https://a.es/", "https://b.es/", "https://a.es/"] });
    expect(inputFingerprint(base)).toBe(same);
    expect(inputFingerprint({ ...base, rulesVersion: "v2" })).not.toBe(same);
    expect(inputFingerprint({ ...base, sources: ["https://a.es/"] })).not.toBe(same);
    expect(inputFingerprint({ ...base, context: { ...context, city: "Getafe" } })).not.toBe(same);
  });
});
