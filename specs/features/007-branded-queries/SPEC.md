# Feature Spec: Búsquedas con marca y sin marca en Search Console

## Status

Done (2026-10-29). T001–T010 hechas; `/spec-review` Pass y revisiones de seguridad, dominio y conformidad aplicadas (D008). Seguimiento abierto: comprobar con impresiones que Google interpreta la expresión (D007, TASKS › Follow-ups).

## Problem

La sección «Google Search Console» de la página SEO enseña clics, impresiones, CTR y posición media, pero mezcla dos cosas distintas: la gente que ya conoce la empresa y la busca por su nombre, y la gente que la encuentra buscando lo que vende. Un informe SEO estándar separa las dos (requisito «branded vs. non-branded» del encargo), porque solo la segunda parte mide el trabajo de posicionamiento; la primera mide notoriedad y publicidad.

## Goal

Cada captura de Search Console guarda, además de los totales, los clics e impresiones de las búsquedas que contienen la marca y de las que no la contienen, en el periodo actual y en el anterior. La sección muestra los dos bloques con su peso sobre el total y su cambio, dice qué términos cuentan como marca, marca cada fila de la tabla de búsquedas como «marca» o no, y enseña aparte la parte que Google no clasifica al filtrar por búsqueda (D003). Sin proveedor nuevo, sin coste y con las mismas credenciales.

## Non-goals

- Editar una lista de términos de marca aparte: los términos salen del nombre, los alias de marca y el dominio ya guardados en la empresa (D001 abajo). Si hace falta ajustar un alias o el nombre, se edita en la ficha y se vuelve a capturar.
- Separar marca y sin marca en Bing Webmaster Tools (su API no filtra por búsqueda) ni en GA4 (no tiene las búsquedas).
- Tocar la tarjeta «Visibilidad en Google» del resumen de la empresa ni el informe PDF.
- Histórico diario o evolución de la proporción en el tiempo (Fase 6).
- Clasificar o estimar las búsquedas que Google oculta.
- Reclasificar capturas guardadas antes de esta feature: se muestran como hasta ahora y la sección invita a actualizar.
- OAuth del propietario, autenticación o cualquier cambio en el perímetro (D-03 del roadmap).

## Users / Actors

- Operador: pulsa «Traer datos» o «Actualizar datos» como hasta ahora y lee el bloque nuevo. Si un término de marca sobra o falta, edita los alias de la empresa y vuelve a capturar.
- Google Search Console API v3, Search Analytics `query`, con `dimensionFilterGroups` sobre la dimensión `query` y los operadores `includingRegex` y `excludingRegex` (RE2). `capture_condition = owner_api`.

## Current behavior

- `src/modules/search-console/collect.ts`: una captura hace 6 llamadas (token, propiedades, totales actual y anterior, 25 búsquedas, 10 páginas). `querySearchAnalytics` no admite filtros.
- `search_console_snapshots` guarda `totals`, `previous_totals`, `queries` y `pages` en `jsonb` (D004 de la 003).
- `summarizeSearchConsole` y `SearchConsoleSection` muestran cuatro cifras, dos tablas, la fuente y la nota de privacidad («la suma de la tabla puede ser menor que el total»).
- La empresa ya tiene `name`, `brandAliases` (hasta 10) y `domain`; el módulo GEO los usa como panel de marca (`geo/service.ts`, `detection.ts`).

## Desired behavior

1. Al capturar, la app construye la lista de términos de marca de la empresa y una expresión regular RE2 a partir de ella, y pide a Search Console cuatro totales más: con marca y sin marca, en el periodo actual y en el anterior.
2. La fila guardada lleva esos cuatro totales y los términos usados.
3. La sección muestra, debajo de las cuatro cifras, el bloque «Con tu marca y sin ella»: dos columnas (con marca, sin marca) con clics, impresiones, porcentaje de los clics totales y cambio frente al periodo anterior; una línea con los clics e impresiones que Google no deja clasificar; y la lista de términos considerados marca.
4. En la tabla de búsquedas, cada fila que contiene un término de marca lleva la etiqueta «marca».
5. Una captura anterior a esta feature se muestra como hasta ahora y, en lugar del bloque, una frase pide actualizar los datos.
6. Si una de las cuatro consultas nuevas falla, la captura entera falla con el motivo de siempre: no se guarda una fila `completed` a medias.

