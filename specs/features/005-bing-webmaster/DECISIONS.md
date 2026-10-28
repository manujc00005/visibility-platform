# Decisions: Conector de Bing Webmaster Tools

## Decision log

### D001 - Clave de API de usuario en el entorno, no OAuth

**Date:** 2026-10-28 · **Status:** Accepted

**Context:** Bing ofrece OAuth 2.0 (recomendado por Microsoft) o una clave de API por usuario, válida para todos sus sitios verificados.

**Decision:** Una única clave del operador en `BING_WEBMASTER_API_KEY`.

**Reasoning:** Es el mismo criterio que D001 de 003-search-console: el piloto lo usa el operador sobre sitios a los que tiene acceso. OAuth exige pantalla de consentimiento, guardar tokens cifrados y renovarlos.

**Consequences:** La clave da acceso de lectura a todos los sitios de la cuenta del operador. Si se filtra, se revoca en Bing (Settings › API Access › Delete) y se genera otra. Microsoft solo documenta la clave en la query string, de ahí los requisitos de no filtrarla (NFR de seguridad, AC-006). Coste de revertir: bajo; el cliente recibe la clave como parámetro y OAuth sería otro proveedor de credencial.

### D002 - Tabla propia `bing_webmaster_snapshots`

**Date:** 2026-10-28 · **Status:** Accepted

**Context:** `search_console_snapshots` ya tiene columnas `provider` y `capture_condition`, lo que invita a reutilizarla.

**Decision:** Tabla nueva, con la misma forma general (una fila por intento, cifras y filas en `jsonb`).

**Reasoning:** Las restricciones de la tabla de Google exigen totales y periodos completos en todo `completed` y una posición media a nivel de sitio, que Bing no da. Además, en Bing las tablas cubren una ventana distinta a la de las cifras, y los motivos de fallo son distintos (`not_verified`). Reutilizarla obligaría a relajar restricciones que hoy protegen los datos de Google.

**Consequences:** Una migración más (`0007`) y un servicio paralelo. Una vista combinada Google + Bing, si llega, leerá las dos tablas. Coste de revertir: medio (migración de datos), por eso se fija aquí.

### D003 - Sitio resuelto por dominio con prioridad fija

**Date:** 2026-10-28 · **Status:** Accepted

**Decision:** Elegir entre los sitios verificados de `GetUserSites` con la prioridad de FR-003.

**Reasoning:** Igual que D003 de Search Console: sin formulario nuevo. Bing no tiene propiedades de dominio como `sc-domain:`; sus sitios son prefijos de URL.

**Consequences:** Coste de revertir bajo: un campo opcional en la empresa.

### D004 - Periodo de 28 días que acaba en el último día con datos

**Date:** 2026-10-28 · **Status:** Accepted

**Context:** En Search Console el periodo acaba 3 días antes de la captura (D005 de 003), porque Google documenta cuándo los datos son finales. Bing no documenta el retraso.

**Decision:** El periodo actual termina en el último día que devuelve `GetRankAndTrafficStats`; el anterior son los 28 días previos.

**Reasoning:** Si se fija el fin por la fecha de captura y Bing va más retrasado, los últimos días saldrían a cero y el cambio sería falso.

**Consequences:** Los periodos de Google y Bing pueden no coincidir. La interfaz muestra las fechas de cada uno (FR-011).

**Ajuste (D010):** el fin es el último día con clics o impresiones, no el último día devuelto, para que los días que Bing aún no ha procesado no desplacen el periodo. Si todos los días están a cero, se usa el último devuelto.

### D005 - Búsquedas y páginas agregadas sobre la ventana que da Bing

**Date:** 2026-10-28 · **Status:** Accepted

**Context:** `GetQueryStats` y `GetPageStats` no aceptan fechas, se actualizan cada semana y cada fila trae `Date`. Documentación de terceros dice que hay una fila por búsqueda que cubre unos 6 meses; no está confirmado si a veces hay una por búsqueda y semana.

**Decision:** Agrupar por búsqueda o página, sumar clics e impresiones, ponderar la posición por impresiones y guardar la ventana `rows_start`–`rows_end`.

**Reasoning:** Da el mismo resultado correcto con las dos formas posibles de respuesta, sin depender de un dato no verificado.

**Consequences:** Las tablas no se comparan con el periodo anterior. La primera respuesta real (AC-010) confirma la forma.

### D006 - Planificación sin `specs/CONSTITUTION.md`

**Date:** 2026-10-28 · **Status:** Accepted

**Context:** `/sdd` pide `specs/CONSTITUTION.md` y no existe, igual que en 001–004.

**Decision:** Se siguen las convenciones observables en 001–004 y el precedente D012 de 003-i18n-sticky-header. Ejecutar `/project-init` sigue recomendado; no bloquea esta feature.

### D007 - Implementar después de que la 004 esté en `main`

**Date:** 2026-10-28 · **Status:** Accepted, modificada por el ajuste y la reanudación de abajo (la versión vigente es la reanudación)

**Context:** Esta feature edita `src/app/workspaces/[id]/seo/page.tsx`, `src/i18n/messages/es.ts`, `src/i18n/messages/en.ts` y `tests/unit/i18n/messages.test.ts`. Los cuatro tienen hoy cambios sin commitear de la feature 004 (Lighthouse) en esta misma copia.

**Decision:** No empezar T001 hasta que la 004 esté commiteada, o hacerlo en un worktree propio que parta de un `main` que ya la incluya.

**Reasoning:** En la 003 ya se mezclaron trabajos de dos sesiones en un commit y hubo que separarlos a mano.

**Consequences:** El inicio depende de la 004. La planificación no.

