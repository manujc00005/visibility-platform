# Implementation Plan: Comparativa técnica y de autoridad con competidores

## Summary

Módulo nuevo que mide en una captura la web de la empresa y las de sus competidores activos con la misma auditoría que ya existe, consulta su autoridad en Open PageRank y guarda solo métricas por sitio. La página SEO muestra la última comparativa completada en una tabla, con el motivo de cada ausencia.

## Related spec

`specs/features/011-competitor-seo-comparison/SPEC.md`; decisiones D001–D010 de esta carpeta.

## Impacted areas

- Nuevo `src/modules/competitor-comparison/`:
  - `schema.ts`: tabla y restricciones.
  - `sites.ts`: tipos, selección de sitios, paso de hechos a resultado por sitio y validación de `sites`.
  - `open-pagerank.ts`: cliente de autoridad.
  - `service.ts`: captura, lectura y concurrencia.
  - `summary.ts`: proyección para la página.
  - `deps.ts`: conexión real y estado de configuración.
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
- `src/modules/audits/{collect,deps,service,rules,crux,pagespeed}.ts` y `schema.ts`.
- `src/modules/geo/service.ts` (`listCompetitors`) y `schema.ts` (`geoCompetitors`).
- `src/modules/search-console/{deps,service,summary}.ts` como patrón de configuración, captura y proyección.
- `src/modules/bing-webmaster/` como patrón de cliente con clave.
- `src/app/workspaces/[id]/seo/` y `src/components/search-console/{search-console-section,tracked-keywords-section,refresh-button}.tsx`.
- `src/modules/search-console/schema.ts` para el patrón de CHECK con jsonpath `strict` de la 007.

### Model routing

Un solo agente con el modelo actual. Concurrencia, captura parcial y tabla accesible necesitan criterio; el resto es mecánico pero corto, y delegarlo costaría más que hacerlo. Sin herramientas de pago.

## Proposed approach

1. **Dominio puro (T001).** `selectSites` deduplica y separa los competidores sin web. `toSiteResult` convierte `AuditFacts` y hallazgos en métricas y estados, sin textos de la web. `parseComparison` valida con Zod al leer.
2. **Autoridad (T002).** `POST https://openpagerank.keywordseverywhere.com/v1/domains/bulk` con `Authorization: Bearer`, `{ domains, include_history: false }` y 15 s de límite. Devuelve un mapa por dominio o un estado común (D003).
3. **Persistencia (T003).** `competitor_comparisons` con índice único parcial `running`, CHECK de estado y forma con jsonpath `strict`, y sin función en plpgsql (D005).
4. **Captura (T004).** `runComparison(db, workspaceId, deps)`:
   - Cierra capturas colgadas.
   - Lee empresa y competidores una vez, y comprueba requisitos.
   - Inserta `running`, con choque de índice convertido en `already_running`.
   - Lanza Open PageRank y mide sitios con 3 trabajadores, sin transacción abierta.
   - Cierra con `update … where status = 'running'`. Cero filas actualizadas significa empresa borrada.
5. **Proyección (T005).** `summarizeComparison` cruza la última fila completada con los competidores activos actuales y resuelve estados de sección y de fila.
6. **Interfaz (T006).** Server Action, botón con estado pendiente, sección y textos. Las ausencias ocupan todas las columnas de su fuente (D008).
7. **Regresión, evidencia y cierre (T007–T009).** Integración completa, navegador, captura real y revisiones.

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
- **`found: false` sin documentar en `bulk`:** el esquema acepta campos ausentes o nulos y T009 lo confirma con una llamada real.
- **Dominio con subdominio:** Open PageRank responde por dominio registrado; se empareja por sufijo (D004).
- **Competidor que solo responde en `www`:** si el dominio raíz no resuelve, el sitio queda sin analizar. Se muestra el motivo y no se añaden más accesos.
- **Cuota de PageSpeed no documentada:** un 429 afecta a los sitios restantes, sin perder los medidos.
- **Duración:** hasta unos 4 minutos en el peor caso (D006). Si se cierra la pestaña, la captura termina en el servidor o se cierra por antigüedad.
- **WAF de competidores:** devuelven 403 a nuestro agente. Queda como estado, no se evita.
- **Variación de Lighthouse:** una diferencia pequeña no significa nada; lo explica FR-014.
- **Perímetro sin autenticación:** cualquiera que alcance la app puede lanzar peticiones y gastar cuota. Se añade a BL-07.
- **Número de migración:** comprobar que `0014` siga libre, porque hay sesiones paralelas.

## Test strategy

- Unitarias: selección, mapeo sin textos, cliente con matriz de errores, proyección y render en `es` y `en`.
- Integración: colector real con dobles de red, matriz de fallos por fuente, promesa retenida, concurrencia, separación de `audits`, migración y cascada.
- Navegador: fixtures `[TEST]` en la base de pruebas, 375 y 1280 px, limpiados después.
- Real: AC-016, con la tolerancia de D009.
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