## Functional requirements

- FR-001 Términos de marca (D001): tomar `workspace.name`, cada `brandAliases` y `workspace.domain` de la empresa leída al iniciar el intento. Conservar el texto original recortado para mostrarlo y construir el filtro; usar `nameKey` solo como clave de deduplicación (minúsculas, sin acentos y puntuación a espacios). Descartar nombre o alias cuya clave tenga menos de 3 caracteres alfanuméricos; el dominio se incluye siempre, incluso si duplica otra clave, porque su puntuación tiene significado en búsquedas reales. Orden: nombre válido, alias válidos, dominio. Al recortar por longitud, `terms` contiene solo los términos efectivamente usados; si un término no cabe, se omite entero, sin fragmentarlo. El dominio tiene prioridad frente a los alias y debe permanecer incluido.
- FR-002 Expresión de marca: por cada término efectivo generar literales de (a) texto original recortado, (b) texto sin acentos y (c) forma `nameKey` con puntuación convertida en espacios; eliminar variantes idénticas, escapar cada carácter especial de RE2 en el literal y unirlas con `|`, sin límites de palabra (D002). Los espacios de la variante (c) coinciden con uno o más espacios de la búsqueda; las variantes literales conservan puntos, guiones y otros signos. Prefijo `(?i)` para ignorar mayúsculas. No usar sintaxis exclusiva de JavaScript (`/…/i`, lookbehind ni escapes `\u{…}`). Medir la expresión final, incluido el prefijo y los escapes, en caracteres antes de llamar a Google: máximo 4096, el límite documentado de `expression`. Reservar primero el espacio del dominio y luego incluir nombre y alias en su orden si caben; `termsTruncated = true` si se omite alguno. Si el dominio por sí solo no cabe, fallar con `error` antes de consultar Search Analytics; nunca enviar una expresión parcial o vacía. Es una guarda defensiva: un dominio válido mide como mucho 253 caracteres (`src/modules/workspaces/domain.ts`), así que con datos reales siempre cabe.
  - *Enmienda tras la implementación (D004, D008):* la variante (a) es el texto recortado y en minúsculas, porque la expresión ya ignora mayúsculas; los espacios se convierten en ` +` en las tres variantes, no solo en la (c); el límite de 4096 se mide en bytes UTF-8, que nunca son menos que los caracteres; cada variante se comprueba contra una lista blanca de literales escapados y un dominio vacío lanza `BrandTermsError`.
- FR-003 Consultas nuevas: cuatro llamadas a Search Analytics sin dimensiones y con `rowLimit: 1`, `dimensionFilterGroups: [{ groupType: "and", filters: [{ dimension: "query", operator, expression }] }]`: actual `includingRegex` y `excludingRegex`, anterior con ambos operadores. Usan los mismos periodos, `type: "web"`, `dataState: "final"` y propiedad que los totales de la 003. Van en paralelo con las cuatro consultas existentes, que mantienen exactamente su cuerpo. Una respuesta sin filas vale `Totals` a cero. `AnalyticsQuery` admite el campo de filtros opcional; no cambia la firma de `querySearchAnalytics`.
- FR-004 Hueco no clasificable: calcular para cada periodo y para clics e impresiones `delta = totals − branded − nonBranded`, usando las cifras crudas; mostrar `hidden = max(0, delta)`, sin guardarlo en `segments`. Cuando `delta < 0`, mostrar cero y una nota de desajuste de datos; no afirmar que las tres partes suman el total. Cuando `delta ≥ 0`, las tres partes sí suman el total. El hueco se presenta como datos que el filtro por búsqueda no permite clasificar, sin atribuirlo exclusivamente a privacidad hasta verificar la causa exacta de la API (D003). CTR y posición son métricas propias de cada respuesta filtrada, no se suman ni se calculan para el hueco.
- FR-005 Persistencia: columna nullable `segments jsonb` en `search_console_snapshots`, nula en filas `failed` y capturas anteriores a la migración. En nuevos `completed` es obligatoria y tiene `{ version: 1, terms: string[], termsTruncated: boolean, branded: Totals, nonBranded: Totals, previousBranded: Totals, previousNonBranded: Totals }`. `terms` conserva los literales originales efectivamente incluidos, en el orden de FR-001. `Totals` es el tipo existente (`clicks`, `impressions`, `ctr`, `position`); los cuatro objetos contienen la respuesta propia de Google, o sus cuatro ceros si no hubo fila. No persistir el regex, el token ni la clave.
- FR-006 Resumen: `summarizeSearchConsole` devuelve `segments` con clics e impresiones formateados de cada bloque; porcentajes de cada uno sobre `totals.clicks` y `totals.impressions` actuales, respectivamente; cambio de clics con `countChange`; hueco actual y anterior de clics e impresiones; términos efectivos y aviso de truncamiento o desajuste. Si el denominador de un porcentaje es cero, mostrar «—» para ese porcentaje. Si las impresiones totales actuales son cero, mostrar «Sin búsquedas en este periodo» sin porcentajes. El cambio de un bloque solo aparece si las impresiones de ese mismo bloque en el periodo anterior son mayores que cero (regla FR-008 de la 003); un bloque anterior con cero clics e impresiones positivas usa la frase de `countChange` para base cero. CTR y posición de segmentos permanecen guardados, pero no se muestran en este bloque.
  - *Enmienda tras la implementación (D008):* sin impresiones actuales, la sección muestra su propia frase («Sin impresiones en este periodo: no hay búsquedas que separar.»), los dos bloques con sus cifras y su cambio, y la parte sin clasificar de los dos periodos; solo se ocultan los porcentajes, que el resumen da como «—». Así una caída a cero sigue mostrando de dónde venía.
