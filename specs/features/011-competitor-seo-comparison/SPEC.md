# Feature Spec: Comparativa técnica y de autoridad con competidores

## Status

In Progress (2026-10-31). Plan, tareas y decisiones en esta carpeta.

## Problem

Nastya pidió comparar la empresa con sus competidores. La plataforma ya lo hace en presencia en IA, pero en SEO no compara nada: los competidores confirmados de `geo_competitors` no se usan fuera de esa medición.

Search Console, Bing Webmaster y GA4 solo dan datos de propiedades propias, así que no sirven para un competidor. La investigación del 2026-10-31 concluyó que lo gratis y sostenible cubre rendimiento, salud técnica y autoridad. Qué keywords posiciona un competidor y cuánto tráfico recibe no tiene vía gratuita estable.

## Goal

Desde la página SEO, el operador lanza una comparativa que mide en una misma ejecución su web y las de sus competidores activos, y ve en una tabla rendimiento, Lighthouse, Core Web Vitals reales, problemas técnicos y autoridad. Cada cifra dice de dónde viene, y lo que no existe se muestra como ausente, nunca como cero.

## Non-goals

- Keywords que posiciona un competidor, tráfico estimado o posiciones en Google. Requieren datos de terceros obtenidos de Google y su política prohíbe el scraping para comprobar posiciones (BL-01 queda aparte).
- Scraping de Google o de cualquier buscador, directo o con SerpBear, SearXNG o similares.
- Puntuación global o ranking combinado de competidores: mezclar fuentes distintas daría una cifra inventada.
- Evolución en el tiempo. Las filas quedan guardadas, pero esta feature solo muestra la última comparativa completada.
- Programación automática, avisos, tarjeta en el panel e informe PDF.
- Auditar más páginas que la portada de cada dominio.
- Mostrar o guardar el contenido de la web del competidor.
- Ofrecer los datos de Open PageRank a clientes mientras su uso comercial no esté aclarado.
- Cambiar la gestión de competidores, la medición en IA o el comportamiento de las auditorías propias. La guardia de robots previa a cada acceso de portada será una opción explícita para la comparativa (D011), sin cambiar los valores por defecto del colector compartido.

## Users / Actors

- Operador de la plataforma, único usuario hasta la Fase 5 (D-03).

## Current behavior

- `geo_competitors` guarda hasta 5 competidores activos por empresa, con `domain` opcional.
- `collectAuditFacts(hostname, deps)` acepta cualquier hostname y reúne portada, sitemap, PageSpeed (`performance` más `seo`, `accessibility` y `best-practices`) y CrUX usando el fetcher seguro para las webs. Comprueba el robots inicial; tras una redirección consulta el robots final después de descargar la portada y no usa esa nueva prohibición para omitir PageSpeed/CrUX. La comparativa no puede asumir que ese comportamiento satisface FR-003: T000 añade una política optativa previa a cada acceso, con regresión del comportamiento anterior.
- `runAudit` guarda en `audits`, ligado a la empresa, y solo audita el dominio propio.
- La página SEO no muestra ningún dato de competidores.

## Desired behavior

En «Visibilidad en Google» aparece la sección «Comparativa con competidores». El operador pulsa «Comparar», se miden la empresa y sus competidores con web, y la tabla muestra una fila por sitio. La empresa se distingue de los competidores. Si una fuente falla en un sitio, se ve en esa celda y el resto de la comparativa sigue siendo válido.

## Functional requirements

