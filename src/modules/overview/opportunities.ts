import type { AiSummary } from "@/modules/overview/ai";
import type { PerformanceSummary } from "@/modules/overview/performance";
import type { SeoSummary } from "@/modules/overview/seo";
import type { FindingLike } from "@/modules/overview/types";

/**
 * "Tus próximas oportunidades": up to three actions, each backed by a real finding or
 * measurement (FR-004). One per kind, highest priority first, stable order. Zero items is a
 * valid answer: the list is never filled with invented advice. `evidence` tells the view
 * which of the three empty/limited messages applies (AC-006).
 */
export type Priority = "high" | "medium" | "low";

export interface Opportunity {
  kind: string;
  priority: Priority;
  title: string;
  problem: string;
  why: string;
  action: string;
  evidence: string[];
  sourceLabel: string;
  measuredAt: Date;
  /** Path relative to the workspace, e.g. "/seo#finding-…". */
  href: string;
}

export interface OpportunityList {
  items: Opportunity[];
  /** none: nothing usable yet · partial: some block unmeasured or partial · complete: all three measured. */
  evidence: "none" | "partial" | "complete";
  /** Plain-words list of what is missing, for the "partial" message. */
  pending: string[];
}

export const MAX_OPPORTUNITIES = 3;
export const PRIORITY_LABELS: Record<Priority, string> = { high: "Prioridad alta", medium: "Prioridad media", low: "Prioridad baja" };
const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

const AUDIT_SOURCE = "Auditoría técnica de la portada";

type Candidate = Omit<Opportunity, "sourceLabel" | "measuredAt" | "href" | "problem" | "action" | "evidence">;

function candidateFor(f: FindingLike): Candidate | null {
  if (f.category === "performance") return null;
  if (f.ruleId.startsWith("canonical_")) {
    return f.severity === "info"
      ? null
      : {
          kind: "canonicals",
          priority: "medium",
          title: "Revisar la etiqueta canonical",
          why: "Indica a Google cuál es la versión principal de la página y evita que reparta su relevancia entre duplicados.",
        };
  }
  if (f.ruleId === "structured_data_missing") {
    return {
      kind: "structured_data",
      priority: "low",
      title: "Describir tu negocio con datos estructurados",
      why: "Ayudan a Google a entender tu nombre, dirección y teléfono. No garantizan aparecer en respuestas de IA.",
    };
  }
  const priority: Priority | null = f.severity === "critical" ? "high" : f.severity === "warning" ? "medium" : null;
  if (!priority) return null;
  switch (f.category) {
    case "access":
      return priority === "high"
        ? {
            kind: "access",
            priority,
            title: "Hacer que tu web cargue correctamente y de forma segura",
            why: "Si la portada no carga, da error o no usa HTTPS, ni Google ni tus clientes pueden usarla con confianza.",
          }
        : null;
    case "indexability":
      return {
        kind: "indexability",
        priority,
        title: "Corregir lo que impide indexar tu web",
        why: "Si Google no puede rastrear o indexar tu portada, la portada no puede aparecer en los resultados.",
      };
    case "metadata":
      return {
        kind: "metadata",
        priority,
        title: "Optimizar el título y la descripción",
        why: "Google los usa a menudo como texto del resultado: es lo que se lee de tu web antes de entrar.",
      };
    case "crawling":
      return f.ruleId.startsWith("sitemap_")
        ? { kind: "sitemap", priority, title: "Publicar o corregir el sitemap", why: "Ayuda a Google a descubrir todas tus páginas, no solo la portada." }
        : null;
    default:
      // Critical findings of any other area are still top priority.
      return priority === "high" ? { kind: `critical_${f.category}`, priority, title: f.title, why: "Es un problema crítico detectado en la auditoría." } : null;
  }
}

