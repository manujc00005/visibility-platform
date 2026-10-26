import type { Fraction } from "@/modules/geo/metrics";

/** Plain module (no "use client"): importable from server and client components alike. */
export const INTENT_LABELS = {
  discovery: "Descubrimiento",
  recommendation: "Recomendación",
  comparison: "Comparación",
  branded: "Sobre tu marca",
} as const;

export const RUN_STATUS_LABELS = { collecting: "Recogiendo respuestas", completed: "Completada" } as const;
export const OBSERVATION_STATUS_LABELS = {
  pending: "Pendiente",
  submitted: "Enviada al proveedor",
  completed: "Recogida",
  failed: "Fallida",
  uncertain: "Envío incierto",
} as const;
export const PROVIDER_LABELS = { manual: "Captura asistida (ChatGPT web)", dataforseo_chatgpt: "DataForSEO · ChatGPT (interfaz)" } as const;

/** "3 de 8" plus a percentage only when there is a denominator. Never "0 %" for "no data". */
export function fraction(value: Fraction): string {
  if (value.n === 0) return "Sin datos";
  return `${value.k} de ${value.n} (${Math.round((value.k / value.n) * 100)} %)`;
}
