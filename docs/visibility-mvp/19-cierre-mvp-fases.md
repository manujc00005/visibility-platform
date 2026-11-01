# 19 — Cierre del MVP: contraste de la auditoría de Codex y fases de trabajo

**Fecha:** 2026-11-01. **Estado:** en ejecución. Fases A y B hechas (specs 013–017); la 002 sigue abierta por su comprobación humana. Este documento manda sobre el orden de trabajo del cierre; el 16 registra lo cerrado.

**Fuentes contrastadas:** `auditoria-mvp-visibility-platform-2026-11-01.md`, `auditoria-fuentes-metricas.md` y `plan-cierre-mvp.md` (Codex, solo navegador, sin leer código), contra el código en `main` (`51dcf98`), el roadmap 16 (§6 deuda, §9 backlog), el doc 17 (§7 limitaciones, §9 siguientes pasos), `PRODUCT.md` y el estado de las specs 001–012.

## 1. Veredicto general

Codex acierta en lo que vio y se equivoca poco; su mayor aportación no es descubrir fallos nuevos sino **subir de prioridad cosas que el proyecto ya tenía apuntadas como P1 o deuda** y que nunca se ejecutaron. De sus 15 hallazgos, 9 ya estaban registrados en el 16 o el 17. Dos de sus recomendaciones metodológicas (totales agregados de Search Console, periodos comparables) **ya están implementadas** y él mismo avisa de que no verificó la implementación.

Hay **una discrepancia de premisa** que no es un bug y que Codex presenta como recomendación: propone cerrar «un MVP de trabajo para agencias con un resumen sencillo para el cliente». `PRODUCT.md` y `03-mvp-scope.md` dicen lo contrario: propietario de pyme primero, agencia como P1 secundario. Las fases A y B de abajo valen para los dos públicos; la fase C (cartera, acciones, informe mensual) solo tiene sentido si el owner acepta el giro. Esa decisión es del owner y hay que tomarla antes de abrir la fase C, no antes de empezar.

Sobre su estimación (16–26 días): la dio sin leer código. Tras leerlo, la fase A es más pequeña de lo que supone (presentación y una migración) y la fase C es más grande (tres funcionalidades nuevas sin spec).

## 2. Contraste hallazgo a hallazgo

