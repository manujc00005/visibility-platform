# 06 — Contratos principales

**Versión:** 1 (2026-10-25). **Estado:** PROPUESTO. Son contratos de diseño, no endpoints existentes.

Cuatro capas:

- **A. Server Actions** del dashboard (mutaciones autenticadas, CSRF por origen, validación Zod).
- **B. Route handlers HTTP P0**: lo que necesita una URL (checkout, webhook de Stripe, descarga firmada, health).
- **C. Contratos internos** entre módulos (interfaces de proveedor y eventos de dominio).
- **D. API pública P2** (claves de organización), definida ahora para que los servicios internos la sirvan sin rediseño.

Convenciones comunes: JSON UTF-8; fechas ISO-8601 UTC; importes en céntimos enteros con `currency`; errores con cuerpo `{ "error": { "code", "message", "details"? , "request_id" } }`.

Códigos de error tipados (compartidos por B y D):

| `code` | HTTP | Cuándo |
|---|---|---|
| `validation_error` | 400 | Entrada inválida; `details[]` con `path` y `issue` |
| `forbidden` | 403 | Sin permiso sobre el recurso (también cuando el recurso existe en otra organización) |
| `not_found` | 404 | Recurso inexistente **dentro del ámbito** del llamante |
| `rate_limited` | 429 | Límite por IP/dominio/clave; cabecera `Retry-After` |
| `quota_exceeded` | 409 | Límite del plan (prompts, keywords, páginas, workspaces) |
| `budget_hard_capped` | 409 | Presupuesto mensual del workspace agotado |
| `integration_revoked` | 409 | Integración en `reauth_required`/`revoked` |
| `provider_unavailable` | 503 | Proveedor caído; la operación queda encolada si es asíncrona |
| `idempotency_conflict` | 409 | Misma clave de idempotencia con cuerpo distinto |
| `payment_required` | 402 | Acción que exige entitlement activo |

## A. Server Actions (dashboard)

Todas reciben el contexto de sesión en servidor (no en la entrada), validan con Zod, comprueban `authorize(role, resource)` y ejecutan dentro de `withWorkspace()` cuando tocan datos de workspace. Devuelven `{ ok: true, data } | { ok: false, error }`. Las que crean recursos aceptan `clientRequestId` (UUID) como clave de idempotencia por usuario durante 24 h.

