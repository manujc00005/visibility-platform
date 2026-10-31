# Feature Spec: Keywords seguidas y su evolución con Search Console

## Status

In Progress (2026-10-31). T001–T007 hechas; T008 y T009 abiertas. El cierre exige la evidencia positiva de AC-017 (D011).

## Problem

La spec 009 compara las 25 búsquedas principales con el periodo anterior, pero el operador no puede elegir qué búsquedas vigilar ni ver cómo evoluciona una en el tiempo. Una keyword importante para el negocio puede no estar entre las 25 principales. El encargo pide «keyword rankings and their changes over time». El seguimiento con posición real de Google es de pago (BL-01), pero Search Console ya da gratis la posición media por día de una búsqueda.

## Goal

El operador elige hasta 25 keywords por empresa. Cada captura de Search Console guarda su evolución semanal de las últimas 26 semanas, y la página SEO muestra para cada una su posición media de la última semana con datos, las fechas de ambas semanas comparadas, las impresiones recientes y una gráfica con huecos reales. Sin proveedor nuevo, sin coste y con la misma credencial.

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
4. La sección «Búsquedas que sigues» muestra la posición media semanal de Search Console, fechas de la primera/última semana con datos, cambio, impresiones recientes y una gráfica pequeña. No es un rank tracker de puestos fijos.
5. Una keyword recién añadida dice que falta actualizar los datos. Si Google no devuelve filas utilizables, se explica esa ausencia sin afirmar que no hubo búsquedas o impresiones, ni confundirla con un error.
6. Si la consulta nueva falla, la captura entera falla con el motivo de siempre.

## Functional requirements

- FR-001 Keywords seguidas: tabla `tracked_keywords` con `workspace_id`, `keyword` y `created_at`. Como mucho 25 por empresa.
- FR-002 Identidad: `normalizeTrackedKeyword` aplica NFC, recorta extremos, pasa a minúsculas con `toLowerCase()` (sin depender del locale del lector), colapsa espacios internos a uno y reaplica NFC. Misma función en alta y emparejado local de búsquedas. Se conservan acentos y signos; no se usa `nameKey` ni se eliminan diacríticos. Longitud de 2 a 80 puntos de código Unicode después de normalizar (`Array.from(...).length`, coherente con `char_length` de PostgreSQL). Duplicado canónico por empresa da error legible, con índice único `(workspace_id, keyword)`.
- FR-003 Escritura: altas y bajas toman el bloqueo `FOR NO KEY UPDATE` de la empresa dentro de una transacción corta como `addCompetitor`. El alta comprueba duplicado, límite de 25 y presupuesto de expresión de la lista candidata antes de insertar; errores localizados de validación, duplicado, límite o expresión demasiado grande. Quitar por `(workspaceId, keywordId)` es idempotente y no afecta a una fila ajena. Orden estable por `(created_at, id)`. Nunca mantener el bloqueo durante llamadas a Google.
- FR-004 Consulta nueva: si la empresa tiene keywords, una llamada más a Search Analytics con el rango de 26 semanas que termina en `current.end`, `dimensions: ["date", "query"]`, `rowLimit: 25000`, `type: "web"`, `dataState: "final"` y un filtro `includingRegex` sobre `query`. Va en el mismo `Promise.all`. Sin keywords no se hace la llamada. Las nueve consultas actuales mantienen su cuerpo exacto. La lista canónica se lee una sola vez antes de pedir token; se utiliza ese mismo conjunto congelado para filtro, agrupado y snapshot aunque cambie mientras Google responde.
- FR-005 Expresión: `keywordExpression` genera una expresión RE2 anclada y con insensibilidad de mayúsculas explícita (`(?i)`), con alternativas literales seguras. Separa el escape de metacaracteres de la lógica de variantes/espacios de la 007; exportar/reutilizar el escape sin alterar las expresiones de marca existentes. Las variantes de la nueva expresión cubren NFC/NFD de cada keyword y repeticiones de espacios internos mediante separadores RE2; no añaden variantes sin acentos ni sin signos. El matcher local de FR-006 es la autoridad de identidad. Medir la expresión real completa en bytes UTF-8: máximo conservador de 4096 (Google documenta caracteres). Validar el presupuesto al añadir y de nuevo antes de token: una configuración que no cabe no se guarda; si una lista histórica/externa ya inválida llega al colector, un único failed/error sin peticiones. Nunca truncar keywords ni omitir algunas para que quepan. La equivalencia de Unicode/case-folding de Google no se presume: sus límites y la evidencia se registran en AC-017.
- FR-006 Emparejado: comparar la clave canónica del texto íntegro de la búsqueda con el conjunto congelado, antes de cualquier recorte. Descartar búsquedas ajenas aunque la expresión las admita. Variantes distintas de una misma keyword y fecha se agregan sumando clics/impresiones y ponderando posición, no sobrescribiendo filas. Un duplicado exacto de `(date, query original)` es respuesta inválida, para evitar doble conteo. Validar las filas aceptadas según «Contrato de datos».
- FR-007 Semanas: 26 tramos de 7 días consecutivos que terminan en `current.end`. Cada tramo se identifica por su primer día. Para cada keyword y tramo con datos: suma de clics, suma de impresiones y posición media ponderada por impresiones. Un día sin datos no se rellena con cero, y un tramo sin impresiones positivas no se guarda. Son ventanas móviles de siete días, no semanas de calendario. Rango inclusivo `start = current.end − 181 días`; operar fechas de calendario YYYY-MM-DD con la interpretación PT de Search Console, sin cambiar `periodsFor` ni los cuerpos/rangos de las nueve consultas previas. Los tramos y su cobertura se validan según «Contrato de datos».
- FR-008 Persistencia: columna nullable `keyword_series jsonb` en `search_console_snapshots`, nula en filas `failed` y en capturas anteriores. En las nuevas `completed` tiene `{ version: 1, start, end, keywords: { keyword, weeks: { start, clicks, impressions, position, daysWithData }[] }[] }`, con las keywords seguidas en el momento de la captura.
- FR-009 Resumen: para cada keyword seguida ahora, en orden de alta, se calcula su estado:
  - `pending`: no está en la `keyword_series` de `latestCompleted`, o no hay éxito/ese éxito anterior a la feature no tiene `keyword_series`. Nunca usar una captura failed para decidir pending.
  - `no_data`: está en ese éxito, sin semanas. Texto: «Search Console no ha devuelto datos para esta búsqueda en el periodo consultado». No equivale a cero impresiones, búsqueda inexistente ni ausencia de demanda.
  - `ok`: tiene semanas.