- FR-007 Etiqueta por fila: sobre las `queries` de la captura completada, marcar `branded` si el texto bruto de la búsqueda coincide con alguna variante literal de FR-002, con la misma insensibilidad a mayúsculas y regla de espacios; usar solo los `terms` efectivos guardados en esa captura. No usar `nameKey(query).includes(nameKey(term))`, porque elimina puntuación y puede producir un veredicto distinto del filtro enviado a Google. La etiqueta es una proyección del resumen, no un campo persistido en `queries`; una captura sin `segments` no tiene etiquetas.
- FR-008 Capturas sin `segments`: si `latestCompleted.segments` es nulo, la sección muestra una frase que pide «Actualizar datos» solo cuando ese botón está disponible; si la configuración no permite capturar, indica que se deben configurar las credenciales. Las cifras, tablas y tarjeta existentes no cambian. El último intento `failed` sigue mostrándose junto al último `completed` como en la 003.
- FR-009 Fallo: un `GscError` en cualquiera de las cuatro consultas nuevas, o una expresión imposible de construir bajo el límite, produce el motivo existente (`api_disabled`, `no_access`, `quota_exceeded` o `error`, según corresponda). La captura guarda solo una fila `failed` sin `segments`; nunca una `completed` parcial. Los mensajes no incluyen la expresión, el cuerpo de Google, el token ni la clave. Los términos no son secretos: la fila fallida ya guarda hoy la propiedad (`sc-domain:<dominio>`) y el motivo `no_access` nombra el dominio, y eso no cambia.
- FR-010 Textos en `es` y `en` en el namespace `searchConsole` de `src/i18n/messages`, con la salida española como referencia. La nota de privacidad existente se amplía para explicar que el total de los segmentos puede ser menor que el total general; conserva la explicación de la tabla y la posición media.
- FR-011 Los términos de marca y las etiquetas se pintan como texto, nunca como enlace ni HTML (B08b). Probar un término que contenga etiquetas HTML y caracteres especiales: se ve literalmente y no crea nodos ni enlaces.

## Non-functional requirements

- Rendimiento: un intento pasa de 6 a 10 llamadas en el caso con propiedad accesible; las ocho de Search Analytics se inician en paralelo, conservando el timeout de 15 s por llamada. Registrar en una prueba simulada la cuenta y la concurrencia; no fijar una promesa de latencia ni de cuota sin medida real (cuota UNVERIFIED).
- Seguridad: los términos originales llegan de la ficha, se convierten en literales escapados y acotados antes de entrar en `dimensionFilterGroups`; solo se envía la expresión a Google. Se guardan los términos efectivos y las métricas, no la expresión. Token, JWT y clave siguen fuera de errores, resultados, filas y registros; una prueba busca sus valores literales también en el nuevo camino de error.
- Observabilidad: el intento queda en la fila como hoy; `termsTruncated` deja constancia del recorte.
- Mantenibilidad: sin dependencias nuevas. El constructor de términos y de la expresión es una función pura exportada y probada aparte, porque es la única pieza con criterio propio.