| Acción | Entrada (Zod, resumida) | Salida | Permiso | Idempotencia / efectos |
|---|---|---|---|---|
| `createWorkspace` | `name`, `brandName`, `brandAliases[≤5]`, `primaryDomain` (hostname válido, no IP), `country` (ISO-2), `locale`, `sector`, `city?`, `isLocalBusiness` | `workspace` | owner/admin | `quota_exceeded` si supera `limits.workspaces`; UK `(organization_id, primary_domain)` |
| `updateBrand` | `workspaceId`, campos de marca | `workspace` | owner/admin | Cambiar `brandName`/alias **no** versiona prompts pero sí incrementa `normalizer_version` de menciones a partir de ahora (se anota en Evolución) |
| `upsertCompetitors` | `workspaceId`, `competitors[{id?, name, domain, aliases[]}]` | lista | owner/admin | `quota_exceeded` > `limits.competitors`; retirar = `status=retired`, nunca borrar (histórico) |
| `upsertKeywords` | `workspaceId`, `keywords[{text, locale, location}]` | lista | owner/admin | `quota_exceeded` > `limits.keywords` |
| `generatePromptSuggestions` | `workspaceId`, `count ≤ 40` | `prompts[] status=draft` | owner/admin | Encola job `observe:generate_prompts` (LLM); consume presupuesto; una generación en vuelo por workspace |
| `editDraftPrompt` | `promptId`, `text`, `intent`, `country`, `locale` | `prompt` | owner/admin | Solo `draft` |
| `approvePromptSet` | `workspaceId`, `promptIds[≤ limits.prompts]` | `{ promptSetVersion, approvedCount }` | owner/admin | Transición atómica `draft→approved`, retira los `approved` anteriores que no estén en la lista, incrementa `prompt_set_version`, escribe `audit_log.prompt_approved`, programa `baseline` si no hay run previo. **Es la acción que autoriza gasto recurrente** |
| `retirePrompt` | `promptId` | `prompt` | owner/admin | Incrementa `prompt_set_version` |
| `requestAudit` | `workspaceId`, `config?` (dentro de `limits.pages`) | `audit status=queued` | owner/admin | Requiere entitlement `audit_once` disponible o plan con auditorías incluidas; `payment_required` si no |
| `requestManualRun` (P1) | `workspaceId` | `run` | owner/admin | Descuenta de cuota; `budget_hard_capped` |
| `generateReport` | `workspaceId`, `kind audit|monthly`, `period` | `report status=pending` | owner/admin/member | UK `(workspace, kind, period)`: devuelve el existente |
| `sendReport` | `reportId`, `emails[≤5]` | `report.sent_to` | owner/admin | No reenvía a un email ya en `sent_to` |
| `createServiceRequest` | `workspaceId?`, `kind`, `message ≤ 2000`, `email` (prellenado) | `serviceRequest` | cualquier miembro | Notifica al owner de plataforma; rate limit 3/día/workspace |
| `inviteMember` | `email`, `role admin|member`, `workspaceIds?` | `invite` | owner/admin | Token de un solo uso, 48 h |
| `changeMemberRole` / `removeMember` | `membershipId`, `role` | — | owner (admin no toca owner) | Último owner no se puede quitar |
| `connectIntegration` (P1) | `workspaceId`, `provider gsc|ga4` | `{ authorizeUrl }` | owner/admin | `state` firmado ligado a sesión + workspace |
| `selectIntegrationProperty` (P1) | `integrationId`, `externalId` | `integration` | owner/admin | Encola backfill |
| `revokeIntegration` (P1) | `integrationId` | — | owner/admin | Revoca en Google, purga credencial |
| `exportWorkspace` / `deleteWorkspace` (P1) | `workspaceId`, confirmación literal del dominio | job | owner | Borrado en cascada + artefactos + evento |
| Admin: `grantManualEntitlement` | `organizationId`, `planKey`, `validUntil`, `externalRef` | `entitlement` | platform_admin | Cierra el entitlement anterior; `audit_log.entitlement_changed` |
| Admin: `updateServiceRequestStatus` | `id`, `status` | — | platform_admin | — |
| Admin: `retryDeadJob` / `releaseReservation` | `jobId` / `reservationId` | — | platform_admin | Auditado |

## B. Route handlers HTTP (P0)

### B.1 `POST /api/v1/checkout/audit` — público

Crea una sesión de Stripe Checkout para una auditoría puntual. No crea cuenta hasta que el pago se confirma.

Rate limit: 5/hora por IP, 3/día por dominio normalizado. Validación: `domain` hostname público (sin esquema, sin IP literal, sin `localhost`, resuelve en DNS público; la comprobación SSRF completa se hace en el fetch, no aquí).

Petición:

```json
{
  "domain": "clinicadentalgarcia.es",
  "email": "info@clinicadentalgarcia.es",
  "sector": "clínica dental",
  "city": "Valladolid",
  "isLocalBusiness": true,
  "locale": "es-ES",
  "country": "ES",
  "consent": { "terms": true, "privacy": true },
  "utm": { "source": "landing", "campaign": "octubre" }
}
```

Respuesta `201`:

```json
{
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_…",
  "checkoutSessionId": "cs_test_…",
  "expiresAt": "2026-10-25T13:00:00Z",
  "price": { "amountCents": 14900, "currency": "EUR", "productKey": "audit_once" }
}
```

Errores: `validation_error` (dominio o email inválidos, consentimiento falso), `rate_limited`, `provider_unavailable` (Stripe caído). Efectos: fila `payments(status=pending)` con el dominio y datos del formulario en `metadata`; nada más. Metadatos enviados a Stripe: `domain`, `email`, `locale`, hash del formulario (no datos personales adicionales).

### B.2 `POST /api/webhooks/stripe`

Verificación de firma `Stripe-Signature` con el secreto del endpoint; cuerpo crudo. Idempotencia: `INSERT stripe_events(event_id)`; si existe, `200` sin efecto. El efecto y el registro del evento van en la **misma transacción**.

