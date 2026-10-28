# Decisions: Interfaz bilingüe con cabecera fija

### D001 - Idioma por cookie leída en el layout raíz, no por segmento `[lang]` en la URL

**Date:** 2026-10-27 · **Status:** Accepted

**Context:** Next 16.4 recomienda `app/[lang]/` + `next/root-params` para i18n, que con `cacheComponents` mantiene `<html lang>` estático. Aquí eso obligaría a mover las 20 rutas bajo `[lang]`, reescribir 18 `href`, 12 `revalidatePath`, 4 `redirect`, el matcher y el parser de `src/proxy.ts`, sus pruebas y la doc 17, y cambiaría todas las URLs. La herramienta es privada y `noindex`: las URLs por idioma no aportan SEO. Leer `cookies()` en el layout raíz es «runtime data» y, con `cacheComponents`, requiere o `Suspense` (imposible para `<html lang>`, lo dice la propia documentación) o `export const instant = false` en el layout («Opt the layout out»).

**Decision:** Cookie `locale` + `instant = false` en `src/app/layout.tsx`. `<html lang>` se calcula por petición. Sin cambios de URL ni de proxy.

**Consequences:** El alcance de prerenderizado se comprobará en T001: `instant = false` exime de validación, no desactiva por sí solo todo prerenderizado. D016 condiciona el avance a que el árbol completo compile. Si la herramienta expone páginas públicas con SEO (Fase 5+), se revisará el prefijo de idioma como feature aparte. Alternativa descartada: script pre-pintado que fija `lang` desde la cookie con `suppressHydrationWarning` (introduce JavaScript y un parpadeo de idioma).

### D002 - Diseño de la cabecera a partir de `ui-ux-pro-max`; se adoptan reglas, no paleta ni tipografía

**Date:** 2026-10-27 · **Status:** Accepted

**Context:** El encargo pide diseñar la cabecera con el skill. Consultas ejecutadas (`scripts/search.py`): `--design-system "SEO visibility analytics SaaS dashboard for small business"`; `--domain ux` «sticky header navigation top bar», «navigation active state current page», «mobile navigation menu touch target», «focus visible keyboard skip link», «language switcher locale selector» (sin resultado específico); `--stack nextjs` «layout header navigation server component» e «i18n» (sin resultado); `--domain icons` «language globe translate».

**Decision:** Reglas adoptadas en la SPEC (apartados 4 y 5): la navegación fija no debe tapar contenido (compensación con `scroll-padding-top`, WCAG 2.2 2.4.11 Focus Not Obscured); estado activo visible en el elemento actual; enlace para saltar al contenido; foco visible en todo control; objetivos táctiles con separación ≥ 8 px y tamaño por encima del mínimo WCAG de 24 px; componentes cliente empujados a las hojas (`HeaderNav` es el único cliente); `next/link` para toda navegación interna; transiciones 150–300 ms y `prefers-reduced-motion`; icono SVG (Lucide) con texto visible, nunca emoji ni icono solo. La propuesta del skill de paleta (azul corporativo / ámbar) y tipografía (Fira) **se rechaza**: el proyecto ya tiene un sistema de tokens (`globals.css`, marca violeta, Geist, semáforo de estados) documentado en la doc 17, y cambiarlo está fuera del alcance.

**Consequences:** La cabecera reutiliza el subrayado de `WorkspaceNav` y los tokens existentes; la verificación de T008 comprueba las reglas adoptadas una a una.

### D003 - Español por defecto; negociación con `Accept-Language` solo sin cookie; inglés con formatos `en-GB`

**Date:** 2026-10-27 · **Status:** Superseded por D013. Registro histórico; aplicar la decisión nueva.

**Decision:** `DEFAULT_LOCALE = "es"`. Sin cookie se elige `en` únicamente si el inglés precede al español en `Accept-Language`; cualquier otro caso da `es`. En inglés, `Intl` usa `en-GB` (día-mes-año, coma decimal al estilo británico, sin ambigüedad `01/02/03`). Zona horaria sin cambios (`Europe/Madrid` donde ya se fija).

**Consequences:** Un navegador en inglés recibe inglés desde la primera visita sin tocar nada; el cambio manual gana siempre. Cambiar `en-GB` por `en-US` es una constante.

### D004 - Páginas no bloqueantes y `/_not-found`: verificación en T001 con contingencia

