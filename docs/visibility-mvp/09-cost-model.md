# 09 — Modelo de costes: unidades y escenarios

**Versión:** 1 (2026-10-25). **Estado:** PROPUESTO, pendiente de revisión cruzada.

Vocabulario: `00-analysis-comparison.md` §7, `03-mvp-scope.md`, `08-provider-strategy.md`.

## 0. Cómo leer este documento

- Todo coste es una **fórmula sobre variables nombradas**. Los valores de referencia proceden de los dos informes previos y llevan la etiqueta **UNVERIFIED** (leídos por Claude o Codex el 2026-10-25, no reverificados en esta sesión). Donde ningún informe aporta dato, el valor es **HIPOTÉTICO** y se dice.
- Monedas: los proveedores se leyeron en USD y los precios de venta en EUR en el informe de Claude y en USD en el de Codex. **No se aplica conversión**; se asume 1 $ ≈ 1 € como simplificación declarada, igual que hizo Claude. El error que introduce es menor que la incertidumbre de los propios precios.
- Al cerrar el piloto, cada variable se sustituye por el valor medido en `usage_events` (§9) y este documento pasa a versión 2.

## 1. Variables

### 1.1 Costes unitarios de proveedor

| Variable | Significado | Valor de referencia | Etiqueta |
|---|---|---|---|
| `c_fetch` | Descarga y análisis de una página por el fetcher propio | 0 $ de proveedor (CPU propia) | Diseño |
| `c_psi` | Una medición de PageSpeed Insights (URL × estrategia) | 0 $ | SIN DATO en cuota; precio gratuito supuesto |
| `c_serp_page` | Una página de 10 resultados orgánicos, DataForSEO Standard | 0,0006 $ | UNVERIFIED (ambos) |
| `c_aio_extra` | Recargo por cargar AI Overview en una SERP (async) | 0,0020 $ | UNVERIFIED (Claude) |
| `c_aio_obs` | Una observación de Google AI Overview = `c_serp_page + c_aio_extra` | 0,0026 $ | Derivada |
| `c_llm_scraper_page` | Una captura de interfaz (ChatGPT o Gemini), DataForSEO LLM Scraper Standard | 0,0012 $ (live: 0,0040 $) | UNVERIFIED (ambos); Claude advierte página inconsistente |
| `c_pplx_obs` | Una ejecución Perplexity `sonar` + búsqueda (500 in / 700 out) | 0,0044 $ | UNVERIFIED (Claude) |
| `c_openai_obs` | Una ejecución gpt-5.4-mini + web_search | 0,018 $ | UNVERIFIED (Claude) |
| `c_llm_in` | Coste por millón de tokens de entrada del LLM de redacción | 0,50 $/M | **HIPOTÉTICO** (proveedor sin fijar) |
| `c_llm_out` | Coste por millón de tokens de salida | 2,00 $/M | **HIPOTÉTICO** |
| `c_pdf` | Generar un PDF con Chromium headless | 0 $ de proveedor; ~20–60 s de CPU de un worker | Diseño; medir |
| `c_email` | Un email transaccional por Resend | 0 $ dentro de la capa gratuita | UNVERIFIED (Claude: capa gratuita hasta ~50 clientes) |
| `r_reserve` | Reserva por reintentos e incidencias sobre el consumo de datos | 10 % | Supuesto de Codex, adoptado |

### 1.2 Volúmenes por unidad de producto

| Variable | P0 auditoría | P0 workspace/mes | P1 workspace/mes | Pro (hipotético) |
|---|---|---|---|---|
| `n_pages_audit` | 30 | — | — | — |
| `n_psi` | 4 URLs × 2 estrategias = 8 | — | — | — |
| `n_prompts` | 10 | 25 | 25 | 25 |
| `n_surfaces` | 2 (chatgpt, google_aio) | 2 | 4 (+gemini, +perplexity) | 4 |
| `n_reps` | 3 | 3 | 5 | 7 |
| `n_windows` (ventanas/mes) | 1 | 4,33 (semanal) | 4,33 | 30,4 (diaria) |
| `n_keywords` | 10 | 30 | 100 | 100 |
| `depth_pages` (páginas SERP por keyword) | 2 (top 20) | 2 | 10 (top 100) | 10 |
| `tok_in` / `tok_out` (LLM) | 20k / 8k | 10k / 4k (informe mensual) | 10k / 4k | 10k / 4k |