- FR-010 Cifras de ok: posición media de la última semana con datos, rango completo de sus siete días, impresiones y días con datos (X de 7); cambio frente a la primera semana con datos con sus fechas explícitas («respecto a …»). Misma fórmula/umbral de la 009 sobre cifras crudas: delta = última − primera, same si `abs(delta) + 1e-9 < 0.5`; diferencias exactas ±0.5 sí cuentan como cambio. Texto «Sube 4,0», «Baja 1,3» o «Igual», una decimal solo para pintar. Con una sola semana, frase propia y sin cambio. Si la última semana con datos no es el tramo final de la ventana, aviso «Sin datos devueltos en los últimos N tramos de 7 días»; no presentar ese valor como reciente. Mostrar property, rango solicitado y fecha de la captura una vez en la sección. No inferir significancia estadística ni crecimiento comercial. Solo se muestran keywords activas ahora.
- FR-011 Gráfica: SVG pequeño de servidor, sin interactividad ni librería nueva. Eje x basado en fechas reales de los 26 tramos, con espacio reservado para los ausentes; eje y con posiciones mejores arriba. Interrumpir la línea en cualquier tramo sin datos; un único punto se representa sin división por cero y posiciones iguales tienen rango y válido. Texto accesible con fechas, posiciones y huecos; no depende del color. No reutilizar un modelo de auditorías que pierda fechas/huecos.
- FR-012 Sección: bloque «Búsquedas que sigues» debajo de la tabla de búsquedas, con el formulario, el contador y la tabla. Sin credencial válida se pueden gestionar las keywords, y la tabla usa los estados de FR-009. La gestión es independiente del estado global de Search Console: no queda oculta por not_configured, invalid_config, no_data o error. Con 25 keywords, el formulario se sustituye por una frase que explica el límite; sigue disponible quitar. Alta muestra pendiente/error y conserva el texto tras error; baja se confirma visualmente por la lista actualizada. Solo se revalida SEO; el overview no cambia.
- FR-013 Fallo: un `GscError` en la consulta nueva da el motivo existente y una sola fila `failed`, sin `keyword_series`. El último éxito sigue visible.
- FR-014 Textos en `es` y `en` en `searchConsole`, y una frase que explica que es la posición media semanal de las búsquedas en las que la web apareció, no un puesto fijo.
- FR-015 Keywords y búsquedas se pintan como texto, nunca como enlace ni HTML (B08b).

