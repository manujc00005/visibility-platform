# Implementation Plan: Origen y estados de la medición en IA

## Summary

Una columna `origin` en `geo_runs`, un filtro único en `summarizeAi` y otro en `createReport`, rótulos en histórico y detalle, y el detalle alineado con el resumen (estado, orden de cifras, porcentajes y tabla de comparación). Cierra la fase A.1 del doc 19 y el D-23 del roadmap.

## Related spec

`specs/features/013-geo-run-origin/SPEC.md`

## Impacted areas

- `src/modules/geo/schema.ts`, `src/db/migrations/0017_geo_run_origin.sql` (+ snapshot y journal generados).
- `src/modules/geo/service.ts` (`createGeoRun`), `src/modules/geo/presentation.ts` (`fraction`).
- `src/modules/overview/ai.ts` (`RunLike.origin`, filtro, `runResultState`), `src/modules/overview/index.ts`.
- `src/modules/reports/service.ts`.
- `src/app/workspaces/[id]/page.tsx`, `geo/page.tsx`, `geo/runs/[runId]/page.tsx`, `geo/setup/page.tsx`.
- `src/components/geo/geo-forms.tsx` (`RunForm`).
- `src/i18n/messages/{es,en}.ts`.
- Pruebas: `tests/unit/overview/{ai,i18n-en}.test.ts`, `tests/unit/overview/fixtures.ts`, `tests/unit/geo/i18n-en.test.ts`, `tests/integration/{geo,reports}.test.ts`.
- `docs/visibility-mvp/16-implementation-roadmap.md` (D-23, §8).

## Context budget

### Reading list

Spec 002 (reglas de estados, D010–D012, D018), doc 17 §7, `overview/ai.ts`, `geo/metrics.ts`, la página de detalle y sus pruebas.

### Model routing

Implementación en esta sesión; revisión de solo lectura al final (base de datos, QA, conformidad).

## Proposed approach

1. Esquema y migración (drizzle-kit generate), prueba de integración del `CHECK`.
2. `createGeoRun` con `origin`; prueba de integración.
3. `RunLike.origin`, filtro y `onlyNonReal` en `summarizeAi`; `runResultState`; pruebas unitarias; actualizar fixtures y llamadas.
4. `createReport` filtra por origen; prueba de integración.
5. `fraction` con umbral; prueba unitaria.
6. Interfaz: `RunForm` con selector; histórico y detalle con rótulos; detalle con pill, orden de tarjetas, tarjeta `answers`, tabla de comparación; título AEO. Catálogos.
7. Migrar `dev`, reclasificar las dos runs, verificar en navegador.
8. Roadmap y cierre.

## Alternatives considered

- Meter `origin` en `config`/`methodologyKey`: haría incomparable una demo con una real, pero también rompería la clave de las runs existentes y mezcla dos conceptos. Rechazada.
- Filtrar en cada página en vez de en `summarizeAi`: tres puntos de olvido. Rechazada.
- Borrar las runs de prueba en vez de reclasificarlas: pierde la evidencia de la Fase 4 y de las capturas del doc 17. Rechazada.
- Umbral de porcentaje 5 o 10: Codex pedía quitar el titular con una observación; 3 cubre eso sin ocultar el porcentaje en muestras pequeñas reales de 3–5 preguntas.

## Dependencies

- Migrar `dev` antes de la verificación en navegador.

## Risks

- Otras sesiones tocando catálogos: confirmar solo los fragmentos propios.
- La demo de Buchhandlung dejará de mostrar la tarjeta de IA con datos: es lo buscado (doc 17 §7 lo pedía); las capturas del doc 17 quedan como histórico.
- `fraction` cambia la salida de `1 de 1 (100 %)`: afecta a la prueba de `i18n-en` y al informe solo si usara `fraction` (no: usa `frac` propia).

## Test strategy

TDD sobre `summarizeAi`, `runResultState` y `fraction`. Integración en Neon `test` para `CHECK`, `createGeoRun` y `createReport`. Navegador para AC-007 y AC-011.

## Rollback strategy

Revertir los commits. La columna puede quedar sin uso (default `real`). Las dos filas reclasificadas vuelven con `UPDATE geo_runs SET origin = 'real' WHERE id IN (…)`.

## PLAN verification checklist

- [x] The plan covers all acceptance criteria.
- [x] The plan avoids behavior outside the spec.
- [x] The Context budget section is filled.
- [x] Risks are documented.
- [x] Test strategy is documented.
- [x] Rollback strategy is documented.
- [x] SPEC.md status has been updated to `Ready`.
