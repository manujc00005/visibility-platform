# Decisions: Overview comercial por empresa

### D001 - Módulo puro `overview` separado de `audits` y `geo`

**Date:** 2026-10-26 · **Status:** Accepted

**Context:** El overview cruza auditorías, PageSpeed, CrUX y GEO. Ponerlo en `audits/evolution.ts` acoplaría módulos.

**Decision:** Nuevo `src/modules/overview/` sin E/S que recibe datos ya cargados y devuelve estructuras listas para pintar. Reutiliza `SCORE_NOISE`, `rateMetric`, `auditHeadline`, `categoryStatuses` y `Fraction`.

**Consequences:** Testeable sin base de datos; las páginas quedan como ensamblaje.

### D002 - Sin puntuación compuesta en ninguna tarjeta

**Date:** 2026-10-26 · **Status:** Accepted

**Decision:** Rendimiento muestra la puntuación de Google (medida real); Google muestra conteos por severidad de SEO; las seis áreas quedan en el detalle; IA muestra «k de n preguntas». No se suma ni se promedia nada (B06).

### D003 - Search Console como estado vacío sin enlace

**Date:** 2026-10-26 · **Status:** Accepted

**Context:** No existe integración ni OAuth; la spec pide proponer la experiencia sin crear enlaces sin destino.

**Decision:** Bloque «Posicionamiento en Google» con texto explicativo y marca «No disponible todavía», sin botón ni ruta.

### D004 - Escritorio «no disponible»

**Date:** 2026-10-26 · **Status:** Accepted

**Decision:** `runPageSpeed` mide solo `strategy: "mobile"`. El detalle lo declara en lugar de omitirlo o añadir una segunda llamada (sería nueva integración).

### D005 - AEO con datos observados, no con análisis de contenido

**Status:** Superseded por D010. Se mantiene el límite de no analizar contenido ni crear scores; se sustituye la inferencia de cobertura por observaciones de menciones.

**Decision:** El apartado AEO lista las preguntas monitorizadas donde la marca aparece y donde no, con una acción de contenido genérica y límites declarados. No se analiza el contenido de la web frente a preguntas (P1) ni se crea un «AEO Score».

### D006 - Configuración GEO en `/geo/setup`

**Date:** 2026-10-26 · **Status:** Accepted

**Context:** `/geo` mezclaba formularios y resultados. **Decision:** `/geo` pasa a ser el informe y `/geo/setup` la configuración, reutilizando componentes y acciones; las acciones revalidan ambas rutas.

### D007 - Umbral de «datos antiguos»: 30 días

**Date:** 2026-10-26 · **Status:** Accepted

**Decision:** Una última auditoría o medición de hace más de 30 días lleva el aviso «Datos de hace N días». Supuesto razonable para una pyme; ajustable en una constante.

### D008 - Comparación GEO solo con la misma `methodologyKey`

**Status:** Superseded por D012. La igualdad de clave sigue siendo necesaria, pero no basta sin captura completa y denominadores compatibles.

**Decision:** Se muestra «Antes: k de n» únicamente cuando la medición anterior completada comparte clave; si no, «Sin comparación: configuración distinta». Alineado con B05.

### D009 - `/` (inicio) queda fuera

**Date:** 2026-10-26 · **Status:** Accepted

**Decision:** La página de inicio sigue siendo el panel del operador (estado del sistema y hoja de ruta). El dashboard del cliente es la página de empresa.

### D010 - Preguntas observadas y límites de AEO

**Date:** 2026-10-26 · **Status:** Accepted

**Context:** Ausencia de mención no demuestra ausencia de contenido. El denominador existente de `promptCoverage` excluye preguntas sobre la marca y preguntas sin respuesta válida.

**Decision:** Sustituye D005. Aplicar las unidades y el ejemplo de AC-012. El apartado AEO describe preguntas donde aparece/no aparece y separa las no evaluadas; solo recomienda revisar contenido y pertinencia, con incertidumbre explícita (AC-016).

