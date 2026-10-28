# 18 — Interfaz bilingüe (español / English) y cabecera fija

**Spec:** `specs/features/003-i18n-sticky-header/`. **Estado:** In Progress desde el 2026-10-27.

Este documento recoge la evidencia de ejecución de la feature 003: precondiciones, resultados del spike técnico, verificaciones en navegador, inventario de cadenas (D017) y revisión humana de la copia inglesa (AC-015).

## 1. Precondición D011: consolidación de 002

- 2026-10-27: el trabajo pendiente de `002-dashboard-overview` se commiteó tal como estaba en `425e23b` («feat(ui): overview comercial por empresa, detalles y configuración GEO separada»): 68 archivos, overview, detalles, `/geo/setup`, módulo `overview`, `src/proxy.ts`, doc 17 y sus 26 capturas.
- Antes del commit, el árbol pasaba `npm run typecheck`, `npm run lint` y `npm run test:unit` (35 archivos, 383 pruebas).
- Decisión del propietario sobre el cierre de 002: **sigue `In Progress`**. Queda pendiente su T007 (comprobación humana de AC-018, prueba de diez segundos con participante). No se cierra 002 ni se marca su tarea.
- Base consolidada para contrastar el diff de 003 (AC-016, T008): `425e23b`.

## 2. T001 — Spike: idioma en el layout raíz y árbol completo

**Fecha:** 2026-10-27. **Resultado:** cumplida; variante (a) de D016: el layout raíz exporta `instant = false` y las páginas no bloqueantes leen la cookie sin exportarlo.

Cambios del spike (se conservan: son la base de T002–T004):

- `src/i18n/locale.ts`: `SUPPORTED_LOCALES`, `Locale`, `DEFAULT_LOCALE = "es"`, `LOCALE_COOKIE`, `isLocale`.
- `src/i18n/server.ts`: `getLocale()` que lee la cookie `locale` y devuelve `es` si falta o no es válida. La negociación ponderada de `Accept-Language` llega en T002.
- `src/app/layout.tsx`: `export const instant = false`, `<html lang={locale}>`.
- `src/app/page.tsx`, `src/app/workspaces/page.tsx` (dentro de `WorkspaceList`, tras `connection()`), `src/app/workspaces/new/page.tsx`, `src/app/not-found.tsx`: leen `getLocale()` y exponen `data-locale` en su contenedor como marcador provisional hasta que T004 traduzca sus textos.

### Build

`npm run typecheck` y `npm run build`: código 0. Clasificación de rutas en el build: `/`, `/_not-found`, `/api/health`, `/workspaces` y `/workspaces/new` dinámicas (ƒ); `/workspaces/[id]/**` en prerenderizado parcial (◐). Sin avisos de «runtime data» ni de validación de navegación instantánea.

### `next start` (puerto 3105): GET y HEAD

Script y salida completa en [`assets/18-i18n/t001-matrix.sh`](assets/18-i18n/t001-matrix.sh) y [`t001-get-head-matrix.txt`](assets/18-i18n/t001-get-head-matrix.txt).

| Cookie | `/` | `/workspaces` | `/workspaces/new` | `/workspaces/<id inexistente>` | `<html lang>` / `data-locale` | `<h1>` del 404 |
|---|---|---|---|---|---|---|
| sin cookie | 200 / 200 | 200 / 200 | 200 / 200 | 404 / 404 | `es` / `es` | Página no encontrada |
| `locale=es` | 200 / 200 | 200 / 200 | 200 / 200 | 404 / 404 | `es` / `es` | Página no encontrada |
| `locale=en` | 200 / 200 | 200 / 200 | 200 / 200 | 404 / 404 | `en` / `en` | Página no encontrada (texto aún sin traducir; T004) |
| `locale=xx` | 200 / 200 | 200 / 200 | 200 / 200 | 404 / 404 | `es` / `es` | Página no encontrada |

Cada celda: GET / HEAD. Cabeceras del HEAD 404 en inglés en [`t001-head-404-en.txt`](assets/18-i18n/t001-head-404-en.txt): `HTTP/1.1 404 Not Found`, `x-middleware-rewrite: /_not-found`, `Cache-Control: private, no-cache, no-store`. Cuerpos guardados durante la ejecución (no versionados).

### Servidor de desarrollo

Con el servidor ya en marcha en el puerto 3000: `/` → «Empresas» → «Nueva empresa» por navegación cliente, `document.documentElement.lang = "es"` y `data-locale = "es"` en las tres; consola sin errores de validación de navegación instantánea. Visita directa a un id inexistente: 404, «Página no encontrada», `lang="es"`.

### Conclusión

No hace falta `instant = false` en las páginas ni el 404 bilingüe. El coste declarado en SPEC se confirma: las tres páginas públicas pierden el shell estático. T008 compara tiempos locales.

## 3. T002 — Núcleo `src/i18n/`

**Fecha:** 2026-10-27. **Resultado:** cumplida.

| Archivo | Contenido |
|---|---|
| `locale.ts` | `SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `LOCALE_COOKIE`, `intlTag` (`es-ES`/`en-GB`), `isLocale`, `negotiateLocale` (contrato ponderado de SPEC) y `resolveLocale` |
| `server.ts` | `getLocale()`: cookie → `Accept-Language` → `es`; lee `cookies()` y `headers()` |
| `messages/es.ts`, `en.ts`, `types.ts`, `index.ts` | Catálogos tipados (`Messages = typeof es`; `en` con `satisfies`), `getMessages(locale)`. Espacios iniciales: `common`, `meta`, `header`, `notFound`; cada migración añade el suyo |
| `client-format.ts` | `ClientMessages` (hojas `string` o `{one, other}`, sin funciones), `fillTemplate`, `plural` con `Intl.PluralRules`; sin catálogos ni APIs de petición |
| `format.ts` | `formatNumber` (`useGrouping: "always"` para «1.234,5»), `formatDate`, `formatDateTime` (Madrid), `formatMs`, `formatBytes`, `regionName`; formateadores cacheados |
| `findings.ts` + `messages/findings.ts` | Contrato `findingText(finding, locale, context?)`: `es` devuelve lo guardado; `en` usa plantilla estática o dinámica con `params(facts)` de la misma auditoría y `rulesVersion` soportada; si no, fallback con bandera. Catálogos vacíos hasta T005 |
| `actions.ts` | `setLocaleAction`: valida contra `SUPPORTED_LOCALES`, cookie `path=/`, `SameSite=Lax`, `HttpOnly`, `Max-Age` 365 días, `Secure` solo en producción, `revalidatePath("/", "layout")`, sin redirección |

**Pruebas** (`tests/unit/i18n/`, 7 archivos, 56 pruebas, código 0): resolución (los ejemplos exigidos por SPEC y los casos límite), formatos con fecha fija, plantillas y plurales, catálogos (sin vacíos, paridad `es`/`en` por ruta y tipo de hoja, mapa de llamadas obligatorio para cada función), contrato de hallazgos y action con `cookies()`/`revalidatePath` simulados. `types.test.ts` demuestra bajo `npm run typecheck` que `ClientMessages` rechaza funciones en cualquier nivel y que un catálogo parcial no satisface `Messages`.

**Comprobación manual de AC-007:** eliminada la clave `header.home` de `en.ts`, `tsc --noEmit` falla con `TS2741: Property 'home' is missing`; restaurada, vuelve a pasar.

**Verificación global:** `npm run lint`, `npm run typecheck`, `npm run test:unit` (42 archivos, 439 pruebas) y `npm run build` con código 0; la clasificación de rutas del build no cambia respecto a T001 aunque `getLocale` lea también `Accept-Language`.

**Notas de implementación (sin decisión nueva):** `fillTemplate` deja visible un marcador `{x}` sin parámetro en vez de ocultarlo, para que un olvido se vea en pantalla; el tipo `ClientMessages` es estructural y no distingue un objeto `{one}` incompleto de un espacio anidado (la exigencia de D015 es rechazar funciones, y la cumple); la cookie se escribe también cuando el valor coincide con el actual, lo que revalida el layout sin más efecto.

## 4. T003 — Cabecera fija, navegación, selector de idioma y layout

**Fecha:** 2026-10-27. **Resultado:** cumplida. Capturas en `assets/18-i18n/t003-*`.

| Archivo | Contenido |
|---|---|
| `components/layout/app-header.tsx` | Servidor. `sticky top-0 z-40`, altura `--header-height`, `bg-card/85` + `backdrop-blur`, borde inferior. Enlace «Saltar al contenido»/«Skip to content» como primer enfocable (`sr-only`, visible con foco, destino `#contenido`), marca con icono `Radar` y nombre `sr-only` por debajo de 640 px, `HeaderNav`, `LanguageSwitcher`. Exporta `MAIN_CONTENT_ID` |
| `components/layout/header-nav.tsx` | Única frontera cliente nueva: `usePathname`, recibe etiquetas ya traducidas (cadenas). `isActivePath`: `/` solo en la raíz; cualquier otro elemento en su ruta y las que cuelgan de ella. Subrayado de marca de `WorkspaceNav` (`after:h-0.5 bg-brand`), 36 px de alto, 8 px de separación |
| `components/layout/language-switcher.tsx` | Servidor. `<form action={setLocaleAction}>` con `role="group"` y `aria-label` «Idioma»/«Language»; dos `button type="submit" name="locale"` de 36×36 px con `lang`, `aria-label` «Español»/«English», `aria-current="true"` en el activo (relleno `bg-primary`), nunca `disabled` |
| `app/layout.tsx` | `generateMetadata` (marca fija en el título, descripción del catálogo), `<main id="contenido" tabIndex={-1}>` sin contorno, `AppHeader` con `locale` y mensajes |
| `app/globals.css` | `--header-height: 3.5rem` en `:root`; `html { scroll-padding-top: var(--header-height) }` |

