# Implementation Plan: Búsquedas que sigues

## Summary

Añadir gestión de hasta 25 búsquedas por empresa, una consulta agrupada adicional a Search Console y serie semanal versionada en cada éxito. Identidad canónica común, lista congelada al iniciar, datos basados en latestCompleted y sparkline con fechas/huecos reales. Solo datos del propietario vía la credencial existente; sin rank tracker ni proveedor nuevo.

## Related spec

`specs/features/010-tracked-keywords/SPEC.md`; decisiones D001–D014 de esta carpeta.

## Impacted areas

- Nuevos `src/modules/search-console/keywords.ts` (tipos KeywordSeries/KeywordWeek, normalizeTrackedKeyword, keywordExpression, keywordWindow, aggregateKeywordSeries) y `tracked-keywords-service.ts` (listTrackedKeywords, addTrackedKeyword, removeTrackedKeyword).
- Nuevo `src/modules/search-console/keyword-summary.ts`: validación de series guardadas y proyección pura summarizeTrackedKeywords, con filas/aviso independiente de la configuración global de GSC.
- `src/modules/search-console/{schema,collect,google,service,summary}.ts`: tabla/columna/checks, dimensión date, conjunto congelado, consulta y persistencia. `deps.ts` solo si lo requiere el tipado del conjunto; sin cambiar proveedores ni credenciales.
- `src/modules/search-console/brand-terms.ts`: factorizar/exportar escapeRe2Literal; literal/variantsOf conservan exactamente su comportamiento para marca. El builder de keywords tiene su propia política de identidad/variantes.
- `src/db/schema/index.ts`, migración `src/db/migrations/0012_tracked_keywords.sql` y metadatos Drizzle correspondientes. Comprobar que 0012 siga libre antes de generarla.
- Nuevos `src/components/search-console/{tracked-keywords-section,tracked-keyword-form,keyword-sparkline}.tsx`. Sección y SVG de servidor; formulario cliente con useActionState como los existentes y props de cadenas serializables. Bajas mediante formulario server action.
- `src/components/search-console/search-console-section.tsx`, `src/app/workspaces/[id]/seo/{page.tsx,actions.ts}`: integrar el bloque debajo de búsquedas e independiente de los estados/configuración de GSC. Las acciones nuevas solo revalidan SEO; capturar mantiene su comportamiento actual de revalidación.
- `src/i18n/messages/{es,en}.ts` dentro de searchConsole. Tipos nuevos sin alterar datos/copia de Bing/GA4 o del overview.
- Unitarias bajo `tests/unit/search-console/`; integración nueva `tests/integration/tracked-keywords.test.ts` y adaptación mínima de fixtures de Search Console para los nuevos campos. Pruebas de regresión de brand-terms y las nueve consultas existentes.
- Documentación `docs/visibility-mvp/tracked-keywords.md`: diseño, migración, fuentes, pruebas, capturas y evidencia real del filtro.

## Context budget

### Reading list

- SPEC, PLAN, TASKS y DECISIONS de 010.
- `src/modules/search-console/{collect,google,service,summary,schema,brand-terms,deps}.ts` y sus pruebas existentes (incluidos fixtures, section-render e integración Search Console).
- `src/modules/geo/service.ts`: únicamente patrón de bloqueo y altas concurrentes. Reproducir el SQL corto del bloqueo en el servicio de keywords sin importar todo el servicio GEO ni refactorizarlo.
- Página/acciones SEO, SearchConsoleSection/refresh-button y formularios cliente existentes como patrón de estado; i18n searchConsole y formateadores.
- `src/db/schema/index.ts`, migración 0011 y journal/metadatos, guardia/setup de tests y comandos de package.json. Ampliar lectura solo por dependencia/fallo concreto.
- Fuentes enlazadas en SPEC y la evidencia de RE2 de 007 solo si hace falta resolver su compatibilidad; no releer specs ajenas completas.

### Model routing

Un solo agente con el modelo actual, sin delegación ni cambio de modelo. Concurrencia, JSON strict y matching requieren revisión razonada; la migración de textos usa los tipos existentes. Sin herramientas ni proveedores de pago.

## Proposed approach

