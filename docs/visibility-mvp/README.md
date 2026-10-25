# Visibility Platform — Diseño del MVP (versión 1)

Especificación de diseño del SaaS de SEO, GEO, AEO y visibilidad en IA para pymes.
Consolida los análisis independientes de Claude y de Codex del 2026-10-25 y define un MVP implementable.

**Estado: PROPUESTO.** Ninguna decisión está aprobada hasta que Codex complete la revisión cruzada
(`13-codex-review.md`) y el owner firme. Este diseño no abre trabajo de implementación ni modifica
`lead-platform`.

## Orden de lectura

| Documento | Contenido | Lectura |
|---|---|---|
| [00-analysis-comparison.md](00-analysis-comparison.md) | Matriz Claude vs Codex, acuerdos, desacuerdos y decisiones consolidadas (§7 es el vocabulario común) | Primero |
| [03-mvp-scope.md](03-mvp-scope.md) | P0 / P1 / P2 / OUT por módulo y criterio de éxito del piloto | Segundo |
| [01-product-vision.md](01-product-vision.md) | Problema, ICP, propuesta de valor, monetización | |
| [02-prd.md](02-prd.md) | Requisitos funcionales y no funcionales; fórmulas de métricas | |
| [04-architecture.md](04-architecture.md) | Arquitectura técnica, límites de módulos, seguridad, diagramas | |
| [05-data-model.md](05-data-model.md) | Entidades, relaciones, retención, volumetría | |
| [06-api-contracts.md](06-api-contracts.md) | Server Actions, webhooks, contratos internos y API pública futura | |
| [07-user-flows.md](07-user-flows.md) | Flujos, pantallas, permisos | |
| [08-provider-strategy.md](08-provider-strategy.md) | Build vs Buy, licencias, interfaces de proveedor | |
| [09-cost-model.md](09-cost-model.md) | Costes unitarios y escenarios 10 / 50 / 100 clientes | |
| [10-implementation-backlog.md](10-implementation-backlog.md) | Épicas, historias P0 con criterios y estimación | |
| [11-risks-and-open-decisions.md](11-risks-and-open-decisions.md) | Riesgos y decisiones pendientes del owner | |
| [12-adr.md](12-adr.md) | Architecture Decision Records (todos PROPUESTOS) | |
| [13-codex-review.md](13-codex-review.md) | Revisión independiente de Codex (REQUEST CHANGES); registro vivo de riesgos | |
| [16-implementation-roadmap.md](16-implementation-roadmap.md) | **Referencia operativa**: fases, estado, blockers por fase, decisiones técnicas | Para construir |

## Convenciones

- **VERIFIED / INFERRED / UNVERIFIED** etiquetan cada hecho sobre `lead-platform` o sobre proveedores externos.
  Los precios y términos de proveedores son UNVERIFIED en toda la especificación: proceden de las lecturas
  de Claude y Codex del 2026-10-25 y no se han reverificado.
- **P0 / P1 / P2 / OUT** según `03-mvp-scope.md` §1.
- Las cifras de coste son variables con valores de referencia, no presupuestos.
- Ningún documento contiene código de producción, migraciones ni dependencias instaladas.

## Fuentes

- Análisis de Claude: `lead-platform-workspace/docs/audits/2026-10-25-architecture-review-visibility-platform.md`
  (rama `docs/architecture-review-visibility-platform`, commit `bf363c8`).
- Análisis de Codex: `lead-platform-workspace/docs/audits/2026-10-25-architecture-review-visibility-platform-codex.md`.
- Código de `lead-platform` en `main`, commit `983dfb6`.
