# Feature Spec: Página «Google» por preguntas, acciones con alcance y tarjetas compactas

## Status

Ready (2026-11-01). Tercera spec de la fase B del cierre del MVP (`docs/visibility-mvp/19-cierre-mvp-fases.md`), hallazgos 7, 8, 9 y 13 de la auditoría de Codex del 2026-11-01.

## Problem

La página «Google» apila once secciones de cuatro herramientas distintas: el operador recorre Search Console, Bing, Analytics, competidores, salud técnica, áreas, problemas, Lighthouse e histórico para responder una pregunta. La comparativa tiene once columnas. Cada botón dice «Actualizar datos» o «Ejecutar auditoría» sin aclarar qué actualiza ni si gasta cuota. Las tarjetas del resumen acumulan descripción, cifras, limitaciones, comparación y fuente: en móvil la primera ocupa casi toda la pantalla. Los competidores se gestionan dentro de la configuración de IA aunque la comparativa está en la página «Google». La 015 prometió un sitio de configuración por empresa y aún no existe una pestaña que lleve a él.

## Goal

La página «Google» se organiza en cuatro bloques por pregunta (resultados, consultas y páginas, salud técnica, competidores) con un índice de saltos. Cada acción dice qué actualiza. La comparativa muestra cinco columnas y deja el resto un clic más abajo. Las tarjetas del resumen se quedan en estado, cifra, una frase, fecha y enlace, y la metodología vive en el detalle. La pestaña «Configuración» lleva a una pantalla con la ficha, el objetivo, los competidores y las fuentes.

## Non-goals

- Cambiar qué se mide, los resúmenes de cada fuente ni sus estados (`summarize*` no cambia).
- Renombrar la pestaña «Google» a «Buscadores».
- Cambiar la ruta `/edit`: la pestaña «Configuración» apunta a ella.
- Un botón general que actualice todas las fuentes.
- Una próxima acción dentro de la página «Google»: vive en el resumen (`OpportunityLead`).
- La comprobación humana de la 002 (AC-018): necesita personas ajenas y no se simula.
- La configuración de la medición en IA (preguntas, alias): sigue en `/geo/setup`.

## Users / Actors

- Propietario: lee las tarjetas y encuentra resultados antes que detalle técnico.
- Operador: localiza cada herramienta por pregunta y sabe qué hace cada botón.

## Current behavior

- `/seo`: `SearchConsoleSection` (cifras, marca/sin marca, tablas), búsquedas seguidas, Bing, Analytics, competidores, salud, áreas, problemas, Lighthouse, histórico, todos al mismo nivel.
- `ComparisonSection` con `COLUMNS` de once métricas.
- La tarjeta de rendimiento lleva descripción, nota de laboratorio, cambio, principal problema y visitantes reales con su fuente. La de IA lleva descripción, nota de muestra, citas, cambio, principal oportunidad y nota al pie.
- `/geo/setup` contiene el bloque de competidores: lista, alta, perfil de negocio y sugerencias.
- `WorkspaceNav`: Resumen · Rendimiento · Google · Presencia en IA.

## Desired behavior

1. **Cuatro bloques en `/seo`.** Índice de saltos bajo las pestañas y, en este orden, cuatro `h2`:
   - «Resultados en buscadores»: cifras de Search Console; Bing y Google Analytics como apartados `h3` debajo (conservan `#ranking-title`, `#bing-title`, `#analytics-title`, porque el panel de fuentes enlaza a ellos).
   - «Consultas y páginas»: marca y sin marca, búsquedas seguidas, tablas de búsquedas y páginas, nota de privacidad.
   - «Salud técnica»: resumen, estado por área y problemas abiertos; Lighthouse e histórico en un `<details>` cerrado.
   - «Competidores»: comparativa.
2. **Acciones con alcance.** «Analizar portada» (antes «Ejecutar auditoría»); «Sincronizar Search Console», «Sincronizar Bing», «Sincronizar Google Analytics» (antes «Actualizar datos»); «Comparar (consume PageSpeed)» y «Volver a comparar (consume PageSpeed)»; «Medir preguntas en IA» (antes «Iniciar medición»). «Traer datos de…» se conserva para la primera lectura.
3. **Comparativa.** Tabla principal con Rendimiento, SEO, LCP, Críticos y Autoridad. Las once columnas siguen disponibles en un `<details>` «Ver todas las métricas». El detalle por fila aparece solo en la tabla principal.
4. **Tarjetas del resumen.** Sin párrafo de descripción. Rendimiento: puntuación, nota de laboratorio, motivo si no se midió, cambio y principal problema; visitantes reales pasa al detalle. Google: sin cambios más allá de quitar la descripción. IA: cifra, nota de muestra o motivo, citas y cambio; la principal oportunidad y la nota al pie pasan a la página de IA y a las oportunidades del resumen, donde ya están. La metodología no va en un `<details>` dentro de la tarjeta: la tarjeta es un único enlace (002, FR-003) y no admite controles dentro.
5. **Configuración.** La pestaña «Configuración» (`/edit`) se añade a `WorkspaceNav`. La pantalla lleva cabecera con migas y pestañas, y en orden: ficha, objetivo comercial, competidores, fuentes de datos.
6. **Competidores en Configuración.** El bloque de competidores se mueve de `/geo/setup` a `/edit`. `/geo/setup` conserva una línea con enlace a él. La comparativa enlaza a `/edit#competitors`.

## Functional requirements

