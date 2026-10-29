# Spec Analysis

Fecha: 2026-10-29. Revisión `sdd:spec-analyze` de `SPEC.md` antes del plan, contrastada con las features 006 y 007 y el código acotado en el encargo. `PLAN.md`, `TASKS.md` y `DECISIONS.md` aún no existen por decisión expresa; no son un bloqueo. El estado `Draft` se conserva.

## Verdict

**Ready to plan.** Se aplicaron los hallazgos F01–F14. La compatibilidad real de las dos consultas `keyEvents` y el nombre de canal en propiedades con otra configuración siguen **UNVERIFIED**: AC-013 los comprueba antes de cerrar la implementación. Una respuesta con todo a cero no valida la semántica de los informes con datos.

## Coverage gaps

- **F01 — FR-001/FR-004/FR-005, AC-002/AC-004:** faltaban criterio observable para el cuerpo exacto, límite de 15 s, validación de propiedad, respuesta Admin mal formada y separación de `dateRange` entre petición y respuesta. El cliente actual elimina `dateRange` al enviar y exige cabeceras al leer (`src/modules/analytics/ga4.ts:178-209`); AC-002 y AC-004 comprueban esas piezas.
- **F02 — FR-006/FR-010, AC-005:** la lista de fallos omitía 401, JSON inválido, timeout, métricas no enteras y desbordamiento de suma. La 006 clasifica 401 como `invalid_credentials` y acepta cada métrica solo como texto entero de 0 a 10¹² (`src/modules/analytics/ga4.ts:68-76,175-207`; spec 006, FR-010/FR-013). AC-005 prueba los motivos y la ausencia de captura parcial.
- **F03 — FR-007/FR-008/FR-009, AC-006/AC-008:** faltaban criterios para avisos con datos a cero, cambio independiente de orgánico y total, estado sin visitas con eventos clave y explicación de la suma acotada. El resumen actual devuelve pronto `state = empty` sin métricas ni aviso (`src/modules/analytics/summary.ts:108-140`); la sección actual coloca las tres cifras en la tarjeta y las tablas fuera (`src/components/analytics/analytics-section.tsx:97-132`). AC-006/AC-008 observan resumen y DOM.
- **F04 — FR-011/FR-012, AC-010/AC-011:** se precisaron los tres tipos de nombres que han de ser texto en el DOM, las claves de ambos catálogos y los avisos traducidos. AC-010/AC-011 dan un veredicto por nodos y claves inspeccionables.

Tras los cambios, **FR-001–FR-012 tienen al menos un AC**: 001→002/004/005; 002→002/003; 003→002/003; 004→002; 005→002; 006→001/005/009; 007→003/006/011; 008→001/006/008; 009→001/006/007/013; 010→005; 011→008/010; 012→011. Los AC nombran petición, fila, resumen, DOM, catálogo, resultado de comandos o registro de captura; cada uno puede fallar y fija el veredicto esperado. AC-012 concretará comandos en el plan.

## Contradictions

- **F05 — FR-002, AC-002:** «dimensión `dateRange`» podía interpretarse como enviarla a Google. D010 de la 006 explica el 400 real y exige que GA4 la añada en la respuesta (`specs/features/006-google-analytics/DECISIONS.md:95-103`); el código ya la elimina del cuerpo (`src/modules/analytics/ga4.ts:180-198`). Se fijaron petición y lectura por separado.
- **F06 — FR-004, API / Interface changes:** la firma de `runReport` ya es `(token, property, request, options)` y `limit` se serializa como cadena (`src/modules/analytics/ga4.ts:134-141,178-191`). Se precisó la extensión de `ReportRequest` sin alterar llamadas previas.
- **F07 — FR-008/FR-009, Current behavior:** el estado `empty` de la 006 oculta las métricas y el aviso en el resumen actual, y el bloque nuevo no aparecería si dependiera de `hasData = s.state === "ok"` (`src/modules/analytics/summary.ts:120`; `src/components/analytics/analytics-section.tsx:76,132`). La SPEC exige proyectar y pintar `keyEvents` también en ese estado.
- **F08 — FR-010, AC-005:** la lista inicial de motivos omitía `invalid_credentials`, aunque la 006 lo usa para 401 (`specs/features/006-google-analytics/SPEC.md:59`; `src/modules/analytics/ga4.ts:68`). Se añadió.

## Missing edge cases

