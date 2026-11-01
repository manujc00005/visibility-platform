# Feature Spec: Tarjeta «Visibilidad en Google»: posicionamiento y salud técnica separados

## Status

Ready (2026-11-01). Fase A del cierre del MVP (`docs/visibility-mvp/19-cierre-mvp-fases.md`), hallazgo 2 de la auditoría de Codex del 2026-11-01 y recomendación 05 de su plan; cierra D-31 del roadmap.

## Problem

La tarjeta «Visibilidad en Google» del resumen muestra «Bien» con cero críticos y cero importantes para Olessium, y debajo, en una línea pequeña, que Search Console no registra impresiones. La spec 002 definió ese diseño como «proxy honesto mientras Search Console no esté conectado» (002, Desired behavior 3). Desde la 003 Search Console está conectado y la condición ya no se cumple: una pyme lee «me encuentran bien en Google» cuando lo que se midió fue la portada.

En la página «Google», la sección de Search Console con una propiedad reciente enseña «Conectado» con cuatro ceros, «Sin datos del periodo anterior» en cada cifra y la nota de privacidad, sin decir que la propiedad aún no tiene impresiones (D-31; 003 D007). Bing y GA4 ya tienen ese estado vacío.

Las tres tarjetas usan etiquetas distintas para estados equivalentes («No medida», «Sin datos», «Sin mediciones», «Medido», «Conectado»), y Codex pide un vocabulario compartido.

## Goal

La tarjeta «Visibilidad en Google» dice primero lo que mide Search Console (clics e impresiones de los últimos 28 días con su cambio, o el motivo por el que no hay cifra) y, aparte y rotulada como tal, la salud técnica de la portada. Una portada sin errores con cero impresiones no produce un aprobado de posicionamiento; la falta de conexión tampoco. Los estados de las tres tarjetas comparten una tabla de etiquetas. Search Console a cero se presenta como estado vacío explicado.

## Non-goals

- Cambiar lo que mide Search Console, los periodos, el retardo de 3 días o las capturas.
- Un semáforo o veredicto para clics e impresiones: no hay escala de «bien/mal» sin un objetivo por empresa (spec 016 del doc 19).
- Cambiar la tarjeta de rendimiento más allá de la etiqueta compartida; sus veredicios Bien/Mejorable/Mal siguen.
- Tocar las secciones de Bing y GA4 de la página «Google» (ya tienen estado vacío) ni reorganizar esa página (spec 017).
- Las oportunidades del resumen: siguen basadas en la auditoría técnica.
- El informe PDF.

## Users / Actors

- Propietario: lee la tarjeta y entiende si le encuentran en Google y, aparte, si la portada tiene problemas técnicos.
- Operador: ve en la página «Google» por qué una propiedad reciente no tiene cifras.

## Current behavior

- `SeoCard` en `src/app/workspaces/[id]/page.tsx`: pill con `t.verdict[tone]` de la auditoría técnica bajo el título «Visibilidad en Google»; titular con críticos e importantes; línea `gsc.cardLine` («En Google: … (Search Console)» o «sin impresiones» o «falta conectar»).
- `summarizeSearchConsole` devuelve `state` `ok` con totales a cero en ambos periodos; `cardLine` se calcula ahí.
- `SearchConsoleSection`: con `ok` muestra siempre la rejilla de cifras, la separación con/sin marca, tablas y nota de privacidad.
- `overview.states` tiene `not_configured: "No medida"`, `no_data`, `analyzing`, `partial`, `error`; la tarjeta de IA tiene su propio `status` con «Medido», «Sin configurar», «Sin mediciones», «Recogiendo respuestas».

## Desired behavior

1. **Tarjeta «Visibilidad en Google».** Estado y titular según Search Console:
   - `ok` (hay impresiones en el periodo): pill «Medido» (neutro); titular «N clics · M impresiones» con el cambio de clics frente a los 28 días anteriores o su nota; línea con el periodo.
   - `empty` (sin impresiones en los dos periodos): pill «Sin impresiones» (neutro); titular «Sin impresiones registradas en este periodo»; línea con el periodo.
   - `no_data` (credencial válida, sin captura): pill «Sin datos»; titular «Posicionamiento pendiente de medir»; línea «Todavía no se han traído datos de Search Console».
   - `not_configured` o `invalid_config`: pill «Sin configurar» (neutro); titular «Posicionamiento pendiente de medir»; línea «Falta conectar Google Search Console».
   - `error` sin captura buena: pill «Error» (malo); titular «Sin resultado»; línea «No se pudieron leer los datos de Search Console».
   - Si existe captura buena y el último intento falló, aviso «El último intento de actualización falló; se muestra la captura anterior».
   - Antigüedad de la captura: aviso «Posicionamiento: datos de hace N días» (> 30 días).
