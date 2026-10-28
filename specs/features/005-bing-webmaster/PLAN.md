# Implementation Plan: Conector de Bing Webmaster Tools

## Summary

Módulo `src/modules/bing-webmaster/` con clave, cliente de Bing, recogida, persistencia y resumen, con la misma forma que `src/modules/search-console/`. Una tabla nueva, una Server Action y una sección en la página SEO, con textos `es`/`en`.

## Related spec

`specs/features/005-bing-webmaster/SPEC.md`.

## Impacted areas

| Archivo | Cambio |
|---|---|
| `src/config/env.ts`, `.env.example` | Variable `BING_WEBMASTER_API_KEY` (opcional, sin valor en el ejemplo) |
| `src/lib/logger.ts` | Redacción de `apikey`, `*.apikey` y `BING_WEBMASTER_API_KEY` |
| `src/modules/bing-webmaster/credentials.ts` | Validación de la clave (FR-001) |
| `src/modules/bing-webmaster/bing.ts` | Cliente: URL fija, `fetch` inyectable, 15 s, `redirect: "error"`, Zod, fechas `/Date()/`, errores tipados |
| `src/modules/bing-webmaster/collect.ts` | Sitio, periodos, agregación, a lo sumo 4 llamadas |
| `src/modules/bing-webmaster/schema.ts`, `src/db/schema/index.ts`, `src/db/migrations/0007_*` | Tabla nueva (D002) |
| `src/modules/bing-webmaster/service.ts`, `deps.ts` | `refreshBingWebmaster`, `latestBingWebmaster`, configuración y cableado |
| `src/modules/bing-webmaster/summary.ts` | Estado de la sección y cambios |
| `src/app/workspaces/[id]/seo/actions.ts` | `refreshBingWebmasterAction` |
| `src/app/workspaces/[id]/seo/page.tsx` | Carga y pinta la sección |
| `src/components/bing-webmaster/*` | Sección y botón |
| `src/i18n/messages/es.ts`, `en.ts`, `tests/unit/i18n/messages.test.ts` | Namespace `bingWebmaster` |
| `tests/unit/bing-webmaster/*`, `tests/integration/bing-webmaster.test.ts` | Pruebas |

## Context budget

### Reading list

- `specs/features/005-bing-webmaster/*` y `specs/features/003-search-console/*`.
- `src/modules/search-console/*`, `src/components/search-console/*`, `src/app/workspaces/[id]/seo/{page,actions}.tsx?`.
- `src/config/env.ts`, `src/lib/logger.ts`, `src/db/schema/index.ts`, `src/db/migrations/0006_search_console.sql`.
- `src/i18n/messages/{es,en}.ts` (solo el namespace `searchConsole` como modelo) y `src/i18n/format.ts`.
- `tests/unit/search-console/*`, `tests/integration/search-console.test.ts`.

### Model routing

- Cliente, errores y redacción de la clave (T002–T003): modelo de razonamiento, porque es la parte de seguridad.
- Migración, servicio, resumen, UI y catálogos (T004–T007): trabajo mecánico que calca Search Console.
- Revisión de seguridad final: `/security-review` además de las revisiones generales.

## Proposed approach

1. `credentials.ts`: recorte y patrón de la clave; devuelve un código de problema, nunca el valor.
2. `bing.ts`: `callBing(method, params, key, options)` construye la URL dentro de la función y la descarta. Clasifica HTTP 400 por `ErrorCode` y el resto por estado. Los mensajes son fijos. Esquemas Zod para `Site`, `RankAndTrafficStats` y `QueryStats` (también para páginas), y `parseBingDate`.
3. `collect.ts`: `GetUserSites` → elección → tráfico → búsquedas → páginas. Calcula periodos (D004) y agrega (D005). Devuelve `CollectOutcome` con la forma del de Search Console.
4. `schema.ts` y migración `0007` con `npm run db:generate`. `service.ts` guarda cada intento y lee el último y el último con éxito.
5. `summary.ts`: estados `not_configured | invalid_config | no_data | processing | error | ok`, cifras y cambios.
6. Acción, sección y botón. Los componentes de presentación de Search Console se reutilizan si ya se exportan. Si hay que extraerlos, se hace como cambio adyacente necesario y se anota en DECISIONS.
7. Catálogos `es`/`en`.

## Alternatives considered

- OAuth de Microsoft: D001.
- Reutilizar `search_console_snapshots`: D002.
- Periodo atado a la fecha de captura: D004.
- Usar la respuesta de búsquedas tal cual, sin agrupar: D005.

## Dependencies

- Ninguna librería nueva.
- La clave real del operador para AC-010 (Bing Webmaster Tools › Settings › API Access).
- Archivos compartidos con la 004 sin commitear: se trabaja en la misma copia y al commitear se separa solo lo de la 005 (D007, reanudación). La suite se repite sobre el árbol separado antes del commit.

## Risks

- **Trazas de Next.js** con la URL completa si algún día se activan OpenTelemetry o `logging.fetches` (supuestos de la spec).
- **Acción sin autenticación** con una clave que ve todos los sitios de la cuenta de Bing (supuestos de la spec, D-03).

- **Filtración de la clave** por la query string. Mitigación: URL local a una función, mensajes fijos, redacción en el logger, `redirect: "error"` y una prueba que busca la clave literal en todas las salidas (AC-006).
- **Forma real de las respuestas no verificada** (filas por semana, `GetPageStats`). Mitigación: D005 y la comprobación con datos reales en AC-010.
- **Sitio recién verificado sin datos** durante 48 h. Mitigación: estado `processing` (AC-005).
- **Cambios de la 004 sin commitear** en los mismos archivos. Mitigación: D007.

## Test strategy

- Unitarias con `fetch` falso: cliente, fechas, errores, elección de sitio, periodos, agregación, resumen y búsqueda de la clave literal en errores y resultados.
- Integración contra la rama `test`: persistencia de éxito, éxito vacío y fallo, lecturas y cascada.
- Manual en navegador (AC-010) con la clave real. Sin pulsar botones que escriban en la base de desarrollo, salvo el propio intento de Bing.
- Regresión: suite completa, lint, typecheck y build.

## Rollback strategy

- Sin la variable, la sección queda en «Sin configurar» y no hace llamadas: es el interruptor de apagado.
- Para quitar la feature: revertir el commit y añadir una migración que borre `bing_webmaster_snapshots`. La tabla no la lee nada más.

## Deployment coupling

La migración `0007` debe aplicarse antes de desplegar el código que lee la tabla.

## PLAN verification checklist

- [x] The plan covers all acceptance criteria.
- [x] The plan avoids behavior outside the spec.
- [x] The Context budget section is filled (reading list + model routing), not left as placeholder.
- [x] Risks are documented.
- [x] Test strategy is documented.
- [x] Rollback strategy is documented.
- [x] SPEC.md status has been updated to `Ready`.