**Consequences:** Revisar `summarizeAi` y las oportunidades ya esbozadas durante T001; no se añade análisis de contenido P1.

### D011 - Estado del resultado separado del último intento

**Date:** 2026-10-26 · **Status:** Accepted

**Decision:** Aplicar las reglas de estados de SPEC y AC-006/013/015. Conservar resultados fechados ante un intento posterior fallido/en curso. La falta de datos no implica ausencia de problemas. Antigüedad es un aviso independiente; los ceros solo representan observaciones válidas.

**Consequences:** T001, T002, T003 y los detalles incorporan estas dimensiones y sus pruebas. No se modifica el esquema ni el estado persistido de los runs.

### D012 - Comparaciones consecutivas y cobertura compatible

**Date:** 2026-10-26 · **Status:** Accepted; en IA, «captura completa» queda sustituida por «resultado completo» de D018.

**Decision:** Sustituye D008. Seguir FR-002 y AC-005/014/015: GEO compara únicamente la medición completada inmediatamente anterior con igual clave, captura completa y mismo conjunto evaluado sin marca; SEO excluye rendimiento y exige igual cobertura; velocidad exige estrategia y versión mayor Lighthouse conocidas e iguales. No se buscan resultados históricos alternativos para fabricar una comparación.

**Consequences:** Para el overview, cargar hallazgos de las dos auditorías completadas más recientes mediante `getAudit`. El detalle SEO obtiene también los del histórico para excluir rendimiento en cada punto. No cambiar reglas de captura ni `computeEvolution` global.

### D013 - Jerarquía visual y comprobación de comprensión

**Date:** 2026-10-26 · **Status:** Accepted

**Decision:** La tarjeta Google resume titular, conteos, cambio comparable, fecha y límite de posicionamiento. Las seis áreas quedan en el detalle. AC-018 comprueba el objetivo de diez segundos con una persona; es requisito de cierre, no de inicio de implementación.

**Consequences:** T002/T003 y T007 deben verificar y registrar legibilidad, además de responsive y teclado.

### D014 - Spec updated: preparación de P0 tras revisión

**Date:** 2026-10-26 · **Status:** Accepted

**Context:** La revisión detectó estados vacíos engañosos, unidades ambiguas de IA, mezcla de rendimiento en SEO y verificaciones insuficientes.

**Decision:** Se actualizan AC-004/005/006 y se añaden AC-012 a AC-019; PLAN y TASKS quedan sincronizados con D010–D013. Se conserva el alcance P0 y el estado `In Progress`. Sin código de aplicación, commits ni despliegues en esta corrección.

**Reasoning:** Las reglas deben quedar resueltas antes de continuar el código ya iniciado.

**Consequences:** T001–T007 se han revisado y reescrito; todas permanecen pendientes. Los archivos de `src/modules/overview/` y el cambio en `audits/status.ts` existentes requieren contraste con la spec actualizada durante implementación; esta revisión no los valida ni los modifica. No hay tareas completadas que invalidar. El análisis de contenido, Search Console y las optimizaciones de persistencia siguen fuera de P0.

### D015 - Interpretaciones tomadas al implementar T001

**Date:** 2026-10-26 · **Status:** Accepted

**Context:** La spec deja tres puntos a interpretación del implementador.

**Decision:**
1. «Igual cobertura de comprobaciones» en SEO = mismas categorías SEO comprobadas (`isCategoryChecked`) **y** misma `rulesVersion`. Un cambio de reglas puede añadir o quitar hallazgos sin que cambie la web; comparar entre versiones fabricaría mejoras o empeoramientos. Sin `facts` o sin versión, la cobertura es desconocida y no se compara.
2. En IA, el «resultado utilizable» es la medición `completed` más reciente con al menos una observación recogida. Una medición `completed` con todas las observaciones fallidas se trata como intento fallido (aviso), no como resultado; sin resultado previo, el bloque queda en error.
3. SEO parcial (portada no leída) usa tono neutro y titular «Resultado parcial» cuando no hay críticos ni importantes; si los hay, conserva su título y sustituye el detalle por la explicación de cobertura parcial. Nunca muestra «Bien».

