# Decisions: Tarjeta «Visibilidad en Google»: posicionamiento y salud técnica separados

## Decision log

### D001 - Search Console manda en la tarjeta; la salud técnica va aparte, en la misma tarjeta

**Date:** 2026-11-01

**Status:** Accepted

**Context:** La 002 puso la salud técnica como proxy «mientras Search Console no esté conectado». Codex (hallazgo 2) observó «Bien» con cero impresiones.

**Decision:** el pill y el titular salen de Search Console; la auditoría técnica es un bloque secundario rotulado dentro de la misma tarjeta.

**Reasoning:** mantiene las tres tarjetas y la navegación; el propietario lee primero si le encuentran y después si la portada tiene problemas.

**Consequences:** `summarizeGoogleCard` compone ambas fuentes; `SeoSummary` no cambia.

### D002 - «Medido» en neutro, sin veredicto para clics

**Date:** 2026-11-01

**Status:** Accepted

**Context:** Un semáforo verde sobre clics necesitaría un objetivo o umbral.

**Decision:** con impresiones, pill «Medido» neutro y el cambio como única señal direccional.

**Reasoning:** PRODUCT.md (sin puntuación compuesta; comparaciones honestas); el objetivo por empresa llega en la 016.

**Consequences:** la tarjeta nunca aprueba ni suspende el posicionamiento.

### D003 - `empty` exige ceros en los dos periodos

**Date:** 2026-11-01

**Status:** Accepted

**Context:** GA4 (006) define «Sin visitas» con ambos periodos a cero.

**Decision:** misma regla para Search Console.

**Reasoning:** una caída a cero en el periodo actual con impresiones antes es un cambio que hay que enseñar, no un estado vacío.

**Consequences:** D-31 cerrado; la sección oculta cifras y tablas solo en `empty`.

### D004 - Una tabla de estados; dos excepciones documentadas

**Date:** 2026-11-01

**Status:** Accepted

**Context:** Codex 05 pide vocabulario común; las tarjetas tenían tres juegos de etiquetas.

**Decision:** `overview.states` con ocho claves; rendimiento mantiene «No medida» para `partial`/`not_configured` y IA mantiene «Recogiendo respuestas» y «Sin mediciones».

**Reasoning:** en rendimiento, «Sin configurar» sería falso cuando la causa es cuota o portada ilegible, y doc 17 eligió «No medida» a propósito; en IA, «Analizando» no describe una recogida que depende del operador, y «Sin datos» con preguntas preparadas confunde.

**Consequences:** `cards.ai.status` queda con dos claves; Bing y GA4 no cambian (017).

### D005 - El merge `ccf1e28` y la 014 se integran: Search Console primero, el bloque técnico conserva el nombre del merge

**Date:** 2026-11-01

**Status:** Accepted

**Context:** Mientras se escribía esta spec entró en `main` el merge `ccf1e28` («veredictos honestos y la primera acción arriba»), que resolvía el hallazgo 2 de Codex por otra vía: renombrar la tarjeta a «Tu web, vista por Google» y dejar el veredicto técnico como principal. Preguntado, el responsable eligió la opción recomendada: Search Console primero.

**Decision:** la tarjeta vuelve a llamarse «Visibilidad en Google» con las cifras de Search Console arriba; el bloque técnico toma el nombre del merge, «Tu web, vista por Google», y su escala única de veredictos (Bien / Mejorable / Mal / Con mejoras / Parcial). La franja de «Lo más importante» y el resto del merge se conservan.

**Reasoning:** el éxito definido en PRODUCT.md es que el propietario responda «¿me encuentran en Google?»; el nombre del merge describe exactamente el bloque técnico.

**Consequences:** la SPEC se corrige donde decía «Salud técnica de la portada» como título; los avisos del bloque siguen prefijados «Salud técnica ·».

### D006 - Revisiones de cierre: sin bloqueantes; cambios aplicados y lo que no

**Date:** 2026-11-01

**Status:** Accepted

**Context:** Revisión de frontend/QA (sin bloqueantes; dos huecos de pruebas y cinco menores) y de conformidad («Pass con menores», todos de redacción de la SPEC) sobre `c1511f6`.

**Decision:** aplicados en `4fd5512`: el aviso de intento fallido de Search Console lleva origen («Posicionamiento · …»), el bloque técnico no repite el veredicto bajo los conteos, la sección decide el estado vacío por el estado y no por el periodo, la etiqueta genérica «Sin actividad» se retira por no tener consumidor, y se añaden las pruebas pedidas (configuración no válida, vacío con intento fallido, caída a cero, unidades en singular, bloque técnico analizando o fallido, estructura del estado vacío en `es` y `en`, y que la rama `ok` conserva rejilla y nota de privacidad). La SPEC se alinea con lo construido: separador « · », nombres de `technical.prefix`/`technical.stale`, forma de `summarizeGoogleCard`, `totals` en el resumen, título «Tu web, vista por Google» (D005). No aplicado: ver el titular con cifras a 375 px con impresiones reales, porque ninguna empresa de `dev` las tiene todavía (queda con D-32).

**Reasoning:** cada cambio es pequeño y cierra una ambigüedad de la propia spec; nada amplía el alcance.

**Consequences:** `overview.states` tiene siete claves; las secciones de Bing y GA4 siguen con sus etiquetas (017).

### D007 - La base de pruebas es compartida entre worktrees: dos suites a la vez se rompen entre sí

**Date:** 2026-11-01

**Status:** Accepted

**Context:** Dos pasadas completas de integración fallaron (21 y 60 pruebas, con tiempos de espera agotados y `ok: false` en servicios que no cambiaron) mientras otra sesión ejecutaba la misma suite desde el worktree `visibility-platform-a11y` contra la misma base Neon `visibility_test`; cada fichero borra todas las filas en `beforeEach`. La primera pasada de la 013 falló por lo mismo.

**Decision:** no se toca la suite en esta spec; se espera a que termine la otra ejecución y se repite. Queda anotado en el roadmap como riesgo: una base de pruebas por worktree (o un bloqueo entre ejecuciones) antes de que dos sesiones trabajen en paralelo de forma habitual.

**Reasoning:** es un problema de entorno, no de la tarjeta; arreglarlo es una tarea propia.

**Consequences:** la evidencia de AC-009 cita la pasada hecha en solitario.

### D008 - D001 queda sustituida por la 023

**Date:** 2026-11-02

**Status:** Accepted

**Context:** Tres críticas del resumen señalaron que, con D001, el «Mal (parcial)» técnico quedaba dentro de la tarjeta bajo el estado gris de Search Console. Un «peor veredicto conocido» en la pastilla sería una puntuación compuesta.

**Decision:** la 023 (D001) parte la tarjeta en dos: «¿Puede Google leer tu portada?» con el veredicto técnico y «¿Te encuentran en Google?» con Search Console. D001 se conserva como registro; D002–D004 siguen vigentes.

**Reasoning:** cada pregunta con su pastilla y su cifra; nada escondido y nada agregado.

**Consequences:** `summarizeGoogleCard` se sustituye por `summarizeRankingCard` y `summarizeTechnicalCard`; los avisos ya no llevan prefijo de fuente porque cada tarjeta tiene la suya.