**Pruebas** (`tests/unit/layout/header.test.ts`, 11, código 0): `isActivePath` en las cuatro rutas de AC-005 y los negativos; marcado de `AppHeader` con `react-dom/server` (sin DOM): el skip link es el primer `<a>`, `nav` con `aria-label` por idioma, un solo `aria-current="page"` y en el enlace correcto, marca en `sr-only`, formulario con dos botones `submit` nombrados, con `lang`, nombre accesible completo, `aria-current="true"` solo en el activo y ninguno `disabled`. El action se sustituye por una ruta en la prueba porque el real necesita el ámbito de la petición.

**Navegador** (build de producción, `next start` en el puerto 3105; el servidor de desarrollo del puerto 3000 servía un `globals.css` antiguo, ver nota):

| Comprobación | 1280 px | 375 px |
|---|---|---|
| Cabecera al final de `/workspaces/[id]/seo` y `/geo` | `position: sticky`, `top: 0`, 56 px, visible con `scrollY` 1252 | visible con `scrollY` 1594 (GEO) y 1758 (SEO) |
| Desbordamiento horizontal | 0 px | 0 px; marca «Visibility Platform» con `position: absolute`, 1 px (solo lectores de pantalla) |
| Primer Tab | enlace «Skip to content» a 16×8 px, 124×36 px, `z-index` 50 (`t003-1280-skip-link.png`) | mismo marcado |
| Enter en el skip link | `document.activeElement` = `main#contenido`, sin contorno | — |
| 25 y 45 tabulaciones en SEO | elemento enfocado a 220 px y 588 px del borde superior, nunca bajo la cabecera | — |
| Ancla `#finding-…` | objetivo a 80 px (56 de `scroll-padding-top` + 24 de `scroll-mt-6`) | — |
| `aria-current="page"` | `/` → Inicio; `/workspaces`, `/workspaces/new`, `/workspaces/[id]/geo` → Empresas | — |
| Botones ES/EN | 36×36 px, 8 px entre ellos, `lang` es/en, «Español»/«English», `aria-current="true"` en el activo | igual (`t003-375-focus-es.png`, `t003-375-focus-en.png`: anillo de foco en inactivo y activo) |
| `document.cookie` | vacío (cookie `HttpOnly`) | vacío |
| Consola | sin errores | sin errores |

**Cambio de idioma con JavaScript:** clic en ES desde `/workspaces/[id]/geo` en inglés: POST del server action a la misma URL, respuesta 200, `lang="es"`, título, `meta description`, `nav aria-label` «Principal» y skip link «Saltar al contenido», foco conservado en el botón pulsado, sin redirección; EN revierte. Capturas `t003-1280-{es,en}-seo.jpg`, `t003-375-es-geo.jpg`, `t003-375-en-seo.jpg`.

**Cambio sin JavaScript** (`assets/18-i18n/t003-no-js-switch.txt`): el formulario servido es `method="POST" encType="multipart/form-data"` con el campo oculto `$ACTION_ID_…`; un POST con curl que reproduce ese envío más `locale=en` devuelve 200 con `Set-Cookie: locale=en; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=lax` y el cuerpo ya en inglés; el GET siguiente con la cookie sigue en inglés; `locale=es` revierte; `locale=xx` responde 200 sin `Set-Cookie`. `Secure` aparece porque `next start` corre con `NODE_ENV=production`; Chrome trata `localhost` como contexto seguro, por eso el clic también funcionó en el navegador.

**Verificación global:** `npm run lint`, `npm run typecheck`, `npm run test:unit` (43 archivos, 450 pruebas) y `npm run build` con código 0; la clasificación de rutas no cambia respecto a T001/T002.

**Nota sobre la caché de Turbopack (no es un cambio de código):** tras editar `globals.css`, tanto el servidor de desarrollo ya en marcha (puerto 3000) como `npm run build` siguieron emitiendo el bloque `:root` antiguo (sin `--header-height` ni `scroll-padding-top`) aunque sí generaban la utilidad nueva `h-(--header-height)`. Compilar el archivo directamente con `@tailwindcss/node` conserva ambas declaraciones, y un build con `experimental.turbopackFileSystemCacheForBuild: false` (cambio temporal, revertido) las emite correctamente; ese build es el que se verificó. Hasta reiniciar el servidor de desarrollo, la cabecera se verá con 45 px de alto y sin compensación de scroll.

**Notas de implementación (sin decisión nueva):** `isActivePath` compara por segmento (`/workspaces` y `/workspaces/…`), que coincide con «empieza por `/workspaces`» en todas las rutas existentes y evita un falso positivo en una ruta hipotética `/workspacesx`; el grupo del selector usa `role="group"` con `aria-label` en lugar de `fieldset` para no heredar sus estilos de bloque; el subrayado activo se sitúa en la base del enlace (36 px), no en el borde de la cabecera; los títulos de página siguen en español hasta que cada tarea migre su página.

## 5. T004 — Páginas generales y empresas, formulario y módulos de empresa

**Fecha:** 2026-10-27. **Resultado:** cumplida. Capturas en `assets/18-i18n/t004-*`.

| Archivo | Cambio |
|---|---|
| `i18n/messages/{es,en}.ts` | Espacios `home` (descripción, estado del sistema, hoja de ruta), `workspaces` (`list`, `create`, `edit`, `notFound`, `errors`, `form`) y `validation` (`workspace` con funciones parametrizadas por etiqueta y límite; `website` referencia `WEBSITE_ERROR_MESSAGES` de `workspaces/domain.ts`, que sigue siendo la única fuente española y la que usan los módulos GEO hasta T007) |
| `modules/workspaces/validation.ts` | Fábrica `workspaceInputSchemaFor(locale)` (D007): un esquema zod por idioma, construido con el catálogo y cacheado; `parseWorkspaceInput(raw, locale = "es")`; `countryName(code, locale)` sobre `regionName`; `COUNTRY_OPTIONS` pasa a `countryOptions(locale)` (sin otros llamantes). La deduplicación de servicios sigue en `toLocaleLowerCase("es")`: es normalización de datos, no texto |
| `modules/workspaces/presentation.ts` | `displayCountry` y `displayDate` con `locale` por defecto `es`, sobre `i18n/format` (el formateador local `es-ES` desaparece; misma salida) |
| `modules/workspaces/service.ts` | `createWorkspace`/`updateWorkspace` aceptan `locale` como último parámetro, solo para el idioma de los mensajes (adyacente necesario: la validación corre dentro del servicio) |
| `app/workspaces/actions.ts` | `getLocale()` por petición; dominio duplicado y empresa inexistente desde `workspaces.errors` |
| `components/workspaces/workspace-form.tsx` | Prop `labels: Messages["workspaces"]["form"]` (solo cadenas); sin literales. Las páginas lo montan con `key={locale}` |
| `components/page-loading.tsx`, `components/system-status.tsx` | `label` y `locale` por props; fecha de comprobación y latencia con `formatDateTime`/`formatMs` |
| `app/page.tsx`, `app/not-found.tsx`, `app/workspaces/{page,new/page}.tsx`, `app/workspaces/[id]/{not-found,edit/page}.tsx` | Textos del catálogo, `generateMetadata` por idioma, marcadores `data-locale` retirados. `/workspaces` lee el idioma en la página (como ya hacía `/`) para que el `fallback` del `Suspense` también se traduzca; la clasificación del build no cambia |

**Pruebas:** `tests/unit/workspaces/validation.test.ts` intacto; nuevo `validation-en.test.ts` (nombre vacío, IP y servicios vacíos en inglés; límites y etiquetas en ambos idiomas; mismo resultado válido; una instancia de esquema por idioma; países y fechas `en-GB`); `messages.test.ts` con llamadas representativas de las ocho funciones nuevas; `types.test.ts` acepta `es.workspaces.form` como `ClientMessages`. Suite completa: 44 archivos, 458 pruebas.

