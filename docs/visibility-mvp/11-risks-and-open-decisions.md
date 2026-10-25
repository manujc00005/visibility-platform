# 11 — Riesgos y decisiones sin resolver

**Versión:** 1 (2026-10-25). **Estado:** PROPUESTO, pendiente de revisión cruzada.

Fusiona los registros de riesgo de ambos informes (Claude §9.1, Codex §11) y añade los que introduce el alcance del encargo (auditoría de pago, PDF, captación). Las etiquetas VERIFIED / INFERRED / UNVERIFIED siguen la convención de `00-analysis-comparison.md` §2.

## 1. Riesgos técnicos

Escala: probabilidad y impacto en Bajo / Medio / Alto / Cierto. «Dueño» = quién decide la respuesta, no quien la ejecuta.

| ID | Riesgo | Prob. | Impacto | Señal temprana | Mitigación | Dueño | Origen |
|---|---|---|---|---|---|---|---|
| R-01 | **Métrica IA ruidosa leída como ranking.** El cliente interpreta una tasa de aparición del 33 % → 27 % como «caída» cuando es ruido de muestra | Alta | Alto | Preguntas de soporte del tipo «¿por qué he bajado?» en la primera semana | Mostrar siempre nº de muestras y superficie; intervalos cuando n ≥ 9; ventanas móviles de 4 semanas en Evolución; texto fijo de «limitaciones de la medición» en informe; experimento D1 para fijar repeticiones | Owner (producto) | Ambos |
| R-02 | **Scraper de interfaz (DataForSEO LLM Scraper) roto, retirado o cuestionado legalmente** | Media | Medio | Cobertura operativa < 80 % en un run; cambios en la documentación del proveedor | Interfaz `AnswerObservationProvider`; adaptador API (Perplexity P1, OpenAI como fallback etiquetado `api_with_search`); series separadas por `capture_condition`, nunca unidas | Owner | Ambos |
| R-03 | **Términos de Gemini Grounding y Bing grounding prohíben almacenar o analizar** las respuestas (UNVERIFIED: leídos por Claude el 2026-10-25) | Cierta si se ignora | Alto | — | No usarlos como fuente histórica (ADR-008); Gemini solo vía UI scraper (P1) | Arquitectura | Claude |
| R-04 | **Reventa de datos de terceros sin licencia.** DataForSEO anuncia uso en productos de terceros pero no hay confirmación escrita sobre conservación 24 meses y redistribución en PDF con marca propia (UNVERIFIED, ambos) | Media | Alto | Respuesta ambigua del proveedor; cláusula de caché en sus términos | Condición previa al cobro de suscripciones (D-05); Semrush y Ahrefs excluidos; si DataForSEO no confirma, Serper/Value SERP para SERP y reconsiderar superficies IA | Owner | Ambos |
| R-05 | **Verificación OAuth de Google lenta o rechazada** (scopes sensibles, 3–5 días hábiles según Claude, UNVERIFIED) | Media | Medio (solo P1) | Petición de vídeo demo o rechazo por política de privacidad | GSC es P1, no bloquea el piloto; preparar homepage, política de privacidad y vídeo antes de pedirla; modo Testing con ≤ 100 usuarios como plan B | Owner | Ambos |
| R-06 | **Un VPS para dos productos, sin CI, sin staging, releases manuales** (CI desactivado: UNVERIFIED, Claude; RAM libre: UNVERIFIED, ambos) | Alta | Medio | Swap > 0 tras desplegar; OOM del worker de `lead-platform` | Medir RAM antes y después (HU-45); stack y BD separados; `deploy.sh` propio con rollback; umbral de migración a host propio: RAM libre < 1,5 GB o cola > 2 h sostenida | Owner (host, D-06) | Ambos |
| R-07 | **Divergencia de los módulos copiados** de `lead-platform` (jobs, crypto, RLS, email) | Cierta | Bajo | Un bug corregido en un repo y no en el otro | Aceptada (ADR-004); `COPIED_FROM.md` con SHA; revisión trimestral del diff; no extraer paquetes hasta un tercer consumidor | Arquitectura | Claude |
| R-08 | **Coste disparado por cadencia, repeticiones o reintentos mal acotados** | Media | Medio | `usage_events` del día > 2× la media; reservas agotadas antes de fin de mes | Reserva antes de gastar (HU-08); coste contabilizado también en fallos; `max_attempts = 3` en observaciones; límites del plan = variables de coste; alerta de coste diario (HU-46) | Arquitectura | Ambos |
| R-09 | **Cambio de prompts rompe la serie y el cliente no lo entiende** | Alta | Medio | Edición de prompts aprobados tras la primera ejecución | Versionado con cohorte nueva (HU-19); marca de ruptura en gráficas (HU-38); aviso en la UI al editar: «esto reinicia la comparación» | Producto | Ambos |
| R-10 | **Dependencia de un solo proveedor de SERP** | Media | Bajo | Incidencias de DataForSEO; subida de precio | `SerpProvider` con segundo adaptador (Serper) en P1 (HU-16) | Arquitectura | Claude |
| R-11 | **Idempotencia imposible con proveedores sin reconciliación.** Un timeout tras crear la tarea externa puede cobrar dos veces | Media | Bajo | Discrepancia entre `usage_events` y factura del proveedor | Guardar `provider_task_id` antes de confirmar; estado `reconcile` (HU-07); conciliación mensual manual en admin | Arquitectura | Codex |
| R-12 | **Chromium headless en el VPS compartido.** Memoria pico de Playwright al generar PDF compite con los dos workers | Media | Medio | RAM pico > 1 GB o p95 > 60 s en la prueba de carga de HU-29 | Cola `report` con `max_in_flight = 1`; prueba de carga antes de H2; alternativa: servicio externo HTML→PDF (el HTML no contiene datos personales, solo del dominio) | Arquitectura | Nuevo |
| R-13 | **SSRF y abuso del fetcher de auditoría.** El usuario introduce la URL que el servidor descarga | Media | Alto | Peticiones a rangos privados en logs; auditorías a dominios internos | HU-09: resolución DNS previa, bloqueo de privados/loopback/link-local/metadata, comprobación por salto de redirección, límites de tamaño y tiempo; `robots.txt` respetado | Arquitectura | Codex + encargo |
| R-14 | **Auditorías no pagadas que consumen coste.** Formulario público expuesto a bots | Alta si el flujo lo permite | Medio | `audits` sin `payments` asociados | **El Checkout va antes de ejecutar** (HU-32): ningún `audit.run` sin pago; la auditoría gratuita reducida (P1) lleva rate limit por IP y dominio y no llama a proveedores de pago | Arquitectura | Nuevo |
| R-15 | **PageSpeed Insights: cuota y términos UNVERIFIED.** Si la cuota es menor de la supuesta o prohíbe uso comercial, falla la sección de rendimiento | Media | Medio | 429 recurrentes; lectura de términos | Verificar cuota y términos antes de S5 (D-07); fallback: Lighthouse local en el worker (más RAM, mismo riesgo que R-12) | Arquitectura | Nuevo |
| R-16 | **Falsos positivos en detección de marca por alias cortos o genéricos** («Sol», «Luz», «Centro») | Alta | Medio | Presencia de marca > 80 % en prompts `discovery` sin citas propias | Alias < 4 caracteres exigen palabra completa; aviso al configurar; dataset etiquetado con precisión ≥ 0,95 (HU-21); revisión manual de casos ambiguos en admin (P1) | Producto | Codex + nuevo |
| R-17 | **Capacidad del LLM Scraper para ChatGPT y Google AIO en España/castellano** (país, idioma) no confirmada (UNVERIFIED) | Media | Alto | Observaciones con `country` distinto del pedido o respuestas en inglés | Prueba de 20 prompts reales antes de S3; si el país no se respeta, mostrar «país: desconocido» (criterio Codex) y reconsiderar superficie | Arquitectura | Ambos |
| R-18 | **Dependencia de una sola persona** para desarrollo, operación y soporte | Cierta | Alto | Cola de soporte > 48 h; releases aplazadas | Alcance P0 mínimo; runbooks en `docs/`; alertas automáticas (HU-46); vacaciones = modo solo monitorización | Owner | Ambos (implícito) |

