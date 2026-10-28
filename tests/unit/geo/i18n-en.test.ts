import { describe, expect, it } from "vitest";
import { getMessages } from "@/i18n/messages";
import { formatMicros } from "@/modules/geo/budget";
import { extractionInputSchemaFor } from "@/modules/geo/competitors/service";
import { fraction, geoLabels } from "@/modules/geo/presentation";
import { geoSchemasFor, parseCompetitorInput, parseManualObservation } from "@/modules/geo/service";

/** English variants of the GEO validation and labels (T007). Spanish stays the default and is asserted unchanged. */

const messagesOf = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  result.success ? [] : result.error!.issues.map((i) => `${String(i.path[0])}: ${i.message}`);

describe("assisted-capture answer", () => {
  it("rejects an empty or blank answer without «Sin respuesta», in each language", () => {
    for (const answer of ["", "   \n\t "]) {
      expect(parseManualObservation({ answer }, "en")).toEqual({ ok: false, error: "validation", fieldErrors: { answer: ["Paste the answer or tick “No answer”."] } });
      expect(parseManualObservation({ answer })).toEqual({ ok: false, error: "validation", fieldErrors: { answer: ["Pega la respuesta o marca «Sin respuesta»."] } });
    }
  });

  it("accepts «no answer» and reports invalid sources in the interface language", () => {
    expect(parseManualObservation({ answer: "", noAnswer: "true" }, "en")).toEqual({ ok: true, value: { answer: "", sources: [], noAnswer: true } });
    expect(parseManualObservation({ answer: "Texto", sources: "ftp://x.es" }, "en")).toEqual({ ok: false, error: "validation", fieldErrors: { sources: ["Invalid URL: ftp://x.es"] } });
    expect(parseManualObservation({ answer: "Texto", sources: "ftp://x.es" })).toEqual({ ok: false, error: "validation", fieldErrors: { sources: ["URL no válida: ftp://x.es"] } });
  });
});

describe("GEO forms validation in English", () => {
  it("translates competitor, prompt and alias errors, Spanish by default", () => {
    expect(parseCompetitorInput({ name: " " }, "en")).toMatchObject({ fieldErrors: { name: ["Enter the name."] } });
    expect(parseCompetitorInput({ name: "Rival", website: "192.168.1.1" }, "en")).toMatchObject({ fieldErrors: { website: ["Enter a domain, not an IP address."] } });
    expect(parseCompetitorInput({ name: " " })).toMatchObject({ fieldErrors: { name: ["Indica el nombre."] } });
    expect(messagesOf(geoSchemasFor("en").prompt.safeParse({ text: "abc", intent: "other" }))).toEqual(["text: The question is too short.", "intent: Invalid question type."]);
    expect(messagesOf(geoSchemasFor().prompt.safeParse({ text: "abc", intent: "discovery" }))).toEqual(["text: La pregunta es demasiado corta."]);
    const tooMany = Array.from({ length: 11 }, (_, i) => `Alias ${i}`).join("\n");
    expect(messagesOf(geoSchemasFor("en").aliases.safeParse({ aliases: tooMany }))).toEqual(["aliases: At most 10 aliases."]);
    // Spanish keeps its exact previous text, typo included (reported, not fixed: scope of 003).
    expect(messagesOf(geoSchemasFor().aliases.safeParse({ aliases: tooMany }))).toEqual(["aliases: Como máximo 10 aliass."]);
  });

  it("builds one schema set per language and reuses it", () => {
    expect(geoSchemasFor("en")).toBe(geoSchemasFor("en"));
    expect(geoSchemasFor("en")).not.toBe(geoSchemasFor());
  });

  it("validates the competitor-discovery capture in English, blank answers included", () => {
    expect(messagesOf(extractionInputSchemaFor("en").safeParse({ question: "  ", answer: " \n " }))).toEqual(["question: Enter the question you asked.", "answer: Paste the answer."]);
    expect(messagesOf(extractionInputSchemaFor().safeParse({ question: "", answer: "" }))).toEqual(["question: Indica la pregunta que hiciste.", "answer: Pega la respuesta."]);
    expect(messagesOf(extractionInputSchemaFor("en").safeParse({ question: "q", answer: "x".repeat(30_001) }))).toEqual(["answer: The answer can have 30,000 characters."]);
    expect(messagesOf(extractionInputSchemaFor().safeParse({ question: "q", answer: "x".repeat(30_001) }))).toEqual(["answer: La respuesta admite 30.000 caracteres."]);
  });

  it("names the duplicate-question and limit errors the actions return", () => {
    expect(getMessages("en").geo.errors.duplicate).toBe("That question is already on the list.");
    expect(getMessages("es").geo.errors.duplicate).toBe("Esa pregunta ya está en la lista.");
    expect(getMessages("en").geo.success.candidates(1)).toBe("1 candidate to review.");
    expect(getMessages("en").geo.success.candidates(3)).toBe("3 candidates to review.");
  });
});

describe("GEO labels and formats", () => {
  it("formats fractions and amounts by language", () => {
    expect(fraction({ k: 3, n: 8 })).toBe("3 de 8 (38 %)");
    expect(fraction({ k: 3, n: 8 }, "en")).toBe("3 of 8 (38%)");
    expect(fraction({ k: 0, n: 0 }, "en")).toBe("No data");
    expect(formatMicros(1_200, "en")).toBe("0.0012 USD");
    expect(formatMicros(5_000_000)).toBe("5,00 USD");
  });

  it("translates provider, status and intent labels", () => {
    expect(geoLabels("en").provider.manual).toBe("Assisted capture (ChatGPT web)");
    expect(geoLabels("en").observationStatus.uncertain).toBe("Uncertain submission");
    expect(geoLabels("en").intent.branded).toBe("About your brand");
    expect(geoLabels().provider.manual).toBe("Captura asistida (ChatGPT web)");
  });
});