- FR-001 Sitios medidos: la empresa y sus competidores `active` con `domain`, deduplicados por dominio canónico y sin repetir el dominio propio. Como máximo 6 sitios. La empresa tiene prioridad; entre competidores repetidos se conserva el primero en orden estable `created_at, id`. Los competidores sin web se listan aparte, sin medirlos. Los duplicados se identifican como tales sin generar otra medición ni una fila pendiente. Se conserva la identidad congelada del sitio, incluidos `domain` y `hostname`.
- FR-002 Lista congelada: los sitios se leen una vez al empezar; lo que cambie durante la captura no entra en ella.
- FR-003 Medición: cada sitio pasa por `collectAuditFacts` con la política optativa de D011 y por `evaluateAudit`, sin duplicar reglas. La empresa también se mide en esa captura. Antes de solicitar cada URL de portada, incluidos cada salto de redirección (también cambios de path en un mismo origen) y el fallback HTTP, se comprueba su ruta con el robots del origen correspondiente. Si lo prohíbe, no se solicita esa URL, el sitio queda «No analizado por su robots.txt» y PageSpeed/CrUX quedan omitidos. No se considera suficiente descubrir la prohibición después de descargar el destino. Autoridad sigue siendo independiente.
- FR-004 Autoridad: con clave, una sola petición a Open PageRank con todos los dominios, aunque un sitio falle o lo prohíba su robots, porque el dato no sale de esa web. Se guarda autoridad 0–10, posición global, dominios referentes ponderados por el proveedor, dominio solicitado, dominio efectivo, alcance `registered_domain` y fecha `as_of`. Solo un resultado explícito `found: false` significa `not_found`; una respuesta incompleta o ambigua es `error`. Sin clave: `not_configured` sin petición, y el resto funciona. D004 mantiene fuera de alcance los resultados `hosts` y hace visible esa limitación para subdominios.
- FR-005 Independencia entre sitios y fuentes: el fallo de un sitio o de una fuente no invalida los demás. Cada sitio guarda el estado de cada fuente.
- FR-006 Estados de la captura: `running`, `completed` y `failed`. `completed` significa que la captura terminó, aunque haya sitios sin datos. `failed` se reserva para error interno (`internal_error`) o interrupción por antigüedad (`interrupted`); un fallo de proveedor o de una web no basta para fallar la captura.
- FR-007 Concurrencia: como máximo una fila `running` por empresa; la segunda petición recibe `already_running`. Las capturas de más de 10 minutos se cierran como `failed` con código `interrupted`. Todo cierre filtra por id de captura, empresa y estado `running`. Si no actualiza filas, se relee: empresa inexistente da `not_found`; fila ya terminal da `capture_closed`, con mensaje localizado y sin sobrescribirla ni modificar una captura posterior. Una fila inexistente con empresa existente también da `capture_closed`.
- FR-008 Separación: una comparativa no crea filas en `audits` ni `audit_findings`, y no altera la evolución de rendimiento ni los hallazgos de la empresa.
- FR-009 Datos guardados: solo métricas y estados por sitio. Puntuaciones Lighthouse, LCP, CLS y TBT de laboratorio, Core Web Vitals reales con su `scope` y periodo, recuento de problemas críticos y avisos, versión de reglas, autoridad y dominios que enlazan. Nunca HTML, título, descripción ni textos de la web del competidor.
- FR-010 Proyección: la sección muestra la última comparativa `completed`, ordenada por `started_at, id` descendente. Un fallo posterior se avisa sin ocultarla, y una captura en curso se indica. Los competidores archivados no se muestran. Se cruza la lista actual deduplicada por `competitorId + domain + hostname`; los nuevos o con otra identidad quedan pendientes. Para la empresa se comparan `workspaceId + domain + hostname`: cambiar cualquiera de sus dominios/hosts deja su fila pendiente y no atribuye al sitio actual métricas antiguas. Un cambio solo de nombre conserva la medición y distingue la identidad capturada si se muestra el nombre actual. No se mezclan métricas de distintas capturas. Una captura ilegible da aviso y filas pendientes, sin sustituirla silenciosamente por otra anterior.
- FR-011 Tabla: una fila por sitio con la empresa primero y marcada. Columnas: rendimiento, SEO, accesibilidad y buenas prácticas de Lighthouse; LCP, INP y CLS reales; críticos y avisos; autoridad y dominios que enlazan. Sin resaltar ganadores ni ordenar por una cifra combinada.
- FR-012 Ausencias: cada celda sin dato explica su estado: sin clave, sin datos de usuarios reales, métrica no medida, no encontrado en el grafo de dominios, fallo, cuota agotada o no analizado. Un fallo completo de fuente permite `colSpan`; con datos parciales se conserva cada valor y se explica cada métrica ausente. No se fabrica cero ni se muestra un guion sin explicación. CLS 0, puntuación 0, autoridad 0 con `found: true`, cero dominios referentes y cero problemas son valores válidos y se muestran.
- FR-013 Comparabilidad de datos reales: si el dato de CrUX es de la página en un sitio y del origen en otro, la tabla lo indica en cada fila.
- FR-014 Contexto visible: inicio y fin de captura, estrategia móvil, CrUX de teléfonos/p75 con periodo y alcance por fila, y `as_of`, alcance y dominio efectivo de autoridad. Si el periodo falta se explica, sin inventarlo. Se aclara que Lighthouse es puntual y variable, CrUX agrega un periodo y la autoridad procede de una publicación de enlaces de Common Crawl, no de Google ni de una medición de hoy. En subdominios se indica que se está mostrando el dominio registrado, no autoridad propia del host.
- FR-015 Fuentes: la sección cita Chrome UX Report, PageSpeed Insights y Open PageRank.
- FR-016 Botón: visible con PageSpeed configurado y al menos un dominio competidor distinto del propio después de la selección y deduplicación de FR-001. Interfaz y servicio usan el mismo selector. Sin sitios competidores elegibles, incluido el caso en que todos duplican la empresa, un texto lleva a gestionarlos y el servicio da `no_competitors` sin fila ni peticiones. Sin `PAGESPEED_API_KEY`, la sección explica qué falta y el servicio da `not_configured`.
- FR-017 Textos en `es` y `en`, incluidos todos los estados.