| Evento | Nivel | Efecto |
|---|---|---|
| `checkout.session.completed` (modo `payment`) | P0 | `payments.status=paid`; si no existe usuario con ese email: crear `users` (sin contraseña, con enlace de establecimiento 48 h) + `organizations(kind=company)` + `memberships(owner)`; crear `workspaces` con el dominio; `entitlements(plan_key=audit_once, billing_source=stripe, external_ref=session.id)`; crear `audits(status=queued, payment_id)`; encolar `audit:run`; email «hemos recibido tu pago, el informe llega en menos de una hora». Si el email ya pertenece a una organización, se añade el workspace a esa organización (si el dominio ya existe allí, se reutiliza) |
| `checkout.session.async_payment_failed` / `expired` | P0 | `payments.status=failed`; nada más |
| `charge.refunded` | P0 | `payments.status=refunded`; `audit_log`; no borra el informe |
| `customer.subscription.created/updated/deleted` | P1 | Espejo en `subscriptions`; abre/cierra `entitlements(billing_source=stripe)` según `status` y `price_id → plan_key` |
| `invoice.payment_failed` | P1 | `entitlements.status=past_due`; aviso; tras el periodo de gracia configurado, `suspended` (los runs pasan a `deferred_budget`) |
| `invoice.paid` | P1 | `past_due → active` |

Respuesta: siempre `200 {"received": true}` tras persistir; `400` solo si la firma es inválida (y alerta al owner). Cualquier error interno devuelve `500` para que Stripe reintente; la idempotencia hace el reintento seguro.

### B.3 `GET /api/v1/reports/{reportId}/download?token=…`

Descarga del PDF por enlace firmado (sin sesión; es lo que va en el email).

- `token` = HMAC-SHA256 sobre `reportId|expiresAt` codificado con `expiresAt`; validez 7 días; se puede regenerar desde el dashboard.
- Comprueba que `reports.status=ready` y que el `pdf_object_key` existe en el `ArtifactStore`.
- Respuesta `200 application/pdf`, `Content-Disposition: attachment; filename="visibilidad-{dominio}-{periodo}.pdf"`, `Cache-Control: private, no-store`.
- Errores: `403 forbidden` (firma inválida o caducada: mensaje que invita a pedir un enlace nuevo), `404 not_found`, `409` con `code: report_not_ready`.
- Efecto: `audit_log.report_downloaded` con IP.

Con sesión, la misma ruta sin `token` sirve el PDF si el usuario tiene acceso al workspace.

### B.4 `GET /api/health`

Sin autenticación, sin datos sensibles. `200 { "db": "ok", "worker": { "lastHeartbeatAt": "...", "status": "ok|stale" }, "artifacts": { "freeMb": 12000 }, "version": "git-sha" }`; `503` si la BD no responde o el worker lleva > 10 minutos sin latido con jobs pendientes.

### B.5 OAuth Google (P1)

`GET /api/integrations/google/callback?code&state`: verifica `state` (firmado, ligado a sesión + workspace + provider, 10 minutos), intercambia el código, cifra tokens, redirige al selector de propiedad. Errores redirigen al dashboard con un código, nunca muestran el error de Google en crudo.

## C. Contratos internos

### C.1 Interfaces de proveedor (resumen; detalle en `04-architecture.md` §4)

Todas devuelven:

```ts
type ProviderResult<T> = {
  provider: string;              // "dataforseo" | "psi" | "gsc" | "perplexity" | "fake"
  providerTaskId: string | null; // null si el proveedor no da id
  costCents: number;             // coste real o estimado según provider_pricing
  captureCondition: "ui_scraper" | "serp" | "api_with_search" | "api_no_search" | "owner_api";
  normalizerVersion: string;     // "mentions-v1", "citations-v1"
  requestedAt: string; observedAt: string;
  raw: unknown;                  // conservado 90 d en ArtifactStore
  data: T;
};
```

