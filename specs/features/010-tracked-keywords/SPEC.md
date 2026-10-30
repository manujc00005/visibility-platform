# Feature Spec: Keywords seguidas y su evolución con Search Console

## Status

Draft

## Problem

La spec 009 compara las 25 búsquedas principales con el periodo anterior, pero el operador no puede elegir qué búsquedas vigilar ni ver cómo evoluciona una en el tiempo. Una keyword importante para el negocio puede no estar entre las 25 principales. El encargo pide «keyword rankings and their changes over time». El seguimiento con posición real de Google es de pago (BL-01), pero Search Console ya da gratis la posición media por día de una búsqueda.

## Goal

El operador elige hasta 25 keywords por empresa. Cada captura de Search Console guarda su evolución semanal de las últimas 26 semanas, y la página SEO muestra para cada una su posición más reciente, el cambio frente a la primera semana con datos y una gráfica pequeña. Sin proveedor nuevo, sin coste y con la misma credencial.

## Non-goals

- Posición real por país, dispositivo o ciudad, y posición de una keyword para la que la web no apareció: DataForSEO sigue en BL-01.
- Sugerir keywords, seguir una con un clic desde la tabla de búsquedas o importar listas.
- Búsquedas perdidas: exige pedir más de 25 búsquedas del periodo actual, que cambia una consulta de la 003. Queda para otra spec.
- Grupos de keywords, etiquetas o notas.
- Posición de competidores.
- Ventanas configurables o exportar datos.
- Capturas programadas (Fase 6): la evolución sale de Google en cada captura.
- Bing, GA4, el informe PDF y la tarjeta del resumen de la empresa.

## Users / Actors

- Operador: añade y quita keywords en la página SEO y pulsa «Actualizar datos» como hasta ahora.
- Google Search Console API v3, Search Analytics `query`, con las dimensiones `date` y `query` y un filtro `includingRegex`. `capture_condition = owner_api`.

## Current behavior

- `collectSearchConsole` hace nueve consultas a Search Analytics en paralelo. `AnalyticsQuery.dimensions` solo admite `query` y `page`.
- `brand-terms.ts` escapa literales para RE2, pero su función de escape no se exporta.
- La sección «Google Search Console» muestra cifras, bloque de marca y tablas. No hay ningún dato elegido por el operador.
- `src/components/audits/evolution-chart.tsx` pinta una gráfica de evolución de la auditoría.

## Desired behavior

1. En la página SEO, debajo de la tabla de búsquedas, el operador escribe una keyword y la añade. También puede quitarla.
2. Al capturar, la app pide a Search Console la actividad diaria de las keywords seguidas en las últimas 26 semanas y la agrupa por semanas.
3. La fila guardada lleva la evolución por keyword.
4. La sección muestra una tabla con cada keyword, su posición más reciente, el cambio y una gráfica pequeña.
5. Una keyword recién añadida dice que falta actualizar los datos. Una sin datos en Google lo dice, sin confundirlo con un error.
6. Si la consulta nueva falla, la captura entera falla con el motivo de siempre.

## Functional requirements

