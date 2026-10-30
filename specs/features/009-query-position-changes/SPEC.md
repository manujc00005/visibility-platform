# Feature Spec: Cambios de posición por búsqueda en Search Console

## Status

In Progress (2026-10-30). T001–T004 hechas. Plan, tareas y decisiones en esta carpeta.

## Problem

La sección «Google Search Console» enseña las 25 búsquedas principales con su posición media de los últimos 28 días, pero no dice si cada una ha subido o bajado. El encargo pide «keyword rankings and their changes over time». Hoy solo la posición media global se compara con el periodo anterior. El seguimiento completo de keywords necesita histórico (Fase 6) o un proveedor de pago (BL-01), pero Search Console ya da gratis la comparación entre dos periodos.

## Goal

Cada captura de Search Console guarda, para cada una de las 25 búsquedas principales del periodo actual, sus cifras del periodo anterior. La tabla de búsquedas muestra bajo cada posición si la búsqueda sube, baja o sigue igual, y lo dice cuando no hay dato anterior. Sin proveedor nuevo, sin coste y con la misma credencial.

## Non-goals

- Serie temporal, gráfica o más de dos periodos (Fase 6).
- Lista de keywords elegidas por el operador o seguimiento de una keyword que no esté entre las 25 principales.
- Posiciones reales en la página de resultados por dispositivo o por país: DataForSEO SERP sigue en BL-01.
- Búsquedas que se han perdido: las que estaban en el periodo anterior y ya no están entre las 25 principales.
- Comparar clics, impresiones o CTR por búsqueda en la tabla. Se guardan, pero no se muestran.
- Bing, GA4, el informe PDF y la tarjeta del resumen de la empresa.
- Comparación con competidores.
- Reclasificar capturas guardadas antes de esta feature.

## Users / Actors

- Operador: pulsa «Actualizar datos» como hasta ahora y lee el cambio de cada búsqueda.
- Google Search Console API v3, Search Analytics `query`. `capture_condition = owner_api`.

## Current behavior

- `collectSearchConsole` hace ocho consultas a Search Analytics en paralelo, y solo una pide la dimensión `query`: la del periodo actual, con `rowLimit` 25.
- `QueryRow` guarda búsqueda, clics, impresiones, CTR y posición del periodo actual en la columna `queries` (`jsonb`).
- `summarizeSearchConsole` compara la posición media global con `positionChange`, con un umbral de 0,5 puestos (`POSITION_SAME`).
- La tabla de búsquedas tiene las columnas Búsqueda, Clics, Impresiones, CTR (oculta en móvil) y Posición, más la etiqueta «marca».

## Desired behavior

1. Al capturar, la app pide también las búsquedas del periodo anterior y busca en ellas cada una de las 25 principales del periodo actual.
2. Cada fila guardada lleva las cifras del periodo anterior, o indica que no se encontraron.
3. En la tabla, bajo la posición de cada búsqueda, aparece «Sube 2,7», «Baja 1,3», «Igual» o «Sin dato anterior».
4. Una nota explica que se comparan medias de dos periodos de 28 días y que no es un puesto fijo ni un histórico.
5. Una captura anterior a esta feature se muestra como hasta ahora, sin cambios por fila, y una frase pide actualizar los datos si tiene búsquedas.
6. Si la consulta nueva falla, la captura entera falla con el motivo de siempre.

## Functional requirements

- FR-001 Consulta nueva: una llamada más a Search Analytics con el periodo anterior de la captura, `dimensions: ["query"]` y `rowLimit: 1000` (`PREVIOUS_QUERIES`), en el mismo `Promise.all` que las ocho actuales. Usa la misma propiedad, `type: "web"` y `dataState: "final"`. Las ocho consultas actuales mantienen su cuerpo exacto.
- FR-002 Emparejado: cada una de las 25 búsquedas del periodo actual se busca por igualdad exacta del texto completo devuelto por Google, antes de recortarlo a 200 caracteres. No se normalizan mayúsculas, acentos ni espacios.
- FR-003 Persistencia: `QueryRow` gana `previous: Totals | null`. Vale `Totals` con las cifras del periodo anterior si se encontró, y `null` si no. Se guarda solo para las 25 filas; las otras filas de la respuesta se descartan.
- FR-004 Tres casos distintos por fila: clave `previous` ausente (captura anterior a esta feature), `null` (no estaba entre las 1000 búsquedas devueltas) y `Totals` (hay comparación). Un `null` no significa que la búsqueda sea nueva: Google puede omitirla por el límite de filas o por ser poco frecuente.
- FR-005 Cambio por fila: `delta = position − previous.position`, con las cifras crudas. Si `|delta| < 0,5` (`POSITION_SAME`, el mismo umbral que la posición global), el estado es `same`. Si `delta < 0`, `up` (`better`). Si `delta > 0`, `down` (`worse`). La magnitud se muestra con un decimal.
- FR-006 Resumen: las filas proyectadas de `queries` ganan `positionChange: Change | null`. Vale `null` solo con la clave `previous` ausente. Con `previous: null`, la dirección es `same` y el texto es «Sin dato anterior». La proyección funciona con o sin `segments`: la etiqueta `branded` de la 007 no cambia.
- FR-007 Tabla: el cambio se pinta bajo la posición, en la misma celda, con `ChangeLine` y un texto corto: «Sube 2,7», «Baja 1,3», «Igual» o «Sin dato anterior». No se añade ninguna columna. La tabla de páginas no cambia.
  - *Enmienda tras T006 (D004):* en móvil el cambio va bajo el texto de la búsqueda, porque bajo la posición escondía esa columna. El relleno lateral de las dos tablas baja en móvil.