- `AnswerObservationProvider.run({ prompt, surface, country, locale }) → ProviderResult<{ text: string; citations: { url: string; title?: string }[] }>`. **UNVERIFIED** que el LLM Scraper de DataForSEO devuelva citas estructuradas: `citations` puede ser `[]`, y el normalizador extrae URLs del texto marcándolas `source=text_extracted`.
- `SerpProvider.fetch({ keyword, location, locale, device, depth, includeAio }) → ProviderResult<{ positions: {...}[]; serpFeatures: {...}; aio?: { text; citations[] } }>`.
- `PerformanceProvider.measure({ url, strategy }) → ProviderResult<{ lcpMs, cls, inpMs, fcpMs, ttfbMs, perfScore, labOrField }>`; campos `null` cuando PSI no tiene datos de campo (frecuente en pymes).
- `AuditFetcher.fetch({ url, maxBytes, timeoutMs, respectRobots }) → { statusCode, redirectChain, headers, html } | { fetchError }`; es el único con comprobaciones SSRF, y rechaza con `fetchError=blocked_private_address` sin conectar.
- `SearchPerformanceProvider` / `AnalyticsProvider` (P1): `pull({ integrationId, from, to }) → ProviderResult<DailyRow[]>` con `completeness`.

Errores de proveedor clasificados `RetryableProviderError` / `TerminalProviderError` (copia de `errors.ts` de LP, VERIFIED): 429/5xx/timeout → retryable; 4xx de validación, cuota de cuenta agotada, `invalid_grant` → terminal (este último además marca `reauth_required`).

### C.2 Eventos de dominio (in-process, emitidos tras commit)

| Evento | Payload | Productor | Consumidores P0 |
|---|---|---|---|
| `audit.completed` | `{ auditId, workspaceId, healthIndex, findingsBySeverity, observationsRunId }` | audit-engine | metrics-reporting → `buildSnapshot(kind=audit)` → `renderReport` → `sendReport`; identity → email al cliente |
| `audit.failed` | `{ auditId, reason }` | audit-engine | Telegram owner; email al cliente con plazo |
| `run.completed` | `{ runId, workspaceId, expected, completed, failed, costCents }` | geo-monitoring | metrics-reporting → rollup semanal; si cobertura < 80 % → alerta |
| `report.generated` | `{ reportId, snapshotId, workspaceId, kind }` | metrics-reporting | envío de email; `audit_log` |
| `budget.soft_threshold` / `budget.hard_capped` | `{ workspaceId, spentCents, limitCents }` | billing | Telegram owner; email cliente; jobs → `deferred_budget` |
| `integration.reauth_required` (P1) | `{ integrationId, workspaceId, provider }` | seo-providers | email cliente; banner en dashboard |
| `service_request.created` | `{ id, kind, workspaceId?, email }` | identity | Telegram owner; P2 → webhook a `lead-platform` |
| `entitlement.changed` | `{ organizationId, planKey, status }` | billing | geo-monitoring reprograma o pausa runs |

Los eventos no cruzan procesos: si un consumidor necesita trabajo largo, encola un job. Sin bus externo.

## D. API pública (P2, contratos definidos ahora)

Autenticación: `Authorization: Bearer vp_live_…` (clave con alcance de organización, hash en `api_keys`, rotable). Versión en la ruta. Paginación por cursor opaco (`?cursor=&limit≤200`, respuesta `{ data, nextCursor }`). Mutaciones aceptan `Idempotency-Key` (24 h; cuerpo distinto → `idempotency_conflict`). Rate limit por clave: 600 req/10 min (token bucket en Postgres). Todo filtrado por la organización de la clave; un `workspaceId` ajeno devuelve `not_found`, nunca `forbidden` (no se revela existencia).

