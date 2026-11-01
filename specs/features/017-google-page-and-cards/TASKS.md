# Tasks: Página «Google» por preguntas, acciones con alcance y tarjetas compactas

## Phase 1: Implementation

- [x] T001 - `SearchConsoleQueries` y `/seo` en cuatro bloques con índice. Covers: AC-001, AC-002.
- [x] T002 - Botones con alcance y catálogos. Covers: AC-003.
- [x] T003 - Comparativa con cinco columnas y detalle. Covers: AC-004.
- [x] T004 - Tarjetas compactas y nota en la 002. Covers: AC-005, AC-008.
- [x] T005 - Pestaña «Configuración» y traslado de competidores. Covers: AC-006, AC-007.

## Phase 2: Tests

- [x] T006 - Navegador sobre `dev`. Covers: AC-009.
- [x] T007 - Suite completa y build. Covers: AC-010.

## Phase 3: Review

- [x] T008 - Revisiones de frontend/QA y conformidad; hallazgos corregidos.
- [x] T009 - Roadmap (§8) y cierre.

## Evidence

Fecha: 2026-11-01, en `dev` y en el navegador integrado, en los dos idiomas.

- T001 (`d9d3550`): `SearchConsoleSection` conserva cifras, avisos y fuente; `SearchConsoleQueries` lleva marca/sin marca, tablas y nota de privacidad, y no pinta nada sin cifras o en `empty` (`section-render.test.ts`). `/seo` con cuatro `h2`, índice de saltos y `#ranking-title`, `#bing-title`, `#analytics-title` intactos.
- T002 (`d9d3550`): «Analizar portada», «Sincronizar Search Console», «Sincronizar Bing», «Sincronizar Google Analytics», «Volver a comparar (consume PageSpeed)», «Medir preguntas en IA», y sus equivalentes en inglés; `overview.emptyAction` nombra el botón nuevo.
- T003 (`d9d3550`): tabla principal con Rendimiento, SEO, LCP real, Críticos y Autoridad; «Ver todas las métricas» con las once; detalle por fila una sola vez. `section-render.test.ts` de la comparativa separa tabla principal y completa.
- T004 (`d9d3550`): tarjetas sin descripción ni controles dentro (`querySelectorAll('a,button,details')` da 0 en las tres); visitantes reales, nota al pie y principal oportunidad fuera. Notas de sustitución en la 002 (Desired behavior 2 y 4, AC-012, AC-022).
- T005 (`7afd7cf`): pestaña «Configuración» con `aria-current` en `/edit`; `h2` Objetivo comercial, Competidores confirmados y Fuentes de datos. `CompetitorsPanel` en `/edit`; `/geo/setup` solo enlaza a él; la comparativa enlaza a `/edit#competitors`; `revalidateGeo` incluye `/edit`.
- T006 (navegador): en `/seo`, h2 «Search engine results», «Searches and pages», «Technical health», «Competitors» y sus equivalentes en español; dos `<details>` cerrados. En la clínica, alta de «Competidor temporal 017» desde Configuración («added») y baja: tras recargar, la lista solo tiene «Example Domain (prueba)»; el competidor temporal queda archivado en `dev`. Sin desbordamiento de página a 375 px en `/seo`, resumen y `/edit`; la primera tarjeta mide 340 px a 375 px. Encabezados: al bajar secciones a `h3`, los títulos de problema, Lighthouse y eventos clave pasan a `h4`.
- T006, completada tras la revisión de conformidad: a 1280 px, `scrollWidth` igual a 1280 en `/seo`, resumen y `/edit`, y las tres tarjetas miden 415 px. Detección en la clínica desde Configuración con una respuesta escrita para la prueba, no de ChatGPT («Rival Prueba Uno» en example.org y «Rival Prueba Dos» en example.net): «2 candidatos para revisar»; descartar el segundo lo retira; aceptar el primero lo añade a la lista y `/geo/setup` lo nombra en «Una medición nueva compara con»; después se archivó. Quedan en `dev` esa extracción, sus dos sugerencias y dos competidores archivados de la clínica, que es empresa de prueba.
- T007 (primera pasada): lint (0 errores; el aviso de `es.ts` es anterior), typecheck, `npm run test:unit` (86 ficheros, 1.205 pruebas), `npm run build` y `npm run test:integration` (15 ficheros, 275 pruebas, 22:05) en verde.
- T007 (pasada final, sobre `da29a8c`): lint (0 errores; el aviso de `es.ts` es anterior), typecheck, `npm run test:unit` (86 ficheros, 1.204 pruebas, una menos porque se retiraron las del dato sin lector y se añadieron las de la revisión), `npm run build` y `npm run test:integration` en solitario (15 ficheros, 275 pruebas, 22:21) en verde.
- T008: conformidad y frontend/QA; aplicado y descartado en D005 y en `da29a8c`.
- T009: roadmap corregido (cabecera, §8, seguimiento de D-31); SPEC en Done.
