# Implementation Plan: Comparativa técnica y de autoridad con competidores

## Summary

Módulo nuevo que mide en una captura la web de la empresa y las de sus competidores activos con la misma auditoría que ya existe, consulta su autoridad en Open PageRank y guarda solo métricas por sitio. La página SEO muestra la última comparativa completada en una tabla, con el motivo de cada ausencia.

## Related spec

`specs/features/011-competitor-seo-comparison/SPEC.md`; decisiones D001–D012 de esta carpeta.

## Impacted areas

- Nuevo `src/modules/competitor-comparison/`:
  - `schema.ts`: tabla y restricciones.
  - `sites.ts`: tipos, selección de sitios, paso de hechos a resultado por sitio y validación de `sites`.
  - `open-pagerank.ts`: cliente de autoridad.
  - `service.ts`: captura, lectura y concurrencia.
  - `summary.ts`: proyección para la página.
  - `deps.ts`: conexión real y estado de configuración.
- `src/modules/audits/collect.ts` y `fetcher/safe-fetch.ts`: política optativa de robots previa por URL de portada, con los consumidores actuales compatibles (T000/D011). Reutilizar `robots.ts` y los presupuestos existentes, sin otro transporte. Pruebas de colector/fetcher para el modo optativo y la regresión del modo anterior.
- `src/db/schema/index.ts` y migración generada `0014` con sus metadatos.
- `src/config/env.ts` y `.env.example`: `OPEN_PAGERANK_API_KEY`.
- `src/app/workspaces/[id]/seo/actions.ts` y `seo/page.tsx`.
- Nuevos `src/components/competitor-comparison/{comparison-section,comparison-button}.tsx`.
- `src/i18n/messages/{es,en}.ts`: subárbol `competitorComparison`.
- Pruebas en `tests/unit/competitor-comparison/`, `tests/integration/competitor-comparison.test.ts` y `tests/unit/i18n/messages.test.ts`.
- `docs/visibility-mvp/16-implementation-roadmap.md` al cerrar.

## Context budget

### Reading list

- Esta carpeta de spec.
- `src/modules/audits/{collect,deps,service,rules,crux,pagespeed,robots}.ts`, `schema.ts` y `fetcher/safe-fetch.ts`, con las pruebas existentes de robots, colector y fetcher. Leer solo los límites, redirects y validaciones necesarios para T000.
- `src/modules/geo/service.ts` (`listCompetitors`) y `schema.ts` (`geoCompetitors`).
- `src/modules/search-console/{deps,service,summary}.ts` como patrón de configuración, captura y proyección.
- `src/modules/bing-webmaster/` como patrón de cliente con clave.
- `src/app/workspaces/[id]/seo/` y `src/components/search-console/{search-console-section,tracked-keywords-section,refresh-button}.tsx`.
- `src/modules/search-console/schema.ts` para el patrón de CHECK con jsonpath `strict` de la 007.

### Model routing

Un solo agente con el modelo actual. Concurrencia, captura parcial y tabla accesible necesitan criterio; el resto es mecánico pero corto, y delegarlo costaría más que hacerlo. Sin herramientas de pago.

## Proposed approach

