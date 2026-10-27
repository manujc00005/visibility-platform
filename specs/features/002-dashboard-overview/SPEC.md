# Feature Spec: Overview comercial por empresa (rediseño P0 del dashboard)

## Status

In Progress — 2026-10-26.

## Problem

La página de empresa (`/workspaces/[id]`) es un panel técnico: banner de la última auditoría, indicadores, gráfica, lista de auditorías, un enlace a IA y la ficha. Un propietario de pyme sin conocimientos de SEO/GEO no puede responder en diez segundos cómo está su web, si le encuentran en Google, si aparece en respuestas de IA, si mejora y qué debería corregir primero. La configuración GEO y sus resultados comparten pantalla.

## Goal

Un overview por empresa con tres tarjetas clicables (Rendimiento de tu web · Visibilidad en Google · Presencia en IA), una sección «Tus próximas oportunidades» con hasta tres acciones basadas en hallazgos reales, y vistas de detalle navegables para cada bloque. Todo con datos existentes (PageSpeed, CrUX, auditoría técnica, mediciones GEO). Sin cifras inventadas, sin puntuaciones compuestas, sin nuevas integraciones.

## Non-goals

- Google Search Console, OAuth, clics o impresiones reales (P1). Solo se propone la experiencia de conexión como estado vacío explícito, sin enlace.
- PageSpeed de escritorio (la integración actual mide solo móvil): se declara «no disponible», no se añade.
- Índice global de salud SEO o «AEO Score» (B06).
- Análisis del contenido de la web frente a preguntas comerciales (AEO real, P1). El apartado AEO se construye con las preguntas monitorizadas y las respuestas observadas.
- Informes PDF comerciales, suscripciones, agencias, marca blanca (P2).
- Cambios de esquema, migraciones o lógica de captura/integraciones del backend. Se permite ensamblar lecturas existentes y ajustar la revalidación de las acciones afectadas. Cambios en `lead-platform`. Automatizaciones que modifiquen la web del cliente.

## Users / Actors

- Propietario de pyme (lector objetivo del overview y los detalles).
- Operador (único usuario real hoy): ejecuta auditorías y configura la medición GEO.

## Current behavior

- `computeEvolution(audits)` ya produce titular, tendencia e indicadores a partir de auditorías completadas; `auditHeadline`, `categoryStatuses` y `rateMetric` clasifican sin inventar puntuaciones.
- `listAudits` devuelve auditorías sin hallazgos; `getAudit` devuelve auditoría + hallazgos ordenados por severidad.
- `listGeoRuns` devuelve cada medición con sus métricas (`GeoMetrics`, fracciones k de n) y `methodologyKey`; solo son comparables runs con la misma clave.
- `/geo` mezcla configuración (alias, competidores, preguntas, nueva medición) y listado de mediciones.
- `EvolutionChart` dibuja problemas y velocidad en un único componente.

## Desired behavior