| # | Hallazgo de Codex | Veredicto | Evidencia en el repo | Ya registrado |
|---|---|---|---|---|
| 1 | Datos de prueba («[RESPUESTA DE PRUEBA]») de Olessium cuentan en resumen, GEO y comparativa | **Correcto.** `geo_runs` no tiene campo de origen; `summarizeAi` toma la última run usable sin distinguirla; `build-report.ts` imprime la sección GEO con esa run | `src/modules/geo/schema.ts` (sin `origin`), `src/modules/overview/ai.ts`, `src/modules/reports/build-report.ts:230` | Sí: 16 D-23; 17 §7 («demostración identificada por empresa, no por medición») y §9 («campo de origen en `geo_runs`, P1») |
| 2 | «Visibilidad en Google: Bien» resume salud técnica con cero impresiones | **Correcto.** La tarjeta usa el veredicto de la auditoría de portada (`t.seoVerdict[tone]`) bajo el título «Visibilidad en Google»; Search Console solo aporta una línea de texto (`gsc.cardLine`). La spec 002 lo definió como «proxy honesto mientras Search Console no esté conectado» (002 §Desired behavior, punto 3, y cabecera de `overview/seo.ts`); desde la 003 sí está conectado y la condición ya no se cumple | `src/app/workspaces/[id]/page.tsx` `SeoCard`; `src/modules/overview/seo.ts` cabecera; `specs/features/002-dashboard-overview/SPEC.md:41` | Parcial: 16 D-31 (Search Console a cero sin estado vacío) |
| 3 | Estados IA incoherentes: «Parcial» en GEO, «Completada» y «3 de 3 (100 %)» en el detalle, «Recogida» con «Sin respuesta» | **Correcto en la presentación, no en el modelo.** El modelo separa bien tres etapas (recogida → respuesta → mención, Codex M03) y `isCompleteResult` excluye la respuesta vacía del denominador. El detalle de la run no muestra ese estado ni la fracción `answers`; destaca `capture` (recogidas/previstas) como primera cifra | `src/modules/geo/metrics.ts`; `src/modules/overview/ai.ts` `isCompleteResult`; `src/app/workspaces/[id]/geo/runs/[runId]/page.tsx` (tarjetas `mentions/cites/coverage/capture`) | No |
| 4 | Una respuesta produce «1 de 1 (100 %)» y una «Cuota» del 50 % | **Correcto.** `fraction()` añade el porcentaje siempre que `n > 0`; la tabla «Cuota» divide `k / total` sin aviso de muestra. La página GEO sí avisa (`sample`); el detalle no | `src/modules/geo/presentation.ts` `fraction`; `runs/[runId]/page.tsx` tabla `shareOfVoice` | No |
| 5 | La lista de empresas no sirve para monitorizar una cartera | **Correcto.** Cinco columnas de registro, sin estado de fuentes ni resultados | `src/app/workspaces/page.tsx` | No. Es funcionalidad nueva y depende de la decisión de público (§1) |
| 6 | No se ve un recorrido de conexión verificable | **Parcial.** No hay apartado «Fuentes», pero cada fuente sí distingue `not_configured`, `invalid_config`, `no_data`, `error`, `ok` y explica el motivo con la cuenta a la que hay que dar permiso (`no_access` incluye el email). La conexión es por cuenta de servicio del operador y la propiedad se elige por dominio: no existe OAuth por cliente **por decisión** (BL-02/03/04, Fase 5) | `src/modules/search-console/summary.ts`, `src/modules/analytics/summary.ts` `failureText`; `collect.ts` `pickProperty` | Sí: 16 §9 BL-02–BL-04 |
| 7 | La página SEO reúne demasiadas tareas | **Correcto.** Nueve secciones en una ruta: Search Console, búsquedas seguidas, Bing, Analytics, competidores, salud, áreas, problemas, Lighthouse, histórico | `src/app/workspaces/[id]/seo/page.tsx:147-324` | No |
| 8 | Las tarjetas del resumen tienen demasiado texto | **Plausible, sin contraste con usuarios.** El doc 17 §8 dejó pendiente la comprobación humana (AC-018) y nunca se hizo; la de Codex es la primera lectura externa y apunta en esa dirección | `docs/visibility-mvp/17-dashboard-product-design.md` §8 | Sí: 002 AC-018 pendiente |
| 9 | Las acciones de actualización se solapan | **Correcto, menor.** Seis acciones distintas (auditoría, 3 «Traer datos», comparar, medir IA) sin texto de alcance común | acciones en `src/app/workspaces/[id]/**/actions.ts` | No |
| 10 | La portada es una pantalla interna de desarrollo | **Correcto.** Muestra estado de BD y fases del roadmap | `src/app/page.tsx` | No, pero es trivial |
| 11 | Configuración IA manual y con variables internas visibles | **Correcto.** Los textos nombran `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` y `GEO_MONTHLY_BUDGET_USD`. La captura asistida es la vía elegida (BL-01 aparcado) | `src/i18n/messages/es.ts:1163-1164` | Parcial: 16 §9 BL-01 |
| 12 | «AEO» promete análisis de contenido que no existe | **Correcto en el nombre, no en el fondo.** El bloque ya lleva la advertencia («No hemos analizado si tu web responde estas preguntas») y la spec 002 AC-016 lo exige; solo sobra la palabra «oportunidades de contenido» en el título | `src/i18n/messages/es.ts:1364-1372` | Sí: 17 §7 |
| 13 | La comparativa tiene muchas métricas y los competidores viven en configuración IA | **Correcto.** El enlace «gestionar» apunta a `geo/setup#competitors` | `seo/page.tsx:165` | No |
| 14 | No hay objetivo comercial por empresa ni recepción verificada | **Correcto.** La 008 lista eventos clave y calcula la parte orgánica; nadie elige cuál es «la conversión» de esa empresa | `src/modules/analytics/summary.ts` `keyEventsOf` | No. Funcionalidad nueva |
| 15 | No hay ciclo de seguimiento (responsable, estado, verificación, anotaciones) | **Correcto.** No existe ninguna tabla ni vista de acciones | — | No. Funcionalidad nueva |
| 17 (plan) | Acceso y separación de clientes sin comprobar | **Correcto y ya conocido.** Sin autenticación; las acciones de servidor gastan cuota con credenciales del operador | 16 D-03, D-26, BL-07 | Sí |
| 13 (plan) | Actualización recurrente sin verificar | **Correcto.** No hay cron, cola ni `vercel.json`; todo es manual | `grep` sin resultados | Sí: 16 Fase 6 pendiente |
| 16 (plan) | PDF sin inspeccionar | **Prudente.** El PDF existe y se verificó byte a byte en la Fase 3, pero incluye la sección GEO y por tanto hoy imprimiría la run de prueba (hallazgo 1) | `build-report.ts:377` | Sí: 16 §8 Fase 3 |

