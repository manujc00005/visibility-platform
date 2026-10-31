# Implementation Plan: Perfil de negocio y detección asistida de competidores

## Summary

Añadir un perfil de negocio confirmado por el operador, una pregunta completa para ChatGPT y un formato de respuesta estructurado. El tipo de competidor recorre sugerencia, competidor y comparativa. Sin proveedores ni credenciales nuevas.

## Related spec

`specs/features/012-business-profile-competitors/SPEC.md`

## Impacted areas

- `src/modules/geo/competitors/`: `schema.ts`, `extract.ts`, `evaluate.ts`, `service.ts`, nuevos `profile.ts` y `profile-service.ts`.
- `src/modules/geo/`: `schema.ts`, `service.ts`, `prompt-suggestions.ts`.
- `src/modules/competitor-comparison/summary.ts`.
- `src/app/workspaces/[id]/geo/`: `actions.ts`, `setup/page.tsx`.
- `src/app/workspaces/[id]/seo/page.tsx` si la lista de competidores necesita pasar `kind`.
- `src/components/geo/`: `competitor-suggestions.tsx`, nuevo `business-profile-form.tsx`.
- `src/components/competitor-comparison/comparison-section.tsx`.
- `src/i18n/messages/{es,en}.ts`, `src/db/migrations/`, pruebas y `docs/visibility-mvp/16-implementation-roadmap.md` (BL-08).

## Context budget

### Reading list

Specs 001 y 011, los módulos anteriores y sus pruebas en `tests/unit/geo`, `tests/unit/competitor-comparison`, `tests/integration/competitor-suggestions.test.ts` y `tests/integration/competitor-comparison.test.ts`.

### Model routing

Implementación en esta sesión. Revisión independiente con agentes de solo lectura, porque toca migración, servidor y entrada no fiable. No hace falta modelo de razonamiento aparte para código mecánico.

## Proposed approach

1. Datos: migración 0015 con la tabla, las dos columnas y la nueva restricción de longitud.
2. Núcleo puro: enumeraciones, validación, propuesta y pregunta.
3. Extracción y evaluación con tipos y relevancia de zona, y `rulesVersion` nuevo.
4. Servicio: `contextOf(workspace, profile)`, lectura del perfil antes de la red y dentro de la transacción de publicación.
5. Interfaz: formulario, pregunta, tarjetas y comparativa.
6. Limpieza y verificación real.

## Alternatives considered

- Columnas en `workspaces`: mezcla la ficha y obliga a tocar su creación y edición. Rechazada.
- Perfil dentro de la pregunta sin guardarlo: se perdería entre extracciones y no alimenta la evaluación. Rechazada.
- JSON en la respuesta: ChatGPT lo adorna y el operador lo pega roto con más facilidad que una línea con separadores. Rechazada.
- Pedir el perfil a ChatGPT en dos pasos: duplica el pegado para el operador. Queda para más adelante si la propuesta determinista se queda corta.

## Dependencies

- Una respuesta real de ChatGPT para AC-018, a cargo del operador.
- Migrar `dev` para que la aplicación que usa el operador siga funcionando.

## Risks

- Heurística pobre en webs poco explícitas: se mitiga con confirmación obligatoria y motivos visibles.
- ChatGPT puede inventar empresas: la portada se lee y la web inaccesible se marca.
- Trabajo concurrente de otras sesiones en catálogos, roadmap y `comparison-section.tsx`: se confirman solo los fragmentos propios.
- Otra migración 0015 en paralelo: comprobar el journal antes de generar.
- Cambiar `SUGGESTION_RULES_VERSION` cambia las huellas: es lo esperado, una respuesta repetida se reevalúa.

## Test strategy

TDD sobre el núcleo puro. Integración en Neon `test` para guardado, restricciones, conflicto y aceptación. Render en `es` y `en`. Navegador para AC-013 a AC-016. Regresión con la suite completa.

## Rollback strategy

Revertir los commits. La migración es aditiva: las columnas y la tabla nuevas pueden quedar sin uso. La restricción ampliada no rompe el código anterior. «Competidor Ejemplo» se restaura cambiando su estado a `active`.

## PLAN verification checklist

- [x] The plan covers all acceptance criteria.
- [x] The plan avoids behavior outside the spec.
- [x] The Context budget section is filled.
- [x] Risks are documented.
- [x] Test strategy is documented.
- [x] Rollback strategy is documented.
- [x] SPEC.md status has been updated to `Ready`.
