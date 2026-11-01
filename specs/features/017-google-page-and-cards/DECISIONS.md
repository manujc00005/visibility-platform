# Decisions: Página «Google» por preguntas, acciones con alcance y tarjetas compactas

## Decision log

### D001 - La metodología sale de la tarjeta, no a un `<details>` dentro

**Date:** 2026-11-01

**Status:** Accepted

**Context:** El doc 19 pedía llevar la metodología a un `<details>` en la tarjeta. La tarjeta es un único enlace (002, FR-003): un control interactivo dentro de un enlace es inválido.

**Decision:** visitantes reales, nota al pie y principal oportunidad pasan al detalle y a las oportunidades del resumen, donde ya están.

**Reasoning:** quedan en la tarjeta los límites esenciales (nota de laboratorio, nota de muestra); el resto no se pierde.

**Consequences:** se sustituyen la 002 AC-012 en lo que toca a la tarjeta y AC-022.

### D002 - La pestaña «Configuración» apunta a `/edit`

**Date:** 2026-11-01

**Status:** Accepted

**Context:** La 015 D001 dejó el panel de fuentes en la edición a la espera de «Configuración».

**Decision:** pestaña que apunta a la ruta existente; ahí viven ficha, objetivo, competidores y fuentes.

**Reasoning:** cumple lo prometido sin mover rutas, enlaces ni formularios.

**Consequences:** el botón «Editar» del resumen queda redundante con la pestaña y se conserva.

### D003 - Los apartados enlazados no se pliegan

**Date:** 2026-11-01

**Status:** Accepted

**Context:** El panel de fuentes y el estado por área enlazan a anclas de `/seo`, y un `<details>` cerrado no se abre al saltar a un ancla interior.

**Decision:** solo Lighthouse e histórico van plegados.

**Reasoning:** son los dos únicos apartados sin enlaces entrantes y de consulta ocasional.

**Consequences:** Bing y Analytics siguen desplegados como apartados del primer bloque.