## Non-functional requirements

- Performance: como mucho 3 sitios en paralelo. Una comparativa hace a lo sumo 6 ejecuciones de PageSpeed, 12 peticiones a CrUX y 1 a Open PageRank. Sin reintentos nuevos: se conserva el reintento de PageSpeed. Puede tardar varios minutos en el peor caso, dentro de una Server Action; es aceptable con un solo operador (D-12) y hay que revisarlo antes de desplegar.
- Security: la acción valida `workspaceId` y obtiene los dominios del servidor, nunca del cliente. Todas las lecturas de webs pasan por el fetcher seguro. La clave de Open PageRank no aparece en errores, registros ni filas. Las respuestas externas se validan al entrar y las filas al leer. Respetar la política de robots de D011, limitada a la portada y sus saltos; la lectura del sitemap mantiene el alcance y las reglas actuales. Una operación lógica de portada y sitemap por sitio, con redirects/fallback acotados por el fetcher; no se promete una sola petición HTTP física. Cachear el resultado de robots por origen dentro del sitio y compartir el presupuesto existente entre todas esas lecturas. Las llamadas a endpoints fijos de Google y Open PageRank quedan separadas de las lecturas de webs. La acción amplía el perímetro sin autenticación de D-26 y debe añadirse a BL-07.
- Observability: registrar duración, número de sitios y estados por fuente. Nunca claves.
- Maintainability: reutilizar `collectAuditFacts`, `evaluateAudit` y `listCompetitors`. Ninguna regla de auditoría se duplica. JSON versionado, con forma comprobada en SQL y en lectura, siguiendo las lecciones de 007 y 010.

## API / Interface changes

- Nueva Server Action `runCompetitorComparisonAction(workspaceId, previousState)` en `seo/actions.ts`, sin revalidar otras secciones más allá de SEO.
- Nueva variable opcional `OPEN_PAGERANK_API_KEY` en `env.ts` y `.env.example`.
- Nuevo cliente de Open PageRank, con tiempo límite y errores tipados que distingan cuota, clave inválida e IP no autorizada (403 `address_error`).
- Nueva sección en `seo/page.tsx` y textos nuevos en los catálogos, incluido `capture_closed`.
- Opción explícita de colector y guardia de portada por salto en el fetcher seguro para D011. El comportamiento por defecto y las firmas de los consumidores actuales se conservan compatibles.

