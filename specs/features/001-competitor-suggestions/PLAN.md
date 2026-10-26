# Implementation Plan: Sugerencia de competidores

## Summary

Plan activo revisado el 2026-10-26. Captura asistida → extracción pura → lectura segura de portadas → asociación y evaluación de indicios → revisión y confirmación del operador. Hasta cinco candidatos, sin porcentajes de confianza, API de pago ni alteraciones de métricas GEO. Reemplaza íntegramente el enfoque previo; las sustituciones quedan registradas en DECISIONS.

## Related spec

`specs/features/001-competitor-suggestions/SPEC.md`

## Impacted areas

- `src/modules/geo/competitors/`: `extract.ts`, `evaluate.ts`, `page-head.ts`, `exclusions.ts`, `service.ts`, `schema.ts`.
- `src/modules/geo/service.ts`: validación compartida, transacciones de alta manual/aceptación y bloqueo coherente para escritores de competidores.
- `src/modules/geo/detection.ts`: exponer o extraer el normalizador existente sin cambiar su semántica; no duplicar normalizadores divergentes.
- `src/modules/geo/prompt-suggestions.ts`: plantilla de sector compartida y nueva `discoveryQuestions`; conservar la salida actual de `suggestPrompts`.
- `src/modules/audits/fetcher/safe-fetch.ts`: deadline que incluya DNS y cancelación efectiva; pruebas de regresión de auditoría.
- Exportaciones de esquema y migración incremental siguiente al journal, previsiblemente `0005_competitor_suggestions.sql`.
- `src/app/workspaces/[id]/geo/actions.ts`, `geo/page.tsx` y `src/components/geo/competitor-suggestions.tsx`.
- Tests de reglas, fetcher y DB; registro de cierre en `docs/visibility-mvp/16-implementation-roadmap.md`.

## Context budget

### Reading list

- SPEC, PLAN, TASKS y DECISIONS de esta feature, sin otras specs.
- `src/db/client.ts` (pool pg y transacciones Drizzle), `src/modules/geo/service.ts`, `schema.ts`, `detection.ts`, `prompt-suggestions.ts`: competidores, validación, fuentes y transacciones existentes.
- `src/modules/audits/fetcher/safe-fetch.ts`, `address-policy.ts` y pruebas del fetcher: DNS, transporte, redirects, límites y cancelación.
- `src/modules/audits/html.ts`, `deps.ts`; `src/modules/workspaces/domain.ts` y escritura de ficha para revisar concurrencia con extracción.
- Acciones/página GEO y formularios existentes; exportaciones de DB, journal y última migración aplicada.
- Tests de GEO, empresas, fetcher y soporte de DB `test`; consultar configuración de Drizzle para compatibilidad de transacciones antes de elegir la firma compartida.
- No hace falta revisar proveedores de pago, informes PDF ni documentos históricos de arquitectura para implementar esta feature.

### Work allocation

- Mantener una implementación secuencial y revisable: reglas puras, fetcher, persistencia, UI y pruebas.
- Revisar con especial cuidado los cambios compartidos de fetcher y de alta manual; la simplificación del ranking no elimina esos riesgos.

## Proposed approach

1. **Esquema.** Crear las tres tablas y restricciones de SPEC. No añadir score ni un registro de proveedores. Confirmar número real de migración. Exponer esquema y tipos sin aplicar cambios a producción.
2. **Preguntas y normalización.** Compartir plantilla de sector y normalización de nombres existentes. `discoveryQuestions` añade alternativas a la propia marca; no afirmar que esta plantilla ya existe en `suggestPrompts`.
3. **Extracción y asociación (`extract.ts`).** `assistedCaptureSource.extract` obtiene nombres y referencias sin E/S. Filtrar encabezados genéricos, conservar marcas cortas y vínculos explícitos. Tras red, `associateCandidates` usa títulos solo cuando la coincidencia sea única; una URL de artículo no demuestra titularidad. Conservar ambigüedades como tales.
4. **Exclusiones (`exclusions.ts`).** Hostname sin `www.`, igualdad/sufijo con frontera de punto para hosts conocidos, nombres/alias, descartes prefijados y competidores activos/archivados. Reaplicar al destino de redirects y al publicar. Sin cálculo de eTLD+1 ni dependencias nuevas para ello.
5. **Lector (`page-head.ts`).** Usar `createSafeFetcher`, `decodeHtml`, `extractPage` y lectura acotada de dirección/cobertura JSON-LD. Exponer resultado, fragmentos, URL inicial/final y fecha. No seguir enlaces. 20 hostnames, concurrencia 5, 25 intentos con redirects; 256 KiB/5 s acumulados por candidato y deadline global externo de 15 s. Un exceso de tamaño produce `unverified`, sin guardar cuerpo parcial ni HTML.
6. **Deadline real.** Extender el fetcher con cancelación y plazo absoluto sin cambiar las garantías de validación/IP fijada. Incluir espera DNS; si el resolver no permite abortar, ignorar su resolución tardía e impedir que continúe al transporte. Destruir peticiones/cuerpos pendientes al cancelar. Cada salto usa tiempo y bytes restantes del candidato. Reservar 256 KiB por intento dentro del máximo de 25 para un tope conservador total de 6.400 KiB; no depender de un contador de bytes concurrente para un límite más ajustado. Cubrir regresión de auditorías existentes.
7. **Evaluación (`evaluate.ts`).** `evaluateCandidates` puro aplica FR-002/003 y el orden exacto FR-003b, sin pesos ocultos ni score. Preservar evidencia y estado desconocido. Una pregunta correcta nunca acredita al candidato.
8. **Extracción (`service.ts`).** Validar límites antes de red, congelar contexto y última extracción, calcular huella estable y devolver repetición existente. Hacer red fuera de transacciones. Publicar en una transacción corta: bloquear empresa, releer contexto/última extracción, rechazar conflicto, revalidar exclusiones, guardar extracción y marcar pendientes anteriores `superseded`. Las fechas de publicación deben mantener el orden definido en SPEC. Un éxito vacío publica causa; fallo global mantiene anterior; límite externo produce parcial con aviso. Responder a violaciones concurrentes de huella devolviendo la extracción existente, sin error SQL expuesto.
9. **Aceptación y descarte.** Permitir nombre/web corregidos y exigir revisión. Refactor mínimo del alta manual para compartir validación y operación transaccional de inserción. Todas las altas bloquean empresa primero; aceptar/descartar bloquean después sugerencia, siempre con workspace. Contar activos e identificar duplicados dentro del bloqueo. Crear competidor y marcar aceptación juntos; repetir devuelve el enlace existente. Archivar/editar competidores usan el mismo orden de bloqueo y comprobación de identidad. El alta manual puede recuperar negocios descartados; la aceptación de sugerencias no elude las exclusiones propias y de directorios de la feature al corregir la web. No consultar red al decidir.
10. **Acciones y UI.** Extraer, aceptar con correcciones y descartar; revalidar ruta tras éxito. Tarjetas con indicios/dudas, accesibilidad web sin afirmar titularidad, fuentes declaradas, errores de conflicto/tope/duplicado y confirmación manual. No heredar evidencias a un dominio corregido; conservar las originales como historial y guardar la decisión en `accepted_input`. Renderizar texto seguro, sin porcentajes, sin red en carga o decisiones.
11. **Pruebas y revisión.** Cubrir cada AC con escenarios objetivos y ejecutar revisiones de spec, QA, DB y seguridad. Verificación manual con candidatos reales disponibles, sin exigir que una fuente externa produzca exactamente cinco.

