# 12 — Architecture Decision Records

**Versión:** 1 (2026-10-25).
**Estado global:** todos los ADR están **PROPUESTO — pendiente de revisión cruzada**. Ninguno pasa a ACEPTADO hasta que Codex complete `13-codex-review.md` y el owner firme. Este documento no constituye aprobación.

Convenciones: cada ADR indica qué informe lo sostiene (Claude, Codex o ambos) y, si hubo desacuerdo, la resolución de `00-analysis-comparison.md` §6. Las afirmaciones sobre `lead-platform` y proveedores llevan VERIFIED / INFERRED / UNVERIFIED según `00` §2.

---

## ADR-001 — Producto independiente (opción C) con integración por fases con `lead-platform`

**Contexto.** El producto debe venderse a pymes y agencias que pueden no usar el CRM. `lead-platform` resuelve el tenant por hostname del CRM, su consola es privada y no tiene Stripe, OAuth de Google, jerarquía agencia → clientes, gráficas ni informes (VERIFIED en `983dfb6`). El NORTE del workspace está en mantenimiento (VERIFIED).

**Decisión.** Construir `visibility-platform` como producto independiente: ningún login, ejecución ni cobro depende de `lead-platform`. Integración por fases: enlace de navegación (P1) → API de leads por tenant del CRM (P2) → enlace firmado / SSO (P2).

**Alternativas descartadas.**
- A, módulo dentro de `lead-platform`: ata la venta externa al host `*.crm`, a la marca, a la consola privada y a un worker de un hilo compartido con la cualificación de leads (VERIFIED `run.ts:123`); el NORTE lo prohíbe.
- B, SaaS sin relación: desecha módulos probados y pierde la línea visibilidad → lead → venta que el owner quiere.

**Consecuencias.** Dos bases de código y dos stacks operados por una persona. Se duplican piezas pequeñas de acceso y operación. A cambio: venta, despliegue y evolución sin tocar el CRM.

**Sostenido por:** ambos (Claude §3.4, Codex §3 y §12). Sin desacuerdo.

**Estado:** PROPUESTO — pendiente de revisión cruzada.

---

## ADR-002 — Repositorio propio en el workspace multi-repo, sin paquetes compartidos

**Contexto.** El workspace es multi-repo sin `workspaces` npm ni paquetes compartidos (VERIFIED). Extraer paquetes de `lead-platform` tocaría el repo en mantenimiento.

**Decisión.** Repo `visibility-platform` (nombre provisional) como hermano en el workspace, con su propia constitución, specs y `docs/projects/`. No se crea ninguna biblioteca `@olessium/*` en el MVP.

**Alternativas descartadas.** Convertir el workspace en monorepo con paquetes compartidos: semanas de trabajo en un repo congelado, para dos consumidores.

**Consecuencias.** Hay que registrar el repo en `workspace.json` y en `SHARED_DECISIONS.md` (D-10 de `11`). La reutilización se hace por copia (ADR-004).

**Sostenido por:** ambos (Claude: «paquetes solo con un tercer consumidor»; Codex: «no extraería ahora una gran biblioteca común»).

**Estado:** PROPUESTO — pendiente de revisión cruzada.

---

## ADR-003 — Stack: Next.js (App Router) + TypeScript strict + PostgreSQL + Drizzle

**Contexto.** `lead-platform` usa Next.js 16.3.6, React 19.2.4, TypeScript 5.9, Drizzle 0.45, Zod 4, Tailwind 4, Vitest, Playwright y Sentry (VERIFIED `package.json`). El equipo es una persona con ese stack.

**Decisión.** Misma familia de stack. Mutaciones del dashboard por Server Actions; route handlers `/api/v1/*` solo para webhooks, descargas firmadas y, en P2, API pública. Worker = mismo código, proceso aparte. Drizzle como ORM.

**Alternativas descartadas.**
- Prisma: obligaría a mantener dos ORMs en el workspace con una sola persona y rompería la copia de módulos.
- Backend separado (NestJS, Go): sin necesidad demostrada; añade despliegue y contratos.
- Librería de gráficas prohibida: la prohibición es de la constitución de `lead-platform` (VERIFIED `CONSTITUTION.md:23`); este producto necesita series y tendrá constitución propia que la permita.

**Consecuencias.** Curva de aprendizaje nula. Los módulos copiados funcionan sin adaptación de framework. Se hereda la dependencia de Next.js en versión exacta.

**Sostenido por:** ambos.

