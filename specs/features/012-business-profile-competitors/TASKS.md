# Tasks: Perfil de negocio y detección asistida de competidores

## Phase 1: Preparation

- [ ] T001 - Migración 0015 y esquema de perfil, tipos y longitud de pregunta. Covers: AC-012. Verify: `npm run test:integration` con pruebas de restricciones nombradas y cascada en verde.

## Phase 2: Implementation

- [ ] T002 - Enumeraciones, validación y guardado del perfil. Covers: AC-001. Verify: pruebas de validación y de integración de upsert en verde.
- [ ] T003 - Propuesta desde la portada propia. Covers: AC-002, AC-003, AC-004. Verify: pruebas unitarias con fixtures y fetcher instrumentado en verde.
- [ ] T004 - `discoveryPrompt`. Covers: AC-005. Verify: prueba de las cuatro relevancias y límite de 2.000 caracteres en verde.
- [ ] T005 - Línea estructurada en `extract`. Covers: AC-006. Verify: `tests/unit/geo/competitors/extract.test.ts` en verde, con los casos de la 001 intactos.
- [ ] T006 - Evaluación con perfil, tipos y orden. Covers: AC-007, AC-008. Verify: `tests/unit/geo/competitors/evaluate.test.ts` en verde, con los casos de la 001 intactos.
- [ ] T007 - Servicio: contexto, huella, conflicto y aceptación con tipo. Covers: AC-009, AC-010. Verify: `tests/integration/competitor-suggestions.test.ts` en verde.
- [ ] T008 - Acciones e interfaz de `/geo/setup`. Covers: AC-001, AC-002, AC-005, AC-010, AC-013. Verify: pruebas de render en `es` y `en` en verde.
- [ ] T009 - Comparativa: tipo, enlace y aviso. Covers: AC-010, AC-011. Verify: pruebas de sección y resumen en verde.
- [ ] T010 - BL-08 en el roadmap. Covers: Non-goals. Verify: `16-implementation-roadmap.md` lista la API de Claude con búsqueda web como pendiente.

## Phase 3: Tests

- [ ] T011 - Migrar `dev`, comprobar la propuesta real de olessium.com. Covers: AC-014. Verify: registrar en este archivo la propuesta obtenida frente a lo que dice la portada.
- [ ] T012 - Recorrido en navegador con empresa temporal y competidores reales. Covers: AC-013, AC-015. Verify: capturas o lecturas del DOM a 375 y 1280 px, comparativa con cifras reales y empresa temporal borrada.
- [ ] T013 - Archivar «Competidor Ejemplo». Covers: AC-016. Verify: consulta de `geo_competitors` con `archived` y página SEO de Olessium pidiendo detectar competidores.
- [ ] T014 - Suite completa. Covers: AC-017. Verify: `npm run check` y `npm run build` en verde.

## Phase 4: Review

- [ ] T015 - Revisiones de spec, QA, base de datos, seguridad y frontend, con hallazgos corregidos. Covers: todos. Verify: sin críticos ni importantes abiertos.
- [ ] T016 - Cierre documental. Covers: todos. Verify: `/spec-close` ejecutado y estado sincronizado.
- [ ] T017 - Respuesta real de ChatGPT para Olessium. Covers: AC-018. Verify: el operador confirma los competidores en la aplicación y la comparativa los mide. Depende del operador.
