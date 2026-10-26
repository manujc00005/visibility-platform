import type { FetchLogEntry } from "@/modules/audits/fetcher/safe-fetch";
import type { FieldDataStatus } from "@/modules/audits/crux";
import type { PerformanceStatus } from "@/modules/audits/pagespeed";
import type { Category, Severity } from "@/modules/audits/rules";

export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "Crítico",
  warning: "Importante",
  info: "Mejora",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  access: "Acceso",
  indexability: "Indexación",
  metadata: "Metadatos",
  headings: "Encabezados",
  crawling: "Rastreo",
  links: "Enlaces",
  structured_data: "Datos estructurados",
  social: "Redes sociales",
  mobile: "Móvil",
  performance: "Rendimiento",
};

export const AUDIT_STATUS_LABELS = { running: "En curso", completed: "Completada", failed: "Fallida" } as const;

export const PERFORMANCE_STATUS_MESSAGES: Record<Exclude<PerformanceStatus, "ok">, string> = {
  not_configured:
    "No configurado: falta la clave de PageSpeed Insights (PAGESPEED_API_KEY). La auditoría no inventa cifras de velocidad.",
  quota_exceeded: "No disponible: la cuota diaria de PageSpeed Insights está agotada. Repite la auditoría más tarde.",
  error: "No se pudo medir el rendimiento en esta auditoría.",
  skipped: "No se midió porque la página principal no se pudo leer.",
};

export const FIELD_DATA_STATUS_MESSAGES: Record<Exclude<FieldDataStatus, "ok">, string> = {
  no_data:
    "Sin datos: la web no tiene suficientes visitas de Chrome en móvil para que Google publique datos reales. Es habitual en webs pequeñas.",
  not_configured: "No configurado: falta la clave de la API Chrome UX Report (CRUX_API_KEY o PAGESPEED_API_KEY con esa API habilitada).",
  quota_exceeded: "No disponible: la cuota de la API de CrUX está agotada. Repite la auditoría más tarde.",
  error: "No se pudieron consultar los datos reales en esta auditoría.",
  skipped: "No se consultó porque la página principal no se pudo leer.",
};

export const OUTCOME_LABELS: Record<FetchLogEntry["outcome"], string> = {
  ok: "Correcta",
  redirect: "Redirección",
  invalid_url: "URL no válida",
  blocked_destination: "Destino bloqueado",
  dns: "DNS",
  network: "Red",
  timeout: "Tiempo agotado",
  too_many_redirects: "Demasiadas redirecciones",
  too_large: "Demasiado grande",
  unsupported_encoding: "Codificación",
  budget_exhausted: "Límite alcanzado",
};

export function formatMs(value: number | null): string {
  if (value === null) return "—";
  return value >= 1000 ? `${(value / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} s` : `${Math.round(value)} ms`;
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toLocaleString("es-ES", { maximumFractionDigits: 1 })} KB`;
  return `${(value / 1024 / 1024).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB`;
}
