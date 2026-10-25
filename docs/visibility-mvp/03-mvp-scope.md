# 03 — Alcance del MVP: P0 / P1 / P2 / OUT

**Versión:** 1 (2026-10-25). **Estado:** PROPUESTO, pendiente de revisión cruzada.

## 1. Definiciones

| Nivel | Significado | Criterio de corte |
|---|---|---|
| **P0** | Indispensable para lanzar un **piloto pagado**: una pyme paga una auditoría, recibe un PDF útil y puede contratar seguimiento | Si se quita, no se puede cobrar o el informe no es defendible |
| **P1** | Necesario para un **SaaS comercial inicial**: varias pymes y al menos una agencia pagan mensualmente sin intervención manual | Si se quita, el cobro recurrente o la operación exigen trabajo manual del owner |
| **P2** | Evolución posterior con demanda observada | Lo pide un cliente real o lo exige un volumen medido |
| **OUT** | Fuera del alcance inicial por decisión explícita | Se reconsidera solo con una nueva decisión del owner |

Principio del encargo que gobierna el corte: **antes eliminar que sobredimensionar.** Cuando una funcionalidad podía ser P0 o P1, es P1.

## 2. El MVP en una frase

Una pyme introduce su dominio, paga una auditoría, recibe en menos de una hora un **PDF con su situación SEO y su presencia observada en ChatGPT y en los AI Overviews de Google frente a 3 competidores**, con acciones priorizadas; desde el informe puede pedir una propuesta de servicio o contratar seguimiento semanal con dashboard.

## 3. Alcance por módulo

### Módulo A — Auditoría de dominio

| Funcionalidad | Nivel | Nota |
|---|---|---|
| Formulario público: dominio + email + sector + ciudad (opcional) | P0 | Sin cuenta previa; la cuenta se crea al pagar |
| Descubrimiento acotado: portada, `robots.txt`, `sitemap.xml`, hasta **30 páginas** del sitemap (o enlaces internos de la portada si no hay sitemap) | P0 | No es un crawler exhaustivo. N configurable por plan |
| Metadatos SEO por página: `title`, `meta description`, longitud, duplicados, `og:*` básicos | P0 | Análisis propio del HTML |
| Indexabilidad observable: `robots.txt`, `meta robots`, `X-Robots-Tag`, códigos de estado, redirecciones, `noindex` en páginas del sitemap | P0 | «Observable» = lo que se deduce sin acceso del propietario. La indexación real exige GSC (P1) |
| Encabezados: H1 único, jerarquía, páginas sin H1 | P0 | |
| Canonicals: presencia, auto-referencia, canonicals a URLs que redirigen o dan 404 | P0 | |
| Sitemap y robots: existencia, formato, URLs del sitemap que no responden 200, bloqueo del sitemap por robots | P0 | |
| Datos estructurados: detección y validación sintáctica de JSON-LD, tipos presentes (`Organization`, `LocalBusiness`, `Product`, `FAQPage`…) | P0 | Validación semántica contra schema.org completa: OUT |
| Rendimiento web: Core Web Vitals de laboratorio y de campo (si hay datos CrUX) para portada + 3 páginas, vía PageSpeed Insights API | P0 | Fuente externa gratuita. **UNVERIFIED** cuota exacta y términos; verificar antes de P0 |
| SEO local: detección de `LocalBusiness`, NAP (nombre, dirección, teléfono) consistente en portada/contacto, enlace a Google Maps | P0 | Solo si el formulario indica negocio local. Ficha de Google Business Profile vía API: P2 (requiere autorización del propietario o Places API de pago) |
| HTTPS, redirección http→https, www/no-www, `hreflang` básico | P0 | |
| Presencia GEO/AEO en la auditoría: **ejecución única** de 10 prompts generados (no aprobados por el cliente) en las 2 superficies P0, 3 repeticiones, con detección de marca y competidores | P0 | Es la línea base. Se etiqueta como «muestra puntual», nunca como tendencia |
| Posiciones SERP de 10 keywords derivadas del sector + ciudad, top 20 | P0 | Vía `SerpProvider`. Keywords propuestas por LLM, no editables en la auditoría |
| **Índice de salud técnica** (0–100) con fórmula publicada en el informe | P0 | Ver `02-prd.md` §Métricas. No es un «score SEO» del mercado |
| Lista de problemas con severidad (`critical`, `warning`, `info`), páginas afectadas y evidencia | P0 | |
| Clasificación de cada métrica como `public`, `third_party_estimate` o `owner_required` | P0 | Visible en el informe |
| Auditoría con datos del propietario (GSC): consultas reales, impresiones, páginas indexadas | P1 | Requiere OAuth y verificación de Google |
| Enlaces rotos internos, imágenes sin `alt`, peso de páginas | P1 | |
| Auditoría de hasta 200 páginas | P2 | |
| Backlinks, autoridad de dominio, auditoría de contenido con LLM | OUT | Ambos informes lo descartan; requiere proveedores con licencia restrictiva |