- FR-008 Nota: la nota de privacidad se amplía con una frase que dice que el cambio compara la posición media de dos periodos de 28 días, y que la búsqueda puede no estar entre las primeras 1000 del periodo anterior. Conserva sus frases actuales.
- FR-009 Capturas antiguas: si la última captura tiene filas y ninguna lleva la clave `previous`, la sección muestra una frase bajo la tabla que pide «Actualizar datos» si hay botón, o explica que hay que configurar la credencial si no lo hay. Sin filas no se muestra la frase.
- FR-010 Fallo: un `GscError` en la consulta nueva produce el motivo existente (`invalid_credentials`, `api_disabled`, `no_access`, `quota_exceeded` o `error`). Se guarda solo una fila `failed`, nunca una `completed` parcial. El último éxito sigue visible.
- FR-011 Textos en `es` y `en` en el namespace `searchConsole`, con la salida española como referencia.
- FR-012 Las búsquedas siguen pintándose como texto, nunca como enlace ni HTML (B08b).

## Non-functional requirements

- Rendimiento: un intento pasa de 10 a 11 llamadas; las nueve de Search Analytics se inician en paralelo, con el límite de 15 s por llamada. La respuesta nueva puede traer hasta 1000 filas; se emparejan con un `Map`, en tiempo lineal.
- Seguridad: no entra ningún dato nuevo más allá de cifras de las mismas búsquedas. Token, JWT y clave siguen fuera de errores, resultados y filas.
- Observabilidad: el intento queda en la fila como hoy.
- Mantenibilidad: sin dependencias nuevas. `positionChange` de la posición global no cambia de texto.

## API / Interface changes

- `QueryRow` gana `previous: Totals | null`.
- `QueryView` gana `positionChange: Change | null`.
- `SearchConsoleSection`: `Row` gana un cambio opcional, que solo pasan las filas de búsquedas. Sin acción ni ruta nueva.

## Data model changes

Sin migración. `previous` vive dentro de cada elemento del array `queries` (`jsonb`), y el `check` actual solo exige que sea un array. Las filas guardadas antes no llevan la clave y se tratan como FR-004. Rollback: revertir el código; las filas con la clave extra siguen siendo válidas y el código anterior la ignora.

## Edge cases

- Búsqueda sin par exacto por mayúsculas o espacios: «Sin dato anterior», no un cambio inventado.
- Búsqueda de más de 200 caracteres: se empareja por el texto completo y se guarda recortada.
- Texto repetido en la respuesta del periodo anterior: se usa la primera fila, que es la de más clics según el orden de Google.
- Periodo anterior sin filas: todas las búsquedas muestran «Sin dato anterior».
- Periodo actual sin búsquedas: la consulta nueva se hace igual, sin efecto visible, y no aparece ninguna frase de esta feature.
- `delta` de exactamente ±0,5: cuenta como cambio, igual que en la posición global.
- Posición que mejora de 12 a 8: `delta` negativo, «Sube 4,0» y dirección `better`.
- Captura con una mezcla imposible de filas con y sin `previous`: cada fila se trata por sí misma; la frase de FR-009 solo aparece si ninguna tiene la clave.
- Etiqueta «marca» y cambio en la misma fila: los dos se ven.
- A 375 px, el texto más largo («Sin dato anterior») no debe esconder la columna Posición tras un scroll interno.

## Acceptance criteria

