import { describe, expect, it } from "vitest";
import { assistedCaptureSource, associateCandidates, isGenericName, MAX_HOSTS, MAX_NAMES, type PageHead } from "@/modules/geo/competitors/extract";

const ANSWER = `Aquí tienes algunas opciones en Madrid:

1. **Clínica Dental Sonrisa** – especialistas en implantes. [Web](https://www.clinicasonrisa.es/)
2. **K2 Dental**: ortodoncia invisible y estética.
3. **Ventajas:** todas ofrecen primera visita gratuita.
- Dentalia Madrid (varias sedes) https://dentalia.es/madrid
- Según este artículo de El País: https://elpais.com/salud/mejores-dentistas
* **Clínica Dental Sonrisa** – repetida a propósito
4. **Centro Odontológico Río** - ver https://rio-dental.com y https://rio-dental.com/precios
5. Clínica

## Conclusión
En resumen, compara precios.`;

describe("assistedCaptureSource.extract", () => {
  const result = assistedCaptureSource.extract({ answerText: ANSWER, sources: ["https://www.dentalia.es/", "https://doctoralia.es/clinicas", "mailto:x@y.es"] });

  it("takes names from bold text and list items, cuts explanations and drops generic labels and duplicates", () => {
    expect(result.names.map((n) => n.name)).toEqual(["Clínica Dental Sonrisa", "K2 Dental", "Dentalia Madrid", "Según este artículo de El País", "Centro Odontológico Río"]);
    expect(result.names.find((n) => n.name === "K2 Dental")?.key).toBe("k2 dental");
    // "Ventajas", "Conclusión" (heading) and the bare "Clínica" are not businesses.
    expect(result.names.some((n) => /ventajas|conclusi|^clínica$/i.test(n.name))).toBe(false);
  });

  it("binds a link to a name only when the item has exactly one link or a link whose text is the name", () => {
    const byName = Object.fromEntries(result.names.map((n) => [n.name, n.explicitUrl]));
    expect(byName["Clínica Dental Sonrisa"]).toBe("https://www.clinicasonrisa.es/");
    expect(byName["Dentalia Madrid"]).toBe("https://dentalia.es/madrid");
    expect(byName["Centro Odontológico Río"]).toBeNull(); // two links in the item: ambiguous
    expect(byName["K2 Dental"]).toBeNull();
  });

  it("collects references by hostname without www, from text and sources, ignoring non-web URLs", () => {
    expect(result.references.map((r) => r.host)).toEqual(["clinicasonrisa.es", "dentalia.es", "elpais.com", "rio-dental.com", "doctoralia.es"]);
    expect(result.references.find((r) => r.host === "dentalia.es")).toMatchObject({ url: "https://dentalia.es/madrid", fromText: true });
    expect(result.warnings).toContain("Se ignoró una URL que no corresponde a una web pública.");
  });

  it("keeps snippets within 200 characters and strips markdown", () => {
    const long = `- **Nombre Largo** ${"x".repeat(400)}`;
    const r = assistedCaptureSource.extract({ answerText: long, sources: [] });
    expect(r.names[0]!.snippet.length).toBeLessThanOrEqual(200);
    expect(r.names[0]!.snippet.startsWith("Nombre Largo x")).toBe(true);
  });

  it("extracts only references from an unformatted answer, and warns beyond the limits", () => {
    const plain = assistedCaptureSource.extract({ answerText: "Te recomiendo mirar varias clínicas de la zona y comparar.", sources: ["https://a.es", "https://b.es"] });
    expect(plain.names).toEqual([]);
    expect(plain.references.map((r) => r.host)).toEqual(["a.es", "b.es"]);

    const many = Array.from({ length: MAX_NAMES + 3 }, (_, i) => `- **Empresa Número ${i}**`).join("\n");
    const sources = Array.from({ length: MAX_HOSTS + 2 }, (_, i) => `https://sitio${i}.es/`);
    const limited = assistedCaptureSource.extract({ answerText: many, sources });
    expect(limited.names).toHaveLength(MAX_NAMES);
    expect(limited.references).toHaveLength(MAX_HOSTS);
    expect(limited.warnings.join(" ")).toMatch(/más de 20 nombres/);
    expect(limited.warnings.join(" ")).toMatch(/más de 20 webs/);
  });

  it("renders hostile text as data: tags and scripts stay inside the name string", () => {
    const r = assistedCaptureSource.extract({ answerText: `- **<script>alert(1)</script>Clínica X**`, sources: [] });
    expect(r.names[0]!.name).toContain("<script>");
  });
});

