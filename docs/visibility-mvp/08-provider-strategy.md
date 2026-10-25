# 08 — Estrategia de proveedores: Build vs Buy y fuentes de datos

**Versión:** 1 (2026-10-25). **Estado:** PROPUESTO, pendiente de revisión cruzada.

Vocabulario: `00-analysis-comparison.md` §7 y `03-mvp-scope.md`.

## 0. Regla de etiquetado de este documento

Ningún precio, cuota ni término contractual de este documento ha sido reverificado en esta sesión. Cada dato lleva una de estas etiquetas:

- **UNVERIFIED (Claude, 2026-10-25)** / **UNVERIFIED (Codex, 2026-10-25)** / **UNVERIFIED (ambos)**: tomado de uno o de los dos informes previos, leído por ellos en documentación pública ese día.
- **SIN DATO — pendiente de verificación**: ninguno de los dos informes aporta el dato. Se modela con una variable nombrada en `09-cost-model.md`.

Donde los informes discrepan se muestran ambos valores. Antes de cobrar la primera suscripción, cada dato UNVERIFIED que afecte a coste o licencia debe pasar a VERIFIED con fecha y fuente en este mismo documento.

## 1. Tres clases de medición

El producto maneja tres clases de dato que **no son intercambiables** y que se etiquetan en cada observación (`capture_condition`) y en cada gráfico e informe:

| Clase | `capture_condition` | Qué demuestra | Qué no demuestra | Ejemplos |
|---|---|---|---|---|
| **API oficial del dueño del dato** | `owner_api` | Actividad agregada real del sitio según las reglas de la fuente, con autorización del propietario | Causalidad entre una mención y una venta; datos de competidores | Google Search Console, GA4 (P1), Bing Webmaster AI Performance (P2) |
| **Observación de la interfaz real** | `ui_scraper`, `serp` | Lo que esa superficie devolvió a un usuario anónimo, en un país y un momento concretos | La frecuencia real de exposición entre usuarios; que la respuesta sea estable | ChatGPT UI vía LLM Scraper, Google AI Overviews vía SERP, posiciones orgánicas |
| **Respuesta simulada vía API de LLM** | `api_with_search`, `api_no_search` | La respuesta de ese modelo con esa configuración y herramientas | Lo que la aplicación comercial muestra a sus usuarios | Perplexity API (P1), OpenAI API como fallback |

Regla no negociable, común a ambos informes: **un resultado obtenido por API de un modelo nunca se presenta como «lo que ve el usuario»**. Claude cita estudios del sector (no revisados por pares, UNVERIFIED) con diferencias grandes entre UI y API para la misma consulta el mismo día: 845 marcas únicas frente a 135, y solapamiento de fuentes del 25,6 %. Codex llega a la misma regla por vía contractual y metodológica. Consecuencias:

1. Las series de distinta `capture_condition` **no se unen ni se promedian**. Un cambio de proveedor o de vía abre una serie nueva con marca de ruptura.
2. Una «muestra puntual» (auditoría) no es una «tendencia» (monitorización): el informe lo dice en su sección de limitaciones.
3. La métrica es **tasa de aparición en N ejecuciones**, nunca «posición» ni «ranking IA».

## 2. Matriz Build vs Buy por capacidad

