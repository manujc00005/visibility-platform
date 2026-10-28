import { describe, expect, it } from "vitest";
import { fillTemplate, plural } from "@/i18n/client-format";

describe("fillTemplate", () => {
  it("replaces named placeholders with strings and numbers", () => {
    expect(fillTemplate("{name} añadido ({count} de {max})", { name: "Acme", count: 2, max: 5 })).toBe("Acme añadido (2 de 5)");
    expect(fillTemplate("{name} added ({count} of {max})", { name: "Acme", count: 2, max: 5 })).toBe("Acme added (2 of 5)");
  });

  it("leaves unknown placeholders visible instead of hiding them", () => {
    expect(fillTemplate("Hola {name}", {})).toBe("Hola {name}");
  });

  it("fills repeated placeholders", () => {
    expect(fillTemplate("{a}-{a}", { a: 1 })).toBe("1-1");
  });
});

describe("plural", () => {
  const es = { one: "Datos de hace {count} día", other: "Datos de hace {count} días" };
  const en = { one: "{count} day old", other: "{count} days old" };

  it("selects the form with Intl.PluralRules in each language", () => {
    expect(plural("es", es, 1)).toBe("Datos de hace 1 día");
    expect(plural("es", es, 31)).toBe("Datos de hace 31 días");
    expect(plural("en", en, 1)).toBe("1 day old");
    expect(plural("en", en, 0)).toBe("0 days old");
    expect(plural("en", en, 2)).toBe("2 days old");
  });

  it("formats the count in the language and fills extra params", () => {
    expect(plural("es", { one: "{count} pregunta de {total}", other: "{count} preguntas de {total}" }, 1234, { total: 2000 })).toBe(
      "1234 preguntas de 2000",
    );
    expect(plural("en", { one: "{count} question of {total}", other: "{count} questions of {total}" }, 1234, { total: 2000 })).toBe(
      "1,234 questions of 2000",
    );
  });
});