1. **Overview** (`/workspaces/[id]`): cabecera (nombre, dominio, sector, ciudad; acciones «Ejecutar auditoría» y «Editar»), navegación de secciones (Resumen · Rendimiento · Google · IA), tres tarjetas en tres columnas en escritorio y una en móvil, sección «Tus próximas oportunidades», y nada más. La ficha completa sale del overview (sigue en «Editar»). El histórico técnico se traslada a los detalles.
2. **Tarjeta Rendimiento**: puntuación móvil sobre 100 con veredicto (Bueno/Mejorable/Malo), evolución frente a la auditoría completada inmediatamente anterior solo con puntuaciones disponibles, misma estrategia y misma versión mayor de Lighthouse; el cambio se señala con diferencias de al menos `SCORE_NOISE`, fecha de la medición, principal problema detectado y una línea sobre datos de campo («Sin datos de visitantes reales» cuando CrUX no tiene datos). Si no se midió: motivo real (no configurado, cuota, error) sin cero.
3. **Tarjeta Google**: titular técnico, conteos de críticos e importantes de SEO, cambio comparable y fecha. Aviso «Posicionamiento todavía no medido» y explicación breve de que falta Search Console. Las seis áreas y sus semáforos se muestran en el detalle. Los conteos y cambios excluyen siempre la categoría `performance`.
4. **Tarjeta IA**: «Tu negocio aparece en k de n preguntas evaluadas», usando `promptCoverage`: preguntas sin marca con al menos una respuesta válida. Se informa aparte el total configurado en esa medición, las preguntas sin respuesta válida y las preguntas sobre la marca (excluidas del indicador). Citas mediante `citationRate`, expresadas como respuestas, no preguntas. Fecha y proveedor del resultado; comparación con la medición completada inmediatamente anterior solo según FR-002. La configuración activa actual no cambia el denominador de una medición histórica. Una pregunta evaluada sin mención puede sugerir una revisión, nunca demostrar falta de contenido.
5. **Oportunidades**: hasta tres tarjetas ordenadas por prioridad (alta/media/baja), cada una con problema, por qué importa, acción recomendada, prioridad, evidencia y fuente/fecha, y enlace al detalle correspondiente. Solo a partir de hallazgos o métricas reales. Sin resultados utilizables: «Todavía no podemos recomendar mejoras», con acción para ejecutar auditoría o configurar IA. Con resultados parciales o alguna sección sin medir: «Las recomendaciones se basan en los datos disponibles» y se indica lo pendiente. Solo con SEO comprobado, rendimiento medido e IA evaluada, sin candidatos: «No hemos detectado problemas prioritarios en las mediciones disponibles». Se pueden mostrar cero oportunidades; nunca se inventan para llenar la lista.
6. **Detalle Rendimiento** (`/workspaces/[id]/performance`): puntuación móvil, escritorio «no disponible», LCP/CLS/TBT/FCP de laboratorio con explicación, datos reales (LCP/INP/CLS) solo cuando CrUX tiene datos, histórico de puntuaciones, problemas de rendimiento ordenados por importancia con recomendación, enlace a la auditoría técnica completa.
7. **Detalle Google** (`/workspaces/[id]/seo`): bloque «Posicionamiento en Google» como estado no disponible (Search Console) sin enlace; bloque «Salud técnica» con titular, conteos, seis áreas (Indexabilidad, Metadatos, Estructura, Sitemap, Canonicals, Datos estructurados), problemas (no de rendimiento) con recomendación y evidencia; histórico de auditorías (gráfica de problemas exclusivamente de SEO y listado con enlace a cada auditoría completa).
8. **Detalle IA** (`/workspaces/[id]/geo`): resultados. Apartado GEO (menciones, citas, cobertura, comparación de menciones con competidores confirmados (respuestas que nombran a cada marca; sin porcentaje de cuota en P0, D021), proveedor, fechas, histórico de mediciones) y apartado «Preguntas y oportunidades (AEO)» con preguntas evaluadas donde aparece / donde no aparece, y preguntas sin respuesta válida separadas. Propone revisar contenido y pertinencia de las preguntas; declara «No hemos analizado si tu web responde estas preguntas». No diagnostica cobertura del contenido ni garantiza presencia futura. Configuración movida a `/workspaces/[id]/geo/setup` (alias, competidores, preguntas, nueva medición) reutilizando formularios y acciones existentes.
9. **Estados** en cada bloque: sin configurar, sin datos, analizando (auditoría en curso / medición recogiendo), completado, parcial (portada no leída, rendimiento no medido), error (última auditoría fallida), datos antiguos (última medición de hace más de 30 días). Un cero es válido únicamente con medición suficiente y denominador válido; la ausencia de datos se representa como «Sin datos». Aplicar la precedencia descrita debajo.

## Reglas de estados y comparabilidad

- Resultado y último intento son dimensiones separadas. Cada bloque conserva el último resultado utilizable y su fecha aunque el intento posterior esté en curso o falle; añade «Actualizando» o el error del último intento. No sustituye resultados por ceros ni los fecha con el intento fallido. Si no hay resultado utilizable, muestra el estado del intento o de configuración con una acción concreta.
- En SEO, una auditoría con portada no leída es parcial: las áreas dependientes del HTML quedan «No comprobado». Sus conteos no se comparan con una auditoría de distinta cobertura. El estado global no es positivo si falta comprobar la portada. Un resultado parcial reciente se muestra como parcial; cualquier referencia a uno anterior se fecha por separado.
- En IA, `completed` indica que terminó la recogida, no que tuvo éxito. Sin respuestas válidas sin marca, el indicador de presencia es «Sin datos», aunque existan respuestas sobre la marca; si todas las observaciones fallan, estado error. Con algunas preguntas sin marca sin respuesta válida o repeticiones fallidas/inciertas, estado parcial y cobertura de captura visible. No se generan oportunidades de preguntas que no recibieron respuesta válida. `collecting` añade «Recogiendo respuestas»; si ya existe resultado, lo conserva.
- Resultado IA completo (D018): todas las observaciones programadas se recogieron, todas tienen respuesta válida y hay al menos una pregunta sin marca evaluada. Recoger una observación no implica obtener una respuesta válida. Esta única definición decide el estado (`ok` frente a `partial`) y si una medición puede compararse.
- Sin mediciones y sin preguntas activas: «Sin configurar» y enlace a `/geo/setup`. Con preguntas y sin mediciones: «Sin mediciones». Si se archivan todas las preguntas tras una medición, se conserva el resultado histórico con su configuración y un aviso para configurar una nueva medición.
- Datos antiguos es un aviso adicional, compatible con cualquier resultado: más de 30 × 24 horas desde la fecha del resultado (auditoría: `startedAt`; GEO: `completedAt`, con `createdAt` como respaldo). Exactamente 30 días no activa el aviso; N son días completos. El reloj se inyecta para pruebas.
- Una comparación describe dos mediciones concretas, nunca crecimiento comercial. En IA exige misma `methodologyKey`, ambos resultados completos según la definición anterior, denominador sin marca mayor que cero y las mismas preguntas sin marca efectivamente evaluadas. Se usa únicamente la medición completada inmediatamente anterior: no se salta una configuración distinta buscando otra antigua. Se presenta «Antes: k de n», sin extrapolar a todas las búsquedas de IA.

