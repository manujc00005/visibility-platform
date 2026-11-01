# Implementation Plan: Inicio y panel de fuentes de datos

## Summary

Redirigir la raíz al listado, mover el estado técnico a `/admin/status`, y un módulo puro que convierte los cinco resúmenes existentes en filas de un panel de fuentes mostrado en la edición de la empresa. Sin lecturas externas ni datos nuevos.

## Related spec

`specs/features/015-home-and-data-sources/SPEC.md`

## Impacted areas

- `src/app/page.tsx`, `src/app/admin/status/page.tsx` (nuevo), `src/components/layout/app-header.tsx`.
- `src/modules/audits/deps.ts` (`auditProviderConfig`), `src/modules/sources/summary.ts` (nuevo).
- `src/components/workspaces/sources-panel.tsx` (nuevo), `src/app/workspaces/[id]/edit/page.tsx`.
- `src/i18n/messages/{es,en}.ts`.
- Pruebas: `tests/unit/sources/*` (nuevos), `tests/unit/i18n/messages.test.ts`, `tests/unit/geo/i18n-en.test.ts`.
- `docs/visibility-mvp/16-implementation-roadmap.md` (§8).

## Context budget

### Reading list

Los `summarize*` de Search Console, Bing, GA4, rendimiento e IA; `geoProviderStatus`; las secciones de la página «Google» (tonos y etiquetas); la página de edición; `AppHeader`.

### Model routing

Implementación en esta sesión; revisión de solo lectura al final (frontend/QA y conformidad).

## Proposed approach

1. Raíz, `/admin/status` y cabecera.
2. `auditProviderConfig` y `summarizeSources` con TDD.
3. `SourcesPanel` y la página de edición.
4. Catálogos y textos de `providerStatus`.
5. Navegador, roadmap, cierre.

## Alternatives considered

- Panel en el resumen: es la pantalla del propietario; el estado de credenciales es del operador. Rechazada.
- Ruta propia `/workspaces/[id]/sources`: añade navegación para una tabla; la 017 creará «Configuración» y el panel se moverá entonces. Rechazada por ahora.
- Recalcular estados en el panel: duplicaría la lógica de cinco módulos. Rechazada; el panel solo mapea.

## Dependencies

Ninguna externa.

## Risks

- La página de edición hace más lecturas; aceptable para una pantalla de operador.
- Otras sesiones en catálogos y cabecera: confirmar solo los fragmentos propios.

## Test strategy

TDD sobre `summarizeSources`; render del panel sin base; suite completa por regresión; navegador para la redirección y el panel.

## Rollback strategy

Revertir los commits. Sin migraciones.

## PLAN verification checklist

- [x] The plan covers all acceptance criteria.
- [x] The plan avoids behavior outside the spec.
- [x] The Context budget section is filled.
- [x] Risks are documented.
- [x] Test strategy is documented.
- [x] Rollback strategy is documented.
- [x] SPEC.md status has been updated to `Ready`.