## Non-functional requirements

- Rendimiento: con keywords, un intento pasa de 11 a 12 llamadas. La documentación avisa de que las consultas agrupadas por búsqueda y con rangos largos son más costosas y tienen cuota de carga, así que solo hay una y solo si hay keywords. 4550 es el número de pares día/keyword canónica tras agregar, no una garantía sobre filas originales si Google devuelve variantes. Mantener rowLimit 25000; una respuesta que alcanza ese límite se considera potencialmente truncada y falla de forma accionable (sin paginar ni guardar una serie aparentemente completa). Google tampoco garantiza devolver todas las filas por debajo de ese límite; explicarlo en no_data. Documentar carga: no añadir reintentos automáticos ni una llamada por keyword.
- Seguridad: la keyword es entrada del operador y viaja escapada dentro de la expresión; nunca se interpola sin escapar. Validación en el servidor. Las acciones siguen el perímetro actual (D-03).
- Observabilidad: el intento queda en la fila como hoy.
- Mantenibilidad: sin dependencias nuevas. Agrupar semanas y construir la expresión son funciones puras.

## API / Interface changes

- `AnalyticsQuery.dimensions` admite `date`.
- `brand-terms.ts` reutiliza/exporta escape literal puro sin cambiar la política de variantes de marca ni su salida.
- `CaptureSite` gana `trackedKeywords?: readonly string[]`; `CollectedData` gana `keywordSeries`.
- Nuevas Server Actions `addTrackedKeywordAction(workspaceId, previousState, formData)` y `removeTrackedKeywordAction(workspaceId, keywordId, previousState)`. El alta sigue el patrón `useActionState`: `(workspaceId, previousState, formData)` para conservar valor/errores; locale resuelto en servidor. Ambas validan ids e input y revalidan SEO.
- `SearchConsoleSummary` no cambia (D013): la página SEO compone aparte `TrackedKeywordSummary`, con `rows` y `warning: boolean`, sin cambiar las llamadas previas del overview.

## Data model changes

Migración `0012`, aditiva:
- Tabla `tracked_keywords`: `id`, `workspace_id` con FK y borrado en cascada, `keyword`, `created_at`. Índice único `(workspace_id, keyword)` y check `char_length(keyword)` de 2 a 80. Todas las escrituras del servicio usan la clave canónica; no modificar datos de otras entidades.
- Columna nullable `keyword_series jsonb` en `search_console_snapshots`, con checks nombrados: nula en failed; si no es nula, estructura JSON de FR-008 en JSONPath strict cuyo resultado debe ser verdadero (no aceptar NULL/unknown), arrays y números con los límites estructurales indicados en «Contrato de datos». La validación semántica completa se hace antes de guardar y al proyectar; no asumir que strict implica rechazar claves extra o validar calendarios.

Quitar una keyword borra su fila: la evolución sale de Google y no se pierde historia propia. Sin backfill.

## Edge cases

- Keyword con metacaracteres («c++ cursos», «a|b»): escapada, se trata como texto literal.
- Keyword con mayúsculas, NFC/NFD o espacios de más: misma identidad en altas y matching. Unicode de varios bytes puede alcanzar el presupuesto de expresión antes de 25; error legible en el alta sin insertar.
- Keyword sin filas utilizables devueltas por Google: no_data con la explicación de FR-009; no afirmar que la web nunca recibió esa búsqueda.
- Keyword añadida después de la última captura: `pending`.
- Días sin datos: Google los omite; la semana se calcula con los días que haya.
- Semana con datos parciales al inicio de la ventana: el tramo cubre siempre 7 días, así que no hay semanas incompletas por el corte.
- Una semana con posición muy distinta por pocas impresiones: se muestra tal cual; el texto recuerda que es una media.
- Empresa sin keywords: sin llamada nueva; `keyword_series` con `keywords: []`.
- Ninguna fila devuelta: todas las keywords en `no_data`.
- Fila con un texto que no es keyword seguida: se descarta.
- Dos capturas seguidas: dos filas, como hoy.
- Captura failed tras un éxito: la tabla conserva el éxito con sus fechas y muestra el aviso del intento. Una keyword nueva no incluida en ese éxito queda pending.
- Keyword quitada y vuelta a añadir antes de capturar: si su clave está en latestCompleted se reutiliza esa serie fechada; esta es la excepción explícita al caso de una keyword recién añadida. Un alta/baja durante Google no modifica el conjunto congelado del intento.
- Empresa borrada: cascada.

