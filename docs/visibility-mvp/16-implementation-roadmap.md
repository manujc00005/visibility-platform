# 16 — Roadmap de implementación (referencia operativa)

**Última actualización:** 2026-10-25, cierre de la Fase 3.
**Estado del diseño:** `00`–`12` siguen siendo referencia arquitectónica (versión 1, PROPUESTA). `13-codex-review.md` (REQUEST CHANGES) sigue siendo el registro de riesgos. **Este documento manda sobre el orden de trabajo y sobre las decisiones técnicas de construcción.** Donde contradiga a `00`–`12`, prevalece este y la contradicción se lista en §7.

Nota: `14-architecture-sync.md` no llegó a escribirse; el cambio de estrategia lo sustituyó por este documento antes de redactarlo. Los hallazgos de Codex se gestionan aquí de forma progresiva (§4).

## 1. Principio de trabajo

Construir, verificar y evolucionar. Cada fase entrega un corte vertical que funciona y se prueba. Un blocker de Codex detiene una fase **solo** si afecta a la seguridad, integridad, coste o funcionamiento de esa fase. El resto queda visible en §4 sin bloquear.

Ciclo por fase: requisitos → diseño mínimo → blockers aplicables → código → migraciones → pruebas → validación → documentación → demostración → decisiones y deuda.

## 2. Fases y estado

| Fase | Objetivo | Estado | Depende de |
|---|---|---|---|
| **0 — Project Foundation** | App Next.js conectada a PostgreSQL con migraciones, tests y layout | **HECHA** (verificada contra Neon, rama `dev`) | — |
| **1 — Website & Project Management** | Registrar empresa/workspace y su dominio | **HECHA** (verificada en navegador y contra la rama `test`) | 0 |
| **2 — SEO Audit Engine** | Auditar técnicamente una URL real | **HECHA**, salvo la verificación real de PageSpeed Insights (falta clave, ver §6 D-11) | 1 |
| **3 — SEO Report** | Informe HTML/PDF vendible por proceso asistido | **HECHA** (PDF real generado, revisado visualmente y verificado byte a byte) | 2 |
| **4 — GEO / AEO Visibility** | Medición de presencia en superficies IA | **HECHA** con captura asistida verificada; DataForSEO implementado pero **PENDING_VERIFICATION** (sin credenciales) | 1, 3 (para el informe) |
| 5 — Authentication & Paid Audits | Venta directa con Stripe y acceso del cliente | Siguiente | 3 |
| 6 — Monitoring & Subscription | SaaS recurrente con histórico | Pendiente | 4, 5 |
| 7 — Commercial Extensions | Agencias, white-label, lead-platform, CRM | Fuera del desarrollo inicial | 6 y validación del MVP |

### Fase 0 — Definition of Done

| Criterio | Resultado | Evidencia |
|---|---|---|
| La aplicación arranca | Cumplido | `npm run dev` en el puerto 3100; página inicial renderizada sin errores de consola |
| Conecta a la base de datos | Cumplido **contra Neon** (rama `dev`, PostgreSQL 18.6, `eu-central-1`) con el Postgres local parado | Tarjeta «Estado del sistema»: conectada, 1 migración; `GET /api/health` → 200 |
| Ejecuta migraciones en desarrollo | Cumplido | `npm run db:migrate` aplica `0000_baseline` en Neon `dev` por la conexión directa; 1 fila en `drizzle.__drizzle_migrations` |
| La interfaz se visualiza | Cumplido | Layout con navegación y página inicial con estado y hoja de ruta |
| Lint, typecheck y pruebas pasan | Cumplido | `npm run lint`, `npm run typecheck`, `npm test` (14 pruebas, 4 ficheros, integración contra Neon), `npm run build` |

Comportamiento degradado comprobado: con la base de datos parada, `/api/health` devuelve 503 `{"status":"degraded"}` y el log registra la causa (`ECONNREFUSED`) sin credenciales; al volver la base, 200 sin reiniciar la app.

### Fase 1 — Website & Project Management (hecha)

**Alcance entregado:** un operador privado crea, edita, lista y consulta empresas (`workspaces`) con nombre comercial, web (dominio normalizado, host y URL original), sector, país, ciudad opcional, servicios principales y fechas. Sin autenticación, organizaciones ni llamadas externas.

| Criterio | Resultado | Evidencia |
|---|---|---|
| Crear una empresa y registrar su web | Cumplido | Navegador: `HTTPS://Www.ClinicaGarcia.es/contacto?utm_source=prueba` se guarda como dominio `clinicagarcia.es`, host `www.clinicagarcia.es` y URL original intacta; redirige a la ficha |
| Datos guardados en Neon | Cumplido | Filas en la rama `dev`; integración contra la rama `test` |
| Consultar y editar desde la interfaz | Cumplido | Listado → ficha → edición → ficha actualizada; ciudad vaciada pasa a «No indicada» y cambia «Última edición» |
| Errores de validación | Cumplido | Nombre vacío, IP y servicios vacíos se muestran a la vez, en español, conservando lo escrito |
| Duplicados | Cumplido | `clinicagarcia.es` sin `www` se rechaza con enlace a la empresa existente; 5 creaciones concurrentes dejan 1 fila (integración) |
| Edición inválida no modifica datos | Cumplido | Navegador (credenciales embebidas) e integración (fila idéntica tras el intento) |
| Recurso inexistente | Cumplido | Id desconocido, malformado o con inyección → **HTTP 404** y pantalla «Empresa no encontrada» |
| Navegación | Cumplido | Enlace «Empresas» en la cabecera; «Nueva empresa», «Editar», «← Empresas» |
| Lint, typecheck, pruebas y build | Cumplido | 0 avisos; 94 pruebas (81 unitarias, 13 integración); build correcto |

**Reglas de normalización** (`src/modules/workspaces/domain.ts`, sin DNS ni HTTP):

- Acepta dominio o URL `http(s)`; descarta esquema, ruta, consulta y fragmento; pasa el host a minúsculas y quita el punto final.
- Dominios internacionales: se guardan en ASCII (punycode, `xn--`) y se muestran en Unicode; `bücher.de` y `xn--bcher-kva.de` son la misma clave.
- `www.` se quita de la clave única (`domain`) pero se conserva en `hostname`, porque ambos hosts no tienen por qué servir lo mismo. No se quita si es todo el nombre (`www.com`).
- Rechaza: vacío, más de 2.048 caracteres, espacios, esquemas no web (`javascript:`, `mailto:`, `ftp://`…), credenciales embebidas (incluido `https://@host`), puertos distintos de 80/443, IPs literales (incluidas formas hexadecimales y decimales que el parser convierte, e IPv6), `localhost` y `*.localhost`, nombres de una sola etiqueta, etiquetas inválidas, TLD numéricos y sufijos internos o reservados (`local`, `internal`, `test`, `example`, `invalid`, `onion`, `home.arpa`, `lan`).
- Es un primer filtro de entrada. La defensa SSRF real sigue siendo la del fetcher de la Fase 2 (B08a).

