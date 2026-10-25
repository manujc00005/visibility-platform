# 13 — Revisión técnica independiente del MVP

**Veredicto: REQUEST CHANGES.** La dirección arquitectónica es viable, pero la versión 1 no es todavía un contrato implementable y seguro. Hay contradicciones en el alta, el cobro, los derechos de uso y las métricas, y faltan garantías de recuperación de jobs y entrega. No hace falta cambiar de stack ni introducir microservicios para resolverlas.

## 1. Alcance, evidencia y conclusión

| Campo | Valor |
|---|---|
| Revisor | Codex, revisión independiente como Staff Software Engineer |
| Fecha | 2026-10-25 |
| Visibility revisado | `0cef296a19214ff78d1d9cb69cd080f188fdcc55` |
| Workspace de referencia | `/Users/manu/Proyectos/lead-platform-workspace`, HEAD `f39c5958e1af6595f1d90af2e777dab844122aa6` |
| Código contrastado | `lead-platform@983dfb60e347922f20d21434d119cef12d98c080`, mismo commit de los informes originales; no se equipara a producción |
| Documentación | Lectura de todos los archivos de `docs/visibility-mvp/`, incluido el formulario original de esta revisión |
| Original Claude | `git show bf363c8:docs/audits/2026-10-25-architecture-review-visibility-platform.md`, 983 líneas; leído sin cambiar de rama |
| Original Codex | `lead-platform-workspace/docs/audits/2026-10-25-architecture-review-visibility-platform-codex.md`, 675 líneas |
| Límites | No se ejecutaron consultas de pago, ni se accedió al VPS, cuentas privadas o contratos. No se implementó código. Solo se modifica este entregable |

**VERIFIED** significa comprobado contra documentación/código local o fuente oficial consultada en esta revisión. Una API documentada no equivale a una integración operativa verificada. **INFERRED** identifica una consecuencia razonada. **UNVERIFIED** identifica capacidad efectiva, permiso o coste que exige prueba o confirmación adicional. Las referencias `archivo:línea` de `00`–`12` corresponden a la versión revisada; las de código parten de `lead-platform/`, salvo indicación.

| Objetivo | Evaluación |
|---|---|
| Viabilidad técnica | Sí, con correcciones de contratos, persistencia y ejecución. PostgreSQL y un monolito bastan |
| Comercialización a pymes | Hipótesis plausible para diagnóstico; renovación del seguimiento sin servicios todavía no validada |
| Independencia de lead-platform | Bien diseñada a nivel lógico. Compartir VPS, Caddy y PostgreSQL comparte radio de fallo |
| Simplicidad de desarrollo | Insuficiente: 30 historias P0 y 57–80,5 jornadas para validar la primera venta |
| Sostenibilidad económica | Datos potencialmente baratos; presupuesto de construcción, adquisición, soporte y renovación dominan |
| Seguridad multicliente | Parcial: RLS protege el contexto elegido, pero no demuestra que el actor tenga derecho a elegirlo |
| Mantenimiento y evolución | Buenas bases; faltan configuración histórica completa, borrado operativo y recuperación duradera |

Se identifican **8 BLOCKERS, 13 MAJOR y 3 MINOR**. Los BLOCKERS impiden implementar con fidelidad y seguridad el contrato actual; los gates comerciales se señalan aparte. No son fallos observados de un producto ejecutable: este repositorio aún no contiene aplicación.

## 2. BLOCKERS

### B01 — El checkout anónimo no tiene una orden persistida ni una asignación segura de identidad

**Etiqueta: FALTA / OBJETO. Prioridad: P0, antes de implementar HU-32.**

- **Referencia:** `06-api-contracts.md:60–109` (B.1/B.2), `05-data-model.md:23–27,147`, `07-user-flows.md:26–33`, HU-04/HU-32.
- **Problema:** B.1 crea `payments(pending)` antes de crear organización, pero el modelo exige `organization_id`. Promete guardar el formulario en `metadata`, columna ausente. B.2 intenta elegir una organización por email aunque el usuario puede pertenecer a varias. El email lo introduce un visitante: pagar no autentica al titular de ese buzón ni autoriza modificar su organización. Faltan los tokens persistidos para primer acceso/reset y la regla de nulabilidad de contraseña.
- **Impacto:** el alta no se puede implementar literalmente; se pierden datos del formulario o se imputan compras y workspaces a una organización ajena. Es posible provocar efectos sobre cuentas existentes sin autorización; no afirmo que el texto por sí solo conceda su sesión al atacante.
- **Solución y prueba de cierre:** persistir una orden con UUID, configuración validada, precio/moneda fijados por servidor, consentimiento versionado y estado, sin organización obligatoria hasta reclamarla. Checkout referencia ese UUID, con idempotencia de creación. Una compra anónima queda pendiente de vinculación mediante verificación del buzón; una cuenta existente autentica y selecciona explícitamente organización autorizada. Nunca restablecer su contraseña ni cambiar sus membresías desde el webhook. Persistir tokens de primer acceso/reset hasheados, caducables y de un uso. Probar email existente en dos organizaciones, email de tercero, dos webhooks concurrentes, timeout al crear Checkout y reclamación repetida. Coste: una entidad de orden evita varias asociaciones implícitas inseguras.

### B02 — `checkout.session.completed` no demuestra por sí solo que el dinero esté pagado

**Etiqueta: OBJETO. Prioridad: P0, antes de activar el fulfillment.**