**Date:** 2026-10-27 · **Status:** Superseded por D016. Registro histórico; aplicar la decisión nueva.

**Context:** `instant = false` en el layout exime al layout, pero «los segmentos descendientes siguen validándose». `/`, `/workspaces`, `/workspaces/new` no son bloqueantes y `not-found.tsx` es la ruta sintética `/_not-found`, que hereda el layout raíz.

**Decision:** T001 construye un spike con la cookie leída en el layout, en una página no bloqueante y en `not-found.tsx`, y ejecuta `next build` + `next start`. Según el resultado: (a) las páginas leen el idioma y exportan `instant = false`, o (b) lo leen dentro de un `Suspense` existente/nuevo. Si `/_not-found` no puede leer la cookie con el build en verde, la página global de 404 muestra ambos idiomas apilados (español primero) y se anota como límite.

**Consequences:** La decisión final se registra aquí con la evidencia del spike antes de T003.

### D005 - Hallazgos traducidos al mostrar por `ruleId`; la evidencia no se traduce; `RULES_VERSION` no cambia

**Date:** 2026-10-27 · **Status:** Superseded por D014. Registro histórico; aplicar la decisión nueva.

**Context:** `audit_findings` guarda `title`, `evidence[]` y `recommendation` en español en el momento de la auditoría. Traducir lo guardado con una migración o cambiar el formato de almacenamiento (claves + parámetros) tocaría esquema y reglas, y dejaría auditorías históricas en dos formatos.

**Decision:** Catálogo `findings` por `ruleId` en ambos idiomas, consumido por `rules.ts` para `es` (misma salida, pruebas intactas) y por `findingText(finding, locale)` al mostrar, con fallback al texto guardado si el `ruleId` ya no existe. La evidencia (valores observados con etiquetas en español, p. ej. «CLS de laboratorio: 0,2») se muestra como se guardó y el detalle en inglés lo avisa una vez.

**Consequences:** Sin migración ni cambio de versión de reglas. Límite declarado: evidencia en español en la interfaz inglesa. Traducir la evidencia exige guardar evidencia estructurada; queda para una feature futura si hace falta.

### D006 - El informe HTML/PDF queda fuera

**Date:** 2026-10-27 · **Status:** Accepted

**Decision:** `src/modules/reports/*` no se toca. El informe es un artefacto guardado, con pruebas byte a byte del PDF y una plantilla propia; localizarlo requiere decidir el idioma al generarlo y guardarlo. Se recomienda como feature siguiente («Informe en inglés»).

### D007 - Los módulos puros aceptan `locale` opcional (por defecto `"es"`) en lugar de devolver claves

**Date:** 2026-10-27 · **Status:** Accepted

**Context:** Devolver claves y traducir en los componentes obligaría a reescribir `overview/*` (devuelve `text` listo para pintar) y las 27 suites que afirman textos españoles.

**Decision:** Parámetro `locale` al final con valor por defecto `DEFAULT_LOCALE`; los esquemas zod con mensajes se construyen por fábrica (`schemaFor(locale)`) manteniendo una exportación por defecto en español. Las pruebas existentes no cambian; las nuevas prueban `"en"`.

**Consequences:** Firmas ligeramente más largas; frases variables se resuelven con funciones del catálogo en servidor o plantillas cliente tipadas según D015, sin concatenaciones traducibles en las vistas.

### D008 - Los componentes cliente reciben fragmentos de mensajes por props

**Date:** 2026-10-27 · **Status:** Superseded por D015. Registro histórico; aplicar la decisión nueva.

**Decision:** `workspace-form`, `geo-forms`, `competitor-suggestions`, `run-audit-button`, `generate-report-button` y `HeaderNav` reciben un objeto tipado con sus etiquetas desde el componente de servidor padre. Ningún componente cliente lee cookies ni importa los catálogos completos.

**Consequences:** Sin catálogo en el bundle del cliente; props algo más largas.

### D009 - Catálogos en TypeScript tipados, no JSON

**Date:** 2026-10-27 · **Status:** Superseded por D015. Registro histórico; aplicar la decisión nueva.