1. **Base y dominio puro (T001).** Registrar HEAD/diff inicial y hashes de los cambios ajenos de 004, sin commitearlos. Implementar keywords.ts con identidad Unicode de SPEC, longitud por puntos de código y builder anclado (?i) con variantes NFC/NFD/espacios y escape común seguro. Las alternativas no eliminan acentos/signos; validar bytes del patrón real. Ventana y agrupado aplican el Contrato de datos, ponderando variantes por día y semana, sin ceros ni redondeo. No usar nameKey ni cambiar periodos existentes.
2. **Persistencia (T002).** Migración aditiva con tabla, FK/cascada, unique workspace/keyword y checks. keyword_series es nullable y no se backfillea. Zod/runtime valida fechas reales, anclajes, orden y unicidad; SQL garantiza la estructura/cotas con strict e IS TRUE dentro de una función `tracked_keyword_series_valid` (D014), que evita casteos de estructuras inválidas. Los checks se nombran para poder afirmar 23514 de forma determinista. No insertar nuevas completed de producción sin serie; fixtures/capturas históricas nulas siguen legibles.
3. **Gestión concurrente (T003).** Alta/baja con validación de UUID/input y bloqueo FOR NO KEY UPDATE por empresa, transacciones cortas. Alta comprueba duplicado primero, límite y bytes del conjunto candidato, devuelve errores de dominio localizables; la restricción unique es defensa adicional. Listar por created_at/id. Borrar por workspaceId+keywordId es idempotente, sin borrar snapshots.
4. **Consulta/captura (T004).** refreshSearchConsole carga una vez la lista activa antes de llamar al colector y pasa strings canónicos en CaptureSite. No mantiene transacción/bloqueo durante red. Validar expresión antes de token; conservar los nueve cuerpos exactos y añadir un único query date/query al Promise.all solo con keywords. El parser usa keys[0]=date, keys[1]=query sin recortar; agrupa variantes, valida y persiste el conjunto congelado. Sin keywords guarda serie vacía y hace las once peticiones previas. Respuesta inválida o que alcance rowLimit falla atómicamente; ningún retry/paginación nueva. Mismo handling GscError, FK de empresa borrada y último éxito.
5. **Proyección (T005).** summarizeTrackedKeywords recibe la lista activa y lo guardado (D013); no consulta APIs y no depende de state/config global. Validar serie al leer, proyectar pending/no_data/ok y warning si serie no nula ilegible; error reciente se muestra mediante lastFailure existente. SearchConsoleSummary añade trackedKeywords (vacío por defecto en llamadas existentes) y trackedKeywordsWarning; SEO compone los campos con la nueva proyección manteniendo las firmas/semántica previas del resumen general y sin cargar keywords en overview. Series y fechas proceden del mismo snapshot; re-altas reutilizan clave y bajas desaparecen. Compara primera/última semana de esa serie con fórmula exacta de SPEC; renderiza rangos, impresiones/daysWithData y N tramos finales sin datos.
6. **Acciones y UI (T006/T007).** Acciones en seo/actions.ts con locale en servidor. addTrackedKeywordAction(workspaceId, previousState, formData), removeTrackedKeywordAction(workspaceId, keywordId, previousState). Formulario conserva valor tras errores, muestra pending y límite; siempre visible para gestionar aun sin credencial. Sección bajo la tabla de búsquedas, con alternativas vacías si el bloque previo no muestra tabla. En móvil cada fila se dispone en bloques apilados dentro de la tabla semántica: texto largo con break-words/[overflow-wrap:anywhere], cifra/cambio y sparkline debajo; sin ocultar fechas o acciones ni scroll horizontal. SVG propio en servidor de 26 slots: línea solo entre tramos consecutivos, punto aislado y texto accesible con rangos/huecos. No reutilizar EvolutionPoint ni tocar gráficas de auditoría.
7. **Pruebas y cierre (T008/T009).** Ejecutar regresiones, suite completa y build sobre revisión identificada. Verificar migración en base protegida y navegador es/en 375/1280, control positivo real del filtro y aislamiento de fixtures. Registrar revisiones y datos limitados de evidencia sin secretos. No cerrar con AC-017 pendiente; no transformar un 200 sin filas en verificación positiva ni buscar cuentas/properties indiscriminadamente.

## Alternatives considered

- Una petición por keyword: rechazada por cuota y hasta 25 llamadas extra; una sola regex con matching local explícito.
- Comparación literal contra entradas normalizadas: rechazada; puede perder variantes y fabricar no_data.
- Agregar capturas acumuladas o programarlas: fuera de alcance; Google proporciona la ventana en cada intento.
- Captura parcial si falla el nuevo query: rechazada para conservar la política atómica de GSC; proteger antes la configuración al guardar keywords.
- Rellenar huecos con posición cero o unirlos: rechazado porque sugiere una medición inexistente.
- Reutilizar la gráfica de auditorías: su modelo/etiquetas no representa bien los 26 tramos y huecos. SVG pequeño propio, sin dependencia.
- Paginación o consultas diarias por límite: fuera de P0. Respuesta de 25000 filas se trata como potencialmente truncada con error accionable.

## Dependencies

