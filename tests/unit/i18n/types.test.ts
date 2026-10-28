import { describe, expect, it } from "vitest";
import type { ClientMessages } from "@/i18n/client-format";
import type { Messages } from "@/i18n/messages";
import { es } from "@/i18n/messages/es";

/**
 * Type-level contract (D015). These checks run under `npm run typecheck`, which includes
 * `tests/`: an `@ts-expect-error` that stops erroring fails the build, so each one proves
 * that the type rejects what it must reject.
 */

// Strings, nested namespaces and plural forms are serializable fragments.
const okFragment = {
  label: "Nombre",
  nested: { deeper: { text: "Texto" } },
  days: { one: "{count} día", other: "{count} días" },
} satisfies ClientMessages;

// A function leaf is rejected at the top level…
const fnTop = {
  // @ts-expect-error functions are not serializable to Client Components
  label: () => "texto",
} satisfies ClientMessages;

// …and nested at any depth.
const fnNested = {
  group: {
    inner: {
      // @ts-expect-error functions nested in a fragment are rejected too
      label: (n: number) => `${n}`,
    },
  },
} satisfies ClientMessages;

// The fragment the workspace form receives by props is serializable (strings only).
const formLabels: ClientMessages = es.workspaces.form;
// So are the GEO fragments: form labels, and suggestion labels with templates and plural forms.
const geoFormLabels: ClientMessages = es.geo.forms;
const suggestionLabels: ClientMessages = es.geo.suggestions;
const intentLabels: ClientMessages = es.geo.labels.intent;
// And the audit and report buttons' fragments.
const runButtonLabels: ClientMessages = es.audits.runButton;
const reportButtonLabels: ClientMessages = es.audits.reportButton;

// The catalog type keeps string leaves as `string`, not as the Spanish literal: an English
// value is accepted where the Spanish one is expected.
type HomeLabel = Messages["header"]["home"];
const englishLabel: HomeLabel = "Home";

// A catalog missing a key is rejected. Kept on one line so the directive covers the
// position TypeScript reports for `satisfies`.
const onlyCommon = { common: { brand: "x", skipToContent: "x", loading: "x", languageLabel: "x", languages: { es: "x", en: "x" } } };
// @ts-expect-error `meta`, `header` and `notFound` are missing
const partialCatalog = onlyCommon satisfies Messages;

describe("i18n type contract", () => {
  it("compiles the serializable fragments", () => {
    expect(okFragment.label).toBe("Nombre");
    expect(englishLabel).toBe("Home");
    expect(fnTop).toBeDefined();
    expect(fnNested).toBeDefined();
    expect(partialCatalog).toBeDefined();
    expect(formLabels.name).toBe("Nombre comercial");
    expect(geoFormLabels.saving).toBe("Guardando…");
    expect(suggestionLabels.sourcesCount).toEqual({ one: "{count} web citada", other: "{count} webs citadas" });
    expect(intentLabels.branded).toBe("Sobre tu marca");
    expect(runButtonLabels.run).toBe("Ejecutar auditoría");
    expect(reportButtonLabels.generate).toBe("Generar informe");
  });
});
