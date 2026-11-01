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

### D004 - Se cancela unificar las etiquetas de Bing y GA4

**Date:** 2026-11-01

**Status:** Accepted

**Context:** La 014 dejó para esta spec unificar los estados de las secciones de Bing y GA4 con la tabla de las tarjetas. La revisión de conformidad señaló que la 017 no lo recogía ni lo reasignaba.

**Decision:** cancelarlo. «Procesando» y «Sin visitas» se quedan.

**Reasoning:** son la misma clase de palabra que «Sin impresiones» en Search Console (014 D004): dicen más que un estado genérico, y la escala compartida es la de las tarjetas, no la de cada fuente.

**Consequences:** el seguimiento se cierra aquí y en el roadmap.

### D005 - Revisiones de cierre: qué se aplicó y qué no

**Date:** 2026-11-01

**Status:** Accepted

**Context:** Conformidad dio «Fail» por cuatro importantes y frontend/QA, cuatro medios y once bajos, sin nada roto. Ambas sobre `7afd7cf`.

**Decision:** aplicado en `da29a8c`: un solo renderizador de la comparativa guiado por la lista de columnas, como pedía la FR-004 (mi primera versión duplicaba la tabla en un `KeyCells`); `revalidateGeo` con `/seo`; retirada de `PerformanceSummary.field` y de `competitorComparison.section.title`, sin lector; textos que aún apuntaban a la configuración de IA o a «Ejecuta una auditoría»; enlace a Configuración desde la medición sin competidores; nombres de competidores en `/geo/setup`; número de preguntas de marca en `/geo`; `scroll-mt-6` y `key` por idioma en el panel; pruebas de pestaña, ancho de filas y enlace de gestión. Además se completó la evidencia que faltaba: detección con extracción, aceptación y descarte desde Configuración, y 1280 px. El roadmap afirmaba 1280 px antes de comprobarlo; se corrigió haciendo la comprobación.

**No aplicado:** `{button}` en `overview.emptyAction` (coincide hoy; es prevención); frases de «Consultas y páginas» que nombran el botón del bloque de resultados (siguen siendo ciertas); `updateWorkspaceAction` sin revalidar `/seo`, `/edit` ni `/geo/setup` (anterior a la 017, y redirige); ids duplicados entre rutas ocultas bajo `<Activity>` (anterior a la 017 y sin comprobar en ejecución).

**Reasoning:** se aplica lo que deja el producto o la spec en contradicción; lo demás queda escrito para no perderlo.

**Consequences:** D001 se matiza: la principal oportunidad de IA está siempre en `/geo`, y en el resumen solo si entra entre las tres primeras. Antes la tarjeta la nombraba siempre. Reservarle un sitio cambiaría el orden de oportunidades y queda fuera de esta spec.