## 2. Riesgos comerciales

| ID | Riesgo | Prob. | Impacto | Señal temprana | Mitigación | Dueño | Origen |
|---|---|---|---|---|---|---|---|
| R-20 | **Foco.** El NORTE del workspace está en mantenimiento (VERIFIED) y el roadmap del CRM tiene seis iniciativas delante (Claude, no reverificado) | Alta | Alto | Dos WIP abiertos a la vez | Decisión explícita D-01; si se abre, WIP = 1 y el CRM en mantenimiento durante el piloto | Owner | Claude |
| R-21 | **Expectativa de que la auditoría «arregla» algo.** El cliente paga y espera que su web mejore | Alta | Medio | Reclamaciones tras recibir el PDF | Copy del checkout: «diagnóstico, no intervención»; sección de acciones recomendadas con «quién lo hace» (tú / tu desarrollador / nosotros); `service_requests` como salida natural | Owner | Nuevo |
| R-22 | **Un gráfico que no sube provoca bajas** si no se vende el servicio que lo mueve (idea del propio owner en `BACKLOG.md:1278`, VERIFIED) | Alta | Alto | Churn al tercer mes sin `service_requests` | Medición + servicio como oferta conjunta (D-09); informe mensual que priorice una acción | Owner | Ambos |
| R-23 | **Precio no validado.** Hipótesis de ambos informes (79 $/€ mensual) sin comprador real; la auditoría puntual no tiene ancla en ningún informe | Alta | Medio | Tres «no» consecutivos al precio | Vender tres auditorías a precio real antes de invertir en suscripción (D1 de `00` §6, resolución D5); precio como variable en `09-cost-model.md` | Owner | Ambos |
| R-24 | **Prometer atribución visibilidad → venta** | Media | Alto | Copy comercial con «más clientes» | Nunca como capacidad existente (ambos informes); conector de leads P2 como correlación, no causalidad | Owner | Ambos |
| R-25 | **Obligaciones fiscales de facturación en España** (factura con serie, IVA, Verifactu según calendario legal: UNVERIFIED) | Media | Medio | Primer cliente que pide factura completa | Stripe Invoicing como recibo en P0; validar con asesor antes de P1; registrar en `03` E P2 | Owner | Nuevo |
| R-26 | **Marca y dominio sin decidir** bloquean la verificación de Google (P1) y la landing pública | Alta | Medio | — | D-02 antes de S6 | Owner | Claude |

