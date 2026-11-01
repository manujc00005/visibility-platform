# Feature Spec: Origen y estados de la medición en IA

## Status

Ready (2026-11-01). Fase A del cierre del MVP (`docs/visibility-mvp/19-cierre-mvp-fases.md`), hallazgos 1, 3, 4 y 12 de la auditoría de Codex del 2026-11-01.

## Problem

La medición de Olessium del 2026-10-25 contiene respuestas «[RESPUESTA DE PRUEBA]» y es la única completada. `summarizeAi` la toma como resultado, la tarjeta de IA del resumen la cuenta como una mención y una cita, la página «Presencia en IA» la muestra como presencia real y `createReport` la imprimiría en el PDF. No existe ningún campo que distinga una medición real de una de prueba o de demostración: la demo de Buchhandlung Müller solo se reconoce por el nombre de la empresa (doc 17 §7, roadmap D-23).

Además, el detalle de una medición (`/geo/runs/[runId]`) contradice al resumen: donde el resumen dice «Parcial», el detalle dice «Completada» y pone «Respuestas recogidas: 3 de 3 (100 %)» como primera cifra, y una observación «Recogida» cuyo contenido es «Sin respuesta». Con una sola respuesta válida, el detalle titula «1 de 1 (100 %)» y una tabla «Cuota» con 50 % frente a un competidor.

Por último, el bloque «Preguntas y oportunidades de contenido (AEO)» promete un análisis de contenido que no existe; la advertencia ya lo dice, pero el título no.

## Goal

Ninguna medición de prueba o demostración altera un resultado real, una comparación ni un informe. El detalle de una medición dice lo mismo que el resumen, antepone las respuestas válidas a las recogidas y no presenta porcentajes sobre muestras de menos de tres observaciones. Las dos mediciones de prueba de `dev` quedan reclasificadas y visibles con su rótulo.

## Non-goals

- Analizar contenido de la web para AEO (P2 del doc 19).
- Cambiar las métricas de `computeGeoMetrics`, la comparabilidad (`methodologyKey`) ni el modelo de observaciones.
- Borrar mediciones. Las de prueba se reclasifican; el borrado sigue siendo manual.
- Un modo demostración global de la aplicación o fixtures nuevas.
- Cambiar la tarjeta «Visibilidad en Google» (spec 014).
- Tocar DataForSEO (BL-01) o la captura asistida.

## Users / Actors

- Operador: elige el origen al lanzar una medición; ve el rótulo en histórico y detalle.
- Propietario (lector del resumen y del informe): no ve nunca una cifra apoyada en datos de prueba.

## Current behavior

- `geo_runs` tiene `provider`, `status`, `config`, `methodology_key`, fechas. Sin origen.
- `summarizeAi(runs)` elige la run completada más reciente con alguna observación completada; `compareRuns` compara con la completada inmediatamente anterior.
- `createReport` elige la run completada más reciente con `answers.k > 0` del proveedor permitido.
- El histórico de `/geo` lista todas las runs con proveedor y estado.
- `fraction()` devuelve «k de n (p %)» siempre que `n > 0`.
- El detalle muestra cuatro tarjetas (menciona, cita, preguntas con presencia, recogidas) y una tabla «Cuota».

## Desired behavior

1. Al lanzar una medición, el operador elige su origen: real (por defecto), demostración o prueba interna. Queda congelado en la fila.
2. Resumen, página «Presencia en IA», comparación entre mediciones e informe solo consideran mediciones reales. Si una empresa solo tiene mediciones de demostración o prueba, el estado es «Sin mediciones» con una frase que lo explica.
3. El histórico lista todas las mediciones; las que no son reales llevan el rótulo «Demostración» o «Prueba interna». El detalle de una de ellas abre con un aviso de que no cuenta en ningún resultado.
4. El detalle de una medición real muestra el mismo estado y la misma explicación que el resumen («Medido» o «Parcial» con su motivo), antes de las cifras.
5. Las tarjetas del detalle se ordenan: preguntas con presencia, te menciona, cita tu web, respuestas válidas (sobre recogidas), respuestas recogidas (sobre previstas).
6. `fraction()` omite el porcentaje cuando el denominador es menor que 3.
7. La tabla de comparación del detalle se titula «Menciones entre las marcas comparadas» y declara el denominador: «N menciones en M respuestas a preguntas que no nombran tu marca, en esta medición». La columna «Cuota» pasa a «Proporción».
8. El bloque AEO se titula «Preguntas que conviene revisar» (es) / «Questions worth reviewing» (en).
9. En `dev`, la medición `0361e4ad…` de Olessium pasa a `test` y la `3709cad2…` de Buchhandlung Müller pasa a `demo`.