**Navegador** (build de producción, `next start` en 3105; consola sin errores):

| Comprobación | Resultado |
|---|---|
| GET con y sin cookie `en` de `/`, `/workspaces`, `/workspaces/new`, `/workspaces/[id]/edit` y un id inexistente | `lang`, `<title>` («Companies · Visibility Platform», «New company · …», «Edit company · …») y `<h1>` en el idioma activo; 404 real con «Page not found» / «Página no encontrada» |
| Formulario inválido en inglés (nombre vacío, `192.168.1.1`, sin servicios; sector «Dental clinic», Portugal, «Porto») | `role="alert"` «Check the highlighted fields.»; «The business name is required.», «Enter a domain, not an IP address.», «Enter at least one service.»; `aria-invalid` en `name`, `website`, `services`; sector, país y ciudad conservados (`t004-form-errors-en.jpg`) |
| Mismo envío en español | «Revisa los campos marcados.», «El nombre comercial es obligatorio.», «Introduce un dominio, no una dirección IP.», «Indica al menos un servicio.»; valores conservados (`t004-form-errors-es.jpg`) |
| Cambiar de idioma con errores en pantalla | El formulario se remonta con los valores iniciales y sin mensajes, etiquetas y países en el nuevo idioma. Sin el `key={locale}` el estado del `useActionState` sobrevivía y los mensajes quedaban en el idioma anterior; la SPEC fija el retorno a los valores iniciales como límite conocido |
| Inicio en inglés | Descripción, estado del sistema («Checked 27 Oct 2026, 15:02», «Connected (46 ms)») y hoja de ruta traducidos (`t004-home-en.jpg`) |
| Listado en inglés | Cabeceras «Company · Domain · Sector · Location · Added», «Spain», «Berlin, Germany», «25 Oct 2026, 21:18» (`t004-workspaces-en.jpg`) |

**Inventario D017 del área** (`rg` de acentos, palabras españolas sin acento, texto JSX literal y usos directos de `Intl`/`toLocale` sobre los 14 archivos de la tarea):

| Coincidencia | Clasificación |
|---|---|
| `workspaces/domain.ts`: `WEBSITE_ERROR_MESSAGES` (11 textos) | Fuente española del catálogo (`es.validation.website` la referencia); traducida en `en.ts`. No es UI pendiente |
| `validation.ts`: `toLocaleLowerCase("es")` | Normalización de datos (deduplicación), no formato de interfaz; se conserva |
| `presentation.ts`: comentario con «27 oct 2026» | Comentario |
| Nombres de campo (`"sector"`, `"name"`…) y valores iniciales vacíos | Identificadores técnicos |
| Listado: «Agencia de automatización y CRM», «Librería», «DEMOSTRACIÓN, datos sintéticos» | Contenido del usuario (sector y nombre de la empresa), excepción declarada |
| `system-status.tsx`: `configError` y `database.error` | Texto técnico de la validación de entorno y del driver; excepción declarada (logs/nombres técnicos) |

**No ejercitado:** `app/workspaces/[id]/not-found.tsx` solo se muestra en navegación cliente hacia una empresa que deja de existir; en visita directa el proxy sirve el 404 global (comprobado con `/workspaces/<uuid>/edit`). Su marcado traducido es el mismo patrón que el 404 global.

**Verificación global:** `npm run lint`, `npm run typecheck`, `npm run test:unit` (458) y `npm run build` con código 0.

## 6. T005 — Hallazgos y auditoría

**Fecha:** 2026-10-27. **Resultado:** cumplida. Capturas en `assets/18-i18n/t005-*`.

### Corpus de regresión (antes de tocar `rules.ts`)

- `tests/unit/i18n/fixtures/findings-corpus.scenarios.ts`: 26 escenarios construidos con `extractPage` sobre un HTML limpio y sus variantes (fallo DNS, robots.txt que bloquea, sitemap vacío/inválido/no declarado, 503, JSON en vez de HTML, http sin y con fallo TLS, cadena de dos redirecciones a otro dominio, noindex/nofollow, dos canonicals con una inválida, metadatos largos y cortos/duplicados, página vacía, JSON-LD inválido y de tipo WebPage, PageSpeed en error y lento en dos grados, CrUX mala y mejorable).
- `findings-corpus.json`: entradas completas (facts ya extraídos) y salidas (`ruleId`, severidad, categoría, título, evidencia, recomendación, orden) capturadas el 2026-10-27 de la implementación previa con una prueba temporal de vitest que se eliminó tras escribir el archivo. Cobertura contrastada con el código: 43 ids únicos, los 10 títulos dinámicos («…error 503», «2 redirecciones», «2 etiquetas canonical», «largo (86 caracteres)», «muy corto (6 caracteres)», «2 etiquetas <title>», «mide 196 caracteres», «2 meta descripciones», «2 encabezados H1», «tarda 5 s»/«3 s») y las dos variantes de `not_https`.
- `findings-corpus.test.ts` comprueba que el constructor sigue produciendo las entradas congeladas, que `evaluateAudit` reproduce las salidas campo a campo y en orden, que los ids cubren exactamente las claves de ambos catálogos, y el contrato `findingText` sobre las 70 ocurrencias (ver tabla).

### Catálogo y `rules.ts`

| Archivo | Cambio |
|---|---|
| `i18n/messages/findings.ts` | `FINDINGS_ES` (fuente: `evaluateAudit` construye los hallazgos nuevos con sus plantillas) y `FINDINGS_EN`, ambos `satisfies Record<…, FindingTemplate>`; una regla sin traducción rompe `npm run typecheck`. Adaptadores de parámetros históricos según la tabla de SPEC: `status`, `redirects.length`, `canonicalCount`, `titleLength`/`titleCount`, `metaDescriptionLength`/`Count`, `headingCounts.h1`, `lcpMs` (formateado en el idioma pedido con `lcpSeconds`) y `httpsFailure` (variante; `undefined` → sin contexto). Ausencia o tipo incorrecto devuelven `null`, nunca cero |
| `modules/audits/rules.ts` | Los 43 bloques toman `title`/`recommendation` del catálogo español (10 dinámicos con el valor observado). Sin cambio en `RULES_VERSION`, severidades, categorías, orden ni evidencias; `rules.test.ts` intacto |
| `modules/audits/thresholds.ts` (nuevo) | `METRIC_THRESHOLDS`, `MetricName`, `rateMetric`, sin texto. `status.ts` los reexporta y `components/audits/evolution-chart.tsx` importa de aquí. Corrección (T006): la gráfica es un componente de servidor, no cliente, así que la separación no era necesaria para la frontera cliente; se conserva porque deja los umbrales sin texto, importables desde cualquier componente |
| `modules/audits/status.ts` | `categoryStatuses(findings, facts, locale = "es")`, `auditHeadline(counts, locale = "es")` sobre `audits.labels`/`audits.headline`; `RATING_LABELS` queda como constante española para `overview/performance.ts` y la página de rendimiento (T006) |
| `modules/audits/presentation.ts` | `auditLabels(locale)`; las constantes `SEVERITY_LABELS`, `CATEGORY_LABELS`, `AUDIT_STATUS_LABELS`, `PERFORMANCE_STATUS_MESSAGES`, `FIELD_DATA_STATUS_MESSAGES`, `OUTCOME_LABELS` apuntan a `es.audits.labels` (una sola fuente) para los llamantes de T006 y para `reports/build-report.ts`, que sigue en español (D006); `formatMs`/`formatBytes` con `locale` sobre `i18n/format` |
| `components/audits/run-audit-button.tsx`, `components/reports/generate-report-button.tsx` | Prop `labels` (fragmento de cadenas). Las páginas de resumen, SEO y rendimiento (T006) pasan por ahora `getMessages(DEFAULT_LOCALE).audits.runButton` con comentario; T006 pasa el idioma real |
| `app/workspaces/[id]/audits/{actions.ts,[auditId]/actions.ts}` | `getLocale()` y errores de `audits.runErrors`/`reportErrors` |
| `app/workspaces/[id]/audits/[auditId]/page.tsx` | `generateMetadata`, todas las cadenas desde `audits.page`/`audits.labels`, `findingText(finding, locale, { facts: audit.facts, rulesVersion: audit.rulesVersion })` de la misma auditoría, aviso único (`role="note"`) por vista inglesa con la frase de evidencia y, si procede, la de fallback; evidencia y textos en fallback llevan `lang="es"`; `Metric` a nivel de módulo (lint `react-hooks/static-components`) |

**Pruebas:** `npm run test:unit -- tests/unit/audits tests/unit/i18n`: 19 archivos, 259 pruebas, código 0 (suite completa: 45 archivos, 492). `messages.test.ts` ejecuta las 14 funciones nuevas de `audits`; `status.test.ts` y `rules.test.ts` sin cambios.

