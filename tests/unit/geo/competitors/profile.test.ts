import { describe, expect, it } from "vitest";
import { getMessages } from "@/i18n/messages";
import { profileSchemaFor, proposeProfile } from "@/modules/geo/competitors/profile";
import { PROFILE_LIMITS } from "@/modules/geo/competitors/profile-options";

const html = (head: string, body = "") => `<!doctype html><html lang="es"><head>${head}</head><body>${body}</body></html>`;
const propose = (page: string, record: { city?: string | null; services?: string[] } = {}) =>
  proposeProfile({ html: page, url: "https://empresa.es/", city: record.city ?? null, services: record.services ?? ["Ficha"] });
const codes = (result: ReturnType<typeof propose>) => result.notes.map((n) => n.code);

const valid = { summary: "Agencia de CRM", offerings: "CRM\nAutomatización\nCRM", customerType: "b2b", targetCustomer: "Pymes", zoneRelevance: "national", servedArea: "", competitorKinds: ["indirect", "direct"] };

describe("profile validation (AC-001)", () => {
  it("normalizes offers, kinds and an empty area", () => {
    expect(profileSchemaFor("es").parse(valid)).toEqual({ summary: "Agencia de CRM", offerings: ["CRM", "Automatización"], customerType: "b2b", targetCustomer: "Pymes", zoneRelevance: "national", servedArea: null, competitorKinds: ["direct", "indirect"] });
  });

  it.each([
    ["summary", { summary: " " }, "summaryRequired"],
    ["summary", { summary: "s".repeat(PROFILE_LIMITS.summary + 1) }, null],
    ["offerings", { offerings: "o".repeat(PROFILE_LIMITS.offering + 1) }, null],
    ["offerings", { offerings: Array.from({ length: PROFILE_LIMITS.offerings + 1 }, (_, i) => `o${i}`).join("\n") }, null],
    ["customerType", { customerType: "otro" }, "customerType"],
    ["targetCustomer", { targetCustomer: "" }, "targetRequired"],
    ["zoneRelevance", { zoneRelevance: "mundo" }, "zoneRelevance"],
    ["servedArea", { zoneRelevance: "local", servedArea: "" }, "areaRequired"],
    ["servedArea", { zoneRelevance: "regional", servedArea: " " }, "areaRequired"],
    ["competitorKinds", { competitorKinds: [] }, "kindsRequired"],
    ["competitorKinds", { competitorKinds: ["cliente"] }, "kindsRequired"],
  ] as const)("rejects %s %#, with a message in each language", (field, over, key) => {
    for (const locale of ["es", "en"] as const) {
      const result = profileSchemaFor(locale).safeParse({ ...valid, ...over });
      expect(result.success).toBe(false);
      const issue = result.error?.issues.find((i) => i.path[0] === field);
      expect(issue).toBeDefined();
      if (key) expect(issue?.message).toBe(getMessages(locale).geo.profile.validation[key]);
    }
  });
});

describe("proposeProfile (AC-003)", () => {
  it("takes the summary from the description, else the H1, else nothing", () => {
    expect(propose(html('<meta name="description" content="Hacemos CRM">', "<h1>Título</h1>")).draft.summary).toBe("Hacemos CRM");
    const heading = propose(html("", "<h1>Título</h1>"));
    expect(heading.draft.summary).toBe("Título");
    expect(codes(heading)).toContain("summary_heading");
    const none = propose(html(""));
    expect(none.draft.summary).toBe("");
    expect(codes(none)).toContain("summary_missing");
  });

  it("proposes offers from H2/H3 that are not sentences, else the record", () => {
    const page = html("", "<h1>Uno</h1><h2>Marketing de resultados</h2><h3>Automatización</h3><h2>¿Hablamos?</h2><h2>Tu negocio tiene potencial.</h2><h2>Automatización</h2><h4>Nivel cuatro</h4><h2>x</h2>");
    expect(propose(page).draft.offerings).toEqual(["Marketing de resultados", "Automatización"]);
    const record = propose(html(""), { services: ["Implantes"] });
    expect(record.draft.offerings).toEqual(["Implantes"]);
    expect(codes(record)).toContain("offerings_record");
  });

  it.each([
    ["CRM para pymes y empresas", "b2b", "pymes, empresas"],
    ["Atención a pacientes y familias", "b2c", "familias, pacientes"],
    ["Para empresas y particulares", "both", "empresas, particulares"],
  ])("detects the customer in «%s»", (text, customerType, target) => {
    const { draft } = propose(html(`<meta name="description" content="${text}">`));
    expect(draft).toMatchObject({ customerType, targetCustomer: target });
  });

  it("leaves the customer open when nothing is said", () => {
    const result = propose(html('<meta name="description" content="Hacemos cosas">'));
    expect(result.draft).toMatchObject({ customerType: "both", targetCustomer: "" });
    expect(codes(result)).toContain("customer_ambiguous");
  });

  it("proposes a local zone from a local schema type or the record's city", () => {
    const typed = propose(html('<script type="application/ld+json">{"@type":"Dentist","address":{"addressLocality":"Toledo"}}</script>'));
    expect(typed.draft).toMatchObject({ zoneRelevance: "local", servedArea: "Toledo" });
    expect(typed.notes).toContainEqual({ code: "zone_local_type", type: "Dentist" });
    expect(propose(html(""), { city: "Madrid" }).draft).toMatchObject({ zoneRelevance: "local", servedArea: "Madrid" });
  });

  it("proposes international with versions in several languages, and the country otherwise", () => {
    const languages = '<link rel="alternate" hreflang="es" href="https://e.es/es"><link rel="alternate" hreflang="en-GB" href="https://e.es/en"><link rel="alternate" hreflang="x-default" href="https://e.es/">';
    const multi = propose(html(languages));
    expect(multi.draft).toMatchObject({ zoneRelevance: "international", servedArea: "" });
    expect(multi.notes).toContainEqual({ code: "zone_languages", languages: ["es", "en"] });
    expect(propose(html('<link rel="alternate" hreflang="es" href="https://e.es/es">')).draft.zoneRelevance).toBe("national");
  });

  it("is bounded and proposes the two main kinds", () => {
    const { draft } = propose(html(`<meta name="description" content="${"d".repeat(1000)}">`));
    expect(draft.summary.length).toBe(PROFILE_LIMITS.summary);
    expect(draft.competitorKinds).toEqual(["direct", "indirect"]);
  });
});