### 1.3 Costes de operación

| Variable | Significado | Referencia | Etiqueta |
|---|---|---|---|
| `h_support` | Horas de soporte directo por cliente y mes | 0,5 h | Supuesto de Codex |
| `h_audit_review` | Horas humanas por auditoría (revisión del PDF, entrega) | 0,5 h | **HIPOTÉTICO** |
| `r_hour` | Tarifa hora de soporte | 30 $ | Supuesto de Codex |
| `h_maint` | Mantenimiento técnico mensual | Codex: 8 h/mes (320 $ a 40 $/h). Claude: 1 / 2 / 4 / 6 jornadas/mes a 1 / 10 / 50 / 100 clientes, sin convertir a euros | Supuestos de ambos; discrepan |
| `r_maint` | Tarifa hora de mantenimiento | 40 $ | Supuesto de Codex |
| `fee_stripe_pct` / `fee_stripe_fixed` | Comisión por cobro | Codex: 3 % + 0,30 $. Claude: ≈ 1,5 % + 0,25 € (tarjeta europea) | UNVERIFIED, discrepan; se muestran ambos |
| `c_infra_shared` | VPS actual compartido con `lead-platform` | 0 $ incremental | Claude; **RAM libre UNVERIFIED (ambos)** |
| `c_infra_own` | Host propio | Claude: 20–40 €/mes desde ~10 clientes; 60–80 € a 100. Codex (web+worker+PG+archivos+backups): 55 $ a 10, 115 $ a 50, 175 $ a 100 | UNVERIFIED, se muestran como rango |
| `c_tools` | Sentry + Resend de pago | 0 hasta ~50 clientes; después ≈ 26 + 20 = 46 $/mes | UNVERIFIED (Claude) |

### 1.4 Precios de venta (solo hipótesis, no aprobados)

| Variable | Referencia | Etiqueta |
|---|---|---|
| `p_audit` | Ningún informe propone precio de auditoría puntual. Se usa **149** como valor de trabajo | **HIPOTÉTICO**; decisión del owner |
| `p_sub` | 79 $/mes (Codex); 79 €/mes base y 199 € Pro (Claude); agencia 49 €/workspace mín. 5 (Claude) o 299 $/mes hasta 5 empresas (Codex) | Hipótesis de ambos, no aprobadas |

## 2. Coste por auditoría (P0)

```
C_audit = r_reserve_factor × (
    n_pages_audit × c_fetch
  + n_psi × c_psi
  + n_keywords × depth_pages × c_serp_page
  + n_prompts × n_reps × (c_llm_scraper_page + c_aio_obs)
  + tok_in × c_llm_in + tok_out × c_llm_out
) + c_pdf + c_email
```

| Partida | Cálculo | $ |
|---|---|---:|
| Fetch de 30 páginas | 30 × 0 | 0,000 |
| PageSpeed Insights | 8 × 0 | 0,000 |
| SERP 10 keywords top 20 | 10 × 2 × 0,0006 | 0,012 |
| ChatGPT UI, 10 prompts × 3 reps | 30 × 0,0012 | 0,036 |
| Google AI Overview, 10 prompts × 3 reps | 30 × 0,0026 | 0,078 |
| LLM (prompts, keywords, recomendaciones) | 20k × 0,5/M + 8k × 2/M | 0,026 |
| Subtotal datos | | 0,152 |
| Reserva 10 % | | 0,015 |
| PDF + email | CPU propia + capa gratuita | 0,000 |
| **Coste de proveedor por auditoría** | | **≈ 0,17 $** |

