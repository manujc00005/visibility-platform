import { nameKey, normalizeText } from "@/modules/geo/detection";
import { normalizeWebsite } from "@/modules/workspaces/domain";

/**
 * Stage 1 (pure, no network): names and references from an assisted ChatGPT capture.
 * Stage 2 (`associateCandidates`, after home pages were read): names ↔ hosts, only when
 * the link is unambiguous. A cited URL is a reference, never a confirmed business.
 */

export const EXTRACTION_RULES_VERSION = "extract-2026-10-26.1";
export const MAX_NAMES = 20;
export const MAX_HOSTS = 20;
export const MAX_SNIPPET = 200;
export const MAX_NAME = 120;

/** Headings and section labels that ChatGPT bolds or lists but that are not businesses. */
const GENERIC_LABELS = new Set(
  [
    "ventajas", "desventajas", "pros", "contras", "conclusión", "conclusion", "conclusiones", "resumen", "en resumen",
    "opciones", "otras opciones", "recomendaciones", "recomendación", "recomendacion", "consejos", "factores", "criterios",
    "nota", "notas", "precio", "precios", "servicios", "características", "caracteristicas", "ejemplo", "ejemplos",
    "alternativas", "qué tener en cuenta", "que tener en cuenta", "fuentes", "referencias", "importante", "aviso",
    "descripción", "descripcion", "ubicación", "ubicacion", "web", "sitio web", "página web", "pagina web", "contacto",
    "especialidad", "especialidades", "por qué", "por que", "puntos fuertes", "puntos débiles", "puntos debiles",
    "opinión", "opinion", "opiniones", "valoración", "valoracion", "más información", "mas informacion",
  ].map(nameKey),
);

/** Words too generic to identify a business on their own (used for title associations too). */
const GENERIC_WORDS = new Set(
  ["empresa", "agencia", "clinica", "clínica", "centro", "estudio", "consultora", "consultoría", "tienda", "web", "inicio", "home", "página", "pagina", "bienvenido", "bienvenidos", "servicios"].map(nameKey),
);

export interface ExtractedName {
  name: string;
  key: string;
  snippet: string;
  /** URL explicitly linked to this name in the same list item, if exactly one. */
  explicitUrl: string | null;
}

export interface ExtractedReference {
  url: string;
  /** Hostname without "www." (see normalizeWebsite); never a registrable domain. */
  host: string;
  snippet: string;
  fromText: boolean;
}

export interface ExtractionResult {
  names: ExtractedName[];
  references: ExtractedReference[];
  warnings: string[];
}