**Estado:** PROPUESTO — pendiente de revisión cruzada.

---

## ADR-004 — Reutilización por copia con procedencia para módulos sin dominio; reescritura de auth y presupuesto

**Contexto.** `lead-platform` tiene módulos estables sin dominio CRM: cola de jobs (`jobs.ts`, VERIFIED), cifrado AES-256-GCM versionado (`crypto.ts`, VERIFIED), `withTenant` + migración RLS + suite de aislamiento (VERIFIED), `EmailProvider` (VERIFIED), `errors.ts`, scripts de deploy y backup (VERIFIED). Su auth es «un usuario, un tenant» (INFERRED) y su presupuesto no reserva antes de gastar (INFERRED, Codex).

**Decisión.** Copiar los módulos sin dominio con `COPIED_FROM.md` (fichero origen, SHA `983dfb6`, cambios aplicados). Reescribir auth (membresías multi-organización) y presupuesto (reserva transaccional). Prohibido importar de `../lead-platform` o de `src/lib/crm`.

**Alternativas descartadas.**
- Importar en runtime: acopla despliegues y viola ADR-001.
- Reescribir todo: desperdicia código probado (objeción de ambos informes a la opción B).
- Extraer paquetes ahora: ver ADR-002.

**Consecuencias.** Divergencia aceptada (R-07 en `11`); revisión trimestral del diff. **Desacuerdo D4 de `00` §6:** Claude proponía copia, Codex «patrón o componente acotado»; esta decisión aplica copia a lo que no tiene dominio y reescritura a lo que Codex pedía adaptar.

**Sostenido por:** ambos, con la resolución D4.

**Estado:** PROPUESTO — pendiente de revisión cruzada.

---

## ADR-005 — Tenancy de dos niveles: `organizations → workspaces`, RLS por `workspace_id`

**Contexto.** Claude proponía `organizations → workspaces`; Codex `organizations → clients → projects`. El encargo pide no hacer de las agencias un requisito del MVP. El patrón RLS de `withTenant` está probado (VERIFIED `with-tenant.ts:60-75`).

**Decisión.** `organizations` (`kind: company | agency`) → `workspaces` (una marca, un dominio principal, dominios secundarios en jsonb). `organization_id` desnormalizado en toda fila de negocio; RLS por `workspace_id` activada solo dentro de `withWorkspace()`; FK compuestas; acceso de administrador de plataforma por `withPlatformAdmin()` auditado. `workspace_grants` para limitar miembros a un subconjunto (P1). Una pyme = una organización con un workspace; una agencia = N workspaces.

**Alternativas descartadas.**
- Tres niveles (Codex): un tercer nivel sin cliente que lo necesite añade joins, políticas y UI. Se añade en P2 si una empresa necesita varios dominios con permisos distintos.
- Esquema por tenant: coste operativo sin volumen que lo justifique.

**Consecuencias.** Transferencia de workspace entre organizaciones posible desde P0 (el workspace tiene PK propia), procedimiento en P2 (D-08). Decisión cara de revertir según ambos informes.

**Sostenido por:** ambos en RLS y aislamiento; **desacuerdo D7 de `00` §6** resuelto a favor de dos niveles.

**Estado:** PROPUESTO — pendiente de revisión cruzada.

---

## ADR-006 — Autenticación propia, sin proveedor gestionado

**Contexto.** `lead-platform` tiene auth propia (scrypt, sesiones en BD, invitaciones, reset) sin OAuth ni SSO (VERIFIED según ambos informes). El producto tendrá decenas de usuarios en el piloto.

**Decisión.** Auth propia: email + contraseña (scrypt), sesión en BD con cookie firmada que solo lleva el id, TTL 12 h, invitaciones de un solo uso, rate limit en Postgres; magic link P1. OAuth de Google se usa solo para autorizar GSC/GA4 (P1), no para login. No se comparten cookies ni tablas con el CRM.

**Alternativas descartadas.**
- Clerk / Auth0 / Supabase Auth: coste por usuario activo y dependencia externa para un volumen pequeño; el módulo existe y está probado.
- Reutilizar sesiones del CRM: acopla y rompe la venta sin CRM (Codex: «no las cookies del CRM ni sus tablas de usuarios»).
- SSO federado (OIDC/SAML): OUT hasta que un cliente lo pida.

**Consecuencias.** Hay que reescribir el módulo para membresías multi-organización (ADR-004). Reevaluar proveedor gestionado si aparece demanda de SSO empresarial (P2).

