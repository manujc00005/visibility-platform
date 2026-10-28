# Feature Spec: Interfaz bilingüe (español / English) con cabecera fija

## Status

Done — 2026-10-28 (`/spec-close` tras `/spec-review`, `/qa-review` y `/review-all` en Pass; T001–T010 hechas; AC-015 conforme; límite conocido D021; ver doc 18 §11–§13).

## Problem

Toda la interfaz está escrita en español dentro del código: textos de páginas, componentes, mensajes de validación de los server actions, etiquetas de los módulos puros (`presentation.ts`, `overview/*`), títulos y recomendaciones de los hallazgos que la auditoría guarda en base de datos, y formatos de número y fecha fijados a `es-ES`. El atributo `<html lang>` es fijo. Un usuario angloparlante (propietario de pyme o colaborador) no puede usar la herramienta. La cabecera actual no es fija: al desplazarse por páginas largas (detalle SEO, informe GEO) desaparece la navegación principal y no hay sitio estable donde colocar el selector de idioma.

## Goal

La herramienta presenta sus textos de interfaz en español o en inglés, con las excepciones originales declaradas en «Límites de localización», con el idioma elegido desde una cabecera fija presente en todas las páginas. El idioma se recuerda entre visitas, se aplica al `<html lang>`, a todos los textos de la interfaz, a los mensajes de validación, a los nombres y recomendaciones de los hallazgos y a los formatos de número y fecha. El español sigue siendo el idioma por defecto y de referencia. El diseño de la cabecera sigue las pautas de accesibilidad y navegación del skill `ui-ux-pro-max` (consultas registradas en DECISIONS D002).

## Non-goals

- Informe HTML/PDF para el cliente (`src/modules/reports/*`): se genera y guarda en español como hasta ahora. Localizar el informe es una feature propia (idioma elegido al generarlo, pruebas byte a byte del PDF). Se recomienda como siguiente paso.
- Traducir contenido guardado por el usuario o por los proveedores: nombres de empresa, preguntas monitorizadas, respuestas de ChatGPT, alias, errores guardados en `audits.error` u `observations.error`.
- Líneas de evidencia de los hallazgos (`audit_findings.evidence`): se muestran tal como se guardaron (contienen valores observados con etiquetas en español). Ver D014 y el límite declarado en FR-008.
- Cambiar las plantillas de preguntas GEO (`prompt-suggestions.ts`), las listas de exclusión de competidores ni la cabecera `accept-language` del fetcher: son contenido del mercado del negocio auditado, no interfaz.
- Idiomas adicionales, detección por geolocalización, traducción automática, URLs con prefijo de idioma (`/en/...`), hreflang o SEO de la propia herramienta (es privada y `noindex`).
- Modo oscuro, menú hamburguesa, búsqueda en cabecera, avatar o cuenta de usuario (no hay autenticación hasta la Fase 5).
- Nuevas dependencias (`next-intl` u otras), cambios de esquema o migraciones, cambios en reglas de auditoría (`RULES_VERSION` no cambia porque los textos guardados en español siguen idénticos).
- Mensajes de log (`pino`) y nombres técnicos de la API de salud.

## Users / Actors

- Operador (único usuario real hoy): usa la herramienta en español o inglés y la enseña a clientes.
- Propietario de pyme angloparlante (lector objetivo del inglés): consulta su overview y detalles.
- Implementador: aplica la spec; revisa la copia inglesa junto con el propietario del proyecto.

## Current behavior

- `src/app/layout.tsx`: `<html lang="es">`, `metadata.description` en español, `AppHeader` no fijo (`border-b`, sin `sticky`), sin enlace para saltar al contenido.
- `src/components/layout/app-header.tsx`: logo + nombre, navegación «Inicio · Empresas» sin estado activo. Componente de servidor.
- 48 archivos de `src/` contienen textos en español (páginas, componentes cliente y servidor, módulos puros, validaciones zod en `workspaces/validation.ts`, `geo/service.ts`, `geo/competitors/service.ts`).
- Los hallazgos de la auditoría se calculan en `src/modules/audits/rules.ts` (43 `ruleId` literales únicos en la revisión del 2026-10-27; diez títulos interpolados y variantes de una misma regla, textos en español) y se guardan en `audit_findings` (`title`, `evidence[]`, `recommendation`). Las páginas y el overview muestran lo guardado.
- Formatos: `Intl.DateTimeFormat("es-ES", …)`, `toLocaleString("es-ES")`, `Intl.DisplayNames(["es"])` en unos 15 puntos de `src/`; zona horaria `Europe/Madrid` donde se fija.
- `cacheComponents: true`. Las rutas `/workspaces/[id]/**` exportan `instant = false`; `/`, `/workspaces`, `/workspaces/new` y `not-found.tsx` no. `src/proxy.ts` devuelve 404 real en `/workspaces/:path+` reescribiendo a `/_not-found`.
- Las pruebas unitarias e integración (27 archivos) afirman textos en español.
- Actualización D019 (2026-10-27): durante la implementación se fusionó en `main` el PR #1 (`acba536`, feature `003-search-console`). Añade la sección «Google Search Console» del detalle SEO (`src/components/search-console/{search-console-section,refresh-button}.tsx`), la línea de posicionamiento de la tarjeta SEO del overview (`summarizeSearchConsole(...).cardLine`), el action `src/app/workspaces/[id]/seo/actions.ts` y el módulo puro `src/modules/search-console/summary.ts`. Todos sus textos están en español fijo y sus números en `es-ES`.