## Data model changes

- Nueva tabla `competitor_comparisons`, una fila por intento: `workspace_id` con cascada, `status`, `sites` jsonb, `rules_version`, `error`, `started_at` y `finished_at`.
- Índice único parcial de una fila `running` por empresa, e índice por empresa y fecha.
- `sites` guarda versión 1 y, por sitio: `role` (`company` o `competitor`), `competitorId`, nombre, dominio y hostname en el momento de la captura, y el resultado de cada fuente con su estado.
- Migración aditiva. Sin backfill. Sin cambios en `audits` ni `geo_competitors`.

### Contrato de persistencia y lectura

- Fila `running`: `sites`, `error` y `finished_at` nulos. Fila `completed`: `sites` válido, `error` nulo y `finished_at >= started_at`. Fila `failed`: `sites` nulo, `finished_at >= started_at` y `error` como código cerrado `internal_error` o `interrupted`, nunca texto de excepción. SQL aplica estas correspondencias con restricciones nombradas.
- `sites` es `{version: 1, sites: SiteResult[]}`; entre 1 y 6 sitios, exactamente una empresa primero, dominios únicos. Los requisitos de inicio garantizan al menos 2; el límite estructural 1 permite una captura legible sin usarlo como autorización para iniciar una comparación vacía. SQL comprueba objeto, versión numérica 1 y array acotado con jsonpath `strict` e `IS TRUE`; Zod estricto comprueba todos los detalles al escribir y al leer.
- Identidad: `role`, `competitorId` (UUID para competidor, null para empresa), nombre del operador de 1–120 caracteres, `domain` y `hostname` ASCII normalizados de hasta 253 caracteres. En la empresa hostname conserva `www` si existe; en competidores hostname = domain. No guardar URLs completas ni contenidos de la web.
- Acceso: `analyzed`, `robots_disallowed`, `unreachable`, `http_error` o `non_html`. `analyzed` requiere portada HTML accesible y hechos extraídos; el resto deja los recuentos técnicos nulos. Código de causa opcional de una enumeración interna, nunca mensaje/URL del fetcher.
- Lighthouse: estado de fuente `ok`, `not_configured`, `quota_exceeded`, `error` o `skipped`; cuatro puntuaciones con los nombres `performance`, `seo`, `accessibility`, `bestPractices`, escala 0–100; laboratorio `lcpMs`, `cls`, `tbtMs`; versión Lighthouse nullable. En estado `ok` cada métrica es `{status: "ok", value: número}` o `{status: "not_measured"}`; una fuente no disponible no lleva métricas. Tiempos en ms, CLS adimensional; valores finitos y no negativos, sin redondeo de almacenamiento.
- CrUX: estados `ok`, `no_data`, `not_configured`, `quota_exceeded`, `error` o `skipped`. En `ok`, `formFactor: "PHONE"`, `scope: "url" | "origin"`, periodo de fechas ISO reales ordenadas o null explícito, y métricas `lcpMs`, `inpMs`, `cls` con la misma unión de métrica medida/no medida. No inferir que las tres existen porque la fuente esté `ok`; no guardar `key` ni la URL de consulta.
- Recuentos: `criticalCount` y `warningCount`, enteros no negativos solo si acceso `analyzed`. Proceden de todos los hallazgos de `evaluateAudit` y se etiquetan como problemas de la auditoría, no como ranking de SEO. Versión de reglas en la fila.
- Autoridad: `ok`, `not_found`, `not_configured`, `invalid_key`, `ip_not_allowed`, `quota_exceeded` o `error`. Cada sitio guarda dominio solicitado; con resultado emparejado, también dominio efectivo, `scope: "registered_domain"` y `asOf` ISO real de la respuesta. `ok` requiere score finito 0–10, rank entero positivo o null y referringDomains entero no negativo o null. Un null de rank/referentes se explica como métrica no disponible. `not_found` solo tras `found: false`, sin cifras; sin resultado emparejado no se inventa dominio efectivo ni fecha. Claves de proveedor y cuerpos de error nunca se copian.
- Se rechazan versiones desconocidas, propiedades extra, identidades repetidas, valores negativos/no finitos, fechas imposibles, estados desconocidos y contradicciones entre estado y métricas. Un JSON ilegible al leer genera aviso y pendientes; nunca se convierte en éxito vacío.

