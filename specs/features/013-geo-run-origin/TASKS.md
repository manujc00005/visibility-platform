# Tasks: Origen y estados de la medición en IA

## Phase 1: Preparation

- [x] T001 - Columna `origin`, migración 0017 y prueba del `CHECK`. Covers: AC-001. Verify: `npm run test:integration` en verde con la prueba nueva.

## Phase 2: Implementation

- [x] T002 - `createGeoRun` con `origin`. Covers: AC-002. Verify: prueba de integración en verde.
- [x] T003 - `RunLike.origin`, filtro y `onlyNonReal` en `summarizeAi`; `runResultState`. Covers: AC-003, AC-006. Verify: `tests/unit/overview` en verde.
- [x] T004 - `createReport` solo con runs reales. Covers: AC-004. Verify: `tests/integration/reports.test.ts` en verde.
- [x] T005 - `fraction` sin porcentaje bajo 3. Covers: AC-008. Verify: `tests/unit/geo/i18n-en.test.ts` en verde.
- [x] T006 - Interfaz: selector de origen, rótulos, pill y orden del detalle, tabla de comparación, título AEO, catálogos. Covers: AC-005, AC-007, AC-009, AC-010. Verify: typecheck y pruebas de catálogo en verde.

## Phase 3: Tests

- [x] T007 - Migrar `dev`, reclasificar las dos runs y verificar en navegador. Covers: AC-011, AC-007. Verify: registrar aquí ids, `UPDATE` y lo observado.
- [x] T008 - Suite completa. Covers: AC-012. Verify: `npm run check` y `npm run build`.

## Phase 4: Review

- [x] T009 - Revisiones de base de datos, QA y conformidad; hallazgos corregidos. Covers: todos.
- [x] T010 - Roadmap (D-23, §8) y cierre. Covers: todos.

## Evidence

Fecha: 2026-11-01, en `dev` (rama Neon) y en el navegador integrado, interfaz en inglés por la cookie de la sesión.

- T001: migración `0017_geo_run_origin` generada con drizzle-kit (columna `origin` por defecto `real` y `CHECK geo_runs_origin_valid`). La prueba de integración confirma que un `UPDATE` a `fake` falla con esa restricción nombrada.
- T002: `createGeoRun` guarda `demo` cuando se pide, `real` sin origen, rechaza `fake` con `validation` sin crear fila, y la `methodologyKey` es igual con y sin origen (D001).
- T003: `summarizeAi` con solo una demo evaluada da `no_data`, `coverage` nulo, sin intento y la frase de `onlyNonReal`; una real antigua con una demo nueva mantiene la real sin intento; real → demo → real compara las dos reales. `runResultState` da las mismas palabras que el resumen en `es` y `en` (D005).
- T004: un informe con solo una medición `test` no lleva `geoRunId` ni la sección de IA; con una real además, elige la real.
- T005: `fraction` da «1 de 1», «1 of 2» y «2 de 3 (67 %)» (D004).
- T006: typecheck en verde; el catálogo `es`/`en` mantiene la paridad y las funciones nuevas tienen llamadas representativas en `messages.test.ts`.
- T007: migración aplicada en `dev` con `npm run db:migrate`. Reclasificación por id, reversible con el `UPDATE` inverso:
  `update geo_runs set origin = 'test' where id = '0361e4ad-1829-46b6-aef0-c22a03b95081'` (Olessium, «[RESPUESTA DE PRUEBA]», 2026-10-25) y
  `update geo_runs set origin = 'demo' where id = '3709cad2-3a22-4484-b5bc-e874d9957627'` (Buchhandlung Müller, «[PRUEBA]», 2026-10-26).
  Observado después, con el servidor de desarrollo que ya corría en el puerto 3000:
  - Resumen de Olessium: tarjeta de IA «No measurements · Not measured yet · There are only demo or test measurements: they do not count as a result.»; ninguna mención ni cita; oportunidades sin medición de IA.
  - Página de IA de Olessium: estado vacío con esa frase y «3 questions ready»; histórico con «Assisted capture · Completed · Internal test».
  - Detalle `0361e4ad…`: aviso «Internal test measurement: it does not count…», pill «Partial» con «Partial result: 1 question got no valid answer.» (la misma frase que daba el resumen antes de reclasificarla), tarjetas en el orden presencia → menciona → cita → válidas «2 of 3 (67%)» → recogidas «3 of 3 (100%)», «1 of 1» sin porcentaje, y la comparación con «2 mentions in 1 answer… in this measurement» y columna «Proportion».
  - Resumen de Buchhandlung Müller: IA «Not set up · No questions» con la frase de solo demostración.
- T008: `npm run lint` (0 errores; un aviso anterior en `es.ts:893` ajeno a esta spec), `npm run typecheck`, `npm run test:unit` (81 ficheros, 1.165 pruebas), `npm run test:integration` (14 ficheros, 266 pruebas) y `npm run build` en verde. La primera pasada completa de integración falló en 93 pruebas de 11 ficheros al preparar empresas y auditorías, sin relación con el cambio; la repetición inmediata pasó entera y los dos ficheros tocados pasan también por separado. Queda anotado junto a D-24 como intermitencia de la suite sobre Neon.
- T009: revisión de seguridad sin hallazgos (D006). Revisión de conformidad «Pass con menores»: corregidos en D007 (literal de FR-003, aserciones de `fraction` en ambos idiomas, prueba de etiquetas de origen y del aviso del detalle). AC-009: en el detalle observado las proporciones son 50 % y 50 %; AC-010: títulos en `es` y `en` por paridad de catálogo y observación en navegador.
- T010: roadmap 16 actualizado (cabecera, D-23 resuelto, §8); SPEC en Done.