## Desired behavior

1. **Idioma activo.** Soportados `es` y `en`; `es` por defecto. Se determina por petición: cookie `locale` si es válida; si falta o es inválida, negociación ponderada de `Accept-Language` según «Contrato de resolución de idioma»; sin coincidencias seleccionables, `es`. Función pura `resolveLocale({ cookie, acceptLanguage })` con pruebas.
2. **Persistencia.** El selector de la cabecera llama a un server action que guarda la cookie `locale` (`path=/`, `sameSite=lax`, `secure` en producción, `maxAge` 365 días, `httpOnly`) y revalida el layout. La página actual se vuelve a renderizar en el nuevo idioma en la misma URL, sin redirección y sin JavaScript en el cliente (formulario con `action`).
3. **Documento.** `<html lang>` toma el idioma activo. `metadata.title` mantiene la marca «Visibility Platform»; `metadata.description` y los títulos de página se traducen con `generateMetadata`. El layout raíz exporta `instant = false` porque lee la cookie (documentado por Next: «Opt the layout out»). Las páginas que lean el idioma y aún no sean bloqueantes (`/`, `/workspaces`, `/workspaces/new`) exportan también `instant = false` o leen el idioma dentro de su `Suspense` existente, según lo que el spike T001 demuestre que compila.
4. **Cabecera fija.** `position: sticky; top: 0`, altura constante `--header-height: 3.5rem` en todos los anchos, fondo `bg-card/85` con `backdrop-blur`, borde inferior, `z-index` por encima del contenido. `html { scroll-padding-top: var(--header-height) }` para que los anclajes (`#hallazgo-…`) y el foco por teclado nunca queden ocultos bajo la cabecera (WCAG 2.2 2.4.11 «Focus Not Obscured», D002). Sin sombra dependiente del scroll ni JavaScript de scroll.
5. **Contenido de la cabecera**, de izquierda a derecha:
   - Enlace para saltar al contenido («Saltar al contenido» / «Skip to content»): primer elemento enfocable, visible solo con foco, destino `<main id="contenido">`.
   - Marca: icono `Radar` + «Visibility Platform» enlazando a `/`. En anchos < 640 px el nombre se oculta visualmente y se conserva para lectores de pantalla.
   - Navegación principal (`<nav aria-label>`): «Inicio»/«Home» y «Empresas»/«Companies». El elemento activo lleva `aria-current="page"` y el subrayado de marca que ya usa `WorkspaceNav` (mismo trazo `after:h-0.5 bg-brand`). Activo: `/` solo en la raíz; `/workspaces` en cualquier ruta que empiece por `/workspaces`. La detección del estado activo vive en un componente cliente hoja (`usePathname`) que recibe las etiquetas ya traducidas; el resto de la cabecera sigue siendo componente de servidor.
   - Selector de idioma a la derecha: control segmentado de dos botones «ES» y «EN» dentro de un formulario con `action` del server action, `<fieldset>` o grupo con `aria-label` «Idioma»/«Language». Cada botón lleva `lang` propio (`es`/`en`), su nombre completo accesible («Español», «English») y `aria-current="true"` en el activo; el activo se muestra relleno y sigue siendo pulsable (no `disabled`, para no perder el foco al cambiar). Objetivos ≥ 36 × 36 px con separación ≥ 8 px.
   - Todos los controles con anillo de foco visible (`focus-visible:ring-2`), `cursor-pointer`, transiciones solo de color de 150–200 ms y `motion-reduce:transition-none`. Contraste de texto ≥ 4.5:1 con los tokens actuales.
   - A 375 px todo cabe en una fila sin desbordamiento ni menú desplegable.