**Sostenido por:** ambos.

**Estado:** PROPUESTO — pendiente de revisión cruzada.

---

## ADR-007 — Cola de jobs en PostgreSQL con `idempotency_key`, colas lógicas y reserva de presupuesto

**Contexto.** La cola de `lead-platform` usa `FOR UPDATE SKIP LOCKED`, `max_attempts` 5 y backoff exponencial (VERIFIED `jobs.ts`); un worker de un hilo (VERIFIED); idempotencia por handler, no por job (Claude). Codex exige reservar presupuesto antes de despachar y reconciliar con el id externo ante timeouts.

**Decisión.** Copiar la cola y añadir: `idempotency_key UNIQUE` (unidad lógica `workspace + prompt_version + surface + run_window + repetition` para observaciones), columna `queue` (`audit | ingest | observe | report`), `provider` y `max_in_flight` por proveedor, `provider_task_id` guardado antes de confirmar, estado `reconcile`, y **reserva de presupuesto en la misma transacción que encola** con liberación de la diferencia al completar. Sin Redis ni BullMQ.

**Alternativas descartadas.**
- BullMQ/Redis: segunda infraestructura sin señal medida (coherente con D020 del workspace, VERIFIED existencia).
- Cron del sistema: pierde idempotencia y trazabilidad; el patrón de job autoreencolado de `retention.sweep` (VERIFIED) basta.
- Reintentar sin reconciliar: compra dos veces la misma consulta (Codex).

**Consecuencias.** Exactamente-una-compra no es garantizable si el proveedor no ofrece reconciliación (R-11); se acepta y se concilia mensualmente. Varios procesos worker cuando haga falta: el claim ya lo tolera.

**Sostenido por:** ambos (Claude §6.2, Codex §7 «Fiabilidad y costes»).

**Estado:** PROPUESTO — pendiente de revisión cruzada.

---

## ADR-008 — Comprar SERP y observación de interfaces IA (DataForSEO) detrás de interfaces; vetos

**Contexto.** Ambos informes, de forma independiente, eligen DataForSEO como proveedor de SERP y de observación de interfaces IA y descartan Semrush y Ahrefs por términos de uso interno sin redistribución (UNVERIFIED en esta sesión; leídos por ambos el 2026-10-25). Claude documenta que los términos de Gemini Grounding y Bing grounding prohíben almacenar o analizar resultados (UNVERIFIED). Ninguno construiría scrapers, proxies ni índices.

**Decisión.**
- Interfaces: `AuditFetcher`, `PerformanceProvider`, `SearchPerformanceProvider`, `SerpProvider`, `AnswerObservationProvider`, `AnalyticsProvider`. Cada resultado conserva `provider`, `provider_ref`, parámetros, `captured_at`, `cost_cents`, `capture_condition`, `normalizer_version`.
- Adaptadores P0: DataForSEO (SERP + AI Overview; LLM Scraper ChatGPT), PageSpeed Insights, fakes. P1: Serper (SERP), Gemini UI, Perplexity API, GSC. 
- **Vetos:** Semrush y Ahrefs como fuente redistribuida; Gemini Grounding API y Bing grounding como fuente histórica; scraping propio.
- Condición previa al cobro de suscripciones: confirmación escrita de DataForSEO sobre conservación y redistribución (D-05).

**Alternativas descartadas.**
- Herramientas de AI visibility (Otterly, Peec, Semrush AI…): cobran por prompt y dominio, API limitada o Enterprise, sin términos de reventa publicados (Claude §4.3; Codex las valora para un piloto asistido, no como backend).
- Medir con APIs de LLM con búsqueda como fuente principal: coste ×15 frente al scraper según Claude y no representa lo que ve el usuario (ambos). Se admite como fallback etiquetado `api_with_search`.

**Consecuencias.** Dependencia de un proveedor mitigada por interfaz y segundo adaptador (R-10). Cambiar de proveedor **no autoriza a unir series** (Codex).

**Sostenido por:** ambos. Sin desacuerdo en el proveedor; el desacuerdo en número de superficies es ADR-009.

**Estado:** PROPUESTO — pendiente de revisión cruzada.

---

## ADR-009 — Dos superficies y tres repeticiones semanales en P0, con experimento de estabilidad