**Decision:** `messages/es.ts` define el tipo `Messages` por inferencia; `messages/en.ts` lo satisface (`satisfies Messages`). Mensajes con variables como funciones (`(days: number) => string`), plurales con `Intl.PluralRules`. Una clave ausente o de tipo distinto rompe `typecheck`; una prueba recorre ambos catálogos para detectar cadenas vacías.

### D010 - Sin menú desplegable; marca solo icono en móvil

**Date:** 2026-10-27 · **Status:** Accepted

**Decision:** Con dos entradas de navegación, un menú hamburguesa escondería contenido y añadiría estado cliente. A < 640 px el nombre «Visibility Platform» pasa a `sr-only` y el icono conserva el enlace a inicio; nav y selector siguen visibles en una fila.

### D011 - 003 se implementa después de consolidar el árbol de trabajo de 002

**Date:** 2026-10-27 · **Status:** Accepted

**Context:** El árbol tiene 12 archivos modificados y 14 sin seguimiento de 002 (overview, páginas, header). 003 edita muchos de esos archivos.

**Decision:** Antes de T001 se commitea (o se cierra) el trabajo de 002, incluida la decisión sobre su T007 pendiente. Este plan no modifica 002.

### D012 - Planificación sin `specs/CONSTITUTION.md`

**Date:** 2026-10-27 · **Status:** Accepted

**Context:** El flujo `/sdd` exige `specs/CONSTITUTION.md` y pide detenerse si falta. El proyecto no lo tiene y, aun así, las features 001 y 002 se especificaron, planificaron y cerraron con este mismo flujo.

**Decision:** Se continúa aplicando las convenciones observables en 001/002 (formato de documentos, `Verify:` por tarea, doc de producto en `docs/visibility-mvp/`). Se recomienda ejecutar `/project-init` cuando el propietario tenga veinte minutos para la entrevista; no bloquea esta feature.

### D013 - Negociación ponderada y determinista de idioma

**Date:** 2026-10-27 · **Status:** Accepted

**Context:** D003 no definía pesos, exclusiones ni entradas malformadas; su descripción de coma decimal para `en-GB` era incorrecta.

**Decision:** Sustituye D003. Aplicar el «Contrato de resolución de idioma» de SPEC: cookie válida primero, mayor q seleccionable después, empate por orden original, q=0 excluido y fallback es si no hay coincidencias. Inglés usa `en-GB`: `1,234.5` y fecha día-mes-año; español `1.234,5`. Zona horaria conservada.

**Consequences:** T002 incorpora todos los ejemplos ponderados y formatos; no se añade detección geográfica ni dependencia.

### D014 - Hallazgos parametrizados con contexto histórico y regresión completa

**Date:** 2026-10-27 · **Status:** Accepted

**Context:** Hay diez títulos dinámicos y variantes bajo un mismo id. `ruleId` por sí solo no permite recuperar el valor ni elegir la variante. El inventario inicial contiene 43 ids únicos, no un contrato fijo de 44 pares estáticos.

**Decision:** Sustituye D005. Aplicar «Contrato de hallazgos» de SPEC. Nueva API `findingText(finding, locale, context?)` devuelve título, recomendación y bandera fallback. El contexto son facts/rulesVersion de esa misma auditoría; sin parámetros o versión soportada se preservan los textos con aviso. No se analiza prosa ni se migra almacenamiento. En español el adaptador preserva el texto guardado; `evaluateAudit` usa plantillas españolas con salida idéntica.

**Consequences:** T005 captura antes de la extracción un corpus de salidas completas independiente del catálogo nuevo, con todos los ids y variantes; T006 pasa contexto a resúmenes/detalles sin E/S nueva. Las pruebas originales y RULES_VERSION permanecen intactas. El aviso de evidencia/fallback es único por cada vista que los muestra en inglés.

### D015 - Frontera serializable y plantillas cliente acotadas

**Date:** 2026-10-27 · **Status:** Accepted

**Context:** D008/D009 permitían interpretar que los fragmentos enviados al cliente incluían funciones del catálogo; React no serializa funciones normales entre servidor y cliente.

**Decision:** Sustituye D008 y D009. Catálogos TypeScript completos y funciones en servidor. El tipo Messages deriva de la forma del catálogo español, con hojas string y firmas de funciones que permiten traducciones distintas (sin fijar los literales españoles como valores obligatorios). `en.ts` satisface ese contrato. Props cliente solo con `ClientMessages` serializable; textos dinámicos de cliente mediante plantillas tipadas y `client-format.ts`, sin APIs de petición ni importación de catálogos.