## Contrato de datos

- Respuesta aceptada: dos keys en orden date/query; fecha ISO de calendario real dentro de start/end; clics/impresiones finitos no negativos y clics ≤ impresiones. Con impresiones > 0, posición finita > 0. Con impresiones = 0 y clics = 0, ignorar la fila sin generar posición cero; con clics positivos es error. Las búsquedas no seguidas se descartan; claves malformadas y datos inválidos de búsquedas aceptadas producen GscError error y el fallo atómico existente.
- Agrupar todas las variantes por keyword canónica y día, después por tramo. Fórmula `sum(position * impressions) / sum(impressions)`. Nunca redondear antes de comparar o persistir. La respuesta no se presupone ordenada. `daysWithData` cuenta fechas distintas con impresiones > 0, no número de variantes, entre 1 y 7.
- Serie: version 1; start/end ISO válidos con 182 días inclusivos; como máximo 25 keywords canónicas únicas; como máximo 26 semanas únicas y ordenadas por keyword. Cada week.start es uno de los 26 anclajes de la ventana; su fin es start+6. Clics/impresiones finitos no negativos, impresiones > 0, posición > 0, daysWithData entero 1–7. Una keyword sin filas lleva weeks: []; empresa sin keywords lleva keywords: []. No confundir esas listas vacías con un failed ni con el null histórico.
- SQL garantiza tipos/estructura y cotas de arrays, version, longitud de keyword y números no negativos/impresiones-posición positivas/daysWithData 1–7. Runtime verifica además fechas reales, anclajes, orden, unicidad, normalización, coherencia start/end y clics ≤ impresiones. La proyección de una serie no nula inválida devuelve un aviso localizado de datos no legibles y filas pending, nunca ok/no_data; no reescribe la captura ni busca una serie anterior silenciosamente. Los checks SQL no deben arrojar errores de casteo por JSON malformado: los rechazos estructurales esperados son 23514.
- La lista activa y latestCompleted se leen para la proyección actual; cada keyword usa siempre la serie y la fecha de ese mismo éxito. No mezclar semanas de distintos snapshots o propiedades. La identidad guardada en la serie permite reutilizar el histórico al quitar/volver a añadir, independientemente del id nuevo de la fila activa.

## Acceptance criteria

