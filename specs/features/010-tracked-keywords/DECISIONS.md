# Decisions: Búsquedas que sigues

Las decisiones D001–D006 concretan las propuestas que figuraban en el borrador; D007–D012 incorporan la auditoría aceptada. Todas se registran el 2026-10-30. No certifican implementación ni acceso real al proveedor.

### D001 - Serie de Google en cada captura

**Date:** 2026-10-30 · **Status:** Accepted

**Decision:** Ventana móvil de 182 días (26 tramos), obtenida en cada intento y versionada con la propiedad, rango y lista congelada. No depende de programación ni mezcla snapshots; todos los resultados visibles proceden de latestCompleted. Captura fallida posterior solo añade aviso, no cambia las filas a pending.

### D002 - Un query adicional y fallo atómico

**Date:** 2026-10-30 · **Status:** Accepted

**Decision:** Un filtro RE2 anclado para todas las keywords, en el Promise.all existente y sin cambiar los nueve cuerpos anteriores. Once peticiones sin lista y doce con ella (token, sites y consultas). Expresión inválida/oversize se detecta antes de token; GscError/filas inválidas/truncamiento producen un único failed sin serie y dejan el éxito visible. Sin retries ni paginación nueva.

### D003 - Tabla propia y escritura serializada por empresa

**Date:** 2026-10-30 · **Status:** Accepted

**Decision:** tracked_keywords con FK/cascada, unique workspace/keyword canónica y límite de 25. Alta y baja con FOR NO KEY UPDATE, transacción corta, duplicado antes del límite y presupuesto de patrón de toda la lista antes de insertar. No bloquear durante red. Orden created_at/id. El índice unique sigue siendo defensa contra carreras; nada nuevo de autenticación (perímetro D-03).

### D004 - Semanas móviles y gráfica honesta

**Date:** 2026-10-30 · **Status:** Accepted

**Decision:** Tramos completos de siete días anclados a current.end, no semanas de calendario. Mostrar extremos de comparación, impresiones/días recientes y tramos finales ausentes. SVG propio pequeño y accesible, con 26 slots de fechas y líneas interrumpidas donde falta dato. Mantener un punto aislado y un rango y válido si valores iguales. No reutilizar EvolutionPoint ni añadir dependencia.

### D005 - Ponderación y contratos de validación

**Date:** 2026-10-30 · **Status:** Accepted

**Decision:** Sumar variantes canónicas por día y semana; posición ponderada por impresiones con datos crudos, sin redondeo previo. daysWithData cuenta días distintos. Contrato de datos de SPEC fija inválidos, cero impresiones y capas SQL/runtime. El JSON usa version 1 y nullable histórico; strict debe evaluarse como verdadero, no unknown. Misma fórmula de cambio/epsilon que 009, sin cambiar su proyección existente.

### D006 - Baja física de configuración, snapshots conservados

**Date:** 2026-10-30 · **Status:** Accepted

**Decision:** Eliminar solo la fila activa identificada por workspaceId+keywordId. Idempotente; nunca borrar snapshots. Si se vuelve a añadir la misma clave canónica y figura en latestCompleted, reutilizar su serie fechada. No afirmar retención ilimitada de Google ni necesitar un id de configuración histórico.

### D007 - Identidad canónica y filtro con política explícita

**Date:** 2026-10-30 · **Status:** Accepted

**Decision:** NFC → trim → toLowerCase sin locale → colapsar espacios → NFC, conservando signos y acentos. Longitud por puntos de código. Aplicar misma identidad al alta y a filas retornadas; agregar variantes, descartar ajenas. Builder RE2 con (?i), anclas, variantes NFC/NFD y espacios; escape literal separado del builder de marca, cuya salida se conserva. No prometer equivalencia Unicode universal del proveedor; registrar los casos efectivamente probados.

**Consequences:** Validación del patrón completo en alta y colector; algunas listas multibyte pueden agotar bytes antes de 25. Sin truncamiento ni cambio de la política de marca de 007.

### D008 - Estados y mensajes limitados a evidencia

**Date:** 2026-10-30 · **Status:** Accepted