## 3. Decisiones pendientes del owner

Solo el owner puede tomarlas. Cada una lleva: qué decidir, opciones, recomendación provisional, qué evidencia la cerraría y si bloquea P0.

| # | Decisión | Opciones | Recomendación provisional | Evidencia que la cerraría | ¿Bloquea P0? |
|---|---|---|---|---|---|
| D-01 | **Levantar el NORTE de mantenimiento** del workspace para abrir este producto | a) Abrir ahora con WIP = 1; b) Abrir tras las iniciativas A y C del CRM; c) No abrir | a) solo si se acepta que el CRM queda en mantenimiento durante el piloto | Reescritura manual y fechada de `NORTE.md` por el owner | **Sí**: nada empieza sin ella |
| D-02 | **Nombre comercial, dominio y marca** (¿Olessium o marca propia?) | a) Submarca de Olessium; b) Marca propia | Sin recomendación técnica; afecta a verificación Google, remitente de email y white-label | Decisión del owner; registro de dominio | Sí para S6 (informe con marca) y H2 (checkout público) |
| D-03 | **Precio de la auditoría y de la suscripción** | Auditoría: 49 / 99 / 149 €; suscripción: 49 / 79 / 99 €/mes | Probar auditoría a 99 € y suscripción a 79 €/mes (ancla de ambos informes, UNVERIFIED frente a compradores) | Tres ventas o tres rechazos a precio real | Sí para H2 (hay que fijar el precio del Checkout) |
| D-04 | **Superficies P0 y repeticiones** | Superficies: {chatgpt, google_aio} / {chatgpt, gemini} / 4 motores; repeticiones: 3 / 5 / 7 | `chatgpt + google_aio`, 3 repeticiones (resolución D1 de `00` §6) | Experimento de estabilidad: 7 repeticiones en el dogfood durante 4 semanas; si el intervalo con 3 muestras supera ±20 puntos, subir a 5 | Sí para S3 (línea base) |
| D-05 | **Licencia escrita de DataForSEO** para conservar 24 meses y redistribuir en informes con marca propia | a) Confirmación escrita; b) Sin confirmación, limitar a SERP y buscar otro proveedor IA | Pedir confirmación antes de S3 | Email o contrato del proveedor | No para H1/H2 (auditoría puntual); **sí para cobrar suscripciones** |
| D-06 | **Host**: mismo VPS o host propio desde el día 1 | a) Mismo VPS con stack y BD separados; b) VPS propio (20–40 €/mes según Claude, UNVERIFIED) | a) si la medición de RAM deja ≥ 1,5 GB libres tras desplegar | Medición de RAM (HU-45) | Sí para S3 |
| D-07 | **Cuentas y presupuesto**: DataForSEO (depósito mínimo 50 $ según ambos, UNVERIFIED), Stripe del producto, Google Cloud (PSI y, en P1, OAuth), clave LLM para generación de prompts; verificación de cuota y términos de PSI | — | Abrir las cuatro antes de S3; verificar PSI antes de S5 | Cuentas abiertas; términos de PSI leídos y archivados en `docs/` | Sí |
| D-08 | **Propiedad y transferencia de workspaces** entre organizaciones (cuando una empresa cambia de agencia: quién conserva el histórico, quién autoriza conexiones). Codex la señala como la decisión más difícil de revertir | a) El histórico pertenece al workspace y se transfiere íntegro; b) Pertenece a la organización y la empresa empieza de cero; c) Copia al transferir | a) El modelo (`workspaces` con PK propia) lo permite sin coste; el procedimiento es P2 | Primer caso real de cambio de agencia | No (modelo preparado; procedimiento P2) |
| D-09 | **Vender solo medición o medición + servicio** | a) Solo SaaS; b) SaaS + servicios profesionales; c) Servicio con herramienta interna | b) es lo que el encargo describe (modelos A, B, C) | Ratio `service_requests` / informes en el piloto | No técnicamente; sí para el copy del informe |
| D-10 | **Registrar la decisión en el workspace**: nueva entrada en `SHARED_DECISIONS.md` (segundo producto con repo propio; D011/D015 hablan de un único producto desplegable, VERIFIED existencia de D011/D015), ficha en `docs/projects/`, entrada en `workspace.json`; **mover el informe de Claude a `main`** (hoy solo en la rama `docs/architecture-review-visibility-platform`, VERIFIED) | — | Hacerlo antes de la revisión de Codex para que ambos informes sean visibles en la misma rama | Merge de la rama; entrada D0xx firmada | No para P0; **sí para la revisión cruzada** |
| D-11 | **Alcance real del P0** ante la estimación de 57–80 j (`10-implementation-backlog.md` §4) frente al objetivo de 32–44 j | i) Piloto de auditoría primero (P0a) y monitorización después (P0b); ii) Reducir la auditoría a 10 páginas y 10 reglas; iii) Aceptar 57–80 j | i) | Tres auditorías vendidas antes de construir P0b | Sí: define qué se construye primero |
| D-12 | **Tope de presupuesto por workspace** en el plan base y en la auditoría (céntimos/mes y céntimos/auditoría) | Derivado de `09-cost-model.md` × factor 1,5 | Fijar al abrir las cuentas (D-07) | Primer mes de `usage_events` reales | Sí para HU-08 |

