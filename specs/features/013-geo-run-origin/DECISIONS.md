# Decisions: Origen y estados de la medición en IA

## Decision log

### D001 - El origen es una columna, no parte de la metodología

**Date:** 2026-11-01

**Status:** Accepted

**Context:** Doc 17 §9 proponía «campo de origen en `geo_runs`». Se podía congelar en `config` y por tanto en `methodologyKey`.

**Decision:** columna `origin` fuera de `config`; `methodologyKey` no cambia.

**Reasoning:** el origen dice si la medición cuenta, no cómo se midió. Mantener la clave intacta deja comparables las runs existentes y evita confundir «no comparable» con «no cuenta».

**Consequences:** la exclusión vive en `summarizeAi` y `createReport`, no en la comparación de claves.

### D002 - Excluir en el resumen, rotular en el histórico

**Date:** 2026-11-01

**Status:** Accepted

**Context:** Codex pedía que el modo demostración «se reconozca sin abrir la evidencia».

**Decision:** resumen, página de presencia, comparación e informe ignoran las runs no reales; el histórico las lista con rótulo y el detalle avisa.

**Reasoning:** una demo sigue siendo útil para enseñar la aplicación; lo que no puede es contar.

**Consequences:** la empresa demo de `dev` muestra «Sin mediciones» en la tarjeta de IA, con la frase que explica por qué.

### D003 - Reclasificar, no borrar

**Date:** 2026-11-01

**Status:** Accepted

**Context:** D-23 del roadmap sugería «archivar o borrar». 

**Decision:** `UPDATE` por id de las dos runs conocidas; nada en código.

**Reasoning:** conserva la evidencia de la Fase 4 y las capturas del doc 17; reversible.

**Consequences:** T007 registra ids y sentencia.

### D004 - Umbral 3 para el porcentaje

**Date:** 2026-11-01

**Status:** Accepted

**Context:** «1 de 1 (100 %)» como titular con una observación (Codex, hallazgo 4).

**Decision:** `fraction` omite el porcentaje cuando `n < 3`.

**Reasoning:** regla de presentación mínima que elimina el caso denunciado sin esconder porcentajes en muestras pequeñas pero reales (3–5 preguntas).

**Consequences:** `labels.fractionSmall` nuevo; la prueba de `i18n-en` cambia.

### D005 - Un solo cálculo del estado por medición

**Date:** 2026-11-01

**Status:** Accepted

**Context:** El detalle y el resumen calculaban el estado por caminos distintos (hallazgo 3).

**Decision:** `runResultState` en `overview/ai.ts`, usada por `summarizeAi` para la run resultado y por el detalle.

**Reasoning:** la misma función no puede dar dos frases distintas.

**Consequences:** la frase de `reason` del resumen sale de `runResultState`.

### D006 - Revisión de seguridad: sin hallazgos; dos notas no aplicadas

**Date:** 2026-11-01

**Status:** Accepted

**Context:** La revisión de seguridad (solo lectura, sobre `90a6039`) no encontró hallazgos: `origin` se valida por enumeración en el servidor y por `CHECK` en base, el informe y el resumen filtran por origen y las etiquetas se indexan con un valor acotado. Propuso dos endurecimientos opcionales: un parámetro de origen en `listGeoRuns` para que el filtro del informe sea estructural, y quitar el `default("real")` de `createGeoRun` para que un formulario sin el campo falle en vez de contar como real.

**Decision:** no aplicar ninguno de los dos en esta spec.

**Reasoning:** el filtro vive en dos puntos (D002) y `RunLike.origin` es obligatorio en el tipo, así que un consumidor nuevo del resumen no puede olvidarlo; el informe es el único otro consumidor y su filtro está probado (AC-004). El valor por defecto `real` es el comportamiento que piden la SPEC (FR-002) y los clientes de formulario anteriores.

**Consequences:** si aparece un tercer consumidor de `listGeoRuns` orientado a cliente, añadir entonces el parámetro de origen.

### D007 - Revisión de conformidad: menores corregidos y dos añadidos declarados

**Date:** 2026-11-01

**Status:** Accepted

**Context:** La revisión de conformidad dio «Pass con menores» sobre `90a6039`. Dos importantes (evidencia de T007 y estado de la spec) ya estaban escritos cuando terminó. Menores: el literal de FR-003 difería del catálogo («o prueba» frente a «o de prueba»); AC-008 no estaba aseverado en los dos idiomas; AC-005 solo tenía evidencia manual; y dos añadidos no figuraban en la SPEC: `AiSummary.nonRealOnly` y las frases `runCollecting`/`runFailed`.

**Decision:** alinear la SPEC con el catálogo («o de prueba»); añadir las aserciones de `fraction` en `es` y `en` y una prueba de las etiquetas de origen y del aviso del detalle; declarar `nonRealOnly` en la SPEC y aquí las dos frases.

**Reasoning:** `nonRealOnly` es adyacente-necesario: sin él, la página de IA no puede distinguir «solo hay demos» de «no hay nada» sin imprimir también la frase de primera medición. `runCollecting`/`runFailed` existen porque las frases del resumen para esos estados (`firstRunning`, `attempt.failed`) hablan de «la primera medición» o «la última», que en el detalle de una medición concreta serían falsas; FR-006 pedía el mismo catálogo y lo es, con dos claves nuevas amparadas por FR-012.

**Consequences:** AC-009 (suma de proporciones) y AC-010 (título AEO) quedan con evidencia manual y de paridad de catálogo, como registra TASKS.