**Contexto.** Claude: 4 motores, 5 repeticiones, 25 prompts (~6 $/cliente/mes). Codex: 2 superficies, 3 repeticiones, 4 ventanas, 25 prompts (~0,92 $/cliente/mes). Estudios del sector citados por Claude (no revisados por pares) recomiendan ≥ 7 ejecuciones para estabilidad. El encargo prioriza el MVP más pequeño.

**Decisión.** P0: 25 prompts × 2 superficies × 3 repeticiones, semanal, repartido en 48 h. Superficies: `chatgpt` (`ui_scraper`) y `google_aio` (`serp`), por ser las que más ven los usuarios reales de una pyme local en España. Gemini y Perplexity P1. Repeticiones configurables por entitlement. **Experimento:** 7 repeticiones en el dogfood durante 4 semanas; si el intervalo de la tasa de aparición con 3 muestras supera ±20 puntos, el plan base sube a 5.

**Alternativas descartadas.**
- 4 motores desde P0: coste y superficie de fallo ×2 sin validar la venta.
- 7 repeticiones: coste ×2,3 sobre 3; se justifica solo con el experimento.
- `chatgpt + gemini` (lo que DataForSEO documenta según Codex): AIO llega a más usuarios de Google en España; Gemini pasa a P1. Decisión abierta al owner (D-04).

**Consecuencias.** Intervalos anchos en P0: la UI muestra siempre nº de muestras. **Desacuerdo D1 de `00` §6** resuelto con datos del piloto, no por preferencia.

**Sostenido por:** Codex en la cifra; Claude en las etiquetas de condición; resolución D1.

**Estado:** PROPUESTO — pendiente de revisión cruzada.

---

## ADR-010 — Métricas con denominador y etiquetas de condición de captura; índice de salud técnica con fórmula publicada; sin score absoluto

**Contexto.** Ambos informes rechazan «posición» o «ranking IA» y «volumen de prompts». Codex define cinco métricas con denominador; Claude exige `capture_condition`, país, idioma y nº de muestras en cada resultado. El encargo prohíbe un score SEO absoluto sin fórmula.

**Decisión.**
- Métricas GEO/AEO: presencia de marca, tasa de cita, cuota de voz entre marcas seguidas, cobertura de preguntas, cobertura operativa. Cada fila de `metric_rollups` guarda numerador, denominador, `sample_size`, `surface`, `capture_condition`, `methodology_version`, `prompt_cohort_id`. Nunca se promedian superficies ni se mezclan cohortes.
- Índice de salud técnica (0–100) de la auditoría con pesos por categoría publicados en `02-prd.md` y `health_index_version` almacenada. No se llama «score SEO».
- Prompts `branded` fuera de la cuota de voz.
- Cada cifra del informe lleva clasificación `public | third_party_estimate | owner_required`.

**Alternativas descartadas.**
- Score compuesto SEO + IA: mezcla fuentes con metodologías distintas sin ponderación defendible (Codex: «no promediaría sin definir ponderaciones»).
- Posición de mención como métrica principal: ruido alto; se guarda como dato, no como KPI.

**Consecuencias.** Decisión cara de revertir: cambiar fórmulas rompe la comparabilidad histórica (ambos). Por eso se versiona.

**Sostenido por:** ambos.

**Estado:** PROPUESTO — pendiente de revisión cruzada.

---

## ADR-011 — Informe: plantilla HTML única, PDF por Chromium headless, `report_snapshots` inmutables

**Contexto.** Claude proponía informe HTML por enlace en el MVP y PDF en V2; Codex un «artefacto versionado con cobertura»; el encargo exige PDF descargable y «generado a partir de datos reales almacenados». Codex rechaza una tabla genérica de snapshots.

**Decisión.** Un componente HTML con las ocho secciones del encargo sirve la vista web y el PDF (Playwright/Chromium en la cola `report`, `max_in_flight = 1`). Cada informe congela en `report_snapshots` (jsonb, inmutable por trigger) exactamente lo que muestra, con versiones de metodología. Descarga por enlace firmado HMAC con caducidad.

**Alternativas descartadas.**
- PDF programático (PDFKit, react-pdf): segunda plantilla que diverge de la web.
- Servicio externo HTML→PDF: se reserva como alternativa si la prueba de carga falla (R-12).
- Snapshot genérico de todo el workspace: objeción de Codex; aquí se congela solo el contenido del informe.

**Consecuencias.** Riesgo de memoria en el VPS compartido (prueba de carga en HU-29). **Desacuerdo D2 de `00` §6** resuelto por el encargo.