## Edge cases

- Empresa sin competidores activos o sin ninguno con web: sin botón, con texto que lleva a gestionarlos.
- Competidor con dominio igual al de la empresa o a otro competidor: se mide una vez.
- Web del competidor caída, con error 4xx o 5xx, timeout, SSRF bloqueado o redirección a otro dominio: el sitio queda con su estado y los demás siguen.
- Portada que redirige a otro origen o path prohibido: la guardia impide descargar ese destino y omite Google. Fallback HTTPS→HTTP comprueba el robots del nuevo origen. Robots se cachea por origen sin recursión de la guardia sobre su propia descarga.
- Web del competidor sin datos en CrUX por poco tráfico: `no_data`, no cero. Es lo normal en competidores pequeños.
- PageSpeed con cuota agotada en mitad de la captura: esos sitios quedan `quota_exceeded`, los anteriores se conservan.
- Open PageRank responde 403 por IP, clave inválida, cuota agotada o caída: la columna muestra el motivo y lo demás se guarda.
- Dominio ausente en Open PageRank, habitual en webs muy nuevas o que bloquean rastreadores: «No encontrado».
- Empresa borrada durante la captura: no queda fila huérfana y la acción responde `not_found`.
- Competidor archivado durante la captura: sigue en esa captura, y se oculta al mostrarla.
- Serie guardada ilegible o de versión desconocida: aviso, sin romper la página.
- Nombre de competidor con HTML: texto literal.
- Tabla a 375 px con 6 sitios y dominios largos, sin scroll horizontal de página.
- Doble clic o dos pestañas: una sola captura.
- Un trabajador antiguo termina después de cerrarse su captura y empezar otra: no sobrescribe ninguna fila terminal y devuelve `capture_closed`, no `not_found`.
- CrUX sin INP o una categoría Lighthouse sin score: conservar el resto y explicar esa ausencia.
- Solo competidores que duplican la empresa: sin botón, sin captura ni llamadas externas.
- Cambio del dominio/hostname propio tras una captura: fila propia pendiente, manteniendo la identidad histórica.

## Acceptance criteria