- AC-001 Con una captura simulada, inspeccionar la fila `completed`: cada una de las 25 búsquedas lleva `previous` con sus cifras o `null`, y ninguna otra fila del periodo anterior se guarda.
- AC-002 Inspeccionar las peticiones: once en total, nueve a Search Analytics, iniciadas antes de resolver ninguna. La nueva lleva el periodo anterior, `dimensions: ["query"]`, `rowLimit: 1000`, `type: "web"` y `dataState: "final"`. Las ocho anteriores conservan su cuerpo como cadena exacta.
- AC-003 Con posiciones 8,0 frente a 12,0, el resumen da dirección `better` y el DOM «Sube 4,0». Con 12,0 frente a 8,0, `worse` y «Baja 4,0». Con 8,3 frente a 8,0, `same` e «Igual». Con diferencia de exactamente 0,5, hay cambio.
- AC-004 Con `previous: null`, el DOM muestra «Sin dato anterior» y dirección `same`. Con la clave ausente, `positionChange` es `null` y no se pinta ninguna línea.
- AC-005 Una búsqueda de más de 200 caracteres se empareja por su texto completo y se guarda recortada a 200. Dos textos que solo difieren en mayúsculas no se emparejan.
- AC-006 Una captura con filas y sin ninguna clave `previous` muestra la frase de actualizar si hay botón, o la de configurar si no lo hay. Sin filas, ninguna de las dos. Sus cifras y la etiqueta «marca» no cambian.
- AC-007 Simular 403 (API desactivada y sin acceso), 429 y 500 en la consulta nueva: una sola fila `failed`, ninguna `completed` nueva, el último éxito visible, y ni token, ni JWT, ni clave en el resultado ni en la fila.
- AC-008 La tabla de búsquedas conserva sus columnas y la de páginas no pinta ningún cambio. La etiqueta «marca» y el cambio se ven en la misma fila. Un texto de búsqueda con `<script>` se pinta como texto.
- AC-009 La nota conserva sus frases actuales y añade la de FR-008. Las claves nuevas existen en `es` y `en`, y la prueba de catálogos pasa.
- AC-010 Lint, typecheck, unitarias, integración y build en verde sobre el árbol commiteado. Las pruebas previas solo se adaptan añadiendo campos y el recuento de peticiones.
- AC-011 En el navegador, con una fila sintética que se borra después, en `es` y `en` a 375 px: `scrollWidth` igual a `clientWidth` en la página y en el contenedor de la tabla, y los cuatro textos de cambio visibles. Con la cuenta real, olessium.com termina en `completed` o en un motivo accionable.

## Test scenarios

- Unitarias: recogida (once peticiones, cuerpos exactos, concurrencia, emparejado exacto, texto largo, repetido, sin filas, fallos con búsqueda literal de secretos); resumen (los cuatro estados, umbral, proyección con y sin `segments`); render (textos, sin columna nueva, páginas sin cambio, frases de captura antigua, texto hostil, inglés); catálogos.
- Integración: guardar y leer `previous` y `null`; leer una fila sin la clave; fallos sobre la fila; último éxito tras un fallo.
- Manual: AC-011.

## Source of Truth Matrix

| Dato | Fuente | Verificado |
|---|---|---|
| `dimensions` admite `query`; `rowLimit` de 1 a 25.000 | developers.google.com/webmaster-tools/v1/searchanalytics/query (matriz de la 007) | 2026-10-29 |
| La API devuelve las filas principales y no garantiza todas | misma página | 2026-10-29 |
| Google omite las búsquedas anónimas | support.google.com/webmasters/answer/17011165 (matriz de la 007) | 2026-10-29 para la interfaz; UNVERIFIED para esta consulta |
| Orden de las filas por clics | Spec 003, FR-005 («como devuelve Google») | UNVERIFIED para los empates |
| Que el texto de una misma búsqueda coincida exactamente entre dos periodos | Sin captura con datos: Olessium no tiene impresiones | UNVERIFIED; queda como seguimiento |

## Assumptions

- La comparación usa los periodos que ya calcula la captura: 28 días que terminan 3 días antes, y los 28 anteriores.
- 1000 filas bastan para las pymes del piloto. Si no, la fila dice «Sin dato anterior», sin afirmar nada falso.
- Con Olessium sin impresiones, la captura real solo puede confirmar que la llamada funciona. Comparar cifras queda como seguimiento, como en la 003, la 007 y la 008.
- `es.ts`, `en.ts` y `messages.test.ts` tienen cambios de la 004 sin commitear: al commitear se separa solo lo de esta feature, como en la 007 y la 008.
- La acción sigue sin autenticación (D-03 del roadmap); esta feature no cambia el perímetro.
- El proyecto no tiene `specs/CONSTITUTION.md` ni `specs/SERVICES.md`; se siguen las convenciones de la 007 y la 008.

## Open questions

- Ninguna bloqueante. A decidir en `/spec-plan`: el contenedor exacto del texto del cambio a 375 px, siempre que cumpla AC-011.

## Decisions pre-registered for DECISIONS.md

- D001 `previous` dentro de cada fila de `queries`, sin migración. Motivo: se lee siempre con la fila y el `check` actual lo admite. Coste de revertir: bajo.
- D002 `rowLimit: 1000` en vez de filtrar por las 25 búsquedas. Motivo: una consulta sin expresión que construir ni límite de 4096 que vigilar.
- D003 «Sin dato anterior» en vez de «Nueva». Motivo: la API no garantiza todas las filas, así que no se puede afirmar que la búsqueda no existiera.
- D004 Texto corto bajo la posición, sin columna nueva. Motivo: la tabla ya llena los 375 px.

## Contracted services

Contracted services not declared → all billable add-ons treated as NOT contracted (conservative default). Run `/project-init` to declare them. Esta feature no usa ningún servicio de pago: Search Console es gratuito con la credencial existente.
