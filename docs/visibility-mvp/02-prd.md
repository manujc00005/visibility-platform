# 02 — PRD: requisitos funcionales y no funcionales

**Versión:** 1 (2026-10-25). **Estado:** PROPUESTO, pendiente de revisión cruzada.
**Depende de:** `00-analysis-comparison.md` §7, `01-product-vision.md`, `03-mvp-scope.md`. Los niveles P0/P1/P2 son los de `03`; ante discrepancia, manda `03`.

Convenciones: RF = requisito funcional; RNF = no funcional; CA = criterio de aceptación (solo se detallan para P0). Entidades en `código` según el vocabulario canónico de `00` §7 y `05-data-model.md`.

## 1. Clasificación de métricas

Toda cifra que el producto muestra pertenece a una de tres clases, visible en la UI y en el informe mediante una etiqueta. Es un requisito transversal (RF-T05).

| Clase | Significado | Ejemplos | Cómo se presenta |
|---|---|---|---|
| `public` | Obtenido directamente de recursos públicos del dominio o de superficies públicas observadas por el propio sistema | HTML de las páginas, `robots.txt`, `sitemap.xml`, cabeceras HTTP, JSON-LD; **respuestas IA observadas** y **SERP observadas** cuando el proveedor devuelve la respuesta real de la interfaz (`ui_scraper`, `serp`) | «Observado el {fecha} desde {país}» |
| `third_party_estimate` | Medición producida por un tercero bajo condiciones que no son las del usuario final, o estimación | Core Web Vitals de laboratorio (PageSpeed Insights), posiciones devueltas por el `SerpProvider` (una SERP concreta, un país, un dispositivo), respuestas obtenidas por API de modelo (`api_with_search`, `api_no_search`) | «Estimación de {proveedor}, {condición de captura}, {n} muestras» |
| `owner_required` | Solo accesible con autorización del propietario del sitio | Search Console (clics, impresiones, consultas, estado de indexación), GA4, Google Business Profile | Si no está conectado: «Requiere conectar {fuente}», sin cifra inventada |

Regla: una métrica nunca cambia de clase por el modo de presentación. Una posición media calculada sobre SERP observadas sigue siendo `third_party_estimate` aunque se muestre como tendencia.

## 2. Métricas y fórmulas

### 2.1 Definiciones previas

- **Observación**: una fila de `observations`: una ejecución de un prompt (versión concreta) en una superficie, con una condición de captura, en una ventana programada y con un índice de repetición.
- **Respuesta válida**: observación con `status = completed`, sin error de proveedor, y `response_text` no vacío tras normalización. Las observaciones `failed`, `timeout` o con texto vacío **no** entran en denominadores de presencia; sí entran en cobertura operativa.
- **Mención**: coincidencia determinista (insensible a mayúsculas, acentos y puntuación) del nombre de marca o de uno de sus alias aprobados en el texto normalizado de una respuesta válida. Una marca cuenta **como máximo una vez por respuesta**.
- **Cita propia**: URL devuelta como fuente por la superficie (`citations`) cuyo dominio registrable coincide con el dominio principal o secundario del `workspace`.
- **Panel de marcas**: la marca del workspace más sus `competitors` activos en la ventana.
- **Pregunta válidamente evaluada**: prompt con al menos una respuesta válida en la ventana y superficie consideradas.

### 2.2 Las cinco métricas de visibilidad IA

Se calculan **por superficie, por ventana y por versión de prompts**; nunca se promedian superficies entre sí sin ponderación declarada (y en el MVP no se declara ninguna: no se promedian).

| Métrica | Numerador | Denominador | Rango | Nota |
|---|---|---|---|---|
| **Presencia de marca** | Respuestas válidas con ≥ 1 mención de la marca | Respuestas válidas | 0–100 % | La cifra principal de «Visibilidad IA» |
| **Tasa de cita** | Respuestas válidas con ≥ 1 cita a un dominio propio | Respuestas válidas | 0–100 % | Mide si la web es fuente, no solo si la marca se nombra |
| **Cuota de voz** | Presencias de la marca (respuestas válidas en que aparece) | Suma de presencias de todas las marcas del panel | 0–100 % | Cada marca cuenta máximo una vez por respuesta; si ninguna marca aparece en ninguna respuesta, el valor es «sin datos», no 0 % |
| **Cobertura de preguntas** | Prompts con ≥ 1 presencia de la marca | Prompts válidamente evaluados | 0–100 % | Responde a «¿en cuántas preguntas salgo alguna vez?» |
| **Cobertura operativa** | Observaciones obtenidas (`completed`) | Observaciones programadas | 0–100 % | Se publica siempre junto a las demás. Si < 80 %, las otras cuatro se marcan «muestra incompleta» |