- FR-001 Keywords seguidas: tabla `tracked_keywords` con `workspace_id`, `keyword` y `created_at`. Como mucho 25 por empresa.
- FR-002 Normalización al añadir: recortar, pasar a minúsculas y colapsar espacios internos. Se conservan acentos y signos. Longitud de 2 a 80 caracteres tras normalizar. Una keyword repetida para la misma empresa devuelve un error legible, y nunca una fila duplicada: índice único por `(workspace_id, keyword)`.
- FR-003 Altas concurrentes: el alta comprueba el límite y escribe dentro de una transacción con bloqueo por empresa, igual que `addCompetitor`, para que dos altas con 24 keywords no creen una 26.ª. Quitar una keyword es idempotente y se acota por empresa.
- FR-004 Consulta nueva: si la empresa tiene keywords, una llamada más a Search Analytics con el rango de 26 semanas que termina en `current.end`, `dimensions: ["date", "query"]`, `rowLimit: 25000`, `type: "web"`, `dataState: "final"` y un filtro `includingRegex` sobre `query`. Va en el mismo `Promise.all`. Sin keywords no se hace la llamada. Las nueve consultas actuales mantienen su cuerpo exacto.
- FR-005 Expresión: `^(?:k1|k2|…)$`, con cada keyword escapada como literal RE2 reutilizando el escape de la 007. La API no admite OR entre filtros, así que una expresión evita una llamada por keyword. Medida en bytes UTF-8 con el límite de 4096; si no cabe, la captura falla con `error` antes de pedir el token. Con 25 keywords de 80 caracteres ASCII siempre cabe.
- FR-006 Emparejado: una fila cuenta solo si su texto de búsqueda es exactamente una keyword seguida. Las demás se descartan, aunque la expresión las haya dejado pasar.
- FR-007 Semanas: 26 tramos de 7 días consecutivos que terminan en `current.end`. Cada tramo se identifica por su primer día. Para cada keyword y tramo con datos: suma de clics, suma de impresiones y posición media ponderada por impresiones. Un día sin datos no se rellena con cero, y un tramo sin datos no se guarda.
- FR-008 Persistencia: columna nullable `keyword_series jsonb` en `search_console_snapshots`, nula en filas `failed` y en capturas anteriores. En las nuevas `completed` tiene `{ version: 1, start, end, keywords: { keyword, weeks: { start, clicks, impressions, position }[] }[] }`, con las keywords seguidas en el momento de la captura.
- FR-009 Resumen: para cada keyword seguida ahora, en orden de alta, se calcula su estado:
  - `pending`: no está en la `keyword_series` de la última captura, o esa captura no tiene `keyword_series`.
  - `no_data`: está, sin semanas.
  - `ok`: tiene semanas.
- FR-010 Cifras de `ok`: posición de la última semana con datos, con su fecha, y cambio frente a la primera semana con datos, con el umbral y la tolerancia de la 009 y el texto «Sube 4,0», «Baja 1,3» o «Igual». Con una sola semana, «Una sola semana con datos». Una keyword guardada en la serie que ya no se sigue no se muestra.
- FR-011 Gráfica: SVG pequeño en línea con una línea por semanas con datos, posición mejor arriba, sin interactividad. Lleva un texto accesible con la primera y la última posición, y no depende del color.
- FR-012 Sección: bloque «Keywords seguidas» debajo de la tabla de búsquedas, con el formulario, el contador y la tabla. Sin credencial válida se pueden gestionar las keywords, y la tabla usa los estados de FR-009. Con 25 keywords, el formulario se sustituye por una frase que explica el límite.
- FR-013 Fallo: un `GscError` en la consulta nueva da el motivo existente y una sola fila `failed`, sin `keyword_series`. El último éxito sigue visible.
- FR-014 Textos en `es` y `en` en `searchConsole`, y una frase que explica que es la posición media semanal de las búsquedas en las que la web apareció, no un puesto fijo.
- FR-015 Keywords y búsquedas se pintan como texto, nunca como enlace ni HTML (B08b).

## Non-functional requirements

- Rendimiento: con keywords, un intento pasa de 11 a 12 llamadas. La documentación avisa de que las consultas agrupadas por búsqueda y con rangos largos son más costosas y tienen cuota de carga, así que solo hay una y solo si hay keywords. Como mucho 182 días por 25 keywords, 4550 filas.
- Seguridad: la keyword es entrada del operador y viaja escapada dentro de la expresión; nunca se interpola sin escapar. Validación en el servidor. Las acciones siguen el perímetro actual (D-03).
- Observabilidad: el intento queda en la fila como hoy.
- Mantenibilidad: sin dependencias nuevas. Agrupar semanas y construir la expresión son funciones puras.

## API / Interface changes

- `AnalyticsQuery.dimensions` admite `date`.
- `brand-terms.ts` exporta su función de escape.
- `CaptureSite` gana `trackedKeywords: string[]`; `CollectedData` gana `keywordSeries`.
- Nuevas Server Actions `addTrackedKeywordAction(workspaceId, formData)` y `removeTrackedKeywordAction(workspaceId, keyword)`.
- `SearchConsoleSummary` gana `trackedKeywords: TrackedKeywordView[]`.

## Data model changes