function head(host: string, title: string | null, status: PageHead["webStatus"] = "reachable", finalHost = host): PageHead {
  return { host, finalHost, initialUrl: `https://${host}/`, finalUrl: `https://${finalHost}/`, webStatus: status, title, description: null, lang: "es", localities: [], checkedAt: new Date(0) };
}

describe("associateCandidates", () => {
  const extraction = assistedCaptureSource.extract({
    answerText: `1. **Clínica Sonrisa** [web](https://www.clinicasonrisa.es/)
2. **K2 Dental**
3. **Dentalia**
4. **Odontored**
5. **Privada SL** [web](https://privada.example.es/)`,
    sources: ["https://k2dental.es/", "https://dentalia.es/", "https://dentaliaplus.es/", "https://generico.es/", "https://sinnombre.es/", "https://elpais.com/articulo"],
  });
  const heads = new Map<string, PageHead>([
    ["clinicasonrisa.es", head("clinicasonrisa.es", "Clínica Sonrisa | Dentistas en Madrid")],
    ["k2dental.es", head("k2dental.es", "K2 Dental – Ortodoncia")],
    ["dentalia.es", head("dentalia.es", "Dentalia · Clínicas dentales")],
    ["dentaliaplus.es", head("dentaliaplus.es", "Dentalia Plus | Dentalia en Barcelona")],
    ["generico.es", head("generico.es", "Inicio")],
    ["sinnombre.es", head("sinnombre.es", null)],
    ["elpais.com", head("elpais.com", "Los mejores dentistas de España | EL PAÍS")],
    ["privada.example.es", head("privada.example.es", "Privada", "blocked")],
  ]);
  const { candidates, unshown } = associateCandidates(extraction, heads);
  const byName = Object.fromEntries(candidates.map((c) => [c.name, c]));

  it("uses explicit links, then unique whole-name title matches; ambiguity leaves the web empty", () => {
    expect(byName["Clínica Sonrisa"]).toMatchObject({ host: "clinicasonrisa.es", association: "explicit", key: "host:clinicasonrisa.es" });
    expect(byName["K2 Dental"]).toMatchObject({ host: "k2dental.es", association: "title" });
    // "Dentalia" appears in two titles → ambiguous, no host assigned.
    expect(byName["Dentalia"]).toMatchObject({ host: null, association: "ambiguous", key: "name:dentalia" });
    expect(byName["Dentalia"]!.notes.join(" ")).toMatch(/Varias webs/);
    expect(byName["Dentalia"]!.sourceUrls.sort()).toEqual(["https://dentalia.es/", "https://dentaliaplus.es/"]);
    expect(byName["Odontored"]).toMatchObject({ host: null, association: "none" });
  });

  it("does not match a name by partial hostname, and a blocked link leaves the name without web", () => {
    expect(byName["Privada SL"]).toMatchObject({ host: null });
    expect(byName["Privada SL"]!.notes.join(" ")).toMatch(/no es pública/);
    expect(unshown).toContainEqual({ host: "privada.example.es", reason: "destino no público" });
  });

  it("turns unclaimed hosts with a non-generic title into provisional-name cards and reports the rest", () => {
    const provisional = candidates.filter((c) => c.nameProvisional);
    // Hosts claimed by an ambiguous name stay with that name for review; they never duplicate as cards.
    expect(provisional.map((c) => [c.name, c.host])).toEqual([["Los mejores dentistas de España", "elpais.com"]]);
    expect(provisional[0]!.notes[0]).toMatch(/pendiente de revisar/);
    expect(unshown).toContainEqual({ host: "generico.es", reason: "título genérico" });
    expect(unshown).toContainEqual({ host: "sinnombre.es", reason: "sin título legible" });
  });

  it("never associates a name that is only a substring of a hostname", () => {
    const ex = assistedCaptureSource.extract({ answerText: "1. **Dental**", sources: ["https://k2dental.es/"] });
    const { candidates } = associateCandidates(ex, new Map([["k2dental.es", head("k2dental.es", "Inicio")]]));
    expect(candidates.find((c) => c.name === "Dental")).toMatchObject({ host: null, association: "none" });
  });

  it("knows generic names", () => {
    expect(isGenericName("agencia")).toBe(true);
    expect(isGenericName("k2")).toBe(false);
  });
});