### 2.1 Lo que Codex recomienda y ya está hecho (auditoría de fuentes y métricas)

| Recomendación | Estado en el código |
|---|---|
| 3 · Últimos 28 días completos frente a los 28 anteriores, con fecha final por fuente | Hecho: `periodsFor` en `search-console/collect.ts` (28 días, 3 de retardo) y el equivalente en GA4; cada bloque muestra su periodo |
| 5 · Totales con la consulta agregada, no sumando filas | Hecho: `collectSearchConsole` pide `dimensions: []` para totales y segmentos; las tablas de consultas van aparte |
| 2 · No dividir eventos GA4 entre clics de Search Console | Cumplido: `organicShare` es orgánico/total dentro de GA4; no hay ninguna tasa cruzada |
| 7 · GEO como muestra reproducible (pregunta, proveedor, idioma, localización, fecha, respuesta, enlaces; conjunto estable) | Hecho: `GeoRunConfig` congelada y `methodologyKey`; `compareRuns` exige misma clave y mismas preguntas |
| 7 · El fallo no equivale a ausencia de marca | Hecho en el modelo: `unanswered` queda fuera de `promptCoverage` y el resumen lo dice. Falla solo en el detalle de la run (hallazgo 3) |
| 6 · «Solo portada» visible junto al aprobado técnico | Hecho en el detalle y el informe; **no** en la tarjeta del resumen (hallazgo 2) |
| 8 · Comprobar insights IA oficiales de Google y Bing antes de más scraping | Pendiente, P1; nada en código. Coincide con BL-05 |
| 10 · Business Profile solo si el nicho depende de Maps | Pendiente, P2; coincide con 03-mvp-scope (Places API P2) |

### 2.2 Donde Codex se queda corto o se equivoca

- **Reconoce que no pulsó «Traer datos»**: los estados de conexión por fuente existen y son más completos de lo que describe (hallazgo 6).
- **Pide «no sumar filas» de Search Console**: ya se hace. Vale como criterio de aceptación de la matriz de casos, no como tarea.
- **Propone cambiar el público** (agencia primero) sin mencionar que contradice `PRODUCT.md`. Es una decisión de producto, no un hallazgo.
- **Da estimaciones sin leer código** y lo dice. Las fases de abajo las sustituyen.

## 3. Fases de cierre

Criterio de corte: **A y B bloquean enseñar resultados a cualquier persona** (propietario o agencia). **C depende de la decisión de público.** **D es la salida a piloto.** Cada fase se cierra con specs numeradas a continuación de la 012, siguiendo el ciclo del 16 §1 (spec → plan → tareas → código → pruebas → revisión → cierre).

Antes de todo: cerrar o parquear las specs abiertas. La **010** sigue abierta solo por AC-017 (necesita impresiones reales en olessium.com, D-36); la **002** está «In Progress» por AC-018 (comprobación humana, que la fase B absorbe); la **001** está «In Progress» y la 012 la sustituye en la práctica. Decisión propuesta: cerrar la 001 como superada por la 012, dejar la 010 abierta con fecha de revisión, y cerrar la 002 con la fase B.

### Fase A — Confianza en los resultados (P0; Codex 01–05)

Objetivo comprobable: con la base `dev` actual, abrir Olessium y que ninguna cifra, estado ni informe se apoye en la run de prueba; que «Visibilidad en Google» no diga «Bien» con cero impresiones; y que las cifras IA coincidan entre resumen, página GEO, detalle de run e informe.