2. **Salud técnica, aparte.** Dentro de la misma tarjeta, un bloque secundario titulado «Salud técnica de la portada» con su propio pill (los mismos estados y veredictos que hoy: Bien/Mejorable/Mal, «(parcial)», Sin datos, Analizando, Error), «N críticos · M importantes», el cambio comparable o su nota, y los avisos de intento y antigüedad de la auditoría, prefijados «Salud técnica:». Sin auditoría: «Sin auditoría».
3. **Pie de la tarjeta:** «Search Console · {fecha de captura o estado} · Auditoría técnica · {fecha o estado}».
4. **Vocabulario compartido.** Una tabla `overview.states` con `not_configured` «Sin configurar», `no_data` «Sin datos», `analyzing` «Analizando», `partial` «Parcial», `error` «Error», `ok` «Medido», `empty` «Sin actividad» (pill genérico; la tarjeta de Google usa «Sin impresiones» como caso concreto) y `not_measured` «No medida». Las tres tarjetas toman de ahí todas sus etiquetas de estado; solo quedan específicas: en rendimiento, `not_configured` y `partial` muestran «No medida» (la medición no ocurrió: cuota, error, clave, portada ilegible), y en IA `analyzing` es «Recogiendo respuestas» y `no_data` es «Sin mediciones».
5. **Search Console vacío (D-31).** `summarizeSearchConsole` devuelve `state: "empty"` cuando la captura buena tiene cero impresiones en los dos periodos, con `reason` «Search Console no registra impresiones de esta web en los últimos 56 días. Si la propiedad es reciente, Google tarda unos días en acumular datos.» La sección muestra pill «Sin impresiones», el motivo, el botón «Actualizar datos» y la línea de fuente con el periodo; oculta la rejilla de cifras, la separación con/sin marca, las tablas y la nota de privacidad. Con impresiones solo en el periodo anterior (caída a cero), sigue siendo `ok` con cifras y cambio.
6. **Spec 002.** Se anota en su SPEC que esta spec sustituye el punto 3 de «Desired behavior» y la parte de la tarjeta Google de AC-014 y AC-016.

## Functional requirements

- FR-001 `SearchConsoleState` añade `empty`; `summarizeSearchConsole` lo devuelve con `metrics`, `period`, `property`, `capturedAt` y `segments` rellenos como en `ok`, y `reason` `t.reasons.empty`. Condición: `totals.impressions === 0 && previousTotals.impressions === 0`.
- FR-002 Se elimina `cardLine` y `searchConsole.card.*`: la tarjeta compone su texto desde `state`, `metrics` y `period`.
- FR-003 Función pura `summarizeGoogleCard(gsc, seo, now, locale)` en `src/modules/overview/google.ts` que devuelve: `ranking: { state, status: { tone, label }, headline: { kind: "figures", clicks, impressions } | { kind: "text", text }, change, changeNote, line, period }`, `technical: { status: { tone, label }, headline: { critical, warning } | null, title, verdict, change, comparisonNote, reason }`, `notices` (tipo `Notice`) y `source`. `seo` es la `SeoSummary` actual, sin cambios.
- FR-004 Etiquetas de `ranking.status` según «Desired behavior» 1, tomadas de `overview.states` salvo `empty`, que usa `overview.cards.seo.noImpressionsLabel` («Sin impresiones»).
- FR-005 El bloque técnico conserva la lógica actual de `SeoCard` para tono y etiqueta (veredicto con `(parcial)`, estados) y los textos de cambio y comparación; sus avisos llevan el prefijo `overview.cards.seo.technicalPrefix`.
- FR-006 `SeoCard` renderiza `summarizeGoogleCard`: cabecera y pill de posicionamiento, titular, línea, bloque técnico con su pill pequeño y cifras, avisos y pie. Sigue siendo un único enlace a `/seo` sin elementos interactivos dentro.
- FR-007 `overview.states` según «Desired behavior» 4 en `es` y `en`; `PerformanceCard` y `AiCard` toman sus etiquetas de ahí con las excepciones indicadas; `overview.cards.ai.status` queda reducido a las dos excepciones.
- FR-008 `SearchConsoleSection`: `STATUS_TONE.empty = "neutral"`, `t.status.empty` «Sin impresiones»; en `empty` oculta rejilla, segmentos, tablas y nota de privacidad, y muestra motivo, botón «Actualizar datos» (si hay credencial), avisos de intento fallido y línea de fuente.
- FR-009 La spec 002 recibe una nota de sustitución en «Desired behavior» 3, AC-014 y AC-016.
- FR-010 Textos nuevos en `es` y `en`; los existentes que se vuelvan huérfanos (`card.line`, `card.noImpressions`, `cards.seo.searchConsole` si deja de usarse) se eliminan del catálogo y de `messages.test.ts`.
- FR-011 Las oportunidades, la gráfica y el detalle técnico de la página «Google» no cambian.