**Consequences:** Auditorías antiguas con otra versión de reglas no muestran flecha de cambio en SEO. Las oportunidades se limitan a los tipos de FR-004; las críticas de cualquier otra área SEO también entran como prioridad alta.

### D016 - Componentes de overview sin pruebas unitarias

**Date:** 2026-10-26 · **Status:** Accepted

**Context:** Vitest corre en entorno `node`, sin DOM ni librería de testing de React. Añadir `jsdom` o Testing Library sería una dependencia nueva, prohibida por FR-009.

**Decision:** `PageHeader`, `WorkspaceNav`, `OverviewCard`, `ChangeLine`, `NoticeList` y `Opportunities` son presentación sin lógica: toda decisión (estados, comparaciones, oportunidades, textos de límite) vive en `src/modules/overview/`, ya cubierto por pruebas unitarias. Los componentes se verifican con typecheck, lint, build y en navegador (foco, Enter, ausencia de controles anidados, 375/1280 px), registrado en doc 17.

**Consequences:** Una regresión puramente visual solo se detecta en navegador. T002 no se marca hasta verificarse sobre una página real (T003).

### D017 - Histórico SEO acotado y limpieza de la evolución combinada

**Date:** 2026-10-26 · **Status:** Accepted; la estimación «coste acotado a 12 lecturas» del punto 1 queda sustituida por D023. El punto 3 se amplía con D019.

**Context:** Excluir rendimiento de cada punto exige leer los hallazgos de cada auditoría (`getAudit` por auditoría). PLAN hablaba de conservar el histórico completo en el detalle. Además, la reescritura del resumen (T003) dejó sin llamantes `computeEvolution` y `EvolutionChart`.

**Decision:**
1. El detalle SEO carga hallazgos de las 12 auditorías más recientes (las que dibuja la gráfica, más la última y la anterior completadas si fueran más antiguas) y lista esas 12 con enlace a cada auditoría completa. Si hay más, lo indica. Coste acotado a 12 lecturas.
2. Se eliminan `computeEvolution` (con indicadores y tendencia) y `EvolutionChart`, y las 6 pruebas que solo los cubrían. `toPoint`, `SCORE_NOISE` y `DIRECTION_TONE` siguen en uso y `toPoint` gana 2 pruebas propias. La tabla de datos para lectores de pantalla que contenía `EvolutionChart` se conserva como `ChartDataTable` y la usan ambos detalles.
3. Ajuste vecino necesario: `ProblemsChart` repetía la marca del eje cuando el máximo era 1 (`[0, 1, 1]`), con claves de React duplicadas. Las marcas se deduplican; el dibujo no cambia.

**Consequences:** Auditorías más antiguas que las 12 últimas siguen accesibles desde la auditoría técnica, no desde el listado del detalle. La suite unitaria pasa de 369 a 365 pruebas por la retirada de código muerto.

### D018 - Una sola definición de resultado IA completo

**Date:** 2026-10-26 · **Status:** Accepted · Sustituye en parte a D012 (IA)

**Context:** La auditoría reprodujo una comparación entre dos mediciones parciales: ambas con `p2` sin respuesta válida, misma clave; `summarizeAi` devolvía `partial` y a la vez `better`. El estado y la comparación usaban definiciones distintas: la comparación solo exigía captura completa, y recoger una observación no implica una respuesta válida.

**Decision:** Resultado completo = todas las observaciones programadas recogidas (`capture.k = capture.n > 0`), todas con respuesta válida (`answers.k = answers.n`) y al menos una pregunta sin marca evaluada (`promptCoverage.n > 0`). Una función decide el estado (`ok`/`partial`) y la comparabilidad (ambas completas, misma clave, mismas preguntas evaluadas, solo la inmediatamente anterior). Las preguntas sobre la marca cuentan para la completitud aunque no para la presencia.

