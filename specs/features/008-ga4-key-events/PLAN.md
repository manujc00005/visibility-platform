# Implementation Plan: Conversiones desde la búsqueda orgánica en GA4

## Summary

El cliente de GA4 gana `listKeyEvents` y un filtro fijo de dimensión en `runReport`. La recogida lanza tres llamadas más en paralelo con los tres informes de la 006: la lista de eventos clave configurados, los eventos clave por canal en los dos periodos y el desglose orgánico por evento. El resultado se guarda en una columna `key_events` nueva y el resumen y la sección muestran el bloque «Conversiones desde buscadores», también en el estado «Sin visitas». Sin dependencias ni proveedor nuevo.

## Related spec

`specs/features/008-ga4-key-events/SPEC.md` (validada con `ANALYSIS.md`).

## Impacted areas

| Archivo | Cambio |
|---|---|
| `src/modules/analytics/ga4.ts` | `listKeyEvents`; `ReportRequest.dimensionFilter?` con tipo fijo, copiado al cuerpo solo si viene |
| `src/modules/analytics/collect.ts` | `KeyEvents` en `CollectedData`; seis llamadas en un `Promise.all`; sumas, orgánico, desglose, tope (D007) y avisos combinados |
| `src/modules/analytics/schema.ts`, `src/db/migrations/0011_*` y su `meta/` | Columna `key_events` con dos `check` (`failed` sin ella y forma en modo `strict`) |
| `src/modules/analytics/service.ts` | Guardar `key_events` |
| `src/modules/analytics/summary.ts` | `KeyEventsView`; `quality` y `keyEvents` también en `empty` (D006) |
| `src/components/analytics/analytics-section.tsx` | Bloque dentro de la tarjeta con su tabla (D005); frase de actualizar; aviso de calidad en `empty` |
| `src/i18n/messages/es.ts`, `en.ts`, `tests/unit/i18n/messages.test.ts` | Subárbol `analytics.keyEvents` |
| `tests/unit/analytics/{ga4,collect,summary,section-render}.test.ts`, `tests/integration/analytics.test.ts` | Pruebas |

No cambian: la búsqueda de propiedad, los tres informes de la 006 (cuerpo idéntico), la acción, la página SEO, Search Console, Bing, el informe PDF ni la tarjeta del resumen.

## Context budget

### Reading list

- `specs/features/008-ga4-key-events/*`; como modelo, `specs/features/007-branded-queries/{DECISIONS,TASKS}.md`.
- `src/modules/analytics/*` y `src/components/analytics/analytics-section.tsx`.
- `src/modules/search-console/schema.ts` (patrón del `check` en modo `strict`).
- `src/db/migrations/meta/_journal.json`.
- Namespace `analytics` de `src/i18n/messages/{es,en}.ts`.
- `tests/unit/analytics/*`, `tests/integration/analytics.test.ts`.

### Model routing

- T002 (sumas, orgánico, concurrencia y fallos) y T005 (estados del resumen): modelo de razonamiento.
- T001, T003, T004, T006 y T007: trabajo mecánico que calca la 006 y la 007.
- Revisiones de cierre (T009) con agentes independientes: seguridad, dominio (base de datos, API y frontend) y conformidad.

## Proposed approach

1. **`ga4.ts`.** `listKeyEvents(token, property, options)` valida `properties/<id>` antes de la red, llama a `/{property}/keyEvents?pageSize=200` con el `call` común (Admin) y parsea con Zod `{ keyEvents?: { eventName: string }[]; nextPageToken? }`; una entrada sin `eventName` textual es `error`. Devuelve hasta 50 nombres recortados a 100 y `more`. `DimensionFilter` es el tipo exacto de FR-003; `runReport` lo añade al `payload` solo si viene.
2. **`collect.ts`.** Tras elegir propiedad: `Promise.all` con los tres informes actuales, `listKeyEvents`, el informe por canal (`dimensions: ["sessionDefaultChannelGroup", "dateRange"]`, `metrics: ["keyEvents"]`, `limit: 100`) y el desglose (`dateRanges: [current]`, `dimensions: ["eventName"]`, `metrics: ["keyEvents"]`, `orderBy: "keyEvents"`, `limit: 10`, filtro). Sumas por `dateRange` de todas las filas; orgánico de las filas `Organic Search` exactas; tope de D007; desglose con `keyEvents > 0` recortado a 100. Los avisos de los cinco informes por OR.
3. **Persistencia.** Columna `key_events jsonb` nullable, `check` `failed_without_key_events` y `key_events_shape` en modo `strict`, generada con `npm run db:generate` y revisada; `service.ts` la escribe en `completed`. Migración aplicada en `test` (preparación de integración) y en `dev` tras comprobar en solo lectura que es la rama `dev`.
4. **`summary.ts`.** `KeyEventsView` con `state: "none_configured" | "ok"`, cifras orgánica y total formateadas, cambios con `countChange` según su propia base, parte orgánica, desglose, configurados, avisos (`configuredMore`, `previousTotal = 0` con configurados, total positivo sin orgánico). En `empty`, conservar `quality` y `keyEvents` (D006).
5. **Sección.** Bloque dentro de la tarjeta (D005): título, aclaración de «buscadores», dos cifras con cambio, parte orgánica, tabla del desglose, configurados y avisos; `none_configured` solo con la explicación. Captura sin `key_events`: frase de actualizar o de configurar. Aviso de calidad visible también en `empty` con bloque.
6. **Catálogos** `es`/`en` y prueba de catálogos.