## API / Interface changes

- `querySearchAnalytics(token, siteUrl, query, options)` conserva su firma; `AnalyticsQuery` gana `dimensionFilterGroups?` con el tipo fijo de FR-003.
- Nuevo `src/modules/search-console/brand-terms.ts` (o nombre equivalente): `brandTerms(site: { name; brandAliases; domain }) → { terms: string[]; expression: string; truncated: boolean }` y `isBrandedQuery(query: string, terms: string[]) → boolean`, que aplican el mismo constructor de variantes. El límite imposible da un error tipado mapeable a `error`.
- `collectSearchConsole` recibe también `name` y `brandAliases` de la empresa; `SearchConsoleDeps.collect` y `refreshSearchConsole` se los pasan. `CollectedData` gana `segments`.
- `SearchConsoleSummary` gana `segments: SegmentsView | null`; las filas proyectadas de `queries` ganan `branded: boolean` solo cuando hay `segments`. `QueryRow` persistido mantiene su forma anterior.
- `SearchConsoleSection`: bloque nuevo y etiqueta en la tabla. Sin acción ni ruta nueva.

## Data model changes

Migración `0009_search_console_segments.sql` (siguiente a `0008_analytics.sql`, según `src/db/migrations/meta/_journal.json`), aditiva: `segments jsonb` nullable sin valor por defecto ni backfill. En el esquema Drizzle, la misma columna lleva el tipo versionado. Restricciones: `segments is null or jsonb_typeof(segments) = 'object'`, `status <> 'failed' or segments is null`, y, si no es nulo, `version` numérico igual a 1, `terms` es array de cadenas, `termsTruncated` booleano y los cuatro objetos de totales tienen `clicks`, `impressions`, `ctr` y `position` numéricos. Las filas `completed` anteriores pueden seguir con nulo; el servicio exige `segments` para las capturas nuevas. Sin índice. Verificar lectura de filas previas y nuevas tras aplicar la migración; rollback técnico: retirar el código lector/escritor de `segments` antes de eliminar la columna, aceptando que esa eliminación perdería los segmentos nuevos. No revertir la migración en un despliegue que aún escriba la columna.

*Enmienda tras la implementación (D008):* la migración `0010_search_console_segments_strict.sql` reemplaza `search_console_snapshots_segments_shape` por la misma comprobación en modo `strict` de JSON path, con `terms` no vacío y cada bloque de totales como objeto. El modo `lax` de la 0009 aceptaba formas como `"version": [1]` o un bloque de totales dentro de un array.

## Edge cases

- Nombre genérico («Moda», «Clínica Dental») o alias común («sol»): puede clasificar de más. Mostrar los términos y documentar esta limitación; editar alias o nombre y recapturar cambia solo capturas futuras (D002).
- Nombre/alias de menos de tres caracteres alfanuméricos, vacío tras `nameKey` o duplicado: se omite; el dominio permanece. Si el nombre se omite, no se afirma que sea un término usado.
- «García & Hijos S.L.», «C++ Academy», `olessium.com`, un dominio con guion o `xn--`: la expresión conserva variantes literales con puntuación escapada y la variante con espacios. `nameKey("olessium.com")` da «olessium com», pero la búsqueda cruda «olessium.com» coincide por la variante literal con punto. IDN permanece en ASCII; no se inventa una variante Unicode.
- «Clínica García» y «Clinica Garcia»: ambas variantes coinciden; no se promete cubrir toda mezcla posible de acentos entre palabras.
- Nombre o alias con texto que parece una expresión RE2 o HTML: se trata como literal, y se muestra como texto; tampoco aparece en mensajes de error.
- Dominio igual a un alias por `nameKey`: se conserva el dominio; la deduplicación evita alias redundantes pero no borra la forma con punto.
- Más de 4096 caracteres tras escapar: reservar el dominio, omitir términos completos que no caben, probar alias posteriores, marcar `termsTruncated` y mostrar aviso. Si el mínimo no cabe, fila `failed/error` sin consultas filtradas. Probar el caso de un alias largo antes de uno corto.
- Sin fila en un segmento: cuatro métricas a cero. CTR y posición de cada segmento son los de su propia respuesta; no se suman ni se atribuyen al hueco.
- Sin clics pero con impresiones: porcentaje de clics «—» si el total de clics es cero; porcentaje de impresiones sí se muestra. Sin impresiones totales: mensaje vacío y ningún porcentaje.
- Un bloque anterior con impresiones pero cero clics: se muestra el cambio de clics de base cero; si no tenía impresiones, no hay comparación.
- Hueco negativo en uno o ambos periodos por redondeo o diferencias entre respuestas: mostrar cero y aviso de desajuste, sin afirmar igualdad de sumas. Todo en el hueco: ambos bloques cero y el hueco igual al total.
- Captura anterior a la migración seguida de una fallida: conservar los datos anteriores sin bloque ni etiquetas y el aviso del último fallo; la frase de actualizar depende de la configuración actual.

