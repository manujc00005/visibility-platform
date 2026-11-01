# Tasks: Origen y estados de la medición en IA

## Phase 1: Preparation

- [ ] T001 - Columna `origin`, migración 0017 y prueba del `CHECK`. Covers: AC-001. Verify: `npm run test:integration` en verde con la prueba nueva.

## Phase 2: Implementation

- [ ] T002 - `createGeoRun` con `origin`. Covers: AC-002. Verify: prueba de integración en verde.
- [ ] T003 - `RunLike.origin`, filtro y `onlyNonReal` en `summarizeAi`; `runResultState`. Covers: AC-003, AC-006. Verify: `tests/unit/overview` en verde.
- [ ] T004 - `createReport` solo con runs reales. Covers: AC-004. Verify: `tests/integration/reports.test.ts` en verde.
- [ ] T005 - `fraction` sin porcentaje bajo 3. Covers: AC-008. Verify: `tests/unit/geo/i18n-en.test.ts` en verde.
- [ ] T006 - Interfaz: selector de origen, rótulos, pill y orden del detalle, tabla de comparación, título AEO, catálogos. Covers: AC-005, AC-007, AC-009, AC-010. Verify: typecheck y pruebas de catálogo en verde.

## Phase 3: Tests

- [ ] T007 - Migrar `dev`, reclasificar las dos runs y verificar en navegador. Covers: AC-011, AC-007. Verify: registrar aquí ids, `UPDATE` y lo observado.
- [ ] T008 - Suite completa. Covers: AC-012. Verify: `npm run check` y `npm run build`.

## Phase 4: Review

- [ ] T009 - Revisiones de base de datos, QA y conformidad; hallazgos corregidos. Covers: todos.
- [ ] T010 - Roadmap (D-23, §8) y cierre. Covers: todos.

## Evidence

(pendiente)