**Base de datos:** restricción única `workspaces_domain_key` y `CHECK` que rechazan en la propia base dominios no normalizados, país no ISO, textos vacíos y listas de servicios fuera de 1–10.

**Separación de pruebas (requisito previo de esta fase):**

- Rama Neon `test` (`br-misty-violet-b9eexijh`, hija de `dev`, sin caducidad) con una base propia `visibility_test`, que no existe en `production` ni en `dev`.
- `TEST_DATABASE_URL` en `.env.test.local`; las pruebas de integración eliminan `DATABASE_URL` de su entorno para no poder usar la base de desarrollo.
- Guardia en dos capas (`src/db/test-guard.ts`): el nombre de la base debe terminar en `_test` y el servidor debe confirmar esa base con una marca que solo escribe `npm run db:test:prepare`.
- La integración es obligatoria: sin configuración, con la base sin marca, con la URL de `dev` o con un nombre `_test` sobre el host de `production`, la ejecución termina con código 1 y el motivo. Las cuatro situaciones se probaron.

### Fase 2 — SEO Audit Engine (hecha)

**Alcance entregado:** desde la ficha de una empresa, «Ejecutar auditoría» analiza la **portada** (una sola página), su `robots.txt`, un sitemap y, si hay clave, la velocidad móvil con PageSpeed Insights. Guarda hechos, hallazgos y registro de peticiones, y los muestra por severidad con evidencia y recomendación. No es un crawler y no hay puntuación global.

| Criterio | Resultado | Evidencia |
|---|---|---|
| Introducir un dominio y ejecutar una auditoría | Cumplido | Navegador: `olessium.com` auditado en 1,7 s (robots.txt, redirección 307 `/`→`/es`, página, sitemap) |
| Se guardan resultados | Cumplido | Tablas `audits` y `audit_findings` en `dev`; integración contra `test` |
| Ver problemas y recomendaciones con evidencia | Cumplido | Hallazgos ordenados crítico → importante → mejora, con evidencia textual y «Qué hacer» |
| Lectura segura de URL pública (B08a) | Cumplido | 35 pruebas del fetcher y 47 de política de direcciones; prueba real: TLS con SNI sobre IP fijada, `localtest.me`→127.0.0.1 bloqueado, certificado de otro host rechazado |
| Title/description, H1–H6, canonical, robots.txt, sitemap, indexabilidad, Open Graph, datos estructurados, enlaces internos | Cumplido | Extracción con `parse5` (13 pruebas) y 40 reglas (14 pruebas) |
| Integración con PageSpeed Insights | **Implementada, no verificada en real** | Adaptador probado con respuestas simuladas; la llamada anónima real devolvió 429 (cuota diaria de Google agotada). Necesita `PAGESPEED_API_KEY` |
| Hallazgos priorizados por severidad | Cumplido | Sin puntuación global (B06) |

**Caso real que cambió el diseño:** `clinicagarcia.es` es un dominio aparcado: HTTPS falla en el saludo TLS y por HTTP sirve una página de aparcamiento con 404. La primera versión evaluaba título, H1, canonical y enlaces de esa página de error (8 hallazgos falsos). Corregido: con 4xx/5xx solo se informa del error; el hallazgo de HTTPS explica el fallo en lenguaje de propietario; el registro guarda el motivo técnico. Reglas pasan a `2026-10-25.2`.

**Seguridad del fetch (B08a), `src/modules/audits/fetcher/`:**

- Solo `http`/`https`, puertos por defecto, sin credenciales; se revalida cada redirección (máximo 5).
- Resolución DNS una vez por petición; se rechaza si **cualquier** IP resuelta no es pública; la conexión va a esa IP validada (sin rebinding) y TLS verifica el certificado contra el nombre real.
- Bloqueados todos los rangos especiales IPv4/IPv6, IPv4 mapeadas en IPv6, y NAT64, 6to4 y Teredo completos.
- Límites por respuesta (bytes descomprimidos, tiempo) y por auditoría (12 peticiones, 12 MB, 45 s). Bomba gzip detenida por tamaño descomprimido.
- Sitemaps: rechazo de DTD y entidades (XXE, «billion laughs»), gzip con límite de salida de 5 MB, solo se extraen `<loc>`.
- El resolutor y la conexión son inyectables solo para pruebas; producción no tiene ninguna excepción para red privada.
- Se respeta `robots.txt` para nuestro agente (`VisibilityPlatformBot`); si prohíbe la portada, no se descarga y se informa.

**Ejecución y recuperación (parte de B07 que aplica aquí):** la auditoría se ejecuta de forma síncrona en la Server Action, con límites duros. Un índice único parcial impide dos auditorías en curso por empresa (probado con 3 simultáneas). Una auditoría que quede «en curso» por una caída se cierra como fallida a los 10 minutos. Una web inaccesible es una auditoría **completada** con hallazgo crítico; «fallida» se reserva a errores internos.

**Render (adelanto de B08b):** la interfaz solo pinta texto; ningún dato de la web auditada se emite como HTML ni como enlace (comprobado: sin `dangerouslySetInnerHTML` en `src`). Las secciones de contenido se ocultan si la portada respondió con error. B08b completo (PDF y Chromium aislado) sigue siendo de la Fase 3.

### Fase 3 — SEO Report (hecha)

**Alcance entregado:** desde una auditoría completada, «Generar informe» produce el diagnóstico para el cliente en HTML y PDF a partir de los datos guardados (no vuelve a consultar la web). El operador lo ve en el navegador y descarga el PDF para entregarlo. No hay enlaces públicos ni pago: la validación comercial es asistida.

| Criterio | Resultado | Evidencia |
|---|---|---|
| Auditar una web y generar un informe | Cumplido | Navegador: informe de `olessium.com` generado en la página de la auditoría |
| Resumen ejecutivo, datos de empresa, resultados técnicos, problemas, recomendaciones priorizadas, evidencias y fuentes, fecha de análisis, limitaciones | Cumplido | 7 secciones numeradas más portada con fecha del análisis y del informe; prueba de presencia en `build-report.test.ts` |
| Descarga PDF | Cumplido | PDF A4 de 3 páginas (138 KB), revisado visualmente página a página; el SHA-256 descargado coincide con el guardado |
| Entregable a un cliente | Cumplido | Texto en lenguaje de propietario, tabla coherente con los hallazgos, sin cifras inventadas (velocidad «no medida»), paginación y procedencia en el pie |
| Plantilla HTML reutilizable | Cumplido | Una sola plantilla para vista previa y PDF |
| Render seguro sin HTML ni recursos externos arbitrarios (B08b) | Cumplido | Ver abajo |

**Seguridad del render (B08b):**