| Contrato `findingText` | Resultado sobre el corpus |
|---|---|
| `es` | Las 70 ocurrencias devuelven exactamente `title`/`recommendation` guardados, `fallback=false` |
| `en` con facts y `rulesVersion` de la misma auditoría | 70/70 traducidas sin fallback; títulos dinámicos con el valor histórico («The home page answers with error 503», «…goes through 2 redirects», «There are 2 canonical tags», «The title is long (86 characters)», «…very short (6 characters)», «There are 2 <title> tags», «…196 characters long», «There are 2 meta descriptions», «There are 2 H1 headings», «…takes 5 s / 3 s to appear on mobile», «The website does not use HTTPS» / «The secure connection (HTTPS) does not work») |
| LCP 4500 ms | `es` guarda «4,5 s»; `en` muestra «4.5 s» |
| Sin contexto, versión `2099-01-01.1`, `facts: null`, facts de una página no leída, `httpsFailure` ausente, regla desconocida | texto guardado, `fallback=true`; las reglas estáticas se traducen sin contexto |

### Navegador (`next start` en 3105)

| Auditoría | Inglés | Español |
|---|---|---|
| Olessium, `rules 2026-10-26.1` (`t005-audit-en-summary.jpg`, `t005-audit-en-findings.jpg`, `t005-audit-es-summary.jpg`) | «Technical audit of olessium.com», «26 Oct 2026, 13:37 · 2.1 s · rules 2026-10-26.1», titular «Good: no critical or important problems», áreas «Good»/«Could improve · 1», hallazgo «The heading hierarchy skips levels» con pills «Improvement · Headings», recomendación «What to do: Order the headings…», aviso único «Evidence is shown as it was recorded, in Spanish.», evidencia en `<ul lang="es">`, métricas «Good: ≥ 90», «Good: ≤ 2.5 s», botón «Generate report» | Texto guardado idéntico («La jerarquía de encabezados salta niveles», «Qué hacer: Ordena…»), «2,1 s», «Bueno: ≤ 2,5 s», «Generar informe», sin aviso |
| clinicagarcia, `rules 2026-10-25.1` (versión no soportada) | Reglas estáticas traducidas («The page has no title», «The canonical tag is missing»…); `not_https` y `page_http_error` conservan «La web no usa HTTPS» y «La página principal responde con error 404» con `lang="es"`; un solo aviso con las dos frases (evidencia y fallback) | Todo en español, sin aviso |

Cambio ES/EN con el selector en la misma URL sin redirección; `document.cookie` vacío. La consola muestra un «Failed to load resource: 404» sin recurso asociado (`performance.getEntriesByType("resource")` no registra ninguna respuesta ≥ 400 en la página y `next start` no registra 404); no proviene del marcado de la auditoría y no aparece como error RSC.

### Inventario D017 del área

| Coincidencia | Clasificación |
|---|---|
| `rules.ts`: `FAILURE_LABELS`, `describeFailure`, «Se leyó por http:», «Página:/Canonical:», «Primer encabezado:», «Sin encabezados», etiquetas de CrUX («Respuesta a la interacción (INP)»…), «esta página»/«toda la web», `ms()` y `toLocaleString("es-ES")` para LCP/CLS | Líneas de evidencia: se guardan como se observaron y se muestran sin traducir con aviso (SPEC «Límites de localización»). No son UI pendiente |
| `rules.ts`: comentario «Aviso: … Límites» en la página | Comentario |
| `audit.error`, `entry.error`, `facts.sitemap.status` (`not_found (404)`), nombres de tipo JSON-LD, claves Open Graph, URLs y valores de la web auditada | Datos técnicos o contenido del sitio auditado, excepción declarada |
| `reports/build-report.ts` usa las constantes españolas | Informe HTML/PDF fuera de alcance (D006) |

**Notas de implementación (sin decisión nueva):** el corpus se capturó con una prueba temporal de vitest porque Node no resuelve los alias `@/` sin el bundler; el constructor de escenarios queda versionado y la prueba exige que siga produciendo las entradas congeladas. `status.ts` y `presentation.ts` importan ahora el catálogo; ningún componente cliente importa de ellos en tiempo de ejecución (solo el tipo `Tone`), comprobado con `rg` sobre los archivos con `"use client"`.

## 7. T006 — Resumen, rendimiento y SEO

**Fecha:** 2026-10-27. **Resultado:** cumplida. Capturas en `assets/18-i18n/t006-*`.

| Archivo | Cambio |
|---|---|
| `i18n/messages/{es,en}.ts` | Espacios `overview` (tarjetas, estados, oportunidades, prioridades, antigüedad, intentos y textos de los módulos puros), `performancePage`, `seoPage`, `chart` y `common.breadcrumbs` |
| `modules/overview/types.ts` | `staleInfo(date, now, locale = "es")` con plural («Data from 1 day ago» / «31 days»), `auditAttempt(pending, locale = "es")` |
| `modules/overview/performance.ts` | `compareScores`, `fieldPeriod`, `summarizePerformance` con `locale`; fechas y duraciones con `i18n/format`; el principal problema se traduce con `findingText` y `{ facts, rulesVersion }` de la auditoría resultado; nuevo campo `topIssueOriginal` |
| `modules/overview/seo.ts` | `seoAreaStatuses`, `urgentChange`, `summarizeSeo` con `locale`; veredictos desde `audits.labels.verdict` |
| `modules/overview/ai.ts` | `compareRuns`, `summarizeAi` con `locale`. La etiqueta del proveedor («Captura asistida (ChatGPT web)») sigue viniendo de `geo/presentation.ts` y se migra en T007 |
| `modules/overview/opportunities.ts` | `buildOpportunities(input, locale = "es")` con `input.context` (facts y versión de la misma auditoría); problema y acción con `findingText`; nuevo campo `original`. `PRIORITY_LABELS` se elimina (su único llamante pasa a `overview.priority`) |
| `components/audits/evolution-chart.tsx` | Componente de servidor con prop `locale`: títulos SVG, leyendas, tabla accesible y fechas por idioma |
| `components/overview/{page-header,workspace-nav,overview-card,opportunities}.tsx` | Etiquetas por idioma (`page-header` y `workspace-nav` con `locale` opcional, por defecto `es`, porque GEO aún no lo pasa); `overview-card` exige `cta`; `opportunities` con aviso único y `lang="es"` en evidencia y fallback |
| `app/workspaces/[id]/{page,performance/page,seo/page}.tsx` | `generateMetadata`, textos del catálogo, `findingText` con la auditoría resultado, aviso único por vista inglesa; el botón de auditoría recibe el fragmento del idioma real (retira el provisional de T005) |

**Pruebas:** suite completa 46 archivos, 504 pruebas, código 0. `tests/unit/overview/*` sin cambios en sus aserciones; nuevo `overview/i18n-en.test.ts` (13 pruebas). `messages.test.ts` ejecuta las 40 funciones nuevas en ambos idiomas.

**Navegador** (`next start` en 3105; consola con el mismo «404» sin recurso asociado ya anotado en §6):

| Vista | Inglés | Español |
|---|---|---|
| Resumen de Olessium, 1280 px (`t006-1280-en-overview.jpg`) | «Overview · Visibility Platform»; navegación «Overview · Performance · Google · AI presence» con `aria-label` «Company sections», migas «Breadcrumb»; tarjetas «Needs improvement 86/100», «Good 0 critical 0 important», «Partial 1 of 1 question»; fuentes «PageSpeed Insights · 26 Oct 2026, 15:41»; «Main problem: The main content takes 3.9 s to appear on mobile» (dinámico desde facts); oportunidad «Improve mobile speed» con aviso único de evidencia y evidencia `lang="es"`; pendiente «The AI measurement is incomplete.» | Idéntico al anterior: «Mejorable», «3,9 s», «Ver informe», «Principal problema: El contenido principal tarda 3,9 s…», sin aviso (`t006-375-es-overview.jpg`) |
| Rendimiento, 1280 px (`t006-1280-en-performance.jpg`) | «Mobile 86/100», «Desktop · Not available», métricas «Main content (LCP) 3.9 s · Good: 2.5 s or less», problema traducido, gráfica «Mobile speed score per audit, from 0 to 100», tabla «Date · Speed · Test», enlace «View the full technical audit of 26 Oct 2026, 15:41» | — |
| SEO, 1280 px (`t006-1280-en-seo.jpg`) | «Rankings on Google», salud técnica, áreas «Structure · Could improve · 1», hallazgo «The heading hierarchy skips levels» con «What we recommend: …», evidencia `lang="es"` y aviso único, histórico «26 Oct 2026, 15:41 · 0 critical · 0 important · 1 improvement» | — |
| Resumen de Müller sin auditorías (`t006-1280-en-overview-empty.jpg`) | «No data · Not measured · Run the first audit to measure the website's speed.», «No audit», fuente «not audited» | — |
| 375 px (`t006-375-en-overview.jpg`, `t006-375-en-seo.jpg`) | 0 px de desbordamiento en las tres vistas; pestaña GEO abreviada «AI» | 0 px |

