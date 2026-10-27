# Implementation Plan: Overview comercial por empresa

## Summary

Plan activo actualizado tras D010–D014. Preparar resúmenes puros con resultado e intento separados; componer un overview de tres tarjetas y oportunidades con evidencia; reutilizar los informes y separar configuración GEO. Implementar únicamente P0.

## Related spec

`specs/features/002-dashboard-overview/SPEC.md`. Sus reglas de estados y criterios son la fuente de verdad del comportamiento.

## Impacted areas

- `src/modules/overview/{performance,seo,ai,opportunities,types}.ts` e `index.ts`: adaptar el trabajo iniciado; `isStale` y sus tipos pueden vivir en `types.ts` sin imponer un archivo adicional.
- Nuevos componentes `src/components/overview/{overview-card,workspace-nav,opportunities,page-header}.tsx`.
- Nuevas rutas `/workspaces/[id]/performance`, `/seo` y `/geo/setup`; adaptar overview y `/geo`.
- Ajustes mínimos en `src/components/audits/evolution-chart.tsx`, `src/modules/audits/status.ts` (reutilizar `isCategoryChecked`, ya exportada en el árbol actual), acciones GEO y de auditoría para revalidación, y enlaces de vuelta en auditoría/run.
- Pruebas `tests/unit/overview/*.test.ts`; documentación `docs/visibility-mvp/17-dashboard-product-design.md`.
- D017 (aplicado en T005): `computeEvolution` y `EvolutionChart` retirados por quedar sin uso; `ProblemsChart`, `SpeedChart`, sus leyendas y `ChartDataTable` exportados; el detalle SEO lista y grafica las 12 auditorías más recientes.

## Context budget

### Reading list

- Los cuatro documentos de esta feature y los archivos ya iniciados en `src/modules/overview/`.
- `src/modules/audits/{evolution,status,presentation,rules,service,pagespeed,crux}.ts`: tipos, categorías, disponibilidad y lecturas. No editar las reglas.
- `src/modules/geo/{service,metrics,presentation,schema}.ts`: métricas, observaciones, configuración congelada y comparabilidad.
- Páginas actuales de empresa, auditoría, GEO y run; acciones de auditoría y GEO; `status-ui.tsx`, `evolution-chart.tsx`, `geo-forms.tsx`.
- `tests/unit/audits/evolution.test.ts`, pruebas GEO de métricas y `package.json` para patrón y comandos.

### Model routing

Un único agente con el modelo configurado en el chat; sin delegación ni cambio de modelo. Lectura limitada a la lista anterior, ampliable solo para resolver un tipo/importación o fallo concreto.

## Proposed approach

1. **Resúmenes puros (T001).** Adaptar los archivos iniciados a FR-001/002 y las reglas de estados. Separar resultado, último intento y antigüedad con reloj inyectable. SEO filtra `performance` antes de calcular titular, conteos, áreas y cambios; cobertura desconocida/distinta no se compara. IA usa `promptCoverage` y `citationRate` con sus unidades, separa preguntas no evaluadas y aplica D012 sin saltos históricos. Oportunidades permiten cero candidatos y devuelven un estado de evidencia suficiente/parcial/ausente.
2. **Componentes (T002).** `OverviewCard` es un único Link sin controles anidados; estado con texto e icono, fuente/fecha y avisos. `WorkspaceNav` con activo y foco. Google limita su contenido a AC-014. `Opportunities` explica acción, prioridad, evidencia y límites. Exportar `ProblemsChart` y `SpeedChart` sin cambiar el dibujo.
3. **Overview (T003).** Cabecera, navegación, tres tarjetas y oportunidades. Cargar workspace, `listAudits`, `getAudit` para las dos completadas más recientes, `listGeoRuns` y preguntas activas. Mantener resultados e intento identificados por separado; no ejecutar capturas ni llamadas externas durante render. Enlazar IA a configuración cuando falta configurar/medir y a informe cuando hay resultados.
4. **Rendimiento y SEO (T004/T005).** Reutilizar métricas y hallazgos. Rendimiento distingue laboratorio/CrUX, disponibilidad por métrica, histórico y motivo de ausencia. SEO muestra seis áreas y Search Console no disponible. Para la gráfica SEO, obtener hallazgos del histórico mediante `getAudit` y construir puntos sin rendimiento; no reutilizar contadores globales. Navegación a auditoría completa y 404 real.
5. **GEO (T006).** `/geo` contiene observaciones GEO y apartado de preguntas/AEO con límites de AC-016. `/geo/setup` conserva formularios y redirecciones existentes. Revalidar las rutas afectadas según FR-007, incluidas acciones de captura/refresh. Conservar resultados históricos si cambia la configuración actual. No modificar esquema, proveedores ni captura.
6. **Verificación (T007).** Ejecutar los cuatro comandos de AC-010. Verificar rutas con/sin datos e ids inexistentes, teclado, carga, parcial/error/antiguo y responsive a 1280/375 px; usar fixtures de pruebas para fallos sin provocar llamadas de pago ni fallos externos. Registrar entorno, capturas y resultados en doc 17. La comprobación humana de diez segundos es requisito de cierre; si no hay participante, queda pendiente explícita.

