# Feature Spec: Conector de Google Analytics 4

## Status

In Progress (2026-10-28). T001–T008 hechas; T009 espera a que el operador active las APIs de GA4 y dé acceso de lector (D009).

## Problem

La página SEO enseña cómo te encuentran Google (spec 003-search-console) y Bing (spec 005), pero no cuánta gente visita la web ni de dónde llega. Esos datos están en Google Analytics 4. El operador ya tiene una cuenta de servicio de Google configurada para Search Console (`GSC_SERVICE_ACCOUNT_JSON`).

## Goal

El operador pulsa un botón en la ficha de una empresa y obtiene, desde la API oficial de Google Analytics 4, los usuarios, sesiones y páginas vistas de los últimos 28 días cerrados, la comparación con los 28 anteriores, las sesiones por canal de origen y las páginas más vistas. Los datos se guardan y la página los muestra sin volver a llamar a Google.

## Non-goals

- OAuth de usuario, pantalla de consentimiento o tokens de cliente guardados (D001). Cuentas de cliente con acceso propio llegan con la Fase 5 (BL-03).
- Elegir a mano la propiedad de GA4 o guardar su id en la empresa (se resuelve por dominio, D003).
- Conversiones, eventos, ingresos, datos demográficos, tiempo real o segmentos.
- Escribir en GA4 o en su configuración.
- Incluir los datos en el informe PDF o en la tarjeta del resumen de la empresa.
- Ejecuciones programadas o histórico diario.
- Cruzar GA4 con Search Console o Bing en una sola cifra.

## Users / Actors

- Operador: activa dos APIs en el proyecto de Google Cloud de la cuenta de servicio, añade el email de la cuenta de servicio como «Lector» en la propiedad de GA4 y pulsa «Traer datos de Analytics».
- Google Analytics Admin API v1beta (`https://analyticsadmin.googleapis.com/v1beta`) para encontrar la propiedad.
- Google Analytics Data API v1beta (`https://analyticsdata.googleapis.com/v1beta`) para los informes. `capture_condition = owner_api`.

## Current behavior

- `src/app/workspaces/[id]/seo/page.tsx` muestra Search Console y Bing. No hay nada de GA4.
- `src/modules/search-console/google.ts` firma el JWT de la cuenta de servicio con el alcance de Search Console fijo (`webmasters.readonly`).

## Desired behavior

1. Sin cuenta de servicio: la sección «Visitas a tu web» dice «Sin configurar» y explica los pasos.
2. Cuenta de servicio no válida: «Configuración no válida», sin llamada de red y sin enseñar el valor.
3. Con cuenta de servicio y sin datos guardados: botón «Traer datos de Analytics».
4. Tras traer datos: tres cifras (usuarios, sesiones, páginas vistas) con su cambio, tabla de canales con su cambio, tabla de páginas, propiedad usada, periodos y fecha de captura. Botón «Actualizar datos».
5. GA4 responde sin filas: estado «Analytics todavía no tiene visitas de esta web en el periodo», que sugiere comprobar que la etiqueta está instalada. No es un error.
6. Si falla: el último intento fallido se muestra con un motivo accionable; los datos buenos anteriores siguen visibles.

## Functional requirements

