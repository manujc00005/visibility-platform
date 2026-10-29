# Feature Spec: Conversiones desde la búsqueda orgánica en GA4

## Status

In Progress (2026-10-29). T001–T003 hechas. Plan, tareas y decisiones en esta carpeta; análisis previo y su validación en `ANALYSIS.md`.

## Problem

La sección «Visitas a tu web» (spec 006) enseña usuarios, sesiones, páginas vistas, canales y páginas, pero no dice si esas visitas acaban en algo: un formulario enviado, una llamada, una compra. El encargo pide «conversiones y leads desde la búsqueda orgánica». GA4 llama a esas acciones «eventos clave» (antes «conversiones») y la spec 006 las dejó fuera de alcance de forma expresa.

## Goal

Cada captura de GA4 guarda, además de lo que ya guarda, los eventos clave del periodo actual y del anterior, en total y desde la búsqueda orgánica, el desglose por evento de los que llegan desde la búsqueda orgánica, y qué eventos clave tiene configurados la propiedad. La sección muestra un bloque «Conversiones desde buscadores» con esas cifras, su cambio y su desglose, y distingue «no hay eventos clave configurados» de «no hubo ninguno en el periodo». Sin proveedor nuevo, sin coste y con la misma cuenta de servicio.

## Non-goals

- Ingresos, comercio electrónico, valor de conversión o moneda.
- Tasas de conversión calculadas por GA4 (`sessionKeyEventRate`, `userKeyEventRate`): son decimales y el cliente de la 006 solo acepta enteros (FR-010 de la 006). No se calcula ninguna tasa propia.
- Conversiones por página, por campaña, por fuente concreta o por buscador concreto.
- Modelos de atribución distintos del predeterminado de la propiedad.
- Crear, editar o marcar eventos clave en GA4.
- Unir GA4 con Search Console o Bing en una sola cifra.
- El informe PDF y la tarjeta del resumen de la empresa.
- Histórico diario (Fase 6).
- Reclasificar capturas guardadas antes de esta feature.

## Users / Actors

- Operador: pulsa «Traer datos de Analytics» o «Actualizar datos» como hasta ahora. Si la propiedad no tiene eventos clave, los marca en GA4 (Administrar › Eventos clave) y vuelve a capturar.
- Google Analytics Admin API v1beta: `properties.keyEvents.list`, de solo lectura, con el alcance `analytics.readonly` que ya usa la 006.
- Google Analytics Data API v1beta: `properties.runReport` con la métrica `keyEvents`, la dimensión `sessionDefaultChannelGroup` y la dimensión `eventName`. `capture_condition = owner_api`.

## Current behavior

- `src/modules/analytics/collect.ts`: token, resúmenes de propiedades, flujos web de cada candidata, y tres informes en paralelo (totales, canales, páginas). Seis llamadas en el caso habitual.
- `src/modules/analytics/ga4.ts`: `runReport` no admite filtros de dimensión; las métricas se exigen enteras.
- `analytics_snapshots` guarda totales, canales, páginas y avisos de calidad; no hay nada de eventos clave.
- `AnalyticsSection` muestra tres cifras, la tabla de canales y la de páginas.

## Desired behavior

1. Al capturar, además de lo actual, la app lista los eventos clave configurados en la propiedad y pide a GA4 dos informes más: eventos clave por canal en los dos periodos, y eventos clave por nombre de evento desde la búsqueda orgánica en el periodo actual.
2. La fila guardada lleva esos datos en una columna nueva.
3. La sección muestra, entre las tres cifras y las tablas, el bloque «Conversiones desde buscadores»: eventos clave desde búsqueda orgánica y eventos clave en total, cada uno con su cambio frente al periodo anterior y la parte orgánica sobre el total; una tabla con los eventos clave orgánicos por nombre; y la lista de eventos clave configurados.
4. Sin eventos clave configurados, el bloque explica que GA4 no tiene ninguno y cómo marcarlos, sin cifras a cero que parezcan un resultado.
5. Una captura anterior a esta feature se muestra como hasta ahora y, en lugar del bloque, una frase pide actualizar los datos.
6. Si una de las llamadas nuevas falla, la captura entera falla con el motivo de siempre; no se guarda una fila `completed` a medias.