Migración `0012`, aditiva:
- Tabla `tracked_keywords`: `id`, `workspace_id` con FK y borrado en cascada, `keyword`, `created_at`. Índice único `(workspace_id, keyword)` y `check` de longitud de 2 a 80.
- Columna nullable `keyword_series jsonb` en `search_console_snapshots`, con `check`: nula en `failed`; si no es nula, objeto con la forma de FR-008, en modo `strict` como la 007 y la 008.

Quitar una keyword borra su fila: la evolución sale de Google y no se pierde historia propia. Sin backfill.

## Edge cases

- Keyword con metacaracteres («c++ cursos», «a|b»): escapada, se trata como texto literal.
- Keyword con mayúsculas o espacios de más: se normaliza al añadir.
- Keyword que la web nunca recibió: `no_data`, con una frase propia.
- Keyword añadida después de la última captura: `pending`.
- Días sin datos: Google los omite; la semana se calcula con los días que haya.
- Semana con datos parciales al inicio de la ventana: el tramo cubre siempre 7 días, así que no hay semanas incompletas por el corte.
- Una semana con posición muy distinta por pocas impresiones: se muestra tal cual; el texto recuerda que es una media.
- Empresa sin keywords: sin llamada nueva; `keyword_series` con `keywords: []`.
- Ninguna fila devuelta: todas las keywords en `no_data`.
- Fila con un texto que no es keyword seguida: se descarta.
- Dos capturas seguidas: dos filas, como hoy.
- Captura `failed` tras un éxito: la tabla sigue con el último éxito.
- Keyword quitada y vuelta a añadir antes de capturar: vuelve a mostrar su serie guardada.
- Empresa borrada: cascada.

## Acceptance criteria

- AC-001 Con 24 keywords, dos altas concurrentes dejan 25 y una devuelve el error de límite. Una keyword repetida, también con otras mayúsculas o espacios, da el error de duplicado sin fila nueva. Longitudes de 1 y de 81 caracteres se rechazan.
- AC-002 Quitar una keyword la borra, repetirlo no falla, y quitar con el id de otra empresa no afecta a nada.
- AC-003 Con keywords, se inspeccionan doce peticiones: la nueva lleva las dimensiones `date` y `query`, `rowLimit: 25000`, el rango de 182 días que termina en `current.end` y el filtro exacto. Las nueve previas conservan su cuerpo como cadena. Sin keywords hay once peticiones.
- AC-004 `keywordExpression` escapa metacaracteres y ancla la expresión; una expresión que no cabe da `failed/error` sin ninguna petición.
- AC-005 Con filas simuladas: suma de clics e impresiones por tramo, posición ponderada por impresiones, tramos sin datos ausentes, filas de otras búsquedas descartadas y tramos anclados a `current.end`.
- AC-006 Los tres estados de FR-009 se ven en el resumen y en el DOM. Una keyword de la serie que ya no se sigue no aparece.
- AC-007 Cambio: 8,0 frente a 12,0 da «Sube 4,0»; 12,0 frente a 8,0 da «Baja 4,0»; diferencia menor de 0,5 da «Igual»; una sola semana da su frase propia.
- AC-008 La gráfica se pinta con posición mejor arriba, tiene texto accesible con la primera y la última posición, y una keyword con una semana no rompe el SVG.
- AC-009 403 con y sin API desactivada, 429 y 500 en la consulta nueva dejan una sola fila `failed` sin `keyword_series` ni secretos, y el último éxito visible.
- AC-010 Tras aplicar `0012`, una fila anterior se lee con nulo. La base rechaza con 23514 y el nombre de la restricción un `failed` con serie y las formas inválidas, y rechaza con 23505 un duplicado; acepta `keywords: []`. Borrar la empresa borra sus keywords.
- AC-011 Una keyword con `<script>` se pinta como texto y el filtro la trata como literal.
- AC-012 Con 25 keywords, el formulario muestra la frase del límite. Sin credencial se pueden gestionar keywords y no hay botón de captura.
- AC-013 Textos en `es` y `en`; la prueba de catálogos pasa.
- AC-014 Lint, typecheck, unitarias, integración y build en verde sobre el árbol commiteado.
- AC-015 En el navegador, con una fila sintética que se borra después, a 375 px en `es` y `en`: `scrollWidth` igual a `clientWidth` en la página y en la tabla. Con la cuenta real, olessium.com termina en `completed` o en un motivo accionable. Un 200 con ceros no demuestra que la expresión funcione (D007 de la 007).