- Infraestructura y credencial Search Console existentes; migraciones hasta 0011. El plan no instala servicios ni cambia scopes.
- La revisión 004 tiene cambios sin commitear; preservar su contenido y registrar diff incremental de 010. Los commits locales se hacen por instrucción del responsable (D013), separando esos cambios.
- Propiedad autorizada con una búsqueda de impresiones conocidas para AC-017. Su disponibilidad condiciona el cierre, no el desarrollo con fixtures. Sin ella la verificación real queda pendiente explícita.

## Risks

- Unicode/case-folding y filtros RE2: subset seguro, matching local común y pruebas de variantes; la prueba real no implica cobertura universal ni garantiza que Google devuelva consultas ocultas. Registrar alcance de evidencia, no asumir lowercase de la API.
- Cuota de carga: una consulta de seis meses es más costosa; cero retries nuevos y una llamada extra por intento. Anotar duración local/real observada, no prometer latencia o capacidad de escala.
- Más variantes aumentan filas originales y bytes del filtro. Validación transaccional previa, defensa en colector y fallo al alcanzar rowLimit.
- Muestras pequeñas y semanas antiguas: mostrar fechas, impresiones, días con datos y huecos; ninguna flecha promete crecimiento comercial o puesto fijo.
- Cambios de lista durante red: conjunto congelado, proyección por lista actual y latestCompleted con su propia fecha; sin bloqueos de red ni mezcla de snapshots.
- JSONPath strict no valida todo: reparto SQL/runtime explícito y checks que rechazan unknown, con pruebas negativas de arrays/envueltas/campos ausentes y límites.
- Trabajo ajeno de 004 y metadatos de migración: preservar baseline, confirmar que 0012 esté libre al empezar T002; si se ocupa, actualizar el nombre y documentos antes de generar, sin sobreescribir migraciones.

## Test strategy

- Unitarias: normalización/NFC/NFD/puntos de código; regex con escapes, variantes, longitud y no datos; ventana inclusiva, cambio de calendario/DST, agrupado ponderado, invalid rows/truncamiento; resumen y SVG serializado con huecos/igualdad/punto aislado; catálogos es/en y errores.
- Regresión: nueve cuerpos previos idénticos byte a byte, once peticiones sin keywords y doce con ellas, expresiones de marca idénticas, positionChange de 009 sin cambiar, overview/Bing/GA4/PDF sin alteración funcional. Adaptar fixtures de tipos solo para nuevos campos.
- Integración: guardia de base de pruebas, migración real y constraint names/codes; alta/límite/bytes/duplicados concurrentes, baja cruzada/idempotente, FK/cascada; snapshots antiguos/null, nuevos/vacíos y fallidos; captura congelada con promesa controlada para modificar lista durante red.
- Navegador: es/en, 375 y 1280, fixtures solo en test; gestionar sin credencial o con config inválida, teclados/labels/pending/error, fechas/avisos/cambios y huecos. Medir scrollWidth/clientWidth en página y tabla. Evidencia positiva AC-017 con propiedad conocida y resultado real, además de prueba de acceso a Olessium.
- Checks finales: npm run lint, typecheck, test:unit, test:integration y build, con códigos de salida y revisión exacta registrados.

## Deployment coupling

- Nuevo código requiere migración antes: SELECT/INSERT de tabla y columna nuevas fallarían sin 0012. Aplicar primero en base de pruebas; `dev` se migró después porque el código ya lee esas columnas (D013); ningún despliegue productivo está autorizado por este plan.
- Sin backfill; capturas antiguas quedan null y muestran pending para keywords activas.
- Migración sin código: el código anterior ignora tabla/columna; código sin migración: no compatible, no desplegar en ese orden.
- Para un futuro despliegue autorizado, revisar orden migración → código y preparar la observación de los errores antes. No hay nuevos secretos ni pasos de proveedor.

## Rollback strategy

Revertir únicamente cambios de código de 010 sobre su base identificada, conservando trabajo de 004. Dejar tabla/columna/checks aditivos y datos guardados: el código anterior los ignora. No ejecutar drops ni borrar series para revertir. Mantener las fechas y snapshots fallidos/anteriores intactos; sin efectos en Google ni en webs de clientes.

## PLAN verification checklist

- [x] Todos los criterios de aceptación tienen tarea.
- [x] Plan limitado a la feature; sin proveedor, dependencia o automatización nueva.
- [x] Context budget y Model routing concretos.
- [x] Riesgos, estrategia de pruebas y orden de migración documentados.
- [x] Rollback sin pérdida de datos ni cambios ajenos.
- [x] SPEC se promueve a Ready solo tras crear documentos y comprobar cobertura; pruebas de implementación siguen pendientes.
