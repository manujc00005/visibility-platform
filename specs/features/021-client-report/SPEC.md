# Feature Spec: Informe para el cliente con resultados en buscadores

## Status

Ready (2026-11-01). Primera spec de la fase C del cierre del MVP con la decisión de pyme primero (`docs/visibility-mvp/19-cierre-mvp-fases.md`), tarea 16 del plan de Codex; resuelve D-15.

## Problem

El informe de Olessium generado hoy se titula «Diagnóstico SEO técnico» y no contiene ninguna cifra de Google, aunque la aplicación tiene Search Console desde la 003. Su apartado de limitaciones afirma «no mide visitas, clics ni posiciones reales en Google», algo que el resumen de la misma empresa desmiente. El objetivo comercial de la 016 no aparece. Las fracciones del informe usan una función propia y siguen mostrando «1 de 1 (100 %)», lo que contradice la 013. Las fuentes dependen del sistema y solo se han revisado en macOS (D-15).

## Goal

El informe responde, con las mismas cifras que el resumen, si a la empresa la encuentran en Google y si la medición de su objetivo está comprobada. Sus límites describen lo que el informe contiene de verdad. El PDF se ve igual en macOS y en Linux.

## Non-goals

- Acciones realizadas y pendientes de seguimiento: dependían de la 019, fuera por pyme primero. Las recomendaciones siguen siendo la lista de trabajo.
- Bing, Analytics general o la comparativa en el informe.
- Traducir el informe: sigue en español (D006 de la 003-i18n).
- Cambiar qué mide cada fuente o el resumen.
- Enviar el informe: lo entrega el operador.

## Users / Actors

- Propietario: lee el PDF.
- Operador: lo genera y lo revisa antes de entregarlo.

## Current behavior

- `createReport` congela empresa, auditoría y la medición real de IA en un HTML sin red e imprime el PDF.
- `geoSection` usa `frac` propia.
- `LIMITATIONS` declara siempre que no hay datos del propietario.
- `REPORT_STYLES` usa fuentes del sistema; `render-pdf.ts` pone «Diagnóstico SEO técnico» en el pie.

## Desired behavior

1. Portada y pie dicen «Diagnóstico de visibilidad».
2. El resumen ejecutivo añade una frase sobre Google: con impresiones, clics e impresiones del periodo; sin impresiones, que Search Console no registra ninguna; sin captura, que el posicionamiento está pendiente de medir.
3. Nuevo apartado «Resultados en buscadores», tras el resumen, con clics, impresiones, CTR y posición media, su comparación con los 28 días anteriores, el periodo y la fecha de la captura. Sin impresiones, una frase. Sin captura, una frase neutra, nunca un fallo técnico ni el email de la cuenta de servicio.
4. Si hay objetivo comercial, el apartado lo muestra con la misma frase y notas que el resumen. Sin objetivo no dice nada.
5. Las fracciones de IA usan `fraction` de la 013.
6. Limitaciones según el contenido: con datos de Search Console explica que Google omite búsquedas y que la posición es una media; sin ellos conserva la frase actual; con objetivo explica que son eventos clave desde buscadores, no clientes ni ventas.
7. El PDF lleva sus fuentes dentro: Geist para texto y Geist Mono para URLs, embebidas en el HTML sin red. Los caracteres fuera del subconjunto usan una alternativa de la misma línea.

## Functional requirements

- FR-001 `ReportInput.search: ReportSearch` con `state` (`measured` | `no_impressions` | `not_measured`), `period`, `capturedAt`, cifras formateadas y cambios, y `goal: { text, notes } | null`.
- FR-002 `createReport` calcula `search` con `summarizeSearchConsole` y `summarizeGoal` en `es`, con `latestSearchConsole`, `latestAnalytics`, `getGoal` y `goalEvidence`: las cifras no se recalculan.
- FR-003 `ReportDeps.searchConsoleConfig` opcional; la acción pasa la configuración real.
- FR-004 Ningún texto de fallo (`lastFailure`, `reason` con email) llega al informe.
- FR-005 Numeración de apartados correlativa con y sin IA.
- FR-006 `TEMPLATE_VERSION` nueva. Los informes guardados no cambian.
- FR-007 `src/modules/reports/report-fonts.ts` con Geist y Geist Mono en base64 (SIL OFL 1.1) y `@font-face` en `REPORT_STYLES`. El render sigue sin peticiones de red (`blockedRequests` vacío).
- FR-008 D-15 se cierra con un PDF generado en un contenedor Linux y revisado.

## Non-functional requirements

- Security: todo dato pasa por la plantilla con escape; sin secretos ni emails; sin recursos externos.
- Determinism: mismo input, mismo documento.
- Performance: el HTML guardado crece con las fuentes; generar sigue siendo por petición.

## API / Interface changes

- `ReportInput.search`, `ReportDeps.searchConsoleConfig`.

## Data model changes

Ninguno: el HTML y el PDF se guardan como hasta ahora.

## Edge cases

- Captura con impresiones solo en el periodo anterior: cifras a cero con su cambio.
- Fallo posterior a una captura buena: se usa la captura, sin mencionar el fallo.
- Captura antigua: se ve por su periodo y fecha.
- Objetivo pendiente sin GA4: frase y nota de conectar, igual que el resumen.
- Empresa sin auditoría: no hay informe (sin cambios).
- Nombre de objetivo hostil: escapado.

## Acceptance criteria

- AC-001 Con impresiones, el apartado y el resumen ejecutivo muestran las cifras y cambios de `summarizeSearchConsole`; sin impresiones y sin captura, sus frases, sin ceros ni fallos.
- AC-002 Un fallo con email de la cuenta de servicio no aparece en el informe.
- AC-003 Con objetivo, la frase y las notas coinciden con `summarizeGoal`; sin objetivo, no hay rastro.
- AC-004 Limitaciones según contenido en los tres casos; sin datos conserva la frase anterior.
- AC-005 `fraction` en IA: «1 de 1» sin porcentaje; «2 de 3 (67 %)»; «sin datos» con denominador cero.
- AC-006 Numeración correlativa con y sin IA; determinista; sin scripts ni recursos externos más allá de las fuentes en `data:`.
- AC-007 PDF real con `blockedRequests` vacío y fuentes embebidas.
- AC-008 Generados en `dev`: Olessium y la clínica, revisados visualmente; cifras iguales a las del resumen; ninguna medición de prueba.
- AC-009 PDF generado en Linux, revisado (D-15).
- AC-010 Lint, typecheck, unitarias, integración y build en verde.

## Test scenarios

- Unit: `build-report.test.ts`.
- Integration: `reports.test.ts`, `render-pdf.test.ts`.
- Manual: AC-008, AC-009.

## Assumptions

- Search Console es la cifra que importa al propietario; Bing y Analytics siguen en la aplicación.
- Geist es la fuente de la aplicación y su licencia permite embeberla.

## Open questions

- Ninguna.

## Contracted services

Esta feature no añade servicios de pago.
