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
