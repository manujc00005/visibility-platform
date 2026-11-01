# Decisions: Inicio y panel de fuentes de datos

## Decision log

### D001 - El panel de fuentes vive en la edición de la empresa

**Date:** 2026-11-01

**Status:** Accepted

**Context:** Codex pide un apartado «Fuentes de datos» por empresa; el resumen es del propietario y no existe aún una pantalla «Configuración» (017).

**Decision:** sección bajo el formulario de `/workspaces/[id]/edit`.

**Reasoning:** es la única pantalla de operador por empresa que ya existe; el módulo puro no depende de dónde se pinte.

**Consequences:** la 017 lo moverá a «Configuración» sin tocar `summarizeSources`.

### D002 - El panel mapea; no recalcula

**Date:** 2026-11-01

**Status:** Accepted

**Context:** Cada fuente ya tiene su `summarize*` con estado, motivo y fallo.

**Decision:** `summarizeSources` recibe esos resúmenes y solo elige etiqueta, tono, fecha y texto de «qué hacer».

**Reasoning:** una sola verdad por fuente; el panel no puede contradecir a la sección.

**Consequences:** la página de edición carga lo mismo que la página «Google» y el resumen.

### D003 - Las instrucciones de configuración conservan el nombre de la variable

**Date:** 2026-11-01

**Status:** Accepted

**Context:** Codex (hallazgo 11) vio variables en el recorrido de IA. Las secciones de la página «Google» también nombran `GSC_SERVICE_ACCOUNT_JSON` y `BING_WEBMASTER_API_KEY`, pero en pasos de configuración dirigidos a quien configura.

**Decision:** se retiran del formulario de medición en IA; se mantienen en las instrucciones de configuración y en los mensajes de configuración no válida.

**Reasoning:** el operador necesita el nombre exacto para configurar; el propietario no ve esas secciones hasta la 017 y el acceso por cliente (Fase 5).

**Consequences:** AC-005 limita el `grep` a `geo.providerStatus`.

### D004 - Revisiones de cierre: qué se aplicó y qué no

**Date:** 2026-11-01

**Status:** Accepted

**Context:** Revisión de conformidad («Pass con menores») y de frontend/QA («Reject» por tres hallazgos medios, sin altos) sobre `8fcf2d0`.

**Decision:** aplicado en `054d47e`: `SearchConsoleSummary.configWarning`, igual que Bing y GA4, para que el panel avise de una credencial retirada o rota sin perder la captura (esto era también el seguimiento de la 003 D007); «última lectura correcta» de PageSpeed solo con auditoría que midió la velocidad; la fila de IA no pone la disponibilidad del proveedor automático en «qué hacer» (ya va en «propiedad o proveedor»); `isActivePath` sin la rama de la raíz, que mi cambio dejó sin llamante; `/admin/status` con «Estado del sistema» como `h1`; retirados los campos de configuración sin uso de `SourcesInput`; pruebas de textos sin variables, IA medida sin automático, PageSpeed parcial con fecha y estructura del panel. La SPEC se alinea con lo construido (FR-004, FR-005, FR-006, aviso de configuración, catálogo `home`). No aplicado: cargar el panel bajo `Suspense` (riesgo aceptado en el PLAN; la página de edición es de operador) y renombrar `home.*` a `admin.status.*` (solo nombre; `home.description` sigue en uso).

**Reasoning:** los tres medios hacían que el panel dijera algo distinto de la sección o de la columna; el resto es código muerto creado por este cambio o texto de la spec.

**Consequences:** el tono `good` del panel significa «la fuente funciona», no un veredicto; queda escrito en la cabecera del módulo.