Los prompts de intención `branded` (que nombran la marca) se excluyen de presencia, cuota de voz y cobertura de preguntas, y se reportan en una fila aparte «Preguntas sobre tu marca».

**Intervalo de muestra**: junto a cada porcentaje se muestra `n` (respuestas válidas) y un intervalo de Wilson al 95 % cuando `n ≥ 5`. Con `n < 5` se muestra solo la fracción (`2 de 3`). Variaciones entre ventanas cuyos intervalos se solapan se etiquetan «sin cambio significativo».

### 2.3 Métricas SERP

| Métrica | Definición |
|---|---|
| Posición por keyword | Primera posición orgánica del dominio propio en la SERP observada (`serp_positions`); «> 20» si no aparece en la profundidad contratada |
| Posición media | Media de las posiciones de las keywords en que el dominio aparece, con el nº de keywords «no aparece» indicado aparte. Nunca se asigna 21 o 100 a las ausentes |
| Keywords en top 3 / top 10 / top 20 | Conteos sobre las keywords seguidas |
| Presencia en AI Overview | Fracción de keywords con AI Overview en que el dominio propio es fuente citada |

### 2.4 Índice de salud técnica (Módulo A)

Índice **propio**, 0–100, **no comparable** con scores de Lighthouse, Semrush, Ahrefs ni ninguna otra herramienta. Su fórmula se imprime en el informe.

```
Índice = 100 − Σ_c min(Pen_c, Cap_c)
```

donde para cada categoría `c`:

- `Pen_c` = suma de penalizaciones de los `audit_findings` de esa categoría: `critical` = 10, `warning` = 3, `info` = 0, multiplicada por la fracción de páginas auditadas afectadas (mínimo 0,25 para que un problema en una sola página pese).
- `Cap_c` = tope de la categoría, para que una sola categoría no hunda el índice.

| Categoría | Cap_c | Ejemplos de hallazgos |
|---|---|---|
| Indexabilidad | 25 | portada `noindex` (critical); páginas del sitemap bloqueadas por robots (critical); 4xx/5xx en páginas del sitemap (warning) |
| Metadatos | 15 | `title` ausente (critical) o duplicado (warning); `meta description` ausente o fuera de longitud (warning) |
| Estructura | 10 | sin H1 (warning); varios H1 (info); jerarquía rota (info) |
| Canonicals y sitemap | 15 | canonical a 404 o a redirección (critical); sin sitemap (warning); sitemap con URLs que no responden 200 (warning) |
| Datos estructurados | 10 | JSON-LD inválido (warning); sin `Organization`/`LocalBusiness` (warning si negocio local, info si no) |
| Rendimiento | 15 | LCP de laboratorio > 4 s (critical), 2,5–4 s (warning); CLS > 0,25 (warning); INP de campo pobre si hay CrUX (warning) |
| SEO local | 5 | sin `LocalBusiness` ni NAP detectable (warning); NAP inconsistente entre páginas (warning). Solo si `is_local = true`; si no, Cap = 0 y la categoría no aparece |
| Seguridad y HTTPS | 5 | sin HTTPS (critical); sin redirección http→https (warning); contenido mixto (info) |

Suma de caps = 100 (95 si no es negocio local; en ese caso el índice se reescala a 100 y se indica).

Cada hallazgo guarda en `audit_findings` su categoría, severidad, páginas afectadas, evidencia (fragmento o cabecera) y la regla que lo produjo con su versión (`rule_id`, `rule_version`). El índice se recalcula solo si cambia la versión de metodología, y entonces se muestra la versión junto al número.

### 2.5 Metadatos obligatorios de toda cifra (RF-T04)

Toda cifra almacenada o mostrada lleva: nº de muestras (`n`), superficie, condición de captura (`ui_scraper | serp | api_with_search | api_no_search | owner_api`), país, idioma, versión del conjunto de prompts, versión de metodología, fecha/ventana y clase (`public | third_party_estimate | owner_required`). En la UI se muestran en un tooltip o en una línea de pie; en el PDF, en la sección «Limitaciones de la medición» y al pie de cada gráfico.

