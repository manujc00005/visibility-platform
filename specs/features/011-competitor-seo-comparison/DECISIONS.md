# Decisions: Comparativa técnica y de autoridad con competidores

Registradas el 2026-10-31 al planificar. No certifican implementación ni acceso real al proveedor.

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

**Decision:** `toSiteResult` construye el resultado campo a campo, nunca a partir de una copia de `facts`. Guarda estado de acceso (`analyzed`, `robots_disallowed`, `unreachable`, `http_error`), puntuaciones de las cuatro categorías, LCP, CLS y TBT de laboratorio, LCP, INP y CLS reales con `scope` y periodo, recuento de críticos y avisos, y autoridad. No guarda `error`, `key`, `finalUrl` ni títulos de comprobaciones de Lighthouse.

**Reasoning:** FR-009 es una lista cerrada, y construirla campo a campo impide que un dato nuevo de `facts` se cuele.

**Consequences:** los recuentos solo existen con estado `analyzed`. Un sitio inaccesible no aparece con «1 crítico», porque no sería comparable.

### D003 - Contrato de Open PageRank

**Date:** 2026-10-31

**Status:** Accepted

**Context:** la documentación de keywordseverywhere.com, leída el 2026-10-31, fija `POST /v1/domains/bulk`. No documenta la forma de un resultado `found: false`.

**Decision:** una petición con hasta 6 dominios, `include_history: false` y 15 s de límite. Se leen `as_of`, `results[].domain`, `found`, `open_page_rank`, `rank` y `referring_domains`; se ignora lo demás y se aceptan nulos o ausentes en lo no encontrado.

Estados comunes por error:

| Respuesta | Estado |
|---|---|
| Sin clave | `not_configured` |
| 401 | `invalid_key` |
| 403 `address_error` | `ip_not_allowed` |
| 429, `quota_error` o `rate_limit_error` | `quota_exceeded` |
| Cualquier otra, timeout o forma inválida | `error` |

Por dominio: `ok` o `not_found`. Se guarda `as_of`.

**Reasoning:** el cuerpo de un error nunca se guarda, y el mensaje mostrado sale del catálogo, así la clave no puede filtrarse.

**Consequences:** T009 confirma con una llamada real la forma de un dominio no encontrado.

### D004 - Emparejar dominios

**Date:** 2026-10-31

**Status:** Accepted

**Context:** Open PageRank reduce cada entrada a su dominio registrado, y `geo_competitors.domain` puede ser un subdominio. No hay garantía de orden.

**Decision:** se pide `workspace.domain` para la empresa y `domain` para cada competidor. Cada sitio toma el resultado cuyo `domain` coincide o es sufijo tras un punto. Sin coincidencia, `not_found`.

**Reasoning:** evita depender del orden y de la lista `hosts`, que es otra forma de respuesta.

**Consequences:** un subdominio muestra la autoridad de su dominio registrado.

### D005 - Forma en SQL sin función

**Date:** 2026-10-31

**Status:** Accepted

**Context:** la 010 añadió una función plpgsql que su revisión de dominio juzgó innecesaria, y el `EXCEPTION` hubo que quitarlo en `0013`.

**Decision:** CHECK con `jsonb_path_exists` en `strict` e `IS TRUE`, como la 007, solo para `version`, y `sites` como array de 1 a 6. El detalle se valida con Zod al escribir y al leer. Además, `sites` no nulo solo y siempre con `completed`.

**Reasoning:** la forma completa ya la construye y comprueba el código; el CHECK protege lo estructural sin dos fuentes de verdad.

**Consequences:** una fila con detalle ilegible se trata en lectura como aviso (FR-010 y casos límite).

### D006 - Paralelismo y duración

**Date:** 2026-10-31

**Status:** Accepted

**Context:** cada sitio puede tardar hasta 45 s en lecturas y 60 s en PageSpeed, en parte en paralelo.

**Decision:** 3 trabajadores, con el patrón de `geo/competitors/service.ts`, sin dependencia nueva. Antigüedad de captura colgada: 10 minutos, igual que `STALE_RUNNING_AFTER_MS`. Open PageRank se lanza junto a la medición.

**Reasoning:** cada tanda de 3 sitios tarda como mucho unos 105 s, así que 6 sitios rondan los 4 minutos, dentro de la antigüedad. Tres a la vez limita el riesgo con la cuota de PageSpeed, que su documentación no indica.

**Consequences:** acción larga, aceptable con un operador. Hay que revisarla antes de desplegar.

### D007 - Sitios y requisitos para empezar

**Date:** 2026-10-31

**Status:** Accepted

**Context:** FR-016 fija cuándo hay botón, pero la acción es invocable sin él.

**Decision:** el servicio repite esas comprobaciones y responde `not_found`, `not_configured`, `no_competitors` o `already_running`, sin crear fila. La empresa usa `workspace.hostname` para medir y `workspace.domain` para autoridad. Los competidores usan `domain` para ambos.

**Reasoning:** la interfaz no es una barrera.

**Consequences:** sin competidores con web no hay capturas vacías.

### D008 - Tabla con ausencias por fuente

**Date:** 2026-10-31

**Status:** Accepted

**Context:** son 11 columnas de métricas en unos 930 px, y un motivo en cada celda no cabe. Una fuente falla por entero: si falta CrUX, faltan LCP, INP y CLS. La revisión de la 010 pidió roles explícitos al cambiar `display`.

**Decision:** tabla real con encabezados por columna. Cuando una fuente no tiene datos, su motivo ocupa con `colSpan` todas sus columnas. En móvil, cada fila se apila por fuente, con roles explícitos, sin scroll horizontal.

**Reasoning:** cumple FR-012 sin leyendas ni abreviaturas, y el motivo no depende de pasar el ratón.

**Consequences:** el orden de columnas sigue las fuentes: Lighthouse, datos reales, auditoría y autoridad. La posición global se guarda, pero no ocupa columna (FR-011).

### D009 - Tolerancia de la comprobación real

**Date:** 2026-10-31

**Status:** Accepted

**Context:** AC-016 habla de «la tolerancia de una medición puntual» y necesita un número.

**Decision:** CrUX coincide exactamente si la consulta aparte devuelve el mismo periodo. Lighthouse se da por bueno con una diferencia de hasta 15 puntos por categoría frente a PageSpeed consultado aparte para el mismo sitio. Autoridad: igual que la API con la misma fecha `as_of`.

**Reasoning:** una ejecución de Lighthouse varía entre medidas y no es determinista; 15 puntos detecta un mapeo erróneo sin dar falsos fallos.

**Consequences:** si se supera, se repite la medida antes de buscar un fallo. Se registran ambas cifras.

### D010 - Commits y alcance real

**Date:** 2026-10-31

**Status:** Accepted

**Context:** el responsable pidió trabajar de forma autónoma con commits incrementales.

**Decision:** commits locales por tarea, sin subir ni desplegar salvo aprobación. Ningún commit menciona a la herramienta. Si `0014` está ocupada, se usa el siguiente número y se actualizan estos documentos.

**Reasoning:** hay sesiones paralelas sobre el mismo repositorio.

**Consequences:** `production` no se toca. La migración se aplica en `test` y en `dev`, porque la página SEO lee la tabla y sin ella fallaría (D-22).
