# Feature Spec: Conector de Bing Webmaster Tools

## Status

Done (2026-10-28). Pasó `/spec-review` (Pass en la segunda pasada), `/qa-review` y `/review-all` sin hallazgos críticos, altos ni medios. Seguimiento abierto: comparar las cifras y la forma de `GetPageStats` cuando Bing tenga datos (D011, TASKS › Follow-ups).

## Problem

La pestaña «Google» enseña el tráfico orgánico de Google (spec 003-search-console), pero nada de Bing. Bing alimenta también Copilot y otros buscadores (DuckDuckGo, Ecosia), así que una empresa puede tener visitas desde ahí sin que la plataforma lo muestre. Olessium ya tiene su sitio verificado en Bing Webmaster Tools (2026-10-28, por CNAME).

## Goal

El operador pulsa un botón en la ficha de una empresa y obtiene, desde la API oficial de Bing Webmaster Tools, los clics, impresiones y CTR de los últimos 28 días con datos, la comparación con los 28 días anteriores, las búsquedas principales y las páginas principales. Los datos se guardan y la página los muestra sin volver a llamar a Bing.

## Non-goals

- OAuth de Microsoft, pantalla de consentimiento o tokens de usuario guardados (D001).
- AI Performance (citas en Copilot): no tiene API pública; importar sus CSV sería otra spec.
- Elegir a mano el sitio de Bing (se resuelve por dominio, D003).
- Enviar URLs, sitemaps o IndexNow, o cualquier llamada de escritura a Bing.
- Incluir los datos en el informe PDF o en la tarjeta del resumen de la empresa.
- Ejecuciones programadas o histórico diario.
- Unificar Google y Bing en una sola cifra.

## Users / Actors

- Operador: genera su clave en Bing Webmaster Tools (Settings › API Access), la pone en el entorno una vez y pulsa «Traer datos de Bing».
- Bing Webmaster API (JSON sobre `https://ssl.bing.com/webmaster/api.svc/json/`). `capture_condition = owner_api`.

## Current behavior

- `src/app/workspaces/[id]/seo/page.tsx` solo tiene la sección de Search Console (`SearchConsoleSection`). No hay rastro de Bing en el código salvo `bing.com` en la lista de exclusiones de competidores, que no tiene relación.

## Desired behavior

1. Sin clave: la sección «Bing» dice «Sin configurar» y explica los pasos: generar la clave en Bing Webmaster Tools, ponerla en `BING_WEBMASTER_API_KEY` y tener el sitio verificado en Bing.
2. Clave con formato inválido: «Configuración no válida», sin llamada de red y sin enseñar el valor.
3. Con clave y sin datos guardados: botón «Traer datos de Bing».
4. Tras traer datos: tres cifras (clics, impresiones, CTR) con su cambio, tabla de búsquedas, tabla de páginas, sitio usado, periodos y fecha de captura. Botón «Actualizar datos».
5. Bing responde sin filas: estado «Bing todavía no tiene datos de este sitio» que explica que tarda hasta 48 h tras verificar. No es un error.
6. Si falla: el último intento fallido se muestra con un motivo accionable; los datos buenos anteriores siguen visibles.

## Functional requirements