- AC-001 Con la empresa y 5 competidores con web, una captura mide 6 sitios en una sola fila. Con un competidor sin web y otro duplicado, se mide cada dominio una vez y el competidor sin web se lista aparte. Prueba de integración.
- AC-002 Cambiar competidores durante la captura no altera los sitios medidos en ella, y la captura no mantiene bloqueos durante la red. Prueba con promesa retenida y colector real.
- AC-003 Un sitio caído, un `robots.txt` que prohíbe y una cuota agotada dejan cada uno su estado, y los demás sitios conservan sus cifras. Prueba con una matriz de fallos por fuente.
- AC-004 Sin clave, con 403 `address_error`, 401, 429, 5xx y respuesta malformada, Open PageRank deja su estado propio en todos los sitios y la captura termina `completed`. Ningún error guardado contiene la clave. Dominio no encontrado da «No encontrado», nunca 0.
- AC-005 Con clave, Open PageRank recibe una sola petición con todos los dominios, incluidos sitios fallidos o prohibidos por robots. Sin clave no hace ninguna petición.
- AC-006 Dos capturas simultáneas de una empresa dejan una sola fila `running`; la segunda recibe el aviso. Una captura colgada se cierra y permite otra; si el trabajador antiguo termina después, no altera la fila cerrada ni la nueva y responde `capture_closed`. Solo borrar realmente la empresa produce `not_found`.
- AC-007 Tras una comparativa, `audits`, `audit_findings` y la evolución de rendimiento de la empresa no cambian.
- AC-008 Inspeccionando `sites` de una captura con fixtures, no hay HTML, títulos, descripciones ni textos de la web. Prueba que busca en la fila guardada los textos del fixture.
- AC-009 Un fallo posterior muestra el aviso y conserva la última comparativa `completed`. Una captura en curso se indica. Un competidor archivado no se muestra, uno nuevo sale pendiente, y uno con dominio cambiado también. Cambiar `domain` o `hostname` propio deja la empresa pendiente, pero renombrarla sin cambiar su identidad no invalida las cifras. Una fila con `sites` ilegible da aviso sin romper la página.
- AC-010 Cada estado de FR-012 se ve en DOM con su texto en `es` y `en`, sin ceros fabricados ni guiones sin explicación; los ceros realmente medidos se conservan, y la marca de `scope` de CrUX aparece cuando difiere entre filas.
- AC-011 La tabla no muestra ganadores ni puntuación combinada, y marca la fila de la empresa. Las celdas siguen legibles sin depender del color. Fecha, estrategia móvil, periodo de CrUX, frase de contexto y las tres fuentes aparecen en DOM en `es` y `en`.
- AC-012 Migración aditiva en la base de pruebas: rechaza una forma inválida con su restricción nombrada, permite una sola fila `running` y borra en cascada con la empresa. Rechaza las combinaciones de status/sites/error/fechas contrarias al contrato, incluyendo JSON null, versión array y timestamps incoherentes.
- AC-013 Sin `PAGESPEED_API_KEY`, sin competidores y sin competidores con web o con todos duplicando la empresa, la sección explica qué falta y no hay botón. La página SEO no se rompe en ninguno de los estados de las demás secciones.
- AC-014 Nombre de competidor con `<script>` se muestra como texto literal.
- AC-015 En el navegador, con fixtures en la base de pruebas limpiados después, a 375 px en `es` y `en`: `scrollWidth` igual a `clientWidth` en la página y en la sección con 6 sitios y dominios largos. También a 1280 px.
- AC-016 Comprobación real: una captura con PageSpeed y CrUX reales sobre olessium.com y al menos 2 competidores reales con web en la base de pruebas. El mapeo se contrasta exactamente con las mismas respuestas que alimentaron esa captura, usando una copia temporal saneada de métricas y estados sin claves, URLs completas ni contenido. Una segunda consulta independiente es solo evidencia de variabilidad, no un umbral para aprobar. CrUX se contrasta para idéntico sitio efectivo, PHONE, scope y periodo. Autoridad exige clave real y resultado `found: true`, mismo dominio efectivo y `as_of`; además se registra una respuesta real `found: false`. Registrar fecha, sitios, duración y cifras sin secretos. Sin esas evidencias T009 y el cierre quedan pendientes, aunque la implementación y los mocks puedan completarse. D009 concreta la evidencia.
- AC-017 Lint, typecheck, unitarias, integración y build en verde sobre la revisión identificada.
- AC-018 Con robots inicial que permite y redirección a origen o path prohibido, no hay petición de portada al destino ni llamadas a PageSpeed/CrUX; sí se consulta autoridad si hay clave. Incluir fallback HTTP, origen permitido, cache de robots, límite de redirects y rechazo SSRF. Sin activar la política optativa, las pruebas existentes del colector y las auditorías propias conservan sus resultados.
- AC-019 Fuente CrUX `ok` sin INP y Lighthouse `ok` sin una categoría muestran sus valores presentes y «Métrica no medida» en las ausentes, en es/en. Solo una ausencia completa usa `colSpan`. CLS 0, score 0, autoridad 0 con `found: true`, referentes 0 y recuentos 0 se conservan en persistencia y DOM.
- AC-020 Con subdominio solicitado y respuesta del dominio registrado, guardar y mostrar dominio efectivo, alcance y `as_of`, distinguiendo fecha de captura y publicación. Probar respuestas desordenadas, dominios compartidos, ausencia inesperada de resultado y plataforma compartida con `hosts` presente pero fuera de alcance. Un referente/rank null se explica sin fabricar cero.
- AC-021 Cambiar dominio/hostname propio durante o después de capturar no modifica la identidad congelada: la proyección actual queda pendiente para la empresa. Un cambio solo de nombre no invalida datos. La proyección de competidores usa también id, dominio y hostname.
- AC-022 Empresa repetida como único competidor, o todos sus competidores duplicándola: `no_competitors` sin fila y sin red, mismo comportamiento en botón y servicio. Los duplicados entre competidores se resuelven de forma estable sin filas pendientes ficticias.
- AC-023 El parser de escritura/lectura rechaza cada violación del contrato: versión desconocida, campos extra, duplicados, números/fechas fuera de rango, estados inválidos y métricas incompatibles. Acepta datos parciales y ceros válidos. Las pruebas SQL distinguen sus garantías estructurales de las validaciones de detalle reservadas a runtime.

