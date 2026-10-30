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

### D006 - Resultado de las revisiones de cierre

**Date:** 2026-10-30

**Status:** Accepted

**Context:** T007 se hizo con tres revisiones independientes: seguridad, dominio y conformidad. Ninguna encontró un defecto crítico. Conformidad marcó como alto que AC-010 aún no tenía evidencia, porque T005 se ejecuta sobre el árbol final.

**Decision:** se corrige:
- **Nota y frases:** ya no dicen «bajo cada posición», que en móvil es falso, y añaden que no es un histórico. Las frases de captura antigua hablan de posición.
- **Lector de pantalla:** en móvil el cambio lleva el prefijo oculto «Posición:», porque cuelga de la columna Búsqueda.
- **Umbral:** tolerancia de 1e-9 en `queryPositionChange`, porque 8,2 − 7,7 da 0,4999… y saldría «Igual». La posición global no se toca: el cambio no es necesario para esta feature, y se deja anotado.
- **Título de las tablas:** `px-3` en móvil, alineado con la primera columna.
- **Pruebas:**
  - Las ocho consultas previas como cadena exacta.
  - 25 filas sobre 30, con par en la fila 1000.
  - Claves hostiles como `__proto__`, respuesta mal formada y tiempo agotado en la consulta nueva.
  - Tabla de páginas junto a búsquedas con cambio.
  - Clave ausente sin línea, mezcla de filas y frase bajo la tabla.
  - Último éxito tras cada fallo, en la base y en el render.
  - Nota en inglés y `PREVIOUS_QUERIES` atado al texto.
- **Documentos:** `previous` opcional en SPEC y PLAN, enmiendas de la colocación y recuentos.

Se acepta sin cambio:
- `previous` opcional también al escribir (DOM-03). Separar el tipo de escritura complicaría las fixtures, y una prueba exige la clave en toda captura nueva.
- `rowLimit: 1000` (DOM-04, DOM-05): basta para el piloto y degrada a «Sin dato anterior». Una fila anómala haría fallar la captura, sin indicio de que Google las devuelva.
- La flecha de «Sin dato anterior» (DOM-06): la palabra aclara el significado y FR-006 fijó `same`.
- Sin mínimo de impresiones (DOM-10): es una decisión de producto para cuando haya datos.
- Dos copias del cambio en el DOM, una oculta con CSS: es el mismo patrón que la tabla de canales de GA4.
- Sin `ANALYSIS.md`: `/spec-close` no lo exige; en esta spec el análisis se hizo al planificar.

Se deja anotado como deuda, sin tocarlo aquí por ser anterior a esta feature (SEC-009-01, SEC-009-02): el recorte de búsquedas y páginas por unidades UTF-16 en Search Console y GA4 puede romper un carácter, o conservar un NUL, y hacer que Postgres rechace la fila sin dejar intento `failed`. Está en el roadmap como D-35.

**Consequences:** la tolerancia solo vive en la comparación por búsqueda, así que en un caso límite de coma flotante la posición global podría decir «sin cambio» y una búsqueda «Baja 0,5».
