# Decisions: Comparativa técnica y de autoridad con competidores

Registradas el 2026-10-31 al planificar y corregidas tras la auditoría de consistencia del mismo día. D002–D009 se concretan; D011–D012 registran las correcciones de acceso y cierre, y D013 las de las revisiones. No certifican implementación ni acceso real al proveedor.

## Decision log

### D001 - Módulo y tabla propios

**Date:** 2026-10-31

**Status:** Accepted

**Context:** `runAudit` escribe en `audits` y solo conoce la web de la empresa. `geo/competitors` trata de sugerencias para la medición en IA.

**Decision:** módulo `src/modules/competitor-comparison` con tabla `competitor_comparisons`, una fila por intento. Reutiliza `collectAuditFacts`, `evaluateAudit` y `listCompetitors`.

**Reasoning:** mantiene FR-008 y da una captura que se lee entera.

**Consequences:** comparar no toca la evolución ni los hallazgos. Los datos de competidores no se mezclan con los de la empresa.

### D002 - Qué se guarda por sitio

**Date:** 2026-10-31

**Status:** Accepted

**Context:** `AuditFacts` lleva títulos, textos y URLs de la web, y `FetchFailure` trae mensajes con URL.

**Decision:** `toSiteResult` construye el resultado campo a campo, nunca a partir de una copia de `facts`. Guarda estado de acceso (`analyzed`, `robots_disallowed`, `unreachable`, `http_error`, `non_html`), puntuaciones de las cuatro categorías, LCP, CLS y TBT de laboratorio, LCP, INP y CLS reales con `scope` y periodo, recuento de críticos y avisos, y autoridad con dominio solicitado/efectivo, alcance y fecha de publicación. Conserva domain/hostname capturados y cumple el contrato de persistencia de SPEC (unidades, valores finitos, ceros válidos, métricas parciales, estados y fechas). No guarda `error`, `key`, `finalUrl` ni títulos de comprobaciones de Lighthouse.

**Reasoning:** FR-009 es una lista cerrada, y construirla campo a campo impide que un dato nuevo de `facts` se cuele.

**Consequences:** los recuentos solo existen con estado `analyzed`; HTML no extraíble, HTTP fallido o sitio inaccesible no se presentan como una auditoría completa. Las métricas se mapean exactamente con fixtures de valores distintos por campo. `parseComparison` usa objetos estrictos al escribir y al leer; los hallazgos y sus textos nunca se copian.

### D003 - Contrato de Open PageRank

**Date:** 2026-10-31

**Status:** Accepted