## Dependencies

- Base de datos y perímetro actual del operador; rama Neon `test` para integración y `dev` para manual.
- Cuenta de ChatGPT del operador fuera de la app y acceso a portadas públicas. No se garantiza gratuidad ni disponibilidad ilimitada de esa cuenta; la aplicación no añade facturación de API.
- Sin nuevas claves, servicios contratados o dependencias npm previstas. La conexión actual usa `pg.Pool` con Drizzle node-postgres y permite transacciones interactivas. Tipar el helper compartido para el ejecutor transaccional; no sustituir bloqueos por consultas independientes.

## Alternatives considered

- Pregunta como prueba de sector/zona y HTTP 200 como prueba de web propia: rechazados; confunden contexto y accesibilidad con verificación.
- Score 0–100 y adaptadores para proveedores futuros: eliminados por falta de precisión fundamentada y de una segunda fuente.
- Exigir evidencia completa de todos los factores: descartaría negocios reales con portadas escasas. Se mantienen dudas visibles y confirmación manual; incompatibilidades explícitas se excluyen.
- Guardar respuesta/HTML íntegros o usar observaciones GEO: rechazados; no hacen falta y contaminarían retención o métricas.
- Revertir funcionalidad borrando tablas: no es el rollback operativo; preservar datos y competidores aceptados.

## Test strategy

- Unit: AC-001/001b/006, ranking exacto, ambigüedades, contexto, fingerprint y límites de entrada.
- Fetcher real con dependencias instrumentadas y reloj controlado: AC-005/007, DNS tardío sin conexiones posteriores, redirects privados/públicos excluidos, concurrencia, bytes, cancelación y regresión del fetcher de auditoría. Los dobles de alto nivel se reservan para orquestación.
- Neon `test`: AC-002/003/004/008/010/011, dos conexiones y barreras de sincronización para carreras, excepción inducida para rollback, decisiones y consultas acotadas por empresa.
- UI/manual: AC-006/009/012, texto hostil, correcciones, confirmación, keyboard, móvil y ausencia de red al cargar/decidir.
- Lint, typecheck, suite completa y build; evaluar cobertura de escenarios, no un mínimo de cantidad de tests.

## Deployment coupling

- La migración es aditiva y debe aplicarse antes de servir código nuevo. No requiere backfill.
- Orden: revisar SQL/journal → migrar `test` → pruebas → migrar `dev` → desplegar código de desarrollo → verificación manual.
- Migración sin código: el código anterior sigue funcionando. Código sin migración: las consultas nuevas fallan; no desplegar en ese orden.
- No ejecutar migraciones, cambios de configuración ni despliegue en `production` con estas tareas. Un eventual despliegue de producción se planifica y autoriza aparte.
- Retirar componente/acciones y volver al código anterior si falla la activación. Conservar tablas y competidores; una limpieza destructiva futura es una operación independiente.

## PLAN verification checklist

- [x] SPEC, PLAN, TASKS y decisiones vigentes usan el mismo contrato.
- [x] Cada AC tiene tarea y verificación definidas; T001–T012 marcadas hechas con evidencia el 2026-10-26, T013 parcial y T014 pendiente.
- [x] Límites, unidades, transacciones, revisión manual y restricciones de la fuente son explícitos.
- [x] Context budget, riesgos, pruebas, despliegue y rollback están descritos.
- [ ] Revisiones de cierre (T014) y captura real para la verificación manual (T013); implementación y pruebas ejecutadas el 2026-10-26.
