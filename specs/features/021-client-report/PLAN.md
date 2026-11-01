# Implementation Plan: Informe para el cliente con resultados en buscadores

## Summary

El informe reutiliza los resúmenes de Search Console y del objetivo, adapta sus límites y lleva sus fuentes dentro.

## Related spec

`specs/features/021-client-report/SPEC.md`

## Impacted areas

`src/modules/reports/{build-report,service,render-pdf,report-styles}.ts`, nuevo `report-fonts.ts`, `src/app/workspaces/[id]/audits/[auditId]/actions.ts`, pruebas de informes, roadmap (D-15, §8).

## Context budget

### Reading list

`build-report.ts`, `service.ts`, `summarizeSearchConsole`, `summarizeGoal`, spec 013 D004.

### Model routing

Implementación en esta sesión; revisión de solo lectura al final (conformidad, seguridad y frontend).

## Proposed approach

1. `ReportSearch`, apartado, resumen, límites y `fraction`, con pruebas.
2. Servicio y acción.
3. Fuentes embebidas y pie.
4. PDF en `dev` y en contenedor Linux.

## Alternatives considered

- Recalcular cifras en el informe: dos verdades. Rechazada.
- Instalar fuentes en la imagen de despliegue: no hay imagen aún y dependería del entorno. Rechazada.
- Sumar Bing y Analytics: alarga un documento para propietarios. Rechazada.

## Dependencies

Docker local para AC-009.

## Risks

- `route("**/*")` podría interceptar fuentes en `data:`: AC-007 lo comprueba.
- Glifos fuera del subconjunto latino (→, ≤): se revisan en el PDF.

## Test strategy

Unitarias sobre el HTML, integración con render real, revisión visual en macOS y Linux.

## Rollback strategy

Revertir los commits; los informes guardados no cambian.

## PLAN verification checklist

- [x] The plan covers all acceptance criteria.
- [x] The plan avoids behavior outside the spec.
- [x] The Context budget section is filled.
- [x] Risks are documented.
- [x] Test strategy is documented.
- [x] Rollback strategy is documented.
- [x] SPEC.md status has been updated to `Ready`.