0. **Acceso respetuoso y compatible (T000).** Implementar D011 antes de capturar: política optativa en el colector y guardia de portada antes de cada petición/salto/fallback del fetcher. Cache de robots por origen y presupuesto compartido, sin recursión ni bypass SSRF. Default anterior intacto y regresiones de auditoría propia.
1. **Dominio puro (T001).** `selectSites` prioriza empresa, ordena competidores por created_at/id y deduplica antes de comprobar elegibilidad. Separar sin web y duplicados sin crear pendientes ficticios. `toSiteResult` convierte campo a campo con mapeo exacto, estados parciales y ceros válidos; `parseComparison` valida el contrato estricto de SPEC al escribir y al leer. Identidades congeladas incluyen domain y hostname.
2. **Autoridad (T002).** `POST https://openpagerank.keywordseverywhere.com/v1/domains/bulk` con `Authorization: Bearer`, `{ domains, include_history: false }` y 15 s de límite. Devuelve resultados por dominio sin depender del orden: igualdad o sufijo más largo no ambiguo (D004). Solo found:false produce not_found; ausencia inesperada/ambigüedad produce error por sitio, sin perder otros válidos. Conservar requested/effective domain, alcance registered_domain y asOf. No consumir hosts; explicar la limitación de plataformas compartidas y los referentes ponderados. Sin clave no hay red.
3. **Persistencia (T003).** `competitor_comparisons` con índice único parcial `running`, CHECK de correspondencia status/sites/error/fechas y forma con jsonpath `strict` e `IS TRUE`, sin función plpgsql (D005). Zod valida el detalle y las identidades antes de completar y al leer, sin copiar respuestas externas crudas.
4. **Captura (T004).** `runComparison(db, workspaceId, deps)`:
   - Valida workspaceId y existencia de empresa antes de cualquier cierre o inserción. Cierra solo las capturas colgadas de esa empresa.
   - Lee empresa/competidores una vez para congelar la identidad; usa el selector compartido para comprobar PageSpeed y al menos un competidor distinto después de deduplicar. Rechazos sin fila ni red. Congela nombre/domain/hostname y lista para todas las llamadas.
   - Inserta `running`, con choque de índice convertido en `already_running`.
   - Lanza Open PageRank y mide sitios con 3 trabajadores, sin transacción abierta; todos activan D011. Traducir fallos de fuente a su estado y conservar métricas válidas de otros sitios/fuentes. Solo errores internos del proceso cierran failed/internal_error.
   - Cierra por id + empresa + status running (también en el catch). Ante cero filas, relee: solo empresa borrada da not_found; una captura terminal/ausente con empresa existente da capture_closed. Nunca sobrescribir una captura cerrada ni otra posterior. Probar cierre por antigüedad con trabajador retenido y captura nueva (D012).
5. **Proyección (T005).** `summarizeComparison` cruza la última fila completada (started_at/id descendente) con la lista actual deduplicada. Empresa: workspaceId/domain/hostname; competidor: id/domain/hostname. Cambios de sitio quedan pendientes, cambios solo de nombre no invalidan mediciones. Captura ilegible da aviso y pendientes. Resuelve estados por fuente y por métrica sin ocultar valores parciales o ceros.
6. **Interfaz (T006).** Server Action, botón con pendiente y requisitos deduplicados, sección y textos, incluido capture_closed. Solo una ausencia completa ocupa todas las columnas de su fuente; datos parciales mantienen las celdas (D008). Mostrar alcance/periodo CrUX y dominio efectivo/alcance/asOf de autoridad, distinguiendo fechas de consulta y publicación; motivos por métrica ausente, conservando ceros válidos.
7. **Regresión, evidencia y cierre (T007–T009).** Integración completa, navegador, captura real y revisiones. Mapeo exacto respecto de las mismas respuestas saneadas usadas en la captura; segunda ejecución solo documenta variabilidad, sin tolerancia de aprobación. Sin clave/datos reales de autoridad, T009 y cierre pendientes (D009/D012).

## Alternatives considered

- **Reutilizar `runAudit` por competidor:** rechazada. Exige `workspaceId`, escribe en `audits` y rompería FR-008 y la evolución.
- **Añadir a `audits` una columna de dominio analizado:** rechazada por el mismo motivo, y porque guardaría hechos con textos de terceros.
- **Una fila por sitio:** rechazada. Una captura se lee y se invalida entera, y jsonb versionado es el patrón de las capturas existentes.
- **Medir solo competidores y reutilizar la última auditoría propia:** rechazada por FR-003: comparar momentos distintos engaña.
- **API antigua `getPageRank`:** rechazada. La documentación recomienda `/v1/domains/bulk`, y la antigua da `0` en lo no encontrado.
- **Common Crawl directo:** aplazado. Exige procesar 2,4 GiB al mes para el mismo dato.
- **Trabajo en segundo plano:** aplazado hasta desplegar, junto a D-12.

