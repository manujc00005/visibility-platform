# Tasks: Cambios de posición por búsqueda en Search Console

## Phase 1: Recogida

- [x] T001 - `QueryRow.previous`, consulta del periodo anterior en el `Promise.all` y emparejado exacto con `Map`. Covers: AC-001, AC-002, AC-005, AC-007. Verify: `npx vitest run tests/unit/search-console/collect.test.ts` en verde con: once peticiones; la nueva con periodo anterior, `dimensions: ["query"]` y `rowLimit: 1000`; las ocho previas con el cuerpo idéntico como cadena; las nueve iniciadas antes de resolver ninguna; `previous` con cifras o `null`; búsqueda de más de 200 caracteres emparejada por su texto completo; textos que solo difieren en mayúsculas sin emparejar; primera fila ante un texto repetido; 403 con y sin API desactivada, 429 y 500 en la consulta nueva dan su motivo sin secretos en el resultado.
  - Hecho 2026-10-30: `previous?: Totals | null` en `QueryRow` (opcional para distinguir las capturas antiguas), `PREVIOUS_QUERIES` y novena consulta en el `Promise.all`. 9 pruebas nuevas; las previas solo cambian el recuento de peticiones y de consultas paralelas. 28 en `collect.test.ts`.
- [x] T002 - Persistencia comprobada contra la base. Covers: AC-001, AC-007. Verify: `npm run test:integration -- search-console` en verde con: `previous` con cifras y `null` guardados y leídos igual; fila sin la clave leída sin ella; 403, 429 y 500 en la consulta nueva dejan una sola fila `failed` sin secretos; el último éxito sigue disponible.
  - Hecho 2026-10-30: sin cambios en `schema.ts` ni en `service.ts`; 7 pruebas nuevas de integración, 41 en el archivo, en verde contra `test`.

## Phase 2: Resumen, textos y tabla

- [x] T003 - `queryPositionChange` y proyección de `positionChange` con o sin `segments`, con sus textos en `es` y `en`. Covers: AC-003, AC-004, AC-009. Verify: `npx vitest run tests/unit/search-console/summary.test.ts tests/unit/i18n/messages.test.ts` en verde con: 8,0 frente a 12,0 da `better` y «Sube 4,0»; 12,0 frente a 8,0 da `worse` y «Baja 4,0»; 8,3 frente a 8,0 da `same` e «Igual»; diferencia de exactamente 0,5 da cambio; `previous: null` da `same` y «Sin dato anterior»; clave ausente da `null`; `branded` igual que antes con y sin `segments`; textos de la posición global sin cambios.
  - Hecho 2026-10-30: `queryPositionChange` y `projected` en `summary.ts`, que sustituye a `labelled`; claves `changes.query*` en `es` y `en`. 6 pruebas nuevas; el texto de la posición global queda fijado por una prueba de regresión.
- [x] T004 - Cambio bajo la posición, frase de captura antigua y nota ampliada en la sección. Covers: AC-006, AC-008, AC-009. Verify: `npx vitest run tests/unit/search-console/section-render.test.ts` en verde con: mismas cinco columnas; cuatro textos de cambio; tabla de páginas sin cambio; etiqueta «marca» y cambio en la misma fila; frase de actualizar con botón, de configurar sin él y ninguna sin filas; `<script>` como texto; las frases previas de la nota intactas; inglés.
  - Hecho 2026-10-30: `Row.change` opcional, `ChangeLine` bajo la posición, frase de captura antigua y nota ampliada. 8 pruebas nuevas; 216 entre `tests/unit/search-console` y `tests/unit/i18n`, y lint limpio.

## Phase 3: Verificación

- [ ] T005 - Lint, typecheck, unitarias, integración y build sobre el árbol commiteado. Covers: AC-010. Verify: en un worktree desechable del último commit, `npm run lint`, `npm run typecheck`, `npm test` y `npm run build` sin errores, con los totales apuntados aquí; las pruebas previas solo cambian para añadir campos y el recuento de peticiones.
- [x] T006 - Captura real y maquetación. Covers: AC-011. Verify: «Actualizar datos» de Search Console en Olessium deja una fila `completed` en `dev` o un motivo accionable, apuntado en DECISIONS; con una fila sintética borrada después por su id, a 375 px en `es` y `en`, `scrollWidth` igual a `clientWidth` en la página y en el contenedor de la tabla, con los cuatro textos visibles; sin errores nuevos en el registro del servidor.
  - Hecho 2026-10-30 (D005): captura real `completed`, con 11 llamadas sin error y todo a cero. Con la fila sintética, el primer intento falló AC-011: bajo la posición, la tabla medía 386 px en 341 y escondía esa columna. Se corrigió con el cambio bajo la búsqueda en móvil y menos relleno lateral (D004). Quedó 341 de 341 px en `es` y `en`, con «Sube», «Baja», «Igual» y «Sin dato anterior» visibles; a 1024 px el cambio va bajo la posición. La fila sintética se borró por su id; Olessium vuelve a sus capturas reales.
- [x] T007 - Revisiones independientes y `/spec-review`. Covers: AC-007, AC-008, AC-010. Verify: informes de seguridad, dominio y conformidad sin hallazgos críticos o altos sin resolver; los aceptados en DECISIONS con su motivo; `/spec-review` Pass sobre el árbol final.
  - Hecho 2026-10-30 con tres revisiones independientes y D006:
    - **Seguridad:** sin críticos, altos ni medios; dos bajos anteriores a esta feature.
    - **Dominio:** sin críticos ni altos; un medio, la nota que en móvil ya no era exacta.
    - **Conformidad:** sin defectos de comportamiento; pidió evidencia más fuerte en AC-002, AC-004, AC-006, AC-007 y AC-011, y alinear documentos.
  - Resultado de las correcciones: 224 pruebas en `tests/unit/search-console` y `tests/unit/i18n`, y 44 de integración de Search Console, en verde, con lint limpio.

## Phase 4: Cierre

- [ ] T008 - Roadmap con la entrada de la 009 y sus seguimientos. Covers: AC-010. Verify: `docs/visibility-mvp/16-implementation-roadmap.md` tiene el apartado de la spec, D-34 y D-35, y `git diff` no toca nada más.

## Follow-ups

- Cuando olessium.com tenga impresiones: repetir la captura y comparar la posición de varias búsquedas en los dos periodos con la interfaz de Search Console, y confirmar que el texto de una búsqueda coincide entre periodos.