- **Escape por defecto:** todo valor interpolado en la plantilla `html` se escapa; solo los fragmentos creados por la propia plantilla (`SafeHtml`, comprobado con `instanceof`) se insertan tal cual. Además, el tipo impide en compilación pasar otra cosa.
- **Documento sin recursos:** estilos en línea, fuentes del sistema, sin imágenes ni enlaces. Una prueba estructural parsea el informe con datos hostiles y verifica que no hay `script`, `img`, `iframe`, `link`, atributos `on*`, `src` ni `href`, ni `url()` o `@import` en el CSS.
- **Chromium aislado:** JavaScript desactivado, contexto sin conexión, service workers bloqueados y una ruta que aborta toda petición. Prueba: un documento con imagen, hoja de estilos, script, iframe, `@import`, `url()`, `meta refresh`, SVG y la IP de metadatos produce un PDF y el servidor local recibe **0** peticiones.
- **Vista previa con CSP:** `default-src 'none'; style-src 'unsafe-inline'`, sin formularios, sin incrustación, `nosniff`, `no-referrer`, `no-store`. En el navegador no hubo ninguna infracción de CSP.

**Persistencia:** tabla `reports` con copia de los datos de la empresa (editar la empresa no altera un informe ya emitido), el HTML, el PDF exacto entregado y su SHA-256. Regenerar crea una revisión nueva (Codex N01). Las descargas sirven siempre el archivo guardado.

### Fase 4 — GEO / AEO Visibility (hecha; DataForSEO sin verificar en real)

**Alcance entregado:** en la ficha de cada empresa, «Visibilidad en asistentes de IA» permite configurar alias de marca y hasta 5 competidores confirmados, definir hasta 25 preguntas (con sugerencias generadas a partir de actividad, zona y servicios), lanzar mediciones, guardar las respuestas con su metodología, detectar menciones y citas, comparar con los competidores y ver el histórico. La última medición reportable aparece en el informe PDF.

| Criterio | Resultado | Evidencia |
|---|---|---|
| Configurar preguntas | Cumplido | Alta, archivado, límite de 25, duplicados rechazados, sugerencias con tipo (descubrimiento, comparación, sobre la marca) |
| Ejecutar mediciones autorizadas | Cumplido con captura asistida; **DataForSEO PENDING_VERIFICATION** | El operador lanza cada medición. DataForSEO solo se habilita con credenciales y tope mensual; el adaptador está probado contra las formas documentadas, no contra la API real |
| Guardar respuestas y metodología | Cumplido | `geo_observations` guarda texto y fuentes; `geo_runs.config` congela marca, alias, panel, preguntas, mercado, proveedor, repeticiones y versiones, con `methodology_key` SHA-256 |
| Detectar presencia de marca | Cumplido | Detección determinista por palabra completa (sin acentos ni mayúsculas) y por dominio; citas solo desde fuentes estructuradas |
| Resultados verificables | Cumplido | Cada métrica es una fracción k de n con su denominador; la página de la medición muestra cada respuesta, sus menciones y sus fuentes |
| GEO en el informe | Cumplido | Sección 7 «Visibilidad en asistentes de IA (muestra)», solo métricas, nunca el texto de las respuestas; nueva limitación en la sección 8 |

**Proveedores:**

- **Captura asistida (`manual`):** el operador hace la pregunta en ChatGPT y pega la respuesta y las fuentes. No se automatiza la interfaz web de ningún asistente. Las fuentes deben ser `http(s)`.
- **DataForSEO LLM Scraper (ChatGPT), cola Standard:** `task_post` con `tag` propio por observación, `task_get/advanced/{id}` para recoger y `tasks_ready` para reconciliar envíos inciertos. Precio fijado en el código: 1 200 micro-USD por tarea (`dataforseo-llm-scraper-chatgpt-standard@2026-10-25`), consultado en la documentación ese día.

**Gates de la fase:**

- **B04 (presupuesto):** micro-USD enteros en `bigint`, moneda explícita, reserva bajo `pg_advisory_xact_lock`, tope mensual en `GEO_MONTHLY_BUDGET_USD`; sin tope no hay llamadas de pago (fail-closed). Un cargo incierto nunca se libera.
- **B07 (parte GEO):** envío y recogida en dos pasos persistidos; un envío sin respuesta pasa a `uncertain` y se reconcilia por `tag`; un pendiente de más de 2 minutos se marca incierto. La actualización la lanza el operador; no hay worker.
- **M01 (licencia):** los datos de DataForSEO solo entran en un informe si `DATAFORSEO_REDISTRIBUTION_CONFIRMED=true`, que debe ponerse solo tras la confirmación escrita. La captura asistida siempre es reportable.
- **M03 (denominadores):** captura, respuesta presente y mención se separan. Las preguntas que nombran la marca quedan fuera de presencia y cuota de voz y se informan aparte. Sin respuestas, se muestra «Sin datos», nunca 0 %.
- **Muestra frente a búsquedas reales:** la interfaz y el informe dicen «muestra de respuestas» y la limitación aclara que no equivale a búsquedas reales; no se mezcla con datos de búsqueda.

### Fases 2–6 — criterios de entrada

| Fase | Se puede empezar cuando | No se puede cerrar sin |
|---|---|---|
| 2 | Fase 1 cerrada | Fetcher con defensas SSRF probadas (B08 parte fetch); límites de tiempo, bytes, redirecciones y peticiones auxiliares; cuota de PSI comprobada en una cuenta real |
| 3 | Fase 2 cerrada | Render seguro (B08 parte render): evidencia escapada, Chromium sin red externa ni interna; fecha de análisis y fuentes en cada cifra |
| 4 | Fase 1 cerrada (la integración GEO puede avanzar en paralelo a 3) | B04 antes de la primera llamada de pago; B05 antes de guardar métricas históricas; licencia de DataForSEO (M01) antes de entregar sus datos a un cliente |
| 5 | Fase 3 cerrada | B01, B02, B03 y la parte de entrega de B07; aislamiento por workspace probado; requisitos fiscales de factura (M10) antes del primer cobro real |
| 6 | Fases 4 y 5 cerradas | B07 completo (leases, continuaciones, recuperación); sin series falsas ni ausencias como cero (M03, M05) |

## 3. Decisiones técnicas tomadas

