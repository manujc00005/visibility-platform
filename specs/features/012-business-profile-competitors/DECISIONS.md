# Decisions: Perfil de negocio y detección asistida de competidores

## Decision log

### D001 - Vía gratuita, API en el backlog

**Date:** 2026-10-31

**Status:** Accepted

**Context:** No hay ninguna clave de proveedor. La opción recomendada era la API de Claude con búsqueda web, unos 0,10–0,30 $ por detección según una estimación sin medir.

**Decision:** el responsable eligió la vía gratuita: «Dejalo la A en el backlog y vamos por la gratis». La app propone el perfil, genera la pregunta y el operador pega la respuesta.

**Reasoning:** mantiene el criterio de la 001 de empezar por lo gratuito.

**Consequences:** la detección no es automática. BL-08 conserva la opción de pago. AC-018 depende del operador.

### D002 - El perfil vive en su propia tabla

**Date:** 2026-10-31

**Status:** Accepted

**Context:** La ficha alimenta prompts y mediciones, y una columna nueva obligaría a tocar su alta y edición.

**Decision:** tabla `geo_business_profiles` 1:1 con la empresa, opcional.

**Reasoning:** sin perfil todo sigue como en la 001, y borrar la empresa lo borra en cascada.

**Consequences:** `contextOf` recibe el perfil, y la publicación lo relee bajo el bloqueo de empresa.

### D003 - Propuesta determinista sin persistir

**Date:** 2026-10-31

**Status:** Accepted

**Context:** Sin LLM no se entiende el negocio: solo se detectan señales.

**Decision:** reglas fijas sobre portada y JSON-LD que rellenan el formulario con sus motivos. Solo se guarda lo que el operador confirma.

**Reasoning:** evita presentar una suposición como dato. Una lectura de la portada propia, pedida por el operador, no necesita la guardia de robots, igual que `fetchPageHead` en la 001.

**Consequences:** el resultado es un borrador. Hay que probar las reglas con la web real.

### D004 - Formato de línea con prefijo

**Date:** 2026-10-31

**Status:** Accepted

**Context:** Copiar el texto formateado de ChatGPT pierde negritas y viñetas, que son lo que usa `extract`.

**Decision:** la pregunta pide un bloque de código con `COMPETIDOR | Nombre | web | tipo | zona | motivo`. `extract` lo lee primero y sigue admitiendo texto libre.

**Reasoning:** es legible, resiste el copiado y no exige JSON válido.

**Consequences:** la línea de plantilla se ignora para no crear un candidato falso.

### D005 - El tipo es una afirmación que corrige el operador

**Date:** 2026-10-31

**Status:** Accepted

**Context:** ChatGPT declara el tipo y nada lo demuestra.

**Decision:** se guarda como `competitor_kind` en la sugerencia y `kind` en el competidor. Es editable al aceptar y nunca es un factor `matched`.

**Reasoning:** la pregunta y la respuesta no son evidencia sobre un candidato (001).

**Consequences:** el orden usa el tipo, pero la confirmación sigue exigida.

### D006 - La zona no aplica en mercados internacionales

**Date:** 2026-10-31

**Status:** Accepted

**Context:** El usuario pide tener en cuenta «si es importante la zona o no».

**Decision:** nuevo estado de factor `not_applicable`, solo en `international`. No cuenta para el orden, no pide revisión y no excluye.

**Reasoning:** `unknown` obligaría a revisar algo irrelevante.

**Consequences:** interfaz y catálogos añaden ese estado. Las filas antiguas no lo tienen.

### D007 - Limpieza por dato, no por código

**Date:** 2026-10-31

**Status:** Accepted

**Context:** «Competidor Ejemplo» es una fila concreta de `dev`.

**Decision:** archivarla con el mismo efecto que el botón de quitar. Sin lista de nombres de prueba en el código.

**Reasoning:** archivar es reversible, y una lista de nombres no generaliza.

**Consequences:** el aviso de competidor inaccesible (FR-013) cubre casos parecidos en el futuro.

### D008 - Correcciones de la auditoría previa

**Date:** 2026-10-31

**Status:** Accepted

**Context:** La auditoría independiente encontró huecos antes de implementar.

**Decision:** los tipos se leen con `formData.getAll`; la propuesta recibe el formulario para no perder lo escrito; 5 candidatos pedidos, igual que tarjetas; 3 MB en la lectura porque superar el límite falla; `allowRequest` impide salir del dominio propio; se corrige la lectura de `areaServed` como objeto en `page-head.ts`, necesaria para la zona; se añade un lector local de `hreflang`.

**Reasoning:** cada punto cambiaba el comportamiento observable o rompía un requisito.

**Consequences:** detalle en `ANALYSIS.md` y en los FR afectados.

### D009 - Lectura de portadas de candidatos hasta 1 MiB

**Date:** 2026-10-31

**Status:** Accepted

**Context:** En la prueba real, cyberclick.es (404 KB descomprimidos) quedó «Web sin comprobar»: el fetcher falla al superar el límite de 256 KiB de la 001, sin devolver lo leído, aunque su `<head>` ocupa 37 KB.

**Decision:** subir `PAGE_HEAD_LIMITS.maxBytes` a 1 MiB. Sustituye ese límite de la 001. Tiempo, peticiones y concurrencia no cambian. El presupuesto total sigue siendo el límite por 25 intentos.

**Reasoning:** cambiar una constante basta para los casos reales, sin añadir truncado al fetcher compartido.

**Consequences:** una portada de más de 1 MiB sigue quedando sin comprobar, con aviso. El tope teórico por extracción sube a 25 MiB.