## Alternatives considered

- Tasas de conversión: D001.
- Deducir «sin configurar» de los ceros: D002.
- Lista de nombres de canal equivalentes: D003.
- Ampliar `channels`: D004.
- Tabla por evento junto a canales y páginas: D005.
- Un informe sin dimensiones para el total: una llamada más y otra posible discrepancia con la suma por canal; la SPEC presenta el total como suma de canales devueltos.

## Dependencies

- Ninguna librería nueva.
- Para T008, la cuenta de servicio real con lector en `properties/561384888` (D010 de la 006).
- Archivos compartidos con la 004 sin commitear (`es.ts`, `en.ts`, `messages.test.ts`): al commitear se separa solo lo de la 008, como en la 006 y la 007.

## Risks

- **Combinación de dimensión y métrica rechazada por GA4** (`keyEvents` con `sessionDefaultChannelGroup` o con `eventName`): UNVERIFIED; T008 lo comprueba y, si falla, la captura entera falla con `error` hasta resolverlo.
- **Olessium sin etiqueta ni eventos clave:** la captura real solo verá ceros y probablemente `none_configured`; la semántica con datos queda como seguimiento, como D011 de la 006.
- **Canal con otro nombre:** D003; aviso en la sección.
- **Cambio del retorno temprano en `empty`** (D006): riesgo de regresión en la 006; sus pruebas deben pasar sin cambios de expectativas.
- **Acción sin autenticación** (D-03): tres llamadas más a la cuota del operador por clic.

## Test strategy

- Unitarias con `fetch` falso: `listKeyEvents` (vacío, orden, recorte, 60 eventos, `nextPageToken`, entrada inválida, propiedad inválida sin red, 401/403/429/500/JSON inválido/tiempo agotado); `runReport` con y sin filtro; recogida (nueve peticiones con cuerpos exactos, concurrencia con `fetch` diferido, sumas con `(other)`, orgánico, canal en otro idioma, `(not set)`, tope de D007, avisos combinados, fallos en cada llamada nueva con búsqueda literal de secretos); resumen (estados, cambios independientes, parte orgánica, avisos, `empty`, captura sin `key_events`); render (bloque, `none_configured`, ceros, captura antigua, texto hostil en los tres tipos de nombre, inglés); catálogos.
- Integración contra `test`: guardar y leer; fila sin la columna como nulo; rechazos por código 23514 y nombre de restricción; formas válidas aceptadas; fallos sobre la fila; captura `completed` real sin secretos.
- Manual (T008): captura real de olessium.com y maquetación a 375 px en `es` y `en`, también con una fila sintética con datos que se borra después.
- Regresión: suite completa, lint, typecheck y build sobre el árbol commiteado.

## Rollback strategy

- La columna es nullable y aditiva: el código anterior la ignora.
- Quitar la feature en dos entregas: (1) código sin lectura ni escritura de `key_events` y sin la columna en el esquema de Drizzle, sin generar migración; (2) después, la migración que borra la columna. Entre las dos, vigilar que ningún `db:generate` meta ese `DROP` en otra migración.
- Revertir solo el código: la migración `0011`, su `snapshot` y su entrada en `_journal.json` se quedan.

## Deployment coupling

La migración `0011` se aplica antes de desplegar el código que lee y escribe `key_events` (D-22 del roadmap).

## PLAN verification checklist

- [x] The plan covers all acceptance criteria.
- [x] The plan avoids behavior outside the spec.
- [x] The Context budget section is filled (reading list + model routing), not left as placeholder.
- [x] Risks are documented.
- [x] Test strategy is documented.
- [x] Rollback strategy is documented.
- [x] SPEC.md status has been updated to `Ready`.