| Decisión | Motivo | Alternativa descartada |
|---|---|---|
| **Next.js 16.4 (App Router) + React 19.3 + TypeScript strict** | Stack pedido; mismo framework que conoce el equipo | — |
| **Drizzle ORM + drizzle-kit** | Migraciones SQL explícitas y legibles, imprescindibles para lo que vendrá (restricciones únicas con `NULLS NOT DISTINCT`, índices parciales, RLS si llega Fase 5); sin cliente generado ni motor binario; experiencia previa del equipo con Drizzle en `lead-platform`, sin copiar código de allí | Prisma: válido con Neon, pero el SQL avanzado y los cambios de rol por transacción quedan fuera de su modelo y exigen SQL crudo igualmente |
| **Driver `pg` (node-postgres) por TCP** | Recomendado por la skill `neon-postgres` para Node de larga duración, Vercel con Fluid compute y Neon Functions; el mismo driver sirve para Postgres local | `@neondatabase/serverless`: para edge/serverless sin pool persistente; no aplica hoy |
| **Neon con flujo por ramas**: proyecto `cool-lake-01986386`, rama por defecto `production` intacta, desarrollo y pruebas en la rama `dev` | La skill `neon-postgres` recomienda probar migraciones en una rama antes de producción, y se pidió no modificar una base de producción | Migrar directamente `production` |
| **App por la URL con pooler (`DATABASE_URL`), migraciones por la directa (`DATABASE_URL_UNPOOLED`)** | PgBouncer en modo transacción no conserva estado de sesión; las migraciones lo necesitan (skill `neon-postgres`) | Una sola URL para todo |
| **`sslmode` fijado a `verify-full` en el cliente** | `pg` 8 ya trata `require` como `verify-full` y avisa de que `pg` 9 lo rebajará a cifrado sin verificar el servidor; se fija la verificación completa | Dejar el aviso y heredar el cambio de semántica |
| Postgres 16 local en Docker como alternativa sin red | Útil para trabajar sin conexión; ya no es la base de desarrollo | Mocks de BD: no prueban restricciones ni transacciones |
| **Tailwind 4 + shadcn/ui** (estilo `base-nova`, Base UI, iconos Lucide) | Stack pedido; componentes copiados al repo (`src/components/ui`), sin dependencia de una librería cerrada | — |
| **Zod para entorno y entradas** | Un esquema valida variables de entorno al primer uso (no en el build) | Validación manual |
| **pino** para logs JSON con redacción de credenciales por ruta | Logs estructurados desde el primer día; la redacción está probada | `console.*` sin estructura |
| **Health check en dos niveles** | `/api/health` público devuelve solo `{status}` (Codex M13); el detalle (latencia, migraciones, causa) solo en la vista del operador y en logs | Health detallado público |
| **Migración `0000_baseline` sin objetos** | Valida la cadena de migraciones antes de crear tablas de dominio; la primera tabla llega con la fase que la necesita | Crear tablas de fases futuras por adelantado |
| **Sin SEO Health Score global en el piloto** (B06) | La fórmula de v1 era contradictoria; los hallazgos por severidad aportan la decisión útil sin falsa precisión | Arreglar pesos sin evidencia |
| Navegación con secciones futuras desactivadas, no enlazadas | El menú refleja la hoja de ruta sin páginas vacías | Rutas placeholder |
| **Rama Neon `test` con base `visibility_test` y guardia de dos capas** (Fase 1) | Pruebas de escritura aisladas de `dev` y con imposibilidad técnica de escribir en `production` | Usar la rama `dev` para pruebas; confiar solo en una variable de entorno |
| **Fetcher propio con IP fijada tras validar DNS** (Fase 2) | Única forma de cerrar el rebinding: validar y conectar a la misma dirección; TLS sigue verificando el nombre real | `fetch` global (no permite fijar la IP) o lista de bloqueo previa a una resolución distinta |
| **`parse5` como única dependencia nueva** (Fase 2) | Parser HTML conforme al estándar, con una sola dependencia; extraer encabezados, metas y JSON-LD con expresiones regulares no es fiable | `cheerio` (más pesado) o expresiones regulares |
| **Una sola página por auditoría** (Fase 2) | El roadmap pide empezar por una página y ampliar solo con necesidad; mantiene el coste y el tiempo acotados | Rastrear N páginas del sitemap |
| **Sin puntuación global; reglas versionadas** (Fase 2) | B06: hallazgos con severidad y evidencia aportan la decisión sin falsa precisión. `RULES_VERSION` se guarda en cada auditoría | Índice 0–100 |
| **Auditoría síncrona con límites duros, sin cola** (Fase 2) | Operador único; 1–60 s por auditoría. La cola llega cuando haya ejecuciones programadas o pagadas (B07) | Cola de jobs desde ya |
| **PageSpeed opcional y explícito** (Fase 2) | Sin clave la sección dice «no configurado»; nunca se inventan cifras | Ejecutar Lighthouse local (Chromium en el servidor) |
| **Plantilla HTML propia con escape por defecto, sin React en servidor** (Fase 3) | Control total del documento y un único punto de escape comprobable; el mismo HTML sirve para vista previa y PDF | `renderToStaticMarkup` (restricciones de `react-dom/server` en App Router) o una librería de plantillas |
| **PDF con Chromium headless (`playwright-core` + headless shell), aislado de red** (Fase 3) | Fidelidad de la plantilla HTML; JavaScript y red desactivados | PDF programático (segunda plantilla que diverge) o servicio externo (datos fuera de nuestro control) |
| **PDF entregado guardado en Postgres (`bytea`) con SHA-256** (Fase 3) | Se entrega siempre el mismo archivo; volumen del piloto pequeño | Regenerar al descargar (el archivo cambiaría) u object storage desde ya (P1) |
| **Sin enlaces públicos al informe en esta fase** (Fase 3) | El operador descarga y entrega; evita abrir capacidades compartibles (M12) antes de tener autenticación | Enlaces firmados desde ya |
| **DataForSEO en cola Standard, sin modo Live** (Fase 4) | Un tercio del precio de Live y el envío/recogida en dos pasos es lo que exige B07 | Live ($0,004 por tarea) o Priority |
| **Actualización lanzada por el operador, sin worker** (Fase 4) | Un solo operador; el worker llega con las mediciones programadas (Fase 6) | Proceso en segundo plano desde ya |
| **Captura asistida como proveedor de primera clase** (Fase 4) | Permite validar la fase y vender sin cuenta de pago ni licencia de terceros; no automatiza ninguna interfaz web | Esperar a DataForSEO |
| **El informe muestra solo métricas, no el texto de las respuestas** (Fase 4) | Evita redistribuir contenido generado por terceros y reduce la superficie de inyección en el PDF | Citar respuestas en el informe |
| **`force_web_search: true` y ubicación por nombre de país en inglés** (Fase 4) | Las preguntas de recomendación local necesitan búsqueda web; el nombre del país es lo que pide `location_name` | Coordenadas o códigos numéricos de ubicación |
| **Experiencia real con la API de CrUX, no con el bloque de campo de PageSpeed** (2026-10-26) | Google anuncia la retirada de CrUX en PSI; la API de CrUX es gratuita (150 consultas/min). Se pide la página y, sin datos, el origen, indicando cuál se usó | Leer `loadingExperience` de la respuesta de PSI |
| **Integración obligatoria, sin `skipIf`** (Fase 1) | Una suite verde que omite pruebas da falsa seguridad | Saltar la integración si falta configuración |
| **Dominio canónico en ASCII (punycode), Unicode solo para mostrar** (Fase 1) | Una sola forma comparable para la clave única; la que usarán DNS y HTTP | Guardar Unicode y normalizar al comparar |
| **Clave única sin `www.`, host original conservado** (Fase 1) | Evita duplicar la misma empresa sin asumir que `www` y el dominio raíz sirven lo mismo | Usar el host tal cual como clave |
| **Rutas de ficha y edición bloqueantes (`instant = false`)** (Fase 1) | Con `cacheComponents`, `notFound()` dentro de `Suspense` responde 200; bloqueando, un id inexistente devuelve 404 real. El listado sigue en streaming | Mantener streaming y aceptar 200 en recursos inexistentes |
| Servicio con resultados tipados (`validation`, `duplicate_domain`, `not_found`) y unicidad delegada en la restricción de BD | La concurrencia la resuelve la base, no un `SELECT` previo | Comprobar antes de insertar |