| Capacidad | Decisión | Proveedor / implementación | Nivel | Justificación |
|---|---|---|---|---|
| Fetch y análisis HTML de la auditoría (metadatos, encabezados, canonicals, robots, sitemap, JSON-LD, indexabilidad observable, NAP) | **BUILD** | Fetcher propio con protección SSRF + parser HTML | P0 | Es el núcleo del Módulo A, no tiene coste de proveedor y define la calidad del informe. Lo que ambos informes vetaban era el crawler exhaustivo y los backlinks, no un análisis acotado a 30 páginas |
| Rendimiento web (Core Web Vitals laboratorio y campo) | **BUY gratuito** | PageSpeed Insights API | P0 | Datos de Lighthouse y CrUX sin construir un runner. Cuota y términos: **SIN DATO** |
| SERP y posiciones orgánicas | **BUY** | DataForSEO SERP (P0); Serper como segundo adaptador (P1) | P0 | Ambos informes coinciden en DataForSEO. Construir scraping de Google está OUT |
| AI Overviews de Google | **BUY** | DataForSEO SERP con carga de AI Overview | P0 | Es la superficie IA que más ven los usuarios reales de una pyme local; viene en la misma llamada SERP |
| Observación de ChatGPT (interfaz) | **BUY la captura** | DataForSEO LLM Scraper | P0 | Ambos informes lo eligen. No construir scraper propio, proxies ni evasión |
| Observación de Gemini (interfaz) | BUY la captura | DataForSEO LLM Scraper | P1 | Mismo contrato; se añade cuando el piloto lo justifique |
| Perplexity | BUY API | Perplexity Agent API (`sonar` + búsqueda) | P1 | Barata y con `search_results` según Claude; se etiqueta `api_with_search` y no se mezcla con `ui_scraper` |
| ChatGPT vía OpenAI API con búsqueda | **Solo fallback etiquetado** | OpenAI API | P1 (con tope) | ×15 más caro que el scraper según Claude; condición distinta; nunca sustituye en silencio a la serie UI |
| Search Console, GA4 | **BUILD conector** | API oficial de Google con OAuth del cliente | P1 | Gratis con autorización del propietario; exige verificación de scopes de Google antes del uso público |
| Generación de prompts, keywords y redacción de recomendaciones | BUILD sobre LLM propio | Proveedor LLM a elegir (OpenAI, Anthropic o Google; LP ya usa los tres vía AI SDK) | P0 | Coste acotado por auditoría (~28k tokens); el informe puede ser determinista si hace falta |
| Email transaccional e informes | BUY | Resend | P0 | Ya en uso en `lead-platform` detrás de `EmailProvider` |
| Pagos | BUY | Stripe (Checkout P0, Billing P1) | P0 | Ningún informe encontró nada reutilizable en LP |
| PDF | BUILD con Chromium headless (Playwright) en el worker | — | P0 | Una plantilla HTML, dos salidas. Alternativa si la memoria del VPS no lo permite: servicio externo HTML→PDF (el HTML no contiene datos personales, solo del dominio auditado) |
| Herramientas de AI visibility completas (Otterly, Peec, Profound, Scrunch, etc.) | **NO BUY como backend** | — | OUT | Cobran por prompt y por dominio; API limitada o solo Enterprise; sin términos de reventa publicados (UNVERIFIED, ambos). Solo se compraría la captura, no la herramienta |
| Semrush, Ahrefs | **NO BUY** para redistribuir | — | OUT | Términos de uso interno, prohibición de sublicenciar, caché limitada (UNVERIFIED, ambos coinciden) |
| Proxies, scraping propio de asistentes, índice de backlinks, buscador propio | **NO BUILD** | — | OUT | Coincidencia explícita de ambos informes |

## 3. Tabla de proveedores

Precios en la moneda en que los leyó cada informe; sin conversión.

