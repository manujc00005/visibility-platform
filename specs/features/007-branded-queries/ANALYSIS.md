# Spec Analysis

Fecha: 2026-10-29. Revisión `sdd:spec-analyze` de `SPEC.md` por sí solo, antes de escribir el plan. Se contrastó con la feature 003, la 006 y el código acotado en el encargo. El estado `Draft` se conserva. PLAN, TASKS y DECISIONS aún no forman parte de esta revisión por decisión expresa del encargo.

## Verdict

**Ready to plan.** Se aplicaron las correcciones documentales. La compatibilidad exacta del regex con Search Analytics sigue **UNVERIFIED** y se convierte en comprobación obligatoria de la implementación (AC-014); no impide redactar el plan.

## Coverage gaps

- **F01 — FR-001/FR-002, AC-002:** el criterio inicial no fijaba la relación entre términos mostrados, texto original y variantes enviadas. `nameKey` elimina puntuación (`src/modules/geo/detection.ts:31-47`). Ahora AC-002 y AC-012 observan términos, expresión, orden y recorte.
- **F02 — FR-003, AC-003:** faltaba observar periodos, `type`, `dataState`, propiedad y concurrencia de las peticiones. El cliente actual añade `type: web` y `dataState: final` (`src/modules/search-console/google.ts:170-178`). AC-003 los comprueba.
- **F03 — FR-004/FR-006, AC-004:** la igualdad de sumas inicial no puede cumplirse cuando el delta es negativo y se trunca a cero. Ahora se verifica la igualdad solo para delta no negativo y el aviso cuando es negativo.
- **F04 — FR-006/FR-008/FR-010/FR-011:** faltaban criterios falsables para denominadores cero, cambio con base cero, texto seguro, textos de aviso y estado sin credenciales. AC-006, AC-009, AC-013 y AC-015 los cubren. `countChange` trata una base de cero de forma específica (`src/modules/search-console/summary.ts:55-61`).

Tras las correcciones, **FR-001–FR-011 tienen al menos un AC**: 001→002/012; 002→002/005/012/014; 003→003/007; 004→004; 005→001/008; 006→001/004/013; 007→005; 008→006; 009→007/012; 010→009/014; 011→015. Todos nombran fila, petición, resumen, DOM, catálogo, ejecución o captura que se inspecciona y tienen un resultado que puede fallar. AC-010 nombra los comandos por categoría; el plan deberá concretar los comandos del repositorio.

## Contradictions

- **F05 — FR-001/FR-002/FR-007, AC-002/AC-005:** el SPEC decía que `terms` eran `nameKey`, pero esperaba que `clinicagarcia.es` conservase el punto. También hacía la etiqueta con `nameKey(query)`, distinto del filtro sobre la búsqueda cruda. `nameKey("olessium.com")` produce `olessium com` (`src/modules/geo/detection.ts:31-47`); el detector GEO usa una regla separada para el dominio (`src/modules/geo/detection.ts:59-63`). Se mantienen literales originales y una variante con espacios; clasificación local y filtro comparten variantes.
- **F06 — API / Interface changes, FR-003:** `querySearchAnalytics` ya recibe cuatro argumentos; el filtro nuevo pertenece a `AnalyticsQuery`, no a un quinto parámetro (`src/modules/search-console/google.ts:148-153,170-178`). Se aclaró la firma.
- **F07 — Non-functional requirements, FR-005:** «nada nuevo viaja ni se guarda salvo la expresión» invertía lo especificado: se guardan términos y métricas, y la expresión se envía a Google. Se corrigió y se separó el tratamiento de secretos (`src/modules/search-console/google.ts:104-122`; `src/modules/search-console/service.ts:23-44`).
- **F08 — AC-010:** afirmaba que había 45 pruebas previas; los archivos acotados contienen **51** casos `it`/`test` en las unitarias e integración de Search Console (conteo de `tests/unit/search-console/*.test.ts` y `tests/integration/search-console.test.ts`). Se quitó el número fijo.
- **F09 — FR-004, Edge cases:** atribuía un delta negativo a datos no finales pese a que el cliente envía `dataState: final` (`src/modules/search-console/google.ts:177`). Se retiró esa causa no demostrada.

## Missing edge cases

- **F10 — FR-001/FR-002, Edge cases:** el dominio era el último término, así que el recorte «por el final» podía borrarlo; un alias largo también podía impedir incluir uno corto posterior. Se reservó el dominio, se omiten términos completos y se prueba el caso imposible. El `domain` está almacenado como hostname ASCII (`src/modules/workspaces/schema.ts:13-16`), pero el esquema no impone una longitud máxima visible para esa columna.
- **F11 — FR-004/FR-006, Edge cases:** faltaban segmento sin fila, CTR y posición propios, cero clics con impresiones, bloque previo con impresiones y cero clics, y desajuste de cada periodo. Se añadieron reglas y AC-004/AC-013.
- **F12 — FR-007/FR-011, Edge cases:** faltaban puntuación, IDN ASCII, texto con HTML/metacaracteres y persistencia de etiquetas. Se añadió comprobación de DOM y se dejó `branded` como proyección, coherente con `QueryRow` actual (`src/modules/search-console/collect.ts:27-29`) y con el texto plano de la tabla (`src/components/search-console/search-console-section.tsx:75-80`).

## Assumptions to add