**Inventario D017 del área** (`rg` de acentos, palabras españolas sin acento, texto JSX literal y `Intl`/`toLocale` directos sobre los 14 archivos): sin coincidencias de interfaz. Quedan como excepciones declaradas: la etiqueta del proveedor GEO (T007), el sector y nombre de la empresa (contenido del usuario), las preguntas monitorizadas citadas en la tarjeta de IA y en la oportunidad (contenido del mercado) y las líneas de evidencia de los hallazgos (originales, con aviso).

**Corrección a §6:** `evolution-chart.tsx` no es un componente cliente; la nota de T005 que justificaba `thresholds.ts` por la frontera cliente queda corregida allí. `thresholds.ts` se conserva porque separa los umbrales del texto.

**Notas de implementación (sin decisión nueva):** el contexto de traducción de hallazgos siempre es la auditoría resultado (`splitAudits(...).result`), la misma de la que salen los `findings`; nunca la anterior ni otra empresa. En inglés las palabras «critical»/«important» no varían en plural, por eso el recuento de la tarjeta SEO usa la misma forma.

## 8. T007 — GEO: informe, configuración, medición, formularios y sugerencias

**Fecha:** 2026-10-27. **Resultado:** cumplida. Capturas en `assets/18-i18n/t007-*`.

| Archivo | Cambio |
|---|---|
| `i18n/messages/{es,en}.ts` | Espacio `geo`: etiquetas (intención, estado de medición y de observación, proveedor, fracción), errores y éxitos de las acciones, validación, estado del proveedor de pago, fragmentos cliente `forms` y `suggestions` (plantillas `{name}`, `{max}`, `{count}`… y plurales `{one, other}`), textos del informe, la configuración y la medición |
| `modules/geo/service.ts` | Fábrica `geoSchemasFor(locale)` (alias, competidor, pregunta, respuesta asistida), cacheada por idioma; `updateBrandAliases`, `parseCompetitorInput`, `addCompetitor`, `addPrompt`, `recordManualObservation` con `locale` al final; validación de la respuesta extraída a `parseManualObservation(raw, locale)` puro (adyacente necesario para probar la respuesta en blanco sin base de datos). La detección de duplicados sigue con `toLocaleLowerCase("es")`: normalización de datos |
| `modules/geo/competitors/service.ts` | `extractionInputSchemaFor(locale)` y esquema de aceptación por idioma; `canonicalSource` con mensajes del idioma; `extractCompetitors` y `acceptSuggestion` con `locale`. Los avisos de la extracción se siguen generando y guardando en español |
| `modules/geo/presentation.ts` | `geoLabels(locale)`, `fraction(value, locale)`; las constantes españolas quedan solo para `reports/service.ts` (D006). Ya no se importa desde componentes cliente |
| `modules/geo/budget.ts`, `modules/geo/deps.ts` | `formatMicros(micros, locale)` (mismo agrupamiento que antes) y `geoProviderStatus(locale)` |
| `modules/overview/ai.ts` | La etiqueta de proveedor sale de `geoLabels(locale)`: resuelve lo pendiente de T006 |
| `app/workspaces/[id]/geo/actions.ts` | `getLocale()` por petición; errores y éxitos del catálogo |
| `components/geo/geo-forms.tsx`, `components/geo/competitor-suggestions.tsx` | Etiquetas por props (`Messages["geo"]["forms" | "suggestions"]`, solo cadenas y plurales); `fillTemplate`/`plural` para nombre aceptado, límite activo, recuentos y `aria-label` de copiar; solo importan tipos y `client-format` |
| `app/workspaces/[id]/geo/{page,setup/page,runs/[runId]/page}.tsx` | `generateMetadata`, textos del catálogo, `lang="es"` en preguntas, textos guardados y mensajes del proveedor, aviso único por vista inglesa |

**Límites de localización aplicados en GEO** (SPEC «Límites de localización», D017; sin decisión nueva):

- **Preguntas del mercado.** Las plantillas de `prompt-suggestions.ts` y el país con que se construyen siguen en español, el idioma del mercado del negocio. En inglés, la configuración añade la nota «Suggested questions are in the language of the business's market.». El ejemplo del campo «Question» es una pregunta del mercado y también queda en español.
- **Textos guardados de la extracción.** Avisos, motivos de cada indicio y notas de revisión están en la base de datos (`warnings`, `factors` en jsonb) y se tratan como evidencia original. La vista inglesa los muestra tal cual, con `lang="es"` y un aviso único. Las etiquetas alrededor sí se traducen: «Sector: Signal», «The website responds…».
- **Contenido del usuario y del proveedor.** Las respuestas capturadas, las fuentes, `observation.error` y la ubicación y el idioma de la medición se muestran como se guardaron. La medición en inglés lleva el aviso «Answers, sources and provider messages are shown as they were recorded.».

**Pruebas:**

| Suite | Resultado |
|---|---|
| `npm run test:unit` | 48 archivos, 515 pruebas, código 0; aserciones GEO existentes intactas |
| `geo/i18n-en.test.ts` (nuevo) | Respuesta vacía y solo espacios → «Paste the answer or tick “No answer”.» / «Pega la respuesta o marca «Sin respuesta».»; fuentes inválidas; competidor, pregunta y alias en inglés; captura en blanco → «Enter the question you asked.», «Paste the answer.»; límite «30,000» / «30.000»; pregunta duplicada; fracciones «3 of 8 (38%)» e importes |
| `geo/competitor-suggestions-render.test.ts` (nuevo) | Render sin base de datos del componente cliente: «Added as K2 Dental Madrid», «There are already 5 active competitors; remove one to add another.», «1 cited website · 2 candidates analysed» frente a «3 cited websites · 4 candidates analysed», textos guardados con `lang="es"`, aviso único; en español los textos anteriores exactos y sin aviso |
| `npm run test:integration` | 8 archivos, 74 pruebas, código 0, sin cambios (incluye `geo.test.ts` y `competitor-suggestions.test.ts`) |

**Navegador** (`next start` en 3105 contra la base de desarrollo, **sin escrituras**: solo envíos que el servidor rechaza):

| Vista | Resultado |
|---|---|
| Informe de Olessium, inglés (`t007-1280-en-geo.jpg`, `t007-375-en-geo.jpg`) | «Questions in which you appear: 1 of 1 question evaluated», «Partial», «3 of 3 scheduled», tabla «Question · Answers · Mentions you…», intención «Discovery», historial «Assisted capture (ChatGPT web) · Completed», aviso «Partial result: 1 question got no valid answer.»; 0 px de desbordamiento a 375 px |
| Configuración, pregunta duplicada (`t007-1280-en-setup-duplicate.png`) | «That question is already on the list.», texto conservado, tipos «Discovery · Recommendation · Comparison · About your brand», motivo del proveedor «The DataForSEO credentials are missing…»; siguen 3 preguntas activas |
| Configuración, captura con respuesta solo de espacios | «Check the data. / Paste the answer.», pregunta conservada |
| Extracción guardada de clinicagarcia (`t007-1280-en-suggestions.jpg`) | «2 cited websites · 5 candidates analysed», «Added as Example Domain (prueba)», «Dismissed», «Decided in this extraction (2)», pastillas «Sector: No signals», aviso único; avisos y motivos en español con `lang="es"`; un nombre capturado con marcado (`<img src=x onerror=…>`) se muestra como texto |
| Medición de Müller, inglés (`t007-1280-en-run.jpg`) | «Measurement of …», meta «Assisted capture (ChatGPT web) · Completed · Germany, de · 1 repetition», métricas «1 of 1 (100%)», aviso único de contenido registrado |
| Español (`t007-375-es-setup.jpg`) | Idéntico al anterior: «2 webs citadas · 5 candidatos analizados», «Añadido como Example Domain (prueba)», «Sector: Sin indicios», sin aviso |

**No verificado en navegador:**

- **Respuesta en blanco en la página de medición.** No hay observaciones pendientes en la base de desarrollo, y crear una medición escribiría en ella. Lo cubren la prueba unitaria de `parseManualObservation` y las de integración.
- **Aceptar o descartar una sugerencia de principio a fin.** También escribe en la base. Lo cubren el render del componente y las pruebas de integración.

**Inventario D017 del área** (`rg` sobre los 14 archivos):