## Functional requirements

- FR-001 Eventos clave configurados: `GET {ADMIN_BASE}/{property}/keyEvents?pageSize=200`, una página. Se guardan los `eventName` de las entradas válidas en el orden de la respuesta, recortados a 100 caracteres, como mucho 50, y `configuredMore = true` si la respuesta trae `nextPageToken` o había más de 50. Una respuesta sin `keyEvents` es una lista vacía, no un error; una entrada sin `eventName` textual hace fallar la captura con `error`, sin inventar un nombre.
- FR-002 Eventos clave por canal: un `runReport` con los mismos rangos explícitos `current` y `previous` de la 006, dimensiones lógicas `sessionDefaultChannelGroup` y `dateRange`, métrica `keyEvents`, `limit` 100. Según D010 de la 006, `runReport` no envía `dateRange` en `dimensions`: GA4 la añade a la respuesta y se exige en las filas. Para cada periodo, `total` es la suma de **todas las filas devueltas**, incluida `(other)`; `organic` suma solo las filas cuyo canal bruto sea exactamente `Organic Search` (D003), o vale cero si no hay ninguna. No sumar los canales ya recortados para la tabla de sesiones ni atribuir la diferencia entre informes a una causa exclusiva. Si la respuesta alcanza el límite de 100 filas, la suma puede quedarse corta; el bloque la identifica siempre como suma de canales devueltos, no como un total independiente de GA4.
- FR-003 Desglose orgánico: un `runReport` del periodo actual, dimensión `eventName`, métrica `keyEvents`, con `dimensionFilter: { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: "Organic Search", caseSensitive: true } } }`, ordenado por `keyEvents` descendente, `limit` 10. Se guardan solo las filas con `keyEvents > 0`, en el orden recibido y con el nombre recortado a 100 caracteres. `(not set)` se conserva y se pinta literalmente; el desglose puede sumar menos que `organic` por el límite de 10 y los avisos de calidad.
- FR-004 `runReport(token, property, request, options)` conserva su firma. `ReportRequest` acepta `dimensionFilter?` con la única forma fija de FR-003; se añade al cuerpo solo si existe. Sin él, el cuerpo de las tres peticiones existentes permanece idéntico, incluido `limit` como cadena y la eliminación de `dateRange` de `dimensions`.
- FR-005 Después de elegir la propiedad, se inician en paralelo los cinco informes de la Data API y `keyEvents.list`, antes de que termine cualquiera de esas seis llamadas. Token, resúmenes y flujos conservan su orden. El caso habitual pasa de 6 a 9 peticiones; con 20 propiedades revisadas, el máximo pasa de 25 a 28. Cada llamada nueva conserva el límite de 15 s.
- FR-006 Persistencia: columna nullable `key_events jsonb` en `analytics_snapshots`, nula en filas `failed` y en capturas anteriores a la migración. En las nuevas `completed` tiene `{ version: 1, configured: string[], configuredMore: boolean, total: number, previousTotal: number, organic: number, previousOrganic: number, organicByEvent: { event: string; keyEvents: number }[] }`. Cada métrica de respuesta sigue FR-010 de la 006: texto entero entre 0 y 10¹²; un decimal, negativo, vacío o valor mayor produce `failed/error`. Las sumas se hacen con enteros exactos y, si superan 10¹², también producen `failed/error`. La lista configurada y los nombres se congelan en la captura; un cambio posterior en GA4 solo afecta a la siguiente.
- FR-007 Calidad: los avisos de los dos informes nuevos (`dataLossFromOtherRow`, `subjectToThresholding`, `samplingMetadatas`) se combinan por OR con los de los tres informes existentes (FR-011 de la 006). `(other)` se incluye en la suma del periodo, pero no en `organic`; si el informe trae `dataLossFromOtherRow`, se muestra el aviso existente. El aviso de umbral o muestreo describe una limitación, no altera cifras ni convierte la captura en fallo. El límite de 100 filas y la diferencia posible entre desglose y cifra orgánica se explican sin afirmar que la suma sea un total exacto.
- FR-008 Resumen: `summarizeAnalytics` devuelve `keyEvents: KeyEventsView | null` desde la última captura `completed`, también cuando `state = empty` por falta de visitas; en ese estado conserva además el aviso de calidad de FR-007. El estado del bloque es `none_configured` si `configured` está vacía, y `ok` en otro caso. Con `ok`, formatea `organic` y `total`, calcula el cambio de cada cifra con `countChange` de Search Console solo si **su propio** valor anterior es mayor que cero, y la parte orgánica como `organic / total` en porcentaje, o «—» si `total` es cero. Proyecta `organicByEvent` y `configured` con aviso si `configuredMore`. Si `total > 0` pero `organic = 0`, no asegura que no hubo búsquedas orgánicas: explica que no llegó ningún recuento positivo bajo el nombre exacto `Organic Search`.
- FR-009 Sección: bloque «Conversiones desde buscadores» dentro de la tarjeta, debajo de las tres cifras; también aparece si la captura de la 006 está en estado `empty` y tiene `key_events`. Con `none_configured`, frase que explica que la propiedad no tiene eventos clave y dónde marcarlos, sin cifras. Con `ok` y total cero en los dos periodos, cifras a cero y frase que dice que GA4 no devolvió eventos clave en estos periodos. Con configurados y `previousTotal = 0`, frase que advierte que marcar un evento como clave después del inicio del periodo puede dejar parte del anterior sin datos. Captura `completed` sin `key_events`: frase que pide «Actualizar datos» solo si hay botón, o explica que deben configurarse las credenciales si no lo hay (como FR-008 de la 007). Sin captura `completed`, no hay bloque ni frase de actualización. Se conservan el último fallo, los avisos y el resto de la sección.
- FR-010 Fallo: un error en `keyEvents.list` o en cualquiera de los dos informes nuevos, incluida respuesta inválida o suma fuera del límite, produce el motivo existente de la 006 (`invalid_credentials` para 401, `admin_api_disabled`/`data_api_disabled` para 403 con API desactivada, `no_access` para otro 403, `quota_exceeded` para 429, `error` para el resto). La captura guarda solo una fila `failed` sin `key_events`; el último éxito permanece visible. Los mensajes siguen siendo fijos, sin URL, cuerpo de respuesta, token ni clave.
- FR-011 Nombres de evento y de canal se pintan como texto, nunca como enlace ni HTML (B08b). La etiqueta del bloque aclara que «buscadores» incluye Google, Bing y el resto de buscadores que GA4 agrupa en `Organic Search`.
- FR-012 Textos en `es` y `en` en el namespace `analytics` de `src/i18n/messages`, con la salida española como referencia.

