# Spec Analysis: 011 — Comparativa con competidores

Fecha: 2026-10-31. Análisis posterior a la corrección documental de SPEC, PLAN, TASKS y DECISIONS. No es una revisión de implementación ni evidencia de pruebas ejecutadas contra la aplicación.

## Verdict

**Ready for implementation.** No quedan contradicciones bloqueantes en los documentos revisados. El estado existente de SPEC (`Ready`) no se ha cambiado. La primera tarea es T000 y su política de acceso previa; no se debe asumir que el colector actual ya cumple ese requisito.

## Archivos y cobertura

Los cuatro archivos requeridos están presentes. Los 23 criterios tienen tareas y las 10 tareas (T000–T009) tienen criterios asociados. No hay tareas sin aceptación ni criterios huérfanos.

| Criterio | Tareas |
|---|---|
| AC-001 | T001, T004, T008 |
| AC-002 | T004, T008 |
| AC-003 | T000, T004, T008 |
| AC-004 | T002, T004, T008 |
| AC-005 | T002, T004, T008 |
| AC-006 | T004, T008 |
| AC-007 | T000, T004, T008 |
| AC-008 | T001, T008 |
| AC-009 | T005 |
| AC-010 | T005, T006 |
| AC-011 | T006 |
| AC-012 | T003, T008 |
| AC-013 | T005, T006 |
| AC-014 | T006 |
| AC-015 | T007 |
| AC-016 | T009 |
| AC-017 | T009 |
| AC-018 | T000, T004, T008 |
| AC-019 | T001, T005, T006, T007, T008 |
| AC-020 | T002, T006, T007, T009 |
| AC-021 | T004, T005, T008 |
| AC-022 | T001, T004, T005, T006, T008 |
| AC-023 | T001, T003, T008 |

## Contradicciones resueltas

1. **Robots y redirecciones:** se corrige la descripción del colector actual y se planifica una política optativa previa a cada petición de portada, redirect y fallback. T000 y D011 incluyen SSRF, presupuesto/cache y regresión del modo existente, sin cambiar el comportamiento de auditorías propias.
2. **Finalización tardía:** cero filas actualizadas ya no equivale a empresa borrada. D012 distingue not_found de capture_closed y protege por id/empresa/running tanto el éxito como el fallo; T004 prueba la carrera con una captura posterior.
3. **Ausencias parciales y ceros:** D008/FR-012 preservan métricas presentes y ceros válidos, explican ausencias por celda y usan colSpan solo ante ausencia completa. AC-019 tiene pruebas de persistencia, proyección y DOM.
4. **Autoridad y alcance:** D003/D004 distinguen dominio solicitado/efectivo, alcance registrado y asOf. No encontrado requiere found:false; una respuesta incompleta/ambigua es error, sin perder los resultados válidos de otros sitios. Hosts siguen fuera de alcance y esa limitación es visible. Las referencias API/OpenAPI figuran en D003.
5. **Validación real:** D009 elimina la tolerancia de 15 puntos como prueba de mapeo. Se exige correspondencia exacta con las mismas respuestas saneadas de la captura; una ejecución aparte solo documenta variación.
6. **Identidad propia:** la proyección también compara domain/hostname de la empresa. Cambios de sitio dejan pendiente; renombrados no invalidan datos. La captura conserva su identidad inicial.
7. **Requisitos deduplicados:** UI y servicio usan el mismo selector y exigen al menos un competidor distinto del propio. Solo duplicados no autorizan una captura vacía ni producen filas pendientes ficticias.
8. **Contrato y lifecycle:** SPEC define identidades, estados, unidades, métricas parciales, rangos y fechas; separa las garantías SQL de Zod. Running/completed/failed tienen correspondencias explícitas entre sites/error/finished_at.

## Context budget

**Filled.** Reading list acotada al módulo y a sus dependencias compartidas; incluye el colector/fetcher y sus pruebas para T000. Model routing declara un solo agente con el modelo actual, sin delegación ni herramientas de pago. No se encontró `specs/CONSTITUTION.md`; no se ha creado ni se ha convertido su ausencia en bloqueo nuevo.

## Verify clauses

**Adopted, complete: 10/10.** Cada tarea incluye Covers y Verify no vacío. Los comandos nombran proyectos/archivos o suites concretas; las comprobaciones humanas nombran a quien implementa, la evidencia y el criterio. Observability warnings: none.

Se comprobó mecánicamente la unicidad de AC/tareas/decisiones, referencias D001–D012, cobertura completa, tareas sin marcar y conservación del Status. `git diff --check` pasa. No se han ejecutado lint, build ni pruebas de aplicación: sus resultados siguen pendientes de implementación.

## Preguntas y dependencias

Sin preguntas de diseño bloqueantes. La cuenta/IP de Open PageRank y los datos reales requeridos por AC-016 son dependencias de evidencia, no de desarrollo. Sin positivo real de autoridad y found:false real, T009 permanece abierta y no se permite spec-close. Una respuesta vacía, un error de credencial o fixtures no sustituyen esas evidencias.

Uso comercial, evolución temporal y trabajo en segundo plano siguen aplazados. El perímetro privado, duración y actualización de BL-07 se revisan antes de desplegar. No hay autorización nueva de despliegue ni de crear cuentas.

## Revisiones necesarias durante la implementación

| Revisión | Necesaria | Motivo |
|---|---|---|
| Database | Sí | Tabla/migración, checks, índice parcial, cascada y lifecycle. |
| Security | Sí | Guardia previa de robots, SSRF/redirects, claves, alcance por empresa y acciones sin autenticación. |
| Performance | Sí | Tres trabajadores, presupuestos, llamadas externas y acción larga. |
| API | Sí | Contrato de la Server Action y adaptación de Open PageRank; no se añade REST público. |
| Backend | Sí | Selección, captura parcial, concurrencia y cierre tardío. |
| Frontend | Sí | Estados por métrica, tabla móvil/accesible, fechas/alcance e idiomas. |
| QA y conformidad | Sí | Cobertura de AC, regresión de auditorías propias y evidencia real antes de cierre. |

## Recommended next command

`/spec-implement specs/features/011-competitor-seo-comparison/`

Empezar por T000. La corrección documental no ejecuta ese comando ni completa tareas.