| Coincidencia | Clasificación |
|---|---|
| `prompt-suggestions.ts` (8 plantillas) | Preguntas del mercado, excepción declarada |
| `competitors/extract.ts` (listas de palabras, avisos y notas) y `competitors/evaluate.ts` (motivos, `placeOf`) | Vocabulario de extracción y textos guardados en la extracción, que se muestran como registrados |
| `competitors/service.ts` (avisos de la extracción) | Igual: se guardan en `warnings` |
| `service.ts`: «No consta el envío al proveedor.» | Se guarda en `observation.error` como mensaje de estado; contenido registrado |
| `budget.ts`: mensajes de `BudgetExceededError`/`BudgetNotConfiguredError` | Excepciones internas; las acciones las traducen por código (`budget_exceeded`…) |
| `toLocaleLowerCase("es")`, `toLocaleUpperCase("es")` | Normalización de datos |
| `service.ts`: `Intl.DisplayNames(["en"])` | Nombre de ubicación para el proveedor, no interfaz |
| `geo/page.tsx`: comillas «» alrededor de cada pregunta | Tipografía alrededor de una pregunta del mercado |

**Hallazgos para revisar (no corregidos, fuera del alcance de 003):**

- **Errata española en el límite de alias.** `lines()` produce «Como máximo 10 aliass.». Se conserva porque la SPEC exige que el español por defecto no cambie. La versión inglesa dice «At most 10 aliases.».
- **Validación de nueva medición.** `createGeoRun` valida proveedor y repeticiones con los mensajes por defecto de zod, que están en inglés en ambos idiomas. El formulario no permite esos valores inválidos, así que no se ven en uso normal.

## 9. T008 — Verificación final

**Fecha:** 2026-10-27. **Estado:** cumplida. Evidencia técnica completa, AC-014 en verde y conformidad del propietario con la copia inglesa (AC-015, §10).

### Checks globales (AC-014) — `assets/18-i18n/t008-checks.txt`

Ejecutados sobre el código final, después de la corrección de esta tarea (ver «Corrección durante T008»):

| Comando | Resultado |
|---|---|
| `npm run lint` | Primera ejecución: código 1. Los 21 archivos con problemas estaban todos en `.claude/worktrees/olessium-seo-tools-b312b3/.next/`, el build de un worktree de otra sesión (rama `claude/olessium-seo-tools-b312b3`) creado dentro del repositorio a las 15:56; ninguno era de `src/` ni de `tests/`. A petición del propietario se añadió `.claude/**` a `globalIgnores` de `eslint.config.mjs` (`.claude/` ya está en `.gitignore`). **Segunda ejecución: código 0** |
| `npx eslint --ignore-pattern '.claude/**'` | Código 0 (comprobación previa al cambio de configuración) |
| `npm run typecheck` | Código 0 |
| `npm run test:unit` | Código 0 · 48 archivos · 515 pruebas |
| `npm run test:integration` | Código 0 · 8 archivos · 74 pruebas, contra la base de pruebas protegida |
| `npm run build` | Código 0 |

El cambio de `eslint.config.mjs` es de configuración del repositorio, no de la feature: no toca ninguna ruta protegida por AC-016. El worktree ajeno sigue sin tocar.

### Build y clasificación de rutas

Sin cambios respecto a T001. `/`, `/_not-found`, `/workspaces` y `/workspaces/new` son dinámicas (ƒ), porque el layout lee la cookie, el coste declarado en SPEC. Todas las rutas `[id]/**` siguen en prerenderizado parcial (◐). En la base `425e23b`, `/` era ◐ y `/workspaces/new` era estática (○).

### GET/HEAD, `lang`, título y `<h1>` (AC-013) — `t008-matrix.sh`, `t008-get-head-matrix.txt`

Hay 28 combinaciones: siete situaciones de idioma por cuatro rutas. Las situaciones son sin cookie, cookie `es`, `en` y `xx`, `Accept-Language: en-GB,es;q=0.8`, `es;q=0.2,en;q=0.9` y `en` con cookie `es`. Las rutas son `/`, `/workspaces`, `/workspaces/new` y un id inexistente.

- **Códigos.** GET y HEAD devuelven 200/200/200/404 en todos los casos.
- **Idioma.** `lang`, `<title>` y `<h1>` siguen al idioma resuelto: «Companies», «New company», «Page not found» frente a «Empresas», «Nueva empresa», «Página no encontrada». `xx` resuelve a `es`, y la cookie `es` gana a `Accept-Language: en`.
- **Cabecera hostil.** Un `Accept-Language` con `<script>alert(1)</script>` no se refleja: hay 0 apariciones en el HTML.

### Cambio sin JavaScript y contrato del action — `t008-no-js-switch.txt`

Envío el formulario servido (`$ACTION_ID_…`) con curl:

| Valor enviado | Respuesta |
|---|---|
| `en` / `es` | 200; `Set-Cookie: locale=…; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=lax`; cuerpo en el idioma nuevo |
| `xx`, `../../evil`, `https://evil.example` | 200 sin `Set-Cookie` |

Ninguna respuesta lleva `Location`: no hay redirección abierta. La cookie no es legible desde `document.cookie` (T003).

### Inventario global (D017) — `t008-dom-inventory.py`, `t008-dom-inventory.txt`

Recorrí 28 vistas en inglés: inicio, listado, alta, 404 y, para las tres empresas de desarrollo, resumen, edición, rendimiento, SEO, GEO, configuración GEO, dos auditorías y una medición. Para cada una separé el texto visible y los atributos accesibles (`aria-label`, `placeholder`, `title`, `alt`) que quedan fuera de bloques `lang="es"`, y busqué patrones españoles. Salieron 123 líneas marcadas. Ninguna es interfaz pendiente:

| Clasificación | Ejemplos |
|---|---|
| Falso positivo | El botón «EN» (28, coincide con la palabra «en»); «García Dental Clinic» en un ejemplo de recomendación inglesa |
| Contenido del usuario | Nombres, sectores, ciudades y servicios de las empresas (listado, cabeceras, ficha usada en la evaluación, formulario de edición) |
| Contenido del sitio auditado | Títulos, encabezados y descripción de olessium.com en los datos técnicos de la auditoría |
| Preguntas del mercado | Placeholder de la pregunta y `aria-label` «Copy the question: ¿Qué…?» |
| Contenido del proveedor o capturado | Respuestas de ChatGPT registradas, fuentes, ubicación «Germany, de» de la medición |

Las evidencias, los textos guardados de la extracción y los hallazgos en fallback están en bloques `lang="es"` con aviso único (T005–T007).

### Catálogo en el cliente (AC-017)

Ninguna de 15 frases de catálogo aparece en los 18 chunks JS de cliente del build. La búsqueda incluye frases solo de servidor («Fix these first», «The heading hierarchy skips levels») y textos de fragmentos cliente («Skip to content», «Copy the question», «{count} cited website»). Los fragmentos llegan como props en la carga RSC de cada página. `client-format` (con `Intl.PluralRules`) está en un único chunk. Los tipos de `ClientMessages` rechazan funciones (pruebas de tipos de T002/T007).

### Contraste del diff desde `425e23b` (AC-016) — `t008-diff-ac016.txt`

No hay archivos modificados ni nuevos en estas rutas:

- `src/modules/reports/`
- `src/proxy.ts`
- `src/modules/routing/`
- `package.json` y `package-lock.json`
- `src/db/migrations/` y `drizzle.config.ts`
- Ningún `*schema.ts`

Tampoco se añade ni se elimina ningún `page`, `route`, `layout` o `not-found` en `src/app`, así que no cambia ninguna URL ni se añaden dependencias.

### Rendimiento local antes y después — `t008-perf.sh`, `t008-perf.txt`

**Método.** `425e23b` se extrajo con `git archive` al scratchpad, con `node_modules` clonado (APFS) y la misma `.env.local`. Se construyó con `next build` y se sirvió en el puerto 3106, junto al build de 003 en el 3105. Misma máquina, misma base de desarrollo y mismos datos. Cinco peticiones de calentamiento y luego 40 muestras alternas por ruta, sin cookie. Al terminar se borró la copia, incluida su `.env.local`.

| Ruta | TTFB p50 antes → después | Total p50 antes → después | Total p90 antes → después |
|---|---|---|---|
| `/` | 3,1 → 3,1 ms | 95,8 → 102,5 ms | 108,3 → 116,7 ms |
| `/workspaces` | 2,7 → 2,8 ms | 51,8 → 55,0 ms | 55,3 → 62,5 ms |
| `/workspaces/new` | 1,9 → 2,2 ms | 1,9 → 8,1 ms | 2,2 → 9,3 ms |

**Lectura.** El primer byte no cambia. El tiempo total sube entre 3 y 7 ms en inicio y listado, dominados por la consulta a la base. `/workspaces/new` pasa de estática a dinámica, el coste declarado en SPEC y D016, con una cifra absoluta pequeña. Son mediciones locales de un solo operador; no prometen nada sobre carga ni escala.

### Revisiones exigidas por SPEC (autorrevisión con evidencia)

