# Feature Spec: Categorías SEO, accesibilidad y buenas prácticas de Lighthouse

## Status

In Progress (2026-10-28).

## Problem

La auditoría pide a PageSpeed Insights solo la categoría «rendimiento». La misma llamada gratuita puede devolver las puntuaciones de Lighthouse para SEO, accesibilidad y buenas prácticas, con las comprobaciones que fallan.

## Goal

Cada auditoría nueva guarda la puntuación de 0 a 100 de esas tres categorías y la lista de comprobaciones que fallan. La pestaña Google muestra SEO; la pestaña Rendimiento muestra accesibilidad y buenas prácticas.

## Non-goals

- Convertir las comprobaciones de Lighthouse en hallazgos propios, cambiar `RULES_VERSION` o las cifras de problemas.
- Tocar las tarjetas del resumen, las oportunidades o el informe PDF.
- Ejecutar Lighthouse por escritorio o en más páginas.
- Recalcular auditorías antiguas.

## Functional requirements

- FR-001 La llamada a PageSpeed pide `performance`, `seo`, `accessibility` y `best-practices` en una sola petición, con `locale=es`. La puntuación de rendimiento y sus métricas no cambian.
- FR-002 Por categoría se guarda: puntuación 0–100 o nula, comprobaciones puntuadas, comprobaciones que fallan y, de estas, hasta 15 con `id` y título.
- FR-003 Una comprobación puntuada es la de modo `binary`, `numeric` o `metricSavings` con peso mayor que 0 en la categoría (D006). Falla si su puntuación es menor que 0,9, el umbral de aprobado de Lighthouse. Se ordenan por peso en la categoría, de más a menos, y después por `id`.
- FR-004 Los títulos son texto de Lighthouse en español, saneados y recortados a 200 caracteres, y se pintan como texto, sin los acentos graves de su markdown (D006). En la interfaz inglesa se avisa de que están en su español original.
- FR-005 Colores y veredicto con los umbrales existentes de la puntuación: bueno ≥ 90, mejorable ≥ 50, malo < 50.
- FR-006 Estados sin puntuación: sin auditoría; auditoría anterior a esta comprobación («no medido en esta auditoría»); PageSpeed no ejecutado o con error en esa auditoría; categoría sin comprobaciones puntuadas.

## Data model changes

Ninguna migración: `audits.facts` es JSON. `PerformanceResult` gana `categories` y `textLocale` opcionales; las auditorías antiguas no los tienen.

## Acceptance criteria

- AC-001 Una auditoría nueva guarda las tres categorías cuando PageSpeed responde.
- AC-002 La pestaña Google muestra la puntuación SEO y sus fallos; Rendimiento, accesibilidad y buenas prácticas.
- AC-003 Una auditoría antigua muestra «no medido», nunca un cero.
- AC-004 Ambos idiomas; lint, typecheck y pruebas en verde.

## Assumptions

- PageSpeed devuelve las cuatro categorías en una ejecución, sin coste extra. La duración de la llamada puede subir unos segundos; el límite de 60 s se mantiene e incluye el reintento (D006).
- La clave `PAGESPEED_API_KEY` rechazada por Google el 2026-10-28 se sustituyó el mismo día, y la verificación real se hizo con la nueva (T006).