## 3. Requisitos funcionales

### Módulo A — Auditoría de dominio

| ID | Requisito | Nivel | Criterios de aceptación (P0) |
|---|---|---|---|
| RF-A01 | Formulario público acepta dominio, email, sector (lista cerrada), ciudad opcional y marca `is_local`. Normaliza el dominio (quita protocolo y ruta, pasa a minúsculas, resuelve www/no-www tras la primera petición) | P0 | CA: `HTTPS://Www.Ejemplo.es/contacto` se normaliza a `ejemplo.es`; dominios inválidos o IPs se rechazan con mensaje; el dominio normalizado se guarda en `audits.domain` |
| RF-A02 | La auditoría solo se encola tras pago confirmado (RF-E01) o entitlement manual | P0 | CA: sin fila en `payments` con `status=succeeded` o `entitlements` activo no existe job `audit.run` |
| RF-A03 | Descubrimiento acotado: portada, `robots.txt`, `sitemap.xml` (y sitemaps índice, un nivel), hasta `max_pages` del plan (30 en P0); si no hay sitemap, enlaces internos de la portada hasta el mismo límite | P0 | CA: con un sitemap de 500 URLs se auditan 30 y `audits.pages_discovered=500`, `pages_audited=30`; sin sitemap se auditan hasta 30 enlaces internos únicos |
| RF-A04 | Para cada `audit_page`: código de estado, cadena de redirecciones, `title`, `meta description`, `meta robots`, `X-Robots-Tag`, canonical, H1–H3, JSON-LD, `hreflang`, `og:title/description/image`, tamaño HTML | P0 | CA: cada campo se persiste o se marca `null` con motivo (`timeout`, `non_html`, `blocked_by_robots`) |
| RF-A05 | Indexabilidad observable: `noindex` (meta o cabecera), bloqueo por `robots.txt`, 4xx/5xx, redirección a otro dominio, canonical a otra URL | P0 | CA: una página del sitemap con `noindex` produce hallazgo `critical` categoría indexabilidad |
| RF-A06 | Reglas de hallazgos con `rule_id`, `rule_version`, severidad, categoría, páginas afectadas y evidencia | P0 | CA: el catálogo de reglas P0 (≥ 25 reglas) está documentado y cada hallazgo referencia una regla |
| RF-A07 | Canonicals: ausente, no autorreferente, a URL que redirige, a 404, a otro dominio | P0 | CA: canonical a 404 → `critical` |
| RF-A08 | Sitemap y robots: existencia, parseo, URLs que no responden 200, sitemap bloqueado por robots, `Sitemap:` declarado en robots | P0 | CA: sitemap inexistente → `warning` |
| RF-A09 | Datos estructurados: extracción de JSON-LD, validación sintáctica, lista de `@type` presentes, presencia de `Organization`/`LocalBusiness` | P0 | CA: JSON-LD malformado → `warning` con fragmento |
| RF-A10 | Rendimiento: muestras de PageSpeed Insights (laboratorio y campo si existe) para portada + 3 páginas, guardadas en `performance_samples` con `strategy` móvil | P0 | CA: fallo de PSI no bloquea la auditoría; la categoría rendimiento se marca «no disponible» y Cap se excluye del índice con nota. **UNVERIFIED** cuota y términos de PSI: condición previa (ver `11`) |
| RF-A11 | SEO local (si `is_local`): `LocalBusiness`, NAP detectado en portada y contacto, consistencia, enlace a Maps | P0 | CA: sin NAP detectable → `warning` local |
| RF-A12 | HTTPS, redirección http→https, consistencia www/no-www, contenido mixto en portada | P0 | CA: sin HTTPS → `critical` |
| RF-A13 | Muestra GEO/AEO en la auditoría: 10 prompts generados (RF-B02 sin aprobación) × 2 superficies × 3 repeticiones; detección de marca y competidores; etiquetada «muestra puntual» | P0 | CA: `monitoring_runs.kind=audit_baseline`; el informe nunca la llama tendencia |
| RF-A14 | SERP de 10 keywords derivadas del sector + ciudad, top 20 | P0 | CA: `serp_positions` con 10 keywords; keywords no editables en la auditoría |
| RF-A15 | Cálculo del índice de salud técnica según §2.4 y clasificación de métricas según §1 | P0 | CA: test unitario de la fórmula con casos: web perfecta = 100; portada `noindex` + sin HTTPS = 100 − 10·1 − 10·1 = 80 (si solo portada auditada) |
| RF-A16 | Competidores en la auditoría: 3 propuestos por LLM a partir de sector y ciudad, confirmables por el cliente después (no antes del PDF) | P0 | CA: los 3 se guardan en `competitors` con `source=suggested` |
| RF-A17 | Auditoría con GSC (consultas, impresiones, cobertura de indexación) | P1 | — |
| RF-A18 | Enlaces rotos internos, imágenes sin `alt`, peso de página | P1 | — |
| RF-A19 | Hasta 200 páginas | P2 | — |

