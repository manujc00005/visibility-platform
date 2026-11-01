# Implementation Plan: Tarjeta «Visibilidad en Google»: posicionamiento y salud técnica separados

## Summary

Un estado `empty` en el resumen de Search Console, una función pura que compone la tarjeta de Google desde Search Console (primero) y la auditoría técnica (aparte), una tabla única de etiquetas de estado para las tres tarjetas y la sección de Search Console vacía explicada. Cierra la fase A.2 del doc 19 y D-31.

## Related spec

`specs/features/014-google-card-ranking/SPEC.md`

## Impacted areas

- `src/modules/search-console/summary.ts` (estado `empty`, sin `cardLine`).
- `src/modules/overview/google.ts` (nuevo), `src/modules/overview/index.ts`.
- `src/app/workspaces/[id]/page.tsx` (`SeoCard`, etiquetas de rendimiento e IA).
- `src/components/search-console/search-console-section.tsx`.
- `src/i18n/messages/{es,en}.ts`.
- `specs/features/002-dashboard-overview/SPEC.md` (nota de sustitución).
- Pruebas: `tests/unit/search-console/{summary,section-render}.test.ts`, `tests/unit/overview/google.test.ts` (incluye las ramas en inglés), `tests/unit/i18n/messages.test.ts`.
- `docs/visibility-mvp/16-implementation-roadmap.md` (D-31, §8).

## Context budget

### Reading list

Spec 002 (tarjetas y estados), 003 D006/D007, doc 17 §3, `overview/seo.ts`, `search-console/summary.ts`, `SeoCard`, `analytics/summary.ts` (estado `empty` como modelo).

### Model routing

Implementación en esta sesión; revisión de solo lectura al final (frontend/QA y conformidad).

## Proposed approach

1. `summary.ts`: `empty` y retirada de `cardLine`; pruebas.
2. `overview/google.ts` con TDD: estados, avisos, bloque técnico, `en`.
3. Catálogos: `overview.states`, `cards.seo`, `searchConsole.status.empty`/`reasons.empty`; retirada de `card.*`.
4. `SeoCard`, `PerformanceCard`, `AiCard` sobre la tabla de estados.
5. `SearchConsoleSection` en `empty`; prueba de render.
6. Nota en la spec 002; navegador; roadmap; cierre.

## Alternatives considered

- Dos tarjetas (posicionamiento y salud técnica) en vez de una con bloque secundario: rompe la rejilla de tres y la navegación Resumen · Rendimiento · Google · IA. Rechazada.
- Un veredicto para clics (verde si suben): no hay objetivo ni umbral honesto; Codex y PRODUCT.md lo desaconsejan. Rechazada.
- Mantener `cardLine` y solo cambiar el pill: deja el titular técnico como cifra principal. Rechazada.

## Dependencies

Ninguna externa.

## Risks

- Capturas del doc 17 quedan desfasadas: se mencionan como históricas.
- Otras sesiones en catálogos: confirmar solo los fragmentos propios.
- La tarjeta crece en altura con dos bloques: comprobar 375 px y la alineación de las tres tarjetas.

## Test strategy

TDD sobre `summarizeGoogleCard` y `summarizeSearchConsole`. Render de la sección sin base. Suite completa por regresión. Navegador para AC-007.

## Rollback strategy

Revertir los commits. Sin migraciones ni cambios de datos.

## PLAN verification checklist

- [x] The plan covers all acceptance criteria.
- [x] The plan avoids behavior outside the spec.
- [x] The Context budget section is filled.
- [x] Risks are documented.
- [x] Test strategy is documented.
- [x] Rollback strategy is documented.
- [x] SPEC.md status has been updated to `Ready`.
