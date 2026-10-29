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

**Consequences:** un nombre genérico («Moda») clasifica de más. Se acepta y se compensa enseñando los términos en la sección. La variante `nameKey` pierde los signos: «C++ Academy» se busca también como «c academy», y eso también casa con «c academy cursos» o dentro de «cc academy» (la prueba de T001 comprueba «c academy»).

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

**Decision:** un `check` con `jsonb_path_exists` comprueba claves, tipos de elementos y de métricas en un solo predicado (no se usa `?&`: una clave ausente ya hace fallar la ruta). Desde la migración `0010`, en modo `strict` (D008). Son funciones inmutables, válidas en un `check`. La migración se genera con `npm run db:generate` y se revisa a mano.

**Reasoning:** la SPEC lo pide (AC-008) y el coste es una sola columna pequeña.

**Consequences:** si `drizzle-kit` no reproduce bien la expresión, se escribe la restricción en el SQL de la migración y en el esquema con el mismo texto. Las filas anteriores con nulo pasan los `check`.

### D007 - T009 cerrada con Olessium a cero; la sintaxis con datos, pendiente

**Date:** 2026-10-29

**Status:** Accepted

**Context:** la captura real de olessium.com (fila `completed` del 2026-10-29 a las 16:33 UTC en `dev`) se guardó con `segments`. Google respondió 200 a las cuatro consultas filtradas con `(?i)`, `includingRegex` y `excludingRegex`. Todo está a cero porque la propiedad aún no tiene impresiones (D006 de la 003). Una sonda de solo lectura contra la misma propiedad mostró que la API también responde 200, con una fila a cero, a expresiones inválidas: `(?i)(`, con un paréntesis sin cerrar, y `(?=x)`, una anticipación que RE2 no admite. La cuenta de servicio solo ve `sc-domain:olessium.com`, así que no hay otra propiedad con datos para comprobarlo.

**Decision:** T009 se da por hecha como en la 003, la 005 y la 006: AC-014 se cumple en su letra, porque Google no rechazó la expresión, y la pantalla se comprobó en `es` y `en` a 375 px sin desbordamiento. Que Google interprete bien `(?i)` y los literales escapados queda como seguimiento en TASKS, para cuando haya impresiones.

**Reasoning:** con la propiedad vacía, un 200 no distingue una expresión válida de una inválida. Afirmar más sería presentar como verificado algo que no lo está.

**Consequences:** el primer día con impresiones hay que repetir la captura y comparar el bloque «con tu marca» con la interfaz de Search Console filtrada por la misma expresión. Si no coincide, o si con datos Google rechaza `(?i)`, se aplica la salida de D004: quitar el prefijo y confiar en que el regex de la API no distingue mayúsculas, como el de la interfaz.

### D008 - Resultado de las revisiones de cierre

**Date:** 2026-10-29

**Status:** Accepted

**Context:** T010 se hizo con tres revisiones independientes: seguridad, dominio (base de datos y frontend) y conformidad con la spec. Ninguna encontró un hallazgo crítico. Conformidad marcó como alto que AC-011 no se había comprobado con datos.

**Decision:** se corrige:
- **Base de datos:** `check` de forma en modo `strict` con la migración `0010`; las pruebas de rechazo comprueban código y nombre de la restricción.
- **Expresión:** lista blanca por variante, longitud en bytes UTF-8, guarda de dominio vacío y comparador compilado una vez que nunca rompe la página.
- **Sección:** estado vacío con los bloques y su cambio, frase propia y espacio antes del distintivo; textos de recorte y de hueco.
- **Pruebas:** los fallos sobre la fila, la captura `completed` sin secretos y AC-005 con otra empresa.
- **AC-011:** comprobado con una fila sintética que se borró después.
- **Documentos:** PLAN (rollback en dos entregas, ` +`, `deps.ts`), D002, D006 y las enmiendas de la SPEC.

Se acepta sin cambio:
- La forma de la fila `failed` cuando falla una de las tres consultas filtradas que no se fuerzan en la prueba unitaria: el camino de error es el mismo `Promise.all`, y la integración lo cubre con la consulta anterior `excludingRegex`.
- El `id` fijo `gsc-segments`: la sección se pinta una vez por página, como otros `id` del proyecto.
- `<section>` dentro de la tarjeta: es válido, aunque un `div` bastaría.
- El nombre de la empresa como dato personal si es un autónomo: es lo mínimo para el fin y el borrado se propaga en cascada. La retención queda para la Fase 5 y el documento de privacidad.
- El riesgo de D007: hasta que haya impresiones no se sabe si Google interpreta `(?i)` y los literales. Si Google rechazara la expresión, fallarían todas las capturas de Search Console, también los totales de la 003, como pide FR-009. La salida está en D004.

**Consequences:** `brandTerms` puede lanzar `BrandTermsError` en dos casos nuevos imposibles con datos validados (variante fuera de la lista blanca y dominio vacío); los dos acaban en `failed/error` sin llamada a Google. Las migraciones de la siguiente feature empiezan en `0011`.