## Non-functional requirements

- Rendimiento: tres llamadas más por intento, en paralelo con los informes existentes; comprobar concurrencia y límite de 15 s en pruebas simuladas. Sin promesa de latencia ni cuota sin medición real (cuota UNVERIFIED en la 006).
- Seguridad: solo lectura y el mismo alcance; token, JWT y clave privada no se guardan, registran ni aparecen en errores, resultados o filas (búsqueda literal, como AC-006 de la 006). Los nombres de evento y canal nunca se convierten en HTML ni enlaces.
- Observabilidad: el intento queda en la fila como hoy.
- Mantenibilidad: sin dependencias nuevas; la forma del filtro es un tipo fijo, no un constructor genérico.

## API / Interface changes

- `ga4.ts`: `listKeyEvents(token, property, options?: ClientOptions) → Promise<{ events: string[]; more: boolean }>` con la misma validación `properties/<id>`, host fijo, `redirect: "error"`, `cache: "no-store"` y límite de 15 s que las otras llamadas; `ReportRequest` gana `dimensionFilter?` con el tipo fijo de FR-003. `runReport(token, property, request, options)` no cambia de firma.
- `collect.ts`: `CollectedData` gana `keyEvents: KeyEvents`.
- `summary.ts`: `AnalyticsSummary` gana `keyEvents: KeyEventsView | null`.
- `analytics-section.tsx`: bloque nuevo. Sin acción ni ruta nueva.

## Data model changes