| Proveedor | Capacidad | Precio observado | Límites observados | Licencia / redistribución | Lock-in | Veredicto |
|---|---|---|---|---|---|---|
| **DataForSEO — SERP Google** | Orgánico top N, AI Overview, AI Mode | 0,0006 $ por página de 10 resultados (Standard). Claude: 0,60 $/1.000 std, 1,20 priority, 2,00 live; +profundidad cada 10 resultados; AI Overview +2,00 $/1.000 (async); AI Mode 1,20–4,00 $/1.000. UNVERIFIED (ambos) | Codex: límite general 10.000 req/min publicado, otra guía oficial conserva 2.000. Claude: hasta 10.000 llamadas/min, 100 tareas por POST. UNVERIFIED | ToS sin cláusula de reventa ni white-label; **sin licencia escrita** (ambos). Codex: anuncia uso en interfaces y entregables de terceros | Bajo-medio: SERP sustituible por Serper / Value SERP | **P0** |
| **DataForSEO — LLM Scraper** | Captura de interfaz de ChatGPT y Gemini, con citas | 0,0012 $ por página (Standard) en ambos; Claude: 4,00 $/1.000 live y **advierte que la página de precios muestra cifras inconsistentes**. UNVERIFIED (ambos) | Idem cuenta DataForSEO | Idem: confirmar conservación y redistribución por escrito | Medio: es la única captura UI documentada por ambos | **P0** (ChatGPT), P1 (Gemini) |
| **Serper** | SERP Google | 1,00 → 0,30 $/1.000 por packs; créditos caducan a 6 meses. UNVERIFIED (Claude) | 50–300 qps. UNVERIFIED (Claude) | SIN DATO | Bajo | P1 (segundo adaptador SERP) |
| Value SERP (Traject) | SERP | 2,50 → 0,50 $/1.000. UNVERIFIED (Claude) | 250–5.000 req/min | SIN DATO | Bajo | Alternativa P1 |
| SerpApi | SERP + AI Overview + AI Mode | 25 → 5,50 $/1.000; «Legal Shield» desde plan Production. UNVERIFIED (Claude) | Por hora | No revender «el servicio» (Claude) | Bajo | P2, solo si hace falta su cobertura legal |
| Bright Data SERP | AI Overview parseado | 1,50 $/1.000 PAYG. UNVERIFIED (Claude) | — | SIN DATO | Bajo | Alternativa P2 |
| **Perplexity Agent API** | Respuesta con búsqueda y `search_results` | ≈ 4,4 $/1.000 ejecuciones (2,9 $ en modo fast), supuesto 500 tokens entrada / 700 salida. UNVERIFIED (Claude). Codex no lo evalúa | — | Sin restricción señalada por Claude; Sonar Chat Completions retirado el 2026-09-27 según Claude | Bajo | P1, etiquetado `api_with_search` |
| OpenAI API + `web_search` | Respuesta con citas `url_citation` | gpt-5.4-mini ≈ 13,5 $/1.000 + tokens de búsqueda (≈ 18 $); gpt-5.5 ≈ 33,5 $. UNVERIFIED (Claude) | — | ToS no legibles ese día (403) → pendiente. Citas deben mostrarse clicables (Claude) | Bajo | P1 solo como fallback con tope |
| Claude Haiku + web search | Respuesta con citas | ≈ 11 $/1.000. UNVERIFIED (Claude) | — | — | Bajo | P2 |
| Gemini API + Grounding | Respuesta con `groundingMetadata` | 2.5 Flash 36,9 $/1.000 (1,9 $ dentro de 1.500/día gratis); 3.x Flash 17 $ (5.000 búsquedas/mes gratis). UNVERIFIED (Claude). Codex: la búsqueda puede generar cargos por consulta ejecutada | — | **Prohibido cachear, analizar, revender o construir índice con Grounded Results** (términos 2026-04-28 según Claude) | — | **OUT como fuente histórica** |
| Copilot / Bing grounding (Foundry) | Respuesta con citas | 14 $ + tokens Azure. UNVERIFIED (Claude) | — | **Prohibido almacenar o construir BD con el output** (Claude) | — | **OUT** |
| xAI grok + web_search | Respuesta con fuentes | 7,4 $/1.000. UNVERIFIED (Claude) | — | — | Bajo | P2 |
| **Google Search Console API** | Clics, impresiones, CTR, posición por query/página/país/dispositivo/fecha; 16 meses de histórico | Gratis | 1.200 QPM por sitio y usuario (ambos); Claude: 25.000 filas/petición, 50.000 filas/día/tipo, 40.000 QPM / 30 M QPD por proyecto; retraso 2–3 días. UNVERIFIED | Mostrar al cliente sus datos con su consentimiento: sí; cruzar tenants o vender: no (API ToS §5 según Claude). Scopes sensibles requieren verificación de Google (3–5 días hábiles según Claude); modo *Testing* ≤100 usuarios sin verificación | — | **P1** |
| **GA4 Data API** | Sesiones, conversiones, canal orgánico | Gratis | 200.000 tokens/propiedad/día, 40.000/hora, 10 concurrentes (ambos); Claude añade 14.000/proyecto/propiedad/hora. UNVERIFIED | Igual que GSC | — | P1 |
| **PageSpeed Insights API** | Lighthouse (laboratorio) y CrUX (campo) por URL | Gratis (supuesto del diseño) | **SIN DATO — pendiente de verificación** (cuota diaria y por minuto, necesidad de API key, términos de exhibición) | **SIN DATO** | Bajo (Lighthouse puede ejecutarse localmente como alternativa) | **P0 condicionado** a verificar cuota |
| Google Places / Business Profile API | Ficha de negocio | **SIN DATO** (ningún informe lo evalúa; Places es de pago según conocimiento general, sin fuente) | SIN DATO | SIN DATO | — | P2 |
| Bing Webmaster Tools | Query stats; informe AI Performance | Gratis | Claude: SOAP/POX se retiran el 2026-08-31; REST sin documentación localizada. Codex: cuotas y acceso API al informe IA pendientes | Clave personal no compartible (Claude) | — | P2 |
| SE Ranking | Rank tracker, Data API, AI Results Tracker, white-label | Claude: Wallet 45 €/250K créditos; Standalone 155 €/mes; AI Search add-on +79 €/mes (200 prompts). Codex: PAYG desde 50 $/250.000 créditos; standalone anual 2.148 $/12 M créditos. UNVERIFIED | 10 req/s Data, 5 req/s Project (Claude); 10 req/s (Codex) | Claude: uso comercial permitido salvo competidores directos; Codex: confirmar licencia del SaaS | Medio | Plan B si el runner propio falla; P2 |
| **Semrush** | API estándar; AI Visibility | Plan Business + unidades (precio no público); AI Visibility 99 $/mes/dominio anual (Codex), 94,94 €/mes por dominio (Claude). UNVERIFIED | 10 req/s (Claude) | **«solely for internal business purposes»; prohibido sublicenciar/revender; caché ≤ 1 mes** (ambos) | Alto | **OUT** |
| **Ahrefs** | API v3, Rank Tracker, Brand Radar | Lite 119 €/mes (Claude) / 129 $/mes (Codex). UNVERIFIED | 60 req/min (Claude) | **Uso interno; explotación comercial requiere consentimiento escrito** (ambos) | Alto | **OUT** |
| Otterly.AI | Menciones, citas, competidores, API | **189 $/mes Standard, 100 prompts (Claude)** vs **160 $/mes, 100 prompts (Codex)**; API 2.000 req/mes. UNVERIFIED, discrepan | 2.000 req / 5 min (Codex) | Sin términos de reventa publicados | Alto (por prompt y marca) | OUT como backend |
| Peec AI, Profound, Scrunch, Rankscale, Evertune, AthenaHQ, Goodie, LLM Pulse, Nightwatch | Herramientas de AI visibility | Rangos 49–999 $/mes y planes Enterprise; API frecuentemente solo Enterprise. UNVERIFIED (Claude; Codex evalúa Peec y Nightwatch con precio pendiente) | Varios | Ninguna publica términos de reventa (Claude) | Alto | OUT como backend |
| Stripe | Pagos | Codex: supuesto 3 % + 0,30 $ (no verificado). Claude: ≈ 1,5 % + 0,25 € por cobro europeo (verificar). UNVERIFIED, discrepan | — | — | Bajo | P0 |
| Resend | Email | Capa gratuita; ≈ 20 $/mes a partir de ~50 clientes (Claude). UNVERIFIED | LP tiene tope 100/mes en su uso actual (Claude) | — | Bajo | P0 |
| Sentry | Errores | Capa gratuita; ≈ 26 $/mes a partir de ~50 clientes (Claude). UNVERIFIED | — | — | Bajo | P0 |

