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
