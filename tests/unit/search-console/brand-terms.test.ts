import { describe, expect, it } from "vitest";
import { BrandTermsError, brandTerms, isBrandedQuery, MAX_EXPRESSION_LENGTH } from "@/modules/search-console/brand-terms";

const clinic = { name: "Clínica García", brandAliases: ["clinicagarcia"], domain: "clinicagarcia.es" };
const olessium = { name: "Olessium", brandAliases: [], domain: "olessium.com" };

/** The expression as JavaScript sees it: same alternation, flags instead of the RE2 prefix (D004). */
const asJs = (expression: string) => new RegExp(expression.replace(/^\(\?i\)/, ""), "iu");

function caught(fn: () => unknown): BrandTermsError {
  try {
    fn();
  } catch (error) {
    if (error instanceof BrandTermsError) return error;
    throw error;
  }
  throw new Error("expected a BrandTermsError");
}

describe("brandTerms", () => {
  it("keeps name, aliases and domain as typed, in that order (AC-002)", () => {
    const result = brandTerms(clinic);
    expect(result.terms).toEqual(["Clínica García", "clinicagarcia", "clinicagarcia.es"]);
    expect(result.truncated).toBe(false);
  });

  it("builds one case-insensitive alternation of escaped variants (AC-002)", () => {
    const { expression } = brandTerms(clinic);
    expect(expression.startsWith("(?i)")).toBe(true);
    const variants = expression.slice(4).split("|");
    // Name with and without accents, alias, domain as typed and in its spaced form; name variants first.
    expect(variants).toEqual(["clínica +garcía", "clinica +garcia", "clinicagarcia", "clinicagarcia\\.es", "clinicagarcia +es"]);
  });

  it("trims and collapses whitespace in the stored terms' variants", () => {
    const { terms, expression } = brandTerms({ name: "  Clínica   García ", brandAliases: [], domain: "clinicagarcia.es" });
    expect(terms[0]).toBe("Clínica   García");
    expect(asJs(expression).test("clínica      garcía precios")).toBe(true);
  });

  it("drops names and aliases with fewer than three letters or digits, never the domain", () => {
    const result = brandTerms({ name: "QA", brandAliases: ["A1", "-", "Sol"], domain: "qa-tools.es" });
    expect(result.terms).toEqual(["Sol", "qa-tools.es"]);
    expect(result.truncated).toBe(false);
  });

  it("deduplicates names and aliases by nameKey and keeps the domain over an equal alias", () => {
    const result = brandTerms({
      name: "Olessium",
      brandAliases: ["OLESSIUM", "olessium com", "Olessium Agency", "olessium agency"],
      domain: "olessium.com",
    });
    expect(result.terms).toEqual(["Olessium", "Olessium Agency", "olessium.com"]);
  });

  it("keeps the domain when the name is the domain", () => {
    expect(brandTerms({ name: "olessium.com", brandAliases: [], domain: "olessium.com" }).terms).toEqual(["olessium.com"]);
  });

  it("treats regex metacharacters as literals (AC-015)", () => {
    const { expression } = brandTerms({ name: "C++ Academy", brandAliases: ["García & Hijos S.L.", "foo|bar"], domain: "c-academy.es" });
    const re = asJs(expression);
    expect(expression).toContain("c\\+\\+ +academy");
    expect(expression).toContain("foo\\|bar");
    expect(re.test("c++ academy cursos")).toBe(true);
    // The nameKey variant "c academy" loses the pluses; content matching (D002) accepts it inside other words.
    expect(re.test("c academy")).toBe(true);
    expect(re.test("academy cursos")).toBe(false);
    expect(re.test("garcia & hijos s.l. opiniones")).toBe(true);
    expect(re.test("garcia hijos s l")).toBe(true);
    // "foo|bar" is one alias, not two alternatives.
    expect(re.test("foo")).toBe(false);
    expect(re.test("foo|bar")).toBe(true);
  });

  it("keeps HTML in a term as plain literal text (AC-015)", () => {
    const { terms, expression } = brandTerms({ name: "<script>alert(1)</script>", brandAliases: [], domain: "example.com" });
    expect(terms[0]).toBe("<script>alert(1)</script>");
    expect(expression).toContain("<script>alert\\(1\\)</script>");
    expect(asJs(expression).test("<script>alert(1)</script>")).toBe(true);
    expect(asJs(expression).test("alert1")).toBe(false);
  });

  it("does not escape hyphens, so the expression compiles with the u flag (D004)", () => {
    const { expression } = brandTerms({ name: "Qa-Tools", brandAliases: [], domain: "qa-tools.es" });
    expect(expression).not.toContain("\\-");
    expect(() => asJs(expression)).not.toThrow();
  });

  it("omits a term that does not fit whole and keeps a later one that does (AC-012)", () => {
    const result = brandTerms({ name: "Olessium", brandAliases: ["a".repeat(4100), "olessium seo"], domain: "olessium.com" });
    expect(result.terms).toEqual(["Olessium", "olessium seo", "olessium.com"]);
    expect(result.truncated).toBe(true);
    expect(result.expression.length).toBeLessThanOrEqual(MAX_EXPRESSION_LENGTH);
    expect(result.expression).not.toContain("aaaa");
  });

  it("accepts an expression of exactly the limit and omits one character more (AC-012)", () => {
    // "(?i)" + name + "|" + "ab\.es|ab +es" = 4 + n + 1 + 13.
    const fits = brandTerms({ name: "b".repeat(4078), brandAliases: [], domain: "ab.es" });
    expect(fits.expression.length).toBe(MAX_EXPRESSION_LENGTH);
    expect(fits.truncated).toBe(false);
    const over = brandTerms({ name: "b".repeat(4079), brandAliases: [], domain: "ab.es" });
    expect(over.terms).toEqual(["ab.es"]);
    expect(over.truncated).toBe(true);
  });

  it("fails with a typed error that does not name the domain when the domain alone does not fit (AC-012)", () => {
    const domain = `${"d".repeat(4100)}.es`;
    const error = caught(() => brandTerms({ name: "Olessium", brandAliases: [], domain }));
    expect(error.message).not.toContain("dddd");
  });
});

