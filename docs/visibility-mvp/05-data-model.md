# 05 — Modelo de datos

**Versión:** 1 (2026-10-25). **Estado:** PROPUESTO. Modo diseño: los esquemas son descripciones lógicas, no migraciones.

Convenciones: `id` es UUID v7 (ordenable por tiempo) salvo indicación; `created_at`/`updated_at` en UTC en todas las tablas; toda fila de negocio lleva `organization_id` y `workspace_id` (desnormalizados) y RLS por `workspace_id`; las FKs padre-hijo dentro de un workspace son compuestas `(workspace_id, id)` para impedir referencias cruzadas. Los tipos son lógicos (`text`, `int`, `numeric`, `jsonb`, `timestamptz`, `date`, `enum`).

## 1. Identidad y organizaciones

```mermaid
erDiagram
    organizations ||--o{ memberships : tiene
    users ||--o{ memberships : pertenece
    organizations ||--o{ workspaces : posee
    memberships ||--o{ workspace_grants : restringe
    workspaces ||--o{ workspace_grants : concede
    users ||--o{ sessions : abre
    organizations ||--o{ invites : emite
    organizations ||--o{ service_requests : origina
    workspaces ||--o{ service_requests : origina

    organizations { uuid id PK; text name; enum kind "company|agency"; enum status "active|suspended|deleted"; text billing_email; text country; text timezone }
    users { uuid id PK; text email UK; text password_hash; bool platform_admin; timestamptz email_verified_at }
    memberships { uuid id PK; uuid organization_id FK; uuid user_id FK; enum role "owner|admin|member"; UK "(organization_id,user_id)" }
    workspace_grants { uuid membership_id FK; uuid workspace_id FK; PK "(membership_id,workspace_id)" }
    workspaces { uuid id PK; uuid organization_id FK; text name; text brand_name; text[] brand_aliases; text primary_domain; jsonb secondary_domains; text country; text locale; text sector; text city; bool is_local_business; enum status "active|paused|deleted" }
    sessions { uuid id PK; uuid user_id FK; timestamptz expires_at; text ip; text user_agent }
    invites { uuid id PK; uuid organization_id FK; text email; enum role; text token_hash UK; timestamptz expires_at; timestamptz accepted_at }
    service_requests { uuid id PK; uuid organization_id FK "null"; uuid workspace_id FK "null"; text email; enum kind "proposal|redesign|seo_service|other"; text message; enum source "report|dashboard|landing"; enum status "new|contacted|won|lost" }
```

| Tabla | Claves e índices | RLS | Retención | Inmutable |
|---|---|---|---|---|
| `organizations` | PK `id`; idx `status` | No (filtrada por membresía en `identity`) | Hasta borrado + 30 días | `id`, `created_at` |
| `users` | PK; UK `email` (citext) | No | Hasta baja | `id` |
| `memberships` | UK `(organization_id, user_id)`; idx `user_id` | No | — | — |
| `workspace_grants` | PK compuesta | No | — | — |
| `workspaces` | PK; idx `(organization_id, status)`; UK `(organization_id, primary_domain)` | **Sí** (`id = app.workspace_id`) | 24 meses tras `deleted` para datos; artefactos purgados al borrar | `id`, `organization_id` |
| `sessions` | PK; idx `(user_id, expires_at)` | No | 12 h TTL + barrido | — |
| `invites` | UK `token_hash` | No | 48 h | — |
| `service_requests` | idx `(status, created_at)`; idx `workspace_id` | Parcial: visibles por su organización; `platform_admin` ve todas | 24 meses | `source`, `created_at` |
| `auth_rate_limits` | PK `(scope, key)` | No | Ventana deslizante | — |

`sector`, `city`, `is_local_business` en `workspaces` alimentan la generación de prompts y las reglas de SEO local; se rellenan desde el formulario público de la auditoría.

## 2. Auditoría