**Consequences:** Una medición con una repetición vacía o una pregunta de marca sin respuesta es parcial y no se compara. El motivo del estado parcial distingue captura incompleta, preguntas sin respuesta válida y respuestas recogidas sin contenido.

### D019 - Línea de velocidad segmentada por metodología

**Date:** 2026-10-26 · **Status:** Accepted · Excepción a FR-008 («sin cambiar el dibujo»), amplía D017

**Context:** El resumen rechaza comparar versiones mayores distintas de Lighthouse, pero `SpeedChart` unía todas las puntuaciones; la nota bajo la gráfica de T004 no evitaba la lectura visual de continuidad, y se calculaba sobre todas las auditorías, no sobre las mostradas.

**Decision:** Cada punto guarda su metodología (`estrategia|versión mayor`, o desconocida). Una función pura parte los puntos mostrados en segmentos de puntos consecutivos con puntuación y la misma metodología conocida; la línea solo une puntos de un mismo segmento. Una auditoría sin medición también corta la línea, igual que impide la comparación del resumen («inmediatamente anterior»). La comparación del resumen usa la misma función de metodología. La tabla accesible añade la versión. El aviso de `/performance` se calcula sobre los puntos mostrados y dice por qué se corta la línea.

**Consequences:** Puntos aislados sin línea cuando no hay continuidad que afirmar. El dibujo cambia solo en el trazo; ejes, bandas, puntos y etiquetas siguen igual.

### D020 - Atribución de los datos de visitantes reales en la tarjeta

**Date:** 2026-10-26 · **Status:** Accepted

**Context:** La tarjeta mostraba una métrica de CrUX con PageSpeed Insights como única fuente y sin alcance ni periodo.

**Decision:** La línea de visitantes reales lleva su propia fuente: «Chrome UX Report», alcance («esta página» o «todo el sitio, la portada no tiene datos propios») y periodo («del X al Y» con fechas del registro). Con alcance o periodo ausentes se dice «alcance no indicado» o «periodo no indicado». Sin datos se describe el estado observado de la consulta sin atribuir causas («Chrome UX Report no tiene datos suficientes de esta web» para `no_data`; «no se consultaron datos de visitantes reales en esta medición» en el resto). La fuente del pie sigue siendo PageSpeed Insights para la puntuación.

**Consequences:** Laboratorio y visitantes reales quedan separados también en la tarjeta. El detalle reutiliza el mismo formato de periodo.

### D021 - Textos solo con lo observado y «comparación de menciones»

**Date:** 2026-10-26 · **Status:** Accepted · Precisa D010

**Context:** Varios textos afirmaban más de lo medido: que la web responde ciertas preguntas, que no aparecer implica que se recomienda a otros, que los clientes visitan sobre todo con móvil, que las preguntas monitorizadas son «de clientes», o que una web lenta «pierde visitantes». La spec prometía «cuota de voz» y el informe muestra recuentos por marca.

**Decision:** Se reescriben para describir la medición: qué se preguntó, qué respondió ChatGPT, qué midió Google. Las acciones de contenido se formulan como revisión. El bloque del informe se llama «Comparación de menciones» y la spec se alinea. La página del run, existente y fuera del rediseño, mantiene su tabla con porcentaje entre las marcas del panel.

**Consequences:** Ningún cambio de comportamiento; las pruebas de textos de oportunidades se ajustan.

### D022 - Medición sintética de `dev` identificada como demostración

**Date:** 2026-10-26 · **Status:** Accepted

**Context:** La verificación de T006 dejó en `dev` una medición con una respuesta sintética («[PRUEBA]») en Buchhandlung Müller, empresa de prueba según D-09 del roadmap. El resumen la mostraba como «1 de 1 pregunta» con fuente «Captura asistida (ChatGPT web)» y sin ninguna marca; la mención de «sintética» solo aparecía dentro de la respuesta plegada del run. P0 no permite migraciones (no hay campo para marcar mediciones), ni borrar datos, ni filtrar por texto.