El coste de proveedor es irrelevante frente al tiempo humano: con `h_audit_review = 0,5 h × 30 $` la auditoría cuesta **≈ 15,2 $** más la comisión de cobro (3,8–4,8 $ sobre 149 según la tarifa Stripe que resulte). Si la revisión humana se elimina (P1, entrega totalmente automática), el coste directo cae a la comisión de cobro.

## 3. Coste por workspace monitorizado y mes

```
C_ws = r_reserve_factor × (
    n_prompts × n_reps × n_windows × Σ_surfaces c_surface
  + n_keywords × depth_pages × n_windows × c_serp_page
  + tok_in × c_llm_in + tok_out × c_llm_out        (informe mensual)
)
```

| Partida | P0 (semanal, 2 superficies, 3 reps, 30 kw top 20) | P1 (semanal, 4 superficies, 5 reps, 100 kw top 100) | Pro (diaria, 4 superficies, 7 reps, 100 kw top 100) |
|---|---:|---:|---:|
| Observaciones por superficie/mes | 25 × 3 × 4,33 = 325 | 25 × 5 × 4,33 = 541 | 25 × 7 × 30,4 = 5.320 |
| ChatGPT UI | 325 × 0,0012 = 0,39 | 0,65 | 6,38 |
| Google AI Overview | 325 × 0,0026 = 0,84 | 1,41 | 13,83 |
| Gemini UI | — | 0,65 | 6,38 |
| Perplexity API | — | 2,38 | 23,41 |
| SERP keywords | 30 × 2 × 4,33 × 0,0006 = 0,16 | 100 × 10 × 4,33 × 0,0006 = 2,60 | 100 × 10 × 30,4 × 0,0006 = 18,24 |
| LLM informe mensual | 0,013 | 0,013 | 0,013 |
| Subtotal | 1,40 | 7,70 | 68,25 |
| **Con reserva 10 %** | **≈ 1,54 $** | **≈ 8,5 $** | **≈ 75 $** |

Comparación con los informes: Codex obtuvo 0,92 $ (2 superficies a 0,0012 $ cada una, 4 ventanas, 50 keywords top 10); Claude 6 $ (4 motores, 5 reps, depth 100, incluye clasificación LLM) y ~115 $ en Pro (incluye Claude Haiku con búsqueda). Las diferencias se explican íntegramente por los volúmenes de §1.2, no por precios distintos.

## 4. Coste por prompt, superficie y ejecución

| Superficie / vía | `capture_condition` | $ por ejecución | $ por prompt y mes en P0 (3 reps × 4,33) | Nivel |
|---|---|---:|---:|---|
| ChatGPT UI (DataForSEO LLM Scraper std) | ui_scraper | 0,0012 | 0,016 | P0 |
| Google AI Overview (DataForSEO SERP + async) | serp | 0,0026 | 0,034 | P0 |
| Gemini UI (LLM Scraper std) | ui_scraper | 0,0012 | 0,016 | P1 |
| Perplexity sonar + búsqueda | api_with_search | 0,0044 | 0,057 | P1 |
| ChatGPT vía OpenAI API gpt-5.4-mini + web_search | api_with_search | 0,018 | 0,234 | P1 fallback con tope |
| LLM Scraper en modo live | ui_scraper | 0,0040 | 0,052 | No usar en plan base |
| Claude Haiku + web search | api_with_search | 0,011 | 0,143 | P2 |

Todos UNVERIFIED (Claude, salvo scraper y SERP que coinciden con Codex).

## 5. Coste por generación de informe

| Partida | Valor |
|---|---|
| Lectura de `report_snapshots` y render HTML | CPU propia, despreciable |
| Redacción LLM de resumen y recomendaciones (P1; en P0 son reglas) | 10k in / 4k out ≈ 0,013 $ |
| PDF Chromium headless | 20–60 s de un worker; RAM pico **a medir** (riesgo D2 de `00`) |
| Email con enlace firmado | 0 $ en capa gratuita |
| **Total por informe** | **≈ 0,01–0,02 $ + CPU** |