- **F09 — FR-002/FR-003/FR-007, AC-003:** `(other)` forma parte de la suma recibida pero no de orgánico; `limit: 100`, umbral, muestreo y `limit: 10` impiden presentar sumas como total verdadero o exigir que el desglose cuadre. La 006 ya combina avisos de tres informes (`src/modules/analytics/collect.ts:164-182`); ahora incluye los dos nuevos.
- **F10 — FR-002/FR-003/FR-008, AC-003/AC-013:** nombres de canal fuera del inglés y `eventName = "(not set)"` no estaban resueltos. D003 conserva la comparación exacta; se advierte con total positivo y orgánico cero, y `(not set)` se conserva como texto. El idioma real de otros canales permanece UNVERIFIED.
- **F11 — FR-001/FR-009, AC-007:** «sin eventos configurados → contadores cero» no se deduce de la lista actual: un evento marcado durante el periodo puede haberse retirado. Se conservan las cifras devueltas y el estado `none_configured` oculta las cifras; la lista Admin no reescribe la historia.
- **F12 — FR-006/FR-010, AC-005:** `keyEvents` decimal, vacío, negativo, mayor que 10¹² o suma desbordada debe fallar; aplicar la regla entera de la 006 evita guardar JSON incoherente. Los nombres hostiles siguen el tratamiento B08b de texto (`src/components/analytics/analytics-section.tsx:118-120,150-157`).

## Assumptions to add

- **F13 — Assumptions / Source of Truth Matrix:** `configured` representa la configuración al capturar, los contadores son suma de filas devueltas por un informe acotado y la tabla orgánica se limita a diez. No hay en el repositorio una comparación con un informe total independiente ni datos reales para comprobar la igualdad entre informe por canal y desglose. Se añadieron filas **UNVERIFIED** sin rebajar las verificaciones fechadas el 2026-10-29.

## Blocking open questions

Ninguna para escribir el plan. La compatibilidad real de `keyEvents` con `sessionDefaultChannelGroup` y `eventName`, y el valor literal de canal, condicionan el cierre de la implementación: si Google rechaza una combinación, se revisa el contrato antes de cerrarla (AC-013). La posición exacta de la tabla se decide al planificar, con el bloque bajo las cifras y sin scroll de página a 375 px.

## Reviews needed

| Revisión | Necesaria | Motivo |
|---|---|---|
| Database | Yes | Columna `jsonb`, restricciones, filas anteriores, esquema Drizzle y rollback. |
| Security | Yes | Cuenta de servicio, secretos fuera de filas y errores, y nombres no confiables en el DOM. |
| Performance | Yes | Tres peticiones adicionales, concurrencia y límites de filas de los informes. |
| API | Yes | Cambia el contrato interno `ReportRequest` y el cuerpo de `runReport`; revisar retrocompatibilidad de las tres llamadas actuales. |
| Backend | Yes | Cliente Admin/Data, suma por periodos, servicio, persistencia y resumen. |
| Frontend | Yes | Bloque nuevo, estados vacíos y antiguos, avisos y ancho de 375 px. |

## Recommended fixes

Aplicados F01–F14. En el plan, concretar los comandos de AC-012, revisar las seis áreas anteriores y registrar en AC-013 la respuesta real de Google sin secretos. Si solo hay ceros, conservar la comparación con datos como seguimiento. La migración siguiente es `0010` (`src/db/migrations/meta/_journal.json:69-73`).

## Cambios aplicados

- F01/F05/F06: firma, filtro fijo, cuerpos exactos, `dateRange` de respuesta y nueve peticiones con seis paralelas.
- F02/F08/F12: motivos completos, regla de enteros de la 006, suma acotada y prueba literal de secretos.
- F03/F07: bloque y avisos también con captura «Sin visitas»; cambios independientes y estados anteriores.
- F04/F10: DOM seguro, catálogos, canal no inglés y `(not set)`.
- F09/F13: `(other)`, umbral, muestreo, límites de 100/10 y matriz UNVERIFIED.
- F11: lista de configuración actual separada de las métricas históricas.
- **F14 — Data model changes / AC-009:** migración 0010 tras 0009, restricciones de forma con `jsonb_path_exists`, lectura de filas anteriores y orden de rollback. El patrón de la 007 está en `specs/features/007-branded-queries/DECISIONS.md:75-87`.

## No aplicado

- D001–D004 conservan su decisión: eventos clave enteros, lista Admin, canal literal y columna nueva. Las precisiones sobre el total acotado y el idioma no cambian D003.
- No se añadieron PLAN.md, TASKS.md ni DECISIONS.md: esta revisión precede a esos documentos. Tampoco se añadió una consulta separada del total, una tasa ni otro alcance excluido.

## Validación (2026-10-29)

Revisados F01–F14 contra el código: correctos y aplicados como dice el informe. Dos correcciones sobre los cambios, las dos por la 007, que se cerró mientras se hacía este análisis:

- **V1 — Data model changes, AC-009:** la 007 añadió la migración `0010_search_console_segments_strict` (su D008), así que la de esta feature es `0011`.
- **V2 — Data model changes, AC-009:** el patrón vigente de la 007 no usa `?&` y evalúa `jsonb_path_exists` en modo `strict`, porque el modo `lax` dejaba pasar arrays donde se espera un objeto. Se cambia el texto y AC-009 pide comprobar el código 23514, el nombre de la restricción y formas válidas aceptadas, como las pruebas finales de la 007.

Veredicto tras la validación: **Ready to plan**.

Siguiente paso: `/spec-plan specs/features/008-ga4-key-events/`.