Migración `0011_analytics_key_events.sql`, siguiente a `0010_search_console_segments_strict` (`src/db/migrations/meta/_journal.json`), aditiva: `key_events jsonb` nullable sin valor por defecto ni backfill. El esquema Drizzle incorpora el mismo campo tipado. Los `check` rechazan `failed` con `key_events`; para un valor no nulo exigen objeto con todas las claves, `version` numérico igual a 1, `configured` array de cadenas, `configuredMore` booleano, los cuatro contadores numéricos y `organicByEvent` array de objetos con `event` de texto y `keyEvents` numérico, con un solo predicado `jsonb_path_exists` en modo `strict`, como la 007 tras su D008: el modo `lax` acepta arrays donde se espera un objeto o un valor. En `strict`, `configured` y `organicByEvent` pueden estar vacíos, pero cada elemento debe tener la forma exacta. La aplicación valida además enteros entre 0 y 10¹², longitud de nombres y límites de listas; `jsonb` no sustituye esa validación. Las filas `completed` anteriores siguen con nulo; el servicio escribe `key_events` en toda captura nueva correcta. Sin índice ni reescritura de filas anteriores. Verificar lectura de filas previas y nuevas tras migrar. Rollback técnico: retirar primero el código lector/escritor y después, si se acepta perder los datos nuevos, eliminar la columna; no retirarla mientras una versión desplegada aún la use.

## Edge cases

- Propiedad sin eventos clave configurados ahora: `configured` vacío; se guardan los contadores tal como los devuelvan los informes, incluso si reflejan eventos marcados durante el periodo y retirados después. La sección explica cómo marcarlos (FR-009) y no enseña cifras bajo el estado `none_configured`.
- Eventos clave marcados después del inicio de cualquiera de los periodos: GA4 no rellena los días anteriores al marcado según la descripción verificada de `keyEvents`; las cifras de periodos distintos pueden no ser comparables. La frase de FR-009 aparece con configurados y `previousTotal = 0`, sin atribuir ese cero necesariamente al momento de marcado.
- Sin fila `Organic Search` en un periodo: orgánico cero en ese periodo.
- Total cero y orgánico cero: parte orgánica «—».
- Periodo anterior a cero: sin cambio para esa cifra.
- Más de 50 eventos configurados o `nextPageToken`: lista recortada y aviso.
- Un evento orgánico con `keyEvents` cero (evento normal que también aparece): no se guarda.
- Nombre de evento o canal con HTML: texto.
- Fila `(other)` en el informe por canal: entra en la suma, nunca en `organic`; con `dataLossFromOtherRow` aparece el aviso de calidad existente.
- Informe por canal con 100 filas o desglose por evento con 10: las sumas y la tabla se limitan a las filas recibidas; no se infiere un total real ni se fuerza que el desglose sume `organic`.
- Propiedad cuyos nombres de canal no llegan en inglés: solo coincide el valor literal `Organic Search` por D003; si hay total positivo sin recuento orgánico positivo, la sección advierte de la ausencia de ese recuento, sin traducir ni reclasificar nombres. La forma real del valor para otras configuraciones sigue UNVERIFIED.
- Fila orgánica con `eventName = "(not set)"`: se guarda y muestra como texto literal si su métrica es positiva; no se presenta como evento configurado por ese motivo.
- `keyEvents` decimal, negativo, vacío o mayor que 10¹², o suma de filas mayor que 10¹²: `failed/error`, sin columna nueva en esa fila.
- Avisos de umbral o muestreo en cualquiera de los dos informes: se combinan con los existentes y se explican aun con cifras a cero; no se inventan filas ocultas.
- Propiedad sin visitas de la 006 pero con eventos clave: se muestra el estado «Sin visitas» y también el bloque calculado de esta captura.
- Admin API activada y Data API no, o al revés: el motivo que nombra la API (FR-013 de la 006).
- Captura anterior a la migración seguida de un fallo: datos anteriores sin bloque, con la frase de actualizar y el aviso del fallo.

## Acceptance criteria