A 100 informes mensuales el PDF ocupa 0,5–1,7 h de worker al mes: cabe en un proceso, pero debe ejecutarse en la cola `report` con concurrencia 1 para no competir con las observaciones.

## 6. Infraestructura mensual

| Partida | P0 (piloto) | ~10 clientes | ~50 clientes | ~100 clientes | Fuente |
|---|---:|---:|---:|---:|---|
| Cómputo + BD + archivos + backups | 0 $ incremental en el VPS compartido (**RAM UNVERIFIED**) | 25 € (Claude) – 55 $ (Codex) | 40 € – 115 $ | 80 € – 175 $ | UNVERIFIED, ambos |
| Sentry + Resend | 0 | 0 | 0 – 46 $ | 46 $ | UNVERIFIED (Claude) |
| Dominio, certificado (Caddy) | ≈ 1 $/mes prorrateado | idem | idem | idem | Supuesto |
| **Rango de infraestructura** | **≈ 1 $** | **26 – 56 $** | **41 – 162 $** | **127 – 222 $** | |

Compartir el VPS reduce el desembolso, no el consumo ni el riesgo operativo (Codex). Se mide la RAM antes de desplegar y se pasa a host propio cuando la telemetría lo pida, con un `pg_dump` y un compose: ninguna FK cruza las bases (Claude).

## 7. APIs y herramientas fijas

| Concepto | Coste fijo mensual | Nota |
|---|---:|---|
| DataForSEO | 0 (pago por uso; depósito inicial 50 $ según Claude, UNVERIFIED) | Sin cuota mensual mínima señalada por los informes |
| PageSpeed Insights, GSC, GA4 | 0 | Gratuitas con cuota |
| Perplexity API (P1) | 0 (pago por uso) | |
| LLM de redacción | 0 (pago por uso) | |
| Stripe | 0 fijo; comisión por cobro | |
| **Fijos de API en P0** | **0 $** | Todo el coste de datos es variable |

Una API con cuota fija dominaría el coste con pocos clientes (Codex, §9 sensibilidad); por eso todos los proveedores elegidos son de pago por uso.

## 8. Escenarios a 10, 50 y 100 clientes

Supuestos comunes: cada suscriptor en P0 (1,54 $ de datos); soporte `h_support = 0,5 h × 30 $ = 15 $`; cada auditoría 0,17 $ de datos + 0,5 h de revisión (15 $); Stripe mostrado como rango entre la tarifa de Claude y la de Codex; infraestructura como rango de §6; mantenimiento como dos lecturas (Codex 320 $ fijos; Claude 2/4/6 jornadas valoradas a 320 $/jornada para poder sumar). Precios de trabajo: `p_sub = 79`, `p_audit = 149` (hipotéticos).

### 8.1 Mezcla A — solo auditorías (N auditorías/mes, sin suscriptores)

| Partida | 10 aud./mes | 50 aud./mes | 100 aud./mes |
|---|---:|---:|---:|
| Datos | 1,7 | 8,5 | 17 |
| Revisión humana | 150 | 750 | 1.500 |
| Stripe | 25 – 48 | 124 – 239 | 248 – 477 |
| Infraestructura | 1 – 56 | 41 – 162 | 127 – 222 |
| **Coste directo** | **178 – 256** | **924 – 1.160** | **1.892 – 2.216** |
| Mantenimiento (Codex / Claude) | 320 / 640 | 320 / 1.280 | 320 / 1.920 |
| **Coste con mantenimiento** | **498 – 896** | **1.244 – 2.440** | **2.212 – 4.136** |
| Ingresos (149 × N) | 1.490 | 7.450 | 14.900 |
| Margen bruto por auditoría | ≈ 149 − 20 = **129 (≈ 87 %)** | | |

Sin revisión humana el margen por auditoría sube a ≈ 144. El riesgo de esta mezcla no es el coste sino la **demanda**: son ventas únicas que hay que renovar cada mes con captación.