## Test scenarios

- Unit: selección y deduplicación de sitios, cliente de Open PageRank, mapeo de hechos a resultado por sitio sin textos, proyección y sus estados, render en `es` y `en`, validación de `sites`.
- Integration: captura completa con dobles de red, matriz de fallos, concurrencia, separación de `audits`, migración y cascada.
- E2E: no hay suite E2E; se cubre con la comprobación en navegador.
- Manual: AC-015 y AC-016.

## Assumptions

- Los dominios de `geo_competitors` son los confirmados por el operador y no necesitan otra verificación.
- Es uso privado del operador, como las specs 003 a 010.
- El contrato de Open PageRank se fija con la documentación y OpenAPI enlazados en D003. La evidencia real de `found: false` sigue pendiente hasta T009; no se supone ya verificada.
- La clave gratuita, ligada a una IP desde el 2026-11-01, basta para el operador. No basta en un despliegue con IP cambiante.
- La cuota de PageSpeed no consta en su documentación; se asume suficiente para 6 ejecuciones por captura y un 429 queda cubierto por FR-005.
- Google puede retirar los datos de CrUX de PageSpeed, sin fecha. No afecta porque se usa la API de CrUX.
- Leer portada, `robots.txt` y sitemap de un competidor con identificación propia, respetando `robots.txt`, es aceptable: es lo que ya hace la auditoría con cualquier web.
- La comprobación real puede hacerse en la base de pruebas; `production` no se toca.

## Open questions

- Uso comercial de Open PageRank: sus páginas no lo regulan. No bloquea el uso del operador; hay que resolverlo antes de ofrecerlo a clientes (Deferred).
- Evolución de la comparativa en el tiempo: posible con las filas guardadas, pendiente de saber si Nastya la necesita (Deferred).
- Antes de desplegar, la captura larga debería pasar a trabajo en segundo plano, junto a D-12 (Deferred).

Ninguna bloquea implementar el plan. Crear la cuenta gratuita de Open PageRank y disponer de datos reales son dependencias del responsable para AC-016. Sin ellas se puede desarrollar con fixtures y mostrar `not_configured`, pero T009 permanece sin completar y no se ejecuta spec-close ni se declara cerrada la feature.

## Contracted services

Contracted services not declared → all billable add-ons treated as NOT contracted (conservative default). Run `/project-init` to declare them. Esta feature no usa ningún servicio de pago: PageSpeed y CrUX usan la clave ya configurada, y Open PageRank su cuenta gratuita, sin tarjeta.
