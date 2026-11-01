# Feature Spec: Inicio y panel de fuentes de datos

## Status

Ready (2026-11-01). Primera spec de la fase B del cierre del MVP (`docs/visibility-mvp/19-cierre-mvp-fases.md`), hallazgos 6, 10 y 11 (variables) de la auditoría de Codex del 2026-11-01.

## Problem

La portada de la aplicación (`/`) es una pantalla interna: estado de la base de datos, migraciones y las fases del roadmap con una ruta local de documentación. Un operador o un cliente que llegue a la raíz no ve su trabajo ni su empresa.

No existe ningún sitio donde ver, por empresa, qué fuentes están conectadas, con qué propiedad, cuándo se leyeron por última vez y qué falta. Cada sección de la página «Google» explica su propio estado con detalle, pero hay que recorrer toda la página (y la de Rendimiento y la de IA) para saber qué falta configurar.

El formulario de nueva medición en IA enseña nombres de variables de entorno (`DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `GEO_MONTHLY_BUDGET_USD`) cuando la modalidad automática no está disponible.

## Goal

La raíz lleva al listado de empresas; el estado técnico vive en una ruta de administración sin enlace en la cabecera. La página de edición de una empresa muestra un panel «Fuentes de datos» con una fila por fuente (Search Console, Bing, GA4, PageSpeed/CrUX, medición en ChatGPT): estado, propiedad, última lectura correcta y qué hacer, reutilizando los estados y textos que cada fuente ya calcula. Ningún texto del recorrido de medición en IA nombra variables de entorno.

## Non-goals

- OAuth por cliente o selección de propiedad desde la interfaz: la conexión sigue siendo por cuenta de servicio del operador y la propiedad se elige por dominio (BL-02 a BL-04).
- Cambiar las secciones de la página «Google», sus instrucciones de configuración (que sí nombran la variable, porque son para el operador que la configura) ni sus botones.
- Autenticación o protección de `/admin/status` (BL-07).
- Objetivo comercial por empresa (016) ni cartera (018).
- Nuevas lecturas a proveedores: el panel solo lee lo guardado.

## Users / Actors

- Operador: entra, ve empresas, abre una y en «Editar» sabe qué fuente falta y qué hacer.
- Propietario: si llega a la raíz, ve el listado (hoy sin autenticación, D-03).

## Current behavior

- `src/app/page.tsx` renderiza `SystemStatus` y la hoja de ruta; la cabecera tiene «Inicio» y «Empresas».
- `/workspaces/[id]/edit` solo tiene el formulario de la empresa.
- `geoProviderStatus` devuelve `missingCredentials`/`missingBudget` con nombres de variables; `RunForm` los muestra bajo la opción automática.
- Cada fuente tiene un `summarize*` puro con `state`, `reason`, `lastFailure`, `capturedAt` y su propiedad.

## Desired behavior

1. `GET /` redirige a `/workspaces`. La tarjeta de estado del sistema y la hoja de ruta pasan a `/admin/status`, sin enlace en la cabecera; la cabecera queda con «Empresas» y la marca enlaza a `/workspaces`.
2. En `/workspaces/[id]/edit`, debajo del formulario, la sección «Fuentes de datos» con una tabla de cinco filas: Google Search Console, Bing Webmaster Tools, Google Analytics 4, PageSpeed Insights y Chrome UX Report, Medición en ChatGPT. Columnas: fuente, estado (pill con icono y la misma etiqueta que usa su sección o tarjeta), propiedad o proveedor, última lectura correcta, qué hacer (motivo o fallo con la acción concreta) y un enlace a la sección correspondiente.
3. Estados por fuente, sin recalcular nada: Search Console, Bing y GA4 toman `state`, `reason`, `lastFailure`, `configWarning` y la propiedad de sus `summarize*`; PageSpeed/CrUX toma la presencia de clave del entorno y el `summarizePerformance` de la última auditoría; la medición en ChatGPT toma `summarizeAi` (solo mediciones reales, 013) y `geoProviderStatus`.
4. La columna «qué hacer» muestra, por orden: el fallo del último intento si lo hubo, el aviso de configuración si existe, o el motivo del estado; vacía cuando la fuente está conectada y al día.
5. «Última lectura correcta» muestra la fecha de la última captura o medición buena; «Nunca» si no la hay.
6. `geo.providerStatus.missingCredentials` y `missingBudget` dejan de nombrar variables: «La medición automática (DataForSEO) no está disponible en este entorno.» y «La medición automática no está disponible: falta fijar un presupuesto mensual.».

## Functional requirements

- FR-001 `src/app/page.tsx` hace `redirect("/workspaces")`. Nueva ruta `src/app/admin/status/page.tsx` con el contenido actual de la portada (estado del sistema y hoja de ruta), título «Estado del sistema».
- FR-002 `AppHeader`: ítems de navegación solo «Empresas»; la marca enlaza a `/workspaces`; `header.home` se retira del catálogo.
- FR-003 `auditProviderConfig()` en `src/modules/audits/deps.ts`: `{ pageSpeed: boolean; crux: boolean }` a partir de `PAGESPEED_API_KEY` y `CRUX_API_KEY`, sin exponer valores.
- FR-004 Módulo puro `src/modules/sources/summary.ts` con `summarizeSources(input, locale)`; `input` lleva los resúmenes y configuraciones de las cinco fuentes; devuelve `SourceRow[]` en el orden de «Desired behavior» 2: `{ key, name, status: { tone, label }, target, lastGood, note, action: { label, href } }`.
- FR-005 Etiquetas y tonos: Search Console, Bing y GA4 usan las etiquetas de `status` de sus catálogos y los tonos de sus secciones; PageSpeed usa `overview.states` (`not_configured` «Sin configurar» cuando falta la clave; `not_measured` para `partial`; `ok` «Medido»); la medición en ChatGPT usa las etiquetas de la tarjeta de IA (014, D004).
- FR-006 `target`: propiedad de Search Console; sitio de Bing; nombre de propiedad de GA4 (o su id); para PageSpeed, nulo; para IA, el proveedor de captura asistida y, si está disponible, el automático.
- FR-007 Componente `SourcesPanel` en `src/components/workspaces/sources-panel.tsx` (servidor, sin estado): tabla con desbordamiento horizontal en móvil, enlaces a `/seo#ranking-title`, `/seo#bing-title`, `/seo#analytics-title`, `/performance` y `/geo/setup`.
- FR-008 La página de edición carga lo guardado de las cinco fuentes y renderiza el panel bajo el formulario, con el `key` por idioma del formulario intacto.
- FR-009 Textos de FR-004/FR-007 y «Desired behavior» 6 en `es` y `en`.
- FR-010 Las instrucciones de configuración de las secciones (`searchConsole.setup`, `reasons.invalidConfig` y equivalentes) no cambian.

## Non-functional requirements

- Performance: la página de edición añade lecturas de lo guardado (cuatro últimas capturas, auditorías, mediciones y preguntas) y ninguna llamada externa.
- Security: `/admin/status` queda tan expuesto como hoy la raíz (D-03, BL-07); no muestra credenciales. El panel nunca muestra claves ni JSON; el email de la cuenta de servicio sí (ya lo muestran las secciones).
- Accessibility: tabla con `caption`, cabeceras `th` y pills con icono y texto.

## API / Interface changes

- Nueva ruta `/admin/status`. `/` redirige.
- `auditProviderConfig()`, `summarizeSources()`, `SourcesPanel`.
- Catálogo: `sources.*`, `admin.status.*`; `header.home` retirado; `geo.providerStatus.*` reescrito.

## Data model changes

Ninguno.

## Edge cases

- Empresa recién creada, sin nada: cinco filas con «Sin configurar» o «Sin datos» y la acción de cada una.
- Credencial retirada con captura guardada: Search Console/GA4/Bing «Conectado» con el aviso de configuración en «qué hacer».
- Último intento fallido con captura buena: estado de la captura y el fallo en «qué hacer».
- Solo mediciones demo o prueba: IA «Sin mediciones» con la frase de la 013.
- Sin clave de PageSpeed y con auditoría: «Sin configurar» y el motivo de la auditoría.
- Locale `en`.

## Acceptance criteria

- AC-001 `GET /` responde con redirección a `/workspaces`; `/admin/status` muestra el estado del sistema y la hoja de ruta; la cabecera no tiene «Inicio» y la marca lleva a `/workspaces`.
- AC-002 `summarizeSources` devuelve cinco filas en orden con las etiquetas de FR-005 para: Search Console `ok`, `empty`, `no_data`, `not_configured`, `invalid_config`, `error`; Bing `processing`; GA4 `empty` con `configWarning`; PageSpeed sin clave, medido, parcial y sin auditoría; IA sin configurar, solo demo, medido con automático no disponible. En `es` y `en`.
- AC-003 «Qué hacer» sigue el orden de «Desired behavior» 4; «Última lectura correcta» es la fecha o «Nunca».
- AC-004 `SourcesPanel` renderiza la tabla con `caption`, cinco filas, los cinco enlaces y ninguna clave ni JSON, en `es` y `en`.
- AC-005 `RunForm` con DataForSEO no disponible muestra el motivo sin nombres de variables; `grep` de `DATAFORSEO_\|GEO_MONTHLY_BUDGET` en `src/i18n/messages` solo encuentra las instrucciones de configuración permitidas por FR-010 (ninguna en `geo.providerStatus`).
- AC-006 En navegador sobre `dev`: `/` lleva a Empresas; `/workspaces/<Olessium>/edit` muestra el panel con Search Console «Sin impresiones», Bing «Procesando», GA4 «Conectado», PageSpeed «Medido» e IA «Sin mediciones» con la frase de solo demostración; la clínica muestra «Sin datos» en las tres fuentes de Google y Bing. Sin desbordamiento de página a 375 px.
- AC-007 Lint, typecheck, unitarias, integración y build en verde.

## Test scenarios

- Unit: `tests/unit/sources/summary.test.ts` (AC-002, AC-003), `tests/unit/sources/panel-render.test.ts` (AC-004), catálogos (`messages.test.ts`), `tests/unit/geo/i18n-en.test.ts` o equivalente para `providerStatus` (AC-005).
- Integration: sin cambios de datos; suite completa por regresión.
- Manual: AC-001 (redirección) y AC-006.

## Assumptions

- La página de edición es el sitio del panel porque es la única pantalla de operador por empresa; cuando exista «Configuración» (017), el panel se mueve allí sin cambiar el módulo.
- `/admin/status` sin enlace basta para el entorno privado actual; con BL-07 recibirá la misma barrera que el resto.

## Open questions

- Ninguna.

## Contracted services

Esta feature no añade servicios de pago.