- FR-001 La credencial es la misma cuenta de servicio de Search Console, `GSC_SERVICE_ACCOUNT_JSON`, leída con `parseServiceAccount` (D002). Si falta, el estado es `not_configured`; si no es válida, `invalid_config`. En ambos casos no hay llamada de red ni fila nueva, y el botón no aparece. Si había datos guardados, se siguen mostrando con un aviso (como D009 de la 005).
- FR-002 El token se pide al endpoint fijo de Google con el alcance `https://www.googleapis.com/auth/analytics.readonly`. `signJwt` y `fetchAccessToken` de Search Console aceptan el alcance como parámetro, con el de Search Console por defecto (D004).
- FR-003 Cliente con hosts fijos, sin redirecciones a otro host y sin caché. Solo métodos de lectura: `accountSummaries.list`, `properties.dataStreams.list` y `properties.runReport`. Cada llamada con 15 s como máximo.
- FR-004 Propiedad por dominio (D003): `accountSummaries.list` (una página de 200) da las propiedades visibles; para cada una, `dataStreams.list` da sus flujos web. Una propiedad casa si algún flujo `WEB_DATA_STREAM` tiene un `defaultUri` cuyo host, en minúsculas y sin barra final, es el host guardado, el dominio o `www.` del dominio. Prioridad por ese orden; empate, el id numérico más bajo. Se revisan como mucho 20 propiedades, en el orden de la respuesta.
- FR-005 Si ninguna propiedad casa: fallo `no_access`, con el número de propiedades que ve la cuenta de servicio y si se quedaron sin revisar por el límite de 20.
- FR-006 Periodos (D005): el actual son los 28 días que terminan 2 días antes de la fecha UTC de la captura; el anterior, los 28 previos. Se piden con fechas `YYYY-MM-DD` explícitas, con nombre `current` y `previous`.
- FR-007 Totales: un `runReport` con los dos periodos, dimensión `dateRange` y métricas `activeUsers`, `sessions` y `screenPageViews`. Un periodo sin fila cuenta como cero.
- FR-008 Canales: un `runReport` con los dos periodos, dimensiones `sessionDefaultChannelGroup` y `dateRange` y métrica `sessions`. Se guardan los canales con sesiones en alguno de los dos periodos, ordenados por sesiones del periodo actual, como mucho 20.
- FR-009 Páginas: un `runReport` del periodo actual, dimensión `pagePath` (sin query string) y métricas `screenPageViews` y `activeUsers`, ordenado por páginas vistas, las 10 primeras. Ruta recortada a 500 caracteres.
- FR-010 La respuesta se lee por los nombres de `dimensionHeaders` y `metricHeaders`, no por posición. Los valores de métrica llegan como texto: deben ser enteros entre 0 y 10¹²; si no, la respuesta es inválida.
- FR-011 Avisos de calidad: si algún informe trae `metadata.dataLossFromOtherRow`, `subjectToThresholding` o `samplingMetadatas`, se guarda y la sección lo explica en una frase.
- FR-012 Cada intento se guarda, con éxito o fallo, en `analytics_snapshots`, con propiedad, periodos, cifras, canales, páginas, avisos y motivo de fallo.
- FR-013 Motivos de fallo tipados: `invalid_credentials` (token rechazado, 401), `admin_api_disabled` y `data_api_disabled` (403 con `SERVICE_DISABLED` o `accessNotConfigured` en la Admin API o en la Data API; un motivo por API para que la interfaz diga cuál activar), `no_access` (403 sin esa razón, o propiedad no encontrada), `quota_exceeded` (429), `error` (el resto: HTTP no esperado, JSON inválido, tiempo agotado).
- FR-014 El cambio se muestra solo si el periodo anterior tiene sesiones. Cifras y canales en porcentaje, con el formato de Search Console (D008 de la 005).
- FR-015 Textos en español e inglés en los catálogos de `src/i18n/messages`, con la salida española como referencia.

## Non-functional requirements

- Sin dependencias nuevas.
- Un intento son como mucho 1 + 1 + 20 + 3 = 25 llamadas; en el caso habitual (una propiedad), 6. Las de búsqueda de propiedad van en serie; los tres informes, en paralelo.
- Seguridad: el token viaja en la cabecera `Authorization` y nunca se guarda, se registra ni se devuelve. Los mensajes de error son fijos y no incluyen URL, cuerpo de respuesta ni mensaje de Google. La clave privada sigue el tratamiento de Search Console.
- Nombres de propiedad, canales y rutas se pintan como texto, nunca como enlace ni HTML (B08b).
- Observabilidad: cada intento queda en la tabla con su motivo.

## API / Interface changes

- Server Action `refreshAnalyticsAction(workspaceId)`, del mismo tipo que `refreshSearchConsoleAction`.
- `signJwt(account, now, scope?)` y `fetchAccessToken(account, { scope? })` en `src/modules/search-console/google.ts`, compatibles con las llamadas actuales.
- Componente `AnalyticsSection` en la página SEO, debajo de Bing.
- Sin variables de entorno nuevas.