## Functional requirements

- FR-001: Nuevo módulo puro `src/modules/overview/` sin E/S: `summarizePerformance`, `summarizeSeo`, `summarizeAi`, `buildOpportunities`, `seoAreaStatuses`, `isStale`. Entradas: auditorías (`AuditLike` + facts), hallazgos de las auditorías necesarias para SEO (última y anterior en overview; histórico en detalle), mediciones GEO (`GeoRunView`) y número de preguntas activas. Los resúmenes reciben reloj inyectable y separan resultado, último intento y aviso de antigüedad.
- FR-002: Las comparaciones reutilizan las reglas existentes: `SCORE_NOISE` (cambio con diferencia absoluta ≥ 10) para velocidad con estrategia y versión mayor Lighthouse iguales y conocidas; diferencia de críticos+importantes de SEO, excluyendo `performance` en ambos lados y con igual cobertura de comprobaciones; reglas GEO del apartado anterior. Versiones o cobertura desconocidas impiden comparar. Sin comparación comparable, se muestra «Sin comparación» o nada, nunca una flecha.
- FR-003: Cada tarjeta es un único `<Link>` con área completa clicable, foco visible y `aria-describedby`/texto suficiente; el color nunca es la única señal (icono + texto, como en `status-ui`).
- FR-004: Oportunidades: candidatos de hallazgos críticos (alta), velocidad móvil mala (alta) o mejorable (media), importantes de metadatos/sitemap/canonical/indexabilidad (media), preguntas IA evaluadas sin mención (media, acción de revisión con incertidumbre explícita), datos estructurados ausentes (baja). Una por tipo, máximo tres, prioridad estable. Sin afirmar que los datos estructurados garanticen presencia en IA.
- FR-005: Fuentes y fechas: cada tarjeta y cada oportunidad nombra la fuente (PageSpeed Insights, Chrome UX Report, auditoría técnica, medición en ChatGPT con proveedor) y la fecha de la medida. Una métrica de visitantes reales mostrada en el resumen nombra Chrome UX Report, su alcance (portada o todo el sitio) y su periodo, o declara que falta ese dato (D020).
- FR-006: Rutas nuevas (`/performance`, `/seo`, `/geo/setup`) bloqueantes (`instant = false`) como las existentes para devolver 404 real. *(Nota 2026-10-26, D024: `instant = false` no garantiza el 404 en el build de producción; el 404 real lo da `src/proxy.ts`.)* Sin pantallas vacías: cada ruta tiene estado sin datos con la acción que lo resuelve.
- FR-007: Las acciones GEO afectadas revalidan `/geo`, `/geo/setup` y el overview cuando cambien sus datos, incluidas captura manual y actualización de resultados; conservan la revalidación del run. `createRunAction` sigue redirigiendo al run. La ejecución de auditorías mantiene coherentes overview y detalles de rendimiento/SEO.
- FR-008: `EvolutionChart` se divide en `ProblemsChart` y `SpeedChart` exportados; sin cambiar el dibujo. Excepción (D019): la línea de `SpeedChart` se interrumpe entre puntos consecutivos no comparables (sin puntuación, o con estrategia o versión mayor de Lighthouse distinta o desconocida); puntos, fechas, valores y tabla accesible se conservan. El detalle SEO suministra puntos calculados con hallazgos sin `performance`, nunca los contadores globales de la auditoría.
- FR-009: Sin nuevas dependencias, sin cambios de esquema, sin tocar `src/modules/audits/rules.ts` ni el PDF.

