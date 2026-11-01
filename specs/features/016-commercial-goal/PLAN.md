# Implementation Plan: Objetivo comercial por empresa

## Summary

Una tabla 1:1 con la empresa, un servicio con upsert bajo el bloqueo de empresa y una consulta de evidencia sobre las capturas de GA4 guardadas, un resumen puro con tres estados, un formulario en la edición y una línea en el resumen. Sin cambios en GA4.

## Related spec

`specs/features/016-commercial-goal/SPEC.md`

## Impacted areas

- `src/modules/goals/{schema,service,summary}.ts` (nuevos), `src/db/schema/index.ts`, migración `0018_workspace_goals`.
- `src/app/workspaces/[id]/goal/actions.ts` (nuevo), `src/components/workspaces/{goal-form,goal-line}.tsx` (nuevos).
- `src/app/workspaces/[id]/edit/page.tsx`, `src/app/workspaces/[id]/page.tsx`.
- `src/i18n/messages/{es,en}.ts`.
- Pruebas: `tests/unit/goals/*`, `tests/integration/goals.test.ts`, `tests/unit/i18n/messages.test.ts`.
- `docs/visibility-mvp/16-implementation-roadmap.md` (§8).

## Context budget

### Reading list

Spec 008 (eventos clave, D003), `analytics/collect.ts` `KeyEvents`, `analytics/schema.ts`, `geo/competitors/profile-service.ts` (patrón 1:1 con bloqueo), `business-profile-form.tsx`, `OpportunityLead`.

### Model routing

Implementación en esta sesión; revisión de solo lectura al final (base de datos, frontend/QA y conformidad).

## Proposed approach

1. Esquema, migración y servicio con pruebas de integración.
2. `summarizeGoal` con TDD.
3. Acciones, formulario y línea; catálogos.
4. Navegador, roadmap, cierre.

## Alternatives considered

- Columnas en `workspaces`: mezcla la ficha con un concepto opcional y obliga a tocar alta y edición. Rechazada (como D002 de la 012).
- Guardar `verified_at` al capturar: acopla la 008 al objetivo y deja un estado que puede quedarse obsoleto. Rechazada: la evidencia se deriva de lo guardado.
- Contar recepciones totales (todos los canales): exige otra consulta a GA4 por evento; fuera de alcance (non-goal).

## Dependencies

Migrar `dev` antes de la verificación en navegador.

## Risks

- Olessium no tiene eventos orgánicos todavía: el estado verificado solo se prueba con fixtures en integración y unitarias.
- Otras sesiones en catálogos y páginas: confirmar solo los fragmentos propios.

## Test strategy

Integración en Neon `test` para tabla, upsert, evidencia y cascada. Unitarias para el resumen y los componentes. Navegador para AC-006.

## Rollback strategy

Revertir los commits; la tabla puede quedar sin uso.

## PLAN verification checklist

- [x] The plan covers all acceptance criteria.
- [x] The plan avoids behavior outside the spec.
- [x] The Context budget section is filled.
- [x] Risks are documented.
- [x] Test strategy is documented.
- [x] Rollback strategy is documented.
- [x] SPEC.md status has been updated to `Ready`.
