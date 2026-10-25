import type { FetchLogEntry } from "@/modules/audits/fetcher/safe-fetch";
import { CATEGORY_LABELS, formatMs, OUTCOME_LABELS, SEVERITY_LABELS } from "@/modules/audits/presentation";
import type { AuditFacts, Category, Severity } from "@/modules/audits/rules";
import { html, join, type SafeHtml } from "@/modules/reports/html-template";
import { REPORT_STYLES } from "@/modules/reports/report-styles";

/**
 * Builds the client report as one self-contained HTML document from stored data only:
 * no network access, no scripts, no external resources (fonts, images and CSS are inline).
 * Every value from the audited website goes through the escaping `html` template.
 * Deterministic: the same input always produces the same document.
 */
export const TEMPLATE_VERSION = "2026-10-25.1";

export interface ReportFinding {
  ruleId: string;
  severity: Severity;
  category: string;
  title: string;
  evidence: string[];
  recommendation: string;
}

export interface ReportInput {
  workspace: {
    name: string;
    displayDomain: string;
    sector: string;
    country: string;
    city: string | null;
    services: string[];
  };
  audit: {
    id: string;
    startedAt: Date;
    rulesVersion: string;
    requestedUrl: string;
    finalUrl: string | null;
    facts: AuditFacts;
    findings: ReportFinding[];
    fetchLog: FetchLogEntry[];
  };
  generatedAt: Date;
}

const dateTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Madrid" });
const dateOnly = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeZone: "Europe/Madrid" });

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

type CheckStatus = "ok" | "review" | "unknown";

interface Check {
  label: string;
  status: CheckStatus;
  severity?: Severity;
  detail: string;
}

/** Each check is "review" only when one of its rules produced a finding, so table and list agree. */
const CHECK_RULES: { label: string; rules: string[]; needsContent: boolean; ok: (facts: AuditFacts) => string }[] = [
  { label: "La portada responde", rules: ["page_unreachable", "page_http_error", "page_not_html", "page_disallowed_for_audit"], needsContent: false, ok: () => "Responde correctamente" },
  { label: "Conexión segura (HTTPS)", rules: ["not_https"], needsContent: false, ok: () => "Activa" },
  { label: "Google puede indexar la portada", rules: ["noindex", "robots_blocks_homepage"], needsContent: true, ok: () => "Sin bloqueos detectados" },
  {
    label: "Archivo robots.txt",
    rules: ["robots_missing", "robots_error"],
    needsContent: false,
    ok: (facts) => (facts.robots?.status === "ok" ? "Presente" : "No comprobado"),
  },
  {
    label: "Sitemap XML",
    rules: ["sitemap_missing", "sitemap_invalid", "sitemap_empty", "sitemap_invalid_urls", "sitemap_not_declared"],
    needsContent: false,
    ok: (facts) => (facts.sitemap?.sitemap ? `Presente (${plural(facts.sitemap.sitemap.locCount, "URL", "URLs")})` : "No comprobado"),
  },
  { label: "Título de la página", rules: ["title_missing", "title_too_long", "title_too_short", "title_multiple"], needsContent: true, ok: () => "Correcto" },
  { label: "Meta descripción", rules: ["description_missing", "description_length", "description_multiple"], needsContent: true, ok: () => "Correcta" },
  { label: "Encabezados (H1)", rules: ["h1_missing", "h1_multiple", "heading_level_skip"], needsContent: true, ok: () => "Correctos" },
  { label: "Etiqueta canonical", rules: ["canonical_missing", "canonical_multiple", "canonical_invalid", "canonical_other_url"], needsContent: true, ok: () => "Correcta" },
  { label: "Enlaces internos", rules: ["internal_links_none"], needsContent: true, ok: () => "Presentes" },
  { label: "Adaptación a móvil", rules: ["viewport_missing"], needsContent: true, ok: () => "Viewport configurado" },
  { label: "Datos estructurados", rules: ["structured_data_missing", "structured_data_invalid", "structured_data_no_business"], needsContent: true, ok: () => "Presentes" },
  { label: "Vista al compartir (Open Graph)", rules: ["open_graph_incomplete"], needsContent: true, ok: () => "Completa" },
];

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

function contentReadable(facts: AuditFacts): boolean {
  return facts.page.kind === "fetched" && facts.page.result.status < 400 && facts.page.result.facts !== null;
}