### Módulo B — Monitorización GEO/AEO

| Funcionalidad | Nivel | Nota |
|---|---|---|
| Registro de marca: nombre, alias (hasta 5), dominio principal, dominios secundarios (jsonb) | P0 | Los alias gobiernan la detección de menciones |
| Generación asistida de prompts: LLM propone 40 a partir de sector, servicios, ciudad e idioma, agrupados por intención (`discovery`, `comparison`, `recommendation`, `decision`, `branded`) | P0 | Los prompts `branded` se etiquetan aparte y no se mezclan en la cuota de voz |
| Aprobación y edición de prompts hasta un máximo del plan (25 en P0) | P0 | Sin aprobación no hay gasto |
| Versionado de prompts: cambiar texto, mercado o intención crea versión nueva y marca de ruptura en las series | P0 | Decisión cara de revertir según ambos informes |
| Selección manual de competidores (3 en P0, nombre + dominio + alias) | P0 | |
| Sugerencia de competidores a partir de dominios más citados en la primera ejecución | P1 | |
| Ejecución periódica semanal: 25 prompts × 2 superficies × 3 repeticiones, repartida en 48 h | P0 | Cadencia y repeticiones son límites del plan |
| Línea base al activar el seguimiento | P0 | |
| Detección de menciones: coincidencia determinista de marca/alias y competidores en el texto normalizado | P0 | Clasificación por LLM de posición y tono: P1 |
| Extracción de citas: URLs devueltas como fuentes por la superficie, normalizadas a dominio, marcadas `own | competitor | other` | P0 | |
| Verificación de citas: HEAD/GET a la URL citada para confirmar que existe (200) y registrar el estado | P1 | |
| Comparación entre superficies (ChatGPT vs AIO) con la misma pregunta | P0 | Nunca se promedian superficies entre sí |
| Superficies adicionales: Gemini UI, Perplexity API | P1 | |
| Claude, Copilot, Grok, Google AI Mode | P2 | |
| Seguimiento SERP semanal de 30 keywords, top 20 | P0 | |
| Keywords hasta 100 y top 100 | P1 | |
| Almacenamiento histórico: observaciones 24 meses, texto completo 90 días | P0 | |
| Indicadores: presencia, tasa de cita, cuota de voz, cobertura de preguntas, cobertura operativa, con denominadores y nº de muestras | P0 | |
| Ejecuciones manuales bajo demanda descontadas de la cuota | P1 | |
| Alertas por caída de presencia o de cobertura operativa | P2 | |
| Sentimiento, «volumen de prompts», «ranking universal IA» | OUT | Sin base metodológica verificable |

### Módulo C — Dashboard de empresa

