# Implementation Plan: Búsquedas con marca y sin marca en Search Console

## Summary

Una función pura nueva construye los términos de marca y la expresión RE2. La recogida de Search Console añade cuatro consultas filtradas a las cuatro que ya hace, la fila guarda el resultado en una columna `segments` nueva y el resumen y la sección enseñan los dos bloques, el hueco, los términos y la etiqueta «marca» en la tabla. Sin proveedor nuevo, sin acción nueva y sin dependencias.

## Related spec

`specs/features/007-branded-queries/SPEC.md` (validada con `ANALYSIS.md`).

## Impacted areas

| Archivo | Cambio |
|---|---|
| `src/modules/search-console/brand-terms.ts` (nuevo) | `brandTerms`, `isBrandedQuery`, error tipado de límite (D004) |
| `src/modules/search-console/google.ts` | `AnalyticsQuery` gana `dimensionFilterGroups?`; el cuerpo solo lo incluye si viene |
| `src/modules/search-console/collect.ts` | El sitio gana `name` y `brandAliases`; cuatro consultas filtradas en el mismo `Promise.all`; `CollectedData.segments` |
| `src/modules/search-console/schema.ts`, `src/db/migrations/0009_*` y su `meta/` | Columna `segments` y sus `check` (D006) |
| `src/modules/search-console/service.ts` | Pasar nombre y alias; guardar `segments` (`deps.ts` no cambia: pasa el sitio tal cual) |
| `src/modules/search-console/summary.ts` | `segments` en el resumen; hueco; etiqueta `branded` proyectada en `queries` |
| `src/components/search-console/search-console-section.tsx` | Bloque «Con tu marca y sin ella», distintivo en la tabla (D005), frase de actualizar |
| `src/i18n/messages/es.ts`, `en.ts`, `tests/unit/i18n/messages.test.ts` | Claves nuevas en `searchConsole`; nota de privacidad ampliada |
| `tests/unit/search-console/{brand-terms,google,collect,summary,section-render}.test.ts`, `fixtures.ts`, `tests/integration/search-console.test.ts` | Pruebas |

No cambian: la página SEO (`seo/page.tsx`), la acción, la tarjeta del resumen de la empresa (`cardLine`), Bing, GA4 ni el informe PDF.

## Context budget

### Reading list

- `specs/features/007-branded-queries/*`; como referencia, `specs/features/003-search-console/DECISIONS.md`.
- `src/modules/search-console/*` y `src/components/search-console/*`.
- `src/modules/geo/detection.ts` (solo `normalizeText` y `nameKey`).
- `src/modules/workspaces/schema.ts`, `src/modules/workspaces/domain.ts` (límite de 253).
- `src/db/migrations/0006_search_console.sql` y `meta/_journal.json`.
- Namespace `searchConsole` de `src/i18n/messages/{es,en}.ts`.
- `tests/unit/search-console/*`, `tests/integration/search-console.test.ts`; como modelo de prueba de render, `tests/unit/analytics/section-render.test.ts`.

### Model routing

- T001 (constructor de términos, escape, recorte): modelo de razonamiento; es la única pieza con criterio propio y la que puede divergir de Google.
- T003 y T006 (recogida y resumen con hueco, porcentajes y cambios): modelo de razonamiento para los casos límite.
- T002, T004, T005, T007 y T008: trabajo mecánico que calca la 003 y la 006.
- Revisiones de cierre (T010) con agentes independientes: seguridad, base de datos y frontend.

## Proposed approach

1. **`brand-terms.ts`.** `brandTerms({ name, brandAliases, domain })`: recorta, deduplica por `nameKey`, descarta nombre y alias con menos de 3 caracteres alfanuméricos, conserva el dominio siempre. Por término genera hasta tres variantes (original en minúsculas, sin acentos, forma `nameKey`; ` +` entre palabras en las tres, D004), quita repetidas y las escapa con el conjunto de D004. Reserva primero el dominio y añade nombre y alias mientras la expresión con `(?i)` mida 4096 caracteres o menos; un término que no cabe se omite entero y se sigue con el siguiente. Devuelve `{ terms, expression, truncated }` o lanza `BrandTermsError` si el dominio solo no cabe. `isBrandedQuery(query, terms)` regenera las variantes de esos `terms` y prueba la alternancia con banderas `iu`.
2. **`google.ts`.** Tipo `DimensionFilterGroup` fijo (`groupType: "and"`, un filtro sobre `query` con `includingRegex` o `excludingRegex`). `querySearchAnalytics` lo copia al cuerpo solo si viene; sin él, el cuerpo es idéntico al actual.
3. **`collect.ts`.** Llama a `brandTerms` antes del token; un `BrandTermsError` da `failed/error` sin red. Tras elegir propiedad, lanza las ocho consultas en un único `Promise.all`. Sin filas, un segmento vale ceros. Un `GscError` en cualquiera da el fallo de siempre.
4. **Persistencia.** Columna `segments jsonb` nullable con los `check` de D006, generada con `npm run db:generate` y revisada. `service.ts` guarda `segments` en `completed`; `deps.ts` y `service.ts` pasan `name` y `brandAliases` leídos una sola vez.
5. **`summary.ts`.** `segments: SegmentsView | null` con cifras formateadas, porcentajes sobre `totals` («—» con denominador cero), cambio de clics por bloque con `countChange`, hueco actual y anterior con `max(0, delta)` y aviso de desajuste, términos y aviso de recorte. `queries` proyecta `branded` con `isBrandedQuery` solo si hay `segments`. `cardLine` no cambia.
6. **Sección.** Bloque nuevo bajo las cuatro cifras; distintivo «marca» junto al texto (D005); con `segments` nulo, la frase de actualizar si `canRun` o la de configurar si no. Términos como texto plano.
7. **Catálogos** `es`/`en` y prueba de catálogos.

