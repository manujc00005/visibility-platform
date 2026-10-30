# Decisions: Cambios de posición por búsqueda en Search Console

## Decision log

### D001 - `previous` dentro de cada fila de `queries`, sin migración

**Date:** 2026-10-30

**Status:** Accepted

**Context:** las cifras del periodo anterior de cada búsqueda se podrían guardar en una columna aparte, como `segments` de la 007.

**Decision:** cada elemento de `queries` gana la clave `previous`.

**Reasoning:** se lee siempre junto con la fila, y el `check` actual solo exige que `queries` sea un array (D004 de la 003).

**Consequences:** la ausencia de la clave identifica una captura anterior. La base no comprueba la forma de `previous`; la garantiza la aplicación, como el resto de campos de `queries`.

### D002 - `rowLimit: 1000` en vez de filtrar por las 25 búsquedas

**Date:** 2026-10-30

**Status:** Accepted

**Context:** se podría pedir solo las 25 búsquedas con una expresión regular, como la marca en la 007.

**Decision:** una consulta del periodo anterior con la dimensión `query` y 1000 filas, emparejada en memoria.

**Reasoning:** no hay expresión que construir ni límite de 4096 que vigilar, y la consulta puede ir en paralelo porque no depende de la respuesta del periodo actual.

**Consequences:** una búsqueda fuera de las 1000 primeras dice «Sin dato anterior». Las demás filas se descartan y no se guardan.

### D003 - «Sin dato anterior» en vez de «Nueva»

**Date:** 2026-10-30

**Status:** Accepted

**Context:** la API no garantiza devolver todas las filas.

**Decision:** una búsqueda sin par se describe como «Sin dato anterior», con dirección `same`.

**Reasoning:** afirmar que es nueva sería inventar un dato.

**Consequences:** el operador no ve búsquedas «nuevas», y eso se acepta.

### D004 - Texto corto bajo la posición, sin columna nueva

**Date:** 2026-10-30

**Status:** Accepted

**Context:** a 375 px la tabla ya oculta el CTR y no admite otra columna.

**Decision:** el cambio va en la celda de posición, con `ChangeLine` y un texto corto. Es una función propia, `queryPositionChange`, porque el texto de `positionChange` («Antes: 12,1 (sube 2,7 puestos)») es demasiado largo para esa celda.

**Reasoning:** reutiliza el componente y el umbral sin cambiar el texto de la posición global.

**Consequences:** el valor anterior exacto no se ve en la tabla; se conserva en la fila.