6. **Catálogo de mensajes.** Módulo `src/i18n/` sin dependencias: `Locale`, `DEFAULT_LOCALE = "es"`, `messages/es.ts` como fuente del tipo `Messages`, `messages/en.ts` que debe satisfacer ese tipo (una clave ausente es error de compilación). Mensajes con variables como funciones tipadas; plurales con `Intl.PluralRules`. Acceso en servidor con `getLocale()` y `getMessages(locale)`; las funciones de mensajes se evalúan en servidor. Los componentes cliente reciben solo cadenas o plantillas serializables según «Contrato servidor/cliente»; nunca funciones del catálogo ni cookies.
7. **Módulos puros con texto.** Las funciones que producen texto para el usuario (`audits/presentation.ts`, `audits/status.ts`, `geo/presentation.ts`, `workspaces/presentation.ts` y `validation.ts`, `overview/*`, esquemas zod de `geo/service.ts` y `geo/competitors/service.ts`) aceptan `locale` como último parámetro con valor por defecto `"es"`, o se construyen por fábrica (`schemaFor(locale)`). Con el valor por defecto devuelven exactamente los textos actuales, de modo que las pruebas existentes siguen pasando sin cambios.
8. **Hallazgos.** Catálogo tipado para todos los `ruleId` emitibles y sus variantes. `rules.ts` toma los textos del catálogo `es`, parametrizando valores observados, sin cambiar salida ni `RULES_VERSION`. Al mostrar hallazgos se usa `findingText(finding, locale, context?)` según «Contrato de hallazgos»: conserva valores históricos y variantes, sin reconstruirlos a partir de prosa. La evidencia se muestra como se guardó; cada vista que la presenta en inglés incluye un aviso único de idioma original.
9. **Formatos.** `src/i18n/format.ts` centraliza fecha, hora, número, duración, bytes y nombres de país con `Intl` y la etiqueta del idioma (`es-ES`, `en-GB`); zona horaria sin cambios. Sustituye los usos directos de `es-ES` en `src/` salvo los del informe (no-goal) y los que no son interfaz.
10. **Validación.** Los server actions resuelven el idioma con `getLocale()` y devuelven mensajes de error en ese idioma; los formularios cliente muestran lo que reciben. `useActionState` y la conservación de lo escrito no cambian.
11. **Páginas de error.** `not-found.tsx` (global y de empresa) se traducen. La contingencia de 404 bilingüe solo se admite si T001 demuestra que el árbol completo, incluido el layout raíz que lee cookies, compila y devuelve 404. El contenido bilingüe no resuelve por sí solo un fallo en el layout; aplicar D016.
12. **Search Console (D019).** La sección «Google Search Console» del detalle SEO en todos sus estados (sin configurar, configuración no válida, sin datos, error, con datos), su descripción, el botón de refresco y sus errores, y la línea de posicionamiento de la tarjeta SEO del overview toman sus textos del catálogo y sus números y fechas de `src/i18n/format.ts`. `summary.ts` acepta `locale` como último parámetro con `es` por defecto y, con ese valor, devuelve exactamente los textos actuales, salvo los textos de fallo (enmienda de D019). Los motivos de configuración no válida, que hoy son frases españolas de `credentials.ts`, se identifican por código y se traducen. Se muestran como vienen, como contenido del proveedor: las búsquedas, las páginas y la propiedad. La explicación de un intento fallido sale del catálogo según su `errorKind`; el `errorMessage` guardado no se muestra y queda como diagnóstico interno (enmienda de D019). No cambian la captura, la API de Google, la credencial, el esquema ni la migración `0006` de Search Console.

## Contrato de resolución de idioma

1. Cookie soportada `es`/`en` gana siempre. Si falta o es inválida, analizar `Accept-Language` sin reflejar el texto recibido en HTML.
2. Para cada entrada válida, normalizar mayúsculas y región al idioma base soportado (`en-US` → `en`, `es-ES` → `es`). Peso `q` omitido = 1; aceptar valores de 0 a 1 con hasta tres decimales. Ignorar entradas malformadas, pesos inválidos/fuera de rango, idiomas no soportados y comodines. `q=0` no participa en la selección.
3. Elegir mayor peso; en empate usar el orden original de las entradas. Si hay variantes repetidas del mismo idioma, gana su entrada de mayor peso; no sumar pesos. Sin entrada seleccionable usar `DEFAULT_LOCALE` (`es`), sin respuesta 406.
4. Casos exigidos: `en;q=0.2,es;q=0.9` → `es`; `es;q=0.2,en;q=0.9` → `en`; `en;q=0,es;q=0.5` → `es`; `en,es` → `en`; `es,en` → `es`; `EN-gb,es;q=0.8` → `en`; `en;q=2,es;q=0.5` → `es`; `en;q=bad,es;q=0.5` → `es`; `en-US;q=0.2,en-GB;q=0.9,es;q=0.8` → `en`; `fr`, ausencia, vacío o `*` solo → `es`. La cookie válida prevalece en todos ellos.

