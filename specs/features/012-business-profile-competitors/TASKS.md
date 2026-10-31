# Tasks: Perfil de negocio y detección asistida de competidores

## Phase 1: Preparation

- [x] T001 - Migración 0015 y esquema de perfil, tipos y longitud de pregunta. Covers: AC-012. Verify: `npm run test:integration` con pruebas de restricciones nombradas y cascada en verde.

## Phase 2: Implementation

- [x] T002 - Enumeraciones, validación y guardado del perfil. Covers: AC-001. Verify: pruebas de validación y de integración de upsert en verde.
- [x] T003 - Propuesta desde la portada propia. Covers: AC-002, AC-003, AC-004. Verify: pruebas unitarias con fixtures y fetcher instrumentado en verde.
- [x] T004 - `discoveryPrompt`. Covers: AC-005. Verify: prueba de las cuatro relevancias y límite de 2.000 caracteres en verde.
- [x] T005 - Línea estructurada en `extract`. Covers: AC-006. Verify: `tests/unit/geo/competitors/extract.test.ts` en verde, con los casos de la 001 intactos.
- [x] T006 - Evaluación con perfil, tipos y orden. Covers: AC-007, AC-008. Verify: `tests/unit/geo/competitors/evaluate.test.ts` en verde, con los casos de la 001 intactos.
- [x] T007 - Servicio: contexto, huella, conflicto y aceptación con tipo. Covers: AC-009, AC-010. Verify: `tests/integration/competitor-suggestions.test.ts` en verde.
- [x] T008 - Acciones e interfaz de `/geo/setup`. Covers: AC-001, AC-002, AC-005, AC-010, AC-013. Verify: pruebas de render en `es` y `en` en verde.
- [x] T009 - Comparativa: tipo, enlace y aviso. Covers: AC-010, AC-011. Verify: pruebas de sección y resumen en verde.
- [x] T010 - BL-08 en el roadmap. Covers: Non-goals. Verify: `16-implementation-roadmap.md` lista la API de Claude con búsqueda web como pendiente.

## Phase 3: Tests

- [x] T011 - Migrar `dev`, comprobar la propuesta real de olessium.com. Covers: AC-014. Verify: registrar en este archivo la propuesta obtenida frente a lo que dice la portada.
- [x] T012 - Recorrido en navegador con empresa temporal y competidores reales. Covers: AC-013, AC-015. Verify: capturas o lecturas del DOM a 375 y 1280 px, comparativa con cifras reales y empresa temporal borrada.
- [x] T013 - Archivar «Competidor Ejemplo». Covers: AC-016. Verify: consulta de `geo_competitors` con `archived` y página SEO de Olessium pidiendo detectar competidores.
- [x] T014 - Suite completa. Covers: AC-017. Verify: `npm run check` y `npm run build` en verde.

## Phase 4: Review

- [x] T015 - Revisiones de spec, QA, base de datos, seguridad y frontend, con hallazgos corregidos. Covers: todos. Verify: sin críticos ni importantes abiertos.
- [ ] T016 - Cierre documental. Covers: todos. Verify: `/spec-close` ejecutado y estado sincronizado.
- [ ] T017 - Respuesta real de ChatGPT para Olessium. Covers: AC-018. Verify: el operador confirma los competidores en la aplicación y la comparativa los mide. Depende del operador.

## Evidence

Fecha: 2026-10-31, en `dev`.

- T011: la propuesta real de olessium.com da su meta description, `b2b`, `international` por `hreflang` `es` y `en`, y las seis capacidades de su portada entre 10 encabezados. «Potencial», «Transformación», «Valor» y «Descubrir» son ruido que el operador debe borrar. La propuesta no creó filas: `geo_business_profiles` siguió con 0.
- T012: empresa temporal `example.com`. Perfil guardado, pregunta completa, extracción de 4 candidatos con un directorio y un sustituto excluidos. Cyberclick e InboundCycle, encontrados en búsqueda web, aceptados con su tipo. Comparativa real en 36 s: rendimiento 100, 79 y 89; autoridad 9,09, 7,32 y 6,85. Sin scroll horizontal a 375 y 1280 px en `es` y `en`. Empresa temporal borrada. Esa respuesta se escribió para la prueba: no es de ChatGPT y no sirve para AC-018.
- T012 encontró D009: una portada real de 404 KB quedaba sin comprobar.
- T013: «Competidor Ejemplo» está `archived`. La página SEO de Olessium pide competidores reales y enlaza a detectarlos.
- T014: lint sin errores, typecheck y build en verde. Suite completa: 1.419 de 1.420, y la prueba restante se corrigió y se repitió en verde.
- T015: revisiones de seguridad, calidad y base de datos. 15 hallazgos corregidos; uno aceptado (D010).