## 4. Supuestos declarados

Lo que este diseño asume sin haberlo verificado en esta sesión. Si alguno falla, hay que revisar el documento indicado.

| # | Supuesto | Fuente | Afecta a |
|---|---|---|---|
| S-01 | DataForSEO ofrece SERP Google con bloque AI Overview y LLM Scraper de ChatGPT con selección de país e idioma, a precios del orden de 0,0006 $/página SERP y 0,0012 $/página scraper | Ambos informes, lectura 2026-10-25, UNVERIFIED | `08`, `09`, HU-14, HU-18 |
| S-02 | DataForSEO permite conservar y redistribuir resultados en informes de terceros | Ambos, UNVERIFIED | D-05, `08` |
| S-03 | PageSpeed Insights API es gratuita con cuota suficiente para ~8 muestras por auditoría y permite uso en un servicio comercial | Ningún informe lo trató; UNVERIFIED | HU-15, R-15 |
| S-04 | Chromium headless cabe en la RAM del VPS junto a los dos stacks | UNVERIFIED | HU-29, R-12 |
| S-05 | El VPS tiene RAM libre para un segundo stack | Ambos lo marcan UNKNOWN | HU-45, D-06 |
| S-06 | Los módulos `jobs`, `secrets/crypto`, `with-tenant`, `email` de `lead-platform@983dfb6` se pueden copiar sin arrastrar dependencias del CRM | Verificado parcialmente (existen y la auth del CRM importa de consola según Claude, INFERRED para el resto) | HU-02 |
| S-07 | Stripe Checkout en modo pago único y webhooks firmados cubren el cobro del piloto en España | Conocimiento general; tarifas UNVERIFIED | HU-32, `09` |
| S-08 | Un LLM genérico genera 40 prompts comerciales razonables en castellano a partir de sector + ciudad + servicios | INFERRED | HU-19 |
| S-09 | La detección determinista de marca alcanza precisión ≥ 0,95 sin LLM en el dominio de pymes locales | INFERRED; se mide en HU-21 | HU-21, R-16 |
| S-10 | Un desarrollador senior asistido por agentes rinde las jornadas estimadas con el stack conocido | Supuesto de ambos informes | `10` |
| S-11 | Los términos de Gemini Grounding y Bing grounding siguen prohibiendo almacenar resultados | Claude, lectura 2026-10-25 de términos fechados 2026-04-28, UNVERIFIED | ADR-008 |
| S-12 | El scope `webmasters.readonly` requiere verificación de Google para pasar de Testing a producción | Ambos, UNVERIFIED en Cloud Console | HU-47 (P1) |
| S-13 | CI de GitHub está desactivado en el workspace y las pruebas se ejecutan a mano | Claude, UNVERIFIED en esta sesión | `10` (sin CI automatizada) |