## 4. Redistribución comercial: permitido, restringido, pendiente

### 4.1 Permitido según documentación leída (UNVERIFIED, 2026-10-25)

- **Google Search Console y GA4**: mostrar al cliente sus propios datos con su consentimiento. No cruzar entre clientes, no vender (Claude, API ToS §5).
- **SE Ranking**: uso comercial permitido salvo competidores directos (Claude). Codex pide confirmar la licencia del SaaS. Útil solo como plan B.
- **Perplexity API, xAI**: sin restricción de almacenamiento señalada por Claude. No se ha leído el texto completo de sus términos en esta sesión.

### 4.2 Restringido (no usar para redistribuir)

- **Semrush**: uso interno, prohibido sublicenciar, caché ≤ 1 mes. Incompatible con histórico multianual vendido a clientes (ambos).
- **Ahrefs**: uso interno; explotación comercial requiere consentimiento escrito (ambos).
- **Gemini Grounding API**: prohibido cachear, analizar, revender o construir índice con los resultados (Claude, términos 2026-04-28).
- **Bing / Copilot grounding**: prohibido almacenar o construir BD con el output (Claude).
- **SerpApi**: no revender «el servicio» (Claude). Compatible con usar los datos, pero no se elige por precio.

### 4.3 Pendiente de validación escrita

