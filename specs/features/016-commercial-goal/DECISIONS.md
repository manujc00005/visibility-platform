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

### D004 - Revisiones de cierre: qué se aplicó y qué no

**Date:** 2026-11-01

**Status:** Accepted

**Context:** Revisión de conformidad («Pass con menores») y de base de datos/frontend («Reject» por un hallazgo medio, sin altos) sobre `be6ce03`.

**Decision:** aplicado en `1650853`: un solo estado de formulario con intención para guardar y quitar (tras quitar, el mensaje y los valores eran los del guardado anterior); `removeGoal` bajo el bloqueo de empresa, como el upsert (D001); la evidencia se lee en paralelo con el resto del resumen; `aria-describedby` del campo del evento; retirados `goals.line.event`, `goals.errors.saveFailed` y `GoalEvidence.periodEnd` por no tener consumidor; pruebas de captura sin eventos clave, objetivo medido con el evento ya no configurado, ayuda asociada y formulario de quitar con intención. La SPEC recoge las frases `verifiedNoCapture` y la excepción de `configuredMore`. No aplicado: un `try/catch` en las acciones que convierta un fallo de base en mensaje de formulario (el resto de acciones de empresa tampoco lo hace; se deja al límite de error de la ruta) y un estado de error del formulario por render estático (AC-005 lo explica).

**Reasoning:** el medio era un fallo real observado al guardar y quitar seguidos; el resto es simetría, código muerto propio o accesibilidad barata.

**Consequences:** `organicByEvent` está acotado a los 10 eventos orgánicos principales de la captura (008): un objetivo fuera de esos diez nunca verifica y cuenta 0; queda en el roadmap como seguimiento.