const LIST_ITEM = /^\s*(?:\d{1,3}[.)]|[-*•–—])\s+(.*)$/;
const MARKDOWN_LINK = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
const BARE_URL = /https?:\/\/[^\s<>()"']+/g;
const BOLD = /\*\*([^*]+?)\*\*|__([^_]+?)__/;

function stripMarkdown(text: string): string {
  return text
    .replace(MARKDOWN_LINK, "$1")
    .replace(/^\s*>+\s*/, "")
    .replace(/[*_`#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function snippetOf(text: string): string {
  const clean = stripMarkdown(text);
  return clean.length > MAX_SNIPPET ? `${clean.slice(0, MAX_SNIPPET - 1)}…` : clean;
}

/** "Nombre: explicación", "Nombre – explicación", "Nombre (Madrid)" → "Nombre". */
function cutExplanation(text: string): string {
  return text
    .split(/\s[–—-]\s|:\s|:$|\s\(/)[0]!
    .replace(/[.,;:!?]+$/, "")
    .trim();
}

export function isGenericName(key: string): boolean {
  return key.length === 0 || GENERIC_LABELS.has(key) || GENERIC_WORDS.has(key);
}

function hostOf(url: string): string | null {
  const parsed = normalizeWebsite(url);
  return parsed.ok ? parsed.value.domain : null;
}

export const assistedCaptureSource = {
  extract(input: { answerText: string; sources: string[] }): ExtractionResult {
    const warnings: string[] = [];
    const names: ExtractedName[] = [];
    const seenNames = new Set<string>();
    const references: ExtractedReference[] = [];
    const seenHosts = new Set<string>();
    let extraNames = 0;
    let extraHosts = 0;

    const addReference = (url: string, snippet: string, fromText: boolean) => {
      const host = hostOf(url);
      if (!host) {
        warnings.push("Se ignoró una URL que no corresponde a una web pública.");
        return;
      }
      if (seenHosts.has(host)) return;
      if (references.length >= MAX_HOSTS) {
        extraHosts += 1;
        return;
      }
      seenHosts.add(host);
      references.push({ url, host, snippet, fromText });
    };

    for (const rawLine of input.answerText.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const item = LIST_ITEM.exec(line)?.[1] ?? null;
      const bold = BOLD.exec(line);
      const boldText = bold ? (bold[1] ?? bold[2] ?? "") : null;
      // Links in this line: markdown first, then bare URLs not already captured.
      const links: { text: string | null; url: string }[] = [];
      for (const m of line.matchAll(MARKDOWN_LINK)) links.push({ text: m[1] ?? "", url: m[2]! });
      for (const m of line.replace(MARKDOWN_LINK, " ").matchAll(BARE_URL)) links.push({ text: null, url: m[0] });

      const candidateText = boldText ?? item;
      if (candidateText !== null) {
        const name = cutExplanation(stripMarkdown(candidateText)).slice(0, MAX_NAME + 1);
        const key = nameKey(name);
        const looksLikeUrl = /^https?:\/\//i.test(name) || (/\.[a-z]{2,}$/i.test(name) && !name.includes(" "));
        if (name.length > 0 && name.length <= MAX_NAME && !looksLikeUrl && !isGenericName(key) && !seenNames.has(key)) {
          if (names.length >= MAX_NAMES) {
            extraNames += 1;
          } else {
            seenNames.add(key);
            const own = links.filter((l) => l.text !== null && nameKey(l.text) === key);
            const explicit = own.length === 1 ? own[0]! : links.length === 1 ? links[0]! : null;
            names.push({ name, key, snippet: snippetOf(item ?? line), explicitUrl: explicit?.url ?? null });
          }
        }
      }
      for (const link of links) addReference(link.url, snippetOf(item ?? line), true);
    }

    for (const url of input.sources) addReference(url, "", false);

    if (extraNames > 0) warnings.push(`La respuesta contiene más de ${MAX_NAMES} nombres; solo se procesan los ${MAX_NAMES} primeros.`);
    if (extraHosts > 0) warnings.push(`Hay más de ${MAX_HOSTS} webs distintas; solo se consultan las ${MAX_HOSTS} primeras.`);
    return { names, references, warnings };
  },
};

// --- Stage 2: association after home pages were read ----------------------------------

export interface PageHead {
  host: string;
  /** Hostname after public redirects (without "www."), or the same host when none. */
  finalHost: string | null;
  initialUrl: string;
  finalUrl: string | null;
  webStatus: "reachable" | "unreachable" | "unverified" | "blocked";
  title: string | null;
  description: string | null;
  lang: string | null;
  /** Localities and areas declared in JSON-LD (PostalAddress, areaServed), bounded. */
  localities: string[];
  checkedAt: Date;
}

export type Association = "explicit" | "title" | "none" | "ambiguous";

export interface Candidate {
  key: string;
  name: string;
  nameKey: string;
  /** True when the name was derived from a page title and needs review. */
  nameProvisional: boolean;
  host: string | null;
  sourceUrls: string[];
  snippet: string;
  association: Association;
  head: PageHead | null;
  /** Review notes produced during association (ambiguity, blocked links…). */
  notes: string[];
}

export interface AssociationResult {
  candidates: Candidate[];
  /** References that produced no showable candidate, with the reason. */
  unshown: { host: string; reason: string }[];
}

function titleContainsName(title: string | null, key: string): boolean {
  if (!title) return false;
  return normalizeText(title).includes(` ${key} `);
}

/**
 * `excludedHosts`: cited hosts that were filtered before any network (own business, known
 * directories, registered or dismissed). A name explicitly linked to one of them carries
 * that host so the evaluation excludes it, instead of surviving as a name-only card.
 */
export function associateCandidates(extraction: ExtractionResult, heads: Map<string, PageHead>, excludedHosts: Set<string> = new Set()): AssociationResult {
  const urlsByHost = new Map<string, string[]>();
  for (const ref of extraction.references) {
    const list = urlsByHost.get(ref.host) ?? [];
    if (!list.includes(ref.url)) list.push(ref.url);
    urlsByHost.set(ref.host, list);
  }
  const usable = (host: string) => {
    const head = heads.get(host);
    return head !== undefined && head.webStatus !== "blocked";
  };

  const assignedHosts = new Set<string>();
  const candidates: Candidate[] = [];
  const pending: { name: ExtractedName; notes: string[] }[] = [];

  // 1. Explicit links bound to the name in the same list item.
  for (const name of extraction.names) {
    const notes: string[] = [];
    if (name.explicitUrl) {
      const host = hostOf(name.explicitUrl);
      if (host && usable(host) && !assignedHosts.has(host)) {
        assignedHosts.add(host);
        candidates.push(candidate(name, host, "explicit", heads.get(host)!, urlsByHost.get(host) ?? [name.explicitUrl], notes));
        continue;
      }
      if (host && heads.get(host)?.webStatus === "blocked") notes.push("La web enlazada no es pública; se deja sin web.");
      if (host && excludedHosts.has(host)) {
        candidates.push(candidate(name, host, "explicit", null, [name.explicitUrl], notes));
        continue;
      }
    }
    pending.push({ name, notes });
  }

  // 2. Unique whole-name match in a home page title, in both directions.
  const freeHosts = [...heads.keys()].filter((h) => usable(h) && !assignedHosts.has(h));
  const matches = new Map<string, string[]>(); // name key → hosts
  const hostClaims = new Map<string, number>(); // host → number of names matching its title
  for (const { name } of pending) {
    const hosts = isGenericName(name.key) || name.key.length < 2 ? [] : freeHosts.filter((h) => titleContainsName(heads.get(h)!.title, name.key));
    matches.set(name.key, hosts);
    for (const h of hosts) hostClaims.set(h, (hostClaims.get(h) ?? 0) + 1);
  }
  for (const { name, notes } of pending) {
    const hosts = matches.get(name.key) ?? [];
    if (hosts.length === 1 && hostClaims.get(hosts[0]!) === 1 && !assignedHosts.has(hosts[0]!)) {
      const host = hosts[0]!;
      assignedHosts.add(host);
      candidates.push(candidate(name, host, "title", heads.get(host)!, urlsByHost.get(host) ?? [], notes));
    } else if (hosts.length > 0) {
      // Ambiguous: keep the possible references for review, assign none.
      notes.push("Varias webs citadas podrían corresponder a este nombre; indica la web correcta.");
      candidates.push(candidate(name, null, "ambiguous", null, hosts.flatMap((h) => urlsByHost.get(h) ?? [`https://${h}/`]), notes));
    } else {
      notes.push("No se encontró una web citada para este nombre; añádela si la conoces.");
      candidates.push(candidate(name, null, "none", null, [], notes));
    }
  }

  // 3. Cited hosts nobody claimed (not even ambiguously): provisional name from a non-generic title, else not shown.
  const unshown: AssociationResult["unshown"] = [];
  const usedNameKeys = new Set(candidates.map((c) => c.nameKey));
  for (const host of [...heads.keys()]) {
    if (assignedHosts.has(host) || (hostClaims.get(host) ?? 0) > 0) continue;
    const head = heads.get(host)!;
    if (head.webStatus === "blocked") {
      unshown.push({ host, reason: "destino no público" });
      continue;
    }
    const title = head.title ? cutExplanation(head.title.split(/\s[|·]\s/)[0] ?? head.title) : "";
    const key = nameKey(title);
    if (!title || title.length > MAX_NAME || isGenericName(key)) {
      unshown.push({ host, reason: head.title ? "título genérico" : "sin título legible" });
      continue;
    }
    if (usedNameKeys.has(key)) {
      unshown.push({ host, reason: "mismo nombre que otro candidato" });
      continue;
    }
    usedNameKeys.add(key);
    candidates.push({
      key: `host:${host}`,
      name: title,
      nameKey: key,
      nameProvisional: true,
      host,
      sourceUrls: urlsByHost.get(host) ?? [],
      snippet: extraction.references.find((r) => r.host === host)?.snippet ?? "",
      association: "none",
      head,
      notes: ["Nombre pendiente de revisar: se tomó del título de la web citada."],
    });
  }

  return { candidates, unshown };
}

function candidate(name: ExtractedName, host: string | null, association: Association, head: PageHead | null, sourceUrls: string[], notes: string[]): Candidate {
  return {
    key: host ? `host:${host}` : `name:${name.key}`,
    name: name.name,
    nameKey: name.key,
    nameProvisional: false,
    host,
    sourceUrls,
    snippet: name.snippet,
    association,
    head,
    notes,
  };
}