- FR-001 La clave es la API key de usuario de Bing en `BING_WEBMASTER_API_KEY`, opcional. Se recorta y debe casar `^[A-Za-z0-9]{16,128}$`; si no, el estado es `invalid_config` y no se hace ninguna llamada. Se valida al usarla, nunca en el arranque.
- FR-002 Cliente con host y ruta fijos `https://ssl.bing.com/webmaster/api.svc/json/<Método>`, parámetros con `URLSearchParams`, `redirect: "error"` (la clave nunca se reenvía a otro host) y sin caché. Solo métodos de lectura: `GetUserSites`, `GetRankAndTrafficStats`, `GetQueryStats`, `GetPageStats`.
- FR-003 El sitio se elige con `GetUserSites` entre los que tienen `IsVerified = true`, por prioridad: `https://<host>/`, `https://<dominio>/`, `https://www.<dominio>/`, y las mismas en `http://`. La comparación ignora mayúsculas y la barra final. El `siteUrl` enviado es el `Url` tal como lo devuelve Bing.
- FR-004 Si el sitio aparece pero sin verificar: fallo `not_verified`. Si no aparece: fallo `no_access` con el número de sitios verificados que ve la clave.
- FR-005 Tráfico: `GetRankAndTrafficStats` devuelve clics e impresiones por día. Periodo actual: 28 días que terminan en el último día con datos que devuelva Bing. Periodo anterior: los 28 días previos. Los días sin fila cuentan como cero. CTR = clics / impresiones, 0 si no hay impresiones (D004).
- FR-006 Búsquedas y páginas: `GetQueryStats` y `GetPageStats` no admiten fechas. Las filas se agrupan por búsqueda o página sumando clics e impresiones; la posición es la media de `AvgImpressionPosition` ponderada por impresiones, descartando valores menores que 1 (Bing usa `-1` como «sin dato» y no hay posición 0). Se guarda la ventana que cubren (primer y último `Date` de las filas). Se ordenan por clics y luego impresiones: 25 búsquedas y 10 páginas (D005).
- FR-007 Fechas de Bing en formato `/Date(<ms><±hhmm>)/`: el día es la fecha del calendario en el desfase indicado; sin desfase, en UTC (D010). Una fecha con otro formato, o con un año fuera de 0000–9999, invalida la respuesta.
- FR-008 Cada intento se guarda, con éxito o fallo, en `bing_webmaster_snapshots`, con sitio, periodos, cifras, filas, ventana de filas y motivo de fallo.
- FR-009 Motivos de fallo tipados: `invalid_credentials` (`ErrorCode` 3 `InvalidApiKey`, 6 `UserBlocked`, 10 `UserNotFound`), `quota_exceeded` (4 `ThrottleUser`, 5 `ThrottleHost`), `no_access` (11 `NotFound`, 14 `NotAuthorized`, o sitio ausente), `not_verified`, `error` (el resto: otros códigos, HTTP no esperado, JSON inválido, tiempo agotado).
- FR-010 El cambio frente al periodo anterior solo se muestra si el periodo anterior tiene impresiones. Clics e impresiones en porcentaje; CTR en puntos.
- FR-011 La interfaz dice qué ventana cubre cada bloque: las cifras, 28 días; las tablas, la ventana que dio Bing. No se presentan como comparables entre sí.
- FR-012 Textos en español e inglés en los catálogos de `src/i18n/messages`, con la salida española como referencia (feature 003-i18n).

## Non-functional requirements

- Sin dependencias nuevas.
- Cada llamada con tiempo máximo de 15 s; un intento son como mucho 4 llamadas, en serie.
- Seguridad: la clave viaja en la query string, porque es lo único que documenta Bing. Por eso la URL completa solo existe dentro de la función que llama a `fetch`. La clave nunca aparece en mensajes de error, en `error_message`, en logs, en la respuesta de la Server Action ni en la interfaz. Los mensajes de error son fijos y no incluyen URL, cuerpo de respuesta ni `Message` de Bing sin filtrar.
- El logger redacta `apikey`, `*.apikey` y `BING_WEBMASTER_API_KEY`.
- Respuestas validadas con Zod. Textos recortados: búsqueda a 200 caracteres y página a 500. Clics o impresiones que no sean enteros entre 0 y 10¹² invalidan la respuesta (D010). Un `d: null` cuenta como lista vacía. El mensaje de un formato inesperado nombra el método y la ruta del campo, nunca su valor.
- Búsquedas y URLs se pintan como texto, nunca como enlace ni HTML (B08b).
- Observabilidad: cada intento queda en la tabla con su motivo; no hace falta más.

## API / Interface changes

- Server Action `refreshBingWebmasterAction(workspaceId)`, del mismo tipo que `refreshSearchConsoleAction`.
- Variable de entorno opcional `BING_WEBMASTER_API_KEY` (en `src/config/env.ts` y `.env.example`, sin valor).
- Componente `BingWebmasterSection` en la página SEO, debajo de Search Console.

## Data model changes

Tabla `bing_webmaster_snapshots`, migración `0007`. Una fila por intento, borrado en cascada con la empresa, índice `(workspace_id, created_at desc)`. Columnas: `status` (`completed|failed`), `provider` (`bing_wmt`), `capture_condition` (`owner_api`), `site_url`, periodos actual y anterior (pueden ser nulos en un `completed` sin filas de tráfico), `totals` y `previous_totals` en `jsonb`, `queries` y `pages` en `jsonb` (arrays), `rows_start` y `rows_end`, `error_kind`, `error_message`, `verified_sites` y `created_at`. Las restricciones `check` siguen las de `search_console_snapshots`: estado válido, motivo válido, un `failed` tiene motivo y mensaje, las filas son arrays (D002).

