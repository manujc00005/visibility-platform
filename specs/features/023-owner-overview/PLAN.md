# Plan: 023 — Resumen del propietario

## Approach

Todo es presentación sobre resúmenes que ya existen. Primero la capa pura (dos tarjetas de Google, criterio de resultado, línea de situación) con pruebas por estado; después la página y los componentes; al final textos, documentación y verificación en navegador.

## Steps

1. **Capa pura** (`src/modules/overview/`):
   - `google.ts`: `summarizeRankingCard` y `summarizeTechnicalCard` a partir del cuerpo actual de `summarizeGoogleCard`, repartiendo avisos y fuente.
   - `situation.ts`: `hasResult` por área y `situationLine`.
   - Pruebas: `google.test.ts` adaptado, `situation.test.ts` nuevo.
2. **Página y componentes**:
   - `page.tsx`: cabecera sin acciones; orden situación → franja → objetivo → tarjetas → pendientes → oportunidades; cuatro tarjetas en `md:grid-cols-2`, la última impar a dos columnas; enlaces a las anclas de `/seo`.
   - `components/overview/situation-line.tsx` y `pending-list.tsx`.
   - `opportunities.tsx`: quién puede hacerlo, rótulo de la acción, ficha a dos columnas, comentario del sitio reservado; estado vacío sin acción de operador.
3. **Catálogo `es`/`en`** y registro de llamadas representativas; retirar claves sin lector.
4. **Documentación**: 014 DECISIONS (nota de sustitución), 002 SPEC (nota en AC-001 y comportamiento 1), `DESIGN.md`, doc 17, roadmap (Módulo F).
5. **Verificación**: `npm run check`, build, navegador (AC-012), comprobación del PDF (AC-010).

## Risks

- La base de pruebas compartida entre sesiones rompe la integración si coinciden dos suites (014 D007): se repite en una ventana sin otra ejecución.
- Otra sesión edita el roadmap en el árbol compartido: el cambio va en esta rama y se resuelve al integrar.
