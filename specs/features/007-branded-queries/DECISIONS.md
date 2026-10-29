# Decisions: Búsquedas con marca y sin marca en Search Console

## Decision log

### D001 - Términos de marca desde la ficha de la empresa

**Date:** 2026-10-29

**Status:** Accepted

**Context:** hace falta saber qué búsquedas «contienen la marca». La empresa ya guarda `name`, `brandAliases` (hasta 10) y `domain`, y el módulo GEO los usa como panel de marca.

**Decision:** los términos son el nombre, los alias y el dominio, por ese orden (FR-001). No hay lista de términos SEO aparte. Si sobra o falta un término, el operador edita la ficha y vuelve a capturar.

**Reasoning:** una segunda lista divergiría de la que usa el GEO y obligaría a mantener dos.

**Consequences:** coste de revertir bajo: un campo opcional de términos SEO en la empresa. Cada captura congela sus `terms`, así que un cambio en la ficha solo afecta a capturas futuras.

### D002 - Coincidencia por contenido, no por palabra completa

**Date:** 2026-10-29

**Status:** Accepted

**Context:** «olessium.com», «olessiumopiniones» y «olessium opiniones» son búsquedas de marca. Un límite de palabra perdería las dos primeras.

**Decision:** la expresión busca cada variante en cualquier posición de la búsqueda, sin `\b` (FR-002).

**Reasoning:** es lo que un informe SEO entiende por «contiene la marca» y cubre errores de espaciado.

**Consequences:** un nombre genérico («Moda») clasifica de más. Se acepta y se compensa enseñando los términos en la sección. La variante `nameKey` pierde los signos: «C++ Academy» se busca también como «c academy», que aparece dentro de «cc academy» (comprobado en T001).

### D003 - El hueco se enseña, no se reparte

**Date:** 2026-10-29

**Status:** Accepted

**Context:** con marca más sin marca no suma el total, porque Google no clasifica todas las búsquedas al filtrar por `query`.

**Decision:** el hueco se calcula en el resumen y se muestra como dato aparte; no se guarda ni se reparte entre los dos bloques (FR-004). No se atribuye a una causa exclusiva.

**Reasoning:** repartirlo inventaría un dato; la regla del producto es no mezclar ni estimar (doc 08 §1).

**Consequences:** en webs pequeñas casi todo cae en el hueco. La sección lo explica.

### D004 - Un único constructor de variantes para Google y para la etiqueta local

**Date:** 2026-10-29

**Status:** Accepted

**Context:** la etiqueta «marca» de la tabla (FR-007) y el filtro enviado a Google (FR-002) deben dar el mismo veredicto. Google usa RE2; la prueba local usa el motor de JavaScript, que no admite el prefijo `(?i)`.

**Decision:** `brand-terms.ts` genera la lista de variantes escapadas una sola vez. Para Google se une con `|` y se antepone `(?i)`. Para la etiqueta local se compila la misma alternancia sin prefijo con las banderas `iu`. Las variantes solo usan literales escapados y ` +` (espacio, uno o más) entre palabras, en las tres variantes. No se usa `\s+`: en RE2 `\s` es solo espacio ASCII y en JavaScript con `u` incluye espacios Unicode, así que darían veredictos distintos (ajuste del 2026-10-29 al implementar T001). Se escapan exactamente `\ ^ $ . | ? * + ( ) [ ] { }`: el guion no se escapa, porque fuera de una clase es literal en RE2 y escaparlo es un error en JavaScript con la bandera `u`.

**Reasoning:** con ese subconjunto, RE2 y JavaScript se comportan igual, así que la prueba local es representativa. Dos implementaciones separadas divergirían.

**Consequences:** queda fuera del subconjunto cualquier sintaxis exclusiva de un motor. La aceptación real de `(?i)` por la API se comprueba en T009 (AC-014); si Google la rechaza, se retira el prefijo y se anota aquí.

### D005 - La etiqueta «marca» va junto al texto de la búsqueda

**Date:** 2026-10-29

**Status:** Accepted

**Context:** pregunta abierta de la SPEC: columna propia o distintivo junto al texto.

**Decision:** un distintivo pequeño a continuación del texto de la búsqueda, dentro de la misma celda.

**Reasoning:** una columna más aprieta la tabla a 375 px (AC-011), donde ya se oculta el CTR. El distintivo no cambia el número de columnas.

**Consequences:** el distintivo debe leerse como texto («marca» / «brand») y no solo por color.

### D006 - Forma de `segments` comprobada en la base con `jsonb_path_exists`

**Date:** 2026-10-29

**Status:** Accepted

**Context:** la SPEC pide que la base rechace un `segments` mal formado (versión, `terms` de cadenas, cuatro totales numéricos). Hasta ahora las tablas de Search Console, Bing y GA4 solo comprueban `jsonb_typeof`, y el roadmap acepta invariantes JSON solo en la aplicación (D-27).

**Decision:** los `check` usan el operador `?&` para las claves y `jsonb_path_exists` para tipos de elementos y de métricas. Son funciones inmutables, válidas en un `check`. La migración se genera con `npm run db:generate` y se revisa a mano.

**Reasoning:** la SPEC lo pide (AC-008) y el coste es una sola columna pequeña.

**Consequences:** si `drizzle-kit` no reproduce bien la expresión, se escribe la restricción en el SQL de la migración y en el esquema con el mismo texto. Las filas anteriores con nulo pasan los `check`.