**Decision:** Identificar a nivel de empresa, el único dato editable sin esquema nuevo: renombrar la empresa de prueba desde «Editar» (validación normal de la aplicación) a «Buchhandlung Müller · DEMOSTRACIÓN, datos sintéticos». Para que el nombre quede junto a las métricas, el informe de IA y el run lo muestran (descripción del informe y ruta de navegación del run), un cambio genérico que sirve a cualquier empresa. Las mediciones existentes no se modifican ni se borran. Las nuevas verificaciones usan `visibility_test`.

**Consequences:** El nombre congelado en la configuración de la medición sigue siendo el antiguo. La identificación depende del nombre de la empresa, no de la medición: marcar mediciones individuales como sintéticas requiere un campo en `geo_runs` (P1, con migración). Reversible desde «Editar».

### D023 - Coste real de lecturas por página

**Date:** 2026-10-26 · **Status:** Accepted · Sustituye la estimación de coste de D017

**Context:** D017 hablaba de «coste acotado a 12 lecturas», pero el detalle SEO puede cargar además la última y la anterior completadas si quedan fuera de las 12 más recientes, y cada `getAudit` hace dos consultas.

**Decision:** Se documenta el coste real sin optimizar persistencia en P0 (todas las lecturas filtran por empresa):

| Página | Llamadas a `getAudit` | Consultas SQL máximas |
|---|---|---|
| Resumen | ≤ 2 | ≤ 9: empresa 1, auditorías 1, mediciones 2, preguntas 1, hallazgos 2 × 2 |
| `/performance` | ≤ 1 | ≤ 4 |
| `/seo` | ≤ 14 (12 recientes + última y anterior completadas si están fuera) | ≤ 30 |
| `/geo` | 0 | ≤ 4 |

`listAudits` trae `facts` de todas las auditorías. `listGeoRuns` (resumen y `/geo`) carga todas las mediciones con todas sus observaciones, incluido el texto de las respuestas: límite conocido de P0, pendiente de paginar o resumir en base de datos.

**Consequences:** El coste crece con el histórico GEO sin tope. Se registra como deuda, no se corrige en P0.

### D024 - 404 real en producción mediante Proxy

**Date:** 2026-10-26 · **Status:** Accepted · Corrige el supuesto de FR-006 y del roadmap (fila «Rutas de ficha y edición bloqueantes»)

**Context:** T014 detectó que, con `next start`, los ids inexistentes respondían 200 con la página de «no encontrada» en todas las rutas de empresa, incluidas las no modificadas. La documentación de Next 16 incluida en `node_modules/next/dist/docs` aclara que `instant` solo controla la validación de navegación instantánea, y que el estado no puede cambiar una vez fijado. El build prerrenderiza estas rutas con estado pospuesto (`.meta` con `"status": 200`), de modo que el estado ya está fijado cuando la página llama a `notFound()`. En `next dev` no hay prerender y el 404 sí llegaba.

**Decision:** `src/proxy.ts` (patrón documentado por Next para un 404 en tiempo de petición) comprueba, solo en peticiones de documento GET/HEAD, que la empresa existe y, si la ruta lo incluye, la auditoría o la medición de esa empresa (`src/modules/routing/`). Si no existen o el id está mal formado, reescribe a `/_not-found`, que responde 404 con la nueva página global `src/app/not-found.tsx` en español. Se descartó reescribir a la misma URL con `status: 404`, porque el estado se ignora (probado). Si la consulta falla, la petición continúa como antes.

**Consequences:** AC-008 se cumple también en producción. Hay una o dos consultas por clave primaria más por visita directa. En una visita directa, el texto es el genérico «Página no encontrada»; en la navegación interna se mantiene «Empresa no encontrada».