### Módulo B — Monitorización GEO/AEO

| ID | Requisito | Nivel | Criterios de aceptación (P0) |
|---|---|---|---|
| RF-B01 | Registro de marca en `workspaces`: nombre, hasta 5 alias, dominio principal, dominios secundarios, país, idioma, sector, servicios, `is_local` | P0 | CA: cambiar un alias crea `audit_log` y no altera observaciones pasadas |
| RF-B02 | Generación asistida: LLM propone 40 prompts desde la ficha, agrupados por intención `discovery / comparison / recommendation / decision / branded`; los de descubrimiento no incluyen la marca | P0 | CA: salida validada por esquema; ningún prompt no-`branded` contiene la marca ni sus alias (test) |
| RF-B03 | Aprobación y edición hasta `max_prompts` del plan (25 en P0). Sin aprobación no se encola gasto | P0 | CA: con 0 prompts aprobados el planificador no crea `monitoring_runs` |
| RF-B04 | Versionado: editar texto, país, idioma o intención de un prompt aprobado crea nueva versión (`prompts.version`, `parent_id`), retira la anterior y marca ruptura en series | P0 | CA: las observaciones antiguas conservan `prompt_version_id`; el gráfico muestra una línea vertical en la fecha de cambio |
| RF-B05 | Competidores: 3 manuales en P0 (nombre, dominio, alias) | P0 | CA: máximo del plan exigido en servidor |
| RF-B06 | Sugerencia de competidores por dominios más citados | P1 | — |
| RF-B07 | Planificación semanal: un `monitoring_run` por (workspace, superficie, ventana) con `scheduled_for`; observaciones repartidas en ≤ 48 h respetando el límite de concurrencia del proveedor | P0 | CA: clave única `(workspace_id, surface, capture_condition, prompt_set_version, window_start)`; relanzar el planificador no crea duplicados |
| RF-B08 | Línea base al activar el seguimiento (primer run inmediato) | P0 | CA: `monitoring_runs.kind=baseline` |
| RF-B09 | Detección determinista de menciones (marca, alias, competidores) sobre texto normalizado | P0 | CA: test con 20 casos (acentos, mayúsculas, posesivos, alias parciales rechazados) |
| RF-B10 | Extracción de citas: URLs devueltas por la superficie, normalizadas a dominio registrable, marcadas `own | competitor | other` | P0 | CA: `https://www.ejemplo.es/blog/x?utm=1` → dominio `ejemplo.es`, `kind=own` |
| RF-B11 | Verificación de citas (HEAD/GET, estado, fecha) | P1 | — |
| RF-B12 | Comparación entre superficies por pregunta, sin promediar | P0 | CA: la tabla muestra una columna por superficie y ninguna columna «media» |
| RF-B13 | Superficies P0: `chatgpt` (`ui_scraper`) y `google_aio` (`serp`). P1: `gemini` (`ui_scraper`), `perplexity` (`api_with_search`) | P0/P1 | CA: añadir una superficie no exige migración de datos, solo configuración tipada y adaptador |
| RF-B14 | SERP semanal: 30 keywords, top 20 | P0 | CA: `serp_positions` por (keyword, fecha, dispositivo, país) |
| RF-B15 | Histórico: observaciones 24 meses; `response_text` 90 días (job de purga) | P0 | CA: job `retention.sweep` vacía `response_text` > 90 días conservando `response_hash` y métricas |
| RF-B16 | Cálculo de las cinco métricas de §2.2 en `metric_rollups` por (workspace, superficie, ventana, prompt_set_version) | P0 | CA: test con un conjunto fijo de observaciones que reproduce los cinco valores esperados |
| RF-B17 | Ejecuciones manuales descontadas de cuota | P1 | — |
| RF-B18 | Alertas por caída | P2 | — |

