# Implementation Plan: Conector de Google Search Console

## Summary

Módulo `src/modules/search-console/` con credencial, cliente de Google, recogida, persistencia y resumen. Una Server Action en la pestaña Google y una línea en la tarjeta del resumen.

## Related spec

`specs/features/003-search-console/SPEC.md`.

## Impacted areas

| Archivo | Cambio |
|---|---|
| `src/config/env.ts`, `.env.example` | Variable `GSC_SERVICE_ACCOUNT_JSON` |
| `src/modules/search-console/*` | Nuevo módulo |
| `src/db/schema/index.ts`, `src/db/migrations/0006_*` | Tabla nueva |
| `src/app/workspaces/[id]/seo/page.tsx`, `actions.ts` | Sección real y acción |
| `src/components/search-console/*` | Botón y vista |
| `src/app/workspaces/[id]/page.tsx` | Línea de la tarjeta Google |
| `src/lib/logger.ts` | Redacción de `private_key` y `access_token` |

## Proposed approach

1. `credentials.ts`: parseo de la clave con Zod.
2. `google.ts`: token, lista de propiedades y Search Analytics, con `fetch` inyectable y errores tipados.
3. `collect.ts`: periodos, elección de propiedad y las cuatro consultas.
4. `schema.ts` y migración; `service.ts` con `refreshSearchConsole` y `latestSnapshots`.
5. `summary.ts`: estado de la sección y de la tarjeta.
6. UI y acción.

## Dependencies

Ninguna nueva.

## Alternatives considered

Ver DECISIONS.md D001 y D002.

## Test strategy

Unitarias con `fetch` falso y una clave RSA generada en la prueba. Integración contra la rama `test` para la persistencia. Verificación en navegador del estado «Sin configurar»; la verificación con datos reales depende de que exista la credencial.

## Deployment coupling

La migración `0006` debe aplicarse antes de desplegar el código que lee la tabla.