**Consequences:** Se admite el pequeño interpolador en los componentes cliente existentes; HeaderNav es la única frontera cliente nueva. T002 define/prueba los tipos y plantillas; T003/T004/T007 verifican serialización real en build/navegador. Nunca convertir una función de traducción en Server Function para sortear esta frontera.

### D016 - Spike obligatorio del árbol completo, incluido el layout raíz

**Date:** 2026-10-27 · **Status:** Accepted

**Context:** Un 404 bilingüe en `not-found.tsx` no elimina una lectura de cookie que falle en su layout raíz.

**Decision:** Sustituye D004. T001 debe demostrar `next build` y GET/HEAD con `next start`, en el árbol completo con el layout que resuelve locale, páginas públicas actuales y ruta sintética de 404. Se prueba cookie es/en y ausencia; no basta con códigos HTTP: registrar también lang y cuerpo. La variante de páginas (`instant = false` o Suspense) se decide con evidencia. El 404 bilingüe solo es contingencia válida si ese árbol completo compila, devuelve 404 y sus bloques tienen lang propios. Si el fallo está en el layout y no hay solución dentro del contrato, T001 queda pendiente y T002–T008 no comienzan: registrar el fallo y revisar esta decisión antes de continuar.

**Consequences:** La arquitectura D001 sigue siendo el objetivo, no un éxito demostrado. La evidencia de T001 se adjunta a esta decisión y doc 18 sin cambiar el significado histórico de D004. No se altera el proxy ni se introduce script de idioma como salida silenciosa.

**Evidencia T001 (2026-10-27):** Variante elegida: **(a) sin `instant = false` en las páginas**. Basta el `instant = false` del layout raíz: `next build` termina con código 0 y clasifica `/`, `/_not-found`, `/workspaces` y `/workspaces/new` como dinámicas (ƒ, «server-rendered on demand»); las rutas `/workspaces/[id]/**` siguen en prerenderizado parcial (◐). `getLocale()` (cookie, T001; negociación en T002) se lee en el layout, en las tres páginas no bloqueantes (`/workspaces` dentro de su `Suspense`) y en `not-found.tsx`. Con `next start` (puerto 3105), las 16 combinaciones de {sin cookie, `es`, `en`, `xx`} × {`/`, `/workspaces`, `/workspaces/new`, id inexistente} devuelven 200/200/200/404 en GET y HEAD; `<html lang>` y `data-locale` siguen la cookie (`en` → `en`; sin cookie o `xx` → `es`) también en el 404, que mantiene `x-middleware-rewrite: /_not-found`. En el servidor de desarrollo, la navegación cliente `/` → `/workspaces` → `/workspaces/new` no produce errores de validación de navegación instantánea en consola. El 404 bilingüe no hace falta. Matriz, cabeceras HEAD y script en `docs/visibility-mvp/assets/18-i18n/`. Sin asiento de prueba unitaria: el comportamiento es del build y del servidor; la evidencia es la ejecución registrada.

### D017 - Inventario de cadenas con excepciones y verificación renderizada

**Date:** 2026-10-27 · **Status:** Accepted

**Decision:** Adoptar «Límites de localización e inventario» de SPEC. Las búsquedas con rg de acentos, palabras sin acentos y formatos directos orientan la revisión; no prueban ausencia de español. Cada coincidencia de un área migrada se clasifica (interfaz a corregir, contenido original, comentario, log o formato no visible). T008 revisa DOM visible/accesible en las rutas y errores inventariados. Las excepciones de evidencia/fallback/404 bilingüe son explícitas y no permiten dejar UI sin traducir.

**Consequences:** Se retiran verificaciones imposibles de cero coincidencias y se limita cada tarea a sus propios archivos. Doc 18 conserva el inventario y evidencia de revisión. No se traduce la evidencia ni se cambia el mercado de las preguntas GEO.

### D018 - Corrección documental tras auditoría de preparación

**Date:** 2026-10-27 · **Status:** Accepted

**Context:** La auditoría encontró contratos incompletos para parámetros de hallazgos, funciones en props, negociación de idioma y criterios de cadenas; el informe anterior declaraba ausencia de contradicciones.

