# Feature Spec: Resumen del propietario

## Status

In Progress (2026-11-02).

## Problem

Tres críticas seguidas del resumen (`.impeccable/critique/`, 25/40 las tres) coinciden en lo que queda: la página sirve a la vez al propietario y al operador, y el propietario no recibe un veredicto legible ni una salida.

- La tarjeta de Google junta dos preguntas: su estado sale de Search Console (014 D001) y el «Mal (parcial)» técnico queda dentro, en un bloque secundario bajo un gris.
- Arriba hay tres baldosas iguales; nada dice en una línea dónde está el negocio.
- Las áreas sin medir ocupan una tarjeta entera con «No medida», «Sin preguntas» y «Ver informe» hacia un informe vacío.
- «Ejecutar auditoría», «Editar», «Configurar» y textos como «Pulsa … arriba o configura las preguntas de IA» hablan al operador.
- Las oportunidades dan una instrucción técnica («Activa un certificado SSL…») sin decir quién puede hacerla.

## Goal

El propietario de la pyme que pagó la auditoría abre el resumen y, en segundos, responde las preguntas de éxito de `PRODUCT.md` (cómo funciona su web, si Google puede leerla, si le encuentran, si aparece en IA) y sabe qué hacer primero. Solo lo observado, con fuente y fecha; sin puntuación compuesta en cifras ni en palabras.

Esta vista es para el propietario. No cierra la decisión de público del doc 19 para la fase C ni cambia `PRODUCT.md`.

## Non-goals

- El informe PDF. Lee los hallazgos guardados con cada auditoría (`modules/reports/build-report.ts`), no `buildOpportunities`; dice «Lo primero que recomendamos:» con los títulos técnicos y «Qué hacer:» por hallazgo, sin quién lo hace ni servicio. No cambia.
- Los textos de las reglas de auditoría: cambiarían los hallazgos que guardan las auditorías futuras y con ellos el PDF.
- «Pedir propuesta de mejora» (Módulo F, P0 en el doc 03): queda pendiente con su propia spec; aquí solo se reserva su sitio.
- D002 de la 014 (Search Console sin veredicto) no cambia.
- `PRODUCT.md`, las páginas de detalle (salvo enlazar sus anclas), la autenticación.
- La línea del objetivo comercial (016) conserva su contenido.

## Users / Actors

- Propietario: lee el resumen una vez, sin conocimientos técnicos.
- Operador: trabaja en Configuración (`/edit`), Rendimiento, Google e IA; «Analizar portada» ya está en `/seo` y `/performance`.

## Current behavior

- Cabecera con «Analizar portada» y «Editar»; línea del objetivo; franja de la primera oportunidad; tres tarjetas en tres columnas (Rendimiento · Visibilidad en Google · Presencia en IA); oportunidades.
- `summarizeGoogleCard` compone Search Console (estado y cifra) y la salud técnica (bloque interno) en una tarjeta.
- Un área sin resultado muestra tarjeta completa con «No medida», «Sin preguntas» o «Pendiente de medir» y su «Ver informe» o «Configurar».
- Sin ninguna medición, las oportunidades remiten a «Analizar portada» y a configurar las preguntas de IA.

## Desired behavior

1. **Cabecera:** nombre y dominio, sin acciones. La puerta del operador es la pestaña «Configuración» (D002).
2. **Línea de situación** bajo las pestañas: un fragmento por área, en el orden de las tarjetas, cada uno derivado del mismo resumen que su tarjeta. Solo hechos observados:
   - «Google aún no te muestra» solo con Search Console `empty` (cero en los dos periodos). Sin conexión o sin datos: no medido. Lectura fallida: no se pudo leer.
   - Un resultado parcial nunca da un fragmento positivo (002 AC-013). Un dato de más de 30 días lo dice.
   - Sin conectores que sumen áreas («en general», «vas bien») ni cifras de las tarjetas.
   - Sin ninguna área con resultado, no hay línea: manda el estado vacío.
   - No sustituye al `h1`. En móvil, un fragmento por línea.
3. **Franja de la primera acción** (existente), después la línea del objetivo (016).
4. **Cuatro tarjetas con título en pregunta**, en este orden: «¿Cómo funciona tu web?» (rendimiento), «¿Puede Google leer tu portada?» (auditoría técnica, con su veredicto), «¿Te encuentran en Google?» (Search Console, sin veredicto, D002), «¿Apareces en las respuestas de IA?». Rejilla 2×2 en escritorio, una columna en móvil; con un número impar de tarjetas completas la última ocupa las dos columnas. Las dos de Google enlazan a su bloque de `/seo` (`#health-title`, `#results-title`).
5. **Áreas sin resultado** en una lista compacta «Pendiente de medir»: la pregunta y el motivo en voz de propietario, en texto, sin enlace. La tarjeta completa solo con resultado.
6. **Oportunidades:** cada una dice quién puede hacerlo («Esto lo hace quien mantenga tu web, o un técnico si no tienes a nadie») y rotula la recomendación técnica como lo que esa persona tiene que hacer. Sitio reservado, sin pintar, para «Pedir propuesta de mejora».
7. **Estado vacío** de oportunidades en voz de propietario, sin remitir a botones ni a configuración.