**Sostenido por:** encargo; Codex en el artefacto versionado; Claude en la plantilla HTML.

**Estado:** PROPUESTO — pendiente de revisión cruzada.

---

## ADR-012 — Billing: Stripe Checkout pago único en P0, `entitlements` con `billing_source`, Stripe Billing en P1

**Contexto.** Stripe no existe en `lead-platform` (VERIFIED). Codex pide una única autoridad del derecho contratado con `billing_source` y referencia externa; Claude fija el workspace como unidad comercial y propone Checkout + Customer Portal.

**Decisión.** P0: Stripe Checkout de pago único para la auditoría; webhook `checkout.session.completed` verificado e idempotente crea cuenta, `payments`, `entitlements` (`kind: audit_single`) y encola la auditoría. **Ningún `audit.run` sin pago.** `entitlements` con `billing_source: stripe | manual | bundle_lead_platform` y `limits` jsonb desde P0; activación manual de `monitoring` desde admin para los primeros suscriptores. P1: Stripe Billing con suscripción, Customer Portal, webhooks de ciclo de vida y suspensión. Unidad comercial: workspace.

**Alternativas descartadas.**
- Suscripción automática en P0: 3–4 j más antes de validar que alguien paga la auditoría.
- Compartir tablas de suscripción con otras apps: rechazado por Codex; cuenta mercantil común sí es posible si es la misma entidad.
- Pasarela alternativa (Paddle, Lemon Squeezy): sin ventaja clara para España y menor conocimiento del equipo.

**Consecuencias.** El piloto de suscripción puede cobrarse por transferencia sin tocar el modelo. Obligaciones fiscales a validar (R-25).

**Sostenido por:** ambos en Stripe; Codex en `billing_source`; Claude en unidad = workspace.

**Estado:** PROPUESTO — pendiente de revisión cruzada.

---

## ADR-013 — Auditoría acotada (30 páginas, análisis propio, PageSpeed Insights), no crawler exhaustivo

**Contexto.** Ambos informes excluyen un crawler exhaustivo y los backlinks. El encargo exige el Módulo A con metadatos, indexabilidad observable, estructura, encabezados, canonicals, sitemap/robots, datos estructurados, rendimiento, SEO local y presencia GEO.

**Decisión.** Auditoría de portada + `robots.txt` + `sitemap.xml` + hasta 30 URLs del mismo host; ~20 reglas propias sobre el HTML; rendimiento vía PageSpeed Insights (portada + 3 páginas × 2 estrategias); SEO local por detección de `LocalBusiness` y NAP; muestra IA única de 10 prompts generados × 2 superficies × 3 repeticiones; 10 keywords top 20. Fetcher con protección SSRF (P0). Sin backlinks, sin validación semántica completa de schema.org, sin ficha de Google Business vía API (P2).

**Alternativas descartadas.**
- Comprar la auditoría (Screaming Frog, Sitebulb, APIs de auditoría): sin control del informe ni del coste por auditoría; licencias por asiento.
- Crawler de miles de páginas: lo que ambos informes vetaban; tiempo y memoria en el VPS.
- Lighthouse local en el worker: más RAM (como R-12); se reserva como fallback si PSI falla (R-15).

**Consecuencias.** 11,5–16,5 j que ningún informe estimó (`10` §4). **Desacuerdo D9 de `00` §6**: ambos informes contra el encargo; resuelto acotando.

**Sostenido por:** encargo; coherente con el veto de ambos al crawler exhaustivo.

**Estado:** PROPUESTO — pendiente de revisión cruzada.

---

## ADR-014 — Captación: `service_requests` sin CRM; integración con `lead-platform` en P2

**Contexto.** El encargo pide que el producto capte clientes de servicios sin construir un CRM. `lead-platform` ya acepta formularios por webhook (VERIFIED existencia de `api/webhooks/forms`). Claude proponía `lead-platform` como conector de datos y enlace firmado; Codex, enlace primero y API después.

**Decisión.** Tabla `service_requests` (tipo, mensaje, contacto, workspace, informe de origen, estado `new | contacted | won | lost`), botón en informe y Recomendaciones, notificación al owner por email y Telegram, lista en admin. Sin pipeline, tareas ni notas. P2: webhook hacia el formulario del CRM, enlace firmado desde el CRM, conector de leads por tenant (depende de la iniciativa F del roadmap del CRM, INFERRED).