describe("isBrandedQuery", () => {
  const olessiumTerms = brandTerms(olessium).terms;
  const clinicTerms = brandTerms(clinic).terms;

  it.each([
    ["olessium opiniones", olessiumTerms, true],
    ["OLESSIUM.COM", olessiumTerms, true],
    ["olessium com", olessiumTerms, true],
    ["agencia seo madrid", olessiumTerms, false],
    ["clínica garcía", clinicTerms, true],
    ["clinica garcia horario", clinicTerms, true],
    ["CLÍNICA GARCÍA", clinicTerms, true],
    ["clinica dental madrid", clinicTerms, false],
  ])("%s → %s (AC-005)", (query, terms, expected) => {
    expect(isBrandedQuery(query, terms)).toBe(expected);
  });

  it("matches the domain as typed and in its spaced form, and nothing else (AC-005)", () => {
    expect(isBrandedQuery("olessium.com", ["olessium.com"])).toBe(true);
    expect(isBrandedQuery("olessium com", ["olessium.com"])).toBe(true);
    expect(isBrandedQuery("olessium", ["olessium.com"])).toBe(false);
  });

  it("gives the same verdict as the expression sent to Google (AC-002)", () => {
    for (const site of [olessium, clinic]) {
      const { terms, expression } = brandTerms(site);
      const re = asJs(expression);
      for (const query of ["olessium opiniones", "OLESSIUM.COM", "olessium com", "clínica garcía", "clinica dental madrid", "clinicagarcia.es citas"]) {
        expect(isBrandedQuery(query, terms)).toBe(re.test(query));
      }
    }
  });

  it("is false without terms", () => {
    expect(isBrandedQuery("olessium", [])).toBe(false);
  });
});
