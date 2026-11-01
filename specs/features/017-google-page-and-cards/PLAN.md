# Implementation Plan: Página «Google» por preguntas, acciones con alcance y tarjetas compactas

## Summary

Solo presentación y traslado: dividir la sección de Search Console, reordenar `/seo` en cuatro bloques, acortar la comparativa, renombrar botones, compactar tarjetas, añadir la pestaña «Configuración» y mover allí los competidores.

## Related spec

`specs/features/017-google-page-and-cards/SPEC.md`

## Impacted areas

- `src/app/workspaces/[id]/seo/page.tsx`, `src/components/search-console/search-console-section.tsx`.
- `src/components/competitor-comparison/comparison-section.tsx`.
- `src/app/workspaces/[id]/page.tsx`, `src/components/overview/{overview-card,workspace-nav}.tsx`.
- `src/app/workspaces/[id]/edit/page.tsx`, `src/app/workspaces/[id]/geo/setup/page.tsx`, `src/app/workspaces/[id]/geo/actions.ts`, nuevo `src/components/workspaces/competitors-panel.tsx`.
- `src/i18n/messages/{es,en}.ts`, pruebas de render y catálogo, spec 002, roadmap §8.

## Context budget

### Reading list

Specs 002, 014, 015; las páginas y componentes de arriba.

### Model routing

Implementación en esta sesión; revisión de solo lectura al final (frontend/QA y conformidad).

## Proposed approach

1. Partir `SearchConsoleSection`; reordenar `/seo`.
2. Botones y catálogos.
3. Comparativa.
4. Tarjetas y nota en la 002.
5. Pestaña «Configuración» y traslado de competidores.
6. Navegador, roadmap, cierre.

## Alternatives considered

- Subpestañas o rutas por bloque: más navegación para un operador que quiere verlo todo. Rechazada.
- `<details>` dentro de las tarjetas: control dentro de un enlace, inválido. Rechazada.
- Plegar Bing y Analytics: romperían los enlaces del panel de fuentes. Rechazada.
- Ruta nueva `/settings`: obliga a redirigir `/edit` sin ganar nada. Rechazada.

## Dependencies

Ninguna externa.

## Risks

- Otras sesiones en catálogos y resumen: confirmar solo los fragmentos propios.
- Traslado de competidores: las acciones revalidan rutas concretas.
- Visitantes reales sale de la tarjeta: la 002 AC-022 lo exigía; se sustituye y sigue en Rendimiento.

## Test strategy

Pruebas de render existentes adaptadas; suite completa; navegador para bloques, tarjetas y competidores.

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