- AC-001 Con una captura simulada correcta, inspeccionar la fila `completed`: `key_events.version = 1`, lista configurada, cuatro contadores y desglose con el orden de FR-003. Inspeccionar el resumen y el DOM: bloque con cifras formateadas, cambios, parte orgánica, tabla y configurados. Comparar cifras y tablas previas con la misma fixture sin la feature: conservan su contenido.
- AC-002 En la recogida simulada de una propiedad, inspeccionar nueve peticiones: token, resúmenes, flujos, los tres informes con cuerpo idéntico al actual, `GET /properties/<id>/keyEvents?pageSize=200`, informe por canal con rangos `current`/`previous`, solo `sessionDefaultChannelGroup` enviado como dimensión, `keyEvents` y `limit: "100"`; desglose con rango actual, `eventName`, `keyEvents`, filtro con la forma exacta de FR-003, orden descendente y `limit: "10"`. En las filas simuladas de canal, `dateRange` llega en cabeceras y se usa para separar periodos. Las seis llamadas posteriores a la propiedad comienzan antes de resolver cualquiera; comprobar también el límite de 15 s de las nuevas llamadas.
- AC-003 Con filas de ambos periodos, incluidas `(other)` y `Organic Search`, inspeccionar los cuatro contadores: total suma todas las filas recibidas por periodo y orgánico solo las de ese canal exacto; sin él, orgánico cero. Un informe de 100 filas y una tabla de 10 eventos muestran la nota de límite sin igualar la suma del desglose al orgánico. Filas de desglose a cero quedan fuera; `(not set)` positivo queda literal; nombres de más de 100 caracteres se recortan. Con total positivo y orgánico cero, aparece la advertencia de FR-008, también si la respuesta usa otro idioma para el canal. Con cada aviso de calidad en uno de los dos informes nuevos, el resumen y el DOM conservan el OR de los cinco informes y muestran el texto correspondiente incluso en `state = empty`.
- AC-004 Simular `keyEvents.list` sin campo, con 3 y con 60 eventos, y con `nextPageToken`: inspeccionar orden, recorte a 100 caracteres, máximo 50 nombres y `configuredMore` correcto; sin campo se obtiene `[]` y `false`. Una entrada sin `eventName` textual da `failed/error` sin `key_events`. Un id de propiedad inválido falla antes de llamar a la red.
- AC-005 Simular 401, 403 con cada API desactivada y sin acceso, 429, 500, JSON inválido, timeout, `keyEvents` decimal, negativo, vacío o mayor que 10¹², y suma que supere 10¹² en cada llamada nueva donde proceda. Inspeccionar el motivo de FR-010, una sola fila `failed` con `key_events` nulo, ninguna `completed` nueva y último éxito visible. Buscar literalmente token, JWT, clave, URL y cuerpo de Google en error, resultado, fila y registros de la prueba: no aparecen.
- AC-006 Una fila `completed` previa con `key_events` nulo, seguida o no de `failed`, conserva en resumen y DOM cifras, tablas, avisos y último fallo; la sección muestra frase de actualizar si hay botón o de configurar credenciales si no, sin bloque. Sin captura `completed` no aparece esa frase. Una captura `completed` con totales de visitas a cero y `key_events` válido conserva «Sin visitas» y muestra el bloque.
- AC-007 Con `configured` vacío y contadores simulados tanto a cero como positivos por eventos ya retirados, inspeccionar la fila: conserva los valores recibidos; inspeccionar DOM: explicación de dónde marcar eventos y ninguna cifra del bloque. Con configurados y ambos totales a cero, cifras cero y frase de que GA4 no devolvió eventos en esos periodos. Un evento configurado después del comienzo del periodo con `previousTotal = 0` muestra la advertencia sin afirmar la causa del cero.
- AC-008 En el resumen y DOM, `previousOrganic = 0` oculta solo el cambio orgánico y `previousTotal = 0` oculta solo el cambio total; con sus bases positivas aparecen los cambios de `countChange`. Con `total = 0`, parte orgánica «—»; con `organic = 25` y `total = 100`, 25 %; `configuredMore` muestra aviso. La etiqueta aclara el alcance de «buscadores» y que total es suma de canales devueltos.
- AC-009 Tras aplicar `0011`, leer una fila previa insertada sin la columna como `key_events = null` y una nueva válida. La base rechaza, con el código 23514 y el nombre exacto de la restricción, `failed` con `key_events`, no objeto, versión distinta de 1 o dentro de un array, clave ausente, contador de texto, `configured` con elemento no textual o anidado, y `organicByEvent` con elemento sin `event` o `keyEvents`; acepta listas vacías y una fila con todo a cero. Inspeccionar que el esquema Drizzle coincide con la migración; documentar en el plan el orden de rollback de Data model changes, sin ejecutar el borrado de columna.
- AC-010 Inspeccionar el DOM con nombres de evento configurado, evento de desglose y canal que contengan `<script>` o texto de enlace: se ven literales, sin nodos `script` ni enlaces creados por esos datos. En la fila persistida no aparecen token, JWT ni clave.
- AC-011 Inspeccionar claves nuevas en `analytics` de los catálogos `es` y `en`; la prueba de catálogos pasa y ambos idiomas muestran estados, avisos y nota de límites.
- AC-012 Ejecutar lint, typecheck, unitarias, integración y build con éxito; las pruebas previas de GA4 siguen pasando y sus cuerpos de petición conservan las expectativas anteriores salvo los campos nuevos de los resultados simulados.
- AC-013 En navegador, con la cuenta de servicio real, registrar la respuesta o motivo tipado de las tres llamadas nuevas sin credenciales; comprobar el bloque o motivo accionable de olessium.com en `es` y `en`, y a 375 px sin scroll horizontal de página. Registrar si la API acepta ambas combinaciones dimensión/métrica y si devuelve el canal literal `Organic Search`; un 200 con todo a cero no demuestra la semántica del desglose con datos y queda como seguimiento, no como cifra validada.