- **Referencia:** `06-api-contracts.md:95–108`, `10-implementation-backlog.md:354–365`, RF-A02/RF-E01, ADR-012.
- **Problema:** se transforma toda sesión completada en `paid`; se contempla fallo asíncrono, pero no `checkout.session.async_payment_succeeded`. La firma prueba procedencia, no liquidación. No se fija validación de producto, importe, moneda y entorno frente a la orden. La deduplicación por evento tampoco sustituye a la deduplicación por compra.
- **Impacto:** ejecución antes del pago, o compras válidas sin entrega; un evento de otro producto de la misma cuenta mercantil podría activar derechos si solo se comprueba el tipo.
- **Solución y prueba de cierre:** una función de fulfillment idempotente por orden/sesión, llamada por los eventos pertinentes, consulta el estado y concede la compra pagada tras verificar `mode`, `payment_status`, `livemode`, producto e importe/moneda esperados. Estados monotónicos ante eventos duplicados/desordenados y reembolsos parciales. Transacción de pago, consumo/concesión y jobs; email fuera de la transacción mediante cola duradera. Probar `unpaid`, pago diferido posterior, evento duplicado distinto para la misma compra y evento firmado de otro producto. [Stripe: fulfillment](https://docs.stripe.com/checkout/fulfillment?ui=full-page), leído mediante `stripe docs` el 2026-10-25; comportamiento documentado VERIFIED.

### B03 — El derecho a una auditoría no se consume y no está asignado al workspace comprado

**Etiqueta: FALTA. Prioridad: P0, HU-32/HU-33.**

- **Referencia:** `05-data-model.md:146–151`, `06-api-contracts.md:43,54`, `10-implementation-backlog.md:367–378`, ADR-012.
- **Problema:** los entitlements pertenecen a la organización; la unidad comercial es workspace. No hay asignación, consumo atómico de `audit_once`, cantidades disponibles ni exclusión de derechos activos incompatibles. Activar manualmente seguimiento «cierra el entitlement anterior», pudiendo reemplazar otro producto. `requestAudit` comprueba disponibilidad sin definir cómo se agota.
- **Impacto:** un pago podría autorizar auditorías repetidas o gasto en otro dominio de la misma organización; no existe una prueba objetiva de cuota comprada/consumida.
- **Solución y prueba de cierre:** para P0, una orden pagada o concesión manual identifica exactamente una auditoría y su workspace. Separar ese consumo irreversible del derecho temporal de monitorización, asignado a workspace y con límites efectivos. Organización sigue siendo comprador. Probar dos solicitudes concurrentes contra una compra, dos workspaces con solo uno contratado, activación de seguimiento sin invalidar la auditoría y reembolso sin borrar evidencia fiscal. No hace falta un catálogo genérico de licencias.

### B04 — El presupuesto usa unidades incapaces de representar sus propios precios y una reserva incompleta

**Etiqueta: FALTA / OBJETO. Prioridad: P0, HU-08.**

- **Referencia:** `05-data-model.md:149–151`, `04-architecture.md:126–168,186–192`, `09-cost-model.md:15–31`, HU-08.
- **Problema:** `$0,0012` son `0,12` céntimos; `int cost_cents` no lo representa. Cambiar solo `provider_pricing` a «centésimas de céntimo» deja usos y reservas en otra unidad. Falta moneda en el ledger. La reserva única del run no define liquidaciones parciales, cargos de reintentos ni unicidad por intento; una expiración temporal podría liberar compromisos ya comprados. RNF-14 pide tope por proveedor, sin entidad/límite equivalente.
- **Impacto:** gasto contabilizado como cero o multiplicado, liquidaciones duplicadas y exceso del tope pese a una reserva inicialmente correcta.
- **Solución y prueba de cierre:** una unidad exacta común para costes de proveedor, por ejemplo micro-USD en `bigint`, moneda explícita y conversión presupuestaria separada de cobros EUR. Congelar versión de tarifa y coste máximo autorizado por intento. Mantener reservado pendiente y gasto acumulado bajo bloqueo de presupuesto; cada nuevo intento pagado necesita capacidad. No liberar una compra de resultado incierto por TTL: reconciliar primero. Sin presupuesto/precio/BD verificable, no despachar. Probar coste subcéntimo, liquidación repetida, dos intentos fallidos cobrados, expiración mientras la tarea externa sigue activa y suspensión entre claim y envío. El caso es VERIFIED en el origen: `src/lib/llm/budget.ts:7–13,64–69` declara exceso concurrente y fail-open; aquí hay que cambiar ambas propiedades.

### B05 — No se puede reconstruir la metodología exacta de cada muestra y agregado

**Etiqueta: FALTA. Prioridad: P0, HU-18/HU-19/HU-20/HU-22.**

- **Referencia:** `05-data-model.md:90–105,117–126`, `06-api-contracts.md:36–42,132–155`, `08-provider-strategy.md:114–129`, ADR-010.
- **Problema:** se exige `effective_country`, condición de captura, proveedor, cohorte y metodología, pero el sobre de `06` y el esquema no los conservan de forma consistente. La cohorte tiene UUID/versión sin lista inmutable de miembros por run. Cambiar alias/competidores modifica la semántica, sin snapshot del panel; `normalizer_version` se usa tanto para código como para configuración de marca. El rollup no lleva `capture_condition` y puede colisionar al coexistir UI/API. La clave de observación omite configuración/proveedor; la de SERP permite una sola muestra al día aunque se vuelva a comprar una auditoría con otra configuración.
- **Impacto:** cohortes distintas pueden mezclarse, colisionar o reinterpretarse; el informe no puede demostrar por qué obtuvo sus cifras después de cambiar alias/panel/proveedor. Purga de texto a 90 días hace irreversible esa pérdida.
- **Solución y prueba de cierre:** fijar un contrato canónico de configuración inmutable por run: prompts y versiones exactos, marca/alias, panel de competidores, dominios, mercado solicitado/efectivo, dispositivo, proveedor, modo de búsqueda, versión de normalizador y metodología. Puede ser JSON validado y hasheado, sin añadir múltiples catálogos. Usar esa identidad en claves y rollups; separar siempre superficie y vía. Resolver `surface=NULL` en unicidad con `NULLS NOT DISTINCT` o índice equivalente. Probar cambio de alias/panel, UI y API simultáneas, dos auditorías en un día y lectura histórica tras purga.

### B06 — La fórmula de salud y sus criterios de aceptación se contradicen matemáticamente

**Etiqueta: OBJETO. Prioridad: P0, RF-A15/HU-11.**

- **Referencia:** `02-prd.md:56–82,108`, `10-implementation-backlog.md:166–176`.
- **Problema:** con una portada `noindex` se descuentan 10 puntos si solo se auditó esa página: resultado 90, pero HU-11 exige ≤60. `noindex` y sin HTTPS producen 85 porque seguridad tiene cap 5; RF-A15 exige 80. Si no es negocio local y se reescala `100 − penalizaciones` por `100/95`, una web perfecta superaría 100. La entrada propuesta `findings` tampoco explica cómo obtiene el universo de páginas/categorías evaluables.
- **Impacto:** no existe implementación que pase simultáneamente las pruebas; el score puede aparentar salud alta con una portada no indexable o mejorar cuando falla PSI.
- **Solución y prueba de cierre:** publicar una única función con base evaluable, denominadores y agrupación por regla/categoría, incluyendo sitio no local y fuentes ausentes. Por ejemplo, normalizar los puntos ganados sobre caps evaluables; elegir explícitamente si hay veto de indexabilidad en portada. Tabla de resultados exactos para web limpia, noindex, HTTPS, ambos, cero páginas, PSI ausente y hallazgo repetido. Si estos pesos no aportan una decisión útil, retirar el score del primer piloto y conservar hallazgos por severidad.

### B07 — La recuperación de jobs y entregas no está cerrada: se pueden perder continuaciones o duplicar efectos

**Etiqueta: FALTA. Prioridad: P0, HU-07/HU-12/HU-20/HU-30.**

- **Referencia:** `06-api-contracts.md:157–170`, `04-architecture.md:139–168,194–209`, `10-implementation-backlog.md:178–190,252–263,337–348`; origen `src/lib/jobs/jobs.ts:27,74–98,118–122` y `src/lib/email/resend.ts:41–67`.
- **Problema:** emitir eventos después del commit deja un hueco entre persistir auditoría y encolar informe. El worker origen recupera locks a los 5 minutos sin token de ejecución que impida al propietario antiguo finalizar después; la auditoría admite 10–15 minutos. El contrato `run() → resultado` no expone claramente `submit → id → poll`, pese a exigir guardar el ID antes del resultado. Un padre que espere a sus hijos bloquearía el worker único. `sent_to` JSON no evita el crash después de enviar y antes de marcar enviado. Purgar jobs a 7 días borra su deduplicación y además requiere decidir qué ocurre con sus FKs desde uso/reservas.
- **Impacto:** auditoría pagada sin informe, ejecución concurrente de un job vencido, recompra o doble email. Las pruebas con fakes exitosos no cubren estas ventanas.
- **Solución y prueba de cierre:** persistir transición y siguiente job en la misma transacción, usando la cola existente; no hace falta un bus. Orquestación por fases cortas que no espere hijos dentro del mismo worker. Contrato `submit/poll` explícito, ID/tag persistidos, estado incierto si muere antes de guardar el ID y conciliación sin prometer compra exactamente una vez. Lease renovable con fencing para escrituras/finalización, o fases de duración estrictamente menor al lease. Entrega única en BD por informe/destinatario y clave idempotente soportada por email; documentar ventana y límites reales. Dedupe lógico duradero y política FK de purga. Probar crash antes/después de commit, antes/después de envío, pérdida del submit response y worker antiguo que despierta tras expirar. La copia origen carece de idempotency key de email: VERIFIED, no se hereda esa garantía.

### B08 — La protección de entrada no alcanza al render web/PDF ni a todos los fetch secundarios

**Etiqueta: FALTA. Prioridad: P0 de seguridad, HU-09/HU-28/HU-29.**

- **Referencia:** `04-architecture.md:176`, `05-data-model.md:76`, `06-api-contracts.md:149–152`, `10-implementation-backlog.md:140–164,312–335`.
- **Problema:** HTML auditado, fragmentos, Markdown y URLs del proveedor llegan a informes. Solo se define SSRF en `AuditFetcher`; no se especifica aislamiento del HTML bruto, escape de evidencia, enlaces peligrosos ni red de Chromium. Canonicals, sitemaps y recursos de impresión pueden apuntar fuera del host. El límite de 30 HTML no limita peticiones auxiliares, sitemaps comprimidos ni bytes descomprimidos; `04` incluso permite el puerto explícito raíz, en conflicto con RNF-06.
- **Impacto:** un dominio malicioso puede producir XSS almacenado o solicitudes desde el renderer a red interna/metadata, aunque el fetch inicial sea seguro; también puede agotar CPU/memoria.
- **Solución y prueba de cierre:** imprimir únicamente contenido estructurado escapado; renderizar ejemplos como texto o Markdown saneado sin HTML activo, enlaces solo http/https. Evidencia HTML como descarga aislada, nunca documento ejecutable del origen de la app. Chromium sin acceso externo por defecto, recursos propios empaquetados y sin credenciales del usuario. Aplicar destino público validado a todo fetch auxiliar, mantener Host/SNI con IP fijada, presupuesto total de bytes/peticiones/tiempo y límites XML/gzip; descartar puertos arbitrarios. Fixtures con script, `javascript:`, imagen/CSS remotos, canonical privado, rebinding, IPv6 y sitemap comprimido expansivo; comprobar cero conexiones internas. Es una condición del diseño, no una vulnerabilidad explotada en código existente.

## 3. MAJOR

### M01 — La licencia se necesita también para vender el PDF puntual

**Etiqueta: OBJETO / PREGUNTA. Prioridad: alta; gate antes del primer cobro con esos datos.**

- **Referencia:** `08-provider-strategy.md:101–108,198–210`, `11-risks-and-open-decisions.md:54` (D-05), ADR-008.
- **Problema/impacto:** excluir H2 del gate de licencia presupone que una sola redistribución tiene derechos diferentes. El PDF y su snapshot se conservan más que la respuesta bruta. DataForSEO publica restricciones sobre usos de SERP y responsabilidad del cliente; una página comercial no cierra retención, PDFs ni derechos de origen.
- **Recomendación/prueba:** confirmar el uso concreto antes de vender la primera auditoría que lo incluya, o retirar esa fuente de la oferta. Solicitud exacta en §9. No presentar ausencia de prohibición como permiso. [ToS DataForSEO, §§7–8](https://dataforseo.com/terms-of-service), consultado 2026-10-25: VERIFIED existencia de restricciones; UNVERIFIED autorización aplicable al producto. El coste es esperar confirmación o reducir la oferta, no implementar otro proveedor sin licencia.

### M02 — Los tiempos Standard no sostienen RNF-01 y falta un presupuesto de capacidad

**Etiqueta: OBJETO. Prioridad: alta, antes de prometer plazos.**

- **Referencia:** `02-prd.md:208–211`, `03-mvp-scope.md:18`, `04-architecture.md:126–168`, `09-cost-model.md:133–143`, HU-12/HU-14/HU-18/HU-29.
- **Problema/impacto:** Standard puede tardar hasta unos 45 minutos; fases SERP y luego IA pueden superar una hora. Esperar cada consulta secuencialmente multiplica la latencia. A 100 workspaces son 15.000 observaciones por semana; un único worker que esperase 30 s por llamada necesitaría 125 h, frente a la ventana de 48 h. Que haya `max_in_flight=5` no crea concurrencia en el bucle origen.
- **Recomendación/prueba:** separar envío y recogida, agrupar tareas y ceder worker mientras están pendientes; fijar deadline y política de informe parcial. Standard para seguimiento; Priority/Live o plazo comercial más amplio para auditoría tras ensayo real. Medir p90/p95 de 10 auditorías y cola semanal con retrasos realistas; contar polling, slots y esperas además de req/min. [Precios y tiempos LLM Scraper](https://dataforseo.com/pricing/ai-optimization/llm-scraper) y [SERP](https://dataforseo.com/pricing/google-serp/google-organic-serp-api), 2026-10-25: VERIFIED publicación; sin SLA observado.

### M03 — Los denominadores AIO y las afirmaciones de significación no son defendibles todavía

**Etiqueta: OBJETO. Prioridad: alta, HU-18/HU-22/HU-36.**

- **Referencia:** `02-prd.md:24–54`, `10-implementation-backlog.md:227–237`, `07-user-flows.md:155–161`, ADR-009.
- **Problema/impacto:** respuesta válida exige texto no vacío; HU-18 cuenta SERP sin AIO como captura válida, pero `has_answer` no existe en el modelo. Deben distinguirse captura completada, respuesta presente y respuesta con mención. Jaccard mide coincidencia de conjuntos, no precisión de una tasa. Wilson supone un modelo Bernoulli cuya independencia no está establecida; no corresponde sin más a cuota de voz ni cobertura de preguntas. Solapamiento de intervalos no demuestra «sin cambio significativo». Con 1/3, 2/5 y 3/7 éxitos las semianchuras Wilson 95 % son aproximadamente 36,5, 32,6 y 29,6 puntos: subir de 3 a 5 no cumple ±20.
- **Recomendación/prueba:** persistir `capture_status` y `answer_present`. Publicar cobertura de captura, frecuencia de AIO y mención/cita condicionada a respuesta por separado, con casos 10 capturas/2 AIO/1 mención y cero AIO. En piloto mostrar fracciones y variación descriptiva; eliminar lenguaje de significación. Si se quieren intervalos, especificar estimando, unidad/agrupación por pregunta-día y tratamiento de correlación/fallos. Contrastar estabilidad de decisiones y cohortes en varias marcas, no solo un dogfood. No sumar los resultados como «dos asistentes» equivalentes.

### M04 — Antes de cobrar faltan datos para saber qué marca y negocio se está midiendo

**Etiqueta: FALTA. Prioridad: alta, RF-A01/RF-A13/RF-A16/HU-32.**

- **Referencia:** `06-api-contracts.md:68–79`, `05-data-model.md:25`, `07-user-flows.md:38–40`, `01-product-vision.md:23–33`.
- **Problema/impacto:** el formulario no pide nombre comercial, alias ni servicios y ciudad es opcional; la muestra se ejecuta antes de configurar marca. No hay regla fiable para deducirlos del dominio. Competidores inventados por LLM llegan al PDF como panel real. Una medición de «clínica dental en España» puede ser irrelevante para un negocio local; tampoco se congela ciudad efectiva en las observaciones.
- **Recomendación/prueba:** pedir marca, actividad y zona mínimas, prellenables desde metadatos como sugerencia confirmable. Guardarlas en la orden. Competidores confirmados o explícitamente candidatos sin cuota comparativa contractual; si falta evidencia, omitir la comparación. Mostrar país solicitado y ubicación efectiva sin inventarlos. Fixture donde dominio, razón social y marca difieren, ciudad ausente y competidor homónimo. El pequeño paso de confirmación ahorra informes erróneos y soporte.

### M05 — El seguimiento no vuelve a medir salud técnica y su media SERP puede mejorar al perder posiciones

**Etiqueta: FALTA / OBJETO. Prioridad: alta, RF-C01/RF-C06/HU-38.**

- **Referencia:** `03-mvp-scope.md:73–87`, `02-prd.md:47–54`, `07-user-flows.md:155–168`, HU-20.
- **Problema/impacto:** solo se programa IA/SERP; se prometen cuatro series semanales y problemas «siguen abiertos», aunque no se repite el análisis técnico. La posición media excluye ausentes: pasar de posiciones 2 y 20 a 2 y fuera de top 20 mejora la media de 11 a 2 mientras empeora la cobertura. Marcar «hecho» una recomendación no verifica la web, y no tiene entidad/campo definido.
- **Recomendación/prueba:** salud técnica como foto fechada hasta nueva auditoría pagada o incluida con cuota explícita; no dibujar una medición nueva donde no existe. Mostrar top 10/top 20 y ausencias como KPI principal, media como detalle descriptivo sobre cohorte comparable. Separar estado manual de acción y verificación posterior. Probar pérdida de una keyword, cambio del conjunto y acción marcada sin reauditoría.

### M06 — Dos niveles sirven; los permisos y la transferencia no quedan resueltos por el UUID

**Etiqueta: OBJETO. Prioridad: alta; aislamiento P0, acceso de clientes de agencia antes de P1.**

- **Referencia:** `04-architecture.md:174,213–226`, `05-data-model.md:24,37,190,197`, `06-api-contracts.md:35–50`, `07-user-flows.md:216–235`, ADR-005.
- **Problema/impacto:** `member` edita marca en `07`, pero no en `04/06`; invitaciones no conservan `workspaceIds`, grants no tienen rol y no vinculan explícitamente organización de membresía con workspace. Un miembro de agencia ve todos sus clientes en P0: aceptable solo si no se invita a usuarios de empresas. `withWorkspace(id)` no autentica al usuario: VERIFIED por el patrón `with-tenant.ts:59–71`. Cambiar `organization_id` no es un UPDATE trivial con esa columna desnormalizada, facturas históricas, OAuth, enlaces firmados y grants; además se declara inmutable.
- **Recomendación/prueba:** una matriz autoritativa y contexto autorizado por actor, organización, workspace y permiso antes de RLS, también en lecturas, jobs y archivos. Separar rol DB de rol funcional; para el nuevo producto preferir credenciales de runtime sin privilegios de dueño/migración y una vía de administración explícita. Mantener dos niveles; prohibir invitaciones de empresas dentro de una agencia hasta grants efectivos, o adelantarlos. Diferir herramienta de transferencia, pero fijar ya titularidad y excluir histórico fiscal del traspaso; revocar accesos/enlaces/tokens y mantener consistencia. Probar dos workspaces de la misma agencia, miembro retirado, grant cruzado, edición por member y acceso sin contexto; no basta dos organizaciones distintas.

### M07 — La retención y el borrado no cubren todas las copias desde P0

**Etiqueta: FALTA. Prioridad: alta, antes de clientes reales.**

- **Referencia:** `05-data-model.md:37,76,101,127–128`, `10-implementation-backlog.md:302,435`, ADR-016, RNF-16/RNF-17.
- **Problema/impacto:** el snapshot incluye muestras IA para siempre, aunque el texto debe desaparecer a 90 días. PDFs y HTML pueden preservar el mismo texto; el borrado de filas/artefactos tiene plazos contradictorios. Se difiere todo a P1, aunque P0 ya conserva email, IP, enlaces y documentos. No se define pausa/drenaje de jobs que podrían recrear archivos tras borrarlos. «Solo datos del dominio» no garantiza ausencia de datos personales al externalizar PDF.
- **Recomendación/prueba:** política por clase y copia: raw, ejemplos, snapshot, PDF, logs y backups, sujeta a licencia. Elegir informe duradero sin texto íntegro o retención autorizada compatible; no prometer purga donde queda otra copia. P0 puede tener procedimiento manual de exportación/baja, sin UI: revocar enlaces y sesiones pertinentes, detener/desactivar jobs, drenar en curso y purgar, con tombstone al restaurar backup. Separar documentos fiscales de evidencia eliminable. Ensayar borrado durante render y restauración sin resucitar acceso. Determinar funciones de cada proveedor y acuerdos de datos; no asumir que todos son encargados idénticos.

### M08 — Se atribuyen acuerdos al informe original que este no contiene y se exagera la independencia del código copiado

**Etiqueta: OBJETO. Prioridad: alta, fidelidad de la consolidación.**

- **Referencia:** `00-analysis-comparison.md:60,65,79–80,86,112`, `04-architecture.md:239–256`, `10-implementation-backlog.md:61–71,522–536`, ADR-006/ADR-013.
- **Problema/impacto:** el original Codex §5 pide identidad propia y prácticas reutilizadas; no evalúa ni veta Clerk/Auth0 por precio. §7 rechaza snapshots genéricos, no todo snapshot. Claude sí excluye auditoría técnica propia en §5.3 y §9.3.8; resumir que «ambos solo vetaban miles de páginas» diluye una discrepancia real. El MVP de Claude es adicional a su piloto; no hay convergencia de ambos en 30–45 jornadas totales. `jobs/run.ts:1–18` importa CRM y handlers; `jobs.ts:85–87` consulta tenants, y la suite de aislamiento importa persistencia CRM (`tests/isolation/tenant-isolation.test.ts:5–21`).
- **Recomendación/prueba:** separar acuerdo original de decisión nueva de Claude y de aceptación expresa en esta revisión. Copiar crypto y transporte email acotados; adaptar algoritmo de cola, crear bootstrap y fixtures del dominio nuevo. No copiar la migración de tablas CRM. `reencrypt-secrets.ts` también requiere revisar su acceso a tablas. Registrar inventario de imports, pruebas y cambios reales, no solo SHA. Acepto auth propia como opción razonable, sin atribuirme la justificación económica no investigada. La contrapartida de copiar menos es reconstruir fixtures útiles, no trasladar deuda CRM.

### M09 — P0a y la secuencia de sprints no son un subconjunto cerrado del backlog

**Etiqueta: OBJETO. Prioridad: alta, antes de planificar.**

- **Referencia:** `10-implementation-backlog.md:180–184,302–304,503–573`, `03-mvp-scope.md:167–179`.
- **Problema/impacto:** P0a elimina HU-19–22, pero HU-27 depende de HU-22 y la muestra necesita generación/menciones de HU-19/HU-21. Incluye E7 mientras difiere HU-33 que pertenece a E7. HU-20 no declara dependencia de HU-33 aunque exige derecho activo. H1 en S5 exige PDF, construido en S7; H2 en S7 llega antes de admin, alertas y prueba PDF en S11/S12. Las historias del asistente, ajuste de marca, landing pagada y recuperación de acceso no tienen cobertura completa en las historias web.
- **Recomendación/prueba:** separar funciones puras compartidas por auditoría/seguimiento de scheduler recurrente. Definir P0a como conjunto cerrado por dependencias, sin adelgazar seguridad/operación: aislamiento también es gate de P0a. Incluir pantalla de entrada pagada, primer acceso y recuperación. Rehacer DAG, hitos y costes; ejecutar walkthrough con datos ficticios de orden hasta entrega antes de estimar. Son 30 historias P0, no 26. E3 + HU-15 suma 9,5–13,5 j, no 11,5–16,5. La suma global por épicas sí da 57–80,5 j; corregir explicación sin fingir ahorro.

### M10 — El valor independiente del servicio y la recuperación de inversión no están validados

**Etiqueta: OBJETO / PREGUNTA. Prioridad: alta, antes de financiar el alcance completo.**

- **Referencia:** `01-product-vision.md:46–66,85–99,114–129`, `09-cost-model.md:169–251`, `11-risks-and-open-decisions.md:38–40,58`.
- **Problema/impacto:** una muestra con preguntas/competidores generados no equivale a demanda real del negocio. El recorrido enfatiza «pedir propuesta» y presupone que el servicio mueve el gráfico. Tres auditorías vendidas no prueban renovación de monitorización. El descuento de 149–249 € sobre el primer mes de 79 € carece de regla; la mezcla C presume 0,8 nuevas auditorías por suscriptor cada mes sin embudo/CAC. El equilibrio de 6 clientes excluye recuperar meses de construcción; `09:231` aún usa 32–44 j.
- **Recomendación/prueba:** vender diagnóstico útil por sí solo, con tres acciones que el propietario pueda hacer o delegar a cualquier profesional, evidencia y forma de comprobarlas; CTA de servicio opcional. Validar después un segundo ciclo pagado de seguimiento con compradores sin servicio de marketing. Registrar cancelación y tiempo humano de onboarding/revisión/soporte. A la tarifa ilustrativa del original (300 unidades monetarias/j), P0 cuesta 17.100–24.150; no es un presupuesto ni una conversión USD/EUR. Amortizar inversión en el modelo con churn/CAC, precio neto de IVA, FX explícito y comisiones por producto; no equiparar USD y EUR al liquidar presupuestos. La sostenibilidad operativa es plausible, la comercial sigue UNVERIFIED.

### M11 — Google requiere correcciones concretas antes de P1; PSI ya cambia el P0

**Etiqueta: OBJETO. Prioridad: alta para contrato PSI; media para conectores P1.**

- **Referencia:** `04-architecture.md:120`, `05-data-model.md:62,119–120`, `07-user-flows.md:107–132`, `08-provider-strategy.md:55–83,205–207`, HU-15/HU-47/HU-48.
- **Problema/impacto:** Google anuncia retirada de CrUX de PSI; INP de campo no es una métrica de Lighthouse equivalente a TBT. Un registro con un único LCP/CLS y `both` pierde distinción laboratorio/campo y URL/origen. OAuth Testing limita usuarios pero también caduca refresh tokens a 7 días para estos scopes; no sostiene un piloto mensual sin reconexión. Search Analytics no devuelve inventario completo de páginas indexadas ni todas las filas; `search_daily` tampoco guarda fuente/propiedad/tipo y las dimensiones se pueden sumar doblemente.
- **Recomendación/prueba:** P0 PSI de laboratorio, con versión Lighthouse y métricas separadas; campo opcional vía CrUX si se justifica, no condición del informe. Cuota efectiva pendiente de Cloud Console, no inventar número. En P1: plan de publicación/verificación y prueba de revocación/refresh, sin prometer plazo de aprobación. GSC con propiedad autorizada y dominio compatible, granularidad/filtros/tipo y estado de dato; relectura según metadatos de incompletitud, totales consultados separadamente y ausencia diferenciada de cero. Corregir «páginas indexadas» o especificar inspección URL acotada. Fuentes oficiales de Google en §8: capacidades documentadas VERIFIED; cuota/proyecto y ejecución real UNVERIFIED.

### M12 — El acceso por enlace es una capacidad y necesita límites y revocación coherentes

**Etiqueta: FALTA. Prioridad: alta, HU-29/HU-42.**

- **Referencia:** `02-prd.md:162`, `05-data-model.md:119`, `06-api-contracts.md:46,110–120,216`, `07-user-flows.md:84–105,178–183`.
- **Problema/impacto:** se mezclan 72 h y 7 días, 410 y 403, HMAC stateless y hash persistido sin definir revocación. El informe público ofrece crear solicitud, pero la acción exige miembro autenticado. Compartir un PDF no debe compartir capacidad de fijar contraseña, ni permitir consultar datos de cuenta mediante `session_id`. El bearer puede filtrarse a logs, analítica o terceros de la página.
- **Recomendación/prueba:** separar tokens de informe, primer acceso y consulta de orden, cada uno con ámbito mínimo. Definir acceso bearer de lectura, caducidad única y revocación mediante versión/hash persistido; comprobar workspace no borrado. Para pedir propuesta elegir login o capacidad limitada al informe con identidad/contacto validado y rate limit. `Referrer-Policy: no-referrer`, sin terceros y redacción de tokens en logs. Probar URL compartida, token revocado, cambio de organización, caducidad, acción de escritura con token de lectura y estado público sin PII. La capacidad compartible es un compromiso aceptable si queda explícito.

### M13 — La operación no puede depender de copiar Compose y ejecutar solo `pg_dump`

**Etiqueta: FALTA. Prioridad: alta antes de H2.**

- **Referencia:** `04-architecture.md:84–109,239–267`, `05-data-model.md:76`, ADR-015, HU-45; origen `infra/platform/docker-compose.yml:16–33,47–54`, `infra/deploy.sh:63–69,107–125`.
- **Problema/impacto:** app y worker requieren ver artefactos locales; el diagrama solo monta worker. BD restaurada sin PDFs/raw/clave de cifrado no recupera informes ni conexiones. El rol runtime dueño, la red host y ausencia de límites de recursos amplían impacto sobre CRM. Rollback de imagen no revierte esquema, advertido explícitamente por el script origen. El health detallado público revela espacio y versión sin necesidad.
- **Recomendación/prueba:** volumen compartido (lectura web, escritura worker), escritura atómica de artefacto y metadata, backup coherente de BD/archivos/configuración y claves conservadas por vía separada. Restaurar en entorno aislado y descargar un informe real desde el restore. Fijar RPO/RTO del piloto, migraciones compatibles con imagen previa, build con Chromium/fonts versionados y límites CPU/RAM; binding solo local detrás de Caddy, sin heredar red host por dependencias Twenty que Visibility no tiene. Health público mínimo y detalle autenticado. Compartir host sigue siendo posible, con fallo físico compartido reconocido.

## 4. MINOR

| ID / etiqueta / prioridad | Referencia | Problema e impacto | Cambio recomendado y comprobación |
|---|---|---|---|
| N01 · OBJETO · baja | `05-data-model.md:127`, HU-29, RF-D03 | `monthly_corrected` no pertenece al enum y la UK impide una revisión del mismo mes. PDF byte a byte exige fijar motor, fuentes y metadata; no añade valor a la lectura | Versionar informes con `revision`/`supersedes_id` si se corrigen; aceptar contenido y hash del HTML canónico reproducibles. Servir el PDF original guardado. Fixture de corrección y regresión visual |
| N02 · FALTA · media | RF-T10, `07-user-flows.md:172`, HU-36–38 | Hay estados de carga/error, pero no criterios explícitos de accesibilidad y comprensión; afecta al propietario sin formación SEO | Navegación teclado, tablas legibles, contraste y alternativa textual de gráficas. Prueba con propietario: identifica una acción sin explicación del equipo |
| N03 · OBJETO · baja | `04-architecture.md:20,78–82`, `08-provider-strategy.md:110,190–196`, `05-data-model.md:175–184` | Se exagera que Prisma obligaría a reescribir crypto, se duplican ubicaciones de adaptadores y se estima tamaño sin índices/TOAST/backups; documentación menos fiable | Justificar Drizzle por continuidad, fijar una ubicación de adaptadores y medir volumen con fixtures representativos. Mantener PostgreSQL sin particionado preventivo |

## 5. SIMPLIFICATIONS

Cada recorte conserva un piloto vendible. No propongo eliminar controles de pago, aislamiento, costes o recuperación.

| ID / prioridad | Referencia | Qué eliminaría o diferiría y por qué | Impacto y alternativa verificable |
|---|---|---|---|
| S01 · OBJETO · alta | `03:73–87`, HU-36–39 | Siete rutas de dashboard desde el primer pago | Una vista de diagnóstico, informe descargable y una pestaña de seguimiento con datos/fechas. Mantener detalle de evidencia y administración mínima. Demostrar el recorrido con un comprador antes de separar pantallas |
| S02 · OBJETO · alta | `03:47–71`, HU-19/HU-33/HU-40 | Complejidad de agencia, membresía múltiple y grants en la primera validación comercial | Piloto directo de una pyme por organización, sin invitaciones de clientes de agencia. Preservar IDs de organización/workspace, implementar grants antes de abrir ese caso. Reduce auth/UI, con aceptación explícita de mercado inicial limitado |
| S03 · OBJETO · media | `02:56–82`, HU-11 | Score e inferencia estadística obligatorios en primera entrega | Hallazgos por severidad, fracciones por superficie y límites claros. Si se retiene el score exigido por producto, cerrar B06; nunca resolver la contradicción improvisando pesos |
| S04 · OBJETO · media | `04:113`, `08:190–210`, `06:172–212` | API pública P2 diseñada endpoint por endpoint, Recording* universal, segundo proveedor antes de demanda y abstracciones GSC/GA4 anticipadas | Solo contratos que consume P0 y fixtures grabados manualmente/saneados. Una interfaz por capacidad y adaptadores reales P0. Cambiar proveedor después admite ruptura de serie y es preferible a un fallback engañoso |
| S05 · OBJETO · media | HU-42/HU-46, ADR-014 | Dos canales de aviso y cuatro estados comerciales antes de validar uso | Email y solicitud persistida; Telegram opcional si su patrón compensa. Operaciones de salud/cola siguen siendo obligatorias, derivables de jobs/ledger sin una plataforma de métricas propia |
| S06 · OBJETO · alta | `10:538–542`, `00:110` | Construir 40–55 jornadas como requisito para probar si alguien paga una auditoría | Validación asistida con datos/herramientas con derechos confirmados e informe propio, comercialmente independiente de marketing. Si se decide producto propio desde el inicio, usar P0a cerrado por dependencias, sin anunciar que ya completa seguimiento. No fijo un nuevo plazo sin reestimar el DAG |

## 6. AGREEMENTS

| ID / etiqueta / prioridad | Referencia | Decisión apoyada y su efecto | Recomendación y prueba de conservación |
|---|---|---|---|
| A01 · ACEPTO · alta | ADR-001–003, `04:6–12` | Repo, datos, identidad y contratación propios permiten vender sin CRM | Conservar. Arrancar, pagar y generar informe con lead-platform apagado; los avisos tampoco deben llamarlo |
| A02 · ACEPTO · alta | ADR-005, `05:186–190` | Organización → workspace basta para una marca/web por ámbito; tercer nivel añade coste a cada operación | Conservar dos niveles con límites y propiedad explícitos; B05/M06 cierran historia y permisos |
| A03 · ACEPTO · alta | ADR-007/008 | Monolito, PostgreSQL, cola persistente y compra de capturas evitan operar scraping e infraestructura adicional | Conservar; implementar recuperación B07 y comprobar costes/contratos. Redis, Kafka, Timescale y microservicios siguen sin justificación |
| A04 · ACEPTO · alta | ADR-010, `08:16–30` | Separar API de modelo, captura de interfaz y analítica autorizada evita prometer exposición real inexistente | Conservar en BD/UI/PDF; fixtures muestran series separadas y fallos como incompletos |
| A05 · ACEPTO · media | ADR-011 | Snapshot acotado al informe más plantilla HTML compartida es compatible con mi objeción a snapshots genéricos | Conservar sin duplicar todo el workspace; cerrar retención y reproducción semántica, B05/M07/N01 |
| A06 · ACEPTO · alta | ADR-012, `09:47–59,221–251` | Entitlements locales y soporte/mantenimiento como costes explícitos son buenas decisiones | Conservar con consumo/asignación B03, precisión B04 y amortización M10; no extraer derechos de uso solo de Stripe |
| A07 · ACEPTO · media | `03:154–163`, ADR-008 | Mantener fuera backlinks, scraping propio, ranking IA universal y grounding incompatible reduce riesgo | Conservar alcance OUT. Gemini Grounding: restricciones verificadas en §8; no afirmar que todas las APIs de todos los proveedores tengan idénticos términos |

## 7. Validación del recorrido y testabilidad P0

### 7.1 Recorrido completo

| Paso | ¿Está descrito? | Qué impide cerrarlo |
|---|---|---|
| Usuario → dominio | Parcial | Orden anónima, marca/zona y reclamación de cuenta: B01/M04 |
| Dominio → pago → auditoría | Parcial | Confirmación real de pago, consumo y reserva: B02–B04; contrato/licencia M01 |
| Auditoría → informe | Parcial | Fórmula contradictoria, continuación duradera, tiempos y render seguro: B06–B08/M02 |
| Informe → dashboard | Parcial | Primer acceso y capacidades de enlace; permisos uniformes: B01/M06/M12 |
| Dashboard → seguimiento | Parcial | Entitlement por workspace, aprobación y activación única; cohortes y estados: B03/B05/M09 |
| Seguimiento → acción → nueva comprobación | Insuficiente | No hay reauditoría técnica programada y la recomendación manual no demuestra resolución: M05 |
| Pausa/cancelación/baja | Parcial | Caducidad detiene runs nuevos, pero faltan cancelación manual accesible y drenaje/borrado: M07/M10 |

No hay una dependencia técnica necesaria de lead-platform. Sí hay dependencias internas de P0a/P0b y una dependencia comercial circular: se propone construir el producto para validar la venta que justificaría construirlo.

### 7.2 Matriz de las 30 historias P0

**Condicionada** significa que tiene un resultado objetivamente comprobable al corregir los hallazgos citados. **Bloqueada** significa que su aceptación actual es contradictoria o carece del contrato necesario. Ninguna se declara implementada ni probada en esta revisión.

| HU / referencia en `10-implementation-backlog.md` | Estado de criterios | Prueba que debe cerrar la historia |
|---|---|---|
| HU-01:48 | Condicionada | Build/worker y BD real con bootstrap documentado; el clon no obtiene credenciales/BD solo copiando `.env.example` |
| HU-02:61 | Condicionada, M08 | Inventario de imports, procedencia y pruebas adaptadas; sin fixtures/handlers CRM |
| HU-03:77 | Condicionada, M06 | RLS real con dos organizaciones y dos workspaces de una agencia, FK negativas y autorización del actor |
| HU-04:90 | Bloqueada, B01 | Registro/reclamación, reset y primer acceso, doble uso y vencimiento de token, retirada de membresía y cookie segura |
| HU-07:110 | Bloqueada, B07 | Claim concurrente, concurrencia global atómica por proveedor, lease/fencing y recuperación tras crash |
| HU-08:123 | Bloqueada, B04 | Costes exactos subcéntimo, dos reservas concurrentes, fallo de BD, varios cargos de reintento y liquidación idempotente |
| HU-09:140 | Condicionada, B08 | DNS/transporte inyectables sin abrir rangos privados en producción; redirects, bytes descomprimidos, XML y tiempo total |
| HU-10:153 | Condicionada, B08/M04 | Catálogo de reglas único: PRD pide ≥25 y backlog ~20. Fixtures de sitios limpios/problemáticos, no solo HTML artificial que dispara la regla |
| HU-11:166 | Bloqueada, B06 | Tabla única de resultados exactos para local/no local, datos ausentes y problemas críticos |
| HU-12:178 | Bloqueada, B07/M02 | Pipeline por fases, sin worker bloqueado esperando hijos; reinicio por fase, fallo parcial y deadline |
| HU-14:196 | Condicionada, B05/B07 | Fixture oficial/real saneado + mock submit/poll/reconcile. `observations.raw` no existe en 05: usar referencia de artefacto canónica |
| HU-15:208 | Condicionada, M11 | PSI laboratorio/campo separados, URL/origen y ausencia CrUX; 429 con reloj controlado; cuota real antes de venta |
| HU-18:227 | Bloqueada, B05/M03 | Captura sin AIO válida operacionalmente, campos documentados, citas estructuradas y tarea externa no reenviada tras timeout |
| HU-19:239 | Bloqueada, B05 | Cohorte inmutable con miembros exactos; edición concurrente y retirada. Ninguna ejecución recurrente antes de aprobación/activación |
| HU-20:252 | Bloqueada, B03/B05/B07 | Reloj fijo: baseline + cuatro semanas, scheduler duplicado, suspensión y reanudación. Separar hueco histórico de ejecución tardía |
| HU-21:265 | Condicionada, B05/M04 | Dataset etiquetado con casos negativos/homónimos. Fuentes estructuradas distintas de URLs que el texto simplemente menciona |
| HU-22:278 | Bloqueada, B05/M03 | Dataset con cero respuestas, cero AIO, solo branded, fuentes ausentes, panel nuevo y dos vías de una superficie |
| HU-27:300 | Condicionada, B05/M07 | Snapshot completo validado, inmutabilidad y purga compatible; no depender de scheduler recurrente para informe puntual |
| HU-28:312 | Condicionada, B08/M04 | Contenido de ocho secciones, evidencia real, escape de HTML/Markdown y ausencia explícita de comparativa no confirmada |
| HU-29:325 | Condicionada, B08/M12/M13/N01 | Chromium real en imagen final, p95/RAM, aislamiento de red, acceso al volumen web, contenido estable y tokens caducados/revocados |
| HU-30:337 | Bloqueada, B07 | Fallo tras aceptación por email y antes de commit; clave idempotente y comportamiento tras su ventana de validez |
| HU-32:354 | Bloqueada, B01–B04 | Stripe sandbox/test: pago normal/diferido/fallido, webhooks concurrentes/desordenados, producto ajeno y creación de sesión incierta |
| HU-33:367 | Bloqueada, B03 | Concesión por workspace, dos productos simultáneos, caducidad, pausa, aprobación pendiente y consumo único |
| HU-36:387 | Condicionada, M03/M05/M06 | Lecturas autorizadas, fechas de fuente, fracciones por superficie y estado sin medición previa |
| HU-37:399 | Condicionada, B05/M03/M07 | Filtros preservan metodología, datos incompletos y ejemplos purgados también en caché/artefactos pertinentes |
| HU-38:411 | Condicionada, M05/N01 | Historia técnica sin puntos inventados, ruptura por panel/cohorte y recomendaciones manuales sin falsa verificación |
| HU-39:423 | Condicionada, B04/M06 | Rol plataforma real (`platform_admin` bool vs `platform_role` debe unificarse), auditoría y operaciones con permiso/motivo |
| HU-42:439 | Condicionada, M12 | Decidir sesión/capacidad para formulario del informe público, idempotencia concurrente y vínculo a `report_id` que falta en 05 |
| HU-45:456 | Condicionada, M13 | Deploy fallido, rollback compatible, restore conjunto BD/artefactos y descarga de informe; aislar del CRM |
| HU-46:468 | Condicionada, M02/M12 | Reloj controlado, heartbeats durante tareas externas pendientes y alertas antes de H2; no registrar tokens de enlaces ni credenciales |

### 7.3 Dependencias externas y evidencia necesaria

| Dependencia | Doble de prueba / sandbox | Evidencia real que no sustituye el mock |
|---|---|---|
| DataForSEO SERP/ChatGPT | Sandbox documentado, servidor HTTP que simula estados por tarea, fixtures saneados y errores de API dentro de HTTP 200 | Llamadas autorizadas en ES/es, ubicación/método, fuentes, ausencia AIO, latencia y coste; licencia archivada. Repeticiones separadas deben comprobar frescura y posible caché, sin asumir independencia |
| PSI | JSON de laboratorio, campo ausente/origen, 429/5xx | Proyecto/API key y cuota efectivos; mediciones de URL pequeña y grande; contrato de campo opcional |
| LLM generador | Fake con JSON correcto/incorrecto, prompts branded mal etiquetados y entidades inventadas | Calidad revisada en varios sectores/zonas. La salida debe validar estructura; aprobación humana determina pertinencia |
| Stripe | Sandbox/test, firma del body crudo, eventos duplicados/desordenados | Ensayo documentado de compra y entrega en test; modo live solo tras los gates de lanzamiento y autorización correspondiente |
| Resend | Fake y mock de aceptación seguida de timeout, dedupe por destinatario | Remitente propio verificado, entrega y comportamiento de su clave idempotente. No inferir «exactamente una vez» del JSON local |
| Chromium/FS | Render real con fuentes e imagen final; transporte/red bloqueables | Recursos medidos en VPS, volumen web/worker y restore con artefactos descargables |
| PostgreSQL | BD real, roles de runtime y administración; nunca mock de RLS/locks | Restricciones y transacciones concurrentes, leases, unicidad y borrado; prueba de rollback/restore |
| Google OAuth/GSC (P1) | Token endpoint simulado: expiración, revocación, refresh concurrente y scopes | Proyecto de prueba con propiedad autorizada, publicación/verificación según scopes, revocación real y completitud contrastada |

## 8. Verificación independiente de proveedores y costes

Fuentes primarias consultadas el **2026-10-25**. Se verifica lo publicado, no el funcionamiento de una cuenta no inspeccionada. No se realizaron pruebas pagadas ni se dio autorización para contratar nada.

| Fuente / estado | Resultado y efecto en la propuesta |
|---|---|
| [ChatGPT task POST](https://docs.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper/task_post/) · VERIFIED documental | Existen ubicación/idioma, `force_web_search` y `tag`; se cobra al crear tarea. Documenta hasta 100 tareas/POST y 10.000 llamadas/min. Fijar parámetros explícitos; comprobar respuesta por tarea, no solo HTTP |
| [ChatGPT task GET advanced](https://docs.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper/task_get/advanced/) · VERIFIED documental | Incluye `sources` estructurado con URL y `search_results` más amplio; no confundir ambos ni considerar toda URL en prosa una cita. `citations=[]` solo no distingue ausencia auténtica de fallo de extracción. Cobertura efectiva ES sigue UNVERIFIED |
| [LLM Scraper: precios](https://dataforseo.com/pricing/ai-optimization/llm-scraper) · VERIFIED publicado | Standard 0,0012 USD, Priority 0,0024 y Live 0,004 por resultado; tiempos publicados Standard hasta 45 min, Priority hasta 5 min, Live unos 120 s. No constituyen SLA de auditoría |
| [SERP precios](https://dataforseo.com/pricing/google-serp/google-organic-serp-api) y [task POST](https://docs.dataforseo.com/v3/serp/google/organic/task_post/) · VERIFIED publicado | Standard base 0,0006 USD por 10 resultados. `load_async_ai_overview` añade una base, con devolución si no aplica; no el fijo 0,002 USD usado en 09. Operadores pueden multiplicar coste; validar keywords/configuración generadas |
| [DataForSEO ToS](https://dataforseo.com/terms-of-service) · VERIFIED texto; autorización UNVERIFIED | §§7–8 restringen uso de SERP, trasladan responsabilidades y no garantizan continuidad. DPA incorporado cuando aplica. No resuelven por sí solos permiso contractual del portal/PDF/retención; pedir confirmación específica |
| [PSI inicio](https://developers.google.com/speed/docs/insights/v5/get-started) y [datos de PSI](https://developers.google.com/speed/docs/insights/v5/about) · VERIFIED documental | API usable con o sin key; recomendada para automatización. Se anuncia retirada del campo CrUX. Campo refleja 28 días, puede ser origen y faltar en pymes. Cuota aplicable de la cuenta y condiciones concretas de reutilización siguen pendientes |
| [Google OAuth](https://developers.google.com/identity/protocols/oauth2/) · VERIFIED documental | Refresh token en Testing externo expira a 7 días salvo scopes básicos de identidad. «≤100 usuarios» no equivale a producción mensual estable; la verificación concreta depende del proyecto/scopes |
| [Search Analytics query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query) · VERIFIED documental | API autorizada de rendimiento, limitada a filas principales; no garantiza todas las filas. La ausencia no demuestra cero. No sustituye un inventario de indexación |
| [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment?ui=full-page) y [peticiones idempotentes](https://docs.stripe.com/api/idempotent_requests) · VERIFIED documental vía CLI | Comprobar `payment_status`, deduplicar entrega por sesión y atender pagos diferidos. Usar idempotency key también para crear Checkout, no el ID que solo llega después |
| [Stripe España: precios](https://stripe.com/es/pricing) · VERIFIED publicado | Tarjeta estándar EEE: 1,5 % + 0,25 EUR; no todos los medios/tarjetas tienen ese precio. Separar Billing/Invoicing/Tax si se contratan; verificar tarifa efectiva de cuenta |
| [Gemini términos adicionales](https://ai.google.dev/gemini-api/terms#grounding-with-google-search) · VERIFIED texto | Restricciones de análisis/reventa y recopilación de Grounded Results respaldan OUT para este histórico. Hay excepciones limitadas de conservación, no una prohibición universal de toda copia. La página consultada indica vigencia 2026-03-23, no 2026-04-28; corregir fecha atribuida |
| Proveedores P1/P2/OUT restantes · UNVERIFIED en esta revisión | No se revalidan precios de Otterly, SE Ranking, Semrush/Ahrefs, Perplexity ni Bing. No se necesitan para demostrar P0; su precio o silencio contractual no constituye fallback listo. Mantener OUT o pendiente sin afirmar licencia universal |

**Recálculo acotado, INFERRED a partir de las tarifas publicadas:** si AIO cuesta como máximo 0,0012 USD Standard a profundidad 10 y ChatGPT 0,0012, las 25 × 3 × 4,33 muestras por superficie cuestan aproximadamente 0,7794 USD. Añadir SERP independiente 30 × 2 × 4,33 × 0,0006 = 0,15588 y redacción hipotética 0,013 produce 0,94828; con 10 % da **1,043108 USD/mes**, en vez de 1,54. Para auditoría: `(0,012 + 0,036 + 0,036 + 0,026) × 1,1 = 0,121 USD`, en vez de 0,17. Son cálculos ilustrativos de Standard con esos parámetros, sin SLA, impuestos, FX ni coste humano; los reembolsos/modos/operadores pueden cambiar el cargo. No presupuestar entrega urgente con estos precios sin volver a calcular.

La corrección no cambia la conclusión económica: ahorros de céntimos por workspace no justifican meses adicionales de desarrollo. Tampoco valida que 10/50/100 clientes realmente compren o renueven.

**Facturación al primer cliente:** `03:114` y R-25 difieren obligaciones españolas a P2/P1 y confían en recibo de Stripe. Para ventas B2B debe existir procedimiento de factura con datos fiscales, impuestos, serie y rectificativas aplicables desde P0; puede ser manual o herramienta externa, sin motor fiscal propio. El [Reglamento de facturación, art. 2](https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696) exige factura en operaciones con destinatario empresario/profesional (VERIFIED texto consultado). No concluyo aquí calendario de VERI*FACTU ni situación fiscal del vendedor, que requieren validación específica. Este gate se incluye en M10 y en los cambios propuestos.

## 9. Respuestas a `11-risks-and-open-decisions.md` §5

1. **Tenancy:** acepto dos niveles para una marca/web por workspace. No introduciría `clients` y `projects` ahora. Antes de agencias hay que resolver grants, titularidad y acceso; un UUID independiente no implementa transferencia (M06).
2. **Superficies:** ChatGPT UI + AIO es una hipótesis razonable, sin evidencia suficiente para afirmar que son las dos superficies más vistas por estas pymes españolas. No impongo Gemini. Mantengo dos superficies solo tras prueba ES/es; no acepto el experimento ±20 puntos como criterio automático para pasar de 3 a 5 (M03).
3. **Snapshots:** sí, snapshot de cada informe es compatible con mi objeción a replicar todo el histórico. `05:193` atribuye «ninguna» tabla a Codex; debe decir que rechazaba el snapshot genérico, no este caso (M08).
4. **Reservas:** faltan unidad/moneda, cargos de reintento, consumo parcial, expiración en vuelo, fail-closed, tope de proveedor y coste incierto. Guardar ID no cierra el hueco antes de persistirlo (B04/B07).
5. **Auditoría:** 30 páginas con presupuesto total y sin render de cada página es técnicamente acotado y compatible con mi veto al crawler exhaustivo. Tiene coste real y no se vuelve trivial por ese nombre; reduciría reglas/pantallas antes de financiar un producto amplio. No atribuir a Claude ese mismo matiz: su original excluye auditoría propia (M08).
6. **Primer paso comercial:** mantengo validar pago y utilidad antes de 40–55 jornadas. Se puede entregar diagnóstico asistido sin contratar marketing y con datos licenciados. Cambiaría con ventas repetibles, aceptación del contenido, coste humano medido y renovación voluntaria del seguimiento, no solo interés en servicios.
7. **Estimación:** 57–80,5 es una suma honesta para el alcance amplio; no la acepto como prueba de que ese alcance sea necesario. Hay 30 historias, dependencias abiertas y costes omitidos. Auth multi-organización, siete pantallas y doble canal de captación son recortables; validación de proveedores/operación debe adelantarse. No reutilizar 30–45 j para prometer otra cosa (M09/M10).
8. **Texto a DataForSEO:** solicitud propuesta, no enviada:

   > Estamos desarrollando Visibility Platform, un SaaS de diagnóstico y seguimiento SEO/IA para pymes y agencias. Usaremos Google Organic SERP, incluido AI Overview, y ChatGPT LLM Scraper. Confirmen por escrito si nuestro contrato permite: (a) mostrar resultados, fragmentos, menciones y URLs fuente a clientes autenticados con nuestra marca; (b) entregar informes HTML/PDF descargables y compartibles por esos clientes; (c) conservar respuestas/raw 90 días, observaciones y citas normalizadas 24 meses y agregados/informes mientras dure la relación contractual, indicando qué puede conservarse tras cancelación; y (d) calcular y comercializar métricas derivadas e informes para agencias y sus clientes. Indiquen atribución requerida, límites de redistribución/exportación, borrado, uso de marcas y derechos/restricciones de las fuentes de origen, además del alcance de las responsabilidades de los §§7–8 de sus términos. Confirmen endpoints, modos, cuotas, precios aplicables, frescura/caché de repeticiones y soporte de ubicación/idioma en España. Incluyan referencia contractual y DPA aplicable. No revenderemos acceso directo a su API ni credenciales.

   Una respuesta ambigua no cierra D-05. Alinear plazos finales de conservación con M07 y el contrato; pedir vigencia y procedimiento si cambian los términos.

9. **Copia/reutilización:** crypto y transporte email pequeños sí; algoritmo de cola/RLS como patrón adaptado, no bootstrap/migración/fixtures CRM completos. Reescribir identidad de dominio y presupuesto; no reimplementar primitivas criptográficas innecesariamente. Copiar prácticas de deploy/backup tras parametrización y ensayo. Retrasaría crypto OAuth hasta el conector si ningún secreto persistido P0 lo necesita (M08/M13).
10. **Qué falta del original:** aprobación de la muestra/panel antes de afirmar comparativa útil, revocación y borrado desde el piloto, empresa invitada que no ve otros clientes de agencia, configuración exacta de cada ejecución, pricing desconocido que detiene gasto y validación comercial anterior al portal completo. Están presentes como intenciones, pero no cerrados en datos, contratos y pruebas.

## 10. PROPOSED CHANGES — por archivo

No se han aplicado estos cambios a `00`–`12`; son el encargo concreto para la versión 2.

| Archivo | Cambios solicitados | Prioridad / hallazgos |
|---|---|---|
| `README.md` | Actualizar enlace/estado de revisión y declarar versión propuesta con REQUEST CHANGES; distinguir capacidades documentadas de probadas. No declarar aprobación ni firma del owner | Alta, M08 |
| `00-analysis-comparison.md` | Corregir atribuciones de auth, snapshots, exclusión del crawler y estimaciones; registrar qué es decisión nueva. Resolver GSC P0 de la matriz frente a P1 del alcance | Alta, M08/M11 |
| `01-product-vision.md` | Hipótesis de valor autónomo y renovación sin servicios, marca/zona antes de medir, promesa de plazo condicionada, descuento definido; eliminar afirmaciones universales de competencia/licencias sin evidencia | Alta, M02/M04/M10 |
| `02-prd.md` | Unificar estados/errores/roles y catálogo de reglas; orden y fulfillment; fórmula única de score; denominadores AIO; fracciones sin falsa significación; campo/lab, reauditoría y criterios de baja operativa | P0, B01–B08/M03/M05/M07/M11/M12 |
| `03-mvp-scope.md` | Elegir P0a/P0b cerrado por dependencias, recortar rutas/agencia; mantener aislamiento/operación desde primera venta, factura y procedimiento de baja desde P0. Seguimiento completo solo cuando P0b exista | Alta, M09/M10/M13/S01–S06 |
| `04-architecture.md` | Contexto autorizado y separación de roles DB; fases submit/poll y continuaciones transaccionales; leases; presupuesto exacto; entrega duradera; render seguro y volumen/backup; eliminar promesa de migrar solo con pg_dump | P0, B04/B07/B08/M06/M13 |
| `05-data-model.md` | Orden anónima; tokens de acceso; consumo/asignación de derechos; unidad/moneda; config/cohorte/panel inmutables; estados de captura/AIO; claves de muestra/rollup; entrega por destinatario, FK de purga y versiones de informe; campos necesarios de reglas/solicitudes | P0, B01/B03–B07/M07/N01 |
| `06-api-contracts.md` | Identidad y destino autenticados, no por email; `payment_status` y éxito asíncrono; contratos submit/poll; eventos a jobs en commit; ámbito de tokens; endpoint/acción de activación/pausa coherente; uniformar metadatos con 05/08 | P0, B01–B05/B07/M12 |
| `07-user-flows.md` | Rehacer flujo orden→pago→reclamación→auditoría, marca/panel, pantalla de preparación parcial, activación única, pausa/cancelación manual; informes de lectura vs primer acceso; una matriz de permisos; fotos técnicas fechadas | P0/alta, B01–B03/M02/M04–M06/M12 |
| `08-provider-strategy.md` | Sustituir UNVERIFIED solo donde §8 aporta fuente; distinguir `sources`/`search_results`, parámetros y falta de país efectivo; confirmar licencia también H2; CrUX opcional, OAuth Testing 7 días; proveedores futuros siguen pendientes | Alta, M01–M04/M11 |
| `09-cost-model.md` | Corregir recargo AIO y modos urgentes, unidad exacta y FX explícito; actualizar 57–80,5 j; añadir amortización/CAC/churn y tiempo onboarding; separar EUR neto/IVA y USD. Reestimar escenarios y descuentos sin llamar validada a la mezcla C | Alta, B04/M02/M10 |
| `10-implementation-backlog.md` | 30 historias; matriz de §7, DAG cerrado y dependencias reales; separar normalización de scheduler; H1 tras PDF y H2 tras admin/alertas/restore; historias de landing pagada, primer acceso, ajustes/activación y baja; redacción de determinismo/fallos | P0, B01–B08/M09/M13/N01 |
| `11-risks-and-open-decisions.md` | D-05 bloquea cobro con datos redistribuidos; D-08 exige política antes de agencias aunque UI de transferencia sea P2; D-11 reestimado; registrar límites de latencia, caché/repeticiones, facturación y borrado del piloto | Alta, M01–M03/M06/M07/M09/M10 |
| `12-adr.md` | Mantener 001–003 y dos niveles; revisar 004–010 por copia/permisos/jobs/método, 011 por render/retención, 012 por consumo/fulfillment, 013 por límites, 015–016 por restauración/purga. Mantener PROPUESTO hasta comprobar cierres | P0/alta, B01–B08/M01–M13 |

### Contradicciones de vocabulario que debe resolver esa pasada

- `audits`: `awaiting_payment/running/completed/partial` de `07:26–51`, `observing/snapshotting/done` de `05:59` y `sampling/reporting` de HU-12. Si la orden vive fuera de `audits`, retirar `awaiting_payment` de auditoría.
- `payments`: `paid` en `05/06` frente a `succeeded` en RF-A02/HU-32; `audit_once`, `audit_single` y `audit` para un mismo plan.
- Runs: por superficie en RF-B07 frente a run multisuperficie en `05`/HU-20; `budget_blocked` ausente en enum; `audit_baseline` frente a `kind=audit`.
- Observación: `completed/failed` de fórmula frente a `ok/provider_error/empty/timeout` de esquema; faltan `has_answer`, `engine_version`, `effective_country` y referencia raw acordada.
- Findings/páginas: faltan campos explícitos exigidos (`category`, `rule_version`, campos hreflang/OG, cobertura y truncado); solicitudes no guardan `report_id` y sus tipos discrepan.
- Límites de fetch: 2 MB/5 MB, concurrencia 4/1, puertos restringidos/arbitrarios. Enlace: 72 h/7 días, `token/sig`, 410/403. Elegir valores únicos y casos de prueba.

Estas incoherencias no requieren una plataforma de schemas nueva: un diccionario canónico breve y referencias a él bastan.

## 11. Cierre y veredicto

Apoyo el monolito independiente, PostgreSQL, dos niveles de tenancy, capturas compradas y separación de metodologías. No apruebo ejecutar la versión actual como backlog listo: B01–B08 afectan al contrato y a garantías centrales. M01, M02, M07, M10 y M13 también deben cerrar sus gates antes de cobrar el piloto; las partes P1 de M06/M11 pueden resolverse antes de abrir agencias/OAuth.

Para nueva revisión: versión 2 con respuesta por ID, contratos/diagrama/esquema coherentes y matriz de aceptación actualizada. La evidencia contractual, de cuenta y de carga que no pueda obtenerse todavía debe conservar estado pendiente y su gate, sin declararla resuelta por mocks. La firma del owner y autorización de implementación siguen separadas de esta revisión. El health local del workspace de referencia conserva `SAFE TO START NEXT WORK: UNKNOWN`; esta revisión documental no modifica ese estado ni autoriza despliegues.

**Firma del revisor:** Codex — 2026-10-25. Sin firma de aprobación del owner.

**REQUEST CHANGES.**