### Módulo C — Dashboard de empresa

| ID | Requisito | Nivel | Criterios de aceptación (P0) |
|---|---|---|---|
| RF-C01 | Overview: 4 tarjetas (índice de salud técnica, presencia IA, cuota de voz, posición media SERP) con delta frente a la ventana anterior y `n`; bloque «Qué cambió / Sobre qué muestra / Qué merece revisar» | P0 | CA: cada tarjeta muestra `n` y la clase de métrica; con una sola ventana el delta dice «primera medición» |
| RF-C02 | SEO: hallazgos de la última auditoría agrupados por categoría y severidad; posiciones SERP | P0 | CA: filtros por severidad; enlace a la página afectada |
| RF-C03 | SEO con GSC: clics, impresiones, consultas, páginas | P1 | — |
| RF-C04 | Visibilidad IA: tabla prompt × superficie con presencia, cita propia, `n`, última respuesta de ejemplo (texto 90 días) | P0 | CA: prompts `branded` en bloque aparte |
| RF-C05 | Competidores: cuota de voz por marca del panel y dominios más citados por superficie | P0 | CA: «sin datos» cuando ninguna marca aparece |
| RF-C06 | Evolución: series semanales de las 4 tarjetas con marcas de ruptura; ventana P0 = desde el alta | P0 | CA: cambio de versión de prompts dibuja marca vertical con tooltip |
| RF-C07 | Recomendaciones: lista priorizada por reglas (hallazgo → acción → impacto cualitativo `alto/medio/bajo` → esfuerzo) | P0 | CA: cada recomendación enlaza al hallazgo que la origina |
| RF-C08 | Informes: lista con fecha, tipo, estado, descarga PDF | P0 | CA: descarga por enlace firmado con caducidad |
| RF-C09 | Vista agencia: lista de workspaces con semáforo | P1 | — |
| RF-C10 | Vista admin SaaS: organizaciones, coste por organización/proveedor del mes, jobs `dead`, conexiones rotas, reservas, activación manual de entitlements, lista de `service_requests` | P0 | CA: accesible solo con rol de plataforma; toda acción registra `audit_log` |
| RF-C11 | Exportación CSV/JSON | P1 | — |
| RF-C12 | Marca de agencia | P2 | — |

### Módulo D — Informe PDF

| ID | Requisito | Nivel | Criterios de aceptación (P0) |
|---|---|---|---|
| RF-D01 | Plantilla HTML única para vista web e impresión | P0 | CA: la misma ruta renderiza web y se imprime a PDF |
| RF-D02 | Secciones: resumen ejecutivo; situación inicial; problemas detectados; comparativa competitiva; evidencias; oportunidades; acciones recomendadas con prioridad; limitaciones de la medición | P0 | CA: test de presencia de las 8 secciones en el HTML |
| RF-D03 | El informe se genera desde `report_snapshots` (JSON congelado con todas las cifras y sus metadatos) | P0 | CA: regenerar el PDF desde el mismo snapshot produce el mismo contenido (hash del HTML igual) |
| RF-D04 | PDF por Chromium headless en el worker, cola `report` | P0 | CA: ≤ 60 s; tamaño ≤ 5 MB |
| RF-D05 | Enlace firmado con caducidad (72 h, renovable desde el dashboard) | P0 | CA: enlace caducado → 410 |
| RF-D06 | Email al cliente con el enlace | P0 | CA: envío registrado en `audit_log` |
| RF-D07 | Informe mensual automático para suscriptores (día 2) | P1 | — |
| RF-D08 | Marca de agencia; programación personalizada | P2 | — |

### Módulo E — Monetización

