# Implementation Plan: Cambios de posición por búsqueda en Search Console

## Summary

La recogida añade una consulta del periodo anterior con la dimensión `query` y empareja las 25 búsquedas principales por texto exacto. Cada fila guarda sus cifras anteriores dentro de `queries`. El resumen calcula el cambio y la tabla lo pinta bajo la posición, o bajo la búsqueda en móvil (D004). Sin migración, sin proveedor nuevo y sin dependencias.

## Related spec

`specs/features/009-query-position-changes/SPEC.md`.

## Impacted areas

| Archivo | Cambio |
|---|---|
| `src/modules/search-console/collect.ts` | `QueryRow.previous`, `PREVIOUS_QUERIES`, consulta nueva en el `Promise.all` y emparejado con `Map` |
| `src/modules/search-console/summary.ts` | `QueryView.positionChange`, `queryPositionChange` y proyección con o sin `segments` |
| `src/components/search-console/search-console-section.tsx` | Cambio bajo la posición o bajo la búsqueda en móvil, frase de captura antigua y menos relleno lateral en móvil en las dos tablas |
| `src/i18n/messages/es.ts`, `en.ts`, `tests/unit/i18n/messages.test.ts` | Textos del cambio, frases y nota ampliada |
| `tests/unit/search-console/{collect,summary,section-render}.test.ts`, `tests/integration/search-console.test.ts` | Pruebas |

No cambian: `google.ts`, `schema.ts`, `service.ts`, migraciones, el contenido de la tabla de páginas, la tarjeta del resumen, Bing, GA4 ni el informe PDF.

## Context budget

### Reading list

- `specs/features/009-query-position-changes/*`.
- `src/modules/search-console/{collect,summary}.ts`, `src/components/search-console/search-console-section.tsx`, `src/components/overview/overview-card.tsx` (`ChangeLine`).
- Namespace `searchConsole` de `src/i18n/messages/{es,en}.ts`.
- `tests/unit/search-console/*`, `tests/integration/search-console.test.ts`.

### Model routing

- T001 (emparejado y consulta paralela) y T003 (estados del cambio): modelo de razonamiento; los casos ausente, `null` y `Totals` son la pieza delicada.
- T002 y T004: trabajo mecánico que sigue el patrón de la 007.
- Revisiones de cierre (T007) con agentes independientes: seguridad, dominio y conformidad.

## Proposed approach

1. **`collect.ts`.** `QueryRow` gana `previous?: Totals | null`. Se añade una novena consulta al `Promise.all` con `{ ...range(previous), dimensions: ["query"], rowLimit: PREVIOUS_QUERIES }`. Un `Map` por `keys[0]` conserva la primera fila de cada texto. Cada fila actual busca su texto completo, antes de recortar a 200.
2. **`summary.ts`.** `queryPositionChange(row, t, f)` devuelve `null` si la clave `previous` falta, «Sin dato anterior» con `same` si es `null`, y si no aplica el umbral `POSITION_SAME` con el texto corto. `queries` se proyecta siempre con `positionChange`, y `branded` solo con `segments`.
3. **Sección.** `Row` gana `change?: Change | null`. La celda de posición pinta `ChangeLine` desde `sm`, y la de la búsqueda en móvil. Bajo la tabla, la frase de captura antigua si hay filas y ninguna tiene `positionChange`.
4. **Catálogos** `es`/`en`: `changes.queryUp`, `queryDown`, `querySame`, `queryNoPrevious`, las dos frases de captura antigua y la nota ampliada.

## Alternatives considered

- Columna aparte para las cifras anteriores: D001.
- Filtrar por las 25 búsquedas: D002.
- Etiqueta «Nueva»: D003.
- Columna «Cambio» en la tabla: D004.

## Dependencies

- Ninguna librería nueva.
- Para T006, la cuenta de servicio real con acceso a `sc-domain:olessium.com`.
- Archivos compartidos con la 004 sin commitear (`es.ts`, `en.ts`, `messages.test.ts`): al commitear se separa solo lo de la 009, como en la 007 y la 008.

## Risks

- **Texto de búsqueda distinto entre periodos:** el emparejado es exacto, sin datos reales que lo confirmen. Si no coincide, la fila dice «Sin dato anterior», que es falso solo por omisión, no inventa nada.
- **Respuesta mayor:** hasta 1000 filas validadas con Zod en cada captura. Es acotado y solo se guardan 25.
- **Una llamada más que puede hacer fallar la captura entera:** FR-010 lo acepta, como en la 007.
- **Acción sin autenticación** (D-03): una llamada más por clic.

## Test strategy

- Unitarias con `fetch` falso: recogida, resumen, render y catálogos.
- Integración contra `test`: guardar y leer `previous`, fila sin la clave, fallos sobre la fila y último éxito.
- Manual (T006): captura real y fila sintética a 375 px en `es` y `en`.
- Regresión: suite completa, lint, typecheck y build sobre el árbol commiteado.

## Rollback strategy

- Revertir el código. No hay migración: las filas con la clave `previous` siguen siendo válidas y el código anterior la ignora.

## Deployment coupling

Ninguno: el código nuevo lee filas antiguas y el anterior lee filas nuevas.

## PLAN verification checklist

- [x] The plan covers all acceptance criteria.
- [x] The plan avoids behavior outside the spec.
- [x] The Context budget section is filled (reading list + model routing), not left as placeholder.
- [x] Risks are documented.
- [x] Test strategy is documented.
- [x] Rollback strategy is documented.
- [x] SPEC.md status has been updated to `Ready`.