## Acceptance criteria

- AC-001: Overview con tres tarjetas y oportunidades; sin lista de auditorías, gráfica ni ficha.
- AC-002: Con auditoría sin PageSpeed configurado, la tarjeta de rendimiento muestra «No medida» y el motivo; nunca «0/100».
- AC-003: Con dos auditorías cuya puntuación difiere menos de 10 puntos, la tarjeta no muestra mejora ni empeoramiento.
- AC-004: Sin preguntas activas ni mediciones, IA muestra «Sin configurar» y enlaza a `/geo/setup`; con preguntas pero sin mediciones, «Sin mediciones»; con un run `collecting`, «Recogiendo respuestas». Archivar todas las preguntas conserva el último resultado fechado y ofrece configurar una nueva medición.
- AC-005: IA compara únicamente las dos mediciones completadas consecutivas con misma `methodologyKey`, captura completa y el mismo conjunto evaluado sin marca con denominador > 0. Un caso A/B/A no compara la última A con la primera. Resultados parciales, denominador cero o preguntas efectivamente evaluadas distintas no muestran cambio.
- AC-006: Oportunidades: máximo tres, prioridad descendente, una por tipo, con evidencia textual de un hallazgo o métrica real; sin resultados utilizables, «Todavía no podemos recomendar mejoras» y acción concreta; con alguna sección parcial/sin medir se declara el límite; solo con SEO comprobado, rendimiento medido e IA evaluada sin candidatos se muestra el mensaje de ausencia de problemas prioritarios.
- AC-007: Última auditoría de hace más de 30 días → aviso «Datos de hace N días» en las tarjetas que dependen de ella.
- AC-008: `/seo`, `/performance`, `/geo` y `/geo/setup` responden con contenido para una empresa sin auditorías ni mediciones, y 404 para un id inexistente.
- AC-009: Navegación por teclado: cada tarjeta y cada enlace de navegación recibe foco visible y se activa con Enter.
- AC-010: `npm run lint`, `npm run typecheck`, `npm run test:unit` y `npm run build` en verde; pruebas unitarias del módulo `overview`.
- AC-011: A 375 px no hay desbordamiento horizontal en overview ni en los detalles.
- AC-012: Con 10 preguntas sin marca configuradas, 4 evaluadas y 2 con mención, IA muestra «2 de 4 preguntas evaluadas» y 6 sin respuesta válida; las preguntas sobre la marca se informan aparte. Las citas usan respuestas como unidad. Un denominador cero muestra «Sin datos»; 0 menciones de 4 preguntas válidas sí muestra «0 de 4».
- AC-013: Un intento reciente fallido o en curso conserva el último resultado utilizable con su fecha y aviso del intento. Sin resultado previo muestra error/analizando según corresponda. Auditoría con portada no leída no muestra SEO positivo; GEO completado con fallos parciales muestra parcial, todas las observaciones fallidas muestra error, y solo respuestas de marca muestra presencia «Sin datos». No hay oportunidades para preguntas sin respuesta válida.
- AC-014: Un cambio exclusivamente de rendimiento deja iguales los conteos, titular y comparación SEO. La gráfica SEO excluye `performance` en cada punto; cobertura distinta/desconocida no genera flecha de mejora. Las seis áreas están en el detalle; la tarjeta contiene únicamente titular, conteos, cambio comparable, fecha y explicación de posicionamiento no medido.
- AC-015: Antigüedad comprobada con reloj fijo para auditorías y GEO: exactamente 30 días sin aviso; más de 30 días con aviso y días completos. Un intento reciente fallido/en curso no rejuvenece el resultado. Velocidad con versión mayor Lighthouse distinta/desconocida no se compara; diferencias de ±9 puntos son ruido y ±10 sí son cambio cuando la metodología es comparable.
- AC-016: Rendimiento distingue laboratorio y CrUX; LCP/CLS/TBT/FCP tienen explicación, INP solo aparece con datos de campo válidos y escritorio declara disponibilidad real. Google muestra Search Console no disponible sin enlace y hallazgos con evidencia. IA muestra fuente, fecha, competidores confirmados y límites de AEO; no afirma que ausencia de mención implique contenido ausente. Cada oportunidad tiene fuente/fecha y evidencia enlazada.
- AC-017: Al añadir/archivar preguntas, guardar configuración o registrar/actualizar observaciones, overview, resultados, configuración y run reflejan los cambios que les correspondan al navegar sin recarga forzada; la configuración congelada de runs históricos permanece intacta. Crear medición conserva la redirección al run. Ejecutar auditoría actualiza overview y detalles. Ninguna tarjeta contiene botones/enlaces anidados.
- AC-018: El implementador verifica en navegador estados de carga, vacío, parcial, error y datos antiguos, además de navegación y foco a 1280/375 px; registra capturas y resultados en doc 17. Antes de cerrar, el propietario del proyecto o una persona ajena a la implementación identifica, tras diez segundos de overview, el estado de cada bloque (incluido «no medido») y la primera acción recomendada. Se registra respuesta y cualquier fallo de comprensión; no se da esta comprobación por realizada sin participante.
- AC-019: El diff de implementación mantiene P0: sin dependencias nuevas, migraciones, cambios de proveedores/captura, reglas de auditoría o PDF; no toca `lead-platform`. Las únicas adaptaciones de backend son ensamblar lecturas existentes y revalidar rutas. No hay commits automáticos ni despliegue en producción. La doc 17 registra componentes creados, funcionalidades reutilizadas, limitaciones, pruebas ejecutadas y siguientes pasos.