**Ajuste (2026-10-28, al empezar):** solo T006 y T007 editan esos cuatro archivos. T001–T005 tocan archivos que la 004 no toca (`env.ts`, `.env.example`, `logger.ts`, el módulo nuevo, `db/schema/index.ts`, la migración y pruebas nuevas), así que se hacen ya en esta copia. T006 y T007 siguen esperando a que la 004 esté commiteada. Al commitear, cada feature añade solo sus archivos, nunca `git add -A`. Corrección del mismo día: T005 también espera, porque el resumen saca sus textos de `getMessages(locale)` como el de Search Console, y esos textos (T006) viven en los catálogos de la 004. El orden correcto es T006 → T005 → T007.

**Reanudación (2026-10-28, tarde):** la sesión de la 004 está parada desde las 09:35 y no hay fecha para su commit. Por instrucción del propietario («sigue de manera autónoma»), T005–T007 se hacen ya en esta copia, editando también los cuatro archivos compartidos. Al commitear, el contenido de la 005 se separa sin pasar por el área de trabajo (`git hash-object` + `git update-index`), aplicando solo los cambios de la 005 sobre la versión de `HEAD`, como se hizo con la 003. El trabajo de la 004 queda en disco sin tocar.

### D008 - Reutilizar el formato de cambios y el botón de Search Console

**Date:** 2026-10-28 · **Status:** Accepted

**Context:** El resumen de Search Console ya calcula y redacta los cambios frente al periodo anterior («Antes: 8 clics (+50 %)») con las reglas de formato español de D020 (003-i18n). Su botón de actualizar recibe etiquetas y una acción `{ error }`, sin nada propio de Google.

**Decision:** `summary.ts` de Bing importa `formatters`, `countChange` y `ctrChange` de `search-console/summary.ts`, que solo ganan `export`, y les pasa los textos de `searchConsole` (unidades, porcentaje, cambios). La sección de Bing reutiliza `RefreshSearchConsoleButton`. El namespace `bingWebmaster` solo contiene textos propios de Bing.

**Reasoning:** Duplicar esas funciones y frases arriesgaría que el español de Google y el de Bing divergieran en el signo menos o en el agrupamiento, que es justo lo que D020 fijó.

**Consequences:** Cambiar una frase de cambio afecta a las dos secciones, lo cual es lo que se quiere. La tabla de la sección se duplica, porque en Bing la posición puede faltar y en Google no. Unificarla queda como mejora posible, no como parte de esta feature.

### D009 - Datos guardados frente a la configuración, y botón solo con clave lista

**Date:** 2026-10-28 · **Status:** Accepted

**Context:** La revisión de conformidad vio que, tras una captura buena, quitar o romper la clave dejaba la sección en «Conectado», sin rastro de «Sin configurar» ni de «Configuración no válida» (AC-001, AC-002). Además, con una clave inválida se ofrecía el botón, y al pulsarlo respondía «no está configurado».

**Decision:** Los datos guardados se siguen mostrando, como en Search Console, pero con un aviso que dice qué le pasa a la clave y que son los de la última consulta (`configWarning`). El botón solo aparece cuando la clave está lista, porque en otro caso la acción no llama a nada.

**Consequences:** AC-001 y AC-002 se reescriben con esta excepción. Search Console no se toca: allí la clave inválida sí llega a Google y deja un fallo `invalid_credentials`.

### D010 - Tolerancias del cliente frente a lo que dice la spec

**Date:** 2026-10-28 · **Status:** Accepted

**Context:** El código y las revisiones fijaron detalles que la spec dejaba abiertos.

**Decision:**
- `/Date(ms)/` sin desfase se lee en UTC. Microsoft solo documenta la forma con desfase; aceptar la otra no tiene riesgo.
- Una fecha con año fuera de 0000–9999 invalida la respuesta. Antes acababa como `+010000-…` y Postgres la rechazaba.
- Clics e impresiones son enteros entre 0 y 10¹². Antes, una suma podía desbordarse a `Infinity` y guardarse como `null`.
- Las posiciones menores que 1 cuentan como «sin dato», no solo las negativas (FR-006).
- `d: null` es una lista vacía.
- Los errores con código conocido guardan el número de código («(código 6)»), para distinguir una clave inválida de una cuenta bloqueada.
- El periodo termina en el último día con clics o impresiones, no en el último día devuelto (D004). Así los días que Bing aún no ha procesado no lo desplazan.
- HTTP 401 y 403 siguen siendo `error`, no `invalid_credentials`: Bing no los documenta y mapearlos sería suponer. Se revisa con la clave real (T009).

### D011 - T009 cerrada con el estado «Procesando»; cifras y forma de páginas, pendientes

**Date:** 2026-10-28 · **Status:** Accepted

**Context:** Con la clave real, Bing devuelve olessium.com verificado pero `d: []` en tráfico, búsquedas y páginas: el sitio se verificó hoy y Bing tarda hasta 48 h. AC-010 admite este caso («o el estado de AC-005»), pero no hay cifras que comparar con Search Performance ni filas con las que confirmar la forma de `GetPageStats` y de las filas por semana (supuestos de la spec, D005).

**Decision:** T009 se da por hecha con AC-010 cumplido por la vía de AC-005. La comparación de cifras y la confirmación de la forma de `GetPageStats` quedan como seguimiento para cuando Bing tenga datos, sin bloquear el cierre. Los códigos de error 3 y 14 sí se confirmaron contra la API real. 401 y 403 no aparecieron, así que siguen como `error` (D010).

**Consequences:** Si `GetPageStats` llega con otra forma, la captura fallará con «Respuesta de GetPageStats con un formato inesperado en <campo>» y quedará guardada como fallo, sin datos incorrectos. Entonces se corrige el esquema con ese mensaje como guía.