## Functional requirements

- FR-001 Columna `geo_runs.origin` texto, no nula, por defecto `real`, con `CHECK` en (`real`, `demo`, `test`). Migración aditiva; las filas existentes quedan `real` hasta FR-010.
- FR-002 `createGeoRun` acepta `origin` opcional (`real` por defecto) validado por enumeración; se guarda en la fila y **no** entra en `config` ni en `methodologyKey` (una demo con la misma configuración es comparable técnicamente; la exclusión es por origen, no por clave).
- FR-003 `RunLike` lleva `origin`. `summarizeAi` descarta antes de nada las runs cuyo origen no sea `real`: no son resultado, ni intento, ni comparación. Si descartó alguna y no queda ninguna, `reason` es `onlyNonReal` («Solo hay mediciones de demostración o prueba: no cuentan como resultado.») y el estado es `no_data` (o `not_configured` si no hay preguntas).
- FR-004 `createReport` solo considera runs con `origin = 'real'`.
- FR-005 Histórico de `/geo`: rótulo por origen distinto de `real`, en `es` y `en`. Detalle: aviso en la cabecera para origen distinto de `real`.
- FR-006 Función pura `runResultState(metrics, status)` en `overview/ai.ts` que devuelve el estado y la frase que `summarizeAi` ya calcula para una run (`ok`, `partial`, `analyzing`, `error`) con el mismo catálogo. El detalle lo muestra con `StatusPill` y la frase, antes de las tarjetas.
- FR-007 Tarjetas del detalle en el orden de «Desired behavior» 5, con una nueva `answers` («Respuestas válidas», «Con contenido sobre las recogidas»).
- FR-008 `fraction()` sin porcentaje si `n < 3`; `labels.fraction` sigue existiendo y se añade `labels.fractionSmall(k, n)` = «k de n».
- FR-009 Comparación del detalle: título, frase de denominador con `shareOfVoice.total` y `brandPresence.n`, columna «Proporción». Sin cambios en el informe PDF (ya imprime solo menciones).
- FR-010 Reclasificación en `dev` con una actualización por id, reversible, registrada en TASKS con los ids y el `UPDATE` ejecutado. No se añade ninguna lista de ids ni de textos al código.
- FR-011 Título del bloque AEO en `es` y `en`; el resto del bloque no cambia.
- FR-012 Textos nuevos en `es` y `en`.

## Non-functional requirements

- Performance: ninguna consulta nueva; el filtro por origen es en memoria sobre lo que ya se cargaba.
- Security: `origin` validado por enumeración en servidor y por `CHECK` en base. Perímetro D-03 sin cambios.
- Maintainability: un solo punto de exclusión en `summarizeAi` y otro en `createReport`; el histórico no filtra, rotula.

## API / Interface changes

- `createGeoRun(db, workspaceId, raw, deps)`: `raw.origin` opcional.
- `RunLike.origin: GeoRunOrigin` (obligatorio en el tipo).
- `runResultState(metrics, status, locale)` exportada desde `@/modules/overview`.
- `RunForm` recibe las etiquetas de origen por props y muestra un `select name="origin"`.
- `fraction()` cambia su salida para `n < 3`.

## Data model changes

- `geo_runs.origin text not null default 'real'` + `geo_runs_origin_valid CHECK`. Migración `0017_geo_run_origin`.

## Edge cases