- **DataForSEO**: ToS sin cláusula de reventa ni white-label (Claude, 2026-06-12); anuncia uso en interfaces y entregables de terceros (Codex). **Falta licencia escrita** sobre tres puntos: exhibición a clientes finales con marca propia, **conservación** de observaciones más allá de la sesión (24 meses) y **redistribución** en PDF.
- **OpenAI API**: ToS no legibles el día de la lectura (403, Claude).
- **PageSpeed Insights API**: términos de exhibición y cuota: SIN DATO.
- **Todas las herramientas de AI visibility**: sin términos de reventa publicados (Claude). No aplica mientras sigan OUT.

**Condición de lanzamiento:** la confirmación escrita de DataForSEO sobre conservación y redistribución es **condición previa a cobrar la primera suscripción** (P1). Para la auditoría puntual (P0) el riesgo es menor (una muestra, un PDF) pero igualmente se solicita antes del primer cobro, y la sección «Limitaciones» del informe declara el origen de cada dato.

## 5. Contratos de las interfaces de proveedor

Todas las interfaces viven en el módulo `seo-providers` (SERP, GSC, GA4, PSI, fetch) o `geo-monitoring` (observación de asistentes) y comparten un sobre común. El dominio solo conoce el sobre y la interfaz; nunca un SDK concreto.

### 5.1 Sobre común de todo resultado

Cada llamada a un proveedor devuelve, además de su payload tipado:

| Campo | Obligatorio | Uso |
|---|---|---|
| `provider` | Sí | `dataforseo`, `serper`, `perplexity`, `openai`, `google_gsc`, `google_ga4`, `google_psi`, `internal_fetch` |
| `provider_task_id` | Sí si el proveedor lo da | Reconciliación tras timeout: se guarda **antes** de confirmar el gasto. Si no existe, se registra `null` y la operación no puede garantizar «exactamente una compra» (Codex) |
| `cost_cents` | Sí | Coste real notificado o calculado desde `provider_pricing`; se registra también en fallos |
| `capture_condition` | Sí | `owner_api`, `ui_scraper`, `serp`, `api_with_search`, `api_no_search` |
| `requested_country`, `requested_locale`, `effective_country` | Sí | Si el proveedor no soporta el país pedido, `effective_country = unknown` y se muestra como desconocido (Codex) |
| `normalizer_version` | Sí | Versión del código que convirtió el raw en entidades; cambiarla abre serie nueva |
| `captured_at` | Sí | UTC |
| `raw_ref` | Sí | Referencia al payload bruto, conservado 90 días |

Se registra una fila en `usage_events` por llamada (éxito o fallo) y se concilia contra `budget_reservations`.

### 5.2 Errores tipados

| Clase | Comportamiento del worker | Ejemplos |
|---|---|---|
| `RetryableProviderError` | Reintento con backoff; máx. 3 intentos en observaciones (coste contabilizado en cada intento) | 5xx, timeout de red, 429 con `Retry-After` |
| `QuotaExceededError` | No reintenta en esta ventana; marca la ejecución como `partial` y baja la cobertura operativa; alerta | 429 persistente, saldo insuficiente, cuota diaria PSI/GSC |
| `TerminalProviderError` | Sin reintento; observación `failed` con motivo; alerta si supera umbral | 4xx de validación, país no soportado, URL inválida |
| `AuthRevokedError` (solo `owner_api`) | Conexión a `reauth_required`; sin reintento; aviso al usuario | Token OAuth revocado |
| `ProviderUnavailableError` | Equivalente a retryable con circuit breaker por proveedor | Scraper roto detectado por respuestas vacías repetidas |

### 5.3 Interfaces