## Data model changes

Tabla `analytics_snapshots`, migración `0008`. Una fila por intento, borrado en cascada con la empresa, índice `(workspace_id, created_at desc)`. Columnas: `status` (`completed|failed`), `provider` (`ga4`), `capture_condition` (`owner_api`), `property` (`properties/<id>`), `property_name`, periodos actual y anterior, `totals` y `previous_totals` en `jsonb`, `channels` y `pages` en `jsonb` (arrays), `quality` en `jsonb`, `error_kind`, `error_message`, `accessible_properties`, `properties_skipped` y `created_at`. Restricciones `check` como en las tablas de Search Console y Bing: estado válido, motivo válido, un `completed` tiene propiedad, periodos y totales, un `failed` tiene motivo y mensaje, las filas son arrays.

## Edge cases

- Propiedad con datos solo en un periodo: el otro cuenta como cero; si el anterior no tiene sesiones, no hay cambio.
- Propiedad sin ninguna visita en 56 días: `completed` con ceros y estado «todavía no tiene visitas». No es un fallo.
- Un canal que existe solo en el periodo anterior: aparece con 0 sesiones actuales y su cambio.
- La cuenta de servicio ve varias propiedades con la misma web: gana la prioridad de FR-004; la sección dice qué propiedad se usó.
- Flujo con `defaultUri` con ruta o mayúsculas (`https://Olessium.com/es`): cuenta el host.
- Propiedad sin flujos web (solo apps): no casa.
- Más de 20 propiedades visibles: se revisan 20; si ninguna casa, el fallo lo dice.
- Respuesta 200 con cabeceras que no incluyen las métricas pedidas, o con valores no enteros: `error`.
- La API de Admin activada y la de Data no, o al revés: `admin_api_disabled` o `data_api_disabled`, y la interfaz nombra la API que falta.
- Empresa borrada durante la llamada: no se guarda nada y la acción devuelve «Esta empresa ya no existe».
- Dos clics seguidos: dos filas. Lectura gratuita dentro de cuota; se acepta.

## Acceptance criteria

- AC-001 Sin `GSC_SERVICE_ACCOUNT_JSON`, la sección muestra «Sin configurar» con los pasos, sin botón, sin llamada de red ni fila nueva. Con datos guardados, se siguen mostrando con el aviso.
- AC-002 Con una cuenta de servicio no válida, la sección muestra «Configuración no válida» sin el valor, sin botón y sin llamada de red. Con datos guardados, se siguen mostrando con el aviso.
- AC-003 Con la cuenta de servicio como lectora de la propiedad, «Traer datos de Analytics» guarda una fila `completed`. La sección muestra las tres cifras con su cambio, la tabla de canales con su cambio, la tabla de páginas (cada tabla con su propio vacío), la propiedad, las fechas de ambos periodos y la fecha de captura.
- AC-004 Si ninguna propiedad casa, se guarda `failed/no_access` y se muestra cuántas propiedades ve la cuenta de servicio y su email para añadirlo en GA4.
- AC-005 Si GA4 responde sin filas, se guarda `completed` con ceros y la sección muestra «todavía no tiene visitas» con la sugerencia de revisar la etiqueta, sin tono de error.
- AC-006 401, 403 con y sin `SERVICE_DISABLED` en cada API, 429, otro HTTP, JSON inválido, valores no enteros y tiempo agotado dan el motivo esperado. Ni el error, ni el resultado de la recogida, ni la fila guardada contienen el token ni la clave privada; lo comprueba una prueba que los busca literalmente.
- AC-007 Tras un intento fallido, los datos del último intento con éxito siguen visibles junto al motivo del fallo.
- AC-008 Con avisos de calidad en la respuesta, la sección los explica.
- AC-009 Todos los textos nuevos existen en `es` y en `en`, y la prueba de catálogos pasa con las claves nuevas.
- AC-010 Las llamadas existentes de Search Console siguen firmando con `webmasters.readonly`; sus pruebas pasan sin cambios.
- AC-011 Lint, typecheck, unitarias, integración y build en verde.
- AC-012 En el navegador, con la cuenta de servicio real, olessium.com muestra datos reales o el estado de AC-005 (o un motivo de AC-004/AC-006 accionable si falta un paso del operador), en `es` y `en`, y a 375 px sin scroll horizontal.