## Test scenarios

- Unitarias: `listKeyEvents` (vacío, orden, recorte, paginación, propiedad inválida, errores 401/403/429/500); `runReport` con y sin filtro y cuerpo previo idéntico; recogida (nueve peticiones, concurrencia, `dateRange` solo en respuesta, sumas y límite de 10¹², `(other)`, canal no inglés, `(not set)`, fallos y búsqueda literal de secretos); resumen (estado `empty`, cambios independientes, porcentaje, límites y avisos de calidad); render (bloque, sin configurados, a cero, captura antigua, texto hostil, inglés); catálogos.
- Integración: persistir y leer `key_events`; fila previa con nulo; rechazos de la base; fallo sin `key_events`; último éxito tras un fallo; comprobar lectura Drizzle tras la migración.
- Manual: AC-013 con la cuenta real, escribiendo en `dev` solo el intento propio; anotar las respuestas o motivos sin secretos y dejar pendiente la comparación con datos si solo hay ceros.

## Source of Truth Matrix

| Dato | Fuente | Verificado |
|---|---|---|
| `GET /v1beta/{parent=properties/*}/keyEvents`, `pageSize` 50 por defecto y 200 como máximo, `nextPageToken`; alcance `analytics.readonly` aceptado | developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties.keyEvents/list | 2026-10-29 |
| `KeyEvent`: `name`, `eventName`, `createTime`, `deletable`, `custom`, `countingMethod`, `defaultValue` | .../admin/v1/rest/v1beta/properties.keyEvents | 2026-10-29 |
| Métrica `keyEvents`: «el recuento de eventos clave; marcar un evento como clave afecta a los informes desde su creación» | developers.google.com/analytics/devguides/reporting/data/v1/api-schema | 2026-10-29 |
| `sessionKeyEventRate` y `userKeyEventRate` son porcentajes (decimales) | misma página | 2026-10-29 |
| Dimensión `sessionDefaultChannelGroup`; el grupo de canales incluye el valor `Organic Search` | misma página | 2026-10-29 (el valor se lee en la descripción de `defaultChannelGroup`) |
| `FilterExpression` con `filter.fieldName` y `stringFilter { matchType: EXACT, value, caseSensitive }` | .../data/v1/rest/v1beta/FilterExpression | 2026-10-29 |
| Compatibilidad de `keyEvents` con `sessionDefaultChannelGroup` y con `eventName` en un mismo informe | Sin fuente leída | UNVERIFIED; la comprueba la captura real (AC-013). Si GA4 la rechaza, la recogida falla con `error` y se anota en DECISIONS |
| Los nombres de canal llegan en inglés sea cual sea el idioma de la propiedad | Comportamiento visto en la 006 (canales mostrados «como los da GA4, en inglés») | UNVERIFIED para propiedades en otros idiomas |
| `limit: 100` del informe por canal basta para abarcar todos los canales de cualquier propiedad, y la suma coincide con un informe total sin dimensión | Sin comparación real en el repositorio | UNVERIFIED; se presenta como suma de filas devueltas, no como total independiente |
| El desglose filtrado por `Organic Search` coincide exactamente con la cifra del informe por canal con datos y un evento `(not set)` conserva ese valor | Sin captura con datos en el repositorio | UNVERIFIED; AC-013 comprueba aceptación de la petición y la comparación con datos queda como seguimiento |