| Área | Comprobación | Resultado |
|---|---|---|
| Frontend y QA | Cabecera fija, foco, enlace de salto, `aria-current`, 375 px, selector sin JavaScript | T003 §4; T008 repite el cambio sin JS. 0 px de desbordamiento a 375 px en inicio, listado, 404, auditoría, rendimiento, resumen, SEO, GEO, configuración y medición (`t008-375-*`, `t006-375-*`, `t007-375-*`). **Contraste no medido en 003**: se reutilizan los tokens de 002 sin cambios |
| Backend y lógica | Action, cookie, resolución de idioma, fallback de hallazgos | Pruebas de `setLocaleAction` (T002), matriz de resolución (28 combinaciones), corpus de hallazgos con 70 ocurrencias y fallbacks (T005) |
| Seguridad | Valores de cookie, sin redirección abierta, `Accept-Language` no reflejado | Valores no soportados no escriben cookie, sin `Location`, cabecera hostil sin reflejar. Nombres capturados con marcado (`<img onerror>`) se muestran como texto (T007) |
| Acceso a datos | El contexto de traducción usa facts y versión de la misma auditoría y empresa, sin consultas nuevas | `findingText` recibe `{ facts, rulesVersion }` de `result` (resumen, SEO, rendimiento) o de la auditoría mostrada, siempre cargada con `getAudit(db, workspace.id, …)`. El diff de las páginas solo añade `getLocale()` y `generateMetadata`, sin consultas, migraciones ni endpoints nuevos. El action nuevo valida contra `SUPPORTED_LOCALES` |
| Rendimiento | Layout por petición y catálogo fuera del bundle | Tabla anterior y comprobación de chunks |

Las revisiones formales del flujo SDD (`/spec-review`, `/qa-review` y las especializadas) quedan para después de T008.

### Corrección durante T008

Al revisar la captura de oportunidades vi que la evidencia de la oportunidad de velocidad mezcla dos tipos de línea. La primera («Mobile performance: 86/100 (needs improvement)») se escribe en el idioma de la interfaz. Las siguientes son evidencia guardada en español. Toda la lista iba marcada `lang="es"`, y el aviso salía aunque no hubiera evidencia guardada.

`Opportunity` gana el campo `storedEvidenceFrom`: 0 para hallazgos, 1 para velocidad y ninguna línea para IA. La vista marca `lang` línea a línea y solo avisa si hay líneas guardadas o texto en fallback. `overview/i18n-en.test.ts` lo cubre. En el DOM, la línea generada va sin `lang` y «LCP de laboratorio: 3,9 s…» lleva `lang="es"`.

### Capturas añadidas en T008

- 375 px en inglés: `t008-375-en-{home,companies,404,audit,performance,run}.jpg`.
- 1280 px para AC-015: `t008-ac015-*` (§10).

Las capturas de T003–T007 cubren el resto de vistas a 1280 y 375 px en ambos idiomas.

## 10. Revisión humana de la copia inglesa (AC-015) — conforme antes de D019

**Material** (capturas a 1280 px del build final, cookie `en`, empresa Olessium):

| Vista | Capturas |
|---|---|
| Cabecera | `assets/18-i18n/t008-ac015-1-header.png` (375 px: `t003-375-en-seo.jpg`) |
| Inicio | `t008-ac015-2-home.jpg` |
| Lista de empresas | `t008-ac015-3-companies.jpg` |
| Overview | `t008-ac015-4a-overview.jpg`, `t008-ac015-4b-overview-opportunities.jpg` |
| Detalle SEO | `t008-ac015-5a-seo.jpg`, `t008-ac015-5b-seo-areas-problems.jpg`, `t008-ac015-5c-seo-history.jpg` |

`assets/18-i18n/t008-ac015-copy-en.txt` lista, por vista, todo el texto visible y accesible en inglés: 204 líneas, incluidos `aria-label` y `placeholder`. Las líneas en español de ese archivo son contenido del usuario o del sitio auditado (ver §9). La copia sale de `src/i18n/messages/en.ts` (interfaz) y `src/i18n/messages/findings.ts` (`FINDINGS_EN`, hallazgos).

**Registro del propietario:**

| Fecha | Vista | Texto actual | Corrección pedida | Aplicada en |
|---|---|---|---|---|
| 2026-10-27 | Las cinco | — | Ninguna | — |

**Conformidad final:** 2026-10-27, Manuel (propietario), en la conversación de implementación tras revisar este material: «lo veo bien». Sin correcciones a la copia inglesa de cabecera, inicio, lista de empresas, overview y detalle SEO.

**Caducada para overview y detalle SEO (D019).** Esta conformidad se dio sobre un árbol sin Search Console. Tras fusionar PR #1 (`acba536`) y traducir Search Console, overview y detalle SEO muestran copia inglesa nueva. La conformidad sigue valiendo para cabecera, inicio y lista de empresas. Overview y detalle SEO necesitan la revisión de §11.4.

## 11. D019 — Search Console, correcciones de revisión y repetición de T008

### 11.1 Contexto

PR #1 (Search Console) se fusionó en `main` como `acba536` mientras T008 estaba hecha. Esa sección y la línea de Search Console de la tarjeta SEO del overview llegaron solo en español. D019 metió su traducción en 003 (T009) y reabrió T008. `/spec-review` dejó además CONF-004 a CONF-009 para T010. Base de AC-016 para el cambio propio de 003: `acba536`.

### 11.2 T009 — Search Console (hecha en otra sesión, desviaciones aceptadas)

La traducción la hizo otra sesión de trabajo en este mismo árbol. Archivos: `src/modules/search-console/{summary,credentials,deps}.ts`, `src/components/search-console/{search-console-section,refresh-button}.tsx`, `src/app/workspaces/[id]/seo/{page.tsx,actions.ts}`, `tests/unit/search-console/{summary,credentials}.test.ts` y el espacio `searchConsole` de los catálogos. `collect.ts`, `google.ts`, `service.ts`, `schema.ts` y la migración 0006 no cambian (`assets/18-i18n/t008b-diff-ac016.txt`).

Comprobado en navegador sobre el build fusionado (§11.4): estados «Connected» y «No data», métricas, periodo, propiedad y botones en inglés; en español la sección coincide con la base. La línea del overview en español es idéntica a la de `acba536` («En Google: sin impresiones en los últimos 28 días (Search Console).»).

**Desviaciones respecto a D019 y al Verify de T009, aceptadas por el propietario el 2026-10-27:**

1. **El texto de fallo ya no usa el diagnóstico guardado.** En `acba536`, los fallos `api_disabled`, `invalid_credentials` y el caso por defecto mostraban `errorMessage` seguido de una instrucción. Ahora el texto sale solo del catálogo según `errorKind`, y `quota_exceeded` tiene frase propia. La salida española cambia para esos cuatro casos. D019 trata `errorMessage` como contenido del proveedor que se muestra tal cual, y FR-011 pide salida española idéntica.
2. **Aserciones originales modificadas.** `credentials.test.ts` sustituye dos `expect` sobre el motivo por una comparación con los códigos; `summary.test.ts` cambia la entrada de «configuración no válida» de un texto a un código. El Verify de T009 pide las aserciones originales intactas. La segunda parte es consecuencia directa de que el motivo pase a ser un código, que sí pide T009.

El propietario las aceptó: «Acepto las dos desviaciones de Search Console». Quedan registradas como enmienda de D019, con la SPEC (apartado 12, límites y AC-018) y el PLAN ajustados. T009 está marcada. El texto de `no_access` en español sigue idéntico al de `acba536`.

### 11.3 T010 — correcciones CONF-004 a CONF-009

| Hallazgo | Corrección |
|---|---|
| CONF-004 código sin uso creado por 003 | Quitadas `AUDIT_STATUS_LABELS`, `PERFORMANCE_STATUS_MESSAGES`, `FIELD_DATA_STATUS_MESSAGES` (`audits/presentation.ts`) y `RATING_LABELS` (`audits/status.ts`) con sus imports. Las claves `seoPage.ranking.*` sustituidas por Search Console ya no existen. `rg` sin referencias (`assets/18-i18n/t010-rg-callers.txt`). Tras la segunda `/spec-review`, retirado también `formatBytes` de `audits/presentation.ts`: su único llamante, la página de auditoría, usa `src/i18n/format.ts`. |
| CONF-005 aviso único del overview | `overviewOriginalText()` en `modules/overview/opportunities.ts` decide un solo aviso para tarjetas y oportunidades, también cuando solo el principal problema de rendimiento sale en fallback. La página lo pinta una vez antes de las oportunidades; el componente ya no pinta el suyo. Prueba en `tests/unit/overview/i18n-en.test.ts`. |
| CONF-006 placeholder de webs citadas | `geo.suggestions.sourcesPlaceholder` en ambos catálogos. |
| CONF-007 tipos de los botones | Fragmentos de los botones de auditoría e informe tipados como `ClientMessages` en `tests/unit/i18n/types.test.ts`. |
| CONF-008 frases concatenadas | Plantillas de catálogo: `noCandidates`/`noCandidatesWithReasons`, `card.factorPill`, `performancePage.field.withLabOnly`, `overview.cards.ai.footnote.line`. |
| CONF-009 comentarios | Corregidos en `audits/thresholds.ts` y `audits/status.ts`. |