## Contrato servidor/cliente

- `getLocale()` y los catálogos completos se usan solo en servidor. Las funciones de mensajes reciben parámetros tipados y devuelven texto; no se pasan al cliente ni se marcan `use server` para usarlas como traducciones remotas.
- Definir `ClientMessages` con hojas serializables (cadenas, plantillas y registros de plural `one`/`other`); no admite funciones en ningún nivel. Las props de `HeaderNav`, formularios, botones y sugerencias usan fragmentos de ese contrato, nunca el tipo completo del catálogo.
- Textos dinámicos conocidos al renderizar se resuelven en servidor. Para valores que cambian en cliente (por ejemplo, nombre aceptado de competidor o límite activo), enviar plantillas con parámetros tipados y usar un interpolador pequeño y puro `src/i18n/client-format.ts`; los plurales se seleccionan con `Intl.PluralRules(locale)`. Ese módulo no importa catálogos ni APIs de petición.
- Ningún import transitivo desde componentes cliente debe arrastrar catálogos completos o APIs de petición; revisar especialmente módulos de presentación/status reutilizados. Las nuevas pruebas de tipo rechazan un fragmento con función; las pruebas de ejecución comprueban variables/plurales en ambos idiomas. Build y navegador verifican ausencia de errores RSC, incluida la interacción de sugerencias.

## Contrato de hallazgos

- API nueva: `findingText(finding, locale, context?)` devuelve `{ title, recommendation, fallback }`. `context` contiene exclusivamente los `facts` y `rulesVersion` guardados de la auditoría correspondiente; nunca datos de una auditoría más reciente ni nuevas capturas.
- En `es`, devuelve exactamente `finding.title` y `finding.recommendation` almacenados (`fallback=false`); no reescribe auditorías históricas. Al producir nuevos hallazgos, `evaluateAudit` sigue generando los mismos objetos españoles que antes usando las plantillas del catálogo.
- En `en`, reglas estáticas conocidas usan el catálogo. Para títulos dinámicos y variantes, un adaptador tipado obtiene los parámetros de los facts guardados de una versión soportada (inicialmente `2026-10-26.1`). Debe comprobar disponibilidad/tipo de cada valor: ausencia no equivale a cero.

| Regla o variante | Datos históricos para el título |
|---|---|
| `page_http_error` | `facts.page.result.status` cuando la página fue obtenida |
| `redirect_chain` | Longitud de `facts.page.result.redirects` |
| `canonical_multiple` | `facts.page.result.facts.canonicalCount` |
| `title_too_long`, `title_too_short`, `title_multiple` | `titleLength` / `titleCount` de los facts HTML |
| `description_length`, `description_multiple` | `metaDescriptionLength` / `metaDescriptionCount` de los facts HTML |
| `h1_multiple` | `headingCounts.h1` de los facts HTML |
| `lcp_slow` | `facts.performance.metrics.lcpMs`, con formato del idioma solicitado |
| `not_https` | `facts.httpsFailure`: variante fallo de HTTPS frente a ausencia de HTTPS; solo con contexto conocido |

- Si el `ruleId` es desconocido, falta contexto para una regla dinámica/variante o la versión no está soportada, devolver ambos textos guardados con `fallback=true`. No extraer parámetros mediante regex del título/evidencia ni inventar valores. La vista inglesa avisa una vez si presenta textos originales por fallback.
- T005 fija un corpus de regresión ANTES de extraer textos de `rules.ts`: fixtures que cubran todos los ids emitibles, ambas variantes de `not_https` y valores representativos de los diez títulos dinámicos. Guardar salidas completas de la implementación previa (título, recomendación, evidencia, severidad, categoría y orden) como expectativas independientes del catálogo nuevo; comparar por igualdad exacta después de la extracción. Las pruebas existentes siguen intactas.
- La completitud se verifica contra el inventario real de ids y variantes del corpus contrastado con `rules.ts` (43 ids únicos en la revisión inicial), nunca por el número fijo «44». Las páginas de auditoría y los resúmenes/detalles pasan el contexto de su auditoría; los módulos puros reciben ese contexto por argumento, sin E/S adicional.