| Método y ruta | Uso | Notas |
|---|---|---|
| `GET /v1/workspaces` · `POST /v1/workspaces` | listar / crear | `quota_exceeded` |
| `GET /v1/workspaces/{id}/overview?from&to` | las 4 tarjetas con delta, `sampleSize`, `methodologyVersion`, `promptSetVersion` | |
| `GET /v1/workspaces/{id}/metrics?metric=&surface=&period=week|month&from&to` | series de `metric_rollups` con `numerator`, `denominator`, `sampleSize` y `breaks[]` (cambios de versión) | nunca promedia superficies |
| `GET /v1/workspaces/{id}/visibility?from&to&surface=` | tabla prompt × superficie: tasa de aparición, citas propias, última respuesta de ejemplo (texto solo si < 90 d) | |
| `GET /v1/workspaces/{id}/sources?from&to` | dominios citados: veces, `kind`, `verifiedStatus` | |
| `GET /v1/workspaces/{id}/audits` · `GET /v1/audits/{id}` · `POST /v1/workspaces/{id}/audits` | histórico y solicitud de auditoría | `payment_required` / `quota_exceeded` |
| `GET /v1/workspaces/{id}/reports` · `GET /v1/reports/{id}` · `POST /v1/workspaces/{id}/reports` | informes; `GET /v1/reports/{id}` devuelve `downloadUrl` firmada | |
| `GET /v1/workspaces/{id}/prompts` · `POST` · `PATCH /v1/prompts/{id}` · `POST /v1/workspaces/{id}/prompts:approve` | gestión y aprobación | aprobar = autoriza gasto |
| `GET /v1/runs/{id}` | estado, cobertura, coste, errores | |
| `POST /v1/webhooks` · `GET` · `DELETE` | suscripción a `report.generated`, `run.completed`, `audit.completed`, `integration.reauth_required` | firma HMAC `X-Visibility-Signature`, reintentos con backoff 24 h |

Ejemplo `GET /v1/workspaces/{id}/overview?from=2026-09-01&to=2026-09-30`:

```json
{
  "data": {
    "period": { "from": "2026-09-01", "to": "2026-09-30", "previous": { "from": "2026-08-01", "to": "2026-08-31" } },
    "promptSetVersion": 2,
    "methodologyVersion": "2026.10",
    "cards": [
      { "metric": "health_index", "value": 61, "previous": 54, "delta": 7, "sampleSize": null, "source": "audit", "classification": "public" },
      { "metric": "brand_presence", "surface": "chatgpt", "value": 0.32, "numerator": 24, "denominator": 75, "previous": 0.28, "delta": 0.04, "sampleSize": 75, "captureCondition": "ui_scraper", "classification": "third_party_estimate", "confidenceNote": "3 repeticiones semanales; variaciones < 10 puntos pueden ser ruido" },
      { "metric": "share_of_voice", "surface": "google_aio", "value": 0.21, "numerator": 16, "denominator": 77, "sampleSize": 72, "captureCondition": "serp", "classification": "third_party_estimate" },
      { "metric": "serp_avg_position", "value": 14.2, "previous": 15.8, "delta": -1.6, "sampleSize": 30, "classification": "third_party_estimate" }
    ],
    "breaks": [ { "at": "2026-09-15", "kind": "prompt_set_version", "from": 1, "to": 2 } ]
  }
}
```

### D.1 Contratos hacia `lead-platform` (P2, propuestos)

- **Exportación de `service_requests`:** `POST` al webhook de formularios del CRM (`/api/webhooks/forms`, VERIFIED que existe la ruta en LP; su contrato exacto no se inspeccionó: INFERRED que acepta un formulario con nombre, email, mensaje y origen). Cuerpo propuesto: `{ source: "visibility-platform", kind, email, domain, message, reportUrl, utm }` firmado con HMAC compartido. `lead-platform` decide tenant por su `channels.external_id` (según ambos informes).
- **Enlace firmado desde el CRM:** `POST /v1/sso/links` con clave de integración: `{ email, workspaceId }` → `{ url, expiresAt }` (un solo uso, 5 minutos). Abre sesión local **solo** si el email ya es miembro de la organización dueña del workspace; no concede acceso nuevo. Sin compartir cookie ni BD.
- **Conector de leads como `AnalyticsProvider`:** depende de que `lead-platform` publique `GET /api/v1/metrics/leads?from&to` por tenant (iniciativa F de su roadmap, UNVERIFIED que exista); hasta entonces no se diseña más.

## Notas de coherencia

- 03 fija que la cuenta se crea **al pagar**: B.1 no crea nada salvo `payments(pending)`; toda la creación va en B.2. Si Stripe tarda, el cliente ve una pantalla «confirmando pago» que consulta el estado del `payments` por `checkoutSessionId` (acción pública de solo lectura, rate-limited).
- 03 pone «Verificación de citas» en P1: el campo `verified_status` existe desde P0 pero nadie lo rellena hasta P1.
- La API pública usa los mismos servicios que las Server Actions; no hay lógica propia en los handlers (regla de `04-architecture.md` §3.1).
