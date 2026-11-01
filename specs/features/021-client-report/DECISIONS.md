# Decisions: Informe para el cliente con resultados en buscadores

## Decision log

### D001 - El informe reutiliza los resúmenes del producto

**Date:** 2026-11-01

**Status:** Accepted

**Context:** Codex pide que cifras y estados coincidan con la interfaz.

**Decision:** `createReport` llama a `summarizeSearchConsole` y `summarizeGoal`.

**Reasoning:** una sola verdad; el informe no puede contradecir al resumen.

**Consequences:** el HTML congela lo que esos resúmenes devuelven ese día.

### D002 - El cliente nunca ve fallos técnicos

**Date:** 2026-11-01

**Status:** Accepted

**Context:** `reason` y `lastFailure` pueden incluir el email de la cuenta de servicio e instrucciones para el operador.

**Decision:** el informe solo distingue medido, sin impresiones y no medido, con frases propias.

**Reasoning:** es un documento para el propietario.

**Consequences:** un fallo de lectura se ve como «pendiente de medir»; el operador lo ve en Configuración.

### D003 - Fuentes dentro del documento

**Date:** 2026-11-01

**Status:** Accepted

**Context:** D-15 proponía instalar fuentes en la imagen de despliegue, que aún no existe.

**Decision:** Geist y Geist Mono en base64 en la hoja de estilos.

**Reasoning:** el documento sigue autosuficiente y se ve igual en cualquier sistema.

**Consequences:** cada HTML guardado crece; se acepta.

### D004 - Sin acciones de seguimiento

**Date:** 2026-11-01

**Status:** Accepted

**Context:** El doc 19 pedía acciones hechas y pendientes «si existe la 019», y pyme primero la deja fuera.

**Decision:** las recomendaciones priorizadas siguen siendo la lista de trabajo.

**Reasoning:** el informe describe un diagnóstico, no un seguimiento.

**Consequences:** cuando exista seguimiento, se añadirá como apartado.