| Pantalla | Nivel | Contenido P0 |
|---|---|---|
| Overview | P0 | 4 tarjetas: índice de salud técnica, presencia IA (%), cuota de voz, posición media SERP; cada una con delta frente al periodo anterior y nº de muestras |
| SEO | P0 (técnico) / P1 (GSC) | Lista de problemas de la última auditoría; posiciones SERP de keywords. Con GSC: clics, impresiones, consultas |
| Visibilidad IA | P0 | Tabla de prompts × superficie con tasa de aparición, citas propias, última respuesta de ejemplo |
| Competidores | P0 | Cuota de voz por marca seguida; dominios más citados |
| Evolución histórica | P0 mínimo | Series semanales de las 4 tarjetas; marcas de ruptura cuando cambia la versión de prompts. 12 meses de ventana: P1 |
| Recomendaciones | P0 | Lista priorizada derivada de reglas (problema → acción → impacto estimado cualitativo). Redacción con LLM: P1 |
| Informes | P0 | Lista de informes generados con descarga PDF |
| Vista agencia (lista de workspaces con semáforo) | P1 | |
| Vista administrador SaaS: coste por organización, jobs muertos, conexiones rotas, reservas de presupuesto | P0 mínimo | Tabla sin gráficas; necesaria para operar el piloto |
| Exportación CSV/JSON del workspace | P1 | |
| Marca de agencia en el dashboard (logo, color) | P2 | |

### Módulo D — Informe PDF

| Funcionalidad | Nivel | Nota |
|---|---|---|
| Plantilla HTML única para vista web y PDF | P0 | |
| Secciones: resumen ejecutivo, situación inicial, problemas detectados, comparativa competitiva, evidencias, oportunidades, acciones recomendadas con prioridad, limitaciones de la medición | P0 | Todas exigidas por el encargo |
| Generación a partir de `report_snapshots` (datos congelados) | P0 | El PDF se puede regenerar byte a byte |
| PDF por Chromium headless (Playwright) en el worker | P0 | Riesgo de memoria: medir |
| Descarga por enlace firmado con caducidad | P0 | |
| Envío por email al cliente | P0 | Resend |
| Informe mensual automático para suscriptores | P1 | |
| Marca de agencia en el informe | P2 | |
| Programación personalizada, informes semanales | P2 | |

### Módulo E — Monetización

| Funcionalidad | Nivel | Nota |
|---|---|---|
| Pago único de la auditoría con Stripe Checkout; webhook `checkout.session.completed` crea la cuenta y encola la auditoría | P0 | Único cobro automático del piloto |
| `entitlements` con `billing_source` (`stripe`, `manual`, `bundle_lead_platform`) y límites del plan | P0 | Permite cobrar el piloto de suscripción por transferencia sin tocar el modelo |
| Activación manual de suscripción desde la vista admin | P0 | Para los primeros suscriptores |
| Stripe Billing: suscripción mensual, Customer Portal, webhooks de ciclo de vida, suspensión por impago | P1 | |
| Planes con límites = variables de coste (prompts, superficies, repeticiones, cadencia, keywords, páginas) | P1 | En P0 hay un único plan |
| Facturación de agencia (N workspaces, prorrateo) | P2 | |
| Cupones, prueba gratuita, upsell desde el dashboard | P2 | |
| Facturación legal española (Verifactu, series de factura) | P2 | Stripe Invoicing cubre el recibo; obligaciones fiscales a validar con asesor |

### Módulo F — Captación comercial

| Funcionalidad | Nivel | Nota |
|---|---|---|
| Botón «Pedir propuesta de mejora» en el informe y el dashboard → `service_requests` (tipo, mensaje, workspace, contacto) | P0 | |
| Notificación al owner por email/Telegram de cada solicitud | P0 | Patrón `telegram-owner-notifier` de LP |
| Lista de solicitudes en la vista admin con estado (`new`, `contacted`, `won`, `lost`) | P0 | Esto **no** es un CRM: sin pipeline, sin tareas, sin notas |
| Landing pública con auditoría gratuita reducida (portada solo, sin IA) como gancho | P1 | Coste controlado por rate limit por IP y dominio |
| Exportación de `service_requests` a `lead-platform` (webhook a un endpoint de formulario del CRM) | P2 | `lead-platform` ya acepta formularios por webhook (VERIFIED existencia de `api/webhooks/forms`) |
| Enlace firmado desde el CRM al dashboard; conector de leads por tenant | P2 | Depende de la iniciativa F del roadmap del CRM |