## Assumptions

- «Conversiones y leads» del encargo equivalen a los eventos clave que el propietario marca en GA4. Un lead es un evento clave como `generate_lead` o un envío de formulario; la app no decide qué es un lead.
- «Búsqueda orgánica» es el canal `Organic Search` del grupo de canales predeterminado de la sesión: agrupa todos los buscadores, no solo Google.
- El valor literal `Organic Search` no se traduce antes de filtrar ni al comparar filas (D003). Una propiedad que devuelva otro nombre puede mostrar orgánico cero; la sección advierte cuando hay total positivo y no hay coincidencia, y la captura real registrará el valor recibido.
- `total` y `previousTotal` son sumas de las filas devueltas por el informe acotado a 100, no una consulta separada del total de eventos clave. La tabla orgánica se acota a diez; ninguna suma de tabla se usa para corregir contadores.
- La lista Admin describe la configuración en el momento de la captura; no prueba qué eventos estuvieron marcados durante todo el periodo. `configured` vacío no se interpreta como una medición histórica de cero.
- Los avisos de calidad son los de GA4 y pueden coexistir con resultados a cero; no permiten reconstruir cifras ocultas.
- La atribución es la predeterminada de la propiedad para dimensiones de sesión; no se cambia ni se explica más allá de la frase de FR-011.
- La propiedad y la cuenta de servicio son las de la 006; no cambia la búsqueda de propiedad.
- Las acciones siguen sin autenticación (D-03 del roadmap); esta feature no cambia el perímetro.
- El proyecto no tiene `specs/CONSTITUTION.md` ni `specs/SERVICES.md`; se siguen las convenciones de la 006 y la 007.

## Open questions

- Ninguna bloqueante para planificar. La compatibilidad real de `keyEvents` con ambas dimensiones y la presencia del valor literal `Organic Search` se comprueban antes de cerrar la implementación (AC-013); si GA4 rechaza una petición, hay que resolver el contrato y actualizar la SPEC antes de dar la feature por terminada. No se presenta un 200 con ceros como validación de las cifras.
- No bloqueante para el plan: ubicación de la tabla por evento dentro de la tarjeta o junto a las otras tablas, siempre que el bloque quede bajo las tres cifras y AC-013 pase a 375 px.

## Decisions pre-registered for DECISIONS.md

- D001 Eventos clave, no tasas: los contadores son enteros y caben en el cliente de la 006; las tasas de GA4 son decimales y se dejan fuera.
- D002 Lista de eventos configurados desde la Admin API, para distinguir «sin configurar» de «cero en el periodo». Coste: una llamada más, en paralelo.
- D003 Orgánico es el canal `Organic Search` exacto, con `caseSensitive: true`; no se suman otros canales.
- D004 Columna nueva `key_events` en vez de ampliar `channels`: las filas antiguas conservan su forma y el estado «sin datos de esta feature» es explícito (nulo).

## Contracted services

Contracted services not declared → all billable add-ons treated as NOT contracted (conservative default). Run `/project-init` to declare them. Esta feature no usa ningún servicio de pago: la Admin API y la Data API de GA4 son gratuitas con la credencial existente.