## Risks and limits

- `listGeoRuns` carga todas las observaciones históricas. Reutilizarla una sola vez por página, sin consultas por observación ni lecturas duplicadas. Registrar número de runs/observaciones y duración observada del overview durante verificación local. La optimización de consultas/paginación queda fuera de este rediseño; no presentar la comprobación local como prueba de escala.
- El histórico SEO requiere lecturas de hallazgos por auditoría. En el overview se limitan a dos; el detalle conserva el histórico existente y documenta su coste. No se introducen nuevas consultas ni contratos de persistencia. *(Sustituido por D017 y D023: el detalle SEO no conserva todo el histórico, sino las 12 auditorías más recientes; coste real en D023.)*
- Los datos históricos sin versión Lighthouse o cobertura conocida no se comparan. Los resultados parciales se explican y no se transforman en señales positivas.
- La prueba humana puede requerir coordinación para cerrar la feature; no impide implementar ni ejecutar el resto de verificaciones.

## Reviews and rollback

Revisiones pendientes antes del cierre: frontend/QA, lógica de resúmenes y rendimiento/acceso a datos. Seguridad verifica alcance por empresa en lecturas y acciones; no hay autenticación nueva, contratos API ni migraciones que revisar. El análisis de consistencia no sustituye estas revisiones ni las pruebas.

Sin despliegue en producción ni cambios persistentes de esquema. Para revertir este rediseño, restaurar únicamente los cambios de esta feature en componentes/rutas y revalidaciones, preservando datos y trabajo ajeno; no usar comandos destructivos sobre el árbol compartido.

## Correcciones tras la auditoría del 2026-10-26 (T008–T014)

Cambios mínimos dentro de P0, sin esquema, dependencias, proveedores, captura, reglas ni PDF:

1. **IA (T008, D018):** una función de resultado completo en `src/modules/overview/ai.ts` usada por `summarizeAi` y `compareRuns`; motivo de parcialidad coherente. Pruebas que fallan antes del cambio.
2. **Velocidad (T009, D019):** metodología de cada punto (`toPoint`) y segmentación pura en `src/modules/audits/evolution.ts`, compartidas con la comparación del resumen; `SpeedChart` dibuja un trazo por segmento; tabla accesible con la versión; avisos de `/performance` sobre los puntos mostrados.
3. **CrUX (T010, D020):** `fieldLine` devuelve también fuente, alcance y periodo; la tarjeta los muestra aparte de la fuente de laboratorio.
4. **Textos (T011, D021):** `geo/page.tsx`, `opportunities.ts`, `performance/page.tsx` y la tarjeta de IA describen solo lo observado; «Comparación de menciones».
5. **Dato sintético de `dev` (T012, D022):** identificación como demostración sin borrar ni filtrar por texto; nuevas verificaciones en `visibility_test`.
6. **Documentación (T013, D023):** TASKS, PLAN, coste real de lecturas, doc 17.
7. **Verificación (T014):** cinco comandos y navegador con datos reales y datos de prueba identificados.