## 4. Transversal

| Funcionalidad | Nivel |
|---|---|
| Auth propia (email + contraseña, sesión en BD, invitación por enlace) | P0 |
| Magic link | P1 |
| Organizaciones → workspaces, membresías con rol | P0 |
| RLS por `workspace_id` + suite de aislamiento | P0 |
| Cola de jobs Postgres con idempotencia y reserva de presupuesto | P0 |
| Presupuesto por workspace y por proveedor con tope duro | P0 |
| Registro de uso y coste por llamada (`usage_events`, `provider_pricing`) | P0 |
| Protección SSRF en el fetcher de auditoría | P0 |
| Cifrado de credenciales OAuth (AES-256-GCM versionado) | P1 (entra con GSC) |
| Logger estructurado, Sentry, `audit_log` | P0 |
| Métricas operativas: profundidad de cola, jobs muertos, coste/día por proveedor | P0 |
| Exportación y borrado completo de workspace | P1 |
| i18n: castellano | P0; inglés P2 |
| API pública con claves y webhooks | P2 |
| Dominio propio por agencia, remitente propio | P2 |

## 5. Explícitamente fuera (OUT)

Por decisión del encargo y coincidencia de ambos informes:

- CRM completo (pipeline, tareas, notas): `lead-platform` ya lo es.
- Generador automático de webs.
- Agentes SEO autónomos que publiquen cambios en la web del cliente.
- Integraciones masivas (WordPress, Shopify, redes sociales).
- White-label avanzado (dominio, remitente, informes sin marca) antes de P2.
- Microservicios, Redis/BullMQ, Timescale/ClickHouse, Kafka.
- Scraping propio de interfaces de IA, proxies, evasión de bloqueos.
- Índice de backlinks propio o comprado para redistribuir.
- Semrush y Ahrefs como fuente de datos redistribuidos.
- Gemini Grounding API y Bing grounding como fuente histórica (términos de uso, UNVERIFIED pero señalado por Claude con fecha).
- «Volumen de prompts», «demanda IA», sentimiento, atribución causal visibilidad → venta.
- SSO federado (OIDC/SAML).
- App móvil, dashboards en tiempo real.

## 6. Criterio de éxito del piloto (P0 cerrado)

Nota sobre el tamaño del P0: el backlog (`10-implementation-backlog.md` §4) suma 57–80 jornadas para todo
lo marcado P0 en este documento. La recomendación es ejecutarlo en dos tramos: **P0a** (auditoría de pago,
informe PDF, captación y vista admin mínima; criterios 1, 2, 5, 6 y 7) y **P0b** (monitorización semanal y
dashboard de evolución; criterios 3 y 4). La división la decide el owner (D-11 en
`11-risks-and-open-decisions.md`); los niveles de las tablas anteriores no cambian.

El P0 está terminado cuando, en producción y sin intervención del desarrollador:

1. Una pyme paga una auditoría con tarjeta y recibe el PDF por email en menos de 60 minutos.
2. El PDF se regenera byte a byte desde `report_snapshots`.
3. Un suscriptor activado manualmente recibe 4 ejecuciones semanales consecutivas sin huecos en su dashboard.
4. Dos organizaciones de prueba no pueden leer ni modificar datos ajenas (test automatizado).
5. Repetir un job no duplica observaciones ni cobros; agotar el presupuesto detiene nuevas compras.
6. Coste medido por auditoría y por workspace/mes ≤ 1,5 × la estimación de `09-cost-model.md`.
7. Al menos una `service_request` recibida desde un informe real.
