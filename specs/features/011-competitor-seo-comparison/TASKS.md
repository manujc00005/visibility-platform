# Tasks: Comparativa técnica y de autoridad con competidores

Plan creado el 2026-10-31. Las pruebas y capturas se registran en esta lista al ejecutarse; no son evidencia antes.

## Phase 1: Dominio y datos

- [ ] T001 - Implementar `sites.ts`: tipos versionados, `selectSites`, `toSiteResult` campo a campo y `parseComparison`. Covers: AC-001, AC-008. Verify: `npx vitest run --project unit tests/unit/competitor-comparison/sites.test.ts` con código 0, con deduplicación, dominio propio repetido, competidor sin web, tope de 6 sitios y un fixture cuyo título, descripción, URL y mensajes de fallo no aparecen en `JSON.stringify` del resultado.
- [ ] T002 - Añadir `OPEN_PAGERANK_API_KEY` y `open-pagerank.ts` según D003 y D004. Covers: AC-004, AC-005. Verify: `npx vitest run --project unit tests/unit/competitor-comparison/open-pagerank.test.ts` con código 0: cuerpo exacto con `include_history: false`, una sola petición, sin clave, 401, 403 `address_error`, 429 con ambos tipos, 5xx, timeout, forma inválida, `found: false` con campos ausentes y subdominio emparejado; ningún resultado contiene la clave.
- [ ] T003 - Crear `schema.ts`, exportarlo y generar la migración, confirmando antes que `0014` siga libre. Covers: AC-012. Verify: `npm run db:generate` deja un SQL solo aditivo y `npx vitest run --project integration tests/integration/competitor-comparison.test.ts -t 'schema'` con código 0: forma inválida rechazada con 23514 y restricción nombrada, segunda fila `running` con 23505, y cascada al borrar la empresa.

## Phase 2: Captura y proyección

- [ ] T004 - Implementar `service.ts` y `deps.ts`: requisitos, lista congelada, fila `running`, 3 trabajadores, autoridad, cierre y capturas colgadas. Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007. Verify: `npx vitest run --project integration tests/integration/competitor-comparison.test.ts -t 'capture'` con código 0, usando `collectAuditFacts` real con dobles de red; incluye promesa retenida con cambio de competidores y empresa borrada, `workspaceId` no válido sin crear fila, y comprueba que `audits` y `audit_findings` siguen vacías.
- [ ] T005 - Implementar `summary.ts`: estados de sección, fila y fuente, última completada, captura en curso, fallo posterior, archivados, nuevos, dominio cambiado, `scope` mixto y `sites` ilegible. Covers: AC-009, AC-010, AC-013. Verify: `npx vitest run --project unit tests/unit/competitor-comparison/summary.test.ts` con código 0, con un caso por estado de FR-012 y uno por cada situación de AC-009 y AC-013.

## Phase 3: Interfaz

- [ ] T006 - Añadir Server Action, botón con pendiente, sección, tabla de D008, enlace a la gestión de competidores en la página GEO, integración en `seo/page.tsx` y textos `es` y `en`, con sus llamadas representativas en `messages.test.ts`. Covers: AC-010, AC-011, AC-013, AC-014. Verify: `npm run typecheck` y `npx vitest run --project unit tests/unit/competitor-comparison tests/unit/i18n/messages.test.ts` con código 0. El render en ambos idiomas comprueba cada motivo con `colSpan`, ausencia de ceros, fila de la empresa marcada, sin ganadores, `<script>` literal, marca de `scope`, fecha, estrategia, periodo, frase de contexto y las tres fuentes.
- [ ] T007 - Verificar en navegador con 6 sitios `[TEST]` en la base de pruebas, que se borran después. Covers: AC-015. Verify: quien implementa mide en el navegador `scrollWidth` y `clientWidth` de página y sección a 375 px en `es` y `en`, y a 1280 px, con dominios largos, y registra aquí las cifras y que no quedan filas `[TEST]`.

## Phase 4: Regresión, evidencia y revisión

- [ ] T008 - Completar la regresión y las pruebas que falten de la matriz de fallos y la concurrencia. Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-012. Verify: `npm run test:unit` y `npm run test:integration` con código 0 sobre la revisión registrada, y una mutación que quite el mapeo campo a campo o el filtro de `status = 'running'` hace fallar al menos una prueba.
- [ ] T009 - Hacer la captura real y las revisiones, y actualizar el roadmap y BL-07. Covers: AC-016, AC-017. Verify: registrar códigos 0 de `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:integration` y `npm run build` sobre una revisión identificada; registrar fecha, sitios, duración y cifras de AC-016 con la tolerancia de D009, sin claves; registrar la forma real de un dominio no encontrado o dejar la parte de autoridad abierta si no hay cuenta; hacer revisiones de seguridad, dominio y conformidad, con sus correcciones aplicadas.
