# Decisions: Conversiones desde la búsqueda orgánica en GA4

## Decision log

### D001 - Eventos clave, no tasas

**Date:** 2026-10-29

**Status:** Accepted

**Context:** GA4 ofrece recuentos (`keyEvents`) y tasas (`sessionKeyEventRate`, `userKeyEventRate`). El cliente de la 006 exige métricas enteras (su FR-010).

**Decision:** solo recuentos de eventos clave. Ninguna tasa, ni de GA4 ni calculada por la app.

**Reasoning:** los recuentos caben en el cliente sin relajar su validación, y una tasa propia mezclaría informes con denominadores distintos.

**Consequences:** el bloque dice cuántos eventos clave hubo, no qué proporción de sesiones convirtió.

### D002 - Lista de eventos clave desde la Admin API

**Date:** 2026-10-29

**Status:** Accepted

**Context:** con la Data API sola, «no hay eventos clave configurados» y «no hubo ninguno en el periodo» dan el mismo cero.

**Decision:** `properties.keyEvents.list`, una página de 200, en paralelo con los informes.

**Reasoning:** el operador necesita saber si tiene que marcar eventos en GA4 o si simplemente no hubo conversiones.

**Consequences:** una llamada más por captura. La lista es la configuración en el momento de capturar, no la del periodo.

### D003 - Orgánico es el canal `Organic Search` exacto

**Date:** 2026-10-29

**Status:** Accepted

**Context:** el grupo de canales predeterminado de GA4 agrupa todos los buscadores en `Organic Search`.

**Decision:** se compara y se filtra con el valor exacto, `caseSensitive: true`, sin sumar otros canales ni traducir.

**Reasoning:** es el valor que devuelve la API (visto en la 006). Una lista de equivalencias sería una suposición sin datos.

**Consequences:** si una propiedad devolviera otro nombre, orgánico saldría a cero; la sección lo advierte cuando hay total positivo y orgánico cero.

### D004 - Columna nueva `key_events`

**Date:** 2026-10-29

**Status:** Accepted

**Context:** se podría ampliar `channels` con los eventos clave de cada canal.

**Decision:** columna `key_events jsonb` aparte, nula en capturas anteriores y en fallos.

**Reasoning:** las filas antiguas conservan su forma y «captura sin esta feature» queda explícito como nulo.

**Consequences:** migración `0011` con su `check` en modo `strict`, como la 007 (su D008).

### D005 - El bloque y su tabla van dentro de la tarjeta

**Date:** 2026-10-29

**Status:** Accepted

**Context:** pregunta abierta de la SPEC: la tabla por evento dentro de la tarjeta o junto a las de canales y páginas.

**Decision:** el bloque «Conversiones desde buscadores» va dentro de la tarjeta, bajo las tres cifras, con su tabla de como mucho diez eventos dentro del bloque.

**Reasoning:** las tablas de canales y páginas solo se pintan con visitas (`state = ok`), y el bloque debe verse también en «Sin visitas» (FR-009). Dentro de la tarjeta no depende de esa condición.

**Consequences:** la tabla es pequeña y usa el mismo contenedor con `overflow-x-auto` que las demás.

### D006 - El aviso de calidad también en «Sin visitas»

**Date:** 2026-10-29

**Status:** Accepted

**Context:** hoy el resumen devuelve pronto en `state = empty` sin avisos de calidad, y la sección solo pinta el aviso con visitas.

**Decision:** en `empty` el resumen conserva `quality` y `keyEvents`, y la sección pinta el aviso de calidad cuando hay bloque de eventos clave.

**Reasoning:** FR-008 y AC-003 piden que un umbral o un muestreo en los informes nuevos se vea aunque no haya visitas.

**Consequences:** cambia un retorno temprano de `summarizeAnalytics`; las pruebas de la 006 sobre `empty` deben seguir pasando.

### D007 - Sumas exactas con tope de 10¹²

**Date:** 2026-10-29

**Status:** Accepted

**Context:** cada métrica ya llega validada como entero de 0 a 10¹². Sumar hasta 100 filas puede pasar de ese tope.

**Decision:** si la suma de un periodo pasa de 10¹², la captura falla con `error`. Por debajo de 2⁵³ la suma de enteros es exacta.

**Reasoning:** guardar un número que la propia app considera imposible para una métrica sería incoherente con la 006.

**Consequences:** caso imposible en la práctica; queda probado y cubierto.