## Dependencies

- `PAGESPEED_API_KEY`, ya configurada.
- Cuenta gratuita de Open PageRank con la IP del operador registrada: paso del responsable. Solo la necesita la parte de autoridad de AC-016.
- Sin dependencias npm nuevas.

## Risks

- **IP de la clave gratuita:** una IP doméstica cambia y la de la cuenta solo se puede cambiar una vez por semana. La columna mostrará el motivo y el resto seguirá (FR-005).
- **Contrato vs evidencia real:** OpenAPI y referencia son las fuentes de tipos; T009 aún debe verificar un positivo y un found:false reales. Ausencia inesperada de resultado es error, nunca prueba de no encontrado.
- **Dominio con subdominio:** se empareja de forma no ambigua y se muestra dominio efectivo/alcance registrado y asOf. Hosts quedan fuera de alcance, con explicación para plataformas compartidas (D004).
- **Robots tras redirects:** la protección actual llega tarde. T000 añade política optativa antes de cada acceso y mantiene todas las defensas de fetcher y el default anterior.
- **Cierre tardío:** un trabajador antiguo no puede resucitar una captura ni finalizar otra; los cierres usan id/empresa/running y capture_closed (D012).
- **Datos parciales y cero:** un estado ok de fuente no implica todas las métricas presentes; mantener valores válidos y explicar ausencias por celda.
- **Competidor que solo responde en `www`:** si el dominio raíz no resuelve, el sitio queda sin analizar. Se muestra el motivo y no se añaden más accesos.
- **Cuota de PageSpeed no documentada:** un 429 afecta a los sitios restantes, sin perder los medidos.
- **Duración:** estimación de unos 4 minutos, no un SLA (D006). Si se cierra la pestaña, la captura termina en el servidor o se cierra por antigüedad.
- **WAF de competidores:** devuelven 403 a nuestro agente. Queda como estado, no se evita.
- **Variación de Lighthouse:** una diferencia pequeña no significa nada; lo explica FR-014.
- **Perímetro sin autenticación:** cualquiera que alcance la app puede lanzar peticiones y gastar cuota. Se añade a BL-07.
- **Número de migración:** comprobar que `0014` siga libre, porque hay sesiones paralelas.

## Test strategy

- Unitarias: selección, mapeo sin textos, cliente con matriz de errores, proyección y render en `es` y `en`.
- Integración: colector/fetcher real con dobles de red; robots prohibitivo antes del destino, fallback y límites; matriz parcial por fuente/métrica, ceros válidos, promesa retenida con cambios de competidores y empresa, cierre de vieja captura seguido de una nueva, separación de audits, migración/cascada y requisitos deduplicados.
- Contrato: pruebas SQL estructurales y de lifecycle separadas de pruebas Zod de detalle (campos extra, identidades duplicadas, fechas, rangos y estados). Mapeo exacto con valores distintos por campo para detectar intercambios y unidades equivocadas.
- Navegador: fixtures `[TEST]` en la base de pruebas, 375 y 1280 px, limpiados después.
- Real: AC-016/D009, mapeo exacto frente a las respuestas de la propia captura y variación independiente solo informativa. No cerrar sin positivo de autoridad y respuesta real found:false. Evidencia saneada sin claves, URLs completas ni contenidos.
- Regresión: suite completa, incluidas auditorías y página SEO.

## Rollback strategy

Revertir el código. La tabla y la migración son aditivas, y el código anterior las ignora, por lo que pueden quedarse sin efecto. Si no se aplica, `OPEN_PAGERANK_API_KEY` se ignora. Sin bajada de esquema ni borrado de datos. Desplegar la migración antes que el código (D-22).

## PLAN verification checklist

- [x] The plan covers all acceptance criteria.
- [x] The plan avoids behavior outside the spec.
- [x] The Context budget section is filled (reading list + model routing), not left as placeholder.
- [x] Risks are documented.
- [x] Test strategy is documented.
- [x] Rollback strategy is documented.
- [x] SPEC.md status has been updated to `Ready`.