## Acceptance criteria

- AC-001 Con una captura simulada correcta, inspeccionar la fila `completed`: `segments.version = 1`, cuatro `Totals` completos y `terms` efectivos. Inspeccionar la sección: dos bloques con clics, impresiones, ambos porcentajes, cambios de clics cuando procede, hueco y términos; la tarjeta de resumen mantiene su texto.
- AC-002 Con «Clínica García», alias `["clinicagarcia"]` y dominio `clinicagarcia.es`, `brandTerms` devuelve los tres textos originales en ese orden. La expresión empieza por `(?i)`, contiene literales escapados con acento y sin él, y la variante con espacios del dominio; `isBrandedQuery` y la expresión sin el prefijo, compilada en JS con bandera `i` como aproximación para este subconjunto literal, dan el mismo veredicto en los casos de AC-005. La aceptación real de RE2 y `(?i)` por Google queda para la captura manual de AC-014.
- AC-003 En la captura simulada, inspeccionar diez peticiones: token, propiedades y ocho Search Analytics. Las cuatro nuevas tienen dimensiones vacías, `rowLimit: 1`, mismo periodo/propiedad/`type: web`/`dataState: final` que los totales y el operador `includingRegex` o `excludingRegex` correspondiente; las cuatro existentes conservan su cuerpo previo. Las ocho consultas de Search Analytics se inician antes de resolver cualquiera de ellas.
- AC-004 Con cifras `totals=100`, `branded=30`, `nonBranded=50`, el hueco mostrado es 20; con `branded=70`, `nonBranded=50`, es 0 y aparece el aviso de desajuste. Comprobar clics e impresiones en ambos periodos. Ningún `hidden` aparece en el JSON persistido; CTR y posición de los segmentos permanecen como los devolvió su respectiva respuesta.
- AC-005 Inspeccionar etiquetas en las filas proyectadas y la tabla: «olessium opiniones», «OLESSIUM.COM» y «clínica garcía» se marcan para sus empresas; «clinica dental madrid» no. Con un término `olessium.com`, tanto «olessium.com» como «olessium com» se marcan y una búsqueda sin esas variantes no. Una captura sin `segments` no recibe etiquetas.
- AC-006 Una fila `completed` previa con `segments = null`, seguida o no de `failed`, conserva cifras, tablas, fuente, tarjeta y último fallo. La sección muestra la frase de actualizar si hay botón, o la de configurar credenciales si no lo hay; no muestra bloque ni etiquetas.
- AC-007 Simular por separado 403 (API desactivada y sin acceso), 429 y 500 en cualquiera de las cuatro consultas: inspeccionar una sola fila `failed`, `segments = null`, motivo existente correcto y ninguna fila `completed` nueva. Buscar literalmente token, JWT, clave y la expresión completa en el error, el resultado fallido y la fila fallida: no aparecen. En una fila correcta aparecen los términos efectivos, nunca token, JWT, clave ni expresión.
- AC-008 Tras aplicar `0009`, leer una fila previa insertada sin `segments` como nulo y una nueva con `segments` válido. La base rechaza `failed` con `segments`, valor no objeto, versión distinta de 1 y forma incompleta. La lectura de una fila previa sigue funcionando tras el cambio de esquema Drizzle. PLAN.md recoge el orden de rollback de Data model changes; no se ejecuta el borrado de la columna.
- AC-009 Comprobar claves nuevas en `searchConsole` para `es` y `en` y prueba de catálogos. La nota de privacidad conserva las dos ideas anteriores y añade el límite de clasificación; los avisos de recorte y desajuste tienen traducción.
- AC-010 Ejecutar lint, typecheck, unitarias, integración y build con éxito. Las pruebas previas de Search Console siguen pasando; fixtures de `CollectedData` y mocks de `SearchConsoleDeps.collect` se adaptan a los campos añadidos sin alterar sus expectativas funcionales.
- AC-011 En navegador a 375 px, en `es` y `en`, la sección con segmentos y términos largos no produce scroll horizontal de página. Comprobar texto visible y distinción de la etiqueta «marca» en la tabla.
- AC-012 Con nombre y alias que hacen superar 4096 caracteres tras escapar, pero dominio corto, inspeccionar que la expresión final mide como máximo 4096, incluye el dominio completo, omite enteros los términos que no caben, conserva uno posterior corto si cabe y persiste `termsTruncated = true` con aviso. En un caso separado, solo unitario sobre `brandTerms` con un dominio sintético que por sí solo no cabe, observar el error tipado; en la captura simulada ese error da `failed/error` y cero llamadas Search Analytics filtradas.
- AC-013 Con totales a cero, porcentajes «—» y mensaje de periodo sin búsquedas; con cero clics y más de cero impresiones, porcentaje de clics «—» e impresiones calculadas; con bloque anterior sin impresiones, cambio ausente; con impresiones anteriores y cero clics, cambio de base cero. Inspeccionar los textos y valores de ambos bloques.
- AC-014 En una captura real de olessium.com con cuenta de servicio y acceso, observar si Google acepta `(?i)` y los filtros `includingRegex`/`excludingRegex` y guardar la respuesta o el motivo de error sin credenciales. Inspeccionar el bloque en `es` y `en`; el resultado puede ser cero, sin presuponer que todo esté en el hueco. Si Google rechaza la expresión, la decisión sobre sintaxis debe resolverse antes de cerrar la feature.
- AC-015 Con un término que contiene `<script>` y metacaracteres, comprobar en el DOM que se ve como texto literal, no existe un nodo `script` ni enlace creado por el término, y la expresión enviada trata los metacaracteres como literales.