## 4. Matriz progresiva de blockers

Estados: `NOT_APPLICABLE_YET`, `NEEDS_DESIGN`, `BLOCKING_CURRENT_PHASE`, `DOCUMENTED`, `IMPLEMENTED`, `VERIFIED`. Referencias a `13-codex-review.md`.

| Blocker | Riesgo | Fase afectada | Estado | Condición de desbloqueo |
|---|---|---|---|---|
| **B01** Orden anónima e identidad | Compras imputadas a organizaciones ajenas | 5 | NOT_APPLICABLE_YET | Antes de habilitar compra: orden persistida, vinculación por verificación de buzón, tokens hasheados de un uso; pruebas de §B01 |
| **B02** Fulfillment de Stripe | Ejecutar sin cobro o cobrar sin entregar | 5 | NOT_APPLICABLE_YET | Fulfillment idempotente por orden, `payment_status`, pagos asíncronos, validación de producto/importe/moneda/`livemode`; ensayo en modo test |
| **B03** Entitlements | Una compra autoriza auditorías repetidas | 5 | NOT_APPLICABLE_YET | Derecho asignado a un workspace y consumido de forma atómica; separado del derecho de monitorización |
| **B04** Presupuesto exacto | Gasto mal contabilizado o por encima del tope | 4 | **IMPLEMENTED**, verificado con pruebas (no con una llamada real) | Antes de la primera llamada de pago: micro-USD en `bigint`, moneda explícita, reserva bajo bloqueo, fail-closed, sin liberar compras inciertas por TTL. PSI (Fase 2) es gratuito y no lo activa |
| **B05** Metodología reconstruible | Series GEO mezcladas o no explicables | 4 | **IMPLEMENTED** (config congelada y `methodology_key`; el histórico marca los cambios de metodología) | Configuración inmutable por ejecución (prompts, marca, alias, panel, mercado, proveedor, modo, versiones) antes de guardar métricas históricas |
| **B06** SEO Health Score | Cifra con falsa precisión | 2–3 | **IMPLEMENTED** (sin score en la Fase 2) | Las auditorías muestran hallazgos por severidad, sin índice global. Se reconsidera solo con una fórmula única y casos de prueba exactos |
| **B07** Jobs y recuperación | Auditoría pagada sin informe; doble compra o doble email | 2 (síncrono), 4, 5–6 | Fase 2: **IMPLEMENTED** (una en curso por empresa, cierre de colgadas a 10 min). Fase 4: **PARTIAL** (submit/poll persistido, reconciliación de inciertos por `tag`, sin worker). Resto: NEEDS_DESIGN | Fase 2–3 ejecutan la auditoría de forma acotada y síncrona con límite de tiempo, sin cola. Antes de entregas pagadas (5) y ejecuciones programadas (6): persistencia transaccional de transiciones, submit/poll, leases con fencing, entrega única por destinatario |
| **B08a** SSRF y límites del fetch | Peticiones a red interna, agotamiento de recursos | 2 | **VERIFIED** por pruebas automatizadas y contra hosts reales (sin auditoría de seguridad externa) | Validación de destino público en todo fetch (incluidos robots, sitemap, canonical y redirecciones), IP fijada con Host/SNI, puertos 80/443, presupuesto total de bytes/peticiones/tiempo, límites XML/gzip; fixtures de rebinding, IPv6 y sitemap expansivo |
| **B08b** Render seguro de informe | XSS almacenado, peticiones del renderer | 3 | **VERIFIED** por pruebas automatizadas (escape, estructura del documento, Chromium con 0 peticiones salientes) y vista previa con CSP sin infracciones | Contenido estructurado escapado, enlaces solo http/https, Chromium sin red externa ni interna y recursos empaquetados |
| M01 Licencia DataForSEO | Vender datos sin derecho | 4 | **IMPLEMENTED** como control (`DATAFORSEO_REDISTRIBUTION_CONFIRMED`); la confirmación escrita sigue pendiente | Confirmación escrita (texto propuesto en `13` §9.8) antes de entregar sus datos a un cliente |
| M02 Latencias | Plazos imposibles | 4 | NOT_APPLICABLE_YET | Medir p90/p95 reales y decidir modo (Standard/Priority) y política de informe parcial |
| M03 Denominadores y significación | Cifras GEO engañosas | 4 | **IMPLEMENTED** | `capture_status` y `answer_present` separados; fracciones sin lenguaje de significación |
| M04 Marca y zona antes de medir | Medir el negocio equivocado | 1, 4 | **IMPLEMENTED** (alias y competidores confirmados en la Fase 4) | Nombre comercial, actividad, país, ciudad y servicios ya se piden y validan. Alias de marca y competidores confirmados quedan para la Fase 4 |
| M05 Reauditoría y SERP media | Series inventadas | 6 | NOT_APPLICABLE_YET | Salud técnica como foto fechada; top 10/top 20 como KPI principal |
| M06 Permisos por workspace | Acceso cruzado | 5 | NOT_APPLICABLE_YET | Contexto autorizado por actor antes de RLS; pruebas con dos workspaces de una misma organización |
| M07 Retención y borrado | Copias que no se purgan | 3–5 | NEEDS_DESIGN: los informes guardan evidencia y PDF mientras exista la empresa; el borrado de la empresa los elimina en cascada | Política por copia (snapshot, PDF, logs, backups) antes de clientes reales |
| M10 Facturación válida y viabilidad | Cobro sin factura legal | 5 | NOT_APPLICABLE_YET | Procedimiento de factura (manual o herramienta externa) antes del primer cobro real |
| M11 PSI y Google | Métricas de campo inexistentes; OAuth caduca a 7 días en Testing | 2 (PSI), 6 (OAuth) | PSI: **IMPLEMENTED** solo laboratorio con versión de Lighthouse; **PENDING_VERIFICATION** (cuota anónima agotada, falta clave). OAuth: NOT_APPLICABLE_YET | Crear `PAGESPEED_API_KEY` y repetir una auditoría |
| M12 Enlaces de informe | Capacidades filtradas | 3–5 | NOT_APPLICABLE_YET (la Fase 3 no crea enlaces públicos; el operador descarga y entrega) | Tokens separados por propósito, caducidad única, revocación, antes del primer enlace compartible |
| M13 Operación y backups | Restore incompleto, health revelador | 0 (health), despliegue | Health: **IMPLEMENTED**; resto NOT_APPLICABLE_YET | Health público mínimo ya hecho. Backup coherente BD + artefactos antes del primer despliegue |

## 5. Neon: estado de la conexión

**Verificado el 2026-10-25.** Configuración con `neon init` y `neon deploy` (CLI `neon` 8.11.3):