```mermaid
erDiagram
    workspaces ||--o{ audits : solicita
    payments o|--o| audits : paga
    audits ||--o{ audit_pages : analiza
    audits ||--o{ audit_findings : detecta
    audit_pages o|--o{ audit_findings : afecta
    audits ||--o{ performance_samples : mide
    audits o|--o| monitoring_runs : "línea base GEO (kind=audit)"
    workspaces ||--o{ competitors : sigue
    workspaces ||--o{ keywords : sigue

    audits { uuid id PK; uuid workspace_id FK; uuid organization_id; uuid payment_id FK "UK, null"; enum status "queued|fetching|analyzing|observing|snapshotting|done|failed"; jsonb config "max_pages, strategies, surfaces, repetitions, prompt_count, keyword_count"; int requested_pages; int fetched_pages; numeric health_index "0-100"; jsonb health_breakdown "por categoría"; text rules_version; timestamptz started_at; timestamptz finished_at; text failure_reason }
    audit_pages { uuid id PK; uuid audit_id FK; uuid workspace_id; text url; text url_normalized; int status_code; jsonb redirect_chain; text title; text meta_description; text[] h1s; jsonb headings_outline; text canonical; text robots_meta; text x_robots; text[] structured_data_types; jsonb structured_data_errors; bool indexable; text indexable_reason; text content_hash; int bytes; int fetch_ms; text fetch_error; bool from_sitemap }
    audit_findings { uuid id PK; uuid audit_id FK; uuid workspace_id; text rule_id; enum severity "critical|warning|info"; uuid page_id FK "null"; jsonb evidence; text recommendation_key; int weight }
    performance_samples { uuid id PK; uuid audit_id FK; uuid workspace_id; text url; enum strategy "mobile|desktop"; numeric lcp_ms; numeric cls; numeric inp_ms; numeric fcp_ms; numeric ttfb_ms; numeric perf_score; enum lab_or_field "lab|field|both"; text provider; text provider_ref; int cost_cents }
    competitors { uuid id PK; uuid workspace_id FK; text name; text domain; text[] aliases; enum source "manual|suggested"; enum status "active|retired" }
    keywords { uuid id PK; uuid workspace_id FK; text text; text locale; text location; enum source "generated|manual"; enum status "active|paused"; int depth }
```

| Tabla | Claves e índices | RLS | Retención | Inmutable |
|---|---|---|---|---|
| `audits` | UK `payment_id`; idx `(workspace_id, created_at desc)`; idx `status` where not done | Sí | 24 meses; cabecera indefinida | `config`, `rules_version` tras `done`; `health_index` tras `done` |
| `audit_pages` | UK `(audit_id, url_normalized)`; idx `(workspace_id, audit_id)` | Sí | 24 meses | Toda la fila tras `done` |
| `audit_findings` | idx `(audit_id, severity)`; idx `(workspace_id, rule_id)` | Sí | 24 meses | Toda la fila tras `done` |
| `performance_samples` | UK `(audit_id, url, strategy)` | Sí | 24 meses | Tras `done` |
| `competitors` | UK `(workspace_id, domain)`; máx. según `entitlements.limits` | Sí | — | `id` |
| `keywords` | UK `(workspace_id, text, locale, location)` | Sí | — | `id` |

El HTML bruto de las páginas **no** se guarda en BD: se escribe en el `ArtifactStore` (`audits/{audit_id}/pages/{hash}.html`, 90 días) y `audit_pages.content_hash` lo referencia. Así la evidencia es consultable sin inflar la tabla.

## 3. Monitorización GEO/AEO y SERP