## Test scenarios

- Unitarias: `brandTerms` (orden, deduplicación por `nameKey`, conservación de puntuación, dominio obligatorio, umbral, acentos, escape de literales, límite 4096, omisión de término largo y continuidad); `isBrandedQuery` y coincidencia con la expresión del subconjunto literal; captura con `fetch` simulado (diez peticiones, cuatro filtros, concurrencia, fila ausente, fallos); resumen (porcentajes, cambios, huecos positivos/negativos, captura previa, etiquetas); render (375 px, textos seguros, estados); catálogos.
- Integración: persistir y leer `segments`; leer fila previa con nulo; rechazar objetos inválidos y `failed` con datos; mantener último éxito tras fallo.
- Manual: AC-014 en navegador con la cuenta real. Registrar resultado de compatibilidad RE2 antes del cierre; escribir en la base de desarrollo solo el intento propio.

## Source of Truth Matrix

| Dato | Fuente | Verificado |
|---|---|---|
| Firma actual `querySearchAnalytics`, cuerpo con `type: web` y `dataState: final`, timeout | `src/modules/search-console/google.ts:31-38,148-184` | Verificado en repositorio, 2026-10-29 |
| `nameKey` sustituye puntuación por espacios; la detección GEO trata dominio con otra regla | `src/modules/geo/detection.ts:31-63` | Verificado en repositorio, 2026-10-29 |
| `dimensionFilterGroups[]` con `groupType` solo `and`; `filters[]` con `dimension` (`query` entre otras), `operator` (`contains`, `equals`, `notContains`, `notEquals`, `includingRegex`, `excludingRegex`) y `expression` de hasta 4096 caracteres; regex en sintaxis RE2 | developers.google.com/webmaster-tools/v1/searchanalytics/query | Verificado 2026-10-29, leída la página |
| `rowLimit` admite de 1 a 25.000 | misma página | Verificado 2026-10-29 |
| La página de la API no dice si los operadores regex distinguen mayúsculas; `equals`/`notEquals` sí las distinguen en `query` y `contains`/`notContains` no | misma página | Verificado 2026-10-29 |
| En la interfaz de Search Console el regex no distingue mayúsculas por defecto y `(?-i)` lo fuerza; RE2 | support.google.com/webmasters/answer/17011165 | Verificado 2026-10-29 para la interfaz. Que la API acepte el prefijo `(?i)`: UNVERIFIED, lo comprueba AC-014 |
| Al filtrar por búsqueda los totales cambian por «la omisión de las búsquedas anónimas» | support.google.com/webmasters/answer/17011165 | Verificado 2026-10-29 para la interfaz. Para la API: UNVERIFIED; el hueco se describe sin causa exclusiva (FR-004) |
| Siguiente migración numerada `0009` | `src/db/migrations/meta/_journal.json` | Verificado en repositorio, 2026-10-29 |