## Non-functional requirements

- Performance: ninguna lectura nueva; la tarjeta usa `gscStored` y los audits que el resumen ya carga.
- Security: sin entrada nueva; los textos del catálogo se indexan por estados acotados.
- Accessibility: el pill del bloque técnico lleva icono y texto, nunca solo color; el bloque técnico tiene un encabezado visible.

## API / Interface changes

- `SearchConsoleState` += `"empty"`. `SearchConsoleSummary.cardLine` eliminado.
- Nuevo `summarizeGoogleCard` exportado desde `@/modules/overview`.
- `Messages.overview.states` amplía claves; `overview.cards.seo` cambia; `searchConsole.status.empty`, `searchConsole.reasons.empty`.

## Data model changes

Ninguno.

## Edge cases

- Captura buena con impresiones solo en el periodo anterior: `ok`, titular «0 clics · 0 impresiones» con cambio «Antes: …».
- Captura buena a cero y último intento fallido: `empty` con aviso del intento.
- Credencial retirada con captura buena guardada: la tarjeta sigue mostrando la captura (`ok`/`empty`); el aviso de configuración vive en la sección.
- Sin auditoría y Search Console `ok`: bloque técnico «Sin auditoría», pie con «sin auditar».
- Auditoría parcial con críticos: bloque técnico «Mal (parcial)» como hoy.
- Ambas fuentes antiguas: dos avisos distinguibles.
- Locale `en`: todas las ramas.

## Acceptance criteria

- AC-001 `summarizeSearchConsole` con ceros en los dos periodos devuelve `empty`, `reason` de FR-001 y `metrics`/`period` rellenos; con ceros solo en el actual devuelve `ok` con cambio; `cardLine` ya no existe.
- AC-002 `summarizeGoogleCard` en los seis estados de «Desired behavior» 1 devuelve el pill, el titular y la línea indicados, en `es` y `en`; con impresiones, `change` es el de clics.
- AC-003 Con portada sin errores y Search Console `empty`, `ranking.status.label` es «Sin impresiones» y `technical.status.label` es «Bien»: el aprobado solo aparece en el bloque técnico. Con Search Console `not_configured`, `ranking.status.label` es «Sin configurar».
- AC-004 Avisos: captura antigua da «Posicionamiento: datos de hace N días»; auditoría antigua da «Salud técnica: datos de hace N días»; intento de auditoría fallido da «Salud técnica: …»; último intento de Search Console fallido con captura buena da el aviso de FR-003.
- AC-005 `overview.states` contiene las ocho claves en `es` y `en`; la tarjeta de rendimiento muestra «No medida» en `partial` y `not_configured`, «Sin datos» en `no_data`; la de IA «Medido», «Parcial», «Error», «Sin configurar» desde la tabla y «Recogiendo respuestas», «Sin mediciones» como excepciones; `cards.ai.status` solo tiene esas dos claves.
- AC-006 `SearchConsoleSection` en `empty` renderiza «Sin impresiones», el motivo y la fuente, y no renderiza la rejilla de cifras ni la nota de privacidad; en `ok` renderiza todo como antes (prueba de render existente intacta).
- AC-007 En navegador sobre `dev`, el resumen de Olessium muestra la tarjeta con «Sin impresiones» arriba y «Salud técnica de la portada · Bien · 0 críticos · 0 importantes» debajo; la página «Google» muestra la sección de Search Console vacía explicada; la clínica (sin credencial para su propiedad) muestra el estado que le corresponda sin «Bien» en el pill principal. A 375 px sin desbordamiento.
- AC-008 La spec 002 lleva la nota de sustitución (FR-009).
- AC-009 Lint, typecheck, unitarias, integración y build en verde.

## Test scenarios

- Unit: `summary.test.ts` (estado `empty`, retirada de `cardLine`); nuevo `tests/unit/overview/google.test.ts` (seis estados, avisos, bloque técnico, `en`); `tests/unit/overview/i18n-en.test.ts` y `messages.test.ts` (claves nuevas y retiradas); `section-render.test.ts` (estado vacío).
- Integration: no hay cambios de datos; la suite completa se ejecuta por regresión.
- Manual: AC-007.

## Assumptions

- «Medido» en neutro es la etiqueta correcta para clics e impresiones: describe que hay cifra, no que sea buena. Un veredicto necesita un objetivo (spec 016).
- `empty` exige ceros en ambos periodos, como en GA4; una caída a cero en el periodo actual es información y se muestra como `ok` con cambio.
- Las secciones de Bing y GA4 ya cumplen el vocabulario en lo esencial («Sin visitas», «Procesando»); unificar sus pills queda para la 017.

## Open questions

- Ninguna.

## Contracted services

Esta feature no añade servicios de pago.
