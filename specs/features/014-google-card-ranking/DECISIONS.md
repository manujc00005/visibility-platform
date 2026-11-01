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