**Decision:** Se sincronizan SPEC, PLAN y TASKS con D013–D017, se añade AC-017 y se reejecuta spec-analyze. Se conserva Status Ready; esta corrección no implementa ni valida i18n y no consolida 002.

**Consequences:** T001–T008 revisadas, todas pendientes. D011 sigue vigente: antes de T001 se acredita la consolidación de 002 y la decisión humana sobre su cierre pendiente; esta petición no autoriza commits automáticos ni cerrar 002. Sin cambios de aplicación, migraciones o dependencias. La preparación documental puede quedar resuelta mientras el inicio sigue condicionado por D011.

### D019 - Spec updated: la traducción de Search Console entra en 003

**Date:** 2026-10-27

**Status:** Accepted

**Context:**

Con T001–T008 implementadas y sin commitear, se fusionó en `main` el PR #1 (`acba536`, feature `003-search-console`) mediante un `pull` con autostash. Ese PR añade, dentro de páginas que 003 ya había traducido, una sección y una línea de tarjeta con textos españoles fijos y formatos `es-ES`. `/spec-review` dio Partial (CONF-001): las vistas inglesas de overview y detalle SEO vuelven a mostrar español, y la revisión AC-015 y parte de la evidencia son anteriores a la fusión. El propietario pidió incluir su traducción en 003.

**Decision:**

- 003 traduce la interfaz de Search Console: apartado 12, FR-011 y AC-018 nuevos.
- AC-015 se repite para overview y detalle SEO.
- AC-016 se juzga sobre el cambio propio de 003 respecto a `acba536`.
- Son contenido del proveedor, mostrado como se guardó: las búsquedas, las páginas, la propiedad y el `errorMessage` de los intentos fallidos.
- Los motivos de configuración no válida pasan a identificarse por código para poder traducirlos. No cambia la validación de la credencial ni ningún dato.
- Se añaden T009 (Search Console) y T010 (correcciones CONF-004 a CONF-009), y T008 se reabre.
- No cambian: la captura ni la API de Google, el esquema `search_console_snapshots`, la migración `0006`, ni la spec `003-search-console`.

**Reasoning:**

AC-001 exige que toda la interfaz propia esté en inglés con `locale=en`. Declarar Search Console como excepción dejaría español en dos de las cinco vistas de AC-015. El patrón de 003 cubre este caso sin decisiones nuevas de arquitectura: `locale` con `es` por defecto, textos del catálogo y fragmentos serializables.

**Consequences:**

- **T008** pasa a `[NEEDS REVIEW]`. Su evidencia de checks, matriz, inventario y capturas, y la conformidad AC-015 del 2026-10-27, son anteriores a la fusión y deben repetirse sobre el árbol fusionado.
- **T009 y T010** nuevas, pendientes. El orden es T009, luego T010, luego T008.
- **Sin sobreimplementación.** Ninguna tarea completada cubre criterios retirados.
- **Riesgo nuevo.** Commitear 003 mezclado con cambios ajenos del árbol: el `.gitignore` con la clave de servicio y la configuración de ESLint. Mitigación: commits separados (PLAN, «Risks»).

**Enmienda (2026-10-27, aceptada por el propietario):**

La implementación de T009 se apartó de esta decisión en dos puntos, y el propietario los aceptó en la conversación de implementación: «Acepto las dos desviaciones de Search Console».

- **Texto de fallo por tipo.** La explicación de un intento fallido sale del catálogo según su `errorKind`, en ambos idiomas. El `errorMessage` guardado deja de mostrarse y queda como diagnóstico interno. La salida española cambia para `api_disabled`, `invalid_credentials`, `quota_exceeded` y el error genérico; `no_access` sigue igual. Sustituye al punto que trataba el `errorMessage` como contenido del proveedor.
- **Dos aserciones adaptadas.** `credentials.test.ts` compara el motivo con su código en lugar de dos `expect` sobre la frase, y sigue comprobando que no aparece la clave privada. `summary.test.ts` pasa a «configuración no válida» un código en lugar de una frase. Las demás aserciones originales siguen intactas.

Razón: un `errorMessage` de Google no se puede traducir y mezclaba inglés técnico con la interfaz española; una frase por tipo es la misma en los dos idiomas y no expone respuestas crudas del proveedor. Consecuencias: apartado 12, límites de D017 y AC-018 de la SPEC y paso 6 del PLAN ajustados; T009 se marca hecha con esta enmienda como base.