| Elemento | Valor |
|---|---|
| Organización / proyecto | `org-silent-block-02010202` / `cool-lake-01986386` |
| Rama por defecto | `production` (`br-bitter-wave-b96hut4h`): sin migraciones ni datos de la app; no se ha tocado |
| Rama de desarrollo | `dev` (`br-autumn-surf-b9592ciu`), creada desde `production`; **permanente** (sin caducidad desde el 2026-10-25) |
| Región / motor | `aws-eu-central-1`, PostgreSQL 18.6 |
| Ficheros | `neon.ts` (servicios declarados: solo Postgres; política de ramas), `.neon` (puntero a org/proyecto/rama, ignorado en git) |
| Variables en `.env.local` | `DATABASE_URL` (pooler), `DATABASE_URL_UNPOOLED` (directa), `NEON_BRANCH`; `LOG_LEVEL` se conservó |

Operación diaria:

- `neon env pull` refresca las variables de la rama actual.
- `dev` es permanente: `neon.ts` no le asigna TTL y su caducidad se quitó con `neon branches set-expiration dev`. Omitir `ttl` en `neon.ts` no borra una caducidad existente; solo evita ponerla al crear la rama. Las demás ramas nuevas siguen caducando a los 7 días.
- Las pruebas de integración usan la rama `dev`; nunca apuntar `.env.local` a `production` para ejecutarlas.
- Aplicar migraciones a `production` es una decisión explícita, por la URL directa de esa rama, cuando haya un despliegue.

Copias de seguridad de las versiones anteriores de `.env.local` (local y `production`) quedaron en el scratchpad de la sesión, fuera del repositorio.

## 6. Deuda técnica y riesgos pendientes

| ID | Deuda o riesgo | Impacto | Cuándo se paga |
|---|---|---|---|
| D-01 | ~~Rama `dev` con TTL de 7 días~~ | Resuelto el 2026-10-25: `dev` es permanente | — |
| D-02 | `npm audit`: 4 avisos moderados en el `esbuild` transitivo de `drizzle-kit` (afecta al servidor de desarrollo de esbuild, no a la app) | Bajo; herramienta de desarrollo | Al actualizar `drizzle-kit`; no se fuerza un downgrade |
| D-03 | Sin autenticación hasta la Fase 5 | La app no puede exponerse públicamente con datos de empresas | Antes de cualquier despliegue accesible desde internet: barrera mínima (acceso de red privada o autenticación básica del operador) |
| D-04 | `typecheck` necesita `next typegen` antes de `tsc` (tipos globales de rutas) | Ninguno; el script ya lo hace | — |
| D-05 | Sin CI | Validación manual con `npm run check` | Cuando haya un repositorio remoto con Actions disponibles |
| D-06 | Contenedor Docker `visibility-postgres` (puerto 5433), parado tras pasar a Neon | Recurso local sin uso | Borrarlo con `docker rm visibility-postgres` si no se quiere como alternativa sin red |
| D-08 | Vitest 5 falla al mapear la traza de un error lanzado en `globalSetup` y oculta el mensaje | Solo diagnóstico | El `globalSetup` imprime el motivo antes de fallar; quitar el rodeo al actualizar Vitest |
| D-09 | La rama `dev` contiene dos empresas creadas en la verificación manual (`clinicagarcia.es`, `bücher.de`) | Datos de prueba en desarrollo | Borrarlas cuando molesten; no afectan a `test` ni a `production` |
| D-10 | Los selectores de país ofrecen 15 países frecuentes; el servidor acepta cualquier código ISO válido | Un país fuera de la lista no se puede elegir desde el formulario | Ampliar la lista cuando haga falta |
| D-11 | **Google sin clave**: PageSpeed anónimo sigue en 429 (comprobado de nuevo el 2026-10-26) y CrUX exige clave (403 sin ella) | Las secciones de velocidad y de experiencia real salen «no configurado» | Crear una clave en Google Cloud con las APIs «PageSpeed Insights» y «Chrome UX Report» habilitadas y ponerla en `PAGESPEED_API_KEY` (sirve para las dos; `CRUX_API_KEY` es opcional) |
| D-12 | La auditoría corre síncrona dentro de la Server Action (1–60 s) | Una petición HTTP larga; aceptable para el operador | Pasar a cola cuando lleguen auditorías pagadas o programadas (B07) |
| D-13 | «Incluye la portada» del sitemap se calcula sobre una muestra de 50 URLs | Con sitemaps grandes puede quedar «—» (desconocido) | Aceptado; no se presenta como hallazgo |
| D-14 | Solo se analiza un sitemap (el primero declarado o `/sitemap.xml`); los índices no se recorren | Hallazgos de sitemap limitados | Ampliar si un cliente lo necesita |
| D-15 | **Fuentes del PDF verificadas solo en macOS.** La plantilla usa fuentes del sistema; en un servidor Linux el aspecto cambiará | El PDF de producción puede verse distinto al revisado | Antes de desplegar: instalar fuentes en la imagen (p. ej. Liberation o Inter empaquetada como archivo local) y revisar un PDF generado allí |
| D-16 | Chromium headless shell instalado en local (`npx playwright-core install --only-shell chromium`); no forma parte de `npm install` | Un entorno nuevo no genera PDF hasta instalarlo | Documentado en README; en el despliegue, incluirlo en la imagen |
| D-17 | Se lanza un Chromium por informe (1–3 s) | Coste aceptable para el operador | Reutilizar navegador o cola si el volumen crece |
| D-18 | **DataForSEO sin verificar en real**: no hay credenciales | El adaptador puede divergir de la API real en detalles no documentados | Con `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` y un tope pequeño (p. ej. `GEO_MONTHLY_BUDGET_USD=1`), lanzar 3 preguntas y comprobar envío, cargo, recogida y reconciliación |
| D-19 | `location_name` se envía como nombre del país en inglés sin contrastarlo con la lista de ubicaciones de DataForSEO | Una ubicación no reconocida haría fallar la tarea | Contrastar con el endpoint de ubicaciones en la verificación real |
| D-20 | El texto de las respuestas se guarda sin purga (M07 pedía 90 días) | Retención indefinida de contenido de terceros | Antes de clientes reales: purga programada (Fase 6) |
| D-21 | Tope de gasto global, no por empresa; la captura asistida usa una sola repetición; una sola superficie (ChatGPT); AI Overviews vía SERP no implementado | Alcance reducido de la medición | Ampliar cuando haya demanda o volumen |
| D-22 | **Desplegar la migración antes del código.** Durante el desarrollo hubo 500 transitorios («column brand_aliases does not exist») por servir código nuevo con la BD sin migrar | Caída breve en un despliegue | El procedimiento de despliegue (M13) migra primero |
| D-23 | La rama `dev` contiene para Olessium un competidor de ejemplo, 3 preguntas y una medición con respuestas marcadas «[RESPUESTA DE PRUEBA]» | Datos de prueba en desarrollo | Archivarlos o borrarlos cuando molesten; no afectan a `test` ni a `production` |
| D-24 | La prueba de integración de concurrencia de auditorías falló una vez en la suite completa y pasó en las tres repeticiones siguientes | Prueba intermitente: depende de que tres auditorías se solapen en una ventana de 300 ms | Hacer el solapamiento determinista (barrera en el `pageSpeed` simulado) |
| D-07 | `neon init -y` instaló el plugin de Neon (skills y MCP) a nivel de usuario en Claude Code, Codex y VS Code | Configuración global del equipo, no del repo | Ninguno; el servidor MCP de Neon en Claude Code necesita autorizar OAuth con `/mcp` |
| R-01 | Las fases 2–6 dependen de cuentas externas (PSI, DataForSEO, Stripe) aún no abiertas; la Fase 4 se cerró sin la de DataForSEO | Retraso de fases | Abrir PSI antes de Fase 2; DataForSEO antes de Fase 4; Stripe test antes de Fase 5 |
| R-02 | El NORTE del workspace `lead-platform` sigue en mantenimiento | Conflicto de foco del único desarrollador | Decisión del owner; este repo no depende de ello técnicamente |

