# Implementation Plan: Conector de Google Analytics 4

## Summary

Módulo `src/modules/analytics/` con cliente de GA4, recogida, persistencia y resumen, con la misma forma que `src/modules/search-console/` y `src/modules/bing-webmaster/`. Reutiliza la cuenta de servicio y el token de Search Console con otro alcance. Una tabla nueva, una Server Action y una sección en la página SEO, con textos `es`/`en`.

## Related spec

`specs/features/006-google-analytics/SPEC.md`.

## Impacted areas

| Archivo | Cambio |
|---|---|
| `src/modules/search-console/google.ts` | `signJwt` y `fetchAccessToken` aceptan el alcance; por defecto, el de Search Console (D004) |
| `src/modules/analytics/ga4.ts` | Cliente: hosts fijos, `fetch` inyectable, 15 s, Zod, lectura por cabeceras, errores tipados |
| `src/modules/analytics/collect.ts` | Token, propiedad (D003), periodos (D005), tres informes en paralelo, avisos |
| `src/modules/analytics/schema.ts`, `src/db/schema/index.ts`, `src/db/migrations/0008_*` | Tabla nueva |
| `src/modules/analytics/service.ts`, `deps.ts` | `refreshAnalytics`, `latestAnalytics`, configuración y cableado |
| `src/modules/analytics/summary.ts` | Estado de la sección y cambios |
| `src/app/workspaces/[id]/seo/actions.ts` | `refreshAnalyticsAction` |
| `src/app/workspaces/[id]/seo/page.tsx` | Carga y pinta la sección |
| `src/components/analytics/*` | Sección |
| `src/i18n/messages/es.ts`, `en.ts`, `tests/unit/i18n/messages.test.ts` | Namespace `analytics` |
| `tests/unit/analytics/*`, `tests/integration/analytics.test.ts`, `tests/unit/search-console/google.test.ts` | Pruebas |

## Context budget

### Reading list

- `specs/features/006-google-analytics/*`; como modelo, `specs/features/005-bing-webmaster/DECISIONS.md` (D008–D010).
- `src/modules/search-console/{google,credentials,collect,deps,service,summary}.ts`.
- `src/modules/bing-webmaster/*` y `src/components/bing-webmaster/bing-webmaster-section.tsx` (estado `processing`, aviso de configuración, botón solo con credencial lista).
- `src/app/workspaces/[id]/seo/{page,actions}.tsx?`, `src/db/schema/index.ts`, `src/db/migrations/0007_bing_webmaster.sql`.
- `src/i18n/messages/{es,en}.ts`: solo los namespaces `searchConsole` y `bingWebmaster` como modelo.
- `tests/unit/search-console/*`, `tests/unit/bing-webmaster/*`, `tests/integration/bing-webmaster.test.ts`.

### Model routing

- Cliente, errores y elección de propiedad (T002–T003): modelo de razonamiento.
- Migración, servicio, resumen, UI y catálogos (T004–T007): trabajo mecánico que calca Bing.
- Revisión de seguridad y de conformidad al final, con agentes independientes.

## Proposed approach

1. `google.ts`: `scope` opcional en `signJwt` y `fetchAccessToken`. Sin cambiar su comportamiento por defecto.
2. `ga4.ts`: `listPropertySummaries`, `listWebStreamHosts(property)` y `runReport(property, request)`. Un `call` común que pone el `Bearer`, clasifica 401/403/429 y distingue `SERVICE_DISABLED` por API. Esquemas Zod para las tres respuestas y conversión de métricas de texto a entero.
3. `collect.ts`: token → resúmenes → flujos web (en serie, hasta 20) → elección → tres informes en `Promise.all` → periodos, canales, páginas y avisos. Devuelve `CollectOutcome` con la forma del de Bing. Los `GscError` del token se traducen a los motivos de GA4.
4. `schema.ts` y migración `0008` con `npm run db:generate`. `service.ts` guarda cada intento y lee el último y el último con éxito.
5. `summary.ts`: estados `not_configured | invalid_config | no_data | empty | error | ok`, cifras, canales con cambio y avisos.
6. Acción, sección (botón de Search Console reutilizado, D008 de la 005) y carga en la página SEO.
7. Catálogos `es`/`en`.

## Alternatives considered

- OAuth de usuario: D001.
- Variable de entorno nueva para GA4: D002.
- Guardar el id de propiedad en la empresa: D003.
- Fechas relativas de GA4 (`NdaysAgo`): D005.

## Dependencies

- Ninguna librería nueva.
- Para AC-012, el operador activa la Google Analytics Data API y la Admin API en el proyecto de la cuenta de servicio y la añade como «Lector» en la propiedad de Olessium.
- Archivos compartidos con la 004 sin commitear (`es.ts`, `en.ts`, `messages.test.ts`, `seo/page.tsx`): se trabaja en la misma copia y al commitear se separa solo lo de la 006, como en la 005.

## Risks

- **Acción sin autenticación** con una cuenta de servicio que puede leer varias propiedades (supuestos de la spec, D-03).
- **Coste de la búsqueda de propiedad** si la cuenta de servicio ve muchas: tope de 20 (FR-004).
- **Forma real de los errores 403** no comprobada: se clasifica como en Search Console y se comprueba en AC-012.
- **Archivos compartidos con la 004**: mismo procedimiento de separación que la 005.

## Test strategy

- Unitarias con `fetch` falso: alcance del JWT, cliente, elección de propiedad, periodos, informes, errores, búsqueda literal del token y de la clave, resumen y render de la sección.
- Integración contra la rama `test`: éxito, éxito vacío, fallo, lecturas, cascada y `check`.
- Manual en navegador (AC-012) con la cuenta de servicio real.
- Regresión: suite completa (incluidas las de Search Console sin cambios), lint, typecheck y build.

## Rollback strategy

- Sin la cuenta de servicio, la sección queda en «Sin configurar» y no llama a nada. Quitar a la cuenta de servicio de la propiedad de GA4 corta el acceso sin tocar Search Console.
- Para quitar la feature: revertir el commit y añadir una migración que borre `analytics_snapshots`. La tabla no la lee nada más.

## Deployment coupling

La migración `0008` debe aplicarse antes de desplegar el código que lee la tabla.

## PLAN verification checklist

- [x] The plan covers all acceptance criteria.
- [x] The plan avoids behavior outside the spec.
- [x] The Context budget section is filled (reading list + model routing), not left as placeholder.
- [x] Risks are documented.
- [x] Test strategy is documented.
- [x] Rollback strategy is documented.
- [x] SPEC.md status has been updated to `Ready`.