| ID | Requisito | Nivel | Criterios de aceptación (P0) |
|---|---|---|---|
| RF-E01 | Pago único de auditoría con Stripe Checkout; webhook `checkout.session.completed` verificado por firma crea `payments`, `organizations`, `workspaces`, `users` (si no existen) y encola `audit.run` | P0 | CA: webhook repetido no duplica nada (`payments.stripe_event_id` único); firma inválida → 400 y `audit_log` |
| RF-E02 | `entitlements` con `billing_source` (`stripe | manual | bundle_lead_platform`), plan, límites (`max_prompts`, `max_surfaces`, `repetitions`, `cadence`, `max_keywords`, `max_pages`), estado y fechas | P0 | CA: el planificador lee límites de `entitlements`, nunca de constantes |
| RF-E03 | Activación manual de suscripción desde la vista admin con motivo | P0 | CA: `audit_log` con actor y motivo |
| RF-E04 | Stripe Billing: suscripción, Customer Portal, webhooks de ciclo de vida, suspensión por impago | P1 | — |
| RF-E05 | Planes con límites = variables de coste | P1 | — |
| RF-E06 | Facturación de agencia, cupones, prueba | P2 | — |

### Módulo F — Captación comercial

| ID | Requisito | Nivel | Criterios de aceptación (P0) |
|---|---|---|---|
| RF-F01 | Botón «Pedir propuesta de mejora» en informe web y dashboard crea `service_requests` (tipo `redesign | seo_geo | maintenance | other`, mensaje, workspace, contacto, `source`) | P0 | CA: desde el PDF, el enlace abre el informe web con el formulario; rate limit por workspace |
| RF-F02 | Notificación al owner por email y Telegram | P0 | CA: fallo de Telegram no impide el email |
| RF-F03 | Lista en vista admin con estado `new | contacted | won | lost` | P0 | CA: sin pipeline, tareas ni notas |
| RF-F04 | Landing con auditoría gratuita reducida | P1 | — |
| RF-F05 | Exportación a webhook de formularios de `lead-platform` | P2 | — |
| RF-F06 | Enlace firmado desde el CRM; conector de leads | P2 | — |

### Transversales

| ID | Requisito | Nivel | Criterios de aceptación (P0) |
|---|---|---|---|
| RF-T01 | Auth propia: email + contraseña (scrypt), sesión en BD con cookie firmada, establecimiento de contraseña por enlace de un solo uso, reset, invitación | P0 | CA: enlace usado dos veces → rechazado; rate limit de login persistido |
| RF-T02 | `organizations` → `workspaces`; `memberships` con rol `owner | admin | member`; `workspace_grants` (en P0 todos los miembros ven todos los workspaces) | P0 | CA: test de aislamiento entre dos organizaciones |
| RF-T03 | Presupuesto por workspace y proveedor: `budget_reservations` antes de encolar gasto; `usage_events` con coste real; tope duro detiene nuevas compras | P0 | CA: con presupuesto agotado el planificador no crea observaciones y la vista admin lo muestra |
| RF-T04 | Metadatos obligatorios de toda cifra (§2.5) | P0 | CA: esquema de `metric_rollups` y `report_snapshots` los exige como no nulos |
| RF-T05 | Clase de métrica visible (§1) | P0 | CA: cada bloque de UI y de informe lleva la etiqueta |
| RF-T06 | Idempotencia de jobs por `idempotency_key` y de observaciones por clave lógica | P0 | CA: reinyectar un job completado devuelve el existente sin ejecutar |
| RF-T07 | Logger estructurado, Sentry, `audit_log` de acciones de negocio, métricas operativas (profundidad de cola, jobs `dead`/h, coste/día por proveedor) | P0 | CA: panel admin muestra las tres métricas |
| RF-T08 | Exportación y borrado completo de workspace (filas, PDFs, `response_text`, revocación de tokens) | P1 | — |
| RF-T09 | Cifrado de credenciales OAuth AES-256-GCM con versión de clave | P1 (con GSC) | — |
| RF-T10 | Interfaz en castellano; inglés P2 | P0 | — |

## 4. Requisitos no funcionales

