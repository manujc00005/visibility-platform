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

**Decision:** el cambio va en la celda de posición a partir de `sm`, y en móvil bajo el texto de la búsqueda, con `ChangeLine` y un texto corto (*ajuste de T006:* bajo la posición la tabla medía 386 px en 341 y escondía esa columna; es el mismo patrón que la tabla de canales de GA4). Es una función propia, `queryPositionChange`, porque el texto de `positionChange` («Antes: 12,1 (sube 2,7 puestos)») es demasiado largo para esa celda.

**Reasoning:** reutiliza el componente y el umbral sin cambiar el texto de la posición global.

**Consequences:** el valor anterior exacto no se ve en la tabla; se conserva en la fila. El relleno lateral de la tabla baja en móvil (`px-2`/`px-3`), también en la de páginas, que comparte componente; desde `sm` no cambia.

### D005 - T006 cerrada con Olessium a cero; la comparación con datos, pendiente

**Date:** 2026-10-30

**Status:** Accepted

**Context:** la captura real de olessium.com del 2026-10-30 a las 18:38 UTC en `dev` es `completed`: Google aceptó la consulta nueva. Sigue sin impresiones, así que no hay ninguna búsqueda que emparejar.

**Decision:** T006 se da por hecha como en la 003, la 007 y la 008. La maquetación se comprobó con una fila sintética de cuatro búsquedas que cubren los cuatro estados, borrada después por su id. Comparar posiciones reales y confirmar que el texto de una búsqueda coincide entre periodos queda en Follow-ups.

**Reasoning:** con cero filas, la captura real demuestra que la llamada funciona, no que el emparejado acierte.

**Consequences:** si con datos reales los textos no coinciden, las filas dirán «Sin dato anterior» y se revisará el emparejado de FR-002.