### 8.2 Mezcla B — todos suscriptores semanales (N workspaces)

| Partida | 10 | 50 | 100 |
|---|---:|---:|---:|
| Datos | 15 | 77 | 154 |
| Soporte | 150 | 750 | 1.500 |
| Stripe | 14 – 27 | 72 – 134 | 144 – 267 |
| Infraestructura | 26 – 56 | 41 – 162 | 127 – 222 |
| **Coste directo** | **205 – 248** | **940 – 1.123** | **1.925 – 2.143** |
| Mantenimiento | 320 / 640 | 320 / 1.280 | 320 / 1.920 |
| **Coste con mantenimiento** | **525 – 888** | **1.260 – 2.403** | **2.245 – 4.063** |
| Ingresos (79 × N) | 790 | 3.950 | 7.900 |
| Resultado tras mantenimiento | −98 a +265 | 1.547 a 2.690 | 3.837 a 5.655 |
| Coste completo por suscriptor | 53 – 89 | 25 – 48 | 22 – 41 |
| Margen bruto por suscriptor (sobre coste directo) | ≈ 79 − 20,5 = **58,5 (≈ 74 %)** | | |

El soporte es el 70–80 % del coste directo en todos los tamaños; el dato es el 7 %. Coincide con la conclusión de ambos informes.

### 8.3 Mezcla C — realista: N suscriptores + 0,8·N auditorías/mes

| Partida | 10 sub + 8 aud | 50 sub + 40 aud | 100 sub + 80 aud |
|---|---:|---:|---:|
| Datos | 17 | 84 | 168 |
| Soporte + revisión | 270 | 1.350 | 2.700 |
| Stripe | 34 – 65 | 171 – 325 | 342 – 649 |
| Infraestructura | 26 – 56 | 41 – 162 | 127 – 222 |
| **Coste directo** | **347 – 408** | **1.646 – 1.921** | **3.337 – 3.739** |
| Mantenimiento | 320 / 640 | 320 / 1.280 | 320 / 1.920 |
| **Coste con mantenimiento** | **667 – 1.048** | **1.966 – 3.201** | **3.657 – 5.659** |
| Ingresos (79·N + 149·0,8·N) | 1.982 | 9.910 | 19.820 |
| Resultado tras mantenimiento | 934 – 1.315 | 6.709 – 7.944 | 14.161 – 16.163 |

### 8.4 Punto de equilibrio operativo

Con `p_sub = 79`, coste directo marginal ≈ 20,5 $/suscriptor (datos 1,54 + soporte 15 + Stripe ≈ 2–3 + infra marginal ≈ 1) y fijos ≈ 345 $ (mantenimiento Codex 320 + host 25):

```
N_equilibrio = 345 / (79 − 20,5) ≈ 5,9  →  6 suscriptores
```

Codex estimó ~7 con sus supuestos. Con el mantenimiento de Claude a 10 clientes (2 jornadas ≈ 640 $) el punto sube a ≈ 12. En la mezcla A bastan **3 auditorías al mes** para cubrir 345 $ de fijos.

**Advertencia de Codex, adoptada literalmente:** el resultado tras mantenimiento **no es beneficio neto**. No incluye adquisición comercial, impuestos, impagos, desarrollo inicial (32–44 jornadas del P0 según `10-implementation-backlog.md`) ni producción de contenido SEO. Indica viabilidad operativa potencial, no demanda ni rentabilidad demostrada. El caso peligroso no es pagar un dólar más por datos: es invertir meses en un dashboard que el cliente consulta una vez y no renueva.

## 9. Sensibilidad

