# Spec Analysis

> **Nota (2026-10-27, D019):** análisis previo a la implementación, conservado como registro histórico. Desde entonces D011 quedó acreditada (`425e23b`), T001–T007 se implementaron, T008 se reabrió y se añadieron T009–T010 y AC-018. El estado vigente está en TASKS.md y doc 18.

Fecha: 2026-10-27. Segunda revisión `sdd:spec-analyze` tras las correcciones de D013–D018. Se revisan SPEC, PLAN, TASKS y DECISIONS. Sustituye el anterior análisis excesivamente optimista; no certifica implementación ni cambia Status.

## Verdict

**Partial.** Los defectos documentales de la auditoría están resueltos y el plan está preparado. El inicio sigue condicionado por D011: el árbol de 002 continúa sin consolidar y no consta resuelta su condición de cierre. No iniciar T001 ni realizar commits/cierres automáticos para saltar esa precondición.

Una vez acreditada D011, la siguiente tarea es el spike T001. Que la arquitectura compile y sirva correctamente el 404 es precisamente su comprobación: no se afirma que ya haya sucedido. Si falla el layout raíz, no se continúa T002–T008 sin resolver D016.

## Missing files

Ninguno de los cuatro requeridos. No existe `specs/CONSTITUTION.md`; la decisión D012 registra el criterio aplicable. Doc 18 y código i18n son entregables de implementación, no archivos requeridos para aprobar este análisis documental.

## Coverage gaps

Ninguna documental detectada tras la corrección. Los 17 criterios tienen tareas; los 10 requisitos funcionales tienen cobertura en PLAN/TASKS. T001–T008 siguen pendientes.

| Criterios | Tareas que los cubren |
|---|---|
| AC-001 | T003, T004, T005, T006, T007, T008 |
| AC-002, AC-003 | T002; T003 para cambio real de idioma |
| AC-004, AC-005, AC-006 | T003, T008 |
| AC-007 | T002, T008 |
| AC-008 | T005 |
| AC-009 | T005, T006, T008 |
| AC-010 | T004, T007 |
| AC-011 | T002, T004, T006, T008 |
| AC-012 | T004, T005, T006, T007 |
| AC-013 | T001, T008 |
| AC-014, AC-015, AC-016 | T008 |
| AC-017 | T002, T003, T004, T005, T007, T008 |

## Contradictions

Ninguna vigente detectada en la revisión corregida:

- D013 sustituye D003 y fija pesos q, exclusiones, orden de empate y formatos correctos.
- D014 sustituye D005: parámetros y variantes de hallazgos usan contexto de la misma auditoría; sin contexto suficiente se muestra texto original con aviso. El corpus previo independiente comprueba salida española completa, no solo aserciones parciales.
- D015 sustituye D008/D009: funciones de mensajes en servidor y props cliente serializables; plantillas dinámicas con interpolador acotado, sin Server Functions de traducción ni catálogos completos en cliente.
- D016 sustituye D004: el 404 bilingüe solo es válido si también compila el layout raíz que lee cookies.
- D017 alinea excepciones y criterios de inventario: evidencias, fallback, contenido de usuario/proveedor y eventual 404 bilingüe no contradicen AC-001. Las búsquedas orientan la revisión, no prueban idioma ni exigen cero coincidencias.

Los registros sustituidos conservan su texto como historia y no se usan como decisiones vigentes.

## Tasks without acceptance criteria

Ninguna. Las ocho tareas llevan Covers con referencias existentes.

## Acceptance criteria without tasks

Ninguno. Comprobación mecánica: 17 de 17 cubiertos; sin referencias inexistentes.

## Context budget

**Filled.** Reading list por área y Model routing explícito: un solo agente con modelo actual, sin delegación. Ampliaciones de lectura solo para resolver dependencias/fallos concretos.

## Verify clauses

**Adopted, complete.** Las ocho tareas tienen Verify con comandos, casos y resultado observable. Las verificaciones manuales identifican al implementador/propietario, las vistas o artefactos y los criterios inspeccionados.

Observability warnings: ninguna nueva detectada. Las pruebas de regresión y los corpus se capturan antes de extraer textos; no se da por demostrado un resultado futuro.

## Blocking open questions

Sin decisiones de producto pendientes. D011 es una precondición de ejecución aún no satisfecha, no una incógnita que el implementador pueda resolver cerrando 002 o haciendo un commit por su cuenta. T001 es una puerta técnica con criterio de fallo; la revisión humana de AC-015 es requisito de cierre.

## Database review needed

**Yes, limitada al acceso/contexto histórico.** Revisar que facts y rulesVersion correspondan a la misma auditoría/empresa y que no se introduzcan lecturas ni capturas nuevas. Sin migraciones ni cambios de esquema.

## Security review needed

**Yes.** Validación de cookie y action, atributos de cookie, negociación sin reflejar headers, sin redirecciones abiertas y preservación del alcance por empresa.

## Performance review needed

**Yes.** Layout por petición, revalidación y ausencia de catálogos completos en imports transitivos de cliente; comparar tiempos locales antes/después sin presentarlos como prueba de escala.

## API review needed

**Yes, limitada al nuevo server action y contratos de props.** Validación del locale, comportamiento sin JS y serialización; no hay endpoints HTTP nuevos ni cambios de URL.

## Backend review needed

**Yes.** Resolución de idioma, catálogo, adaptador de parámetros/variantes, fallback y fábricas de validación con español por defecto.

## Frontend review needed

**Yes.** Cabecera sticky, skip link/foco/anclas, selector, navegación activa, metadatos, DOM traducido y estados/formularios con props serializables a 1280/375 px.

## Test coverage concerns

Las carencias anteriores tienen verificación prevista: matriz ponderada de idioma, funciones anidadas rechazadas en props, parámetros dinámicos/variantes de hallazgos, contexto ausente o incompatible, corpus completo anterior independiente del catálogo, inventario por área y comprobación de cadenas renderizadas con excepciones. La prueba de completitud usa los ids/variantes reales, no el número fijo 44.

Estas pruebas aún no existen ni se han ejecutado. No se ha implementado el spike ni la nueva interfaz. Este turno solo ejecutó comprobaciones documentales y de integridad del árbol; no ejecutó lint, tests, build ni pruebas de navegador.

## Recommended fixes

No quedan correcciones documentales bloqueantes identificadas. Acreditar D011 antes de implementar; mantener T001 y la revisión humana pendientes hasta disponer de su evidencia. Las ocho tareas conservan casillas sin marcar y Status Ready permanece intacto por autoridad del flujo.

## Recommended next command

Tras acreditar la consolidación de 002 según D011: `/spec-analyze specs/features/003-i18n-sticky-header/` para confirmar la precondición y, si pasa, `/spec-implement specs/features/003-i18n-sticky-header/` comenzando por T001.
