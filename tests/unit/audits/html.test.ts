import { describe, expect, it } from "vitest";
import { decodeHtml, extractPage } from "@/modules/audits/html";

const PAGE = `<!doctype html>
<html lang="es-ES">
<head>
  <meta charset="utf-8">
  <title>  Clínica Dental García |   Valladolid </title>
  <title>Segundo título</title>
  <meta name="description" content="Implantes y ortodoncia en Valladolid.">
  <meta name="robots" content="index, follow">
  <meta name="googlebot" content="noimageindex">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="/inicio">
  <meta property="og:title" content="García">
  <meta property="og:image" content="https://cdn.ejemplo.es/og.jpg">
  <meta property="og:type" content="website">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Dentist","name":"García"}</script>
  <script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":["WebSite","Thing"]}]}</script>
  <script type="application/ld+json">{ roto </script>
</head>
<body>
  <h1>Tu clínica   dental
     en Valladolid</h1>
  <h3>Saltamos el h2</h3>
  <h2>Servicios</h2>
  <h1>Otro h1</h1>
  <div itemscope itemtype="https://schema.org/LocalBusiness"></div>
  <a href="/servicios">Servicios</a>
  <a href="https://www.clinicagarcia.es/contacto#form">Contacto</a>
  <a href="https://clinicagarcia.es/blog">Blog sin www</a>
  <a href="/servicios">Repetido</a>
  <a href="https://facebook.com/garcia" rel="nofollow noopener">Facebook</a>
  <a href="mailto:hola@clinicagarcia.es">Email</a>
  <a href="tel:+34900000000">Teléfono</a>
  <a href="javascript:alert(1)">Malo</a>
  <a href="#arriba">Ancla</a>
  <template><h1>No cuenta</h1></template>
</body>
</html>`;

describe("extractPage", () => {
  const facts = extractPage(PAGE, "https://www.clinicagarcia.es/");

  it("reads title and description, normalizing whitespace and counting duplicates", () => {
    expect(facts.title).toBe("Clínica Dental García | Valladolid");
    expect(facts.titleCount).toBe(2);
    expect(facts.metaDescription).toBe("Implantes y ortodoncia en Valladolid.");
    expect(facts.metaDescriptionCount).toBe(1);
  });

  it("reads robots directives, language, viewport and canonical (resolved)", () => {
    expect(facts.metaRobots).toEqual(["index, follow", "noimageindex"]);
    expect(facts.lang).toBe("es-ES");
    expect(facts.viewport).toBe("width=device-width, initial-scale=1");
    expect(facts.canonicals).toEqual(["https://www.clinicagarcia.es/inicio"]);
  });

  it("lists headings in document order with collapsed text, ignoring <template>", () => {
    expect(facts.headings).toEqual([
      { level: 1, text: "Tu clínica dental en Valladolid" },
      { level: 3, text: "Saltamos el h2" },
      { level: 2, text: "Servicios" },
      { level: 1, text: "Otro h1" },
    ]);
  });

  it("collects Open Graph properties", () => {
    expect(facts.openGraph).toEqual({ "og:title": "García", "og:image": "https://cdn.ejemplo.es/og.jpg", "og:type": "website" });
  });

  it("parses JSON-LD types including @graph and reports invalid blocks", () => {
    expect(facts.structuredData.jsonLdBlocks).toBe(3);
    expect(facts.structuredData.invalidJsonLdBlocks).toBe(1);
    expect(facts.structuredData.types.sort()).toEqual(["Dentist", "Organization", "Thing", "WebSite"]);
    expect(facts.structuredData.microdataTypes).toEqual(["https://schema.org/LocalBusiness"]);
  });

  it("classifies links: internal ignores www and fragments, skips non-web schemes", () => {
    expect(facts.links.internal).toEqual([
      "https://www.clinicagarcia.es/servicios",
      "https://www.clinicagarcia.es/contacto",
      "https://clinicagarcia.es/blog",
    ]);
    expect(facts.links.internalCount).toBe(3);
    expect(facts.links.externalCount).toBe(1);
    expect(facts.links.nofollowCount).toBe(1);
  });
});

describe("extractPage on hostile or empty input", () => {
  it("handles an empty document", () => {
    const facts = extractPage("", "https://ejemplo.es/");
    expect(facts.title).toBeNull();
    expect(facts.titleCount).toBe(0);
    expect(facts.headings).toEqual([]);
    expect(facts.canonicals).toEqual([]);
  });

  it("truncates very long text and caps list sizes", () => {
    const longTitle = "x".repeat(5_000);
    const headings = Array.from({ length: 500 }, (_, i) => `<h2>H ${i}</h2>`).join("");
    const facts = extractPage(`<title>${longTitle}</title>${headings}`, "https://ejemplo.es/");
    expect(facts.title!.length).toBeLessThanOrEqual(301);
    expect(facts.titleLength).toBe(5_000);
    expect(facts.headings).toHaveLength(100);
    expect(facts.headingCounts.h2).toBe(500);
  });

  it("keeps script and markup as inert text (never executed or re-emitted as HTML)", () => {
    const facts = extractPage(`<title>&lt;script&gt;alert(1)&lt;/script&gt;</title><h1><img src=x onerror=alert(1)>Hola</h1>`, "https://e.es/");
    expect(facts.title).toBe("<script>alert(1)</script>");
    expect(facts.headings[0]).toEqual({ level: 1, text: "Hola" });
  });

  it("ignores canonicals with non-web schemes", () => {
    const facts = extractPage(`<link rel="canonical" href="javascript:alert(1)"><link rel="canonical" href="https://otro.es/">`, "https://e.es/");
    expect(facts.canonicals).toEqual(["https://otro.es/"]);
    expect(facts.canonicalCount).toBe(2);
  });
});

describe("decodeHtml", () => {
  it("uses the charset from Content-Type", () => {
    expect(decodeHtml(Buffer.from([0x43, 0x61, 0xf1, 0x61]), "text/html; charset=ISO-8859-1")).toBe("Caña");
  });

  it("falls back to <meta charset> and then UTF-8", () => {
    const latin = Buffer.concat([Buffer.from('<meta charset="windows-1252">'), Buffer.from([0x41, 0xe9])]);
    expect(decodeHtml(latin, "text/html")).toBe('<meta charset="windows-1252">Aé');
    expect(decodeHtml(Buffer.from("Ñandú"), null)).toBe("Ñandú");
  });

  it("ignores unknown charsets", () => {
    expect(decodeHtml(Buffer.from("hola"), "text/html; charset=x-made-up")).toBe("hola");
  });
});