- AC-001 Con 24 keywords, dos altas concurrentes dejan 25 y una devuelve el error de límite. Una keyword repetida, también con otras mayúsculas, espacios o Unicode NFC/NFD, da el error de duplicado sin fila nueva. Longitudes normalizadas de 1 y 81 puntos de código se rechazan; probar caracteres astrales y combinar marcas Unicode.
- AC-002 Quitar una keyword la borra, repetirlo no falla, y quitar con el id de otra empresa no afecta a nada.
- AC-003 Con keywords, se inspeccionan doce peticiones: la nueva lleva las dimensiones `date` y `query`, `rowLimit: 25000`, el rango de 182 días que termina en `current.end` y el filtro exacto. Las nueve previas conservan su cuerpo como cadena. Sin keywords hay once peticiones.
- AC-004 keywordExpression escapa metacaracteres, ancla y define case-folding/variantes de espacios/NFC/NFD. Alta que excede 4096 bytes con el conjunto candidato se rechaza sin fila nueva, también con altas concurrentes y caracteres multibyte. Lista inválida recibida por el colector da un único failed/error sin token ni peticiones; no se trunca la lista. La salida de marca de 007 sigue idéntica.
- AC-005 Con filas simuladas: suma de clics e impresiones por tramo, posición ponderada por impresiones, tramos sin datos ausentes, filas de otras búsquedas descartadas, variantes canónicas sumadas sin duplicar fechas y tramos anclados a current.end. Incluir cambio de mes/año, año bisiesto y horario de verano; 182 fechas inclusivas y 26 ventanas completas.
- AC-006 Pending, no_data y ok de FR-009 se ven en resumen y DOM con mensajes propios; no_data no afirma cero impresiones ni ausencia de búsquedas. Un failed reciente no convierte resultados anteriores en pending; una keyword añadida después del éxito sí queda pending salvo re-alta de una clave ya incluida. Las quitadas no se muestran; se conserva fecha/property del éxito.
- AC-007 Cambio: 8,0 frente a 12,0 da «Sube 4,0»; 12,0 frente a 8,0 da «Baja 4,0»; diferencia menor de 0,5 da «Igual»; una sola semana da su frase propia sin cambio. Mostrar fechas de ambos extremos, impresiones y días con datos de la última semana, y aviso si faltan los últimos tramos. Probar ±0.5 exactos y tolerancia 1e-9 sin redondeo previo.
- AC-008 SVG con posición mejor arriba y 26 posiciones temporales: dos semanas no consecutivas mantienen su distancia y no quedan unidas por línea. Texto accesible con fechas, posiciones y huecos; una semana se pinta como punto y valores iguales no rompen el SVG. Sin interactividad ni librería nueva.
- AC-009 403 con y sin API desactivada, 429 y 500 en la consulta nueva dejan una sola fila `failed` sin `keyword_series` ni secretos, y el último éxito visible.
- AC-010 Tras aplicar `0012`, una fila anterior se lee con nulo. La base rechaza con 23514 y el nombre de la restricción un `failed` con serie y las formas inválidas, y rechaza con 23505 un duplicado; acepta `keywords: []`. Borrar la empresa borra sus keywords.
- AC-011 Una keyword con `<script>` se pinta como texto y el filtro la trata como literal.
- AC-012 Con 25 keywords, el formulario muestra la frase del límite. Sin credencial o con credencial inválida se pueden gestionar keywords y no hay botón de captura. Formularios con pending/error localizado y conservación del valor; baja actualiza la lista y la revalidación SEO no dispara captura. Probar los estados globales de Search Console que podrían ocultar la sección.
- AC-013 Textos en `es` y `en`; la prueba de catálogos pasa.
- AC-014 Lint, typecheck, unitarias, integración y build en verde sobre la revisión identificada de esta feature; registrar base/diff incremental sin incluir cambios ajenos de 004. Commits locales solo por instrucción del responsable (D013), sin despliegue en producción.
- AC-015 En el navegador, con fixtures identificados en la base de pruebas protegida, limpiados por su fixture después, a 375 px en `es` y `en`: `scrollWidth` igual a `clientWidth` en la página y en la tabla. Con la cuenta real, olessium.com termina en completed o motivo accionable: es solo una comprobación de acceso y manejo de respuesta; la prueba positiva del filtro se evalúa separadamente en AC-017. No insertar resultados sintéticos en dev.

- AC-016 Casos inválidos de runtime: claves/fechas inexistentes o fuera de rango, duplicado date/query original, posición cero/NaN/infinita con impresiones, clics > impresiones, y serie con anclajes/orden/duplicados inválidos. Se rechazan según Contrato de datos sin guardar completed parcial. Fila de cero impresiones/clics no genera posición cero. Respuesta con 25000 filas falla como potencialmente truncada. Series no nulas inválidas al leer muestran aviso y pending, no no_data.
- AC-017 Prueba positiva real del filtro con al menos una búsqueda de una propiedad accesible que tenga impresiones conocidas en el mismo rango. Registrar fecha, property, filtro y resultado mínimo no sensible; comprobar que devuelve esa búsqueda y que una búsqueda distinta no entra. Si falta una propiedad con datos o el proveedor no permite verificarlo, registrar esta comprobación pendiente y no cerrar la feature; mocks y 200 vacíos no sustituyen la evidencia positiva. Sin llamadas masivas ni búsqueda exploratoria de cuentas.
- AC-018 Alta o baja durante una captura: el filtro y el snapshot guardan exclusivamente el conjunto congelado inicial; la proyección actual muestra altas posteriores como pending y omite bajas. No hay transacción ni bloqueo abierto durante la llamada de red; escrituras paralelas y eliminación de empresa mantienen el aislamiento/resultado existente de not_found.

## Test scenarios