### D020 - Salida española de formatos idéntica a `acba536`

**Date:** 2026-10-27

**Status:** Accepted

**Context:**

`/qa-review` encontró tres cambios en la salida española frente a `acba536`, contrarios a D007 y AC-018:

- El formateador común forzaba el agrupamiento (`useGrouping: "always"`). «1234» pasaba a «1.234» en toda la interfaz, cuando `toLocaleString("es-ES")` solo agrupa desde cinco cifras.
- Las variaciones de clics e impresiones de Search Console usaban el signo menos tipográfico («−25 %»). La base escribía guion y el entero sin formato («-25 %»).
- El panel de estado del inicio cambiaba fecha, zona horaria y latencia («27 oct 2026, 13:34» en Madrid y «1,2 s»). La base mostraba `toLocaleString("es-ES")` con la zona del servidor y `${latencyMs} ms`.

El ejemplo «1.234,5» de AC-011 contradecía D007.

**Decision:**

El propietario pidió restaurar la salida original en los tres puntos:

- `src/i18n/format.ts` usa el agrupamiento por defecto de cada locale.
- El signo de las variaciones de recuento sale del catálogo (`searchConsole.changes.signedPercent`): guion y entero sin formato en español, signo menos y número formateado en inglés. La variación de CTR conserva el signo menos, como en la base.
- El panel de estado usa `formatTimestamp` (formato y zona por defecto del entorno) y la latencia en milisegundos sin formato, en ambos idiomas.
- El ejemplo español de AC-011 pasa a «1234,5» y «12.345».
- La cabecera de la medición GEO vuelve a escribir «N repetición(es)» en español para cualquier número, como la base; en inglés elige singular o plural.

**Reasoning:**

D007 fija el español actual como referencia invariable. Ningún criterio pedía cambiar estos formatos, y el agrupamiento forzado alteraba números en vistas que 003 solo debía traducir.

**Consequences:**

- Pruebas nuevas que fijan la salida de la base: `tests/unit/search-console/summary.test.ts`, `tests/unit/i18n/format.test.ts`, `tests/unit/i18n/system-status.test.ts` (literales con `TZ=UTC`) y `tests/unit/geo/run-meta.test.ts`.
- En inglés, `en-GB` ya agrupa desde cuatro cifras, así que no cambia. Excepción: `formatMicros` (presupuesto GEO) conserva `useGrouping: "min2"`, que en inglés deja «1234.50 USD» sin separador; en español no tiene efecto.
- Las capturas en español de T008 con números de cuatro cifras, si las hay, quedan superadas en ese detalle.

### D021 - Límite conocido: cambio de idioma sin JavaScript en la 404 de una empresa

**Date:** 2026-10-28

**Status:** Accepted

**Context:**

`/review-all` lo reprodujo con `next start` sobre el build actual (`docs/visibility-mvp/assets/18-i18n/review-all-404-post.txt`). En `/workspaces/<id inexistente>`, sin JavaScript, el formulario del selector envía un POST. El proxy solo convierte en 404 las peticiones GET y HEAD, así que el POST llega a la ruta de empresa, que tiene `instant = false` (D016). Responde 404 y guarda la cookie, pero el cuerpo es la plantilla de error de Next (`<html id="__next_error__">`), sin `lang` y sin texto visible. «Company not found» solo va en los datos que pinta el cliente. Con JavaScript la página se ve bien, y la 404 general del sitio (`/no-existe`) también funciona sin JavaScript.

**Decision:**

El propietario decidió documentarlo como límite conocido, sin arreglarlo en 003. Se añade a los casos límite de la 404 y del cambio sin JavaScript de la SPEC, a AC-002 como excepción y al doc 18.

**Reasoning:**

Los dos arreglos posibles chocan con restricciones de la spec. Tratar los POST en el proxy contradice AC-016 (proxy sin cambios). Responder al cambio con una redirección contradice el contrato del server action, que no tiene URL de retorno ni redirección. El caso exige a la vez navegar sin JavaScript y estar en la página de error de una empresa que no existe. El estado es correcto (404) y una recarga lo resuelve.

**Consequences:**

- Ningún cambio de código.
- Si más adelante se toca el proxy o el contrato del selector, este límite debe revisarse primero.