## 7. Divergencias con la especificación `00`–`12`

| Tema | Especificación v1 | Decisión operativa | Motivo |
|---|---|---|---|
| Base de datos | Postgres en el VPS compartido con `lead-platform` (ADR-015) | Neon PostgreSQL | Decisión del owner en el cambio de estrategia |
| Librería de UI | Sin librería; primitivas propias | shadcn/ui | Decisión del owner |
| Reutilización de `lead-platform` | Copia con procedencia de jobs, crypto, RLS, email (ADR-004) | Nada copiado en la Fase 0; se escribe lo que cada fase necesita | Codex M08 y principio de no arrastrar dependencias |
| Score global | Índice de salud técnica en P0 | Retirado del piloto | B06 |
| Orden de construcción | P0 completo (30 historias) antes de vender | Fases incrementales; venta asistida desde la Fase 3 | Cambio de estrategia del owner |
| Pago | Stripe Checkout en P0 | Fase 5; validación comercial asistida antes | Cambio de estrategia del owner |

## 8. Registro de fases cerradas

### Fase 0 — cerrada el 2026-10-25

**Archivos creados:** `package.json`, `package-lock.json`, `.nvmrc`, `.gitignore`, `.env.example`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs` (Tailwind 4 vía el loader `@tailwindcss/turbopack` en `next.config.ts`), `components.json`, `drizzle.config.ts`, `vitest.config.mts`, `README.md`; `src/app/{layout.tsx,page.tsx,globals.css,favicon.ico,api/health/route.ts}`; `src/components/{layout/app-header.tsx,system-status.tsx,ui/{button,card,badge,separator}.tsx}`; `src/config/env.ts`; `src/db/{client.ts,migrate.ts,schema/index.ts,migrations/0000_baseline.sql}`; `src/lib/{logger.ts,utils.ts}`; `src/modules/system/health.ts`; `tests/{setup.ts,unit/env.test.ts,unit/logger.test.ts,integration/health.test.ts}`.

**Migraciones:** `0000_baseline` (sin objetos de dominio), aplicada en Postgres local y en Neon `dev`. No aplicada en `production`.

**Pruebas:** 14 pruebas en 4 ficheros. Validación de entorno y elección de URL de migración (7), redacción y formato del logger (2), fijado de `sslmode` (3), health check contra Neon `dev` (1) y con base inalcanzable (1).

**Siguiente tarea:** Fase 1, `src/modules/workspaces/domain.ts` con pruebas de normalización de dominio.

### Fase 1 — cerrada el 2026-10-25

**Archivos creados:** `src/modules/workspaces/{domain,validation,schema,service,presentation}.ts`; `src/app/workspaces/{page.tsx,actions.ts,new/page.tsx,[id]/page.tsx,[id]/not-found.tsx,[id]/edit/page.tsx}`; `src/components/workspaces/workspace-form.tsx`; `src/components/page-loading.tsx`; `src/components/ui/{input,label,textarea,table}.tsx` (shadcn/ui); `src/db/{test-guard.ts,prepare-test-db.ts}`; `src/db/migrations/0001_workspaces.sql`; `tests/unit/{setup.ts,health.test.ts,test-guard.test.ts,workspaces/domain.test.ts,workspaces/validation.test.ts}`; `tests/integration/{global-setup.ts,setup.ts,db.ts,test-guard.test.ts,workspaces.test.ts}`.

**Archivos modificados:** `src/db/schema/index.ts` (exporta `workspaces`), `src/components/layout/app-header.tsx` (enlace «Empresas»), `src/app/page.tsx` (estado de fases), `tests/integration/health.test.ts` (usa la base de pruebas), `vitest.config.mts` (proyectos `unit` e `integration`), `package.json` (scripts de prueba y `db:test:prepare`), `neon.ts` (`test` sin caducidad), `.env.example`, `README.md`. Eliminado `tests/setup.ts`.

**Migraciones:** `0001_workspaces` aplicada en `dev` y en `test` (2 migraciones en cada una). `production` sin tablas de la app (comprobado con una consulta de solo lectura).

**Pruebas:** 94 en 10 ficheros. Normalización de dominio (53), validación del formulario (10), guardia de base de pruebas (5 unitarias y 1 de integración), servicio de empresas contra PostgreSQL real (11: crear, duplicado, 5 creaciones concurrentes, entrada inválida, consulta, listado, edición, edición inválida, duplicado en edición, no encontrado, restricción de BD), salud, entorno, logger y SSL.

**Dependencias nuevas:** ninguna de npm; cuatro componentes de shadcn/ui copiados al repositorio.

**Siguiente tarea:** Fase 2, validador de destino público para el fetcher (B08a).

### Fase 2 — cerrada el 2026-10-25

**Archivos creados:** `src/modules/audits/{fetcher/address-policy.ts,fetcher/safe-fetch.ts,robots.ts,sitemap.ts,html.ts,pagespeed.ts,rules.ts,collect.ts,schema.ts,service.ts,deps.ts,presentation.ts}`; `src/app/workspaces/[id]/audits/{actions.ts,[auditId]/page.tsx}`; `src/components/audits/run-audit-button.tsx`; `src/db/migrations/0002_audits.sql`; `tests/support/fake-fetcher.ts`; `tests/unit/audits/{address-policy,safe-fetch,robots-sitemap,html,pagespeed,rules,collect}.test.ts`; `tests/integration/audits.test.ts`.

**Archivos modificados:** `src/app/workspaces/[id]/page.tsx` (sección de auditorías), `src/db/schema/index.ts`, `src/config/env.ts` (`PAGESPEED_API_KEY` opcional), `src/components/layout/app-header.tsx` (retirado el marcador «Auditorías»), `src/app/page.tsx`, `.env.example`, `tests/unit/env.test.ts`, `package.json` (`parse5`).

**Migraciones:** `0002_audits` aplicada en `dev` y `test` (3 migraciones en cada una). `production` sin tablas de la app (comprobado con una consulta de solo lectura).

**Pruebas:** 239 en total. Unitarias: 217 (de ellas 135 de auditoría: política de direcciones 47, fetcher 35, robots y sitemap 14, HTML 13, PageSpeed 6, reglas 14, orquestación 6). Integración: 22 (auditorías 9: guardado completo, web inaccesible, empresa inexistente, concurrencia, auditoría colgada, auditoría reciente, error interno, pertenencia y borrado en cascada). `npm audit --omit=dev`: 0 vulnerabilidades.

**Dependencias nuevas:** `parse5` 8.0.1.

**Siguiente tarea:** Fase 3, plantilla HTML del informe con escape total y pruebas de contenido hostil.

### Fase 3 — cerrada el 2026-10-25

**Archivos creados:** `src/modules/reports/{html-template.ts,report-styles.ts,build-report.ts,render-pdf.ts,schema.ts,service.ts}`; `src/app/workspaces/[id]/audits/[auditId]/{actions.ts,reports/[reportId]/route.ts,reports/[reportId]/pdf/route.ts}`; `src/components/reports/generate-report-button.tsx`; `src/db/migrations/0003_reports.sql`; `tests/unit/reports/{html-template,build-report}.test.ts`; `tests/integration/{render-pdf,reports}.test.ts`.

**Archivos modificados:** `src/app/workspaces/[id]/audits/[auditId]/page.tsx` (tarjeta «Informe para el cliente»), `src/db/schema/index.ts`, `src/components/layout/app-header.tsx` (retirado el marcador «Informes»), `src/app/page.tsx`, `package.json` (`playwright-core`), `README.md`.

**Migraciones:** `0003_reports` aplicada en `dev` y `test` (4 migraciones en cada una). `production` sin tablas de la app (consulta de solo lectura).

**Pruebas:** 263 en total: 232 unitarias (15 del informe: escape, secciones, estructura sin contenido activo, determinismo, coherencia tabla-hallazgos, portada inaccesible, informe limpio) y 31 de integración (2 de aislamiento de Chromium y 7 del servicio de informes: PDF real guardado, congelación de datos de empresa, auditoría no completada, pertenencia y nombre de archivo).

**Verificación manual:** informe de `olessium.com` generado, PDF de 3 páginas revisado visualmente, SHA-256 descargado igual al guardado, cabeceras de vista previa y descarga comprobadas, 404 en informes ajenos o inexistentes.

**Dependencias nuevas:** `playwright-core` 1.64.1 y el navegador Chromium headless shell (fuera de npm).

**Siguiente tarea:** Fase 4, alias de marca y competidores confirmados en la ficha de la empresa.

### Fase 4 — cerrada el 2026-10-25 (DataForSEO pendiente de verificación real)

**Archivos creados:** `src/modules/geo/{detection,prompt-suggestions,metrics,budget,dataforseo,schema,service,deps,presentation}.ts`; `src/app/workspaces/[id]/geo/{page.tsx,actions.ts,runs/[runId]/page.tsx}`; `src/components/geo/geo-forms.tsx`; `src/db/migrations/0004_geo.sql`; `tests/unit/geo/{detection,prompt-suggestions,metrics,budget,dataforseo}.test.ts`; `tests/integration/geo.test.ts`.

**Archivos modificados:** `src/modules/workspaces/schema.ts` (`brand_aliases`, máximo 10), `src/modules/reports/{schema,service,build-report}.ts` (`geo_run_id`, sección 7, plantilla `2026-10-25.2`), `src/app/workspaces/[id]/audits/[auditId]/actions.ts` (control M01), `src/app/workspaces/[id]/page.tsx` (tarjeta GEO), `src/app/page.tsx`, `src/config/env.ts`, `.env.example`, `src/db/schema/index.ts`, pruebas de entorno e informe.

**Migraciones:** `0004_geo` aplicada en `dev` y `test` (5 migraciones y 9 tablas en cada una). `production` sin tablas de la app (consulta de solo lectura).

**Pruebas:** 313 en total: 263 unitarias (29 de GEO: detección, sugerencias, métricas, conversión monetaria y adaptador de DataForSEO con respuestas simuladas) y 50 de integración (servicio GEO con presupuesto, reserva concurrente, envío incierto, reconciliación, recogida, y control de licencia en el informe).

**Verificación manual:** en `dev`, para Olessium: alias, un competidor, 3 preguntas y una medición asistida con respuestas de prueba (una con una cadena XSS). Se comprobaron métricas (presencia 1/1, cita 1/1, cuota de voz 50/50, captura 3/3) y el rechazo de una fuente `javascript:`. Informe nuevo con secciones 1–8, PDF revisado visualmente, y sin texto de respuestas ni XSS en el HTML del informe.

**No verificado:** ninguna llamada real a DataForSEO (D-18, D-19).

**Dependencias nuevas:** ninguna.

**Siguiente tarea:** verificar DataForSEO en real cuando haya credenciales y tope; en paralelo, Fase 5 (B01, B02, B03 antes de abrir acceso al cliente).

### Ampliación gratuita — 2026-10-26

**Alcance:** la auditoría consulta la API Chrome UX Report (gratuita): LCP, INP, CLS, FCP y TTFB reales de visitantes con Chrome en el móvil (percentil 75, 28 días). Se consulta la página y, si no tiene datos, todo el origen. Nueva regla `field_cwv_failed` (mejora si alguna métrica es mejorable, importante si alguna es mala); `RULES_VERSION` `2026-10-26.1`. Nueva fila y fuente en el informe; plantilla `2026-10-26.1`. Las auditorías anteriores no muestran la fila.

**Archivos:** nuevo `src/modules/audits/crux.ts` y `tests/unit/audits/crux.test.ts`; modificados `collect.ts`, `deps.ts`, `rules.ts`, `presentation.ts`, la página de la auditoría, `build-report.ts`, `env.ts`, `.env.example` y sus pruebas. Sin migración (los hechos se guardan en el JSON de la auditoría).

**Pruebas:** 329 en total (279 unitarias, 50 de integración).

**No verificado en real:** falta la clave de Google (D-11). Sin clave, la API real responde 403 y la sección dice «no configurado», comprobado en el navegador con una auditoría nueva de Olessium en `dev`.

## 9. Backlog (aparcado por decisión del owner, 2026-10-26)

Primero todo lo gratuito; lo siguiente queda aparcado.

| ID | Elemento | Por qué está aquí | Qué hace falta para retomarlo |
|---|---|---|---|
| BL-01 | **DataForSEO en real** (medición automática de ChatGPT) | De pago | Cuenta con saldo, `DATAFORSEO_LOGIN` y `DATAFORSEO_PASSWORD` de la API, tope `GEO_MONTHLY_BUDGET_USD`, prueba con 3 preguntas (D-18, D-19). Confirmación escrita de licencia antes de usar sus datos en informes (M01) |
| BL-02 | **Google Search Console** (clics, impresiones, posiciones, indexación) | Gratuita, pero exige que cada cliente autorice el acceso a su propiedad (OAuth) | Autenticación y cuentas de cliente (Fase 5), app OAuth verificada por Google, guardado cifrado de tokens |
| BL-03 | **Google Analytics 4** (visitas reales) | Igual que BL-02 | Igual que BL-02 |
| BL-04 | **Bing Webmaster Tools** | Gratuita, pero requiere que el cliente verifique su web y comparta acceso | Igual que BL-02 |
| BL-05 | Superficies de IA adicionales (AI Overviews de Google vía SERP, Perplexity, Gemini) | De pago a través de proveedores | Después de BL-01 |