- Run `demo` en curso (`collecting`): no aparece como intento en el resumen; sí en el histórico con rótulo.
- Empresa con una real antigua y una demo nueva: el resumen muestra la real con su antigüedad; la demo no la sustituye ni la re-fecha.
- Comparación: real → demo → real: la segunda real compara con la primera real (la demo no está en la lista).
- `origin` ausente en el formulario (clientes antiguos): `real`.
- `origin` fuera de enumeración: error de validación, nada creado.
- `fraction({k:1,n:1})` → «1 de 1»; `fraction({k:2,n:3})` → «2 de 3 (67 %)»; `fraction({k:0,n:0})` → «Sin datos».
- Informe con solo runs `test`: sin sección de IA y `geoRunId` nulo.

## Acceptance criteria

- AC-001 La migración añade la columna con su `CHECK`; insertar `origin = 'fake'` falla con `geo_runs_origin_valid`; las filas existentes leen `real`.
- AC-002 `createGeoRun` con `origin: "demo"` guarda `demo`; sin `origin`, `real`; con `origin: "x"`, `validation` y ninguna fila creada. `methodologyKey` es igual con y sin `origin`.
- AC-003 `summarizeAi` con una run `demo` completada y evaluada devuelve `no_data` con `reason` `onlyNonReal`, `coverage` nulo y `runId` nulo. Con una `real` anterior y una `demo` posterior, el resultado es la real sin intento. Con real → demo → real, compara las dos reales.
- AC-004 `createReport` con solo una run `test` completada da `geoRunId` nulo y sin sección de IA; con una `real` además, elige la real.
- AC-005 Histórico en `es` y `en` muestra «Demostración» / «Demo» y «Prueba interna» / «Internal test» en las runs no reales y nada en las reales. El detalle de una no real muestra el aviso.
- AC-006 `runResultState` sobre la run con tres preguntas, una sin respuesta válida, da `partial` y la frase «Resultado parcial: 1 pregunta no obtuvo respuesta válida.», idéntica a `summarizeAi` para esa run. Sobre una run completa da `ok`; `collecting` da `analyzing`; completada sin ninguna observación completada da `error`.
- AC-007 El detalle de Olessium (tras FR-010, sobre una real nueva o con fixtures) muestra el pill y la frase antes de las tarjetas; la primera tarjeta es «Preguntas con presencia» y «Respuestas válidas» precede a «Respuestas recogidas».
- AC-008 `fraction` cumple los tres ejemplos de «Edge cases» en `es` y `en`.
- AC-009 La comparación del detalle muestra el título nuevo, la frase con N y M y la columna «Proporción»; la suma de proporciones sigue siendo 100 % cuando hay menciones.
- AC-010 El bloque AEO se titula «Preguntas que conviene revisar» / «Questions worth reviewing».
- AC-011 Tras la reclasificación en `dev`: el resumen de Olessium muestra IA «Sin mediciones» con la frase de FR-003 y ninguna mención ni cita; la tarjeta de Buchhandlung igual; el histórico de ambas muestra el rótulo; un informe nuevo de Olessium no incluye la sección de IA.
- AC-012 Lint, typecheck, unitarias, integración y build en verde.

## Test scenarios

- Unit: `summarizeAi` con orígenes mezclados; `runResultState` en los cuatro estados y equivalencia con `summarizeAi`; `fraction` con `n` 0, 1, 2, 3; catálogos `es`/`en` con las claves nuevas; render de la página de detalle y del histórico en `en` si existe prueba de render (`run-meta.test.ts`).
- Integration: migración y `CHECK`; `createGeoRun` con y sin origen; `createReport` con `test` y con `real`.
- Manual: AC-007, AC-011 en navegador sobre `dev`.

## Assumptions

- Tres orígenes bastan: `real` (dato del cliente), `demo` (inventado para enseñar la aplicación), `test` (verificación interna). No se prevé un cuarto.
- La reclasificación en `dev` es segura: dos filas, ids conocidos, reversible con el `UPDATE` inverso.
- `fraction` con umbral 3 es una regla de presentación, no estadística; el doc 19 la fija así y Codex pedía quitar el titular porcentual con una observación.

## Open questions

- Ninguna.

## Contracted services

Esta feature no añade servicios de pago.
