# Feature Spec: Comparativa técnica y de autoridad con competidores

## Status

Draft

## Problem

Nastya pidió comparar la empresa con sus competidores. La plataforma ya lo hace en presencia en IA, pero en SEO no compara nada: los competidores confirmados de `geo_competitors` no se usan fuera de esa medición.

Search Console, Bing Webmaster y GA4 solo dan datos de propiedades propias, así que no sirven para un competidor. La investigación del 2026-10-31 concluyó que lo gratis y sostenible cubre rendimiento, salud técnica y autoridad. Qué keywords posiciona un competidor y cuánto tráfico recibe no tiene vía gratuita estable.

## Goal

Desde la página SEO, el operador lanza una comparativa que mide en el mismo momento su web y las de sus competidores activos, y ve en una tabla rendimiento, Lighthouse, Core Web Vitals reales, problemas técnicos y autoridad. Cada cifra dice de dónde viene, y lo que no existe se muestra como ausente, nunca como cero.

## Non-goals

- Keywords que posiciona un competidor, tráfico estimado o posiciones en Google. Requieren datos de terceros obtenidos de Google y su política prohíbe el scraping para comprobar posiciones (BL-01 queda aparte).
- Scraping de Google o de cualquier buscador, directo o con SerpBear, SearXNG o similares.
- Puntuación global o ranking combinado de competidores: mezclar fuentes distintas daría una cifra inventada.
- Evolución en el tiempo. Las filas quedan guardadas, pero esta feature solo muestra la última comparativa completada.
- Programación automática, avisos, tarjeta en el panel e informe PDF.
- Auditar más páginas que la portada de cada dominio.
- Mostrar o guardar el contenido de la web del competidor.
- Ofrecer los datos de Open PageRank a clientes mientras su uso comercial no esté aclarado.
- Cambiar la gestión de competidores, la medición en IA o las auditorías de la propia empresa.

## Users / Actors

- Operador de la plataforma, único usuario hasta la Fase 5 (D-03).

## Current behavior

- `geo_competitors` guarda hasta 5 competidores activos por empresa, con `domain` opcional.
- `collectAuditFacts(hostname, deps)` ya acepta cualquier hostname: respeta `robots.txt`, usa el fetcher seguro y reúne portada, sitemap, PageSpeed (`performance` más `seo`, `accessibility` y `best-practices`) y CrUX.
- `runAudit` guarda en `audits`, ligado a la empresa, y solo audita el dominio propio.
- La página SEO no muestra ningún dato de competidores.

## Desired behavior

En «Visibilidad en Google» aparece la sección «Comparativa con competidores». El operador pulsa «Comparar», se miden la empresa y sus competidores con web, y la tabla muestra una fila por sitio. La empresa se distingue de los competidores. Si una fuente falla en un sitio, se ve en esa celda y el resto de la comparativa sigue siendo válido.

## Functional requirements

- FR-001 Sitios medidos: la empresa y sus competidores `active` con `domain`, deduplicados por dominio y sin repetir el dominio propio. Como máximo 6 sitios. Los competidores sin web se listan aparte, sin medirlos.
- FR-002 Lista congelada: los sitios se leen una vez al empezar; lo que cambie durante la captura no entra en ella.
- FR-003 Medición: cada sitio pasa por `collectAuditFacts` y `evaluateAudit`, con las mismas reglas que la auditoría propia, incluido `robots.txt`. La empresa también se mide en esa captura, para comparar en las mismas condiciones. Si `robots.txt` prohíbe leer la portada, el sitio queda como «No analizado por su robots.txt» y PageSpeed y CrUX quedan omitidos, como ya hace la auditoría.
- FR-004 Autoridad: una sola petición a Open PageRank con todos los dominios, que se hace aunque un sitio falle o lo prohíba su `robots.txt`, porque el dato no sale de esa web. Se guarda autoridad 0–10, posición global y dominios que enlazan. Dominio no encontrado: estado propio, nunca cero. Sin clave configurada: `not_configured`, y el resto funciona.
- FR-005 Independencia entre sitios y fuentes: el fallo de un sitio o de una fuente no invalida los demás. Cada sitio guarda el estado de cada fuente.
- FR-006 Estados de la captura: `running`, `completed` y `failed`. `completed` significa que la captura terminó, aunque haya sitios sin datos. `failed` es solo un error interno, con el mismo criterio que `audits`.
- FR-007 Concurrencia: como máximo una comparativa en curso por empresa. Una segunda petición lo avisa. Las capturas colgadas se cierran con el criterio de `closeStaleRuns`.
- FR-008 Separación: una comparativa no crea filas en `audits` ni `audit_findings`, y no altera la evolución de rendimiento ni los hallazgos de la empresa.
- FR-009 Datos guardados: solo métricas y estados por sitio. Puntuaciones Lighthouse, LCP, CLS y demás cifras de laboratorio, Core Web Vitals reales con su `scope` y periodo, recuento de problemas críticos y avisos, versión de reglas, autoridad y dominios que enlazan. Nunca HTML, título, descripción ni textos de la web del competidor.
- FR-010 Proyección: la sección muestra la última comparativa `completed`. Un fallo posterior se avisa sin ocultarla, y una captura en curso se indica. Los competidores archivados desde entonces no se muestran. Un competidor nuevo, o con otro dominio, aparece como pendiente hasta la siguiente captura.
- FR-011 Tabla: una fila por sitio con la empresa primero y marcada. Columnas: rendimiento, SEO, accesibilidad y buenas prácticas de Lighthouse; LCP, INP y CLS reales; críticos y avisos; autoridad y dominios que enlazan. Sin resaltar ganadores ni ordenar por una cifra combinada.
- FR-012 Ausencias: cada celda sin dato explica por qué con el texto de su estado: sin clave, sin datos de usuarios reales, no encontrado, fallo, cuota agotada o no analizado. Nunca cero ni guion sin explicación.
- FR-013 Comparabilidad de datos reales: si el dato de CrUX es de la página en un sitio y del origen en otro, la tabla lo indica en cada fila.
- FR-014 Contexto visible: fecha de la captura, estrategia móvil, periodo de CrUX y una frase que explique que Lighthouse es una medición puntual que varía entre ejecuciones y que la autoridad procede de enlaces rastreados por Common Crawl, no de Google.
- FR-015 Fuentes: la sección cita Chrome UX Report, PageSpeed Insights y Open PageRank.
- FR-016 Botón: visible con PageSpeed configurado y al menos un competidor con web. Sin competidores con web, un texto lleva a gestionarlos. Sin `PAGESPEED_API_KEY`, la sección explica qué falta.
- FR-017 Textos en `es` y `en`, incluidos todos los estados.