## 5. Preguntas para Codex (revisión cruzada)

Respuestas esperadas en `13-codex-review.md`.

1. **Tenancy.** Tu informe proponía tres niveles (`organizations → clients → projects`). `00` §6 D7 funde cliente y proyecto en `workspaces`. ¿Ves un caso del piloto o del SaaS inicial en que dos niveles sean insuficientes, o aceptas diferirlo a P2?
2. **Superficies y repeticiones.** Propusiste «dos superficies» sin nombrarlas. ¿Estás de acuerdo con `chatgpt` (UI) + `google_aio` (SERP) para pymes locales en España, o preferirías `chatgpt` + `gemini` como documenta DataForSEO? ¿Aceptas el experimento de estabilidad de D-04 como criterio para subir a 5 repeticiones?
3. **Snapshots.** Rechazaste una «tabla genérica de snapshots». `report_snapshots` congela solo lo que cada informe muestra. ¿Lo consideras compatible con tu objeción?
4. **Reserva de presupuesto.** HU-08 implementa reserva en la misma transacción que encola, coste real al completar, liberación de la diferencia y estado `reconcile`. ¿Falta algún caso de tu análisis (`budget.ts:7`)?
5. **Auditoría acotada.** Tu informe excluía el «crawler SEO exhaustivo». ¿Consideras que 30 páginas, ~20 reglas, PSI y una muestra IA única respetan ese veto, o ves sobreingeniería?
6. **Primer paso comercial.** Proponías un piloto asistido con herramienta comprada (Otterly). `00` §6 D5 lo sustituye por la auditoría de pago con producto propio. ¿Mantienes tu recomendación? ¿Qué evidencia te haría cambiar?
7. **Estimación.** `10` §4 suma 57–80 j frente a tu 30–45 j para el MVP propio. ¿Atribuyes la diferencia al Módulo A y al PDF, o ves inflación en alguna épica concreta?
8. **Licencia.** ¿Qué texto exacto pedirías a DataForSEO para que D-05 quede cerrada?
9. **Reutilización.** ADR-004 copia `jobs`, `crypto`, `with-tenant`, `email` y reescribe auth y presupuesto. ¿Añadirías o quitarías algo de la lista?
10. **Lo que falta.** ¿Qué riesgo, decisión o requisito de tu informe no aparece en `00`–`12`?