## Functional requirements

- FR-001 `summarizeGoogleCard` se sustituye por `summarizeRankingCard(gsc, now, locale)` y `summarizeTechnicalCard(seo, locale)`: cada uno con su estado, cifra, avisos y fuente. Las reglas de estado no cambian (014 D002–D004).
- FR-002 Módulo puro `situation.ts`: `situationLine({ performance, seo, gsc, ai }, now, locale)` devuelve los fragmentos o `null`. Cada fragmento sale del estado del resumen de su tarjeta; ninguna regla propia de medición.
- FR-003 Función pura `hasResult(area)` por área decide tarjeta completa o fila compacta: rendimiento con puntuación; técnica con conteos; Search Console `ok` o `empty`; IA con cobertura `n > 0`.
- FR-004 Componentes `SituationLine` y `PendingList`; `OverviewCard` sin cambios de interfaz.
- FR-005 `Opportunities`: fila «Quién puede hacerlo» y rótulo «Qué tiene que hacer»; la rejilla de la ficha pasa a dos columnas.
- FR-006 Catálogo `es`/`en`: títulos en pregunta, fragmentos, motivos de la lista compacta, textos de oportunidad. Se retiran las claves que queden sin lector (`overview.edit`, `overview.emptyAction`, `overview.emptyActionLink`, `cards.ai.configure`…).
- FR-007 Documentación: decisión nueva en la 014 que sustituye D001 sin reescribirla; nota en la 002 sobre AC-001 y el comportamiento 1 (tres columnas); `DESIGN.md`; doc 17; roadmap (Módulo F pendiente).

## Non-functional requirements

- Accessibility: cada tarjeta conserva nombre (su pregunta) y descripción (veredicto, cifra, avisos, fuente). La línea y la lista son texto. Objetivos táctiles nuevos ≥ 44 px a 375 px.
- Performance: ninguna lectura nueva; la página ya carga todo lo que usa.
- Maintainability: fragmentos y criterio de resultado en funciones puras con pruebas por estado.

## API / Interface changes

- `summarizeGoogleCard` y `GoogleCardSummary` se retiran; `summarizeRankingCard`, `summarizeTechnicalCard`, `situationLine`, `hasResult` nuevos en `modules/overview`.

## Data model changes

Ninguno.

## Edge cases

- Ninguna medición: sin línea, cuatro filas compactas y el estado vacío de oportunidades.
- Una sola tarjeta completa: ocupa las dos columnas.
- Search Console `ok` con cero impresiones en el periodo actual pero no en el anterior: «no te ha mostrado en los últimos 28 días», nunca «aún no te muestra».
- Auditoría parcial con críticos: fragmento negativo; parcial sin severidad: «revisión parcial», nunca positivo.
- Intento en curso o fallido con resultado anterior: la tarjeta sigue completa con su aviso (002 D011); el fragmento describe el resultado y, si tiene más de 30 días, lo dice.
- Inglés: fragmentos y motivos traducidos; las evidencias originales siguen con `lang="es"`.

## Acceptance criteria

- AC-001 La cabecera del resumen no tiene acciones; «Analizar portada» sigue en `/seo` y `/performance`.
- AC-002 La línea de situación aparece con al menos un área con resultado, un fragmento por área en orden, y no aparece sin ninguno.
- AC-003 Cada fragmento coincide con el estado de su tarjeta; prueba por estado de cada área, incluidos parcial, error, antiguo y `empty` frente a `ok` con cero.
- AC-004 Ningún fragmento contiene cifras ni conectores de agregación (prueba sobre el catálogo `es` y `en`).
- AC-005 Cuatro tarjetas con título en pregunta y en el orden fijado; rejilla 2×2 en escritorio y una columna en móvil; la última impar ocupa dos columnas.
- AC-006 Las tarjetas de Google enlazan a `/seo#health-title` y `/seo#results-title`; nombres accesibles distintos.
- AC-007 Un área sin resultado sale en la lista «Pendiente de medir» y no como tarjeta; la lista no tiene enlaces.
- AC-008 Cada oportunidad muestra quién puede hacerlo y la recomendación rotulada; no hay botón de propuesta.
- AC-009 El estado vacío de oportunidades no nombra botones ni configuración.
- AC-010 El PDF no cambia: `build-report` no importa nada de esta spec (comprobación de imports y prueba de informe existente en verde).
- AC-011 Documentación de FR-007 hecha.
- AC-012 En navegador sobre `dev`, 1280 y 375 px, `es` y `en`, en Olessium, la clínica y la demo: sin desbordamiento, foco visible, la línea y las tarjetas no se contradicen.
- AC-013 Lint, typecheck, unitarias, integración y build en verde.

## Test scenarios

- Unit: `situation.test.ts` (estados por área, nulo sin resultados, sin cifras ni conectores), `google.test.ts` adaptado a las dos funciones, `has-result`, catálogos, render de la ficha de oportunidad.
- Integration: regresión; `reports` sin cambios.
- Manual: AC-005, AC-006, AC-012.

## Assumptions

- La pestaña «Configuración» (017) basta como puerta del operador hasta la autenticación (Fase 5).
- «Portada» en el título de la tarjeta técnica basta para decir que solo se revisó la portada.