## Edge cases

- Bing devuelve tráfico pero no búsquedas o páginas, o al revés: éxito parcial, cada bloque con su propio vacío.
- Sitio recién verificado sin datos: `completed` sin filas y estado «todavía no tiene datos». No es un fallo.
- Hay tráfico, pero menos de 56 días: el periodo anterior queda incompleto. Si no tiene impresiones, no se muestra cambio.
- La misma búsqueda aparece en varias filas con fechas distintas: se agrupa (FR-006).
- `AvgImpressionPosition` menor que 1 o ausente en todas las filas de una búsqueda: posición vacía, no cero.
- `GetUserSites` devuelve el sitio con `www.` y la empresa está guardada sin él, o al revés: lo cubre la prioridad de FR-003.
- HTTP 200 con un cuerpo que no es `{ "d": [...] }`: `error`.
- Respuesta 400 con `Message` que contiene texto arbitrario: no se guarda tal cual; se guarda un mensaje fijo con el número de código.
- Empresa borrada durante la llamada: no se guarda nada y la acción devuelve «Esta empresa ya no existe».
- Dos clics seguidos: dos filas. Es una API gratuita y de solo lectura; se acepta.
- Clave revocada en Bing tras un intento con éxito: el siguiente intento da `invalid_credentials` y los datos anteriores siguen visibles.

## Acceptance criteria

- AC-001 Sin `BING_WEBMASTER_API_KEY`, la sección muestra «Sin configurar» con los pasos, sin botón, y no se hace ninguna llamada de red ni se escribe ninguna fila. Si ya había datos guardados, se siguen mostrando con un aviso de que la clave falta (D009).
- AC-002 Con una clave que no cumple FR-001, la sección muestra «Configuración no válida» sin el valor, sin botón y sin llamada de red. Si ya había datos guardados, se siguen mostrando con ese aviso (D009).
- AC-003 Con clave válida y sitio verificado, «Traer datos de Bing» guarda una fila `completed`. La sección muestra las tres cifras con su cambio, las dos tablas (cada una con su propio vacío), el sitio, las fechas de ambos periodos, la ventana de las tablas y la fecha de captura.
- AC-004 Si el sitio no está en la cuenta, se guarda `failed/no_access` y se muestra cuántos sitios verificados ve la clave. Si está sin verificar, se guarda `failed/not_verified` y se dice que hay que verificarlo en Bing.
- AC-005 Si Bing responde con listas vacías, se guarda `completed` y la sección muestra «Bing todavía no tiene datos de este sitio» con el aviso de hasta 48 h, sin tono de error.
- AC-006 Cada `ErrorCode` de FR-009, un HTTP no esperado, un JSON inválido y un tiempo agotado dan el motivo esperado. En todos los casos, ni el error lanzado, ni el resultado de la recogida, ni la fila guardada contienen la clave; lo comprueba una prueba que busca la clave literal.
- AC-007 Tras un intento fallido, los datos del último intento con éxito siguen visibles junto al motivo del fallo.
- AC-008 Todos los textos nuevos existen en `es` y en `en`, y la prueba de catálogos pasa con las claves nuevas.
- AC-009 Lint, typecheck, unitarias, integración y build en verde.
- AC-010 En el navegador, con la clave real del operador, olessium.com muestra datos reales o el estado de AC-005, y la vista en móvil no tiene scroll horizontal.

## Test scenarios

- Unitarias: validación de la clave; construcción de la URL (host y ruta fijos, sin redirección); parseo de `/Date(...)/` con desfases positivos y negativos; selección del sitio; agrupación y posición ponderada; periodos con huecos y con menos de 56 días; clasificación de cada `ErrorCode` y de cada fallo HTTP; ausencia de la clave en errores y resultados; resumen y cambios; catálogos `es`/`en`.
- Integración: guardar éxito, éxito vacío y fallo contra la rama `test`; leer el último resultado y el último con éxito; borrado en cascada con la empresa.
- Manual: AC-010 en el navegador, con la clave real, sin escribir en la base de desarrollo más que el intento propio.

## Source of Truth Matrix