function technicalChecks(facts: AuditFacts, findings: ReportFinding[]): Check[] {
  const checks: Check[] = CHECK_RULES.map(({ label, rules, needsContent, ok }) => {
    const related = findings.filter((f) => rules.includes(f.ruleId));
    if (related.length > 0) {
      const worst = related.reduce((a, b) => (SEVERITY_RANK[b.severity] < SEVERITY_RANK[a.severity] ? b : a));
      return { label, status: "review", severity: worst.severity, detail: worst.title };
    }
    if (needsContent && !contentReadable(facts)) return { label, status: "unknown", detail: "No comprobado: no se pudo leer la portada" };
    const detail = ok(facts);
    return { label, status: detail === "No comprobado" ? "unknown" : "ok", detail };
  });

  const perf = facts.performance;
  const speedFindings = findings.filter((f) => ["lcp_slow", "cls_high", "tbt_high", "performance_unavailable"].includes(f.ruleId));
  if (perf.status !== "ok") {
    checks.push({ label: "Velocidad en móvil (laboratorio)", status: "unknown", detail: "No medida en este análisis" });
  } else if (speedFindings.length > 0) {
    const worst = speedFindings.reduce((a, b) => (SEVERITY_RANK[b.severity] < SEVERITY_RANK[a.severity] ? b : a));
    checks.push({ label: "Velocidad en móvil (laboratorio)", status: "review", severity: worst.severity, detail: worst.title });
  } else {
    checks.push({ label: "Velocidad en móvil (laboratorio)", status: "ok", detail: perf.score !== null ? `Puntuación ${perf.score}/100` : "Correcta" });
  }
  return checks;
}

const STATUS_LABEL: Record<CheckStatus, string> = { ok: "Correcto", review: "Revisar", unknown: "No comprobado" };

function executiveSummary(input: ReportInput, counts: Record<Severity, number>): SafeHtml {
  const { workspace, audit } = input;
  const facts = audit.facts;
  const total = counts.critical + counts.warning + counts.info;
  const intro = html`<p>El ${dateOnly.format(audit.startedAt)} analizamos la página principal de <strong>${workspace.displayDomain}</strong> (${workspace.name}): su respuesta, cómo la ven los buscadores, sus metadatos, su estructura y los archivos que guían el rastreo de Google.</p>`;

  let access: SafeHtml | null = null;
  if (facts.page.kind === "failed") {
    access = html`<p class="callout critical">No pudimos acceder a la portada. Es lo primero que hay que resolver: si la web no responde, Google no puede mostrarla.</p>`;
  } else if (facts.page.kind === "fetched" && facts.page.result.status >= 400) {
    access = html`<p class="callout critical">La portada responde con un error (${facts.page.result.status}). Mientras sea así, Google no puede mostrarla en sus resultados.</p>`;
  } else if (facts.page.kind === "disallowed") {
    access = html`<p class="callout warning">El archivo robots.txt de la web impide a nuestro analizador leer la portada, por lo que este diagnóstico es parcial.</p>`;
  }

  const countsLine =
    total === 0
      ? html`<p>No detectamos problemas en las comprobaciones realizadas. Recomendamos repetir el análisis tras cualquier cambio importante en la web.</p>`
      : html`<p>Encontramos <strong>${plural(counts.critical, "problema crítico", "problemas críticos")}</strong>, <strong>${plural(counts.warning, "aspecto importante", "aspectos importantes")}</strong> y ${plural(counts.info, "mejora recomendada", "mejoras recomendadas")}.</p>`;

  const priorities = audit.findings.filter((f) => f.severity !== "info").slice(0, 3);
  const prioritiesBlock =
    priorities.length > 0
      ? html`<p>Lo primero que recomendamos:</p><ol class="priorities">${priorities.map((f) => html`<li>${f.title}</li>`)}</ol>`
      : null;

  const speed =
    facts.performance.status === "ok"
      ? null
      : html`<p class="muted">La velocidad de carga no se midió en este análisis; no aparece ninguna cifra de rendimiento.</p>`;

  return html`${intro}${access}${countsLine}${prioritiesBlock}${speed}`;
}

function evidenceSources(input: ReportInput): SafeHtml {
  const { audit } = input;
  const facts = audit.facts;
  const perf = facts.performance;
  const perfSource =
    perf.status === "ok"
      ? html`<li>Rendimiento: Google PageSpeed Insights, prueba de laboratorio en móvil (Lighthouse ${perf.lighthouseVersion ?? "—"}). No son datos de visitantes reales.</li>`
      : html`<li>Rendimiento: no medido en este análisis.</li>`;
  return html`
    <ul class="sources">
      <li>Datos públicos de la web, leídos por nuestro analizador el ${dateTime.format(audit.startedAt)} (hora de Madrid).</li>
      ${facts.robots ? html`<li>robots.txt: <span class="mono">${facts.robots.url}</span></li>` : null}
      ${facts.sitemap?.url ? html`<li>Sitemap: <span class="mono">${facts.sitemap.url}</span></li>` : null}
      ${perfSource}
    </ul>
    <table class="log">
      <thead><tr><th>Dirección consultada</th><th>Resultado</th><th>HTTP</th><th>Tiempo</th></tr></thead>
      <tbody>
        ${audit.fetchLog.map(
          (entry) =>
            html`<tr><td class="mono">${entry.url}</td><td>${OUTCOME_LABELS[entry.outcome]}</td><td>${entry.status ?? "—"}</td><td>${formatMs(entry.ms)}</td></tr>`,
        )}
      </tbody>
    </table>`;
}