**Alternativas descartadas.**
- Enviar directamente al CRM desde P0: acopla el piloto a un endpoint que hoy no está pensado para esto y viola ADR-001.
- Mini-CRM propio: duplica `lead-platform`.

**Consecuencias.** El owner gestiona las solicitudes a mano durante el piloto; el volumen esperado lo permite.

**Sostenido por:** ambos en la integración por fases; el encargo en el alcance.

**Estado:** PROPUESTO — pendiente de revisión cruzada.

---

## ADR-015 — Infraestructura: mismo VPS, stack compose y BD propios; almacenamiento S3 compatible en P1

**Contexto.** Un VPS Hetzner con Docker, Caddy único y PostgreSQL local (Claude, UNVERIFIED en esta sesión salvo el compose). RAM libre desconocida (ambos). Ambos proponen empezar en el mismo servidor con independencia lógica.

**Decisión.** Stack compose `visibility` (`app` + `worker`) con imagen propia detrás del Caddy existente; BD `visibility` y rol propios en la misma instancia PostgreSQL; backups cifrados propios; Sentry y Resend existentes con proyecto y remitente propios. PDFs en disco montado en P0; almacenamiento S3 compatible en P1 cuando haya más de un host o el volumen lo pida. Migración a host propio cuando RAM libre < 1,5 GB o cola > 2 h sostenida.

**Alternativas descartadas.**
- Host propio desde el día 1: 20–40 €/mes (Claude, UNVERIFIED) sin señal; se difiere (D-06).
- Vercel + Neon: el worker de larga duración y Chromium no encajan; dos modelos de despliegue en el workspace.
- Compartir la BD `platform`: viola la independencia de datos (ambos).

**Consecuencias.** Radio de fallo compartido a nivel de máquina; medir RAM antes de desplegar (HU-45). Mover el stack es copiar el compose y un `pg_dump` (Claude).

**Sostenido por:** ambos.

**Estado:** PROPUESTO — pendiente de revisión cruzada.

---

## ADR-016 — Retención: texto completo 90 días, observaciones normalizadas 24 meses, snapshots de informe indefinidos

**Contexto.** Ambos informes proponen 90 días para respuestas completas y 24 meses para observaciones normalizadas, sujeto a licencia del proveedor (D-05). El informe debe poder regenerarse.

**Decisión.** `observations.raw_text` se purga a los 90 días (job `retention.sweep` autoreencolado); `observations` y `metric_rollups` se conservan 24 meses en caliente; `report_snapshots` y PDFs se conservan mientras exista el workspace; borrado de workspace = cascada + purga de ficheros + evento de auditoría; timestamps en UTC y fechas de dato según la fuente.

**Alternativas descartadas.**
- Conservar texto completo indefinidamente: riesgo de licencia y de volumen.
- Purgar observaciones a 12 meses: impide la comparación anual que el dashboard P1 ofrece.

**Consecuencias.** La UI debe indicar «texto purgado» en lugar de la respuesta de ejemplo tras 90 días (HU-37). Si DataForSEO exige menos conservación (D-05), estos plazos bajan.

**Sostenido por:** ambos.

**Estado:** PROPUESTO — pendiente de revisión cruzada.

---

## Índice

| ADR | Título | Desacuerdo resuelto |
|---|---|---|
| 001 | Producto independiente, opción C | — |
| 002 | Repo propio, sin paquetes compartidos | — |
| 003 | Stack Next.js / TS / PostgreSQL / Drizzle | — |
| 004 | Copia con procedencia; reescritura de auth y presupuesto | D4 |
| 005 | Tenancy de dos niveles | D7 |
| 006 | Auth propia | — |
| 007 | Cola Postgres con idempotencia y reserva | — |
| 008 | Comprar SERP e IA (DataForSEO); vetos | — |
| 009 | Dos superficies, tres repeticiones | D1 |
| 010 | Métricas con denominador; índice con fórmula | — |
| 011 | Informe HTML único → PDF; snapshots | D2 |
| 012 | Billing: pago único P0, suscripción P1 | — |
| 013 | Auditoría acotada | D9 |
| 014 | Captación sin CRM | — |
| 015 | Mismo VPS, stack y BD propios | — |
| 016 | Retención | — |

Los desacuerdos D3 (API pública), D5 (primer paso comercial), D6 (modelo de costes) y D8 (DNS TXT) de `00` §6 no tienen ADR propio: D3 y D8 son alcance (`03`), D5 es comercial (`01`) y D6 es método (`09`).