**Context:** la [referencia API](https://keywordseverywhere.com/openpagerank/docs) y el [OpenAPI](https://openpagerank.keywordseverywhere.com/v1/openapi.json), consultados el 2026-10-31, fijan `POST /v1/domains/bulk`. El score es nullable cuando no se encuentra el dominio; la forma real completa de `found: false` aún debe verificarse en T009.

**Decision:** una petición con hasta 6 dominios, `include_history: false` y 15 s de límite. Sin clave, cero peticiones. Se validan `as_of` y los campos conocidos de cada resultado; `as_of` se mapea a `asOf`, `open_page_rank` a score y `referring_domains` a referringDomains. El resto de campos externos se ignora, sin copiarlos al contrato estricto interno. Un `found: true` requiere score finito 0–10; rank/referentes pueden ser null pero no tener tipos o rangos inválidos. Un `found: false` admite cifras ausentes/nulas y no se transforma en cero. Resultado esperado ausente, emparejamiento ambiguo o cifras inválidas dan `error` para los sitios afectados; los otros resultados válidos sobreviven. Un fallo de envoltorio/HTTP aplica el estado común a todos. El campo `referring_domains` se etiqueta como recuento ponderado del proveedor, no como inventario exhaustivo de enlaces.

Estados comunes por error:

| Respuesta | Estado |
|---|---|
| Sin clave | `not_configured` |
| 401 | `invalid_key` |
| 403 `address_error` | `ip_not_allowed` |
| 429, `quota_error` o `rate_limit_error` | `quota_exceeded` |
| Cualquier otra, timeout o forma inválida | `error` |

Por dominio: `ok`, `not_found` explícito o `error` de resultado. Se guarda `asOf` de la respuesta válida con resultado emparejado; no se inventa fecha o dominio efectivo ante ausencia de respuesta.

**Reasoning:** el cuerpo de un error nunca se guarda, y el mensaje mostrado sale del catálogo, así la clave no puede filtrarse.

**Consequences:** T009 confirma con llamadas reales un resultado encontrado y uno no encontrado, sin guardar cuerpos crudos. Sin esa evidencia la tarea y el cierre siguen pendientes (D012).

### D004 - Emparejar dominios

**Date:** 2026-10-31

**Status:** Accepted

**Context:** Open PageRank reduce cada entrada a su dominio registrado, y `geo_competitors.domain` puede ser un subdominio. No hay garantía de orden.

**Decision:** se pide `workspace.domain` para la empresa y `domain` para cada competidor. Emparejar por igualdad o sufijo con límite de punto, nunca por posición del array: preferir coincidencia exacta y, si no existe, el sufijo más largo no ambiguo. Rechazar duplicados contradictorios. Sin coincidencia, `error` de respuesta incompleta, no `not_found`. Cada resultado emparejado conserva dominio solicitado, dominio efectivo devuelto, `scope: registered_domain` y `asOf`. La UI muestra estos datos, también si el dominio efectivo coincide con el solicitado.

**Reasoning:** evita depender del orden y de la lista `hosts`, que es otra forma de respuesta.

**Consequences:** un subdominio muestra explícitamente la autoridad del dominio registrado, no una autoridad del host. No se consumen `hosts`: en plataformas compartidas puede haber `found: false` en el grafo de dominios aun existiendo dato de host. Se explica «No encontrado en el grafo de dominios» y se prueba este caso; añadir autoridad de hosts queda fuera de alcance.

### D005 - Forma en SQL sin función

**Date:** 2026-10-31

**Status:** Accepted

**Context:** la 010 añadió una función plpgsql que su revisión de dominio juzgó innecesaria, y el `EXCEPTION` hubo que quitarlo en `0013`.

**Decision:** CHECK con `jsonb_path_exists` en `strict` e `IS TRUE`, como la 007, solo para `version`, y `sites` como array de 1 a 6. El detalle se valida con Zod al escribir y al leer. Además, `sites` no nulo solo y siempre con `completed`; `error` nulo salvo `failed`, donde es `internal_error` o `interrupted`; `finished_at` nulo solo con `running`, y en estados terminales no anterior a `started_at`. Restricciones nombradas, sin casteos inseguros de JSON. SQL no certifica el detalle: Zod aplica las identidades, uniones y rangos de SPEC.

**Reasoning:** la forma completa ya la construye y comprueba el código; el CHECK protege lo estructural sin dos fuentes de verdad.

**Consequences:** una fila con detalle ilegible se trata en lectura como aviso (FR-010 y casos límite).

### D006 - Paralelismo y duración

**Date:** 2026-10-31

**Status:** Accepted

**Context:** cada sitio puede tardar hasta 45 s en lecturas y 60 s en PageSpeed, en parte en paralelo.

**Decision:** 3 trabajadores, con el patrón de `geo/competitors/service.ts`, sin dependencia nueva. Antigüedad de captura colgada: 10 minutos, igual que `STALE_RUNNING_AFTER_MS`. Open PageRank se lanza junto a la medición.

**Reasoning:** cada tanda de 3 sitios tarda como mucho unos 105 s, así que 6 sitios rondan los 4 minutos, dentro de la antigüedad. Tres a la vez limita el riesgo con la cuota de PageSpeed, que su documentación no indica.

**Consequences:** acción larga, aceptable con un operador. La cifra de 4 minutos es una estimación, no un SLA; incluye la guardia de D011 dentro del presupuesto compartido de lectura. PageSpeed conserva su reintento existente: hasta 6 ejecuciones lógicas, con más de 6 peticiones HTTP si se reintenta. No se amplían los timeouts. Hay que revisarla antes de desplegar.

### D007 - Sitios y requisitos para empezar

**Date:** 2026-10-31

**Status:** Accepted

**Context:** FR-016 fija cuándo hay botón, pero la acción es invocable sin él.

**Decision:** interfaz y servicio usan el mismo selector puro y comprueban PageSpeed y al menos un dominio competidor distinto del propio después de deduplicar. La empresa tiene prioridad; entre duplicados se elige el primero por `created_at, id` y los demás no generan pendientes. El servicio devuelve `not_found`, `not_configured`, `no_competitors` o `already_running`, sin crear fila ni red en esos rechazos. La empresa usa `workspace.hostname` para medir y `workspace.domain` para autoridad; los competidores usan `domain` para ambos. Se congelan ambas identidades. Cambios posteriores de domain/hostname propios o de id/domain/hostname competidor dejan pendiente la fila actual. Cambiar solo el nombre no invalida cifras, y se conserva el nombre capturado.

**Reasoning:** la interfaz no es una barrera.

**Consequences:** tampoco hay captura si todos los competidores con web duplican a la empresa. La proyección deduplica con la misma política y no atribuye datos históricos al nuevo sitio.

### D008 - Tabla con ausencias por fuente

**Date:** 2026-10-31

**Status:** Accepted

**Context:** son 11 columnas de métricas en unos 930 px, y un motivo en cada celda no cabe. Una fuente puede fallar entera o aportar solo algunas métricas: CrUX puede carecer de INP y Lighthouse de una categoría. La revisión de la 010 pidió roles explícitos al cambiar `display`.

**Decision:** tabla real con encabezados por columna. Solo si una fuente completa no aporta datos, su motivo ocupa sus columnas mediante `colSpan`. Si aporta alguna métrica, cada celda conserva el valor o explica «Métrica no medida». Se conservan ceros realmente medidos (incluidos CLS, score, autoridad encontrada, referentes y recuentos), nunca se usa truthiness para decidir presencia. En móvil cada fila se apila por fuente, con roles explícitos, sin scroll horizontal. Autoridad muestra dominio efectivo/alcance y fecha de publicación; rank/referentes null tienen motivo propio.

**Reasoning:** cumple FR-012 sin leyendas ni abreviaturas, y el motivo no depende de pasar el ratón.

**Consequences:** el orden de columnas sigue las fuentes: Lighthouse, datos reales, auditoría y autoridad. La posición global se guarda, pero no ocupa columna (FR-011).

### D009 - Mapeo exacto y variabilidad entre ejecuciones

**Date:** 2026-10-31

**Status:** Accepted

**Context:** comparar dos ejecuciones distintas de Lighthouse con una tolerancia de 15 puntos podría ocultar categorías intercambiadas. La variabilidad del proveedor y la corrección del mapeo requieren evidencias distintas.

**Decision:** comprobar mapeo exacto campo a campo contra las mismas respuestas que alimentan la captura, con observación temporal saneada de métricas/estados y sin persistir respuestas completas, claves, URLs ni textos de web. Fixtures con valores distintos por categoría detectan intercambios y unidades erróneas. CrUX se compara para mismo identificador efectivo, formFactor PHONE, scope y periodo; autoridad para mismo dominio efectivo y asOf. La segunda ejecución independiente registra sus cifras como evidencia de variabilidad, sin tolerancia que certifique el mapeo ni obligación de igualdad entre ejecuciones distintas.

**Reasoning:** una ejecución independiente no es un oráculo del mapeo. La exactitud de la transformación se comprueba con la respuesta efectivamente utilizada; variaciones posteriores no la invalidan ni la certifican.

**Consequences:** un desacuerdo con la respuesta de origen es fallo a corregir. No repetir medidas hasta conseguir una tolerancia favorable. Una ausencia real se registra como estado, pero no sustituye el positivo de autoridad requerido para cerrar.

### D010 - Commits y alcance real

**Date:** 2026-10-31

**Status:** Accepted

**Context:** el responsable pidió trabajar de forma autónoma con commits incrementales.

**Decision:** commits locales por tarea, sin subir ni desplegar salvo aprobación. Ningún commit menciona a la herramienta. Si `0014` está ocupada, se usa el siguiente número y se actualizan estos documentos.

**Reasoning:** hay sesiones paralelas sobre el mismo repositorio.

**Consequences:** `production` no se toca. La migración se aplica en `test` y en `dev`, porque la página SEO lee la tabla y sin ella fallaría (D-22).


### D011 - Robots antes de cada acceso de portada, solo en la comparativa

**Date:** 2026-10-31

**Status:** Accepted

**Context:** el colector actual sigue redirecciones antes de consultar el robots final y puede llamar a Google aunque ese robots prohíba la portada. Reutilizarlo sin cambios no satisface FR-003; cambiar el modo predeterminado alteraría las auditorías propias fuera del alcance.

**Decision:** añadir una política optativa a `collectAuditFacts` y una guardia por petición de portada en el fetcher seguro. La comparativa la activa para todos los sitios, incluida la empresa; los consumidores existentes mantienen el modo anterior. La guardia comprueba origen y ruta de la URL inicial, cada redirect y fallback HTTP antes de abrir la petición de portada. Usa parseo y matching de robots existentes, cache por origen y el mismo presupuesto absoluto/bytes/peticiones. La descarga de robots usa el fetcher seguro sin la guardia de portada para evitar recursión, y conserva sus validaciones SSRF y límites de redirects. No hay transporte HTTP alternativo ni relajación de DNS/IP/TLS.

**Reasoning:** detectar un robots prohibitivo después de descargar el destino llega tarde. Una política explícita permite corregir la comparativa y verificar a la vez la compatibilidad con los consumidores actuales.

**Consequences:** rechazo por robots deja `robots_disallowed`, PageSpeed/CrUX `skipped` y autoridad independiente. Mantener el tratamiento existente de robots ausente/fallido y probarlo; no inventar reintentos. T000 es requisito previo a capturar. Las regresiones cubren modo anterior, redirección a ruta/origen prohibido, fallback, límites, cache y SSRF; no basta un mock que entregue ya el HTML prohibido.

### D012 - Cierre condicionado y escritura terminal protegida

**Date:** 2026-10-31

**Status:** Accepted

**Context:** cero filas actualizadas con `status = running` puede significar captura cerrada por antigüedad, no solo empresa borrada. La disponibilidad de claves/datos reales condiciona la evidencia, no la implementación.

**Decision:** cerrar siempre por id de captura + workspaceId + status running, tanto en éxito como en fallo. Si no actualiza, releer: solo empresa inexistente devuelve `not_found`; captura terminal o ausente con empresa existente devuelve `capture_closed`. No reabrir ni sobrescribir filas terminales ni actualizar por empresa una captura nueva. Cierre por antigüedad deja failed/interrupted con finished_at. Prueba retenida: cerrar la vieja, iniciar otra y soltar el trabajador viejo.

**Consequences:** T009 y spec-close siguen pendientes hasta cumplir AC-016 completo: positivo real de autoridad y evidencia real de no encontrado, además de PageSpeed/CrUX, navegador, checks y revisiones. Sin cuenta o datos se puede completar el desarrollo con fixtures y not_configured, pero no se declara la feature cerrada ni se rebaja el criterio mediante una nota. No se crean cuentas ni se transmite ninguna clave como parte de esta corrección documental.

### D013 - Correcciones de las revisiones de T009

**Date:** 2026-10-31

**Status:** Accepted

**Context:** las revisiones de seguridad, dominio y conformidad coincidieron en que leer webs de terceros cambia el riesgo de código pensado para webs propias, y en que un sitio podía tumbar la comparativa entera, en contra de FR-005.

**Decision:**
- **Parsers:** `robots.ts` y `sitemap.ts` dejan de usar expresiones con retroceso. Un `robots.txt` o un sitemap hostiles podían colgar el proceso de forma síncrona. El resultado no cambia, lo que una prueba diferencial comprueba frente a la regla anterior, y también beneficia a las auditorías propias.
- **Sitemap:** con la guardia activa, sin portada leída no se pide. Quien nos prohíbe la portada no recibe otra petición, y ese dato se descartaba igualmente. Corrige la redacción de SPEC y D011.
- **Aislamiento:** una excepción al procesar un sitio deja ese sitio como `processing_error`, un acceso nuevo que no finge que la web esté caída. Unas cifras de Google fuera de contrato dejan esa fuente en `error`. `internal_error` queda para fallos del proceso.
- **Duplicados:** se listan aparte, porque FR-001 pide identificarlos y un competidor no debe desaparecer sin explicación.
- **Tabla:** el detalle de cada sitio pasa a su propia fila, para que el nombre accesible de la fila siga siendo corto, y cada `colSpan` lleva `aria-colspan`.
- **Acción:** captura sus errores y el botón también, porque tras minutos de espera un corte de red derribaría la página.
- **Recuentos:** si falta PageSpeed o CrUX, la fila avisa de que el recuento puede salir más bajo. No se recalcula para seguir FR-009.
- **Captura colgada:** se lee como `interrupted` sin esperar al siguiente intento.

**Reasoning:** se corrige lo que causa fallos o accesos que la web no quiere. Lo que solo mejora el cumplimiento fino de robots afectaría también a las auditorías propias y merece su propio cambio.

**Consequences:** quedan aceptados y registrados en el roadmap:
- Un `robots.txt` que responde 5xx, falla o supera 512 KB sigue permitiendo el acceso (D011), aunque RFC 9309 pide no entrar con 5xx.
- El emparejado de grupos de robots es menos estricto que la RFC: no combina grupos repetidos y compara agentes por subcadena.
- Una portada que responde error deja sin PageSpeed ni CrUX, aunque Google podría medirla. La captura real lo dio en hubspot.com.
- La acción bloquea las demás de la página mientras dura, porque Next las encola.
- No hay enfriamiento entre ejecuciones; va con BL-07.
- Una portada anidada muy profunda queda como `processing_error`: `html.ts` sigue siendo recursivo.
- Con la clave real hay que confirmar que `referring_domains` es entero y `as_of` una fecha ISO.
