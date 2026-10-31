# Spec Analysis

Fecha: 2026-10-30. Revisión encadenada a `sdd:spec-plan` después de actualizar el borrador con las mejoras aceptadas. Análisis de SPEC, PLAN, TASKS y DECISIONS; no certifica código ni ejecución de pruebas futuras.

## Verdict

**Ready for implementation.** Los contratos, decisiones y verificaciones están definidos y cubiertos. Primera tarea: T001 — dominio puro y registro de base/diff. Status se ha promovido de Draft a Ready por spec-plan después de crear los documentos y comprobar cobertura; spec-analyze no lo modifica.

La disponibilidad de una propiedad con impresiones para AC-017 condiciona el cierre, no el desarrollo con fixtures. No se da la evidencia positiva por obtenida; sin ella T009/cierre quedan pendientes.

## Missing files

Ninguno de los cuatro requeridos. No existe `specs/CONSTITUTION.md` ni `specs/SERVICES.md`, como declara el borrador; el plan sigue las convenciones observadas y no añade servicios de pago ni inventa contratos.

## Coverage gaps

Ninguna documental identificada. Los 18 criterios están cubiertos por nueve tareas, todas pendientes. Los 15 requisitos funcionales se reflejan en dominio, persistencia, colector, proyección y UI/acciones del plan.

| Criterios | Tareas |
|---|---|
| AC-001 | T001, T003, T008 |
| AC-002 | T003, T006, T008 |
| AC-003 | T004, T008 |
| AC-004 | T001, T003, T004, T008 |
| AC-005 | T001, T004 |
| AC-006, AC-007 | T005, T007 |
| AC-008 | T007 |
| AC-009 | T004, T008 |
| AC-010 | T002, T008 |
| AC-011, AC-012 | T006, T007 |
| AC-013 | T006, T007, T009 |
| AC-014 | T009 |
| AC-015 | T007, T009 |
| AC-016 | T001, T002, T004, T005, T008 |
| AC-017 | T009 |
| AC-018 | T003, T004, T005, T008 |

## Contradictions

Ninguna vigente detectada tras la actualización:

- Normalización común y política explícita de filtro/matching reemplazan el supuesto de que Google devuelve siempre minúsculas. Variantes canónicas se agregan, no se sobrescriben.
- latestCompleted determina resultados y fechas; el intento failed reciente solo añade aviso. Null histórico, arrays vacíos, pending y no_data tienen significados distintos.
- Presupuesto de patrón en alta bajo bloqueo y defensa antes de token; no hay listas válidas guardadas por el servicio que se trunquen silenciosamente.
- Las comparaciones muestran sus extremos y contexto; SVG conserva distancias y corta líneas en huecos. 26 tramos móviles no se presentan como semanas de calendario.
- SQL y runtime tienen responsabilidades explícitas: JSONPath strict/true para estructura y cotas; runtime para semántica temporal, unicidad y normalización. Una serie inválida al leer no se convierte en no_data.
- Una única consulta nueva, cuerpos de las nueve previas preservados y fallo atómico. Variantes pueden superar los 4550 pares canónicos como filas originales; alcanzar 25000 produce fallo accionable, sin paginación nueva.
- Formulario de gestión independiente de credencial/estado global; el overview no carga ni muestra keywords y las acciones nuevas solo revalidan SEO.

## Tasks without acceptance criteria

Ninguna. T001–T009 tienen Covers con referencias válidas.

## Acceptance criteria without tasks

Ninguno. Verificación mecánica de 18 de 18 criterios y ausencia de referencias inexistentes.

## Context budget

**Filled.** Reading list concreta por módulos/patrones y Model routing explícito: un solo agente con modelo actual, sin delegación ni cambio de modelo. No se requiere escanear proyectos ajenos.

## Verify clauses

**Adopted, complete.** Nueve tareas con Verify: comandos y casos concretos, o comprobación manual por el implementador contra criterios/DOM/capturas registrados. Las pruebas del proveedor distinguen mocks, acceso con respuesta vacía y evidencia positiva real.

Observability warnings: ninguna documental detectada. La cláusula de T009 puede fallar por falta de evidencia real y deja la tarea pendiente explícitamente; no simula haber pasado.

## Blocking open questions

Ninguna de diseño. Disponibilidad de cuenta/propiedad con impresiones conocida es dependencia de validación AC-017. La variante concreta Unicode/case-folding del proveedor se valida con el subset del filtro y evidencia acotada; no se promete cobertura universal ni devolución de todas las filas.

## Database review needed

**Yes.** Tabla y columna nuevas, unique/FK/checks JSON, transacciones concurrentes y cascada. PLAN cubre migración antes del código, sin backfill, compatibilidad de filas anteriores y rollback conservando datos.

## Security review needed

**Yes.** Entrada del operador, UUID/scoping por empresa, regex escapada y tamaño, errores sin secretos y fixtures solo en base protegida. Se conserva el perímetro actual; no se introduce autenticación fuera de esta feature.

## Performance review needed

**Yes.** Query filtrado de 182 días, cuota de carga, límite de filas, una sola llamada extra y cero retries nuevos; sin bloqueo abierto durante red. Registros de duración/volumen sin afirmar escalabilidad.

## API review needed

**Yes.** Nuevas Server Actions, dimensión date, contrato de CaptureSite/CollectedData y parseo de respuesta externa. Regresión explícita de los nueve cuerpos previos y del conteo once/doce peticiones; no hay proveedor ni scope nuevo.

## Backend review needed

**Yes.** Identidad, ventana, agregación ponderada, validación, persistencia, proyección y fallos atómicos; conservación del último éxito y lista congelada.

## Frontend review needed

**Yes.** Formulario/acciones, tabla responsive, estados, fechas, sparkline con huecos, accesibilidad y locales es/en. SVG/section de servidor y props de formulario serializables.

## Test coverage concerns

Las mejoras aceptadas tienen casos previstos: NFC/NFD/mayúsculas/espacios y longitud Unicode, bytes concurrentes, variantes/duplicados, rango inclusivo y calendarios/DST, pesos sin redondeo, cero impresiones/datos inválidos y truncamiento; último éxito tras fallo, re-alta/baja, serie histórica/ilegible, ±0.5/epsilon, línea rota/punto aislado y tabla móvil. T008 prueba cambios de configuración durante una captura sin bloquear red. T009 exige control positivo real antes de cerrar.

No se han ejecutado unitarias/integración, migraciones, build ni llamadas a Google en este turno: solo comprobaciones documentales. Ningún criterio de implementación se considera superado por este informe.

## Recommended fixes

No hay correcciones documentales bloqueantes pendientes. Al implementar, confirmar que 0012 siga libre y conservar el diff ajeno de 004; no hacer commits automáticos. Si no puede obtenerse evidencia positiva de AC-017, completar las verificaciones independientes y mantener el cierre pendiente sin declarar validado el filtro.

## Recommended next command

`/spec-implement specs/features/010-tracked-keywords/`

Primera tarea: **T001 — registrar base/diff e implementar dominio puro con sus pruebas**.