## Alternatives considered

- Lista de términos SEO aparte: D001.
- Coincidencia por palabra completa: D002.
- Clasificar solo las 25 búsquedas guardadas, sin consultas filtradas: barato, pero deja fuera casi todo el tráfico y no da el periodo anterior. Se usa solo para la etiqueta de la tabla.
- Repartir el hueco: D003.
- Dos implementaciones de la coincidencia (RE2 para Google, `includes` para la tabla): D004.

## Dependencies

- Ninguna librería nueva.
- Para T009, la cuenta de servicio real con acceso a `sc-domain:olessium.com`, ya configurada (D006 de la 003).
- Archivos compartidos con la 004 sin commitear (`es.ts`, `en.ts`, `messages.test.ts`): se trabaja en la misma copia y al commitear se separa solo lo de la 007, como en la 005 y la 006.

## Risks

- **Google rechaza `(?i)` o el regex.** Solo se sabe con una captura real (AC-014). Mitigación: D004 deja el prefijo como única pieza que retirar; T009 es bloqueante para cerrar.
- **Diferencia entre la etiqueta local y el filtro de Google** en casos Unicode raros (mayúsculas de letras no latinas). Mitigación: subconjunto literal de D004; se acepta el resto como limitación (supuestos de la SPEC).
- **Nombres genéricos** que clasifican de más (D002). Mitigación: términos visibles.
- **`drizzle-kit` y los `check` con `jsonb_path_exists`** pueden generarse mal. Mitigación: revisar el SQL y prueba de integración que intenta insertar cada forma inválida.
- **Acción sin autenticación** (D-03 del roadmap): sin cambio de perímetro; cuatro llamadas más a la cuota del operador por clic.
- **Prueba intermitente ajena** (`audits.test.ts`, BL-06): si falla en T008, se reporta y no se toca.

## Test strategy

- Unitarias con `fetch` falso: constructor (orden, deduplicación, umbral, acentos, puntuación, escape, recorte, dominio obligatorio, error tipado); cuerpo de `querySearchAnalytics` con y sin filtro; recogida (diez peticiones, concurrencia con `fetch` diferido, ceros, fallos 403/429/500, búsqueda literal de token, JWT, clave y expresión); resumen (porcentajes, cambios, hueco positivo y negativo, captura previa sin `segments`, etiquetas, `cardLine` igual); render de la sección (bloque, distintivo, frase de actualizar y de configurar, término con `<script>`, inglés).
- Integración contra la rama `test`: guardar y leer `segments`; fila previa con nulo; rechazo de `failed` con `segments`, no objeto, versión distinta y forma incompleta; último éxito tras un fallo.
- Manual (T009): captura real de olessium.com en `es` y `en`, escritorio y 375 px.
- Regresión: suite completa, lint, typecheck y build. Las pruebas previas de Search Console solo se adaptan añadiendo campos.

## Rollback strategy

- La columna es nullable y aditiva: el código anterior la ignora.
- Orden para quitar la feature, en dos entregas: (1) código sin lectura ni escritura de `segments` y sin la columna en `schema.ts` de Drizzle (si sigue declarada, `select()` la nombra y falla en cuanto se borre), sin generar migración; (2) en una entrega posterior, la migración que borra la columna, aceptando perder los segmentos guardados. Entre las dos, cualquier `db:generate` metería ese `DROP` en una migración sin relación: hay que vigilarlo. No borrar la columna mientras un despliegue la escriba.
- Revertir solo el código: las migraciones `0009` y `0010`, sus `snapshot` y su entrada en `_journal.json` se quedan, porque la base ya las tiene aplicadas y quitarlas del historial rompería la siguiente generación (revisión de base de datos, DB-2).

## Deployment coupling

Las migraciones `0009` y `0010` se aplican antes de desplegar el código que escribe `segments` (D-22 del roadmap).

## PLAN verification checklist

- [x] The plan covers all acceptance criteria.
- [x] The plan avoids behavior outside the spec.
- [x] The Context budget section is filled (reading list + model routing), not left as placeholder.
- [x] Risks are documented.
- [x] Test strategy is documented.
- [x] Rollback strategy is documented.
- [x] SPEC.md status has been updated to `Ready`.