| Dato | Fuente | Verificado |
|---|---|---|
| Clave por usuario, válida para todos sus sitios; OAuth como alternativa recomendada | learn.microsoft.com/en-us/bingwebmaster/getting-access | 2026-10-28 |
| Endpoint JSON, `apikey` en query, error HTTP 400 `{"ErrorCode","Message"}` | learn.microsoft.com/en-us/bingwebmaster/getting-started | 2026-10-28 |
| `GetRankAndTrafficStats`: `Clicks`, `Impressions`, `Date`; actualización diaria; todas las verticales desde 2023-03-24 | learn.microsoft.com/.../iwebmasterapi.getrankandtrafficstats | 2026-10-28 |
| `GetQueryStats`: `Query`, `Clicks`, `Impressions`, `AvgClickPosition`, `AvgImpressionPosition`, `Date`; actualización semanal; sin parámetros de fecha | learn.microsoft.com/.../iwebmasterapi.getquerystats y .../querystats | 2026-10-28 |
| `GetUserSites`: `Url`, `IsVerified` | learn.microsoft.com/.../iwebmasterapi.getusersites | 2026-10-28 |
| Códigos `ApiErrorCode` 0–16 | learn.microsoft.com/.../apierrorcode | 2026-10-28 |
| Una fila por búsqueda o una por búsqueda y semana; ventana de unos 6 meses | Documentación de terceros (analyticsedge, wrappers) | UNVERIFIED; FR-006 sirve para ambos casos |
| Cuotas de la API | — | UNVERIFIED; solo se clasifican `ThrottleUser`/`ThrottleHost` |
| AI Performance sin API | Prensa del sector, feb–may 2026 | UNVERIFIED; fuera de alcance |

## Assumptions

- El operador genera una sola clave y la usa para todas las empresas cuyos sitios tenga verificados en su cuenta de Bing; el sitio de un cliente debe estar compartido con esa cuenta.
- La forma de `GetPageStats` es la misma que `GetQueryStats`, con la URL en `Query`. Se confirma con la primera respuesta real (AC-010); si difiere, se corrige el esquema y se anota en DECISIONS.
- El dominio y el host de la empresa ya están normalizados como para Search Console (`workspace.domain`, `workspace.hostname`).
- No hay Sentry, OpenTelemetry ni `instrumentation.ts` en el proyecto, y `next.config.ts` no activa `logging.fetches` (comprobado 2026-10-28). El `fetch` de Next.js copia la URL completa, clave incluida, en la traza de cada petición (`http.url`) y en sus métricas de fetch. Hoy nadie las lee. Antes de añadir trazas o `logging.fetches`, hay que quitar `apikey` de esas URLs o desplegar con `NEXT_OTEL_FETCH_DISABLED=1`.
- La acción no tiene autenticación (D-03 del roadmap), igual que el resto. Con esta clave el riesgo es mayor que con Search Console: quien llegue a la app puede crear una empresa con cualquier dominio verificado en la cuenta de Bing del operador y leer sus datos. La barrera de D-03 es condición para desplegar fuera de la máquina del operador con `BING_WEBMASTER_API_KEY` puesta. Conviene generar la clave en una cuenta de Bing que solo tenga sitios de clientes.
- El proyecto no tiene `specs/CONSTITUTION.md` ni `specs/SERVICES.md`; se siguen las convenciones de 001–004 (D006).

## Open questions

- Ninguna bloqueante. Sin resolver y fuera de esta feature: si para clientes externos (Fase 5) llega OAuth de Microsoft, igual que en Search Console.

Resolución al cerrar (2026-10-28):

- ¿OAuth de Microsoft para clientes externos (Fase 5)? **Deferred**: va con D-03 y la Fase 5. La clave de usuario (D001) sirve para el operador.
- ¿`GetPageStats` tiene la forma de `GetQueryStats` (supuestos)? **Deferred**: Bing aún no tiene datos de olessium.com (D011). Seguimiento en TASKS › Follow-ups.
- ¿Cómo responde Bing a una clave mala o a un sitio ajeno? **Resolved**: HTTP 400 con `ErrorCode` 3 y 14, confirmado con la API real; no salió ningún 401 ni 403 (D010, D011).

Comportamiento no especificado, aceptado tal cual:

- Con datos guardados y la clave rota, la etiqueta dice «Conectado» junto al aviso de configuración (D009).
- Los pasos de configuración también salen en el estado «Error» sin datos previos, por ejemplo con cuota agotada.

## Contracted services

Contracted services not declared → all billable add-ons treated as NOT contracted (conservative default). Run `/project-init` to declare them. No aplica a esta feature: no cambia páginas públicas.