## Test scenarios

- Unitarias: normalización; expresión; agrupado semanal; recogida con y sin keywords, concurrencia, emparejado y fallos; resumen con estados y cambio; gráfica; render; catálogos.
- Integración: alta, límite concurrente, duplicado, quitar, aislamiento por empresa, cascada, persistir y leer la serie, fila anterior, rechazos de la base, fallos y último éxito.
- Manual: AC-015.

## Source of Truth Matrix

| Dato | Fuente | Verificado |
|---|---|---|
| `date` se puede agrupar y el resultado se ordena por fecha ascendente; sin límite de dimensiones | developers.google.com/webmaster-tools/v1/searchanalytics/query | 2026-10-30 |
| «Cuando date es una dimensión, los días sin datos se omiten» | misma página | 2026-10-30 |
| `groupType` solo admite `and`; los grupos también se combinan con «and»; no hay OR | misma página | 2026-10-30 |
| `includingRegex` es RE2; `expression` hasta 4096; `rowLimit` hasta 25.000 | misma página | 2026-10-30 |
| 1200 peticiones por minuto por sitio y por usuario; cuota de carga sin cifra; agrupar por búsqueda y rangos largos cuesta más | developers.google.com/webmaster-tools/limits | 2026-10-30 |
| Tope de 50.000 filas por día y tipo de búsqueda | developers.google.com/webmaster-tools/v1/how-tos/all-your-data | 2026-10-30 |
| Cuánto histórico conserva Search Console (se suele citar 16 meses) | No consta en ninguna de las páginas leídas | UNVERIFIED; el diseño pide 26 semanas y muestra las que devuelva |
| Si `includingRegex` distingue mayúsculas en la API | No lo dice la página; la interfaz no las distingue | UNVERIFIED; las keywords van en minúsculas y FR-006 empareja exacto |
| Que el filtro por expresión funcione con datos | La API acepta incluso expresiones inválidas sin datos (D007 de la 007) | UNVERIFIED; seguimiento |
| Que una búsqueda poco frecuente se oculte también al filtrar por expresión | Ayuda de Search Console, para la interfaz | UNVERIFIED para esta consulta |

## Assumptions

- 26 semanas son suficientes para enseñar la evolución y no dependen del histórico exacto de Google.
- 25 keywords bastan para el piloto; es el mismo orden que la tabla de búsquedas.
- Search Console devuelve las búsquedas en minúsculas, como se ve en su interfaz. Si una llegara con mayúsculas, FR-006 no la emparejaría y la keyword saldría `no_data`, sin inventar nada.
- Con Olessium sin impresiones, la captura real solo confirma que la llamada funciona.
- `es.ts`, `en.ts` y `messages.test.ts` tienen cambios de la 004 sin commitear: al commitear se separa solo lo de esta feature.
- Las acciones siguen sin autenticación (D-03); las dos nuevas aceptan texto del operador, y BL-07 las incluye.
- El proyecto no tiene `specs/CONSTITUTION.md` ni `specs/SERVICES.md`.

## Open questions

- Ninguna bloqueante. A decidir en `/spec-plan`: reutilizar o no `evolution-chart.tsx` para la gráfica, y cómo se reparte la tabla a 375 px, siempre que cumpla AC-015.

## Decisions pre-registered for DECISIONS.md

- D001 La evolución sale de Google en cada captura, no de capturas acumuladas: da histórico desde el primer día y no depende de la Fase 6.
- D002 Una sola consulta con expresión, porque la API no admite OR y una por keyword serían hasta 25 llamadas costosas.
- D003 Keywords en una tabla propia: las gestiona el operador y no dependen de ninguna captura.
- D004 Semanas y no días: los días son ruidosos, y 26 tramos caben en una gráfica pequeña.
- D005 Posición ponderada por impresiones, como la calcula Search Console al agregar.
- D006 Quitar borra la fila: Google conserva los datos, y no hay historia propia que perder.

## Contracted services

Contracted services not declared → all billable add-ons treated as NOT contracted (conservative default). Run `/project-init` to declare them. Esta feature no usa ningún servicio de pago: Search Console es gratuito con la credencial existente.