### Criterios añadidos tras la auditoría del 2026-10-26 (D018–D023)

- AC-020: El resultado IA completo se define una sola vez (D018) y se usa para el estado y para la comparación. Sin cambio cuando ambas mediciones dejan la misma pregunta sin respuesta válida, cuando solo una es parcial, con una repetición recogida sin respuesta válida, con captura incompleta, con denominador cero o con conjuntos evaluados distintos. Dos mediciones completas y compatibles sí se comparan. A/B/A sigue sin saltos. Las pruebas de los dos primeros casos fallan con la implementación anterior.
- AC-021: La línea de velocidad une solo puntos consecutivos con puntuación y la misma metodología conocida (estrategia y versión mayor de Lighthouse); se interrumpe con versión distinta, versión desconocida o auditoría sin medición. Se conservan puntos, fechas, valores y la tabla accesible, que indica la versión de cada medición. Los avisos se calculan sobre los puntos mostrados. Pruebas unitarias de la segmentación y verificación visual con metodología igual, distinta y desconocida.
- AC-022: Con datos de visitantes reales, la tarjeta de rendimiento identifica Chrome UX Report como fuente de esa métrica, distingue portada (URL) de todo el sitio (origen) y muestra el periodo con texto breve; los datos de origen nunca se atribuyen solo a la portada. Si falta el alcance o el periodo, lo declara sin inventarlo. Sin datos, declara la ausencia sin inventar causas. La puntuación sigue atribuida a PageSpeed Insights (laboratorio). Pruebas de URL, origen, metadatos ausentes y sin datos.
- AC-023: Los textos describen solo lo observado: no afirman que la web responda preguntas, que una ausencia de mención implique que se recomienda a otros, ni hábitos de dispositivo de los clientes. Las acciones de contenido se plantean como revisión. El informe llama «Comparación de menciones» a los recuentos por marca.
- AC-024: La medición sintética existente en `dev` (Buchhandlung Müller, «[PRUEBA]») queda identificada como demostración en el resumen, en el informe junto a sus métricas y en el run, sin borrar datos y sin filtros que busquen texto. Las nuevas verificaciones con datos de prueba usan `visibility_test` con la guardia del proyecto.
- AC-025: TASKS refleja el estado real; PLAN refleja D017; el coste real de lecturas por página distingue llamadas a `getAudit` de consultas SQL (D023); la carga completa del histórico GEO consta como límite; la doc 17 registra las correcciones y su evidencia. `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:integration` y `npm run build` en verde.

## Source of Truth Matrix

| Concepto | Fuente de verdad | Documentos dependientes |
|---|---|---|
| Reglas, estados, unidades y criterios | SPEC.md | PLAN, TASKS, pruebas |
| Decisiones y límites de P0 | DECISIONS.md | SPEC, PLAN, TASKS |
| Archivos y ensamblaje de lecturas | PLAN.md y tipos del código existente | TASKS, implementación |
| Verificación y cobertura de criterios | SPEC.md y TASKS.md | doc 17, revisión final |

## Reviews required

- Frontend y QA: navegación, accesibilidad, estados, legibilidad y criterios de aceptación.
- Backend/lógica: resúmenes puros, selección de resultados, denominadores y revalidación.
- Rendimiento y acceso a datos: reutilización de lecturas, carga de histórico y ausencia de llamadas externas al abrir páginas.
- Sin migraciones ni nuevos endpoints. Comprobar en revisión de seguridad que las rutas mantienen el alcance por empresa existente; no introducir autenticación ni acceso público nuevo.

## Open questions

Ninguna bloqueante. Supuestos declarados en DECISIONS.