const LIMITATIONS = [
  "Se analiza la página principal, su robots.txt y un sitemap. No es un rastreo completo de la web: otras páginas pueden tener problemas distintos.",
  "Los datos son públicos y se observaron en un momento concreto; la web puede cambiar después del análisis.",
  "No incluye datos privados del propietario (Google Search Console, Analytics): no mide visitas, clics ni posiciones reales en Google.",
  "Las métricas de velocidad, si aparecen, son una prueba de laboratorio en un móvil simulado, no la experiencia de los visitantes reales.",
  "Las recomendaciones son orientativas y no garantizan una posición concreta en buscadores.",
];

export function buildReportHtml(input: ReportInput): string {
  const { workspace, audit, generatedAt } = input;
  const findings = audit.findings;
  const counts: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  const checks = technicalChecks(audit.facts, findings);
  const location = join([workspace.city, workspace.country].filter((v): v is string => Boolean(v)), ", ");
  const categoryLabel = (category: string) => CATEGORY_LABELS[category as Category] ?? category;

  const document = html`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex, nofollow">
<title>Diagnóstico SEO técnico · ${workspace.displayDomain}</title>
<style>${REPORT_STYLES}</style>
</head>
<body>
<header class="cover">
  <p class="eyebrow">Diagnóstico SEO técnico</p>
  <h1>${workspace.name}</h1>
  <p class="domain mono">${workspace.displayDomain}</p>
  <dl class="meta">
    <dt>Fecha del análisis</dt><dd>${dateTime.format(audit.startedAt)}</dd>
    <dt>Fecha del informe</dt><dd>${dateOnly.format(generatedAt)}</dd>
  </dl>
  <div class="counts">
    <span class="pill critical">${plural(counts.critical, "crítico", "críticos")}</span>
    <span class="pill warning">${plural(counts.warning, "importante", "importantes")}</span>
    <span class="pill info">${plural(counts.info, "mejora", "mejoras")}</span>
  </div>
</header>

<section id="resumen">
  <h2>1. Resumen ejecutivo</h2>
  ${executiveSummary(input, counts)}
</section>

<section id="empresa">
  <h2>2. Datos de la empresa</h2>
  <dl class="grid">
    <dt>Nombre comercial</dt><dd>${workspace.name}</dd>
    <dt>Web analizada</dt><dd class="mono">${audit.finalUrl ?? audit.requestedUrl}</dd>
    <dt>Sector</dt><dd>${workspace.sector}</dd>
    <dt>Ubicación</dt><dd>${location}</dd>
    <dt>Servicios principales</dt><dd>${join(workspace.services, " · ")}</dd>
  </dl>
</section>

<section id="resultados">
  <h2>3. Resultados técnicos</h2>
  <table class="checks">
    <thead><tr><th>Comprobación</th><th>Estado</th><th>Detalle</th></tr></thead>
    <tbody>
      ${checks.map(
        (check) =>
          html`<tr><td>${check.label}</td><td><span class="status ${check.status}${check.severity ? ` ${check.severity}` : ""}">${STATUS_LABEL[check.status]}</span></td><td>${check.detail}</td></tr>`,
      )}
    </tbody>
  </table>
</section>

<section id="problemas">
  <h2>4. Problemas identificados</h2>
  ${
    findings.length === 0
      ? html`<p>No se identificaron problemas en las comprobaciones realizadas.</p>`
      : html`<table class="issues">
    <thead><tr><th>#</th><th>Gravedad</th><th>Área</th><th>Problema</th></tr></thead>
    <tbody>
      ${findings.map(
        (f, i) =>
          html`<tr><td>${i + 1}</td><td><span class="pill ${f.severity}">${SEVERITY_LABELS[f.severity]}</span></td><td>${categoryLabel(f.category)}</td><td>${f.title}</td></tr>`,
      )}
    </tbody>
  </table>`
  }
</section>

<section id="recomendaciones">
  <h2>5. Recomendaciones priorizadas</h2>
  ${
    findings.length === 0
      ? html`<p>Mantener la configuración actual y repetir el análisis periódicamente.</p>`
      : html`<p class="muted">Ordenadas por impacto: primero lo crítico, después lo importante y por último las mejoras.</p>
  <ol class="recommendations">
    ${findings.map(
      (f) => html`<li class="recommendation ${f.severity}">
      <p class="rec-title"><span class="pill ${f.severity}">${SEVERITY_LABELS[f.severity]}</span> ${f.title}</p>
      <p><strong>Qué hacer:</strong> ${f.recommendation}</p>
      ${f.evidence.length > 0 ? html`<p class="evidence-label">Lo que observamos:</p><ul class="evidence">${f.evidence.map((line) => html`<li class="mono">${line}</li>`)}</ul>` : null}
    </li>`,
    )}
  </ol>`
  }
</section>

<section id="evidencias">
  <h2>6. Evidencias y fuentes</h2>
  ${evidenceSources(input)}
</section>

<section id="limitaciones">
  <h2>7. Limitaciones de la medición</h2>
  <ul>${LIMITATIONS.map((text) => html`<li>${text}</li>`)}</ul>
</section>

<footer class="colophon">
  Informe generado por Visibility Platform · reglas ${audit.rulesVersion} · plantilla ${TEMPLATE_VERSION} · auditoría ${audit.id}
</footer>
</body>
</html>`;
  return document.toString();
}