## Assumptions

- `workspace.name` representa la marca comercial; si la razón social difiere, el operador utiliza `brandAliases`. Los cambios en ficha solo afectan capturas futuras; `terms` congela los usados en cada captura.
- La empresa se lee una vez al iniciar `refreshSearchConsole`; sus valores se pasan a `collect`, de modo que una edición concurrente no mezcla nombre, alias y dominio de momentos distintos.
- El dominio guardado es un hostname ASCII en minúsculas según `src/modules/workspaces/schema.ts:13-16`; se usa esa forma, sin descomponer punycode. La longitud y la validez del dominio se revisan con la restricción del límite de FR-002 antes de enviar el filtro.
- Se espera que `(?i)` y los literales escapados sean aceptados por la API; queda UNVERIFIED y se prueba en AC-014. Hasta entonces no se presupone sensibilidad a mayúsculas ni coincidencia exacta entre la clasificación local y Google en casos Unicode poco habituales.
- El delta entre totales generales y filtrados puede incluir búsquedas omitidas y diferencias entre respuestas. No se interpreta como una categoría de consultas ni se reparte.
- `dataState: final` y los periodos de la 003 se mantienen; un delta negativo no se atribuye a datos «no finales» sin evidencia.
- Dos clics seguidos siguen creando dos filas (003). La acción conserva su perímetro sin autenticación (D-03 del roadmap).
- No hay `specs/CONSTITUTION.md` ni `specs/SERVICES.md`; se siguen las convenciones de las features 003 y 006.

## Open questions

- **Posición de la etiqueta «marca».** Resolved: junto al texto de la búsqueda, con un espacio antes (D005, D008).
- **Si Google acepta e interpreta `(?i)` y los literales escapados.** Deferred: sin impresiones, la API responde 200 incluso a expresiones inválidas (D007). Se comprueba cuando olessium.com tenga datos (TASKS › Follow-ups).

## Implementation summary

`brand-terms.ts` construye los términos de marca desde la ficha de la empresa y una expresión RE2 de literales escapados, con lista blanca por variante y límite de 4096 bytes. `collectSearchConsole` añade cuatro consultas filtradas a las cuatro de la 003, en el mismo `Promise.all`. El resultado se guarda en la columna `segments`, añadida por la migración `0009`, con un `check` en modo `strict` desde la `0010`. La página SEO muestra el bloque «Con tu marca y sin ella» con porcentajes, cambio, parte sin clasificar y términos, y la etiqueta «marca» en la tabla de búsquedas.

Comportamiento añadido sobre el texto original, recogido en las enmiendas: la lista blanca y la guarda de dominio vacío lanzan `BrandTermsError`; si los términos guardados no compilan, la tabla se queda sin etiquetas en lugar de fallar; en el estado vacío se mantienen los bloques y su cambio.

## Decisions pre-registered for DECISIONS.md

- D001 Términos de marca desde la ficha (nombre, alias, dominio), sin lista aparte. Motivo: ya existen, el GEO los usa y una segunda lista divergiría. Coste de revertir: bajo (añadir un campo opcional de términos SEO).
- D002 Coincidencia por contenido, no por palabra completa. Motivo: el informe quiere identificar búsquedas que contienen la marca y cubrir «olessium.com», «olessiumopiniones» y errores de espaciado. Riesgo asumido: nombres genéricos clasifican de más y se enseña la lista de términos.
- D003 El hueco se presenta, no se reparte. Motivo: repartirlo proporcionalmente inventaría un dato; la regla del producto es no mezclar ni estimar (doc 08 §1).

## Contracted services

Contracted services not declared → all billable add-ons treated as NOT contracted (conservative default). Run `/project-init` to declare them. Esta feature no usa ningún servicio de pago: Search Console es gratuito con la credencial existente.