## Límites de localización e inventario

- Textos propios de interfaz, atributos accesibles, validaciones, metadatos y formatos se localizan. Son excepciones declaradas: contenido del usuario/proveedor, plantillas de preguntas del mercado, evidencia original, fallback de hallazgos, logs/nombres técnicos y artefactos HTML/PDF no localizados. Si T001 valida el 404 bilingüe, sus bloques llevan `lang="es"` y `lang="en"`; es una excepción explícita de AC-001.
- Cada vista que muestra evidencia o hallazgos en fallback incluye, en inglés, un aviso único de texto original. El contenido de usuario/proveedor no se considera una cadena de interfaz pendiente de traducir.
- Buscar acentos, textos españoles sin acentos y formatos directos sirve como inventario auxiliar con `rg`, no como prueba de idioma ni criterio automático de cero coincidencias. Registrar cada coincidencia revisada por archivo, categoría y justificación en doc 18. Se permiten comentarios españoles y evidencias preservadas en `rules.ts`; no se permite esconder textos de interfaz entre las excepciones.
- T004–T007 revisan solo sus archivos ya migrados; no exigen que una tarea posterior esté terminada. T008 revisa todo `src` y las cadenas renderizadas con casos de datos/errores en ambos idiomas. El inventario distingue constantes de formato o normalización de datos de los formatos visibles.
- Search Console (D019): las búsquedas, URLs y propiedad que devuelve Google son contenido del proveedor y se muestran como se guardaron. El resto de la sección es interfaz y se traduce, incluida la explicación de cada fallo por su `errorKind`; el `errorMessage` guardado no se muestra (enmienda de D019).

## Functional requirements