### 11.4 Repetición de T008 sobre el árbol fusionado

**Comprobaciones** (`assets/18-i18n/t008b-checks.txt` y `t008b-integration.log`):

| Comando | Resultado |
|---|---|
| `npm run lint` | código 0 |
| `npm run typecheck` | código 0 |
| `npm run test:unit` | código 0, 557 pruebas en 52 archivos |
| `npm run test:integration` | código 0, 81 pruebas en 9 archivos |
| `npm run build` | código 0 |

- **AC-013** repetida con `next start`: GET y HEAD, `lang`, título y `<h1>` por idioma; cabecera `Accept-Language` hostil sin reflejar (`t008b-get-head-matrix.txt`).
- **Cambio sin JavaScript**: cookie con los atributos de la SPEC; valores no soportados sin cookie ni redirección (`t008b-no-js-switch.txt`).
- **Inventario D017** de las 28 vistas inglesas: 123 coincidencias, ninguna nueva respecto a §9. Los textos nuevos de Search Console no aparecen; la propiedad, consultas y páginas son datos del proveedor (`t008b-dom-inventory.txt`).
- **Catálogo en cliente**: ninguna frase del catálogo en los chunks de cliente, incluidas las de Search Console (`t008b-client-bundle.txt`).
- **AC-016** frente a `acba536`: sin cambios en informes, proxy, routing, base de datos, esquemas, migraciones ni `package.json`; sin rutas añadidas ni eliminadas. Search Console solo cambia en presentación y en el código del motivo de configuración (`t008b-diff-ac016.txt`). Fuera de 003 quedan `.gitignore` (cambio local ajeno por la clave de servicio) y `eslint.config.mjs` (pedido por el propietario).
- **Navegador** (1280 y 375 px, sin escrituras en la base de datos; el botón «Get Search Console data» no se pulsó): un único `role="note"` en el overview inglés y ninguno en español; sin scroll horizontal a 375 px; sin errores de consola.
- **Rendimiento**: no se repitió la medición frente a `acba536`; la de §9 frente a `425e23b` sigue siendo la referencia.

**Material para la nueva revisión AC-015 de overview y detalle SEO:**

| Vista | Capturas |
|---|---|
| Detalle SEO con Search Console conectado | `t008b-ac015-1-seo-sc-es.jpg` (es), `t008b-ac015-2-seo-sc-en.jpg` (en), `t008b-375-en-seo-sc.jpg` (375 px) |
| Detalle SEO sin datos de Search Console | `t008b-ac015-3-seo-sc-nodata-en.jpg` |
| Overview | `t008b-ac015-4-overview-en.jpg`, `t008b-ac015-5-overview-notice-en.jpg`, `t008b-ac015-6-overview-es.jpg` (es), `t008b-375-en-overview.jpg` (375 px) |

**Registro del propietario:**

| Fecha | Vista | Texto actual | Corrección pedida | Aplicada en |
|---|---|---|---|---|
| 2026-10-27 | Overview, detalle SEO | — | Ninguna | — |

**Conformidad final tras D019:** 2026-10-27, Manuel (propietario), en la conversación de implementación tras revisar este material: «doy mi conformidad». Sin correcciones a la copia inglesa de overview y detalle SEO con Search Console presente. Con §10, AC-015 queda conforme para las cinco vistas y T008 se marca.

## 12. Corrección tras `/qa-review` (D020)

La revisión QA encontró tres cambios en la salida española frente a `acba536`. Se restauró la original en los tres:

| Punto | Antes de la corrección | Ahora, igual que la base |
|---|---|---|
| Agrupamiento de miles (toda la interfaz) | «1.234» | «1234»; desde cinco cifras «12.345» |
| Variación de clics e impresiones de Search Console | «Antes: 20 clics (−25 %)» | «Antes: 20 clics (-25 %)» |
| Panel de estado del inicio | «Comprobado 27 oct 2026, 13:34» · «Conectada (1,2 s)» | «Comprobado 27/10/2026, 13:34:56» · «Conectada (1234 ms)» |
| Cabecera de la medición GEO (segunda revisión QA) | «3 repeticiones» · «1 repetición» | «3 repetición(es)» · «1 repetición(es)» |

La variación de CTR ya usaba el signo menos en la base y no cambia. En inglés, `en-GB` agrupa desde cuatro cifras como antes.

**Pruebas que fijan la base:** `tests/unit/search-console/summary.test.ts` (bajada, cambio grande sin agrupar y números de cinco cifras), `tests/unit/i18n/format.test.ts` (agrupamiento y `formatTimestamp`) `tests/unit/i18n/system-status.test.ts` (fecha y latencia del panel, con literales en `TZ=UTC`) y `tests/unit/geo/run-meta.test.ts` (repeticiones).

**Comprobaciones** (`assets/18-i18n/qa-fix-checks.txt`):

| Comando | Resultado |
|---|---|
| `npm run lint`, `npm run typecheck` | código 0 |
| `npm run test:unit` | código 0, 565 pruebas tras la segunda corrección |
| `npm run test:integration` | código 0, 81 pruebas en la repetición |

La primera ejecución de integración falló una vez: la prueba de concurrencia de auditorías vio dos auditorías correctas en lugar de una. 003 no toca ese servicio, y el archivo pasó tres veces en solitario y en la suite completa repetida.

## 13. Límite conocido tras `/review-all` (D021)

Con `next start` sobre el build actual, el selector se envió sin JavaScript (POST con el campo del server action) en dos páginas 404 (`assets/18-i18n/review-all-404-post.txt`):

| Página | Estado | Lo que se ve |
|---|---|---|
| 404 general (`/no-existe`) | 404, cookie guardada | Página completa en el nuevo idioma |
| 404 dentro de una empresa (`/workspaces/<id inexistente>`) | 404, cookie guardada | En blanco: plantilla de error de Next sin texto visible |

En la 404 de una empresa, al volver a cargar la página aparece en el nuevo idioma con estado 404. Con JavaScript las dos páginas se ven bien. Se acepta como límite conocido (D021): arreglarlo exige tocar el proxy (AC-016) o añadir una redirección al selector, que el contrato no permite.

## 14. Cierre y seguimientos (2026-10-28)

`/spec-close` pasó la spec a `Done` tras `/spec-review`, `/qa-review` y `/review-all` en Pass. Las diez tareas están hechas y los 18 criterios de aceptación tienen tarea y evidencia.

**Pendientes de verificación manual** (escenarios de prueba, no criterios):

- VoiceOver anunciando el selector ES/EN. Los atributos que lo hacen posible (`lang`, nombres accesibles, `aria-current`) se comprobaron en el DOM (§4); la prueba con lector de pantalla no se hizo.
- Contraste: no se midió en 003; los tokens de color son los de 002, sin cambios.

**Seguimientos menores de las revisiones**, ninguno bloqueante:

- Dos enlaces con `aria-current="page"` en las páginas de empresa («Empresas» y la pestaña activa), como pide AC-005; lo correcto sería reservarlo para la coincidencia exacta.
- El cambio de idioma revalida todo el sitio (`revalidatePath("/", "layout")`) y cualquiera puede llamarlo; hoy casi no hay caché y la app no se expone (D-03). Alternativa: `refresh()` de `next/cache`, con enmienda de la spec.
- `scroll-padding-top` igual a la altura de la cabecera: el anillo de foco puede quedar parcialmente oculto.
- Cambiar de idioma en otra pestaña mezcla idiomas en esta hasta recargar.
- El botón Atrás puede necesitar dos pulsaciones después de usar el enlace de salto.
- En hallazgos en fallback, la etiqueta inglesa queda dentro de `lang="es"`, y el título de una oportunidad crítica en fallback no lleva `lang`.
- Presupuesto GEO en inglés sin separador en cuatro cifras (`useGrouping: "min2"`).
- Dos formas mal formadas de `q` en `Accept-Language` se aceptan.
- Los errores mostrados por formularios siguen en el idioma anterior hasta el siguiente envío.
- Marcar los catálogos como solo de servidor (`server-only`) para que un import desde cliente rompa el build.
- La prueba de integración de concurrencia de auditorías falló una vez y pasó al repetir; parece inestable y no la toca 003.

**Para el commit:** 003 va separado de `eslint.config.mjs`. El cambio de `.gitignore` es ajeno y la clave de servicio de Search Console no debe subirse nunca.