```mermaid
erDiagram
    workspaces ||--o{ prompts : define
    prompts o|--o{ prompts : "parent_id (versión anterior)"
    workspaces ||--o{ monitoring_runs : ejecuta
    monitoring_runs ||--o{ observations : produce
    prompts ||--o{ observations : "prompt_id + prompt_version"
    observations ||--o{ citations : cita
    keywords ||--o{ serp_positions : mide

    prompts { uuid id PK; uuid workspace_id FK; uuid prompt_set_id "agrupa una cohorte"; text text; enum intent "discovery|comparison|recommendation|decision|branded"; text locale; text country; enum status "draft|approved|retired"; int version; uuid parent_id FK "null"; enum source "generated|manual"; timestamptz approved_at; uuid approved_by }
    monitoring_runs { uuid id PK; uuid workspace_id FK; uuid organization_id; enum kind "baseline|scheduled|manual|audit"; timestamptz scheduled_for; enum status "planned|running|partial|done|failed|deferred_budget"; int expected_observations; int completed_observations; int failed_observations; int cost_cents; int prompt_set_version; jsonb config "surfaces, repetitions, country, locale"; uuid audit_id FK "null" }
    observations { uuid id PK; uuid run_id FK; uuid workspace_id; uuid prompt_id FK; int prompt_version; enum surface "chatgpt|google_aio|gemini|perplexity"; enum capture_condition "ui_scraper|serp|api_with_search|api_no_search|owner_api"; int repetition; text country; text locale; enum status "ok|provider_error|empty|timeout"; text response_text "90 d"; text response_hash; jsonb mentions "[{brand_id, kind, position}]"; bool own_mentioned; int own_first_position; text provider; text provider_task_id; int provider_cost_cents; text normalizer_version; timestamptz scheduled_for; timestamptz observed_at }
    citations { uuid id PK; uuid observation_id FK; uuid workspace_id; text url; text domain; enum kind "own|competitor|other"; int position; enum source "structured|text_extracted"; int verified_status "null|200|404|other"; timestamptz verified_at }
    serp_positions { uuid keyword_id FK; uuid workspace_id; date checked_on; text engine; enum device "desktop|mobile"; text location; int position "null = no top-N"; text url; jsonb serp_features "aio_present, local_pack, ..."; text provider; text provider_ref; int cost_cents; PK "(keyword_id,checked_on,engine,device,location)" }
```

| Tabla | Claves e índices | RLS | Retención | Inmutable |
|---|---|---|---|---|
| `prompts` | idx `(workspace_id, status)`; idx `(workspace_id, prompt_set_id, version)`; `parent_id` → `prompts.id` | Sí | Indefinida (necesaria para interpretar el histórico) | Toda la fila una vez `approved`: cambiar texto/país/intención crea fila nueva con `version + 1` y `parent_id` |
| `monitoring_runs` | idx `(workspace_id, scheduled_for desc)`; UK `(workspace_id, kind, scheduled_for)` para `scheduled` | Sí | 24 meses | `config`, `prompt_set_version` |
| `observations` | **UK** `(workspace_id, prompt_id, prompt_version, surface, capture_condition, scheduled_for, repetition)`; idx `(workspace_id, observed_at)`; idx `(run_id)`; idx `(workspace_id, surface, observed_at)` | Sí | Filas 24 meses; `response_text` a `null` a los 90 días (job de retención) | Todo salvo `response_text` (purga) y `mentions` (re-normalización explícita con nueva `normalizer_version` escribe fila nueva de rollup, no modifica la observación) |
| `citations` | idx `(workspace_id, domain)`; idx `observation_id` | Sí | 24 meses | `url`, `position`; `verified_*` se actualiza una vez |
| `serp_positions` | PK compuesta; idx `(workspace_id, checked_on)` | Sí | 24 meses | Toda la fila |

`prompt_set_id` y `prompt_set_version` identifican la cohorte aprobada: aprobar un conjunto nuevo incrementa la versión del conjunto en el workspace y marca ruptura en las series.

## 4. Métricas e informes