- FR-001 `SearchConsoleSection` conserva cabecera, cifras, avisos y fuente. Nuevo `SearchConsoleQueries` con marca/sin marca, tablas, avisos de datos anteriores y nota de privacidad; no renderiza nada sin cifras o en estado `empty`.
- FR-002 `Section` de `/seo` acepta nivel de encabezado (`h2`, `h3`). Índice `nav` con cuatro enlaces de ancla a `#results-title`, `#queries-title`, `#health-title`, `#competitors-title`.
- FR-003 Catálogo: `seoPage.blocks.{results,queries,health,competitors}` y `seoPage.jump`, `seoPage.technicalDetail`; `audits.runButton.run`/`running`, `searchConsole.button.update`, `bingWebmaster.button.update`, `analytics.button.update`, `competitorComparison.button.run`/`rerun`, `geo.forms.run.submit`/`pending`, `overview.emptyAction`.
- FR-004 `ComparisonSection`: `KEY_COLUMNS` de cinco métricas; `Cells` recibe la lista y agrupa las ausencias solo entre columnas contiguas de la misma fuente; `Row` pinta el detalle por fila solo en la tabla principal. Tabla completa en `<details>`, con su propia etiqueta.
- FR-005 `OverviewCard`: `description` opcional; las tres tarjetas dejan de pasarla. `overview.cards.{performance,seo,ai}.description` se retiran junto con lo que quede sin uso (`AiFootnote`, `topOpportunity`, `notMentioned`, `fieldSource`, `footnote`).
- FR-006 `WorkspaceSection` añade `settings`; `/edit` usa `PageHeader` y `WorkspaceNav`. `overview.nav.settings`.
- FR-007 Componente de servidor `CompetitorsPanel` con la lista, alta, perfil y sugerencias, con los datos que hoy carga `/geo/setup`. `/geo/setup` deja de cargarlos salvo lo que usen las preguntas sugeridas. `revalidateGeo` añade `/edit`.
- FR-008 Enlaces: `manageHref` a `/edit#competitors`; `/geo/setup` enlaza a `/edit#competitors`.
- FR-009 Spec 002: nota de sustitución en Desired behavior 2 y 4, AC-012 y AC-022. Spec 015: D001 se cumple con la pestaña; nota en DECISIONS de la 017.
- FR-010 Textos en `es` y `en`.

## Non-functional requirements

- Performance: `/edit` añade las lecturas de competidores, perfil y extracción; ninguna llamada externa.
- Accessibility: orden de encabezados `h1 > h2 > h3`; `<details>` nativo; índice con `aria-label`; las tablas conservan su semántica.
- Maintainability: la lógica de datos no cambia; todo es presentación y traslado.

## API / Interface changes

- `SearchConsoleQueries`, `CompetitorsPanel` y `KEY_COLUMNS` nuevos. `OverviewCard.description` opcional. `WorkspaceSection` amplía.

## Data model changes

Ninguno.

## Edge cases

- Sin cifras de Search Console: el bloque «Consultas y páginas» muestra solo las búsquedas seguidas.
- Enlace `#finding-…` desde el estado por área: los problemas están fuera del `<details>`.
- Enlace `#bing-title` desde el panel de fuentes: Bing no está plegado.
- Competidor sin datos de Lighthouse: en la tabla principal, Rendimiento y SEO comparten el motivo; LCP, Críticos y Autoridad muestran el suyo.
- Empresa sin competidores: la comparativa enlaza a Configuración.
- A 375 px: índice y tablas sin desbordar la página.

## Acceptance criteria

- AC-001 `/seo` muestra los cuatro `h2` en orden, con el índice; los anclas `#ranking-title`, `#bing-title` y `#analytics-title` siguen existiendo; Lighthouse e histórico están en un `<details>` cerrado y `#finding-…` fuera de él.
- AC-002 `SearchConsoleSection` ya no pinta marca/sin marca, tablas ni nota de privacidad; `SearchConsoleQueries` sí, y en `empty` o sin cifras no pinta nada.
- AC-003 Los botones dicen lo que actualizan en `es` y `en`; ningún botón dice «Actualizar datos» ni «Ejecutar auditoría»; `overview.emptyAction` nombra el botón nuevo.
- AC-004 La tabla principal de la comparativa tiene cinco columnas y el detalle por fila; «Ver todas las métricas» contiene las once; una ausencia por fuente sigue explicada en ambas.
- AC-005 Las tarjetas no tienen párrafo de descripción; la de rendimiento no muestra visitantes reales; la de IA no muestra oportunidad ni nota al pie; siguen siendo un único enlace sin controles dentro.
- AC-006 `WorkspaceNav` muestra «Configuración» con `aria-current` en `/edit`; la pantalla lleva ficha, objetivo, competidores y fuentes.
- AC-007 Añadir, quitar y detectar competidores funciona desde `/edit`; `/geo/setup` ya no los gestiona y enlaza a Configuración; la comparativa enlaza a `/edit#competitors`.
- AC-008 Spec 002 anotada (FR-009).
- AC-009 En navegador sobre `dev`, 1280 y 375 px, en `es` y `en`: `/seo`, resumen y Configuración sin desbordamiento de página, y el recorrido de competidores.
- AC-010 Lint, typecheck, unitarias, integración y build en verde.

## Test scenarios

- Unit: `section-render.test.ts` (reparto entre los dos componentes), `comparison` `section-render.test.ts`, `header`/nav, catálogos.
- Integration: sin cambios de datos; regresión.
- Manual: AC-001, AC-005, AC-007, AC-009.

## Assumptions

- La ruta `/edit` es «Configuración» hasta que haga falta otra.
- Cinco columnas elegidas: una por pregunta (velocidad, SEO técnico, experiencia real, problemas, autoridad).

## Open questions

- Ninguna.

## Contracted services

Esta feature no añade servicios de pago.