| Spec | Contenido | Hallazgos | Tamaño |
|---|---|---|---|
| **013 — Origen y estados de la medición IA** | Campo `origin` en `geo_runs` (`real` / `demo` / `test`, migración aditiva con `CHECK`); `summarizeAi`, `compareRuns`, el histórico de `/geo` y `build-report.ts` solo consideran `real`; las `demo`/`test` se ven con rótulo en el histórico. Reclasificar la run de Olessium (D-23) como `test` y la de Buchhandlung Müller (17 D022) como `demo`. Detalle de run: cabecera con el mismo estado que el resumen («terminada · resultado parcial»), fracción de respuestas válidas antes que la de recogidas, sin porcentaje cuando `n < 3` (ajuste de `fraction`), tabla «Cuota» renombrada a «Menciones entre las marcas comparadas en esta muestra» con el denominador escrito. Título del bloque AEO → «Preguntas que conviene revisar» | 1, 3, 4, 12 | Pequeña: 1 migración, 4 módulos, catálogos es/en, pruebas unitarias existentes |
| **014 — Tarjeta Google: posicionamiento y salud técnica separados** | La tarjeta «Visibilidad en Google» toma el estado de Search Console: con impresiones, clics e impresiones con cambio comparable; conectado sin impresiones, «Sin impresiones registradas en este periodo» en neutro; no conectado, «Posicionamiento pendiente de medir». La salud técnica pasa a indicador secundario dentro de la misma tarjeta, titulado «Salud técnica de la portada», con sus conteos. Cierra D-31. Vocabulario compartido de estados (Codex 05) como tabla en el catálogo i18n: `cero observado`, `sin medición`, `pendiente`, `error`, `parcial`, `dato antiguo`, aplicada a las tres tarjetas y a las secciones de la página SEO | 2, 5 (plan) | Pequeña-media: `overview/seo.ts`, `SeoCard`, catálogos, spec 002 actualizada (`/spec-update`) |

Salida de A: la matriz de casos de Codex (plan §19) filas «IA con respuesta de prueba», «Portada correcta sin tráfico», «IA con fallo de una pregunta» y «Sin datos CrUX» pasan en navegador con fixtures.

### Fase B — Recorrido de una empresa (P0/P1; Codex 06–11)

Objetivo comprobable: dar de alta una empresa real nueva y, sin leer documentación ni variables de entorno, saber qué fuente falta, a quién dar permiso, qué objetivo comercial mide y qué hacer primero.

| Spec | Contenido | Hallazgos | Tamaño |
|---|---|---|---|
| **015 — Inicio y fuentes de datos** | `/` redirige a `/workspaces` (el estado del sistema y las fases pasan a `/admin/status`, sin enlace en la cabecera). Nueva sección «Fuentes de datos» en la ficha de empresa (o en `/edit`): una fila por fuente (Search Console, Bing, GA4, PageSpeed/CrUX, IA) con estado, propiedad elegida, última captura correcta, último error y «qué hacer» (hoy ese texto ya existe en `failureText` de cada fuente). Las variables de entorno dejan de aparecer en textos de usuario: `missingCredentials`/`missingBudget` pasan a «La medición automática no está disponible en este entorno» | 6, 10, 11 (variables) | Pequeña-media; reutiliza los `summarize*` existentes |
| **016 — Objetivo comercial por empresa** | Campo en `workspaces` (o tabla `workspace_goals`): tipo (`solicitud`, `reserva`, `compra`, `otro`), nombre comercial, evento GA4 asociado elegido entre `keyEvents.configured`, estado `pendiente de verificar` hasta observar una recepción con valor > 0 en una captura. El resumen muestra «Contactos medidos: k (fuente, periodo)» o «Pendiente de comprobar medición»; nunca suma eventos distintos. Reglas de la 008 (D003 canal `Organic Search`) se mantienen | 14, 7 (plan) | Media: migración, formulario, `analytics/summary.ts`, resumen |
| **017 — Página SEO por preguntas y acciones con alcance** | Reordenar `/seo` en cuatro bloques: Resultados en buscadores (Search Console con Bing como bloque secundario), Consultas y páginas (marca/sin marca, seguidas, cambios de posición), Salud técnica (áreas, problemas, Lighthouse, histórico), Competidores (comparativa con 4–5 columnas y «ver todas»). Cada botón de acción dice qué actualiza: «Analizar portada», «Sincronizar Search Console», «Medir preguntas IA», «Volver a comparar (consume PageSpeed)». Competidores se gestionan desde la ficha de empresa, no desde `geo/setup`. Tarjetas del resumen: título, estado, una o dos cifras, una frase, fecha y enlace; metodología a un `<details>` | 7, 8, 9, 13 | Media: solo presentación, sin cambios de modelo |
| **Comprobación humana (002 AC-018)** | Protocolo del 17 §8 con dos personas ajenas sobre Olessium y la clínica tras la 017. Registrar fallos de comprensión y corregir en la misma spec | 8 | Medio día |

Salida de B: cierre de la 002; matriz de Codex filas «Empresa nueva», «Fuente sin autorización», «Sincronización fallida», «Datos antiguos», «Sin objetivo comercial verificado» pasan.

### Fase C — Seguimiento recurrente (P1; Codex 12–16). **Condicionada a la decisión de público**

Si el owner mantiene pyme-primero (`PRODUCT.md`), esta fase se reduce a C3 y C4. Si acepta agencia-primero, entran las cuatro.