**Decision:** pending/no_data/ok según latestCompleted y lista actual, independientes de la disponibilidad actual de credencial. no_data significa que Search Console no devolvió filas utilizables, no que la búsqueda no exista o que hubo cero impresiones. Series no nulas ilegibles añaden aviso y pending, sin buscar otra captura silenciosamente. Fechas y contexto siempre del mismo éxito.

### D009 - UI por debajo de búsquedas, gestionable sin credencial

**Date:** 2026-10-30 · **Status:** Accepted

**Decision:** Título visible «Búsquedas que sigues» / traducción inglesa en searchConsole. Tabla semántica con filas apiladas en móvil para conservar keyword, cifras, fechas, gráfica y baja sin scroll horizontal. Formulario cliente useActionState con labels serializables; SVG/sección en servidor. Acciones solo revalidan SEO. El resumen de empresa y la captura general conservan su comportamiento previo.

### D010 - Guardas de filas y límite del proveedor

**Date:** 2026-10-30 · **Status:** Accepted

**Decision:** El máximo teórico de 4550 pares canónicos no limita filas originales con variantes. Una respuesta de 25000 filas se considera potencialmente truncada y falla de forma accionable; no paginar ni almacenar una serie presentada como completa. La respuesta puede omitir datos aun bajo ese límite: no_data y huecos describen evidencia devuelta. Errores estructurales, fechas fuera de rango y duplicados originales de una misma fecha/query aceptada fallan según SPEC.

### D011 - Evidencia positiva del filtro como requisito de cierre

**Date:** 2026-10-30 · **Status:** Accepted

**Decision:** Una respuesta 200 sin filas no prueba matching. AC-017 exige una búsqueda conocida con impresiones en una propiedad autorizada, rango y filtro registrados sin secretos. Si no existe disponibilidad o no se puede demostrar el positivo, dejar esa comprobación y el cierre pendientes. Es dependencia de validación real; no bloquea implementar/probar con fixtures ni habilita explorar otras cuentas.

### D012 - Migración aditiva, base aislada y corrección de borrador

**Date:** 2026-10-30 · **Status:** Accepted

**Context:** La auditoría pidió alinear normalización, estados, comparación temporal, validación y comprobación real; hay cambios ajenos de 004 en el árbol.

**Decision:** SPEC se actualiza con AC-016–AC-018 y se generan PLAN/TASKS. Migración 0012 antes de código nuevo; sin backfill ni proveedor nuevo. Registrar revisión/diff de 010 y preservar 004; sin commits ni despliegue automáticos. Fixtures sintéticos solo en la base test protegida. Rollback de código mantiene esquema y snapshots para evitar pérdida de datos. Revisión de consistencia encadenada a spec-plan, sin afirmar pruebas de implementación ejecutadas.

### D013 - Revisión de lo implementado antes de continuar

**Date:** 2026-10-31 · **Status:** Accepted

**Context:** la implementación se retomó con TASKS marcando solo T001, aunque el código de T002–T008 ya existía. Al revisarlo aparecieron defectos que las pruebas no detectaban.

**Decision:** se corrige:
- **Textos invertidos:** el catálogo decía «Baja» para `better` y «Sube» para `worse`, en `es` y en `en`, en contra de la 009 y de AC-007. Se eliminan esas claves y la sección usa `changes.queryUp`, `queryDown` y `querySame`, con `ChangeLine`.
- **Fechas y cifras:** la sección y la gráfica enseñaban días ISO y dos decimales; ahora usan `displayDay` y un decimal.
- **Código muerto:** `trackedKeywords` y `trackedKeywordsWarning` de `SearchConsoleSummary` no los leía nadie.
- **Forma:** imports dinámicos en las acciones, sustituidos por imports normales, y el formato de `tracked-keyword-form.tsx` y del catálogo.

También se aplica la `0012` en `dev`: el código ya lee `keyword_series`, y sin ella la página SEO fallaría (D-22).

**Consequences:** T009 prohibía commits; se hacen commits locales incrementales por la instrucción expresa del responsable, sin subir nada a origin.