## Non-functional requirements

- Performance: como mucho 3 sitios en paralelo. Una comparativa hace a lo sumo 6 ejecuciones de PageSpeed, 12 peticiones a CrUX y 1 a Open PageRank. Sin reintentos nuevos: se conserva el reintento de PageSpeed. Puede tardar varios minutos en el peor caso, dentro de una Server Action; es aceptable con un solo operador (D-12) y hay que revisarlo antes de desplegar.
- Security: la acción valida `workspaceId` y obtiene los dominios del servidor, nunca del cliente. Todas las lecturas de webs pasan por el fetcher seguro. La clave de Open PageRank no aparece en errores, registros ni filas. Las respuestas externas se validan al entrar y las filas al leer. Respetar `robots.txt`, un solo acceso a portada, `robots.txt` y sitemap por captura. La acción amplía el perímetro sin autenticación de D-26 y debe añadirse a BL-07.
- Observability: registrar duración, número de sitios y estados por fuente. Nunca claves.
- Maintainability: reutilizar `collectAuditFacts`, `evaluateAudit` y `listCompetitors`. Ninguna regla de auditoría se duplica. JSON versionado, con forma comprobada en SQL y en lectura, siguiendo las lecciones de 007 y 010.

## API / Interface changes

- Nueva Server Action `runCompetitorComparisonAction(workspaceId, previousState)` en `seo/actions.ts`, sin revalidar otras secciones más allá de SEO.
- Nueva variable opcional `OPEN_PAGERANK_API_KEY` en `env.ts` y `.env.example`.
- Nuevo cliente de Open PageRank, con tiempo límite y errores tipados que distingan cuota, clave inválida e IP no autorizada (403 `address_error`).
- Nueva sección en `seo/page.tsx` y textos nuevos en los catálogos.

## Data model changes

- Nueva tabla `competitor_comparisons`, una fila por intento: `workspace_id` con cascada, `status`, `sites` jsonb, `rules_version`, `error`, `started_at` y `finished_at`.
- Índice único parcial de una fila `running` por empresa, e índice por empresa y fecha.
- `sites` guarda versión 1 y, por sitio: `role` (`company` o `competitor`), `competitorId`, nombre y dominio en el momento de la captura, y el resultado de cada fuente con su estado.
- Migración aditiva. Sin backfill. Sin cambios en `audits` ni `geo_competitors`.

## Edge cases

- Empresa sin competidores activos o sin ninguno con web: sin botón, con texto que lleva a gestionarlos.
- Competidor con dominio igual al de la empresa o a otro competidor: se mide una vez.
- Web del competidor caída, con error 4xx o 5xx, timeout, SSRF bloqueado o redirección a otro dominio: el sitio queda con su estado y los demás siguen.
- Portada que redirige a otro origen: se aplica su `robots.txt`, como en la auditoría.
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

## Acceptance criteria