```mermaid
erDiagram
    workspaces ||--o{ metric_rollups : agrega
    workspaces ||--o{ report_snapshots : congela
    report_snapshots ||--o| reports : renderiza
    workspaces ||--o{ integrations : conecta
    workspaces ||--o{ search_daily : importa

    metric_rollups { uuid id PK; uuid workspace_id FK; enum period_type "week|month"; date period_start; text metric_key; enum surface "null|chatgpt|google_aio|gemini|perplexity"; numeric value; numeric numerator; numeric denominator; int sample_size; int prompt_set_version; text methodology_version; jsonb breakdown "por competidor / intención"; timestamptz computed_at }
    report_snapshots { uuid id PK; uuid workspace_id FK; uuid organization_id; enum kind "audit|monthly"; text period "audit_id o YYYY-MM"; jsonb data; text methodology_version; text template_version; timestamptz created_at }
    reports { uuid id PK; uuid snapshot_id FK UK; uuid workspace_id; enum status "pending|rendering|ready|failed"; text pdf_object_key; text html_object_key; text download_token_hash; timestamptz signed_url_expires_at; jsonb sent_to "[{email, sent_at}]"; int render_ms; int render_rss_mb }
    integrations { uuid id PK; uuid workspace_id FK; enum provider "gsc|ga4|lead_platform"; text external_id "propiedad GSC / property GA4 / tenant"; enum status "pending|active|reauth_required|revoked"; bytea ciphertext; bytea iv; bytea tag; int key_version; text[] scopes; timestamptz expires_at; timestamptz last_sync_at; text last_error }
    search_daily { uuid workspace_id FK; date metric_date; text dimension_key "total|query:..|page:..|country:.."; int clicks; int impressions; numeric ctr; numeric position; enum completeness "partial|final"; PK "(workspace_id,metric_date,dimension_key)" }
```

| Tabla | Claves e índices | RLS | Retención | Inmutable |
|---|---|---|---|---|
| `metric_rollups` | **UK** `(workspace_id, period_type, period_start, metric_key, surface, prompt_set_version, methodology_version)`; idx `(workspace_id, metric_key, period_start)` | Sí | 24 meses en caliente; mensuales indefinidos | Recalculable (no es fuente de verdad) |
| `report_snapshots` | **UK** `(workspace_id, kind, period)` | Sí | Indefinida | **Toda la fila**: un snapshot nunca se actualiza; una corrección crea `kind=monthly_corrected` con referencia |
| `reports` | UK `snapshot_id`; idx `(workspace_id, created_at desc)` | Sí | PDF indefinido mientras exista el workspace | `pdf_object_key` |
| `integrations` (P1) | UK `(workspace_id, provider)` | Sí | Credencial purgada al revocar | — |
| `search_daily` (P1) | PK compuesta; idx `(workspace_id, metric_date)` | Sí | 24 meses + 16 meses de backfill inicial | `final` sí; `partial` se reescribe en la ventana D-3 |

`metric_key` (catálogo cerrado en código): `brand_presence`, `citation_rate`, `share_of_voice`, `prompt_coverage`, `operational_coverage`, `health_index`, `serp_avg_position`, `serp_top10_count`, `gsc_clicks`, `gsc_impressions` (P1). Fórmulas en `02-prd.md`.

## 5. Facturación, uso y operación

```mermaid
erDiagram
    organizations ||--o{ entitlements : disfruta
    organizations ||--o{ payments : paga
    organizations ||--o{ subscriptions : contrata
    workspaces ||--o{ usage_events : consume
    workspaces ||--o{ budget_reservations : reserva
    jobs ||--o{ usage_events : genera
    jobs ||--o| budget_reservations : respalda

    entitlements { uuid id PK; uuid organization_id FK; text plan_key "audit_once|monitor_basic|..."; enum billing_source "stripe|manual|bundle_lead_platform"; text external_ref; jsonb limits "prompts, surfaces, repetitions, cadence, keywords, pages, workspaces, monthly_budget_cents"; enum status "active|past_due|suspended|expired"; timestamptz valid_from; timestamptz valid_until; text granted_by }
    payments { uuid id PK; uuid organization_id FK; enum kind "audit_one_off"; text stripe_checkout_session_id UK; text stripe_payment_intent_id; int amount_cents; text currency; enum status "pending|paid|refunded|failed"; uuid audit_id FK "null"; text customer_email }
    subscriptions { uuid id PK; uuid organization_id FK; text stripe_customer_id; text stripe_subscription_id UK; text stripe_price_id; enum status; timestamptz current_period_end; timestamptz canceled_at }
    usage_events { uuid id PK; uuid workspace_id FK; uuid organization_id; text provider; text operation; numeric units; int cost_cents; uuid job_id FK "null"; uuid observation_id FK "null"; uuid audit_id "null"; timestamptz created_at }
    provider_pricing { text provider; text operation; int unit_cost_cents "en centésimas de céntimo si hace falta"; text unit; timestamptz valid_from; text source_url; PK "(provider,operation,valid_from)" }
    budget_reservations { uuid id PK; uuid workspace_id FK; uuid organization_id; uuid job_id FK "null"; uuid run_id "null"; int reserved_cents; int settled_cents; enum status "reserved|settled|released|expired"; timestamptz expires_at }
    stripe_events { text event_id PK; text type; timestamptz received_at; timestamptz processed_at; jsonb payload }
    jobs { uuid id PK; uuid workspace_id "null"; enum queue "audit|ingest|observe|report|maintenance"; text type; jsonb payload; text idempotency_key UK; text provider "null"; enum status "pending|running|reconcile|done|failed|dead|deferred_budget"; timestamptz run_at; int attempts; int max_attempts; timestamptz locked_at; text locked_by; text provider_task_id; text last_error }
    audit_log { uuid id PK; uuid organization_id "null"; uuid workspace_id "null"; uuid actor_user_id "null"; enum action; jsonb payload; text ip; timestamptz created_at }
    ops_metrics { timestamptz bucket; text metric; text dimension; numeric value; PK "(bucket,metric,dimension)" }
```