| Spec | Contenido | Hallazgos |
|---|---|---|
| **018 — Cartera de monitorización** | `/workspaces` como bandeja: empresa, contactos medidos, clics y cambio, problema prioritario, estado de fuentes, última captura, origen (real/demo). Filtros «Necesita atención», «Sin configurar», «Datos antiguos». Sin score medio ni suma de porcentajes. Una consulta agregada por empresa en base, no N lecturas completas (17 §7, D023 ya avisa del coste de lectura) | 5, 12 (plan) |
| **019 — Acciones y verificación** | Tabla `actions`: empresa, origen (hallazgo, oportunidad, manual), título, responsable, estado (`pendiente`, `en curso`, `hecha`, `verificada`), fecha objetivo, evidencia; «verificada» solo si una auditoría posterior no repite el hallazgo. Anotaciones con fecha sobre la gráfica de clics; texto fijo «la anotación es contexto, no causa» | 15, 14–15 (plan) |
| **020 — Actualización recurrente o piloto manual declarado** | Decisión explícita: (a) cron semanal por fuente con registro de ejecución, error y recuperación (Fase 6 del 16; exige mover auditoría y capturas a cola, D-12), o (b) piloto manual con registro de minutos del operador por empresa. Recomendación: (b) para el primer piloto, (a) antes de cobrar seguimiento | 13 (plan) |
| **021 — Informe mensual revisado** | Generar el PDF de Olessium y uno sin datos; comprobar que cifras y estados coinciden con la interfaz tras A y B; añadir periodo, acciones hechas y pendientes (si existe la 019), límites. Resolver D-15 (fuentes en Linux) antes de enviarlo a nadie | 16 (plan) |

### Fase D — Verificación y piloto (Codex 17–20)

| Elemento | Contenido | Ya registrado |
|---|---|---|
| **022 — Barrera de acceso** | BL-07: autenticación del operador (una cuenta, sesión firmada) y límite de frecuencia en las acciones que llaman a APIs externas. Sin esto no hay despliegue accesible. Las cuentas de cliente (Fase 5 del 16) siguen fuera del MVP | 16 D-03, D-26, BL-07 |
| Matriz de casos | Las 12 filas del plan de Codex §19 como pruebas de navegador con fixtures rotulados; las que ya pasan tras A y B se marcan, las demás abren una corrección | — |
| Móvil y accesibilidad | 390 px en alta, edición, configuración IA y tablas; foco y lectura de tarjetas con lector de pantalla; contraste del token `--ring` (17 §7) | 17 §7 |
| Piloto | Una agencia (o tres pymes, según decisión) durante dos ciclos; medir tiempo de alta a primer resultado, minutos por revisión, coste de datos, fallos de captura | 03-mvp-scope §criterio de éxito |

## 4. Orden y dependencias

```
013 ─┐
     ├─ A cerrada ─► 015 ─► 016 ─► 017 ─► comprobación humana ─► B cerrada
014 ─┘                                                             │
                                          decisión de público ◄────┘
                                              │           │
                                   pyme-primero        agencia-primero
                                   020, 021            018, 019, 020, 021
                                              └─────┬─────┘
                                                    ▼
                                      022 ─► matriz ─► móvil/a11y ─► piloto
```

013 y 014 son independientes entre sí y pueden ir en paralelo. 016 depende de 015 solo por la sección de fuentes. 022 puede investigarse desde el principio (Codex lo dice y tiene razón) pero no bloquea A ni B porque la app sigue en la máquina del operador.

## 5. Lo que queda fuera (coincide con Codex y con 03-mvp-scope OUT)

Marca blanca, facturación por consumo, más proveedores IA (BL-05), generación de contenido, cambios automáticos en webs de clientes, CRM, score global, crawler más allá de la portada y páginas elegidas, Business Profile hasta validar el nicho, DataForSEO en real (BL-01) y detección automática de competidores (BL-08).

## 6. Decisiones que necesita el owner

1. ~~**Público del MVP**~~: decidido el 2026-11-01, **pyme primero** (`PRODUCT.md`). La fase C se reduce a la 020 y la 021; la 018 (cartera) y la 019 (acciones) quedan fuera del cierre.
2. **Specs abiertas**: cerrar la 001 como superada por la 012; mantener la 010 abierta hasta tener impresiones; cerrar la 002 con la fase B.
3. **020**: piloto manual declarado o cron antes del piloto.
4. **Este documento** pasa a mandar sobre el orden de trabajo (y el 16 §2 lo enlaza) o se integra en el 16.