## Test scenarios

- Unitarias: alcance del JWT (Analytics y Search Console por defecto); elección de propiedad (prioridad, empate, sin flujos web, límite de 20); periodos; lectura por cabeceras; conversión de valores; canales con un solo periodo; avisos de calidad; clasificación de cada error; ausencia del token y la clave en errores y resultados; resumen y cambios; render de la sección en sus estados; catálogos `es`/`en`.
- Integración: guardar éxito, éxito vacío y fallo contra la rama `test`; último resultado y último con éxito; cascada; restricciones `check`.
- Manual: AC-012 en el navegador, sin escribir en la base de desarrollo más que el intento propio.

## Source of Truth Matrix

| Dato | Fuente | Verificado |
|---|---|---|
| `runReport`: `POST /v1beta/{property}:runReport`, alcance `analytics.readonly`, `keepEmptyRows` falso por defecto, `limit` | developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport | 2026-10-28 |
| Hasta 4 `dateRanges`; `name` aparece como valor de la dimensión `dateRange` | .../data/v1/rest/v1beta/DateRange | 2026-10-28 |
| `MetricValue.value` es texto; `metadata`: `dataLossFromOtherRow`, `subjectToThresholding`, `samplingMetadatas`, `timeZone` | .../data/v1/rest/v1beta/Row y ResponseMetaData | 2026-10-28 |
| `activeUsers`, `sessions`, `screenPageViews`, `sessionDefaultChannelGroup`; `pagePath` sin query string | .../data/v1/api-schema | 2026-10-28 |
| `accountSummaries.list`: `pageSize` hasta 200, `propertySummaries[].property`/`displayName` | developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accountSummaries/list | 2026-10-28 |
| `dataStreams.list`; `DataStream.type` `WEB_DATA_STREAM`, `webStreamData.defaultUri` | .../admin/v1/rest/v1beta/properties.dataStreams | 2026-10-28 |
| Hay que activar la Google Analytics Data API en el proyecto | .../data/v1/quickstart-client-libraries | 2026-10-28 |
| La cuenta de servicio entra como usuario «Lector» en la gestión de acceso de la propiedad | Práctica habitual; no lo dice la página de inicio rápido | UNVERIFIED; se comprueba en AC-012 |
| Forma exacta de los errores 403 (`SERVICE_DISABLED`) en estas dos APIs | Mismo formato de error de Google que Search Console | UNVERIFIED; se comprueba en AC-012 |

## Assumptions

- La propiedad de GA4 de Olessium existe y tiene un flujo web con `olessium.com`. Si no, AC-012 se cumple con el motivo accionable.
- El retraso de 2 días basta para que GA4 tenga los datos del periodo procesados. No hay un dato oficial único; ver D005.
- El dominio y el host de la empresa ya están normalizados (`workspace.domain`, `workspace.hostname`).
- La acción no tiene autenticación (D-03), igual que el resto. Con la misma cuenta de servicio, quien llegue a la app puede leer los datos de cualquier propiedad compartida con ella creando una empresa con su dominio. La barrera de D-03 es condición para desplegar fuera de la máquina del operador.
- El proyecto no tiene `specs/CONSTITUTION.md` ni `specs/SERVICES.md`; se siguen las convenciones de 001–005 (D006).

## Open questions

- Ninguna bloqueante. Fuera de esta feature: el acceso OAuth por cliente en la Fase 5 (BL-03).

## Contracted services

Contracted services not declared → all billable add-ons treated as NOT contracted (conservative default). No aplica a esta feature: no cambia páginas públicas.
