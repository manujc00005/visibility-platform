# Decisions: 023 — Resumen del propietario

## Decision log

### D001 - Dos tarjetas de Google; sustituye a la D001 de la 014

**Date:** 2026-11-02

**Status:** Accepted

**Context:** La 014 D001 puso el estado de Search Console en la tarjeta y la salud técnica en un bloque interno. Tres críticas seguidas señalan que el «Mal (parcial)» técnico queda bajo un gris. Proponer «el peor veredicto conocido» sería una puntuación compuesta, contra `PRODUCT.md`.

**Decision:** dos tarjetas: «¿Puede Google leer tu portada?» con el veredicto de la auditoría técnica y «¿Te encuentran en Google?» con Search Console sin veredicto (D002 de la 014 sigue). Cuatro tarjetas en 2×2.

**Reasoning:** cada tarjeta responde una pregunta con una pastilla y una cifra (regla de la cifra única de `DESIGN.md`); ningún veredicto queda escondido y ninguno se agrega.

**Consequences:** `summarizeGoogleCard` se parte en dos funciones; la 014 D001 queda sustituida (nota en su registro, sin reescribirla); la 002 AC-001 y su comportamiento 1 (tres columnas) quedan enmendados.

### D002 - La cabecera queda sin acciones

**Date:** 2026-11-02

**Status:** Accepted

**Context:** El brief confirmado dejaba «Editar» como enlace discreto, puerta del operador. La 017 añadió después la pestaña «Configuración» (`/edit`) a `WorkspaceNav`, que lleva al mismo sitio.

**Decision:** sin «Analizar portada» ni «Editar» en la cabecera del resumen.

**Reasoning:** «Editar» duplicaría la pestaña; la puerta del operador ya existe sin hablarle al propietario. «Analizar portada» sigue en `/seo` y `/performance`.

**Consequences:** se retira `overview.edit`. Si la autenticación (Fase 5) separa roles, la pestaña se oculta al propietario sin tocar el resumen.

### D003 - Los fragmentos se derivan de los resúmenes de las tarjetas

**Date:** 2026-11-02

**Status:** Accepted

**Context:** Una frase de situación con lógica propia acabaría contradiciendo a su tarjeta.

**Decision:** `situationLine` recibe los mismos resúmenes que las tarjetas y solo traduce su estado a una frase; `hasResult` decide con los mismos campos si un área tiene tarjeta o fila.

**Reasoning:** una sola fuente de verdad por área; la prueba por estado cubre línea y tarjeta a la vez.

**Consequences:** cambiar un estado en `summarize*` cambia la frase sin tocar `situation.ts` salvo para el texto.

### D004 - Orden: situación, acción, objetivo

**Date:** 2026-11-02

**Status:** Accepted

**Context:** El brief pide arriba una línea de situación y una acción. La línea del objetivo comercial (016) ya ocupaba ese sitio.

**Decision:** línea de situación, franja de la primera acción y después la línea del objetivo; su contenido no cambia.

**Reasoning:** lo que el propietario lee primero es dónde está y qué hacer; el objetivo es contexto del seguimiento.

**Consequences:** la línea del objetivo enlaza a Configuración («Definir»); queda como deuda de voz de operador para revisar con la autenticación.