- **F13 — Assumptions:** congelar nombre, alias y dominio en el momento de inicio de captura. El servicio obtiene la empresa una vez y pasa solo `domain` y `hostname` actualmente (`src/modules/search-console/service.ts:16-20`); `SearchConsoleDeps.collect` y `collectSearchConsole` comparten esa forma (`src/modules/search-console/service.ts:7-10`; `src/modules/search-console/collect.ts:99-103`). Se especificó cómo ampliarla sin mezclar ediciones concurrentes.
- **F14 — Source of Truth Matrix / Assumptions:** el repositorio cita las páginas de Google, pero no contiene su texto ni una captura con estos filtros. Por tanto, límite 4096, semántica RE2, `(?i)`, `rowLimit: 1` y causa exacta del hueco quedan **UNVERIFIED**. Se retiró la afirmación de que la API comparte necesariamente la omisión de la interfaz y se pidió verificación real en AC-014.

## Blocking open questions

Ninguna para planificar. La aceptación real de `(?i)` y de ambos operadores en Search Analytics condiciona el cierre de la implementación; si falla, habrá que revisar la decisión de sintaxis antes de cerrar. La colocación visual de la etiqueta puede resolverse durante la planificación respetando AC-011.

## Reviews needed

| Revisión | Necesaria | Motivo |
|---|---|---|
| Database | Yes | Columna `jsonb`, restricciones, filas anteriores y rollback. |
| Security | Yes | Términos de empresa en regex y DOM; preservar secreto y perímetro existente. |
| Performance | Yes | Cuatro consultas externas adicionales y ocho consultas Search Analytics concurrentes. |
| API | No | Sin endpoint nuevo ni cambio de contrato HTTP propio; el DTO interno se revisa en backend. |
| Backend | Yes | Constructor, integración de filtros, servicio, persistencia y resumen. |
| Frontend | Yes | Bloque de segmentos, etiqueta, estados y vista a 375 px. |

## Recommended fixes

Aplicados F01–F14. Para el plan: concretar comandos de verificación y registrar la captura real de AC-014 antes de dar la feature por terminada. La migración siguiente es `0009` (`src/db/migrations/meta/_journal.json`, última entrada `0008_analytics`); el SPEC incluye restricciones, compatibilidad con nulos y orden de rollback. La sección nueva se inserta bajo las cifras actuales; la tabla ya usa un contenedor con `overflow-x-auto` (`src/components/search-console/search-console-section.tsx:51`), por lo que AC-011 comprueba scroll de página y legibilidad del distintivo.

## Cambios aplicados

- F01/F05: términos originales, clave `nameKey` solo para deduplicar, variantes literales y etiqueta local con el mismo criterio.
- F02/F06: cuerpo y concurrencia de las cuatro llamadas filtradas, y firma actual del cliente.
- F03/F09/F11: hueco derivado, tratamiento explícito del desajuste, denominadores cero, CTR y posición.
- F04/F12: estados, traducciones, DOM seguro y criterios observables para interfaz y resumen.
- F07/F13: datos guardados y enviados, secretos fuera de resultados, foto de la empresa al iniciar la captura.
- F08: retirada del recuento obsoleto de pruebas.
- F10: reserva del dominio, omisión completa y aviso de recorte con pruebas de límite.
- F14: matriz de fuentes con hechos de la API marcados UNVERIFIED y comprobación real obligatoria.
- Modelo de datos: columna nullable y versionada, restricciones de forma, compatibilidad con filas anteriores y orden de rollback.

## No aplicado

- No se cambió el sentido de D001–D003: sus decisiones de fuente, coincidencia por contenido y hueco sin reparto siguen vigentes. Se retiró de D002 la afirmación no verificada sobre el comportamiento de la interfaz; D001 ahora precisa cómo se representan los términos y D003 evita atribuir el hueco a una causa exclusiva.
- No se añadió una prueba de compilación RE2 local con `new RegExp`: JavaScript solo aproxima el subconjunto literal y no demuestra compatibilidad con la API. AC-014 exige captura real.
- No se convirtió la aceptación de Google en bloqueo documental para planificar: la verificación requiere credencial y respuesta real, y el plan puede incluir ese paso.

## Validación (2026-10-29)

Revisados F01–F14 contra el código: correctos y aplicados como dice el informe. Tres correcciones sobre los cambios:

- **V1 — Source of Truth Matrix, FR-002 (corrige F14):** la página de Search Analytics y la ayuda de filtros se leyeron el 2026-10-29 al redactar el SPEC; Codex no tenía acceso a ellas y las marcó UNVERIFIED. Pasan a verificados el límite de 4096, los operadores regex, RE2 y el rango de `rowLimit`. Siguen UNVERIFIED la aceptación de `(?i)` por la API y la omisión de búsquedas anónimas en la API.
- **V2 — FR-009, AC-007 (contradicción nueva):** se pedía que los términos no apareciesen en la fila fallida, pero hoy esa fila ya guarda la propiedad `sc-domain:<dominio>` y el motivo `no_access` nombra el dominio (`src/modules/search-console/collect.ts:92,114`). Los términos no son secretos; la prohibición queda en token, JWT, clave y expresión completa.
- **V3 — AC-008, AC-012 (observabilidad):** «comprobar la secuencia de rollback» no nombraba qué se inspecciona; ahora es que PLAN.md la recoge. El caso «el dominio solo no cabe» es inalcanzable con datos reales (dominio de 253 caracteres como máximo, `src/modules/workspaces/domain.ts:60`); queda como prueba unitaria de `brandTerms` con un dominio sintético.

Veredicto tras la validación: **Ready to plan**.

Siguiente paso: `/spec-plan specs/features/007-branded-queries/`.