| Tabla | Claves e índices | RLS | Retención | Inmutable |
|---|---|---|---|---|
| `entitlements` | idx `(organization_id, status, valid_until)` | No (por organización en `billing`) | Indefinida | Histórico: un cambio de plan cierra la fila (`valid_until`) y abre otra |
| `payments` | UK `stripe_checkout_session_id` | No | Indefinida (fiscal) | Toda la fila salvo `status` y `audit_id` |
| `subscriptions` (P1) | UK `stripe_subscription_id` | No | Indefinida | — |
| `usage_events` | idx `(workspace_id, created_at)`; idx `(provider, created_at)`; BRIN `created_at` | Sí | 24 meses detallado; agregado mensual indefinido | Toda la fila |
| `provider_pricing` | PK compuesta | No | Indefinida | Toda la fila (se añade vigencia nueva) |
| `budget_reservations` | idx `(workspace_id, status)`; idx `expires_at` where reserved | Sí | 12 meses | — |
| `stripe_events` | PK `event_id` | No | 12 meses | `payload` |
| `jobs` | UK `idempotency_key`; idx `(queue, status, run_at)` para el claim; idx `(provider, status)` para `max_in_flight`; idx `workspace_id` | **No** (el worker es de plataforma; filtra por `workspace_id` al ejecutar dentro de `withWorkspace`) | `done` 7 días; `dead` 90 días | `idempotency_key`, `payload` |
| `audit_log` | idx `(organization_id, created_at)`; idx `(action, created_at)` | Parcial (la organización ve lo suyo) | 24 meses | Toda la fila |
| `ops_metrics` | PK compuesta | No | 90 días | — |

## 6. Volumetría a 100 workspaces (cadencia P0)

| Tabla | Cálculo | Filas/año a 100 workspaces | Tamaño aprox. |
|---|---|---|---|
| `observations` | 25 prompts × 2 superficies × 3 reps × 52 semanas = 7.800/ws | **780.000** | ~2 KB/fila con `response_text` (purgado a 90 d) → ~1,5 GB pico, ~0,4 GB tras purga |
| `citations` | ~3 citas por observación `ok` (supuesto) | ~2.300.000 | ~0,5 GB |
| `serp_positions` | 30 keywords × 52 semanas = 1.560/ws | 156.000 | < 50 MB |
| `metric_rollups` | ~10 métricas × (1 + 2 superficies) × 52 semanas + mensuales ≈ 1.700/ws | 170.000 | < 50 MB |
| `usage_events` | ≈ observaciones + SERP + PSI + PDF ≈ 10.000/ws | 1.000.000 | ~150 MB |
| `audits` + `audit_pages` + `audit_findings` | 1 auditoría/ws/año de 30 páginas con ~40 hallazgos (suscriptores) + auditorías sueltas (supuesto 300/año) | ~12.000 páginas, ~16.000 hallazgos | < 100 MB (HTML fuera de BD) |
| `jobs` | ≈ observaciones + resto; `done` purgado a 7 días | < 50.000 vivas | despreciable |
| **Total** | | **≈ 4,5 M filas/año** | **≈ 2,5 GB/año pico** |

