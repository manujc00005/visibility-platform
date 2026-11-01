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

**Decision:** el informe solo distingue medido, sin impresiones y no medido, con frases propias. Llama a `summarizeSearchConsole` sin credencial y filtra las notas del objetivo dirigidas al operador.

**Reasoning:** es un documento para el propietario.

**Consequences:** un fallo de lectura se ve como «pendiente de medir»; el operador lo ve en Configuración.

### D003 - Fuentes dentro del documento

**Date:** 2026-11-01

**Status:** Accepted

**Context:** D-15 proponía instalar fuentes en la imagen de despliegue, que aún no existe.

**Decision:** Geist y Geist Mono en base64 en la hoja de estilos.

**Reasoning:** el documento sigue autosuficiente y se ve igual en cualquier sistema.

**Consequences:** cada HTML guardado crece; se acepta. La vista previa necesita `font-src data:`: amplía el CSP solo a fuentes en línea, sin ninguna petición. El pie es un documento aparte: declara las fuentes de nuevo y solo dibuja Geist porque la página ya la cargó. `→` y `≤` quedan fuera del subconjunto latino y usan una fuente del sistema. En Linux, sin `text-rendering: geometricPrecision`, Chromium redondea el avance de cada letra: el texto se separa de forma irregular y cambian los saltos de línea. Por eso la propiedad está en el documento y en el pie.

### D004 - Sin acciones de seguimiento

**Date:** 2026-11-01

**Status:** Accepted

**Context:** El doc 19 pedía acciones hechas y pendientes «si existe la 019», y pyme primero la deja fuera.

**Decision:** las recomendaciones priorizadas siguen siendo la lista de trabajo.

**Reasoning:** el informe describe un diagnóstico, no un seguimiento.

**Consequences:** cuando exista seguimiento, se añadirá como apartado.

### D005 - Las capturas de un dominio anterior se señalan, no se bloquean

**Date:** 2026-11-01

**Status:** Accepted

**Context:** La revisión de seguridad señala que, si se edita el dominio de una empresa, las capturas anteriores salen como datos de «esta web».

**Decision:** la línea de fuente nombra la propiedad leída, para que el operador lo vea al revisar. Comparar propiedad y dominio queda como deuda (D-41), porque afecta también a la interfaz.

**Reasoning:** el cambio correcto es común a todos los resúmenes, no propio del informe.

**Consequences:** hasta entonces, el riesgo depende de que el operador revise el informe antes de entregarlo.