- FR-001: `src/i18n/` con `Locale`, `SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `resolveLocale`, `getLocale` (servidor), `getMessages`, `format.ts` y catálogos `es`/`en` tipados; sin dependencias nuevas.
- FR-002: Server action `setLocaleAction(formData)` que valida el valor contra `SUPPORTED_LOCALES`, guarda la cookie según el apartado 2 y revalida el layout; valores inválidos se ignoran sin error visible.
- FR-003: Cabecera fija según apartados 4 y 5, con enlace para saltar al contenido, navegación con estado activo y selector de idioma.
- FR-004: Layout raíz con `<html lang>` dinámico, `generateMetadata` localizado e `instant = false`; `main` con `id="contenido"`.
- FR-005: Todas las páginas y componentes de `src/app` y `src/components` toman sus textos del catálogo (incluidas `not-found`, `page-loading`, `system-status`, gráficas y tablas accesibles).
- FR-006: Módulos puros y esquemas zod con `locale` opcional por defecto `"es"` según apartado 7; salida idéntica a la actual con el valor por defecto.
- FR-007: Catálogo de hallazgos para todos los ids, parámetros y variantes del inventario real, con cobertura en ambos idiomas y regresión de salida española completa contra el corpus previo independiente; `RULES_VERSION` no cambia.
- FR-008: `findingText(finding, locale, context?)` según el contrato de hallazgos; evidencia y fallback originales con aviso único por vista en inglés.
- FR-009: Formateadores de interfaz centralizados. Los literales de locale fuera de `src/i18n/` se registran y justifican por uso (informe, evidencia preservada, fetcher o normalización de datos); no queda formato visible de interfaz fijado al idioma español fuera del módulo i18n.
- FR-010: Sin nuevas dependencias, migraciones, cambios de `RULES_VERSION`, cambios en `src/modules/reports/` ni en rutas/URLs; `src/proxy.ts` y `src/modules/routing/` sin cambios de comportamiento.
- FR-011: Sección y tarjeta de Search Console según el apartado 12: textos del catálogo en ambos idiomas, formatos por idioma y motivos de configuración traducidos por código; sin cambios en captura, datos ni esquema.

## Non-functional requirements

- Performance: sin nuevas fronteras cliente salvo el componente hoja `HeaderNav`; selector y resto de cabecera siguen siendo de servidor. Se admite el pequeño interpolador en los componentes cliente existentes y sus props serializables; catálogos completos y funciones permanecen en servidor. Revalidar el layout al cambiar idioma no dispara lecturas externas (PageSpeed, DataForSEO).
- Security: la cookie solo admite valores de `SUPPORTED_LOCALES`; `httpOnly`, `sameSite=lax`, `secure` en producción; el server action no recibe URL de retorno (se renderiza la misma página), así que no hay redirección abierta. El valor de `Accept-Language` solo se compara, nunca se refleja en HTML.
- Observability: ninguna nueva. Un valor de cookie inválido se trata como ausencia, sin log.
- Maintainability: una sola fuente de tipos para los mensajes; la ausencia de una clave en inglés rompe `npm run typecheck`; prueba de completitud de reglas; textos variables por funciones del catálogo en servidor o plantillas tipadas en cliente; sin concatenaciones de frases traducibles en las vistas.

## API / Interface changes

- Nuevo server action `setLocaleAction` (`src/app/actions/locale.ts` o `src/i18n/actions.ts`).
- `AppHeader` pasa a recibir `locale` y mensajes; nuevo componente cliente `HeaderNav` (enlaces con estado activo) y componente `LanguageSwitcher` (servidor, formulario).
- Firmas de funciones puras: parámetro opcional `locale` añadido al final; sin cambios de tipo en lo que ya devuelven.
- Sin endpoints HTTP nuevos ni cambios de URL.

## Data model changes

Ninguno, tampoco en `search_console_snapshots` (D019). Los hallazgos guardados no se migran: al mostrar se utiliza su `ruleId` y, cuando hace falta, los facts/versiones ya almacenados de esa auditoría. Sin contexto suficiente se conserva el texto original con aviso.

## Edge cases

- Cookie con valor no soportado o manipulado → se ignora y se negocia con `Accept-Language`.
- `Accept-Language` ausente/vacío o sin entradas seleccionables (incluido `*` solo) → `es`; un comodín no anula otras entradas soportadas válidas.
- `Accept-Language: en-US,en;q=0.9,es;q=0.8` → `en`; `es-ES,en;q=0.9` → `en` no, `es` sí; `fr` → `es`.
- Hallazgo desconocido o dinámico sin contexto suficiente/versión soportada → texto guardado, `fallback=true` y aviso único en la vista inglesa.
- Cambio de idioma en una página con formulario a medio rellenar: el formulario se vuelve a renderizar con los valores iniciales; se documenta como límite conocido (sin JavaScript no se puede conservar lo escrito).
- Cambio de idioma en `/_not-found`: la página sigue respondiendo 404 (proxy sin cambios). Límite conocido (D021): en la 404 dentro de una empresa (`/workspaces/<id inexistente>/…`), sin JavaScript, la respuesta al POST es 404 y guarda la cookie, pero llega en blanco; al volver a cargar la página aparece en el nuevo idioma. La 404 general del sitio no tiene este límite.
- Plurales: «Datos de hace 1 día» / «1 day old»; «de 1 pregunta» / «of 1 question».
- Cambio de idioma con JavaScript deshabilitado: el formulario envía por POST y la página vuelve en el nuevo idioma, salvo en la 404 de una empresa (límite conocido, D021).
- Lector de pantalla: los botones «ES»/«EN» se anuncian con su nombre completo en su propio idioma (`lang`).
- Anclajes a hallazgos desde oportunidades: el título del hallazgo queda visible debajo de la cabecera, no tapado.

## Acceptance criteria

- AC-001: Con cookie `locale=en`, `<html lang="en">` y textos propios de interfaz ingleses; con `es` o negociación española, interfaz española. El implementador revisa DOM visible/accesible y capturas de las rutas inventariadas en T008. Las únicas excepciones son las de «Límites de localización», identificadas en doc 18; el 404 bilingüe solo se acepta con evidencia de T001 y atributos `lang` en sus bloques.
- AC-002: Pulsar «EN» en la cabecera guarda la cookie con los atributos del apartado 2 y la misma URL se muestra en inglés sin redirección; «ES» revierte. Funciona con JavaScript deshabilitado, salvo el límite conocido de la 404 de una empresa (D021).
- AC-003: `resolveLocale` cubre todos los ejemplos del «Contrato de resolución de idioma» y «Edge cases»: pesos, `q=0`, empates por orden, regiones/mayúsculas, duplicados, entradas malformadas, comodines y prioridad de cookie. Una cookie inválida no gana a la negociación.
- AC-004: La cabecera permanece visible al desplazarse en `/workspaces/[id]/seo` y `/geo` a 1280 y 375 px; el primer Tab muestra el enlace para saltar al contenido y Enter lleva el foco a `main`; ningún elemento enfocado queda oculto bajo la cabecera al navegar con Tab en una página larga.
- AC-005: El enlace activo de la cabecera lleva `aria-current="page"` según las reglas del apartado 5 en `/`, `/workspaces`, `/workspaces/new` y `/workspaces/[id]/geo`; a 375 px la cabecera no desborda y mantiene el nombre de la marca para lectores de pantalla.
- AC-006: Selector con dos botones de ≥ 36 × 36 px, `aria-current="true"` en el activo, atributos `lang` correctos y nombres accesibles «Español»/«English»; foco visible en ambos.
- AC-007: `npm run typecheck` falla si se elimina cualquier clave de `messages/en.ts` (comprobación manual registrada) y una prueba unitaria recorre ambos catálogos y falla ante cadenas vacías.
- AC-008: Todos los ids emitibles y variantes del inventario real tienen plantillas `es`/`en`. Un corpus capturado antes de la extracción compara por igualdad exacta los objetos completos producidos por `evaluateAudit`; las pruebas existentes permanecen intactas y `RULES_VERSION` sigue en `2026-10-26.1`. El corpus cubre los diez títulos dinámicos y ambas variantes de `not_https`.
- AC-009: Auditoría, overview, SEO, rendimiento y oportunidades traducen hallazgos conocidos preservando parámetros históricos (503, número de redirecciones/canonicals/encabezados, longitudes y LCP). Probar `not_https` con/sin fallo TLS. Contexto ausente, versión no soportada o regla desconocida devuelve textos guardados sin inventar valores; cada vista inglesa que muestra fallback/evidencia tiene un aviso único. En `es`, el adaptador conserva los textos almacenados exactamente.
- AC-010: Enviar un formulario inválido (empresa sin nombre, respuesta de competidores vacía) con `locale=en` devuelve los mensajes en inglés conservando lo escrito; con `locale=es`, los mensajes actuales.
- AC-011: Fechas y números en inglés usan `en-GB` (ej. «27 Oct 2026», «1,234.5») y en español `es-ES` con su agrupamiento por defecto («27 oct 2026», «1234,5», «12.345»), igual que la salida actual (D020); zona horaria inalterada. Inventario revisado de usos directos de locale distingue formatos de interfaz (centralizados) de evidencia, informes, fetcher y normalización (preservados/justificados), según «Límites de localización»; no exige cero coincidencias de búsqueda.
- AC-012: Las pruebas unitarias e integración existentes pasan sin cambios en sus aserciones de texto español (los parámetros `locale` tienen valor por defecto `"es"`).
- AC-013: `next build` termina en verde para el árbol completo con locale en el layout, incluidas páginas no bloqueantes y `/_not-found`; con `next start`, probar GET/HEAD de id inexistente con cookies `es`/`en` y sin cookie (404), y `/`, `/workspaces`, `/workspaces/new` (200). Registrar también `<html lang>` y cuerpo de cada respuesta; si se usa 404 bilingüe, probar que el layout sigue resolviendo el idioma y el build sigue verde. Si el layout falla, T001 no se cumple ni se continúa T002–T008 hasta resolverlo con una decisión revisada.
- AC-014: `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:integration` y `npm run build` en verde.
- AC-015: El propietario del proyecto revisa la copia inglesa de cabecera, inicio, lista de empresas, overview y detalle SEO con capturas y registra correcciones en la doc 18; sin esta revisión la feature no se cierra. Tras D019, la revisión de overview y detalle SEO se repite con la sección de Search Console presente.
- AC-016: El diff no toca `src/modules/reports/`, `src/proxy.ts`, `src/modules/routing/`, esquemas Drizzle ni `package.json`; no cambia ninguna URL. Tras D019 se juzga el cambio propio de 003 respecto a `acba536` (PR #1 es otra feature); 003 tampoco modifica la captura, la API, la credencial, el esquema ni la migración de Search Console.

- AC-017: Los fragmentos `ClientMessages` rechazan funciones anidadas mediante prueba de tipos; el interpolador y los plurales resuelven parámetros dinámicos en ambos idiomas sin importar catálogos. Build y prueba en navegador de formularios/sugerencias confirman que no se serializan funciones normales ni se llama a una Server Function para traducir. Ningún catálogo completo llega al cliente.
- AC-018: Con `locale=en`, la sección de Search Console del detalle SEO, en cada uno de sus estados, su descripción, el botón de refresco y sus errores, y la línea de la tarjeta SEO del overview muestran textos ingleses y formatos `en-GB`; con `es` o sin cookie, exactamente los textos y formatos actuales, salvo los textos de fallo de `api_disabled`, `invalid_credentials`, `quota_exceeded` y el error genérico, que pasan a frases de catálogo sin el `errorMessage` guardado. Las pruebas de `tests/unit/search-console/` pasan sin cambiar sus aserciones, salvo las dos adaptadas al motivo por código y al texto de fallo por tipo; pruebas nuevas cubren el inglés (enmienda de D019).

## Source of Truth Matrix

| Concepto | Fuente de verdad | Documentos dependientes |
|---|---|---|
| Resolución de idioma, parámetros, excepciones y criterios | SPEC.md | PLAN, TASKS, pruebas |
| Decisiones, dependencia de 002 y contingencia de build | DECISIONS.md | SPEC, PLAN, TASKS |
| Firmas y archivos nuevos | PLAN.md y contratos de SPEC | TASKS, implementación |
| Evidencia de pruebas y revisión humana | doc 18 una vez ejecutadas | TASKS, revisión/cierre |

## Test scenarios

- Unit: `resolveLocale` (cookie válida/inválida, negociación, ausencia); completitud y no vacíos de catálogos; cobertura de reglas en `findings`; `findingText` con parámetros/variantes, contexto ausente o incompatible y regla desconocida; corpus previo completo de hallazgos; props cliente sin funciones y plantillas/plurales; formateadores por idioma; `staleInfo` y `fraction` en `en`; esquemas zod con `locale: "en"`.
- Integration: ninguna nueva obligatoria (no hay cambios de datos). Opcional: una prueba que ejecute un server action de validación con `locale=en` si la infraestructura lo permite sin simular `cookies()`.
- E2E: no hay suite E2E en el proyecto; se sustituye por verificación en navegador con `playwright-core` como en 002 (capturas 1280/375, ambos idiomas).
- Unit (D019): `summarizeSearchConsole` y `displayDay` en inglés para los cinco estados, cambios y plurales; motivos de configuración por código.
- Manual: AC-004, AC-005, AC-006, AC-013, AC-015, AC-018; cambio de idioma con JavaScript deshabilitado; lector de pantalla (VoiceOver) anunciando el selector.

## Assumptions

- El inglés usa `en-GB` para fechas y números (contexto europeo, fecha día-mes-año). Reversible cambiando una constante.
- El idioma es una preferencia del navegador (cookie), no un atributo de la empresa ni del usuario: no hay usuarios hasta la Fase 5.
- El layout raíz bloqueante es aceptable: las rutas con datos ya son bloqueantes (`instant = false`) y la herramienta es privada; se pierde el shell estático de `/`, `/workspaces` y `/workspaces/new`.
- La copia inglesa la redacta el implementador y la revisa el propietario (AC-015); no hay traductor externo.
- El trabajo de 002 sin commitear se consolida antes de empezar a implementar 003 (ver PLAN «Dependencies»); 003 edita muchos de los mismos archivos.

## Open questions

**Cierre (2026-10-28):** todas resueltas. D011: Resolved, acreditada en `425e23b`. T001 como puerta técnica: Resolved, superada con la variante de D016. Revisión humana de AC-015: Resolved, conforme para las cinco vistas (doc 18 §10 y §11.4). Seguimientos fuera de alcance en doc 18 §14.

Sin decisiones de producto abiertas. D011 quedó acreditada el 2026-10-27 al consolidar 002 en `425e23b` (doc 18 §1). T001 es puerta técnica para demostrar el árbol completo, no una garantía anticipada; si falla el layout raíz, se detiene la implementación posterior y se revisa D016. La revisión humana de AC-015 es requisito de cierre, no de inicio.

## Contracted services

Contracted services not declared → all billable add-ons treated as NOT contracted (conservative default). Run `/project-init` to declare them. Esta feature no añade llamadas a servicios de pago.

## Reviews required

- Frontend y QA: cabecera, foco, contraste, 375 px, estados activos, selector sin JavaScript.
- Backend/lógica: server action, cookie, resolución de idioma, fallback de hallazgos.
- Seguridad: valores de cookie, ausencia de redirección abierta, `Accept-Language` no reflejado.
- Acceso a datos: comprobar que el contexto de traducción usa facts/versiones de la misma auditoría y empresa, sin nuevas consultas/capturas ni migraciones. Revisión del contrato del nuevo server action, su validación y props serializables; no hay endpoints nuevos.
- Rendimiento: impacto del layout por petición y ausencia de catálogos completos en el bundle cliente.