```ts
// Módulo A. Descarga segura de recursos del dominio auditado.
interface AuditFetcher {
  fetch(input: { url: string; respectRobots: true; maxBytes: number; timeoutMs: number }):
    Promise<Envelope<{ status: number; finalUrl: string; headers: Record<string,string>; body: string; redirects: string[] }>>;
}
// Protección SSRF obligatoria dentro del adaptador: resolver DNS antes de conectar, bloquear
// rangos privados/loopback/link-local, revalidar cada redirección, límite de redirecciones y tamaño.

// Módulo A. Rendimiento. Adaptadores: PageSpeed Insights (P0); Lighthouse local (alternativa).
interface PerformanceProvider {
  measure(input: { url: string; strategy: "mobile" | "desktop" }):
    Promise<Envelope<{ lab: CoreWebVitals; field?: CoreWebVitals; lighthouseVersion: string }>>;
}

// Módulo B / SEO. Posiciones orgánicas y AI Overview. Adaptadores: DataForSEO (P0), Serper (P1).
interface SerpProvider {
  fetchTop(input: { keyword: string; locale: string; location: string; device: "desktop" | "mobile"; depth: 10 | 20 | 50 | 100; includeAiOverview: boolean }):
    Promise<Envelope<{ organic: SerpItem[]; aiOverview?: AnswerPayload }>>;
}

// Módulo B. Respuesta de un asistente. Un adaptador por (surface, capture_condition).
interface AnswerObservationProvider {
  surface: "chatgpt" | "gemini" | "perplexity" | "google_aio";
  condition: "ui_scraper" | "api_with_search" | "api_no_search" | "serp";
  observe(input: { prompt: string; locale: string; country: string }):
    Promise<Envelope<AnswerPayload>>;
}
type AnswerPayload = { text: string; citations: { url: string; title?: string; position: number }[] };

// P1. Fuentes autorizadas por el propietario. Adaptadores: GSC, GA4, Bing (P2).
interface SearchPerformanceProvider {
  pull(input: { connectionId: string; from: Date; to: Date; dimensions: ("query"|"page"|"country"|"device")[] }):
    Promise<Envelope<{ rows: DailyRow[]; complete: boolean }>>; // complete=false si la fuente no garantiza todas las filas
}
interface AnalyticsProvider {
  pull(input: { connectionId: string; from: Date; to: Date }):
    Promise<Envelope<{ rows: DailyRow[]; complete: boolean }>>;
}
```

### 5.4 Fallback etiquetado

- El fallback es una **decisión de configuración del plan**, no del adaptador. Si la superficie `chatgpt/ui_scraper` falla, la ejecución queda `partial`; **no** se invoca `chatgpt/api_with_search` en su lugar salvo que el plan lo tenga activado, y en ese caso sus observaciones se guardan con su propia condición y forman su propia serie.
- Un plan puede tener ambas series a la vez; el dashboard las muestra por separado y nunca las suma.
- El tope de gasto del fallback es independiente (`budget_reservations.scope = fallback`).

### 5.5 Añadir un adaptador sin tocar el dominio

1. Implementar la interfaz en `seo-providers/adapters/<provider>/` o `geo-monitoring/adapters/<provider>/`.
2. Registrar `(provider, operation, unit, cost_cents, valid_from)` en `provider_pricing`. Sin precio, el adaptador no puede despacharse (patrón `check:pricing` de LP, verificado).
3. Añadir el par `(surface, condition)` o `(provider, operation)` al catálogo tipado de configuración (enum en código; ambos informes descartan un catálogo administrable).
4. Pasar la suite de contrato del adaptador: devuelve sobre completo, errores tipados, citas con URL absoluta, `effective_country`.
5. Las series existentes no cambian: el nuevo adaptador abre series nuevas con su `provider` y `normalizer_version`.

## 6. Riesgos por proveedor y plan de salida