function speedOpportunity(perf: PerformanceSummary, findings: FindingLike[]): Opportunity | null {
  if (perf.score === null || perf.score >= 90 || !perf.measuredAt) return null;
  const top = findings.find((f) => f.category === "performance");
  return {
    kind: "speed",
    priority: perf.score < 50 ? "high" : "medium",
    title: "Mejorar la velocidad en móvil",
    problem: top?.title ?? `La portada obtiene ${perf.score}/100 de rendimiento en móvil.`,
    why: "La prueba de Google mide una carga lenta en móvil, y Google tiene en cuenta la experiencia de página.",
    action: top?.recommendation ?? "Optimiza las imágenes, reduce los scripts de terceros y mejora la respuesta del servidor.",
    evidence: [`Rendimiento móvil: ${perf.score}/100 (${perf.verdict.toLowerCase()})`, ...(top?.evidence.slice(0, 2) ?? [])],
    sourceLabel: "PageSpeed Insights · prueba de laboratorio en móvil",
    measuredAt: perf.measuredAt,
    href: "/performance",
  };
}

function aiOpportunity(ai: AiSummary): Opportunity | null {
  if (!ai.coverage || ai.coverage.n === 0 || ai.uncovered.length === 0 || !ai.measuredAt) return null;
  const n = ai.uncovered.length;
  return {
    kind: "ai_coverage",
    priority: "medium",
    title: "Revisar preguntas en las que la IA no te menciona",
    problem: `ChatGPT no te mencionó en ${n} de las ${ai.coverage.n} preguntas evaluadas.`,
    why: "Son preguntas monitorizadas para tu negocio y, en las respuestas recogidas, ChatGPT no nombró tu empresa.",
    action:
      "Revisa si tu web trata estos temas y si siguen siendo preguntas relevantes para tu negocio. No hemos analizado el contenido de tu web: la falta de mención no demuestra que falte contenido.",
    evidence: ai.uncovered.slice(0, 3).map((q) => `Sin mención: «${q}»`),
    sourceLabel: `Medición en ChatGPT · ${ai.provider ?? "proveedor desconocido"}`,
    measuredAt: ai.measuredAt,
    href: "/geo#aeo",
  };
}

function pendingOf(seo: SeoSummary, perf: PerformanceSummary, ai: AiSummary): string[] {
  const pending: string[] = [];
  if (seo.state === "partial") pending.push("La auditoría técnica no pudo leer la portada.");
  else if (seo.state !== "ok") pending.push("Aún no hay una auditoría técnica terminada.");
  if (perf.score === null) pending.push("La velocidad todavía no se ha medido.");
  if (ai.state === "not_configured") pending.push("La presencia en IA no está configurada.");
  else if (!ai.coverage) pending.push("Aún no hay una medición en IA terminada.");
  else if (ai.state !== "ok") pending.push("La medición en IA está incompleta.");
  return pending;
}

export function buildOpportunities(input: { findings: FindingLike[]; seo: SeoSummary; performance: PerformanceSummary; ai: AiSummary }): OpportunityList {
  const { findings, seo, performance, ai } = input;
  const candidates: Opportunity[] = [];
  if (seo.auditedAt) {
    for (const f of findings) {
      const c = candidateFor(f);
      if (c) {
        candidates.push({
          ...c,
          problem: f.title,
          action: f.recommendation,
          evidence: f.evidence.slice(0, 3),
          sourceLabel: AUDIT_SOURCE,
          measuredAt: seo.auditedAt,
          href: `/seo#finding-${f.id}`,
        });
      }
    }
  }
  const speed = speedOpportunity(performance, findings);
  if (speed) candidates.push(speed);
  const aiItem = aiOpportunity(ai);
  if (aiItem) candidates.push(aiItem);

  const seen = new Set<string>();
  const items = candidates
    .filter((c) => (seen.has(c.kind) ? false : (seen.add(c.kind), true)))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    .slice(0, MAX_OPPORTUNITIES);

  const anyResult = seo.auditedAt !== null || performance.score !== null || ai.coverage !== null;
  const pending = pendingOf(seo, performance, ai);
  return { items, evidence: !anyResult ? "none" : pending.length > 0 ? "partial" : "complete", pending };
}