| Cambio | Variable | Efecto sobre el coste de datos del workspace | Efecto sobre el coste completo por suscriptor (P0 ≈ 20,5 $) |
|---|---|---|---|
| Semanal → diaria | `n_windows` 4,33 → 30,4 | ×7,0 (Codex: ×7,5 con 4 ventanas) | 1,54 → 10,8 $; +9 $ |
| Repeticiones 3 → 5 | `n_reps` | ×1,67 | +1 $ |
| Repeticiones 3 → 7 | `n_reps` | ×2,33 | +2 $ |
| Superficies 2 → 4 (gemini + perplexity) | `n_surfaces` | ×2,5 (Perplexity pesa el 47 % del total) | +2,3 $ |
| Keywords 30 → 100 | `n_keywords` | SERP ×3,3 | +0,4 $ |
| Top 20 → top 100 | `depth_pages` 2 → 10 | SERP ×5 | +0,7 $ |
| ChatGPT scraper → OpenAI API | `c_llm_scraper_page` → `c_openai_obs` | ×15 en esa superficie (Claude) | +5,5 $ en P0 |
| LLM Scraper std → live | 0,0012 → 0,0040 | ×3,3 en esa superficie | +1 $ |
| Precio real del scraper 2× el observado | `c_llm_scraper_page` | +0,4 $ | +0,4 $ |
| Soporte 0,5 h → 2 h | `h_support` | — | **+45 $** (Codex); el margen bruto cae del 74 % al 17 % |
| Revisión humana de auditoría 0,5 h → 0 | `h_audit_review` | — | margen por auditoría 129 → 144 |
| Sin host propio (seguir en el VPS) | `c_infra_own` → 0 | — | −2,5 $ a 10 clientes |
| Stripe 3 % + 0,30 vs 1,5 % + 0,25 | fee | — | 2,67 vs 1,44 $ por cobro de 79 |

Lecturas: (1) **cadencia y repeticiones** son la variable de coste de datos, como dijeron ambos; (2) **el soporte** es la variable del coste completo; una hora más por cliente borra el margen; (3) los límites del plan deben ser exactamente estas variables (prompts, superficies, repeticiones, cadencia, keywords, profundidad, páginas de auditoría): «prompts ilimitados sería una mala oferta» (Codex).

## 10. Qué medir en el piloto para sustituir cada variable por un dato

| Variable | Cómo se mide | Dónde queda registrado | Umbral que obliga a revisar el modelo |
|---|---|---|---|
| `c_serp_page`, `c_aio_obs`, `c_llm_scraper_page` | Coste real notificado por DataForSEO por tarea, 10 llamadas de prueba y después toda la operación | `usage_events.cost_cents` por `(provider, operation)` | > 1,5 × valor de referencia |
| `c_llm_in`, `c_llm_out` | Tokens reales por auditoría e informe | `usage_events` con `purpose = prompt_generation | recommendations` | > 50k tokens por auditoría |
| `c_psi` y su cuota | Respuestas 429 y cabeceras de cuota | `usage_events.status`, alerta | Cualquier 429 en el piloto |
| `n_reps` necesario | Jaccard de marcas y fuentes con 7 repeticiones en el dogfood durante 4 semanas | Tabla de análisis del piloto | Intervalo de presencia > ±20 puntos con 3 reps → plan base a 5 |
| `h_support`, `h_audit_review` | Registro manual de tiempo por cliente y por auditoría | Hoja del owner; después `service_requests` | > 1 h/cliente/mes |
| `c_pdf` (RAM, tiempo) | 10 PDFs seguidos en el VPS | Métrica operativa del worker | > 1 GB de pico o > 60 s |
| `c_infra_shared` (RAM libre del VPS) | Medición antes y después del despliegue | Nota en `11-risks-and-open-decisions.md` | < 1,5 GB libres con ambos stacks |
| `fee_stripe_*` | Comisión real en el primer cobro | Panel Stripe | — |
| Coste por auditoría y por workspace/mes | Suma de `usage_events` por `workspace_id` y mes | Vista admin SaaS | > 1,5 × estimación (criterio de éxito 6 de `03-mvp-scope.md`) |
| Ratio auditoría → suscripción, auditoría → `service_request` | Conteo | `entitlements`, `service_requests` | Es el dato que decide si se construye P1 |