- Unitarias: normalización; expresión; agrupado semanal; recogida con y sin keywords, concurrencia, emparejado y fallos; resumen con estados y cambio; gráfica; render; catálogos.
- Integración: alta, límite concurrente, duplicado, quitar, aislamiento por empresa, cascada, persistir y leer la serie, fila anterior, rechazos de la base, fallos y último éxito.
- Manual: AC-015 y prueba positiva real de AC-017, con evidencia antes del cierre.

## Fuentes externas y verificación

| Dato | Fuente | Verificado |
|---|---|---|
| `date` se puede agrupar y el resultado se ordena por fecha ascendente; sin límite de dimensiones | developers.google.com/webmaster-tools/v1/searchanalytics/query | 2026-10-30 |
| «Cuando date es una dimensión, los días sin datos se omiten» | misma página | 2026-10-30 |
| `groupType` solo admite `and`; los grupos también se combinan con «and»; no hay OR | misma página | 2026-10-30 |
| `includingRegex` es RE2; `expression` hasta 4096; `rowLimit` hasta 25.000 | misma página | 2026-10-30 |
| 1200 peticiones por minuto por sitio y por usuario; cuota de carga sin cifra; agrupar por búsqueda y rangos largos cuesta más | developers.google.com/webmaster-tools/limits | 2026-10-30 |
| Tope de 50.000 filas por día y tipo de búsqueda | developers.google.com/webmaster-tools/v1/how-tos/all-your-data | 2026-10-30 |
| Cuánto histórico conserva Search Console (se suele citar 16 meses) | No consta en ninguna de las páginas leídas | UNVERIFIED; el diseño pide 26 semanas y muestra las que devuelva |
| Case-folding/Unicode real del filtro | La referencia API remite a RE2; patrón con (?i) y variantes explícitas, matcher local canónico | Prueba positiva de AC-017 pendiente; no se presume que Google siempre devuelva minúsculas |
| Que el filtro por expresión funcione con datos | D007 de 007 y referencia query | Evidencia de AC-017 obligatoria para cerrar; 200 vacío insuficiente |
| Que una búsqueda poco frecuente se oculte también al filtrar por expresión | Ayuda de Search Console, para la interfaz | UNVERIFIED para esta consulta |

## Assumptions

- 26 semanas son suficientes para enseñar la evolución y no dependen del histórico exacto de Google.
- 25 keywords bastan para el piloto; es el mismo orden que la tabla de búsquedas.
- No se presupone la capitalización de las búsquedas devueltas; clave local común y política del filtro explícitas. Google puede omitir filas incluso bajo rowLimit; no_data describe lo devuelto, no ausencia de demanda.
- Con Olessium sin impresiones, la captura real solo confirma que la llamada funciona.
- Hay cambios ajenos de 004 en el árbol. Registrar base y estado inicial antes de implementar; editar únicamente los fragmentos de esta feature y conservar el resto. Esta planificación no consolida ni commitea esos cambios.
- Las acciones siguen sin autenticación (D-03); las dos nuevas aceptan texto del operador, y BL-07 las incluye.
- El proyecto no tiene `specs/CONSTITUTION.md` ni `specs/SERVICES.md`.

## Open questions

- Sin decisiones de diseño bloqueantes. Gráfica propia pequeña con fechas/huecos y disposición móvil en PLAN. La disponibilidad de una propiedad con impresiones para AC-017 es una dependencia de verificación/cierre, no una prueba ya superada ni un bloqueo para implementar con fixtures.

## Source of Truth Matrix

| Concepto | Fuente de verdad | Reflejado en |
|---|---|---|
| Identidad, estados, ventanas y comparaciones | SPEC | PLAN, TASKS, pruebas |
| Diseño y decisiones de persistencia/UI | DECISIONS | SPEC, PLAN, TASKS |
| Archivos y firmas | PLAN y tipos existentes | TASKS, implementación |
| Semántica/API externa | Fuentes anteriores y evidencia positiva | SPEC, pruebas, documentación |

## Reviews required

QA/spec, backend y acciones, seguridad/escape/alcance por empresa, base de datos y migración, frontend/accesibilidad y rendimiento/cuota. La API externa se comprueba con fixtures y AC-017; no hay integración de pago nueva. Estas revisiones se ejecutan al implementar, no se dan por hechas al planificar.

## Contracted services

Contracted services not declared → all billable add-ons treated as NOT contracted (conservative default). Run `/project-init` to declare them. Esta feature no usa ningún servicio de pago: Search Console es gratuito con la credencial existente.
