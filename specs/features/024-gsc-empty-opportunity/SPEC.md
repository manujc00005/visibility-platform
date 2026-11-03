# Feature Spec: Oportunidad cuando Google no muestra la web

## Status

Done (2026-11-03). T001–T004 hechas con TDD (pruebas en rojo en `be2a655`); AC-005 verificado en navegador sobre `dev` con Olessium a 1280 y 375 px en `es` y `en`; unitarias 1239, integración 283 en solitario, lint, typecheck y build en verde.

## Problem

Olessium dice «Google aún no te muestra en sus resultados» (Search Console conectado, cero impresiones en los dos periodos) y la página termina con «no hemos encontrado acciones prioritarias»: el hallazgo más grave queda sin acción. `buildOpportunities` no lee Search Console.

## Goal

El estado vacío de Search Console (`empty`: conectado y cero impresiones en los dos periodos de 28 días) genera una oportunidad de prioridad media. Dice lo observado, sin inventar la causa; la acción es comprobar en Search Console si Google tiene indexadas las páginas, con «Quién puede hacerlo» como las demás.

## Non-goals

- Sin configurar, sin datos, error o cifras bajas: no generan oportunidad (no hay umbral).
- D002 de la 014 no cambia: la tarjeta sigue sin veredicto; esto es un hecho medido.
- El PDF, «Quién puede hacerlo» una sola vez, el orden de la página, la línea de situación y el resto de P2 de la crítica del 2026-11-02 (anotados en el roadmap).

## Functional requirements

- FR-001 `buildOpportunities` recibe el resumen de Search Console y añade el candidato `search_visibility` (prioridad media) solo con estado `empty`.
- FR-002 Texto en `es` y `en`: título, qué ocurre (lo observado), por qué importa, acción (comprobar la indexación en Search Console), evidencia con el periodo medido, fuente y fecha de la captura, enlace a `/seo#results-title`.
- FR-003 Se mantienen una por tipo, máximo tres y el orden por prioridad.
- FR-004 Spec 002: notas en FR-004 y AC-006; roadmap: entrada y pendientes.

## Acceptance criteria

- AC-001 Con Search Console `empty` hay una oportunidad `search_visibility` de prioridad media, con evidencia, fuente «Search Console», fecha de la captura y enlace a `/seo#results-title`.
- AC-002 Con `ok` (incluido cero en el periodo actual), `no_data`, `not_configured`, `invalid_config` o `error` no hay esa oportunidad.
- AC-003 Con tres candidatos de prioridad igual o mayor, se respeta el máximo de tres y el orden.
- AC-004 El texto no afirma una causa ni lleva veredicto sobre las cifras; existe en `es` y `en`.
- AC-005 En navegador sobre `dev`, Olessium a 1280 y 375 px, en `es` y `en`: la oportunidad aparece y la página ya no termina en «no hemos encontrado acciones prioritarias».
- AC-006 Lint, typecheck, unitarias, integración y build en verde.

## Test scenarios

- Unit (primero, en rojo): `opportunities.test.ts` con los estados de AC-001–AC-003; catálogos.
- Manual: AC-005.
