# Decisions: Objetivo comercial por empresa

## Decision log

### D001 - Tabla 1:1 propia, como el perfil de negocio

**Date:** 2026-11-01

**Status:** Accepted

**Context:** El objetivo es opcional y puede no existir; la ficha de empresa se usa en alta, edición, prompts y mediciones.

**Decision:** `workspace_goals` con `workspace_id` como clave primaria y FK en cascada, escrita bajo el bloqueo de empresa.

**Reasoning:** mismo patrón que `geo_business_profiles` (012 D002): sin objetivo todo sigue igual.

**Consequences:** `getGoal` devuelve `null` y el resumen muestra «sin definir».

### D002 - La verificación se deriva de las capturas; no se guarda

**Date:** 2026-11-01

**Status:** Accepted

**Context:** Codex pide distinguir «0 observado» de «medición sin verificar» y mostrar la última recepción.

**Decision:** verificado = alguna captura buena guardada con el evento mayor que cero en `organicByEvent`; la fecha de esa captura es la última recepción observada. Ningún campo de estado.

**Reasoning:** lo capturado es la única evidencia; un estado guardado podría contradecirlo.

**Consequences:** la consulta de evidencia recorre las capturas de la empresa con `jsonb_path_exists`, acotada por el índice de empresa y fecha.

### D003 - Solo el desglose orgánico verifica

**Date:** 2026-11-01

**Status:** Accepted

**Context:** GA4 guarda por evento únicamente los eventos clave del canal «Organic Search» (008 D003).

**Decision:** una recepción por otro canal no verifica el objetivo; el texto dice siempre «desde buscadores».

**Reasoning:** es lo que el producto mide y promete; ampliar la captura de la 008 es otra spec.

**Consequences:** una empresa con conversiones solo directas verá «pendiente» hasta que llegue una desde buscadores; la nota lo explica.
