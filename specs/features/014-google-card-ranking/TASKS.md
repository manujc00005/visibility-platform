# Tasks: Tarjeta «Visibilidad en Google»: posicionamiento y salud técnica separados

## Phase 1: Preparation

- [x] T001 - Estado `empty` en `summarizeSearchConsole` y retirada de `cardLine`. Covers: AC-001. Verify: `tests/unit/search-console/summary.test.ts` en verde.

## Phase 2: Implementation

- [x] T002 - `summarizeGoogleCard` con pruebas. Covers: AC-002, AC-003, AC-004. Verify: `tests/unit/overview/google.test.ts` en verde.
- [x] T003 - Vocabulario `overview.states` y catálogos. Covers: AC-005. Verify: `messages.test.ts` y las ramas en inglés de `google.test.ts` en verde.
- [x] T004 - `SeoCard`, `PerformanceCard` y `AiCard`. Covers: AC-002, AC-005. Verify: typecheck.
- [x] T005 - `SearchConsoleSection` en `empty`. Covers: AC-006. Verify: `section-render.test.ts` en verde.
- [x] T006 - Nota de sustitución en la spec 002. Covers: AC-008.

## Phase 3: Tests

- [x] T007 - Navegador sobre `dev`: Olessium, clínica, 375 px. Covers: AC-007. Verify: registrar lo observado.
- [x] T008 - Suite completa y build. Covers: AC-009.

## Phase 4: Review

- [x] T009 - Revisiones de frontend/QA y conformidad; hallazgos corregidos.
- [x] T010 - Roadmap (D-31, §8) y cierre.

## Evidence

Fecha: 2026-11-01, en `dev` y en el navegador integrado (interfaz en inglés por la cookie de la sesión; el servidor de desarrollo del puerto 3000 ya estaba abierto).

- T001 (`8c1d5f2`): `summarizeSearchConsole` devuelve `empty` con ceros en los dos periodos y el motivo en `es` y `en`; una caída a cero con impresiones antes sigue siendo `ok` con «Antes: 8 clics (-100 %)». `cardLine` retirado; `totals` expuesto.
- T002 (`c1511f6`): `tests/unit/overview/google.test.ts`, 8 pruebas: cifras con cambio de clics, «Sin impresiones» con el veredicto técnico «Bien» solo en su bloque, pendiente / sin configurar / error con sus líneas, nota sin periodo anterior, severidad y «(parcial)» del bloque técnico, «Sin auditoría», avisos con origen («Posicionamiento · datos de hace 40 días», «Salud técnica · Actualizando…», «Salud técnica · datos de hace 35 días»), intento fallido con captura previa, inglés.
- T003: `overview.states` con ocho claves en los dos idiomas; `cards.ai.status` reducido a `analyzing` y `no_data`; `searchConsole.card.*` y `cards.seo.searchConsole` retirados; paridad de catálogos y llamadas representativas en `messages.test.ts`.
- T004: `SeoCard` sobre `summarizeGoogleCard`; rendimiento muestra «No medida» en `partial` y `not_configured`; IA toma «Medido», «Parcial», «Error», «Sin configurar» de la tabla. Typecheck en verde.
- T005: `section-render.test.ts` comprueba que en `empty` se pintan «Sin impresiones», el motivo, «Actualizar datos» y la propiedad, y no la rejilla, los segmentos, la nota de privacidad ni «Sin búsquedas».
- T006: notas de sustitución en la spec 002 (Desired behavior 3, AC-014, AC-016).
- T007 (navegador): Olessium muestra «Visibility on Google · No impressions · No impressions recorded in this period · Last 28 days: from 30 Sept 2026 to 27 Oct 2026» y debajo «Your site, as Google sees it · Good · 0 critical · 0 important · Same as in the previous audit», pie «Search Console · 30 Oct 2026, 19:38 · Technical audit · 28 Oct 2026, 10:27». La clínica muestra «No data · Rankings not measured yet · No data has been fetched from Search Console yet» y «Poor (partial) · 2 critical · 1 important» con la explicación parcial. La página «Google» de Olessium muestra la sección de Search Console «No impressions» con el motivo y la fuente, sin ceros ni tablas. A 375 px, `scrollWidth` igual a `clientWidth` (375) y la tarjeta legible con el bloque técnico completo.
- T008: lint (0 errores; el aviso de `es.ts` es anterior), typecheck, `npm run test:unit` (82 ficheros, 1.180 pruebas) y `npm run build` en verde. Integración: dos pasadas completas fallaron (21 y 60 pruebas) mientras otra sesión ejecutaba la misma suite desde el worktree `visibility-platform-a11y` contra la misma base `visibility_test` (D007; roadmap D-39); con la base libre, `search-console.test.ts` pasó solo (56) y la suite completa pasó entera a las 16:35: 14 ficheros, 266 pruebas, 241 s.
- T009: revisión de frontend/QA sin bloqueantes (dos huecos de pruebas y cinco menores) y revisión de conformidad «Pass con menores» (redacción de la SPEC); todo lo aplicado está en `4fd5512` y en D006.
- T010: roadmap (cabecera, D-31 resuelto, D-39 nuevo, §8); SPEC en Done.