PostgreSQL sin particionar maneja esto con los índices propuestos: las consultas del dashboard filtran por `workspace_id` y rango de fechas sobre tablas de pocos millones de filas; el umbral de particionado (50 M filas en `observations`) está a más de 60 años de esta cadencia, o a ~6 años con cadencia diaria y 100 % de clientes Pro. Coincide con la conclusión de ambos informes.

## 7. Decisiones de modelado

| Decisión | Alternativa | Por qué así |
|---|---|---|
| **Dos niveles de tenancy** (`organizations` → `workspaces`) | Tres niveles (Codex: organización → cliente → proyecto) | Una pyme es un workspace; una agencia, N. El «cliente» de la agencia y su web son la misma cosa en el 100 % de los casos previstos del MVP. Añadir un nivel vacío cuesta en cada consulta, FK y pantalla. El workspace tiene PK propia y no comparte PK con la organización, así que **transferirlo** a otra organización (preocupación de Codex) es un `UPDATE organization_id` auditado más la rotación de grants, posible desde P0 y expuesto como procedimiento en P2 |
| **Prompts versionados por fila nueva** con `parent_id` | Columna `version` mutable o tabla `prompt_versions` aparte | Una observación referencia `(prompt_id, prompt_version)` y nunca cambia de significado; la cadena `parent_id` reconstruye la historia; una sola tabla simplifica RLS e índices |
| **`mentions` en jsonb, `citations` en tabla** | Ambas en jsonb, o ambas en tabla | Las menciones se consultan siempre por observación (para calcular presencia y cuota) y nunca por marca aislada fuera del rollup. Las citas necesitan verificación posterior (`verified_status`), agregación por dominio («fuentes más citadas») y cruce con `competitors.domain`; eso exige columnas indexables |
| **`report_snapshots` acotados a informes** | Tabla genérica de snapshots periódicos (Claude) o ninguna (Codex) | El encargo exige que el PDF salga de datos reales almacenados y sea reproducible. El snapshot congela exactamente lo que el informe enseña; `metric_rollups` sigue siendo recalculable. Se evita duplicar todo el histórico |
| **Credencial cifrada inline en `integrations`** | Tabla `credentials` o `tenant_secrets` genérica | Una integración tiene exactamente una credencial con scopes y expiración; una tabla aparte añade un join y un punto más de fuga. El cifrado es el mismo módulo copiado |
| **`entitlements` separados de `subscriptions`** | Leer límites del plan de Stripe | El piloto cobra por transferencia (`manual`) y un futuro bundle con `lead-platform` no pasa por Stripe. `entitlements` es la única autoridad del derecho de uso (regla de Codex); `subscriptions` es solo el espejo de Stripe |
| **`observations.scheduled_for` en la clave única** | Clave por `run_id` | Si un run se recrea (fallo, reprogramación) la observación de la misma ventana sigue siendo la misma muestra; la clave no depende del id técnico del run |
| **`organization_id` desnormalizado** | Join vía `workspaces` | Permite agregados por organización (coste, uso) sin join y una política RLS adicional por organización en P1 (vista agencia) |
| **HTML de páginas y respuestas largas fuera de BD** | Todo en BD | Evidencia consultable 90 días sin inflar backups; `content_hash`/`response_hash` mantienen la trazabilidad |
| **`jobs` sin RLS** | RLS por workspace | El claim es de plataforma y cruza workspaces; el handler abre `withWorkspace(job.workspace_id)` antes de tocar datos de dominio |

## Notas de coherencia

- 03 dice «dominios secundarios (jsonb)» y «alias hasta 5»: aquí `brand_aliases text[]` y `secondary_domains jsonb`; el límite de 5 se aplica en validación, no en esquema.
- 03 fija competidores en 3 y prompts en 25 para P0; el esquema no limita, lo hace `entitlements.limits`.
- La ventana de 12 meses en Evolución es P1 en 03; el modelo conserva 24 meses desde P0 para que exista histórico cuando llegue la pantalla.
