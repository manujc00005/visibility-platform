# Tasks: Cambios de posición por búsqueda en Search Console

## Phase 1: Recogida

- [ ] T001 - `QueryRow.previous`, consulta del periodo anterior en el `Promise.all` y emparejado exacto con `Map`. Covers: AC-001, AC-002, AC-005, AC-007. Verify: `npx vitest run tests/unit/search-console/collect.test.ts` en verde con: once peticiones; la nueva con periodo anterior, `dimensions: ["query"]` y `rowLimit: 1000`; las ocho previas con el cuerpo idéntico como cadena; las nueve iniciadas antes de resolver ninguna; `previous` con cifras o `null`; búsqueda de más de 200 caracteres emparejada por su texto completo; textos que solo difieren en mayúsculas sin emparejar; primera fila ante un texto repetido; 403 con y sin API desactivada, 429 y 500 en la consulta nueva dan su motivo sin secretos en el resultado.
- [ ] T002 - Persistencia comprobada contra la base. Covers: AC-001, AC-007. Verify: `npm run test:integration -- search-console` en verde con: `previous` con cifras y `null` guardados y leídos igual; fila sin la clave leída sin ella; 403, 429 y 500 en la consulta nueva dejan una sola fila `failed` sin secretos; el último éxito sigue disponible.

## Phase 2: Resumen, textos y tabla

- [ ] T003 - `queryPositionChange` y proyección de `positionChange` con o sin `segments`, con sus textos en `es` y `en`. Covers: AC-003, AC-004, AC-009. Verify: `npx vitest run tests/unit/search-console/summary.test.ts tests/unit/i18n/messages.test.ts` en verde con: 8,0 frente a 12,0 da `better` y «Sube 4,0»; 12,0 frente a 8,0 da `worse` y «Baja 4,0»; 8,3 frente a 8,0 da `same` e «Igual»; diferencia de exactamente 0,5 da cambio; `previous: null` da `same` y «Sin dato anterior»; clave ausente da `null`; `branded` igual que antes con y sin `segments`; textos de la posición global sin cambios.
- [ ] T004 - Cambio bajo la posición, frase de captura antigua y nota ampliada en la sección. Covers: AC-006, AC-008, AC-009. Verify: `npx vitest run tests/unit/search-console/section-render.test.ts` en verde con: mismas cinco columnas; cuatro textos de cambio; tabla de páginas sin cambio; etiqueta «marca» y cambio en la misma fila; frase de actualizar con botón, de configurar sin él y ninguna sin filas; `<script>` como texto; las frases previas de la nota intactas; inglés.

## Phase 3: Verificación

- [ ] T005 - Lint, typecheck, unitarias, integración y build sobre el árbol commiteado. Covers: AC-010. Verify: en un worktree desechable del último commit, `npm run lint`, `npm run typecheck`, `npm test` y `npm run build` sin errores, con los totales apuntados aquí; las pruebas previas solo cambian para añadir campos y el recuento de peticiones.
- [ ] T006 - Captura real y maquetación. Covers: AC-011. Verify: «Actualizar datos» de Search Console en Olessium deja una fila `completed` en `dev` o un motivo accionable, apuntado en DECISIONS; con una fila sintética borrada después por su id, a 375 px en `es` y `en`, `scrollWidth` igual a `clientWidth` en la página y en el contenedor de la tabla, con los cuatro textos visibles; sin errores nuevos en el registro del servidor.
- [ ] T007 - Revisiones independientes y `/spec-review`. Covers: AC-007, AC-008, AC-010. Verify: informes de seguridad, dominio y conformidad sin hallazgos críticos o altos sin resolver; los aceptados en DECISIONS con su motivo; `/spec-review` Pass sobre el árbol final.

## Follow-ups

- Cuando olessium.com tenga impresiones: repetir la captura y comparar la posición de varias búsquedas en los dos periodos con la interfaz de Search Console, y confirmar que el texto de una búsqueda coincide entre periodos.