| ID | Área | Requisito | Medición |
|---|---|---|---|
| RNF-01 | Rendimiento | Auditoría de 30 páginas completa (fetch, reglas, PSI, muestra IA, SERP) en < 15 min desde que entra en cola, en condiciones normales de proveedor | Tiempo `audits.completed_at − created_at` p90 |
| RNF-02 | Rendimiento | PDF generado en < 60 s y ≤ 5 MB | `reports` |
| RNF-03 | Rendimiento | Páginas del dashboard p95 < 1,5 s en servidor con datos de 12 meses | Sentry / logs |
| RNF-04 | Rendimiento | Fetcher de auditoría: timeout 15 s por URL, ≤ 2 MB por HTML, ≤ 5 redirecciones, concurrencia ≤ 4 por dominio, respeta `robots.txt` y `Crawl-delay` razonable | Config + tests |
| RNF-05 | Seguridad | RLS por `workspace_id` en toda tabla de negocio, activada solo dentro de la transacción restringida; suite de aislamiento automatizada | Test de aislamiento en CI/local |
| RNF-06 | Seguridad | Protección SSRF en el fetcher: resolución DNS previa, bloqueo de rangos privados/loopback/link-local/metadata, revalidación en cada redirección, solo esquemas http/https, puertos 80/443 | Tests con URLs maliciosas |
| RNF-07 | Seguridad | Secretos de proveedor en variables de entorno; credenciales OAuth cifradas (P1); nunca en logs ni en el navegador; scrubber de Sentry | Revisión + test de logs |
| RNF-08 | Seguridad | Webhooks de Stripe verificados por firma y tolerancia de 5 min; enlaces firmados HMAC con caducidad | Tests |
| RNF-09 | Seguridad | Rol de plataforma fuera de RLS solo en rutas admin; toda acción admin auditada | `audit_log` |
| RNF-10 | Fiabilidad | Idempotencia de jobs y de compras externas; `provider_task_id` guardado antes de confirmar; reconciliación ante timeout | Test de reinyección |
| RNF-11 | Fiabilidad | Cobertura operativa publicada en toda métrica; fallos de proveedor aparecen como datos incompletos, nunca como ceros | Inspección de UI/informe |
| RNF-12 | Fiabilidad | Backoff exponencial, `max_attempts` 3 en observaciones de pago, dead-letter visible en admin | Config |
| RNF-13 | Observabilidad | Logs JSON con `request_id`, `workspace_id`, `job_id`, `provider`, `cost_cents`; Sentry en web y worker; tres métricas operativas en BD | Panel admin |
| RNF-14 | Costes | Tope duro mensual por workspace y por proveedor; reserva antes de gastar; alerta al 80 % | `budget_reservations`, `usage_events` |
| RNF-15 | Costes | Coste directo por auditoría ≤ 1,5 × estimación de `09-cost-model.md` | `usage_events` |
| RNF-16 | RGPD | Datos personales mínimos: email y nombre de `users`, email de contacto en `service_requests`. Los `response_text` de IA no son datos personales del cliente pero pueden mencionar personas: retención 90 días y luego solo hash y métricas. Base legal: ejecución de contrato. Encargado: Stripe, Resend, Sentry, DataForSEO (confirmar DPA, UNVERIFIED) | Registro de tratamientos + job de purga |
| RNF-17 | RGPD | Borrado de workspace y de organización completo en ≤ 30 días incluyendo PDFs y backups según política publicada (P1) | Procedimiento |
| RNF-18 | Datos | Timestamps en UTC; fechas de datos conservadas según la fuente; zona horaria del workspace para presentar ventanas | Esquema |
| RNF-19 | Portabilidad | BD lógica propia; ninguna FK, vista ni import hacia `lead-platform`; arranque sin `lead-platform` probado | Test de arranque |
| RNF-20 | Mantenibilidad | Módulos con límites explícitos (`04-architecture.md`); proveedores detrás de interfaces; configuración tipada de superficies y planes | Revisión de dependencias entre módulos |
| RNF-21 | Operación | Despliegue por imagen con migraciones, sonda de salud y rollback; backup cifrado diario de la BD propia y restore ensayado antes del primer cliente de pago | Procedimiento ensayado |

## 5. Fuera de alcance de este PRD

Ver `03-mvp-scope.md` §5. En particular este PRD no especifica CRM, white-label, API pública ni agentes autónomos.

## Notas de coherencia

- RF-A16 (competidores sugeridos en la auditoría) no aparece literal en `03`, pero la comparativa competitiva del PDF (RF-D02) la exige; se mantiene como P0 porque el informe no puede comparar sin ellos. `03` §Módulo B marca «sugerencia de competidores a partir de citas» como P1: son cosas distintas (sugerencia por LLM en la auditoría vs sugerencia por citas en el seguimiento).
- El intervalo de Wilson (§2.2) es una concreción de «con intervalo o nº de muestras visible» (Claude) y «tamaño de muestra publicado» (Codex); no contradice `03`.