| Riesgo | Señal | Respuesta | Plan de salida |
|---|---|---|---|
| **LLM Scraper de DataForSEO roto o retirado** | Respuestas vacías repetidas, `ProviderUnavailableError`, cobertura operativa < 80 % | La serie `chatgpt/ui_scraper` queda **con hueco visible**; cobertura operativa baja; alerta al admin. **No se sustituye silenciosamente por API** | Activar `chatgpt/api_with_search` (OpenAI) como serie nueva etiquetada, con tope; buscar segundo proveedor de captura UI; comunicar al cliente el cambio de metodología |
| Cuestionamiento legal del scraping de interfaces | Comunicación del proveedor o cambio de ToS | Conservar evidencia preservada y etiquetado; revisar con asesor | Igual que arriba; la auditoría puede seguir con `google_aio/serp` |
| Falta de licencia escrita de DataForSEO para conservar/redistribuir | Respuesta negativa o silencio | No cobrar suscripciones hasta tenerla; limitar retención | SE Ranking (uso comercial permitido salvo competidores, UNVERIFIED) como plan B del runner; renegociar |
| Precio del LLM Scraper distinto al observado (página inconsistente según Claude) | Coste real en `usage_events` > 1,5× estimación | Ajustar `provider_pricing`; reevaluar repeticiones del plan | Reducir repeticiones o superficies del plan base |
| Dependencia de un solo proveedor SERP | Caída, cambio de precio | Circuit breaker; ejecución `partial` | **Segundo adaptador SERP (Serper) antes de P1**; las series siguen separadas por `provider` |
| Límite de peticiones DataForSEO (10.000 vs 2.000 req/min, discrepan las fuentes) | 429 | Diseñar muy por debajo: concurrencia por proveedor en el worker | Confirmar contrato de cuenta |
| Cuota de PageSpeed Insights insuficiente o cambio de términos | 429 / SIN DATO | Cachear por URL y día; limitar a 4 URLs por auditoría | Lighthouse local en el worker (más CPU, cero proveedor) |
| Verificación OAuth de Google rechazada o lenta (P1) | Rechazo o >5 días | Piloto en modo *Testing* (≤100 usuarios según Claude) | Mantener GSC como opcional; el producto funciona sin datos del propietario |
| Términos de Gemini Grounding / Bing grounding | — | No usar como fuente histórica (decidido) | Captura UI vía scraper para Gemini |
| Cambio de interfaz de ChatGPT que altere el formato de citas | Citas sin URL, `normalizer_version` incapaz de parsear | Bump de `normalizer_version`, marca de ruptura | — |

## 7. Checklist de verificación previa al P0

Cada punto pasa de UNVERIFIED a VERIFIED anotando fecha, fuente y valor en este documento.

**Cuentas y contratos**
- [ ] Cuenta DataForSEO con depósito mínimo (50 $ según Claude, UNVERIFIED); confirmar límite de peticiones efectivo de la cuenta.
- [ ] Solicitud escrita a DataForSEO: exhibición a clientes con marca propia, conservación 24 meses, redistribución en PDF. Respuesta archivada.
- [ ] Cuenta Stripe del producto en modo test; tarifa europea vigente verificada (1,5 % + 0,25 € vs 3 % + 0,30 $).
- [ ] Proveedor LLM elegido para prompts y recomendaciones; precio por millón de tokens anotado en `provider_pricing`.
- [ ] Cuenta Resend con remitente propio del producto.

**Pruebas técnicas (10 llamadas por operación, coste real medido en `usage_events`)**
- [ ] DataForSEO SERP top 20 con AI Overview para 10 keywords locales en España: ¿devuelve AIO cuando existe? ¿coste real por página? ¿latencia Standard?
- [ ] DataForSEO LLM Scraper ChatGPT para 10 prompts en castellano con `country=ES`: ¿devuelve texto y **citas con URL absoluta**? ¿`effective_country` respetado? ¿coste real?
- [ ] Medir estabilidad: 7 repeticiones del mismo prompt en 24 h en el dogfood; Jaccard de marcas y de fuentes (resuelve el desacuerdo D1 de `00-analysis-comparison.md`).
- [ ] PageSpeed Insights: cuota diaria y por minuto, necesidad de API key, términos de exhibición; latencia por URL.
- [ ] Fetcher propio: pruebas SSRF (IP privada, redirección a localhost, DNS rebinding, respuesta > `maxBytes`).
- [ ] Chromium headless en el VPS: 10 PDFs seguidos, RAM pico y tiempo (resuelve D2).
- [ ] RAM libre del VPS antes de desplegar el segundo stack (UNVERIFIED, ambos).

**Preparación para P1**
- [ ] Proyecto Google Cloud con OAuth en modo *Testing*, scopes `webmasters.readonly` y `analytics.readonly`; confirmar su clasificación (sensible o no) en Cloud Console (pendiente según Claude, Anexo B).
- [ ] Política de privacidad y homepage públicas del producto (requisito de verificación según Claude).
- [ ] Cuenta Perplexity API; prueba de 10 prompts con `search_results`.