- AC-001 Con la empresa y 5 competidores con web, una captura mide 6 sitios en una sola fila. Con un competidor sin web y otro duplicado, se mide cada dominio una vez y el competidor sin web se lista aparte. Prueba de integración.
- AC-002 Cambiar competidores durante la captura no altera los sitios medidos en ella, y la captura no mantiene bloqueos durante la red. Prueba con promesa retenida y colector real.
- AC-003 Un sitio caído, un `robots.txt` que prohíbe y una cuota agotada dejan cada uno su estado, y los demás sitios conservan sus cifras. Prueba con una matriz de fallos por fuente.
- AC-004 Sin clave, con 403 `address_error`, 401, 429, 5xx y respuesta malformada, Open PageRank deja su estado propio en todos los sitios y la captura termina `completed`. Ningún error guardado contiene la clave. Dominio no encontrado da «No encontrado», nunca 0.
- AC-005 Open PageRank recibe una sola petición con todos los dominios, y se consulta también para sitios fallidos o prohibidos por `robots.txt`.
- AC-006 Dos capturas simultáneas de una empresa dejan una sola fila `running`; la segunda recibe el aviso. Una captura colgada se cierra y permite otra.
- AC-007 Tras una comparativa, `audits`, `audit_findings` y la evolución de rendimiento de la empresa no cambian.
- AC-008 Inspeccionando `sites` de una captura con fixtures, no hay HTML, títulos, descripciones ni textos de la web. Prueba que busca en la fila guardada los textos del fixture.
- AC-009 Un fallo posterior muestra el aviso y conserva la última comparativa `completed`. Un competidor archivado no se muestra, uno nuevo sale pendiente, y uno con dominio cambiado también.
- AC-010 Cada estado de FR-012 se ve en DOM con su texto en `es` y `en`, sin ceros ni guiones sin explicación, y la marca de `scope` de CrUX aparece cuando difiere entre filas.
- AC-011 La tabla no muestra ganadores ni puntuación combinada, y marca la fila de la empresa. Las celdas siguen legibles sin depender del color. Fecha, estrategia móvil, periodo de CrUX, frase de contexto y las tres fuentes aparecen en DOM en `es` y `en`.
- AC-012 Migración aditiva en la base de pruebas: rechaza una forma inválida con su restricción nombrada, permite una sola fila `running` y borra en cascada con la empresa.
- AC-013 Sin `PAGESPEED_API_KEY`, sin competidores y sin competidores con web, la sección explica qué falta y no hay botón. La página SEO no se rompe en ninguno de los estados de las demás secciones.
- AC-014 Nombre de competidor con `<script>` se muestra como texto literal.
- AC-015 En el navegador, con fixtures en la base de pruebas limpiados después, a 375 px en `es` y `en`: `scrollWidth` igual a `clientWidth` en la página y en la sección con 6 sitios y dominios largos. También a 1280 px.
- AC-016 Comprobación real: una captura con la clave real de PageSpeed y CrUX, sobre olessium.com y al menos 2 competidores reales con web, en la base de pruebas, cuyas cifras coinciden con PageSpeed y CrUX consultados aparte para un mismo sitio, con la tolerancia de una medición puntual. Con clave de Open PageRank, además, una autoridad real comparada con su fuente. Registrar fecha, sitios y duración, sin claves.
- AC-017 Lint, typecheck, unitarias, integración y build en verde sobre la revisión identificada.

## Test scenarios

- Unit: selección y deduplicación de sitios, cliente de Open PageRank, mapeo de hechos a resultado por sitio sin textos, proyección y sus estados, render en `es` y `en`, validación de `sites`.
- Integration: captura completa con dobles de red, matriz de fallos, concurrencia, separación de `audits`, migración y cascada.
- E2E: no hay suite E2E; se cubre con la comprobación en navegador.
- Manual: AC-015 y AC-016.

## Assumptions

- Los dominios de `geo_competitors` son los confirmados por el operador y no necesitan otra verificación.
- Es uso privado del operador, como las specs 003 a 010.
- El endpoint y los campos exactos de Open PageRank se fijan al planificar, con su documentación actual en keywordseverywhere.com y una llamada real. Se conocen `open_page_rank`, `rank`, `referring_domains` y hasta 100 dominios por petición.
- La clave gratuita, ligada a una IP desde el 2026-11-01, basta para el operador. No basta en un despliegue con IP cambiante.
- La cuota de PageSpeed no consta en su documentación; se asume suficiente para 6 ejecuciones por captura y un 429 queda cubierto por FR-005.
- Google puede retirar los datos de CrUX de PageSpeed, sin fecha. No afecta porque se usa la API de CrUX.
- Leer portada, `robots.txt` y sitemap de un competidor con identificación propia, respetando `robots.txt`, es aceptable: es lo que ya hace la auditoría con cualquier web.
- La comprobación real puede hacerse en la base de pruebas; `production` no se toca.

## Open questions

- Uso comercial de Open PageRank: sus páginas no lo regulan. No bloquea el uso del operador; hay que resolverlo antes de ofrecerlo a clientes (Deferred).
- Evolución de la comparativa en el tiempo: posible con las filas guardadas, pendiente de saber si Nastya la necesita (Deferred).
- Antes de desplegar, la captura larga debería pasar a trabajo en segundo plano, junto a D-12 (Deferred).

Ninguna bloquea el plan. Crear la cuenta gratuita de Open PageRank es un paso del responsable: sin ella se puede implementar todo, pero la parte de autoridad de AC-016 queda pendiente.

## Contracted services

Contracted services not declared → all billable add-ons treated as NOT contracted (conservative default). Run `/project-init` to declare them. Esta feature no usa ningún servicio de pago: PageSpeed y CrUX usan la clave ya configurada, y Open PageRank su cuenta gratuita, sin tarjeta.
